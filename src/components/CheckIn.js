import React, { useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import useSessionOps from '../hooks/useSessionOps';
import StatusBadge from './StatusBadge';
import { prettyTherapy, STATUS } from '../utils/constants';
import { allowedStatuses } from '../utils/permissions';
import { dateKey, startOfDay, timeKey } from '../utils/timeUtils';
import { sessionEnd, sessionStart, statusOf } from '../utils/scheduling';
import { buildPatientMessage, whatsappUrl } from '../utils/share';

// A simple list for the day: tick patients off as attended or missed.
// Reception uses it for check-in, doctors see only their own sessions.
export default function CheckIn() {
  const { role, can } = useAuth();
  const { schedule, doctors, patientName, doctorName, phoneOf } = useData();
  const ops = useSessionOps();
  const [dateStr, setDateStr] = useState(dateKey(new Date()));
  const [searchTerm, setSearchTerm] = useState('');
  const statuses = allowedStatuses(role);
  const isDoctor = role === 'doctor';

  const rows = useMemo(
    () =>
      schedule
        .filter((s) => dateKey(sessionStart(s)) === dateStr && statusOf(s) !== 'cancelled')
        .filter((s) => {
          const q = searchTerm.toLowerCase();
          return !q || patientName(s.patientId).toLowerCase().includes(q) || doctorName(s.doctorId).toLowerCase().includes(q) || s.therapy.includes(q);
        })
        .sort((a, b) => sessionStart(a) - sessionStart(b)),
    [schedule, dateStr, searchTerm, patientName, doctorName]
  );

  const mark = async (s, status) => {
    try {
      await ops.setStatus(s, status);
    } catch (err) {
      alert(`Could not save: ${err.message}`);
    }
  };

  const remind = (s) => {
    const text = buildPatientMessage({ patient: { name: patientName(s.patientId) }, sessions: [s], doctors, day: startOfDay(sessionStart(s)) });
    window.open(whatsappUrl(phoneOf(s.patientId), text), '_blank', 'noopener');
  };

  const done = rows.filter((s) => statusOf(s) !== 'scheduled').length;

  return (
    <div>
      <h3>{isDoctor ? '✅ My sessions' : '✅ Check-in'}</h3>
      <div className="row">
        <input type="date" value={dateStr} onChange={(e) => e.target.value && setDateStr(e.target.value)} />
        <input type="text" placeholder="Search patient, doctor or therapy" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} style={{ width: 260 }} />
        <span className="muted">{done} of {rows.length} done</span>
      </div>

      <div className="table-wrap" style={{ marginTop: 12 }}>
        <table className="data-table">
          <thead>
            <tr><th>Time</th><th>Patient</th><th>Therapy</th>{!isDoctor && <th>Doctor</th>}<th>Status</th><th></th></tr>
          </thead>
          <tbody>
            {rows.map((s) => {
              const st = statusOf(s);
              return (
                <tr key={s.id}>
                  <td>{timeKey(sessionStart(s))}–{timeKey(sessionEnd(s))}</td>
                  <td>{patientName(s.patientId)}</td>
                  <td>{prettyTherapy(s.therapy)}</td>
                  {!isDoctor && <td>{doctorName(s.doctorId)}</td>}
                  <td><StatusBadge session={s} /></td>
                  <td>
                    {statuses.includes(STATUS.ATTENDED) && st !== STATUS.ATTENDED && <button className="small" onClick={() => mark(s, STATUS.ATTENDED)}>✔ Attended</button>}
                    {statuses.includes(STATUS.MISSED) && st !== STATUS.MISSED && <button className="small danger" onClick={() => mark(s, STATUS.MISSED)}>✖ Missed</button>}
                    {statuses.includes(STATUS.SCHEDULED) && st !== STATUS.SCHEDULED && <button className="small secondary" onClick={() => mark(s, STATUS.SCHEDULED)}>Undo</button>}
                    {can('patients.contacts') && <button className="small secondary" title="WhatsApp reminder" onClick={() => remind(s)}>💬</button>}
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && <tr><td colSpan="6" className="muted">No sessions for this day.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
