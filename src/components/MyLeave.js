import React, { useMemo, useState } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { LEAVE_PARTS, prettyTherapy } from '../utils/constants';
import { dateKey, timeKey } from '../utils/timeUtils';
import { sessionStart, sessionsAffected } from '../utils/scheduling';

// A doctor adds their own leave. Sessions that fall inside it are then flagged to the scheduling staff.
export default function MyLeave() {
  const { doctorId } = useAuth();
  const { doctors, schedule, patientName } = useData();
  const me = doctors.find((d) => d.id === doctorId);
  const [date, setDate] = useState(dateKey(new Date()));
  const [part, setPart] = useState('full');
  const today = dateKey(new Date());

  const upcoming = useMemo(
    () => (me?.leave || []).filter((l) => l.date >= today).sort((a, b) => a.date.localeCompare(b.date)),
    [me, today]
  );

  const affected = useMemo(
    () => upcoming.flatMap((l) => sessionsAffected({ doctorId, schedule, fromMs: 0, leave: l })),
    [upcoming, doctorId, schedule]
  );

  if (!me) return <p className="muted">Your doctor record could not be found. Please contact the administrator.</p>;

  const save = async (leave) => {
    try {
      await updateDoc(doc(db, 'doctors', me.id), { leave });
    } catch (err) {
      alert(`Could not save: ${err.message}`);
    }
  };

  const add = () => {
    if (!date) return;
    const existing = me.leave || [];
    if (existing.some((l) => l.date === date && l.part === part)) return alert('That leave is already added.');
    save([...existing, { date, part }]);
  };

  const remove = (entry) => save((me.leave || []).filter((l) => !(l.date === entry.date && l.part === entry.part)));

  return (
    <div>
      <h3>🏖️ My Leave</h3>
      <p className="muted">{me.name} · {prettyTherapy(me.therapy)}</p>

      <div className="card">
        <div className="row">
          <input type="date" value={date} min={today} onChange={(e) => setDate(e.target.value)} />
          <select value={part} onChange={(e) => setPart(e.target.value)}>
            {Object.entries(LEAVE_PARTS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
          </select>
          <button onClick={add}>Add leave</button>
        </div>
        <p className="muted">Morning = before 13:00, afternoon = 13:00 onwards. The scheduler will not book you during leave.</p>
      </div>

      <div className="card">
        <h4>Upcoming leave</h4>
        {upcoming.length === 0 ? <p className="muted">No upcoming leave.</p> : (
          <ul style={{ margin: 0 }}>
            {upcoming.map((l) => (
              <li key={`${l.date}-${l.part}`}>
                {l.date} · {LEAVE_PARTS[l.part] || 'Full day'}{' '}
                <button className="small secondary" onClick={() => remove(l)}>Remove</button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {affected.length > 0 && (
        <div className="notice warn">
          <strong>{affected.length} of your sessions fall inside this leave.</strong> The scheduling staff will see them on their dashboard and move them to another doctor.
          <ul>
            {affected.slice(0, 8).map((s) => (
              <li key={s.id}>{dateKey(sessionStart(s))} {timeKey(sessionStart(s))} · {patientName(s.patientId)} · {prettyTherapy(s.therapy)}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
