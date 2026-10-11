import React, { useState } from 'react';
import { addDoc, collection, deleteDoc, doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useData } from '../context/DataContext';
import { THERAPIES } from '../utils/constants';

const AddPatient = () => {
  const { patients, doctors } = useData();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [therapies, setTherapies] = useState([]);
  const [assignedDoctors, setAssignedDoctors] = useState({});
  const [editingId, setEditingId] = useState(null);
  const [therapySlots, setTherapySlots] = useState({});
  const [searchTerm, setSearchTerm] = useState('');

  const handleTherapyChange = (therapy) => {
    if (therapies.includes(therapy)) {
      setTherapies(therapies.filter((t) => t !== therapy));
      const { [therapy]: _, ...updatedAssigned } = assignedDoctors;
      const { [therapy]: __, ...updatedSlots } = therapySlots;
      setAssignedDoctors(updatedAssigned);
      setTherapySlots(updatedSlots);
    } else {
      setTherapies([...therapies, therapy]);
    }
  };

  const handleDoctorChange = (therapy, value) => {
    setAssignedDoctors({ ...assignedDoctors, [therapy]: value });
  };

  const handleSlotChange = (therapy, value) => {
    const n = Math.min(3, Math.max(1, parseInt(value, 10) || 1));
    setTherapySlots({ ...therapySlots, [therapy]: n });
  };

  const resetForm = () => {
    setName('');
    setPhone('');
    setTherapies([]);
    setAssignedDoctors({});
    setTherapySlots({});
    setEditingId(null);
  };

  const handleSubmit = async () => {
    if (!name.trim()) return alert('Please enter the patient name.');
    // only keep doctor choices that are real (empty = "No Preference")
    const cleanDoctors = Object.fromEntries(Object.entries(assignedDoctors).filter(([, v]) => v));
    const payload = { name: name.trim(), phone: phone.trim(), therapies, assignedDoctors: cleanDoctors, therapySlots };
    try {
      if (editingId) await updateDoc(doc(db, 'patients', editingId), payload);
      else await addDoc(collection(db, 'patients'), payload);
      resetForm();
    } catch (err) {
      alert(`Could not save: ${err.message}`);
    }
  };

  const handleEdit = (patient) => {
    setName(patient.name);
    setPhone(patient.phone || '');
    setTherapies(patient.therapies || []);
    setAssignedDoctors(patient.assignedDoctors || {});
    setTherapySlots(patient.therapySlots || {});
    setEditingId(patient.id);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDelete = async (patient) => {
    if (!window.confirm(`Delete ${patient.name}? Their existing sessions stay in the schedule history.`)) return;
    try {
      await deleteDoc(doc(db, 'patients', patient.id));
      if (editingId === patient.id) resetForm();
    } catch (err) {
      alert(`Could not delete: ${err.message}`);
    }
  };

  const filteredPatients = patients
    .filter((p) => p.name.toLowerCase().includes(searchTerm.toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div>
      <h3>{editingId ? 'Edit' : 'Add'} Patient</h3>
      <div className="card">
        <div className="row">
          <input type="text" placeholder="Patient Name" value={name} onChange={(e) => setName(e.target.value)} />
          <input
            type="tel"
            placeholder="Phone (for WhatsApp, optional)"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </div>

        <div>
          <h4>Select Therapies</h4>
          {THERAPIES.map((therapy) => (
            <div key={therapy} style={{ marginBottom: 6 }}>
              <label>
                <input type="checkbox" checked={therapies.includes(therapy)} onChange={() => handleTherapyChange(therapy)} />
                {' '}{therapy}
              </label>
              {therapies.includes(therapy) && (
                <div style={{ marginLeft: 22 }}>
                  <label>
                    Slots per Day:{' '}
                    <input
                      type="number"
                      min="1"
                      max="3"
                      value={therapySlots[therapy] || 1}
                      onChange={(e) => handleSlotChange(therapy, e.target.value)}
                    />
                  </label>{' '}
                  <label>
                    Assigned Doctor:{' '}
                    <select value={assignedDoctors[therapy] || ''} onChange={(e) => handleDoctorChange(therapy, e.target.value)}>
                      <option value="">No Preference</option>
                      {doctors.filter((d) => d.therapy === therapy).map((d) => (
                        <option key={d.id} value={d.id}>{d.name}</option>
                      ))}
                    </select>
                  </label>
                </div>
              )}
            </div>
          ))}
        </div>

        <button onClick={handleSubmit}>{editingId ? 'Update Patient' : 'Add Patient'}</button>
        {editingId && <button className="secondary" onClick={resetForm}>Cancel edit</button>}
      </div>

      <div style={{ marginTop: 30 }}>
        <h3>Patient List ({patients.length})</h3>
        <input type="text" placeholder="Search Patient" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
        <div className="table-wrap" style={{ marginTop: 10 }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Phone</th>
                <th>Therapies</th>
                <th>Slots per Day</th>
                <th>Assigned Doctors</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredPatients.map((patient) => (
                <tr key={patient.id}>
                  <td>{patient.name}</td>
                  <td>{patient.phone || '—'}</td>
                  <td>{(patient.therapies || []).join(', ')}</td>
                  <td>
                    {(patient.therapySlots &&
                      Object.entries(patient.therapySlots).map(([therapy, count]) => `${therapy}: ${count}`).join(', ')) || '—'}
                  </td>
                  <td>
                    {(patient.assignedDoctors &&
                      Object.entries(patient.assignedDoctors).map(([therapy, docId]) => {
                        const doctor = doctors.find((d) => d.id === docId);
                        return `${therapy}: ${doctor?.name || docId}`;
                      }).join(', ')) || '—'}
                  </td>
                  <td>
                    <button className="small" onClick={() => handleEdit(patient)}>Edit</button>
                    <button className="small danger" onClick={() => handleDelete(patient)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default AddPatient;
