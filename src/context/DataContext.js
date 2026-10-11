import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { collection, doc, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { normalizeConfig } from '../utils/scheduling';
import { SCHEDULE_HISTORY_DAYS } from '../utils/constants';
import { addDays, startOfDay } from '../utils/timeUtils';

export const DataContext = createContext(null);
export const useData = () => useContext(DataContext);

const LISTS = ['patients', 'doctors', 'equipment'];

// One live (onSnapshot) subscription per collection, shared by every page.
// Pages update by themselves when anyone changes data, no manual refresh needed.
export function DataProvider({ children }) {
  const [lists, setLists] = useState({ patients: [], doctors: [], equipment: [], schedule: [] });
  const [config, setConfig] = useState(() => normalizeConfig(null));
  const [pending, setPending] = useState(() => new Set([...LISTS, 'schedule', 'config']));
  const [error, setError] = useState('');

  useEffect(() => {
    const done = (name) =>
      setPending((prev) => {
        if (!prev.has(name)) return prev;
        const next = new Set(prev);
        next.delete(name);
        return next;
      });
    const fail = (err) => setError(err.message || 'Could not load data');
    const toList = (snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() }));

    const unsubs = LISTS.map((name) =>
      onSnapshot(
        collection(db, name),
        (snap) => {
          setLists((prev) => ({ ...prev, [name]: toList(snap) }));
          done(name);
        },
        fail
      )
    );

    // Only recent history is loaded, so reads stay small as the hospital keeps using the app
    const cutoff = addDays(startOfDay(new Date()), -SCHEDULE_HISTORY_DAYS).toISOString();
    unsubs.push(
      onSnapshot(
        query(collection(db, 'schedule'), where('startTime', '>=', cutoff)),
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
  }, []);

  const value = useMemo(
    () => ({
      ...lists,
      config,
      loading: pending.size > 0,
      error,
      patientName: (id) => lists.patients.find((p) => p.id === id)?.name || 'Unknown patient',
      doctorName: (id) => lists.doctors.find((d) => d.id === id)?.name || 'Unknown doctor',
      equipmentName: (id) => lists.equipment.find((e) => e.id === id)?.name || ''
    }),
    [lists, config, pending, error]
  );

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}
