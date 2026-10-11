import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import useSessionOps from '../hooks/useSessionOps';
import StatusBadge from './StatusBadge';
import { prettyTherapy, STATUS } from '../utils/constants';
import { sessionDuration, sessionEnd, sessionStart, statusOf } from '../utils/scheduling';
import { buildPatientMessage, whatsappUrl } from '../utils/share';
import { startOfDay, timeKey, toLocalInputValue } from '../utils/timeUtils';

// Details + actions for one session (used under the timetable grid)
export default function SessionPanel({ session, onClose }) {
  const { isAdmin } = useAuth();
  const { patients, doctors, equipmentName } = useData();
  const ops = useSessionOps();
  const [doctorId, setDoctorId] = useState(session.doctorId);
  const [when, setWhen] = useState(toLocalInputValue(session.startTime));
  const [busy, setBusy] = useState(false);

  const patient = patients.find((p) => p.id === session.patientId);
  const doctor = doctors.find((d) => d.id === session.doctorId);
  const status = statusOf(session);
  const start = sessionStart(session);

  const run = async (fn) => {
    setBusy(true);
    try {
      await fn();
    } catch (err) {
      alert(`Could not save: ${err.message}`);
    } finally {
      setBusy(false);
    }
  };

  const reminder = () => {
    const text = buildPatientMessage({ patient, sessions: [session], doctors, day: startOfDay(start) });
    window.open(whatsappUrl(patient?.phone, text), '_blank', 'noopener');
  };

  const save = () =>
    run(async () => {
      const changes = { doctorId, startTime: new Date(when).toISOString() };
      await ops.update(session, changes);
    });

  return (
    <div className="card">
      <div className="row spread">
        <h4 style={{ margin: 0 }}>{patient?.name || 'Unknown patient'} · {prettyTherapy(session.therapy)}</h4>
        <button className="secondary small" onClick={onClose}>Close</button>
      </div>
      <p>
        {timeKey(start)} – {timeKey(sessionEnd(session))} ({sessionDuration(session)} min) with <strong>{doctor?.name || 'unknown doctor'}</strong>
        {session.equipmentId && <> · {equipmentName(session.equipmentId)}</>} <StatusBadge session={session} />
      </p>

      <div className="row no-print">
        <button className="secondary small" onClick={reminder}>💬 WhatsApp reminder</button>
        {isAdmin && (
          <>
            {status !== STATUS.ATTENDED && <button className="small" disabled={busy} onClick={() => run(() => ops.setStatus(session, STATUS.ATTENDED))}>✔ Attended</button>}
            {status !== STATUS.MISSED && <button className="small danger" disabled={busy} onClick={() => run(() => ops.setStatus(session, STATUS.MISSED))}>✖ Missed</button>}
            {status !== STATUS.CANCELLED && <button className="small secondary" disabled={busy} onClick={() => run(() => ops.setStatus(session, STATUS.CANCELLED))}>Cancel session</button>}
            {status !== STATUS.SCHEDULED && <button className="small secondary" disabled={busy} onClick={() => run(() => ops.setStatus(session, STATUS.SCHEDULED))}>Back to scheduled</button>}
            {(status === STATUS.MISSED || status === STATUS.CANCELLED) && (
              <button className="small" disabled={busy} onClick={() => run(() => ops.reschedule(session))}>🔁 Reschedule</button>
            )}
          </>
        )}
      </div>

      {isAdmin && (
        <div className="row no-print" style={{ marginTop: 10 }}>
          <span className="muted">Move to:</span>
          <select value={doctorId} onChange={(e) => setDoctorId(e.target.value)}>
            {doctors.filter((d) => d.therapy === session.therapy || d.id === session.doctorId).map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
          <input type="datetime-local" step="900" value={when} onChange={(e) => setWhen(e.target.value)} />
          <button className="small" disabled={busy} onClick={save}>Save move</button>
        </div>
      )}
    </div>
  );
}
