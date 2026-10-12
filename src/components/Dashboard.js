import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { prettyTherapy } from '../utils/constants';
import { dateKey, formatNiceDate, startOfDay, timeKey } from '../utils/timeUtils';
import { capacityMinutes, minutesToLabel } from '../utils/reports';
import {
  isActive,
  leaveCovers,
  reassignAffected,
  sessionDuration,
  sessionEnd,
  sessionStart,
  sessionsOnLeave,
  statusOf
} from '../utils/scheduling';
import { commitOps } from '../utils/firestoreOps';

export default function Dashboard() {
  const { role, doctorId, can } = useAuth();
  const { schedule, doctors, patients, equipment, config, patientName, doctorName } = useData();
  const [now, setNow] = useState(new Date());
  const [moving, setMoving] = useState(false);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(t);
  }, []);

  const isDoctor = role === 'doctor';
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

  // sessions that now sit with a doctor who is on leave / unavailable
  const stuck = useMemo(
    () => (can('sessions.edit') ? sessionsOnLeave({ schedule, doctors, fromMs: now.getTime() }) : []),
    [schedule, doctors, now, can]
  );

  const moveStuck = async () => {
    const { moves, failed } = reassignAffected({ affected: stuck, allSessions: schedule, doctors });
    const text = [
      `${moves.length} of ${stuck.length} session(s) can be moved to another free doctor.`,
      failed.length ? `${failed.length} cannot (no free doctor): ${failed.slice(0, 5).map((s) => patientName(s.patientId)).join(', ')}. Fix those by hand in Edit Sessions.` : ''
    ].filter(Boolean).join('\n');
    if (moves.length === 0) return alert(text);
    if (!window.confirm(`${text}\n\nMove them now?`)) return;
    setMoving(true);
    try {
      await commitOps(moves.map((m) => ({ type: 'update', col: 'schedule', id: m.sessionId, data: { doctorId: m.doctorId } })));
    } catch (err) {
      alert(`Could not move them: ${err.message}`);
    } finally {
      setMoving(false);
    }
  };

  const doctorRows = doctors
    .filter((d) => !isDoctor || d.id === doctorId)
    .map((d) => {
      const mine = active.filter((s) => s.doctorId === d.id);
      const booked = mine.reduce((n, s) => n + sessionDuration(s), 0);
      const cap = capacityMinutes(config, startOfDay(now), d);
      const at = (h) => new Date(now.getFullYear(), now.getMonth(), now.getDate(), h);
      const onLeave = leaveCovers(d, at(9)) || leaveCovers(d, at(15));
      return { d, sessions: mine.length, booked, cap, onLeave };
    })
    .sort((a, b) => a.d.therapy.localeCompare(b.d.therapy) || a.d.name.localeCompare(b.d.name));

  const patientsWithSession = new Set(active.map((s) => s.patientId));
  const notScheduled = patients.filter((p) => (p.therapies || []).length > 0 && !patientsWithSession.has(p.id));
  const showPatients = can('patients.read');

  const equipmentRows = equipment.map((e) => ({
    e,
    sessions: active.filter((s) => s.equipmentId === e.id).length
  }));

  return (
    <div>
      <h3>{isDoctor ? 'My day' : 'Dashboard'}</h3>
      <p className="muted">{formatNiceDate(now)} · updates live</p>

      {stuck.length > 0 && (
        <div className="notice warn">
          <strong>Needs attention:</strong> {stuck.length} upcoming session(s) are with a doctor who is on leave or unavailable.
          <ul>
            {stuck.slice(0, 5).map((s) => (
              <li key={s.id}>
                {dateKey(sessionStart(s))} {timeKey(sessionStart(s))} · {patientName(s.patientId)} · {prettyTherapy(s.therapy)} · {doctorName(s.doctorId)}
              </li>
            ))}
            {stuck.length > 5 && <li>…and {stuck.length - 5} more</li>}
          </ul>
          <button className="small" disabled={moving} onClick={moveStuck}>{moving ? 'Moving…' : 'Move them to free doctors'}</button>
        </div>
      )}

      <div className="grid cols-4">
        <div className="card stat"><div className="num">{active.length}</div><div className="label">{isDoctor ? 'My sessions today' : 'Sessions today'}</div></div>
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
                <thead><tr><th>When</th><th>Patient</th><th>Therapy</th>{!isDoctor && <th>Doctor</th>}</tr></thead>
                <tbody>
                  {upNext.map((s) => (
                    <tr key={s.id}>
                      <td>{dateKey(sessionStart(s)) === todayKey ? 'Today' : sessionStart(s).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })} {timeKey(sessionStart(s))}</td>
                      <td>{patientName(s.patientId)}</td>
                      <td>{prettyTherapy(s.therapy)}</td>
                      {!isDoctor && <td>{doctorName(s.doctorId)}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="card">
          <h4>{isDoctor ? 'My workload today' : 'Doctors today'}</h4>
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
        {showPatients && (
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
        )}

        {equipment.length > 0 && !isDoctor && (
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
