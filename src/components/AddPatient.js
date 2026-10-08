import React, { useEffect, useState } from 'react';
import { db } from '../firebase';
import {
  collection,
  getDocs,
  addDoc,
  updateDoc,
  doc,
  deleteDoc
} from 'firebase/firestore';

const AddPatient = () => {
  const [name, setName] = useState('');
  const [therapies, setTherapies] = useState([]);
  const [assignedDoctors, setAssignedDoctors] = useState({});
  const [patients, setPatients] = useState([]);
  const [doctors, setDoctors] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [therapySlots, setTherapySlots] = useState({});
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    const fetchData = async () => {
      const patientSnap = await getDocs(collection(db, 'patients'));
      setPatients(patientSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })));

      const doctorSnap = await getDocs(collection(db, 'doctors'));
      setDoctors(doctorSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    };

    fetchData();
  }, []);

  const handleTherapyChange = (therapy) => {
    if (therapies.includes(therapy)) {
      setTherapies(therapies.filter(t => t !== therapy));
      const { [therapy]: _, ...updatedAssigned } = assignedDoctors;
      const { [therapy]: __, ...updatedSlots } = therapySlots;
      setAssignedDoctors(updatedAssigned);
      setTherapySlots(updatedSlots);
    } else {
      setTherapies([...therapies, therapy]);
    }
  };

  const handleDoctorChange = (therapy, value) => {
    setAssignedDoctors({
      ...assignedDoctors,
      [therapy]: value
    });
  };

  const handleSlotChange = (therapy, value) => {
    setTherapySlots({
      ...therapySlots,
      [therapy]: parseInt(value, 10)
    });
  };

  const handleSubmit = async () => {
    const payload = {
      name,
      therapies,
      assignedDoctors,
      therapySlots
    };

    if (editingId) {
      await updateDoc(doc(db, 'patients', editingId), payload);
    } else {
      await addDoc(collection(db, 'patients'), payload);
    }

    const patientSnap = await getDocs(collection(db, 'patients'));
    setPatients(patientSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })));

    setName('');
    setTherapies([]);
    setAssignedDoctors({});
    setTherapySlots({});
    setEditingId(null);
  };

  const handleEdit = (patient) => {
    setName(patient.name);
    setTherapies(patient.therapies);
    setAssignedDoctors(patient.assignedDoctors || {});
    setTherapySlots(patient.therapySlots || {});
    setEditingId(patient.id);
  };

  const handleDelete = async (id) => {
    await deleteDoc(doc(db, 'patients', id));
    const updatedSnap = await getDocs(collection(db, 'patients'));
    setPatients(updatedSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
  };

  const therapyTypes = ['physio', 'occupational', 'speech', 'vr', 'hand_robotic', 'gait_robotic', 'psychology'];

  const filteredPatients = patients.filter(p =>
    p.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div style={{ padding: 20 }}>
      <h3>{editingId ? 'Edit' : 'Add'} Patient</h3>
      <input
        type="text"
        placeholder="Patient Name"
        value={name}
        onChange={e => setName(e.target.value)}
      />

      <div>
        <h4>Select Therapies</h4>
        {therapyTypes.map(therapy => (
          <div key={therapy}>
            <label>
              <input
                type="checkbox"
                checked={therapies.includes(therapy)}
                onChange={() => handleTherapyChange(therapy)}
              />
              {therapy}
            </label>
            {therapies.includes(therapy) && (
              <>
                <div>
                  <label>
                    Slots per Day:{' '}
                    <input
                      type="number"
                      min="1"
                      max="3"
                      value={therapySlots[therapy] || 1}
                      onChange={(e) => handleSlotChange(therapy, e.target.value)}
                    />
                  </label>
                </div>
                <div>
                  <label>
                    Assigned Doctor:{' '}
                    <select
                      value={assignedDoctors[therapy] || ''}
                      onChange={(e) => handleDoctorChange(therapy, e.target.value)}
                    >
                      <option value="">No Preference</option>
                      {doctors
                        .filter(d => d.therapy === therapy)
                        .map(doc => (
                          <option key={doc.id} value={doc.id}>
                            {doc.name}
                          </option>
                        ))}
                    </select>
                  </label>
                </div>
              </>
            )}
          </div>
        ))}
      </div>

      <button onClick={handleSubmit}>
        {editingId ? 'Update Patient' : 'Add Patient'}
      </button>

      <div style={{ marginTop: '30px' }}>
        <h3>Patient List</h3>
        <input
          type="text"
          placeholder="Search Patient"
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
        />
        <table border="1" cellPadding="5" style={{ marginTop: 10 }}>
         <thead>
  <tr>
    <th>Name</th>
    <th>Therapies</th>
    <th>Slots per Day</th> {/* New */}
    <th>Assigned Doctors</th> {/* New */}
    <th>Actions</th>
  </tr>
</thead>

          <tbody>
  {filteredPatients.map((patient) => (
    <tr key={patient.id}>
      <td>{patient.name}</td>
      <td>{(patient.therapies || []).join(', ')}</td>
      <td>
        {(patient.therapySlots &&
          Object.entries(patient.therapySlots).map(
            ([therapy, count]) => `${therapy}: ${count}`
          ).join(', ')) || '—'}
      </td>
      <td>
        {(patient.assignedDoctors &&
          Object.entries(patient.assignedDoctors).map(
            ([therapy, docId]) => {
              const doctor = doctors.find(d => d.id === docId);
              return `${therapy}: ${doctor?.name || docId}`;
            }
          ).join(', ')) || '—'}
      </td>
      <td>
         <button onClick={() => handleEdit(patient)}>Edit</button>
  <button onClick={() => handleDelete(patient.id)}>Delete</button>
      </td>
    </tr>
  ))}
</tbody>

        </table>
      </div>
    </div>
  );
};

export default AddPatient;
