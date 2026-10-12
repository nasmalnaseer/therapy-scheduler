import React, { useState } from 'react';
import { addDoc, collection, deleteDoc, doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { prettyTherapy, THERAPIES } from '../utils/constants';
import { isActive } from '../utils/scheduling';

// Machines / kits that only one patient can use at a time (VR kit, robotic gait trainer...).
// If a therapy has at least one unit listed here, every session of that therapy gets a free unit.
export default function Equipment() {
  const { can } = useAuth();
  const canManage = can('equipment.manage'); // scheduling staff can only switch units in / out of service
  const { equipment, schedule } = useData();
  const [name, setName] = useState('');
  const [therapy, setTherapy] = useState('');

  const add = async () => {
    if (!name.trim() || !therapy) return alert('Please enter a name and choose a therapy.');
    try {
      await addDoc(collection(db, 'equipment'), { name: name.trim(), therapy, available: true });
      setName('');
      setTherapy('');
    } catch (err) {
      alert(`Could not add: ${err.message}`);
    }
  };

  const toggle = (e) => updateDoc(doc(db, 'equipment', e.id), { available: e.available === false }).catch((err) => alert(err.message));

  const remove = async (e) => {
    const upcoming = schedule.filter((s) => s.equipmentId === e.id && isActive(s) && new Date(s.startTime) >= new Date()).length;
    const msg = upcoming
      ? `${e.name} is booked in ${upcoming} upcoming session(s). Deleting it leaves those sessions without a unit. Delete anyway?`
      : `Delete ${e.name}?`;
    if (window.confirm(msg)) await deleteDoc(doc(db, 'equipment', e.id)).catch((err) => alert(err.message));
  };

  const sorted = [...equipment].sort((a, b) => a.therapy.localeCompare(b.therapy) || a.name.localeCompare(b.name));

  return (
    <div>
      <h3>Equipment</h3>
      <p className="muted">
        Add each machine or kit that only one patient can use at a time. The scheduler will never book the same unit twice at the same time.
        Therapies with no equipment listed are not limited.
      </p>
      {canManage && <div className="card">
        <div className="row">
          <input type="text" placeholder="Name (e.g. VR kit 1)" value={name} onChange={(e) => setName(e.target.value)} />
          <select value={therapy} onChange={(e) => setTherapy(e.target.value)}>
            <option value="">Used for therapy…</option>
            {THERAPIES.map((t) => <option key={t} value={t}>{prettyTherapy(t)}</option>)}
          </select>
          <button onClick={add}>Add equipment</button>
        </div>
      </div>}

      {sorted.length === 0 ? <p className="muted">No equipment added.</p> : (
        <table className="data-table">
          <thead><tr><th>Name</th><th>Therapy</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {sorted.map((e) => (
              <tr key={e.id}>
                <td>{e.name}</td>
                <td>{prettyTherapy(e.therapy)}</td>
                <td>{e.available === false ? <span className="badge warn">Out of service</span> : <span className="badge ok">In service</span>}</td>
                <td>
                  <button className="small secondary" onClick={() => toggle(e)}>{e.available === false ? 'Mark in service' : 'Mark out of service'}</button>
                  {canManage && <button className="small danger" onClick={() => remove(e)}>Delete</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
