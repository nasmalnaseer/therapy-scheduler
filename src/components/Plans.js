import React, { useMemo, useState } from 'react';
import { useData } from '../context/DataContext';
import { THERAPIES, WEEKDAYS, prettyTherapy } from '../utils/constants';
import { dateKey, parseDateKey, timeKey } from '../utils/timeUtils';
import { buildPlan } from '../utils/plans';
import { sessionStart, statusOf } from '../utils/scheduling';
import { commitOps } from '../utils/firestoreOps';

// A recurring plan = "this patient gets this therapy on these weekdays for N weeks".
// Preview first, then save. Every session of a plan carries the same planId so the plan can be removed later.
export default function Plans() {
  const { patients, doctors, equipment, schedule, config, patientName, doctorName } = useData();
  const [patientId, setPatientId] = useState('');
  const [therapy, setTherapy] = useState('');
  const [weekdays, setWeekdays] = useState([1, 3, 5]);
  const [weeks, setWeeks] = useState(4);
  const [startDate, setStartDate] = useState(dateKey(new Date()));
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);

  const patient = patients.find((p) => p.id === patientId);
  const toggleDay = (d) => {
    setPreview(null);
    setWeekdays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]));
  };

  const doPreview = () => {
    if (!patient || !therapy) return alert('Choose a patient and a therapy.');
    if (weekdays.length === 0) return alert('Choose at least one weekday.');
    const w = Math.min(12, Math.max(1, Number(weeks) || 1));
    setPreview(buildPlan({ patient, therapy, weekdays, weeks: w, startDay: parseDateKey(startDate), doctors, equipment, config, existing: schedule }));
  };

  const save = async () => {
    if (!preview || preview.placed.length === 0) return;
    setBusy(true);
    try {
      await commitOps(preview.placed.map((p) => ({ type: 'add', col: 'schedule', data: p })));
      setPreview(null);
      alert(`Plan saved: ${preview.placed.length} session(s) added.`);
    } catch (err) {
      alert(`Could not save the plan: ${err.message}`);
    } finally {
      setBusy(false);
    }
  };

  // existing plans, rebuilt from the sessions that carry a planId
  const plans = useMemo(() => {
    const groups = {};
    schedule.filter((s) => s.planId).forEach((s) => (groups[s.planId] ||= []).push(s));
    return Object.entries(groups)
      .map(([planId, list]) => {
        const sorted = [...list].sort((a, b) => sessionStart(a) - sessionStart(b));
        const future = sorted.filter((s) => statusOf(s) === 'scheduled' && sessionStart(s) >= new Date());
        return { planId, first: sorted[0], last: sorted[sorted.length - 1], count: sorted.length, future };
      })
      .sort((a, b) => sessionStart(b.first) - sessionStart(a.first));
  }, [schedule]);

  const removeRest = async (plan) => {
    if (!window.confirm(`Remove the ${plan.future.length} remaining scheduled session(s) of this plan? Past sessions are kept.`)) return;
    try {
      await commitOps(plan.future.map((s) => ({ type: 'delete', col: 'schedule', id: s.id })));
    } catch (err) {
      alert(`Could not remove: ${err.message}`);
    }
  };

  return (
    <div style={{ padding: 20 }}>
      <h3>🔁 Recurring Plans</h3>
      <div className="card">
        <div className="row">
          <select value={patientId} onChange={(e) => { setPatientId(e.target.value); setTherapy(''); setPreview(null); }}>
            <option value="">Select Patient</option>
            {[...patients].sort((a, b) => a.name.localeCompare(b.name)).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <select value={therapy} onChange={(e) => { setTherapy(e.target.value); setPreview(null); }} disabled={!patient}>
            <option value="">Select Therapy</option>
            {(patient?.therapies?.length ? patient.therapies : THERAPIES).map((t) => <option key={t} value={t}>{prettyTherapy(t)}</option>)}
          </select>
          <label>Start <input type="date" value={startDate} onChange={(e) => { setStartDate(e.target.value); setPreview(null); }} /></label>
          <label>
            Weeks <input type="number" min="1" max="12" value={weeks} onChange={(e) => { setWeeks(e.target.value); setPreview(null); }} style={{ width: 70 }} />
          </label>
        </div>
        <div className="row" style={{ marginTop: 8 }}>
          <span className="muted">Days:</span>
          {WEEKDAYS.map((d) => (
            <label key={d.value}><input type="checkbox" checked={weekdays.includes(d.value)} onChange={() => toggleDay(d.value)} /> {d.label}</label>
          ))}
        </div>
        <div style={{ marginTop: 8 }}>
          <button onClick={doPreview}>👁️ Preview plan</button>
        </div>
        <p className="muted">One session per chosen day. The patient's assigned doctor (if any) is used, and clashes with existing sessions are avoided.</p>
      </div>

      {preview && (
        <div className="card">
          <h4>Preview: {preview.placed.length} session(s) can be booked{preview.unplaced.length ? `, ${preview.unplaced.length} cannot` : ''}</h4>
          {preview.placed.length > 0 && (
            <div className="table-wrap">
              <table className="data-table">
                <thead><tr><th>Date</th><th>Time</th><th>Doctor</th></tr></thead>
                <tbody>
                  {preview.placed.map((p, i) => (
                    <tr key={i}>
                      <td>{sessionStart(p).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}</td>
                      <td>{timeKey(sessionStart(p))} ({p.duration} min)</td>
                      <td>{doctorName(p.doctorId)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {preview.unplaced.length > 0 && (
            <div className="notice warn">
              Could not place:
              <ul>{preview.unplaced.map((u, i) => <li key={i}>{u.date} ({u.reason})</li>)}</ul>
            </div>
          )}
          <button onClick={save} disabled={busy || preview.placed.length === 0}>{busy ? 'Saving…' : '💾 Save plan'}</button>
        </div>
      )}

      <h4>Existing plans</h4>
      {plans.length === 0 ? <p className="muted">No recurring plans yet.</p> : (
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>Patient</th><th>Therapy</th><th>From</th><th>To</th><th>Sessions</th><th>Still to come</th><th></th></tr></thead>
            <tbody>
              {plans.map((p) => (
                <tr key={p.planId}>
                  <td>{patientName(p.first.patientId)}</td>
                  <td>{prettyTherapy(p.first.therapy)}</td>
                  <td>{dateKey(sessionStart(p.first))}</td>
                  <td>{dateKey(sessionStart(p.last))}</td>
                  <td>{p.count}</td>
                  <td>{p.future.length}</td>
                  <td><button className="small danger" disabled={p.future.length === 0} onClick={() => removeRest(p)}>Remove remaining</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
