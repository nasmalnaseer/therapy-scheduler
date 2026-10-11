import React, { useState } from 'react';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useData } from '../context/DataContext';
import { THERAPIES, WEEKDAYS, prettyTherapy } from '../utils/constants';
import { getDuration, serializeBlocks } from '../utils/scheduling';
import { hhmmToMinutes } from '../utils/timeUtils';

export default function TimeConfig() {
  const { config } = useData();
  const [defaultSlots, setDefaultSlots] = useState(() => config.default.map((b) => [...b]));
  const [tuesdaySlots, setTuesdaySlots] = useState(() => config.tuesday.map((b) => [...b]));
  const [durations, setDurations] = useState(() => ({ ...config.durations }));
  const [closedDays, setClosedDays] = useState(() => [...config.closedDays]);
  const [saving, setSaving] = useState(false);

  const slotsOf = (type) => (type === 'default' ? defaultSlots : tuesdaySlots);
  const setSlotsOf = (type, slots) => (type === 'default' ? setDefaultSlots(slots) : setTuesdaySlots(slots));

  const updateSlot = (type, index, value, part) => {
    const slots = slotsOf(type).map((s) => [...s]);
    slots[index][part] = value;
    setSlotsOf(type, slots);
  };
  const addSlot = (type) => setSlotsOf(type, [...slotsOf(type), ['09:00', '10:00']]);
  const removeSlot = (type, index) => setSlotsOf(type, slotsOf(type).filter((_, i) => i !== index));

  const toggleClosed = (day) =>
    setClosedDays((prev) => (prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]));

  const problems = () => {
    const out = [];
    [['Default day', defaultSlots], ['Tuesday', tuesdaySlots]].forEach(([label, slots]) => {
      const sorted = slots.map((s) => [hhmmToMinutes(s[0] || '00:00'), hhmmToMinutes(s[1] || '00:00')]).sort((a, b) => a[0] - b[0]);
      sorted.forEach(([s, e], i) => {
        if (e <= s) out.push(`${label}: a slot ends before it starts.`);
        if (i > 0 && s < sorted[i - 1][1]) out.push(`${label}: two slots overlap.`);
      });
    });
    return out;
  };

  const saveConfig = async () => {
    const issues = problems();
    if (issues.length) return alert(`Please fix:\n${[...new Set(issues)].join('\n')}`);
    setSaving(true);
    try {
      // Firestore cannot store arrays of arrays, so each slot is saved as { start, end }
      await setDoc(doc(db, 'config', 'timeslots'), {
        default: serializeBlocks(defaultSlots),
        tuesday: serializeBlocks(tuesdaySlots),
        durations,
        closedDays
      });
      alert('Config saved! Use the Scheduler to generate a new schedule with these settings.');
    } catch (err) {
      alert(`Could not save: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const slotEditor = (type) =>
    slotsOf(type).map((slot, i) => (
      <div key={i}>
        <input type="time" value={slot[0]} onChange={(e) => updateSlot(type, i, e.target.value, 0)} />
        {' – '}
        <input type="time" value={slot[1]} onChange={(e) => updateSlot(type, i, e.target.value, 1)} />
        <button className="small danger" onClick={() => removeSlot(type, i)}>🗑️</button>
      </div>
    ));

  return (
    <div>
      <h3>Configure Time Slots</h3>
      <p className="muted">
        Sessions are only booked inside these time ranges. Each therapy uses its own session length from the list below.
        Changes apply the next time you generate a schedule.
      </p>

      <div className="card">
        <h4>Default Day Slots</h4>
        {slotEditor('default')}
        <button className="secondary" onClick={() => addSlot('default')}>➕ Add Slot</button>
      </div>

      <div className="card">
        <h4>Tuesday Slots</h4>
        {slotEditor('tuesday')}
        <button className="secondary" onClick={() => addSlot('tuesday')}>➕ Add Tuesday Slot</button>
      </div>

      <div className="card">
        <h4>Closed days</h4>
        <p className="muted">No sessions are generated on ticked days.</p>
        <div className="row">
          {WEEKDAYS.map((d) => (
            <label key={d.value}>
              <input type="checkbox" checked={closedDays.includes(d.value)} onChange={() => toggleClosed(d.value)} /> {d.label}
            </label>
          ))}
        </div>
      </div>

      <div className="card">
        <h4>Therapy Durations (in minutes)</h4>
        {THERAPIES.map((t) => (
          <div key={t} style={{ margin: '4px 0' }}>
            <span style={{ display: 'inline-block', width: 130 }}>{prettyTherapy(t)}:</span>
            <input
              type="number"
              min="5"
              step="5"
              value={durations[t] ?? ''}
              onChange={(e) => setDurations({ ...durations, [t]: e.target.value === '' ? '' : Number(e.target.value) })}
            />{' '}
            minutes
            {!(Number(durations[t]) > 0) && <span className="muted"> (will use {getDuration({}, t)} min)</span>}
          </div>
        ))}
      </div>

      <button onClick={saveConfig} disabled={saving}>{saving ? 'Saving…' : '💾 Save Config'}</button>
    </div>
  );
}
