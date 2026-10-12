import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import useSessionOps from '../hooks/useSessionOps';
import StatusBadge from './StatusBadge';
import { prettyTherapy, STATUS } from '../utils/constants';
import { allowedStatuses } from '../utils/permissions';
import { sessionDuration, sessionEnd, sessionStart, statusOf } from '../utils/scheduling';
import { buildPatientMessage, whatsappUrl } from '../utils/share';
import { startOfDay, timeKey, toLocalInputValue } from '../utils/timeUtils';

// Details + actions for one session. What shows up depends on the person's role.
export default function SessionPanel({ session, onClose }) {
  const { role, can } = useAuth();
  const { doctors, patientName, phoneOf, equipmentName } = useData();
  const ops = useSessionOps();
  const [doctorId, setDoctorId] = useState(session.doctorId);
  const [when, setWhen] = useState(toLocalInputValue(session.startTime));
  const [busy, setBusy] = useState(false);

  const canEdit = can('sessions.edit');
  const statuses = allowedStatuses(role);
  const doctor = doctors.find((d) => d.id === session.doctorId);
  const status = statusOf(session);
  const start = sessionStart(session);
  const name = patientName(session.patientId);
  const showDoctorName = role !== 'doctor';

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
    const text = buildPatientMessage({ patient: { name }, sessions: [session], doctors, day: startOfDay(start) });
    window.open(whatsappUrl(phoneOf(session.patientId), text), '_blank', 'noopener');
  };

  const save = () =>
    run(async () => {
      await ops.update(session, { doctorId, startTime: new Date(when).toISOString() });
    });

  // a cancelled session can only be brought back by someone who may edit the schedule
  const canUndo = status !== STATUS.SCHEDULED && statuses.includes(STATUS.SCHEDULED) && (status !== STATUS.CANCELLED || canEdit);

  return (
    <div className="card">
      <div className="row spread">
        <h4 style={{ margin: 0 }}>{name} · {prettyTherapy(session.therapy)}</h4>
        <button className="secondary small" onClick={onClose}>Close</button>
      </div>
      <p>
        {timeKey(start)} – {timeKey(sessionEnd(session))} ({sessionDuration(session)} min)
        {showDoctorName && <> with <strong>{doctor?.name || 'unknown doctor'}</strong></>}
        {session.equipmentId && <> · {equipmentName(session.equipmentId)}</>} <StatusBadge session={session} />
      </p>

      <div className="row no-print">
        {can('patients.contacts') && <button className="secondary small" onClick={reminder}>💬 WhatsApp reminder</button>}
        {statuses.includes(STATUS.ATTENDED) && status !== STATUS.ATTENDED && status !== STATUS.CANCELLED && (
          <button className="small" disabled={busy} onClick={() => run(() => ops.setStatus(session, STATUS.ATTENDED))}>✔ Attended</button>
        )}
        {statuses.includes(STATUS.MISSED) && status !== STATUS.MISSED && status !== STATUS.CANCELLED && (
          <button className="small danger" disabled={busy} onClick={() => run(() => ops.setStatus(session, STATUS.MISSED))}>✖ Missed</button>
        )}
        {statuses.includes(STATUS.CANCELLED) && status !== STATUS.CANCELLED && (
          <button className="small secondary" disabled={busy} onClick={() => run(() => ops.setStatus(session, STATUS.CANCELLED))}>Cancel session</button>
        )}
        {canUndo && (
          <button className="small secondary" disabled={busy} onClick={() => run(() => ops.setStatus(session, STATUS.SCHEDULED))}>Back to scheduled</button>
        )}
        {canEdit && (status === STATUS.MISSED || status === STATUS.CANCELLED) && (
          <button className="small" disabled={busy} onClick={() => run(() => ops.reschedule(session))}>🔁 Reschedule</button>
        )}
      </div>

      {canEdit && (
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
