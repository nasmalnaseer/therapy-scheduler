import React, { useMemo, useState } from 'react';
import { useData } from '../context/DataContext';
import { prettyTherapy, THERAPIES } from '../utils/constants';
import { addDays, dateKey, startOfDay } from '../utils/timeUtils';
import { sessionStart } from '../utils/scheduling';
import { attendanceByTherapy, attendanceStats, doctorUtilization, minutesToLabel, weeklyTherapyCounts } from '../utils/reports';

const pct = (x) => (x === null ? 'n/a' : `${Math.round(x * 100)}%`);

export default function Reports() {
  const { schedule, doctors, config } = useData();
  const today = startOfDay(new Date());
  const [from, setFrom] = useState(dateKey(addDays(today, -29)));
  const [to, setTo] = useState(dateKey(today));

  const inRange = useMemo(
    () => schedule.filter((s) => {
      const k = dateKey(sessionStart(s));
      return k >= from && k <= to;
    }),
    [schedule, from, to]
  );

  const stats = attendanceStats(inRange);
  const byTherapy = attendanceByTherapy(inRange);
  const weekly = weeklyTherapyCounts(inRange);
  const util = doctorUtilization({ sessions: inRange, doctors, config, fromKey: from, toKey: to });
  const therapiesInData = THERAPIES.filter((t) => weekly.some((w) => w.counts[t]));

  return (
    <div>
      <h3>Reports</h3>
      <div className="row">
        <label>From <input type="date" value={from} onChange={(e) => e.target.value && setFrom(e.target.value)} /></label>
        <label>To <input type="date" value={to} onChange={(e) => e.target.value && setTo(e.target.value)} /></label>
        <span className="muted">Only the last 4 months of sessions are loaded.</span>
      </div>

      <div className="grid cols-4" style={{ marginTop: 12 }}>
        <div className="card stat"><div className="num">{stats.total - stats.cancelled}</div><div className="label">Sessions (not cancelled)</div></div>
        <div className="card stat"><div className="num">{stats.attended}</div><div className="label">Attended</div></div>
        <div className="card stat"><div className="num">{stats.missed}</div><div className="label">Missed</div></div>
        <div className="card stat"><div className="num">{pct(stats.missedRate)}</div><div className="label">Missed rate</div></div>
        <div className="card stat"><div className="num">{stats.cancelled}</div><div className="label">Cancelled</div></div>
      </div>
      <p className="muted">Missed rate = missed ÷ (attended + missed). Sessions still in the future are not counted in it.</p>

      <div className="card">
        <h4>Doctor utilization</h4>
        <p className="muted">Booked time compared with the hours set in Time Config (minus leave), counted only on days that had sessions.</p>
        {util.length === 0 ? <p className="muted">No doctors.</p> : (
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>Doctor</th><th>Therapy</th><th>Sessions</th><th>Booked</th><th>Available</th><th>Used</th></tr></thead>
              <tbody>
                {util.map((u) => (
                  <tr key={u.doctor.id}>
                    <td>{u.doctor.name}</td>
                    <td>{prettyTherapy(u.doctor.therapy)}</td>
                    <td>{u.sessions}</td>
                    <td>{minutesToLabel(u.bookedMin)}</td>
                    <td>{minutesToLabel(u.capacityMin)}</td>
                    <td style={{ minWidth: 140 }}>
                      {u.pct}%
                      <div className="bar"><div className={`bar-fill${u.pct > 90 ? ' hot' : ''}`} style={{ width: `${u.pct}%` }} /></div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card">
        <h4>Attendance by therapy</h4>
        {byTherapy.length === 0 ? <p className="muted">No sessions in this range.</p> : (
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>Therapy</th><th>Attended</th><th>Missed</th><th>Cancelled</th><th>Upcoming</th><th>Missed rate</th></tr></thead>
              <tbody>
                {byTherapy.map((r) => (
                  <tr key={r.therapy}>
                    <td>{prettyTherapy(r.therapy)}</td><td>{r.attended}</td><td>{r.missed}</td><td>{r.cancelled}</td><td>{r.scheduled}</td><td>{pct(r.missedRate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card">
        <h4>Sessions per therapy per week</h4>
        {weekly.length === 0 ? <p className="muted">No sessions in this range.</p> : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr><th>Week starting (Mon)</th>{therapiesInData.map((t) => <th key={t}>{prettyTherapy(t)}</th>)}<th>Total</th></tr>
              </thead>
              <tbody>
                {weekly.map((w) => (
                  <tr key={w.weekStart}>
                    <td>{w.weekStart}</td>
                    {therapiesInData.map((t) => <td key={t}>{w.counts[t] || 0}</td>)}
                    <td><strong>{w.total}</strong></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
