import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import {
  doc,
  getDoc,
  setDoc
} from 'firebase/firestore';

export default function TimeConfig() {
  const [defaultSlots, setDefaultSlots] = useState([]);
  const [tuesdaySlots, setTuesdaySlots] = useState([]);
  const [durations, setDurations] = useState({});

  const therapies = [
    'physio',
    'occupational',
    'speech',
    'vr',
    'hand_robotic',
    'gait_robotic',
    'psychology'
  ];

  useEffect(() => {
    fetchConfig();
  }, []);

  const fetchConfig = async () => {
    const configRef = doc(db, 'config', 'timeslots');
    const snap = await getDoc(configRef);
    if (snap.exists()) {
      const data = snap.data();
      setDefaultSlots(data.default || []);
      setTuesdaySlots(data.tuesday || []);
      setDurations(data.durations || {});
    } else {
      // Default fallback
      setDefaultSlots([
        ['09:00', '11:00'],
        ['11:15', '13:15'],
        ['14:15', '17:00']
      ]);
      setTuesdaySlots([
        ['09:00', '11:00'],
        ['11:15', '13:15']
      ]);
      setDurations({
        physio: 60,
        occupational: 60,
        speech: 30,
        vr: 60,
        hand_robotic: 60,
        gait_robotic: 60,
        psychology: 60
      });
    }
  };

  const saveConfig = async () => {
    const configRef = doc(db, 'config', 'timeslots');
    await setDoc(configRef, {
      default: defaultSlots,
      tuesday: tuesdaySlots,
      durations
    });
    alert("Config Saved!");
  };

  const updateSlot = (type, index, value, part) => {
    const slots = [...(type === 'default' ? defaultSlots : tuesdaySlots)];
    slots[index][part] = value;
    type === 'default' ? setDefaultSlots(slots) : setTuesdaySlots(slots);
  };

  const addSlot = (type) => {
    const slots = [...(type === 'default' ? defaultSlots : tuesdaySlots)];
    slots.push(['09:00', '10:00']);
    type === 'default' ? setDefaultSlots(slots) : setTuesdaySlots(slots);
  };

  const removeSlot = (type, index) => {
    const slots = [...(type === 'default' ? defaultSlots : tuesdaySlots)];
    slots.splice(index, 1);
    type === 'default' ? setDefaultSlots(slots) : setTuesdaySlots(slots);
  };

  return (
    <div>
      <h3>Configure Time Slots</h3>

      <h4>Default Day Slots</h4>
      {defaultSlots.map((slot, i) => (
        <div key={i}>
          <input
            type="time"
            value={slot[0]}
            onChange={(e) => updateSlot('default', i, e.target.value, 0)}
          />
          –
          <input
            type="time"
            value={slot[1]}
            onChange={(e) => updateSlot('default', i, e.target.value, 1)}
          />
          <button onClick={() => removeSlot('default', i)}>🗑️</button>
        </div>
      ))}
      <button onClick={() => addSlot('default')}>➕ Add Slot</button>

      <h4>Tuesday Slots</h4>
      {tuesdaySlots.map((slot, i) => (
        <div key={i}>
          <input
            type="time"
            value={slot[0]}
            onChange={(e) => updateSlot('tuesday', i, e.target.value, 0)}
          />
          –
          <input
            type="time"
            value={slot[1]}
            onChange={(e) => updateSlot('tuesday', i, e.target.value, 1)}
          />
          <button onClick={() => removeSlot('tuesday', i)}>🗑️</button>
        </div>
      ))}
      <button onClick={() => addSlot('tuesday')}>➕ Add Tuesday Slot</button>

      <h4>Therapy Durations (in minutes)</h4>
      {therapies.map((t) => (
        <div key={t}>
          {t}:
          <input
            type="number"
            value={durations[t] || ''}
            onChange={(e) => setDurations({ ...durations, [t]: +e.target.value })}
          /> minutes
        </div>
      ))}

      <button onClick={saveConfig}>💾 Save Config</button>
    </div>
  );
}
