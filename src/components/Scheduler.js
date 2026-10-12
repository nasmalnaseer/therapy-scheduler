import React, { useMemo, useState } from 'react';
import { addDoc, collection } from 'firebase/firestore';
import { db } from '../firebase';
import { useData } from '../context/DataContext';
import StatusBadge from './StatusBadge';
import { prettyTherapy, THERAPIES } from '../utils/constants';
import { addDays, dateKey, parseDateKey, timeKey } from '../utils/timeUtils';
import {
  buildSchedule,
  findConflicts,
  formatConflicts,
  getDuration,
  isActive,
  pickEquipment,
  sessionDuration,
  sessionEnd,
  sessionStart,
  statusOf
} from '../utils/scheduling';
import { commitOps } from '../utils/firestoreOps';

const Scheduler = () => {
  const { patients, doctors, equipment, schedule, config, patientName: nameOfPatient, doctorName, equipmentName } = useData();
  const [selectedDate, setSelectedDate] = useState(dateKey(new Date()));
  const [weekMode, setWeekMode] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null); // { created, unplaced }
  const [manualSlot, setManualSlot] = useState({ patientId: '', therapy: '', doctorId: '', startTime: '' });

  const days = useMemo(
    () => Array.from({ length: weekMode ? 7 : 1 }, (_, i) => addDays(parseDateKey(selectedDate), i)),
    [selectedDate, weekMode]
  );
  const dayKeys = useMemo(() => new Set(days.map(dateKey)), [days]);

  const generateSchedule = async () => {
    if (patients.length === 0 || doctors.length === 0) return alert('Add doctors and patients first.');

    // Only sessions that are still "scheduled" on these days are rebuilt.
    // Attended, missed and cancelled sessions are history and stay untouched.
    const toReplace = schedule.filter((s) => dayKeys.has(dateKey(sessionStart(s))) && statusOf(s) === 'scheduled');
    const replaceIds = new Set(toReplace.map((s) => s.id));
    const kept = schedule.filter((s) => !replaceIds.has(s.id));

    if (
      toReplace.length > 0 &&
      !window.confirm(
        `This will replace ${toReplace.length} scheduled session(s) on ${weekMode ? 'these 7 days' : 'this day'} with a new schedule.\n` +
          'Attended, missed and cancelled sessions are kept.\n\nContinue?'
      )
    ) {
      return;
    }

    setBusy(true);
    try {
      const { placed, unplaced } = buildSchedule({ days, patients, doctors, equipment, config, existing: kept });
      await commitOps([
        ...toReplace.map((s) => ({ type: 'delete', col: 'schedule', id: s.id })),
        ...placed.map((p) => ({ type: 'add', col: 'schedule', data: p }))
      ]);
      setResult({ created: placed.length, replaced: toReplace.length, unplaced });
    } catch (err) {
      alert(`Could not generate the schedule: ${err.message}`);
    } finally {
      setBusy(false);
    }
  };

  const addManualSlot = async () => {
    const { patientId, therapy, doctorId, startTime } = manualSlot;
    if (!patientId || !therapy || !doctorId || !startTime) return alert('Please fill all fields.');
    const start = new Date(startTime).toISOString();
    const duration = getDuration(config.durations, therapy);
    const eq = pickEquipment({ equipment, therapy, startTime: start, duration, sessions: schedule });
    const patientName = patients.find((p) => p.id === patientId)?.name || '';
    const candidate = { patientId, patientName, therapy, doctorId, startTime: start, duration, equipmentId: eq.id };
    const conflicts = findConflicts({ candidate, sessions: schedule, doctors, patients, equipment, config });
    if (eq.needed && !eq.id) conflicts.push({ type: 'equipment', message: 'No free equipment unit at that time' });
    if (conflicts.length && !window.confirm(`${formatConflicts(conflicts)}\n\nAdd anyway?`)) return;
    try {
      await addDoc(collection(db, 'schedule'), { ...candidate, equipmentId: eq.id ?? null, status: 'scheduled' });
      setManualSlot({ patientId: '', therapy: '', doctorId: '', startTime: '' });
    } catch (err) {
      alert(`Could not add the slot: ${err.message}`);
    }
  };

  const shown = useMemo(
    () =>
      schedule
        .filter((s) => dayKeys.has(dateKey(sessionStart(s))))
        .filter((s) => {
          const q = searchTerm.toLowerCase();
          return !q || nameOfPatient(s.patientId).toLowerCase().includes(q) || doctorName(s.doctorId).toLowerCase().includes(q) || s.therapy.includes(q);
        })
        .sort((a, b) => a.therapy.localeCompare(b.therapy) || sessionStart(a) - sessionStart(b)),
    [schedule, dayKeys, searchTerm, nameOfPatient, doctorName]
  );

  return (
    <div style={{ padding: 20 }}>
      <h3>🗓️ Therapy Scheduler</h3>

      <div className="card">
        <div className="row">
          <label>
            Start date: <input type="date" value={selectedDate} onChange={(e) => e.target.value && setSelectedDate(e.target.value)} />
          </label>
          <label>
            <input type="checkbox" checked={weekMode} onChange={() => setWeekMode(!weekMode)} /> Generate for 7 days
          </label>
          <button onClick={generateSchedule} disabled={busy}>{busy ? 'Working…' : '⚙️ Generate Schedule'}</button>
        </div>
        <p className="muted">
          Session length for each therapy comes from Time Config ({THERAPIES.map((t) => `${prettyTherapy(t)} ${getDuration(config.durations, t)}m`).join(', ')}).
        </p>
      </div>

      {result && (
        <div className={`notice ${result.unplaced.length ? 'warn' : 'ok'}`}>
          Created {result.created} session(s){result.replaced ? `, replacing ${result.replaced}` : ''}.
          {result.unplaced.length > 0 && (
            <>
              {' '}<strong>{result.unplaced.length} could not be scheduled:</strong>
              <ul>
                {result.unplaced.slice(0, 20).map((u, i) => (
                  <li key={i}>{u.date} – {u.patientName} – {prettyTherapy(u.therapy)} ({u.reason})</li>
                ))}
                {result.unplaced.length > 20 && <li>…and {result.unplaced.length - 20} more</li>}
              </ul>
            </>
          )}
        </div>
      )}

      <div className="card">
        <h4>Manually Add Slot</h4>
        <div className="row">
          <select value={manualSlot.patientId} onChange={(e) => setManualSlot({ ...manualSlot, patientId: e.target.value })}>
            <option value="">Select Patient</option>
            {[...patients].sort((a, b) => a.name.localeCompare(b.name)).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <select value={manualSlot.therapy} onChange={(e) => setManualSlot({ ...manualSlot, therapy: e.target.value, doctorId: '' })}>
            <option value="">Select Therapy</option>
            {THERAPIES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <select value={manualSlot.doctorId} onChange={(e) => setManualSlot({ ...manualSlot, doctorId: e.target.value })}>
            <option value="">Select Doctor</option>
            {doctors.filter((d) => d.therapy === manualSlot.therapy).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
          <input type="datetime-local" step="900" value={manualSlot.startTime} onChange={(e) => setManualSlot({ ...manualSlot, startTime: e.target.value })} />
          <button onClick={addManualSlot}>➕ Add Slot</button>
        </div>
        <p className="muted">The app checks for clashes (doctor, patient, equipment, leave, hours) before saving and asks you to confirm if it finds any.</p>
      </div>

      <div className="row" style={{ margin: '10px 0' }}>
        <input type="text" placeholder="Search patient, doctor or therapy" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} style={{ width: 280 }} />
        <span className="muted">{shown.length} session(s) in the selected {weekMode ? '7 days' : 'day'}</span>
      </div>

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Department</th>
              <th>Patient</th>
              <th>Doctor</th>
              <th>Start</th>
              <th>End</th>
              <th>Equipment</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((s) => (
              <tr key={s.id} style={isActive(s) ? undefined : { opacity: 0.55 }}>
                <td>{s.therapy}</td>
                <td>{nameOfPatient(s.patientId)}</td>
                <td>{doctorName(s.doctorId)}</td>
                <td>{dateKey(sessionStart(s))} {timeKey(sessionStart(s))}</td>
                <td>{timeKey(sessionEnd(s))}{s.duration ? '' : ' (?)'} <span className="muted">{sessionDuration(s)}m</span></td>
                <td>{equipmentName(s.equipmentId) || '-'}</td>
                <td><StatusBadge session={s} /></td>
              </tr>
            ))}
            {shown.length === 0 && <tr><td colSpan="7" className="muted">No sessions for these dates yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default Scheduler;
