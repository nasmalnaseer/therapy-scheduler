import React, { useMemo, useState } from 'react';
import { useData } from '../context/DataContext';
import useSessionOps from '../hooks/useSessionOps';
import StatusBadge from './StatusBadge';
import { prettyTherapy, STATUS, STATUS_LABELS } from '../utils/constants';
import { dateKey, startOfDay, timeKey, toLocalInputValue } from '../utils/timeUtils';
import { sessionDuration, sessionEnd, sessionStart, statusOf } from '../utils/scheduling';
import { buildPatientMessage, whatsappUrl } from '../utils/share';

const EditSchedule = () => {
  const { schedule, doctors, patients, patientName, doctorName } = useData();
  const ops = useSessionOps();
  const [dateStr, setDateStr] = useState(dateKey(new Date()));
  const [allDates, setAllDates] = useState(false);
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({});

  const rows = useMemo(
    () =>
      schedule
        .filter((s) => allDates || dateKey(sessionStart(s)) === dateStr)
        .filter((s) => statusFilter === 'all' || statusOf(s) === statusFilter)
        .filter((s) => {
          const q = searchTerm.toLowerCase();
          return !q || patientName(s.patientId).toLowerCase().includes(q) || doctorName(s.doctorId).toLowerCase().includes(q) || s.therapy.includes(q);
        })
        .sort((a, b) => sessionStart(a) - sessionStart(b)),
    [schedule, dateStr, allDates, statusFilter, searchTerm, patientName, doctorName]
  );

  const guarded = async (fn) => {
    try {
      return await fn();
    } catch (err) {
      alert(`Could not save: ${err.message}`);
      return false;
    }
  };

  const startEdit = (s) => {
    setEditingId(s.id);
    setForm({ patientId: s.patientId, doctorId: s.doctorId, startTime: toLocalInputValue(s.startTime) });
  };

  const save = async (s) => {
    const ok = await guarded(() => ops.update(s, { patientId: form.patientId, doctorId: form.doctorId, startTime: new Date(form.startTime).toISOString() }));
    if (ok) setEditingId(null);
  };

  const remind = (s) => {
    const patient = patients.find((p) => p.id === s.patientId);
    const text = buildPatientMessage({ patient, sessions: [s], doctors, day: startOfDay(sessionStart(s)) });
    window.open(whatsappUrl(patient?.phone, text), '_blank', 'noopener');
  };

  return (
    <div style={{ padding: 20 }}>
      <h3>✏️ Edit Sessions</h3>
      <div className="row">
        <input type="date" value={dateStr} disabled={allDates} onChange={(e) => e.target.value && setDateStr(e.target.value)} />
        <label><input type="checkbox" checked={allDates} onChange={() => setAllDates(!allDates)} /> All loaded dates</label>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="all">All statuses</option>
          {Object.entries(STATUS_LABELS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
        </select>
        <input type="text" placeholder="Search patient, doctor or therapy" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} style={{ width: 260 }} />
      </div>
      <p className="muted">{rows.length} session(s). Moving a session checks for clashes first. Mark sessions Attended or Missed here or in the Timetable.</p>

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Therapy</th>
              <th>Patient</th>
              <th>Doctor</th>
              <th>Time</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => {
              const editing = editingId === s.id;
              const st = statusOf(s);
              return (
                <tr key={s.id}>
                  <td>{prettyTherapy(s.therapy)}</td>
                  <td>
                    {editing ? (
                      <select value={form.patientId} onChange={(e) => setForm({ ...form, patientId: e.target.value })}>
                        {patients.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                    ) : patientName(s.patientId)}
                  </td>
                  <td>
                    {editing ? (
                      <select value={form.doctorId} onChange={(e) => setForm({ ...form, doctorId: e.target.value })}>
                        {doctors.filter((d) => d.therapy === s.therapy || d.id === s.doctorId).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                      </select>
                    ) : doctorName(s.doctorId)}
                  </td>
                  <td>
                    {editing ? (
                      <input type="datetime-local" step="900" value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} />
                    ) : (
                      <>{dateKey(sessionStart(s))} {timeKey(sessionStart(s))}–{timeKey(sessionEnd(s))} <span className="muted">({sessionDuration(s)}m)</span></>
                    )}
                  </td>
                  <td><StatusBadge session={s} /></td>
                  <td>
                    {editing ? (
                      <>
                        <button className="small" onClick={() => save(s)}>Save</button>
                        <button className="small secondary" onClick={() => setEditingId(null)}>Cancel</button>
                      </>
                    ) : (
                      <>
                        <button className="small" onClick={() => startEdit(s)}>Edit</button>
                        {st !== STATUS.ATTENDED && <button className="small" onClick={() => guarded(() => ops.setStatus(s, STATUS.ATTENDED))}>✔</button>}
                        {st !== STATUS.MISSED && <button className="small danger" onClick={() => guarded(() => ops.setStatus(s, STATUS.MISSED))}>✖</button>}
                        {st !== STATUS.CANCELLED && <button className="small secondary" onClick={() => guarded(() => ops.setStatus(s, STATUS.CANCELLED))}>Cancel</button>}
                        {st !== STATUS.SCHEDULED && <button className="small secondary" onClick={() => guarded(() => ops.setStatus(s, STATUS.SCHEDULED))}>Undo</button>}
                        {(st === STATUS.MISSED || st === STATUS.CANCELLED) && <button className="small" onClick={() => guarded(() => ops.reschedule(s))}>🔁</button>}
                        <button className="small secondary" title="WhatsApp reminder" onClick={() => remind(s)}>💬</button>
                        <button className="small danger" title="Delete" onClick={() => guarded(() => ops.remove(s))}>🗑️</button>
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && <tr><td colSpan="6" className="muted">No sessions match.</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="muted">✔ attended · ✖ missed · 🔁 book the next free slot (missed/cancelled only) · 💬 WhatsApp reminder · 🗑️ delete for good</p>
    </div>
  );
};

export default EditSchedule;
