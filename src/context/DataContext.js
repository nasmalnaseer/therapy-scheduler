import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { collection, doc, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from './AuthContext';
import { normalizeConfig } from '../utils/scheduling';
import { SCHEDULE_HISTORY_DAYS } from '../utils/constants';
import { addDays, startOfDay } from '../utils/timeUtils';

export const DataContext = createContext(null);
export const useData = () => useContext(DataContext);

// What each role is allowed to read (firestore.rules enforces the same thing on the server).
// A doctor only receives their own sessions, and no patient list at all.
const neededFor = (can) => [
  'doctors',
  'equipment',
  'schedule',
  'config',
  ...(can('patients.read') ? ['patients'] : []),
  ...(can('patients.contacts') ? ['patientContacts'] : [])
];

// One live (onSnapshot) subscription per collection, shared by every page.
export function DataProvider({ children }) {
  const { role, doctorId, can } = useAuth();
  const [lists, setLists] = useState({ patients: [], patientContacts: [], doctors: [], equipment: [], schedule: [] });
  const [config, setConfig] = useState(() => normalizeConfig(null));
  const [pending, setPending] = useState(() => new Set(neededFor(can)));
  const [error, setError] = useState('');

  useEffect(() => {
    const needed = neededFor(can);
    setPending(new Set(needed));
    const done = (name) =>
      setPending((prev) => {
        if (!prev.has(name)) return prev;
        const next = new Set(prev);
        next.delete(name);
        return next;
      });
    const fail = (err) => setError(err.message || 'Could not load data');
    const toList = (snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const unsubs = [];

    ['patients', 'patientContacts', 'doctors', 'equipment'].forEach((name) => {
      if (!needed.includes(name)) return;
      unsubs.push(
        onSnapshot(
          collection(db, name),
          (snap) => {
            setLists((prev) => ({ ...prev, [name]: toList(snap) }));
            done(name);
          },
          fail
        )
      );
    });

    // Only recent history is loaded, so reads stay small as the hospital keeps using the app
    const cutoff = addDays(startOfDay(new Date()), -SCHEDULE_HISTORY_DAYS).toISOString();
    const base = collection(db, 'schedule');
    const sessionsQuery =
      role === 'doctor'
        ? query(base, where('doctorId', '==', doctorId), where('startTime', '>=', cutoff))
        : query(base, where('startTime', '>=', cutoff));
    unsubs.push(
      onSnapshot(
        sessionsQuery,
        (snap) => {
          setLists((prev) => ({ ...prev, schedule: toList(snap) }));
          done('schedule');
        },
        fail
      )
    );

    unsubs.push(
      onSnapshot(
        doc(db, 'config', 'timeslots'),
        (snap) => {
          setConfig(normalizeConfig(snap.exists() ? snap.data() : null));
          done('config');
        },
        fail
      )
    );
    return () => unsubs.forEach((u) => u());
  }, [role, doctorId]);

  const value = useMemo(() => {
    const seesPhones = can('patients.contacts');
    const phones = Object.fromEntries(lists.patientContacts.map((c) => [c.id, c.phone || '']));
    // Phone numbers live in their own collection; an old "phone" field on the patient is still honoured
    const patients = lists.patients.map((p) => ({ ...p, phone: seesPhones ? phones[p.id] ?? p.phone ?? '' : '' }));

    // Doctors cannot read patients, so names also come from the copy stored on each session
    const names = {};
    lists.schedule.forEach((s) => {
      if (s.patientName) names[s.patientId] = s.patientName;
    });
    patients.forEach((p) => {
      names[p.id] = p.name;
    });

    return {
      patients,
      doctors: lists.doctors,
      equipment: lists.equipment,
      schedule: lists.schedule,
      config,
      loading: pending.size > 0,
      error,
      patientName: (id) => names[id] || 'Unknown patient',
      doctorName: (id) => lists.doctors.find((d) => d.id === id)?.name || 'Unknown doctor',
      equipmentName: (id) => lists.equipment.find((e) => e.id === id)?.name || '',
      phoneOf: (id) => (seesPhones ? phones[id] ?? lists.patients.find((p) => p.id === id)?.phone ?? '' : '')
    };
  }, [lists, config, pending, error, role]);

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}
