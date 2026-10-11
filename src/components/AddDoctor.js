import React, { useState } from 'react';
import { addDoc, collection, deleteDoc, doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useData } from '../context/DataContext';
import { LEAVE_PARTS, THERAPIES } from '../utils/constants';
import { reassignAffected, sessionsAffected } from '../utils/scheduling';
import { commitOps } from '../utils/firestoreOps';
import { dateKey } from '../utils/timeUtils';

export default function AddDoctor() {
  const { doctors, schedule, patientName } = useData();
  const [name, setName] = useState('');
  const [therapy, setTherapy] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [openLeaveFor, setOpenLeaveFor] = useState(null);
  const [leaveDate, setLeaveDate] = useState(dateKey(new Date()));
  const [leavePart, setLeavePart] = useState('full');

  const handleAddDoctor = async () => {
    if (!name.trim() || !therapy) return alert('Please fill both name and therapy.');
    try {
      await addDoc(collection(db, 'doctors'), { name: name.trim(), therapy, available: true, leave: [] });
      setName('');
      setTherapy('');
    } catch (err) {
      alert(`Could not add: ${err.message}`);
    }
  };

  // Offers to move the affected sessions to another free doctor of the same therapy
  const offerReassign = async (doctor, affected, whyText) => {
    if (affected.length === 0) return;
    // the doctor must already be treated as away when looking for replacements
    const doctorsNow = doctors.filter((d) => d.id !== doctor.id);
    const { moves, failed } = reassignAffected({ affected, allSessions: schedule, doctors: doctorsNow });
    const lines = [
      `${affected.length} upcoming session(s) of ${doctor.name} are affected ${whyText}.`,
      moves.length ? `${moves.length} can be moved to another free ${doctor.therapy} doctor.` : 'None can be moved automatically.',
      failed.length ? `${failed.length} cannot be moved (no free doctor): ${failed.slice(0, 5).map((s) => patientName(s.patientId)).join(', ')}${failed.length > 5 ? '…' : ''}. Fix those by hand in Edit Sessions.` : ''
    ].filter(Boolean);
    if (moves.length === 0) return alert(lines.join('\n'));
    if (!window.confirm(`${lines.join('\n')}\n\nMove them now?`)) return;
    await commitOps(moves.map((m) => ({ type: 'update', col: 'schedule', id: m.sessionId, data: { doctorId: m.doctorId } })));
  };

  const toggleAvailability = async (doctor) => {
    const makingUnavailable = doctor.available !== false;
    try {
      await updateDoc(doc(db, 'doctors', doctor.id), { available: !makingUnavailable });
      if (makingUnavailable) {
        const affected = sessionsAffected({ doctorId: doctor.id, schedule, fromMs: Date.now() });
        await offerReassign(doctor, affected, 'because the doctor is now unavailable');
      }
    } catch (err) {
      alert(`Could not update: ${err.message}`);
    }
  };

  const handleDelete = async (doctor) => {
    const upcoming = sessionsAffected({ doctorId: doctor.id, schedule, fromMs: Date.now() }).length;
    const msg = upcoming
      ? `${doctor.name} still has ${upcoming} upcoming session(s). Mark the doctor unavailable first to move them. Delete anyway?`
      : `Delete ${doctor.name}?`;
    if (!window.confirm(msg)) return;
    try {
      await deleteDoc(doc(db, 'doctors', doctor.id));
    } catch (err) {
      alert(`Could not delete: ${err.message}`);
    }
  };

  const addLeave = async (doctor) => {
    if (!leaveDate) return;
    const existing = doctor.leave || [];
    if (existing.some((l) => l.date === leaveDate && l.part === leavePart)) return alert('That leave is already added.');
    const entry = { date: leaveDate, part: leavePart };
    try {
      await updateDoc(doc(db, 'doctors', doctor.id), { leave: [...existing, entry] });
      const affected = sessionsAffected({ doctorId: doctor.id, schedule, fromMs: 0, leave: entry });
      await offerReassign({ ...doctor, leave: [...existing, entry] }, affected, `by the leave on ${leaveDate}`);
    } catch (err) {
      alert(`Could not add leave: ${err.message}`);
    }
  };

  const removeLeave = async (doctor, entry) => {
    try {
      await updateDoc(doc(db, 'doctors', doctor.id), {
        leave: (doctor.leave || []).filter((l) => !(l.date === entry.date && l.part === entry.part))
      });
    } catch (err) {
      alert(`Could not remove leave: ${err.message}`);
    }
  };

  const today = dateKey(new Date());
  const filteredDoctors = doctors
    .filter((d) => d.name.toLowerCase().includes(searchTerm.toLowerCase()) || d.therapy.toLowerCase().includes(searchTerm.toLowerCase()))
    .sort((a, b) => a.therapy.localeCompare(b.therapy) || a.name.localeCompare(b.name));

  return (
    <div>
      <h3>Add Doctor</h3>
      <div className="row">
        <input type="text" placeholder="Doctor Name" value={name} onChange={(e) => setName(e.target.value)} />
        <select value={therapy} onChange={(e) => setTherapy(e.target.value)}>
          <option value="">Select Therapy</option>
          {THERAPIES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <button onClick={handleAddDoctor}>Add Doctor</button>
      </div>

      <div style={{ marginTop: 20 }}>
        <input
          type="text"
          placeholder="Search doctor by name or therapy"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{ width: 300, marginBottom: 10 }}
        />
      </div>

      <h4>Doctor List</h4>
      {filteredDoctors.map((d) => {
        const upcomingLeave = (d.leave || []).filter((l) => l.date >= today).sort((a, b) => a.date.localeCompare(b.date));
        return (
          <div key={d.id} className="card">
            <div className="row spread">
              <div>
                <strong>{d.name}</strong> ({d.therapy}) –{' '}
                <span className={`badge ${d.available === false ? 'warn' : 'ok'}`}>{d.available === false ? 'Unavailable' : 'Available'}</span>
              </div>
              <div>
                <button className="small secondary" onClick={() => toggleAvailability(d)}>
                  {d.available === false ? 'Mark Available' : 'Mark Unavailable'}
                </button>
                <button className="small secondary" onClick={() => setOpenLeaveFor(openLeaveFor === d.id ? null : d.id)}>
                  🏖️ Leave ({upcomingLeave.length})
                </button>
                <button className="small danger" onClick={() => handleDelete(d)}>❌ Delete</button>
              </div>
            </div>

            {openLeaveFor === d.id && (
              <div style={{ marginTop: 10 }}>
                <div className="row">
                  <input type="date" value={leaveDate} onChange={(e) => setLeaveDate(e.target.value)} />
                  <select value={leavePart} onChange={(e) => setLeavePart(e.target.value)}>
                    {Object.entries(LEAVE_PARTS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
                  </select>
                  <button className="small" onClick={() => addLeave(d)}>Add leave</button>
                </div>
                {upcomingLeave.length === 0 ? (
                  <p className="muted">No upcoming leave.</p>
                ) : (
                  <ul style={{ marginBottom: 0 }}>
                    {upcomingLeave.map((l) => (
                      <li key={`${l.date}-${l.part}`}>
                        {l.date} · {LEAVE_PARTS[l.part] || 'Full day'}{' '}
                        <button className="small secondary" onClick={() => removeLeave(d, l)}>Remove</button>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="muted">Morning = before 13:00, afternoon = 13:00 onwards. The scheduler will not book the doctor during leave.</p>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
