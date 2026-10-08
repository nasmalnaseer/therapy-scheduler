// src/components/EditSchedule.js
import React, { useEffect, useState } from 'react';
import {
  collection,
  getDocs,
  updateDoc,
  doc
} from 'firebase/firestore';
import { db } from '../firebase';
import { format } from 'date-fns';

const EditSchedule = () => {
  const [schedule, setSchedule] = useState([]);
  const [patients, setPatients] = useState([]);
  const [doctors, setDoctors] = useState([]);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({});
  const [searchTerm, setSearchTerm] = useState('');


  useEffect(() => {
    const fetchAll = async () => {
      const schedSnap = await getDocs(collection(db, 'schedule'));
      const patientSnap = await getDocs(collection(db, 'patients'));
      const doctorSnap = await getDocs(collection(db, 'doctors'));

      const scheduleData = schedSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      scheduleData.sort((a, b) => new Date(a.startTime) - new Date(b.startTime));

      setSchedule(scheduleData);
      setPatients(patientSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setDoctors(doctorSnap.docs.map(d => ({ id: d.id, ...d.data() })));
    };

    fetchAll();
  }, []);

  const handleEdit = (entry) => {
    setEditing(entry.id);
    setForm({
      patientId: entry.patientId,
      doctorId: entry.doctorId,
      therapy: entry.therapy,
      startTime: format(new Date(entry.startTime), 'yyyy-MM-dd\'T\'HH:mm')
    });
  };

  const handleSave = async (id) => {
    const ref = doc(db, 'schedule', id);
    await updateDoc(ref, {
      patientId: form.patientId,
      doctorId: form.doctorId,
      therapy: form.therapy,
      startTime: new Date(form.startTime).toISOString()
    });

    setEditing(null);
    const schedSnap = await getDocs(collection(db, 'schedule'));
    const updated = schedSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }))
      .sort((a, b) => new Date(a.startTime) - new Date(b.startTime));
    setSchedule(updated);
  };

  const showName = (id, list) => list.find(i => i.id === id)?.name || id;

  const filteredSchedule = schedule.filter(s => {
  const patientName = showName(s.patientId, patients).toLowerCase();
  const doctorName = showName(s.doctorId, doctors).toLowerCase();
  return (
    patientName.includes(searchTerm.toLowerCase()) ||
    doctorName.includes(searchTerm.toLowerCase())
  );
});


  return (
    <div>
      <h3>Edit Scheduled Sessions</h3>

      <h3>Edit Scheduled Sessions</h3>

<input
  type="text"
  placeholder="Search patient or doctor"
  value={searchTerm}
  onChange={e => setSearchTerm(e.target.value)}
  style={{ padding: '5px', marginBottom: '10px', width: '300px' }}
/>


      <table border="1">
        <thead>
          <tr>
            <th>Patient</th>
            <th>Therapy</th>
            <th>Doctor</th>
            <th>Start Time</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {filteredSchedule.map(s => (
            <tr key={s.id}>
              <td>
                {editing === s.id ? (
                  <select value={form.patientId} onChange={e => setForm({ ...form, patientId: e.target.value })}>
                    {patients.map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                ) : (
                  showName(s.patientId, patients)
                )}
              </td>
              <td>{s.therapy}</td>
              <td>
                {editing === s.id ? (
                  <select value={form.doctorId} onChange={e => setForm({ ...form, doctorId: e.target.value })}>
                    {doctors
                      .filter(d => d.therapy === s.therapy)
                      .map(d => (
                        <option key={d.id} value={d.id}>{d.name}</option>
                      ))}
                  </select>
                ) : (
                  showName(s.doctorId, doctors)
                )}
              </td>
              <td>
                {editing === s.id ? (
                  <input
                    type="datetime-local"
                    value={form.startTime}
                    onChange={e => setForm({ ...form, startTime: e.target.value })}
                  />
                ) : (
                  format(new Date(s.startTime), 'yyyy-MM-dd HH:mm')
                )}
              </td>
              <td>
                {editing === s.id ? (
                  <button onClick={() => handleSave(s.id)}>💾 Save</button>
                ) : (
                  <button onClick={() => handleEdit(s)}>✏️ Edit</button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default EditSchedule;
