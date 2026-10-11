import React, { useEffect, useMemo, useState } from 'react';
import { useData } from '../context/DataContext';
import StatusBadge from './StatusBadge';
import { prettyTherapy } from '../utils/constants';
import { dateKey, formatNiceDate, startOfDay, timeKey } from '../utils/timeUtils';
import { capacityMinutes, minutesToLabel } from '../utils/reports';
import { isActive, leaveCovers, sessionDuration, sessionEnd, sessionStart, statusOf } from '../utils/scheduling';

export default function Dashboard() {
  const { schedule, doctors, patients, equipment, config, patientName, doctorName } = useData();
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(t);
  }, []);

  const todayKey = dateKey(now);

  const today = useMemo(
    () =>
      schedule
        .filter((s) => dateKey(sessionStart(s)) === todayKey)
        .sort((a, b) => sessionStart(a) - sessionStart(b)),
    [schedule, todayKey]
  );
  const active = today.filter(isActive);
  const count = (st) => today.filter((s) => statusOf(s) === st).length;

  const upNext = useMemo(
    () =>
      schedule
        .filter((s) => statusOf(s) === 'scheduled' && sessionEnd(s) >= now)
        .sort((a, b) => sessionStart(a) - sessionStart(b))
        .slice(0, 6),
    [schedule, now]
  );

  const doctorRows = doctors
    .map((d) => {
      const mine = active.filter((s) => s.doctorId === d.id);
      const booked = mine.reduce((n, s) => n + sessionDuration(s), 0);
      const cap = capacityMinutes(config, startOfDay(now), d);
      const onLeave = leaveCovers(d, new Date(now.getFullYear(), now.getMonth(), now.getDate(), 9)) ||
        leaveCovers(d, new Date(now.getFullYear(), now.getMonth(), now.getDate(), 15));
      return { d, sessions: mine.length, booked, cap, onLeave };
    })
    .sort((a, b) => a.d.therapy.localeCompare(b.d.therapy) || a.d.name.localeCompare(b.d.name));

  const patientsWithSession = new Set(active.map((s) => s.patientId));
  const notScheduled = patients.filter((p) => (p.therapies || []).length > 0 && !patientsWithSession.has(p.id));

  const equipmentRows = equipment.map((e) => ({
    e,
    sessions: active.filter((s) => s.equipmentId === e.id).length
  }));

  return (
    <div>
      <h3>Dashboard</h3>
      <p className="muted">{formatNiceDate(now)} · updates live</p>

      <div className="grid cols-4">
        <div className="card stat"><div className="num">{active.length}</div><div className="label">Sessions today</div></div>
        <div className="card stat"><div className="num">{count('attended')}</div><div className="label">Attended</div></div>
        <div className="card stat"><div className="num">{count('missed')}</div><div className="label">Missed</div></div>
        <div className="card stat"><div className="num">{count('scheduled')}</div><div className="label">Still to do</div></div>
        <div className="card stat"><div className="num">{count('cancelled')}</div><div className="label">Cancelled</div></div>
      </div>

      <div className="grid cols-2">
        <div className="card">
          <h4>Up next</h4>
          {upNext.length === 0 ? (
            <p className="muted">No upcoming sessions.</p>
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead><tr><th>When</th><th>Patient</th><th>Therapy</th><th>Doctor</th></tr></thead>
                <tbody>
                  {upNext.map((s) => (
                    <tr key={s.id}>
                      <td>{dateKey(sessionStart(s)) === todayKey ? 'Today' : sessionStart(s).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })} {timeKey(sessionStart(s))}</td>
                      <td>{patientName(s.patientId)}</td>
                      <td>{prettyTherapy(s.therapy)}</td>
                      <td>{doctorName(s.doctorId)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="card">
          <h4>Doctors today</h4>
          {doctorRows.length === 0 ? (
            <p className="muted">No doctors added yet.</p>
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead><tr><th>Doctor</th><th>Sessions</th><th>Booked / available</th><th></th></tr></thead>
                <tbody>
                  {doctorRows.map(({ d, sessions, booked, cap, onLeave }) => (
                    <tr key={d.id}>
                      <td>{d.name}<div className="muted">{prettyTherapy(d.therapy)}</div></td>
                      <td>{sessions}</td>
                      <td>
                        {minutesToLabel(booked)} / {minutesToLabel(cap)}
                        <div className="bar"><div className={`bar-fill${cap && booked / cap > 0.9 ? ' hot' : ''}`} style={{ width: `${cap ? Math.min(100, (booked / cap) * 100) : 0}%` }} /></div>
                      </td>
                      <td>
                        {d.available === false && <span className="badge warn">Unavailable</span>}
                        {onLeave && <span className="badge warn">On leave</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <div className="grid cols-2">
        <div className="card">
          <h4>Patients with no session today ({notScheduled.length})</h4>
          {notScheduled.length === 0 ? (
            <p className="muted">Everyone has a session today.</p>
          ) : (
            <p>
              {notScheduled.slice(0, 15).map((p) => p.name).join(', ')}
              {notScheduled.length > 15 && ` … and ${notScheduled.length - 15} more`}
            </p>
          )}
        </div>

        {equipment.length > 0 && (
          <div className="card">
            <h4>Equipment today</h4>
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {equipmentRows.map(({ e, sessions }) => (
                <li key={e.id}>
                  {e.name} ({prettyTherapy(e.therapy)}): {sessions} session{sessions === 1 ? '' : 's'}
                  {e.available === false && <> <span className="badge warn">Out of service</span></>}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
