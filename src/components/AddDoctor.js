import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import {
  collection,
  addDoc,
  getDocs,
  deleteDoc,
  updateDoc,
  doc
} from 'firebase/firestore';

const therapies = [
  'physio',
  'occupational',
  'speech',
  'vr',
  'hand_robotic',
  'gait_robotic',
  'psychology'
];

export default function AddDoctor() {
  const [name, setName] = useState('');
  const [therapy, setTherapy] = useState('');
  const [doctors, setDoctors] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    fetchDoctors();
  }, []);

  const fetchDoctors = async () => {
    const snap = await getDocs(collection(db, 'doctors'));
    setDoctors(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  };

  const handleAddDoctor = async () => {
    if (!name || !therapy) return alert("Please fill both name and therapy.");

    await addDoc(collection(db, 'doctors'), {
      name,
      therapy,
      available: true
    });

    setName('');
    setTherapy('');
    fetchDoctors();
  };

  const toggleAvailability = async (doctor) => {
    const ref = doc(db, 'doctors', doctor.id);
    await updateDoc(ref, { available: !doctor.available });

    if (!doctor.available) {
      await autoReschedule(doctor.id, doctor.therapy);
    }

    fetchDoctors();
  };

  const handleDelete = async (id) => {
    await deleteDoc(doc(db, 'doctors', id));
    fetchDoctors();
  };

  const autoReschedule = async (doctorId, therapy) => {
    const scheduleSnap = await getDocs(collection(db, 'schedule'));
    const doctorSnap = await getDocs(collection(db, 'doctors'));

    const doctors = doctorSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const schedule = scheduleSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    const conflictSessions = schedule.filter(s => s.doctorId === doctorId);

    for (let session of conflictSessions) {
      const altDoctor = doctors.find(d => d.therapy === therapy && d.id !== doctorId && d.available);
      if (altDoctor) {
        await updateDoc(doc(db, 'schedule', session.id), {
          doctorId: altDoctor.id
        });
      }
    }
  };

  const filteredDoctors = doctors.filter(
    d =>
      d.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      d.therapy.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div>
      <h3>Add Doctor</h3>
      <input
        type="text"
        placeholder="Doctor Name"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <select value={therapy} onChange={(e) => setTherapy(e.target.value)}>
        <option value="">Select Therapy</option>
        {therapies.map((t) => (
          <option key={t} value={t}>{t}</option>
        ))}
      </select>
      <button onClick={handleAddDoctor}>Add Doctor</button>

      <div style={{ marginTop: '20px' }}>
        <input
          type="text"
          placeholder="Search doctor by name or therapy"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{ width: '300px', marginBottom: '10px' }}
        />
      </div>

      <h4>Doctor List</h4>
      <ul>
        {filteredDoctors.map(doc => (
          <li key={doc.id}>
            {doc.name} ({doc.therapy}) - <strong>{doc.available ? "Available" : "Unavailable"}</strong>
            <button onClick={() => toggleAvailability(doc)} style={{ marginLeft: '10px' }}>
              {doc.available ? "Mark Unavailable" : "Mark Available"}
            </button>
            <button onClick={() => handleDelete(doc.id)} style={{ marginLeft: '10px' }}>❌ Delete</button>
          </li>
        ))}
      </ul>
    </div>
  );
}
