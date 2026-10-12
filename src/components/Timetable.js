import React, { useMemo, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import useSessionOps from '../hooks/useSessionOps';
import SessionPanel from './SessionPanel';
import { prettyTherapy, THERAPIES } from '../utils/constants';
import { atTime, dateKey, hhmmToMinutes, minutesOfDay, parseDateKey, timeKey } from '../utils/timeUtils';
import { getBlocks, isActive, leaveCovers, overlaps, sessionDuration, sessionEnd, sessionStart, statusOf } from '../utils/scheduling';
import './Timetable.css';

const PX_PER_MIN = 1.3;
const SNAP = 15;

export default function Timetable() {
  const { role, doctorId, can } = useAuth();
  const canEdit = can('sessions.edit');
  const isDoctor = role === 'doctor';
  const { schedule, doctors, config, patientName } = useData();
  const ops = useSessionOps();
  const [dateStr, setDateStr] = useState(dateKey(new Date()));
  const [therapy, setTherapy] = useState('all');
  const [selectedId, setSelectedId] = useState(null);
  const drag = useRef(null);

  const day = parseDateKey(dateStr);
  const blocks = getBlocks(config, day).map(([s, e]) => [hhmmToMinutes(s), hhmmToMinutes(e)]);

  const daySessions = useMemo(
    () => schedule.filter((s) => isActive(s) && dateKey(sessionStart(s)) === dateStr),
    [schedule, dateStr]
  );

  // grid covers the configured hours plus any session that sits outside them
  const mins = [...blocks.flat(), ...daySessions.flatMap((s) => [minutesOfDay(sessionStart(s)), minutesOfDay(sessionEnd(s))])];
  const gridStart = mins.length ? Math.floor(Math.min(...mins) / 60) * 60 : 9 * 60;
  const gridEnd = mins.length ? Math.ceil(Math.max(...mins) / 60) * 60 : 17 * 60;
  const height = (gridEnd - gridStart) * PX_PER_MIN;

  const columns = doctors
    .filter((d) => !isDoctor || d.id === doctorId)
    .filter((d) => therapy === 'all' || d.therapy === therapy)
    .sort((a, b) => a.therapy.localeCompare(b.therapy) || a.name.localeCompare(b.name));
  const knownIds = new Set(doctors.map((d) => d.id));
  const orphan = isDoctor ? [] : daySessions.filter((s) => !knownIds.has(s.doctorId));

  const clashing = useMemo(() => {
    const ids = new Set();
    const byDoctor = {};
    daySessions.forEach((s) => (byDoctor[s.doctorId] ||= []).push(s));
    Object.values(byDoctor).forEach((list) =>
      list.forEach((a) =>
        list.forEach((b) => {
          if (a.id !== b.id && overlaps(sessionStart(a), sessionEnd(a), sessionStart(b), sessionEnd(b))) ids.add(a.id);
        })
      )
    );
    return ids;
  }, [daySessions]);

  const selected = schedule.find((s) => s.id === selectedId) || null;

  const onDrop = async (e, doctorId) => {
    e.preventDefault();
    if (!canEdit || !drag.current) return;
    const session = schedule.find((s) => s.id === drag.current.id);
    const grab = drag.current.grabMin;
    drag.current = null;
    if (!session) return;
    const rect = e.currentTarget.getBoundingClientRect();
    let minutes = gridStart + (e.clientY - rect.top) / PX_PER_MIN - grab;
    minutes = Math.round(minutes / SNAP) * SNAP;
    const start = atTime(day, '00:00');
    start.setMinutes(minutes);
    try {
      await ops.update(session, { doctorId, startTime: start.toISOString() });
    } catch (err) {
      alert(`Could not move the session: ${err.message}`);
    }
  };

  const renderSession = (s) => {
    const top = (minutesOfDay(sessionStart(s)) - gridStart) * PX_PER_MIN;
    const h = sessionDuration(s) * PX_PER_MIN;
    const cls = ['tt-session', statusOf(s), canEdit ? 'draggable' : '', clashing.has(s.id) ? 'clash' : '', selectedId === s.id ? 'selected' : '']
      .filter(Boolean)
      .join(' ');
    return (
      <div
        key={s.id}
        className={cls}
        style={{ top, height: Math.max(h - 2, 18) }}
        draggable={canEdit}
        title={`${patientName(s.patientId)} · ${prettyTherapy(s.therapy)} · ${timeKey(sessionStart(s))}-${timeKey(sessionEnd(s))}`}
        onClick={() => setSelectedId(s.id)}
        onDragStart={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          drag.current = { id: s.id, grabMin: (e.clientY - r.top) / PX_PER_MIN };
          e.dataTransfer.setData('text/plain', s.id);
          e.dataTransfer.effectAllowed = 'move';
        }}
      >
        <b>{patientName(s.patientId)}</b>
        {prettyTherapy(s.therapy)} · {timeKey(sessionStart(s))}
      </div>
    );
  };

  const hours = [];
  for (let m = gridStart; m <= gridEnd; m += 60) hours.push(m);

  const columnBody = (doctor, list) => (
    <div
      key={doctor?.id || 'orphan'}
      className="tt-col"
      style={{ height }}
      onDragOver={canEdit ? (e) => e.preventDefault() : undefined}
      onDrop={canEdit && doctor ? (e) => onDrop(e, doctor.id) : undefined}
    >
      {blocks.map(([s, e], i) => (
        <div key={i} className="tt-block" style={{ top: (s - gridStart) * PX_PER_MIN, height: (e - s) * PX_PER_MIN }} />
      ))}
      <div
        className="tt-lines"
        style={{ backgroundImage: 'linear-gradient(to bottom, rgba(0,0,0,0.12) 1px, transparent 1px)', backgroundSize: `100% ${60 * PX_PER_MIN}px` }}
      />
      {list.map(renderSession)}
    </div>
  );

  return (
    <div>
      <h3>Timetable</h3>
      <div className="row">
        <input type="date" value={dateStr} onChange={(e) => e.target.value && setDateStr(e.target.value)} />
        <button className="secondary small" onClick={() => setDateStr(dateKey(new Date()))}>Today</button>
        {!isDoctor && (
          <select value={therapy} onChange={(e) => setTherapy(e.target.value)}>
            <option value="all">All therapies</option>
            {THERAPIES.map((t) => <option key={t} value={t}>{prettyTherapy(t)}</option>)}
          </select>
        )}
        <span className="muted">{daySessions.length} session(s){canEdit ? ' · drag a session to move it (on a computer), or click it for more options' : ' · click a session for details'}</span>
      </div>
      <div className="tt-legend">
        <span className="badge scheduled">Scheduled</span>
        <span className="badge attended">Attended</span>
        <span className="badge missed">Missed</span>
        <span className="badge" style={{ background: '#ffb300', color: '#000' }}>Amber outline = overlap</span>
      </div>

      {columns.length === 0 && orphan.length === 0 ? (
        <p className="muted">No doctors to show. Add doctors first.</p>
      ) : (
        <div className="tt-scroll">
          <div className="tt-head">
            <div className="spacer" />
            {columns.map((d) => (
              <div key={d.id} className="col-title">
                {d.name}
                <small>
                  {prettyTherapy(d.therapy)}
                  {d.available === false && ' · unavailable'}
                  {d.available !== false && (leaveCovers(d, atTime(day, '09:00')) || leaveCovers(d, atTime(day, '15:00'))) && ' · on leave'}
                </small>
              </div>
            ))}
            {orphan.length > 0 && <div className="col-title">Other / removed doctor</div>}
          </div>
          <div className="tt">
            <div className="tt-axis" style={{ height }}>
              {hours.map((m) => (
                <span key={m} style={{ top: (m - gridStart) * PX_PER_MIN }}>{String(m / 60).padStart(2, '0')}:00</span>
              ))}
            </div>
            {columns.map((d) => columnBody(d, daySessions.filter((s) => s.doctorId === d.id)))}
            {orphan.length > 0 && columnBody(null, orphan)}
          </div>
        </div>
      )}

      {selected && <div style={{ marginTop: 16 }}><SessionPanel key={selected.id + selected.startTime + selected.doctorId + statusOf(selected)} session={selected} onClose={() => setSelectedId(null)} /></div>}
    </div>
  );
}
