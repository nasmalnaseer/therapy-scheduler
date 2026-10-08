import React, { useEffect, useState } from 'react';
import { db } from '../firebase';
import {
  collection,
  getDocs,
  addDoc,
  deleteDoc,
  doc,
  getDoc
} from 'firebase/firestore';
import { format } from 'date-fns';

const Scheduler = () => {
  const [patients, setPatients] = useState([]);
  const [doctors, setDoctors] = useState([]);
  const [schedule, setSchedule] = useState([]);
  const [selectedDate, setSelectedDate] = useState(() =>
    new Date().toISOString().split('T')[0]
  );
  const [weekMode, setWeekMode] = useState(false);
  const [searchTerm, setSearchTerm] = useState(''); // ✅ added search input
  const [manualSlot, setManualSlot] = useState({
  patientId: '',
  therapy: '',
  doctorId: '',
  startTime: ''
});


  useEffect(() => {
    const fetchData = async () => {
      const [patientSnap, doctorSnap, scheduleSnap] = await Promise.all([
        getDocs(collection(db, 'patients')),
        getDocs(collection(db, 'doctors')),
        getDocs(collection(db, 'schedule'))
      ]);

      setPatients(patientSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setDoctors(doctorSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })));

      const scheduleData = scheduleSnap.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      // 🧠 Sort by therapy → date → time
      scheduleData.sort((a, b) => {
        if (a.therapy !== b.therapy) return a.therapy.localeCompare(b.therapy);
        const dateA = new Date(a.startTime);
        const dateB = new Date(b.startTime);
        return dateA - dateB;
      });

      setSchedule(scheduleData);
    };

    fetchData();
  }, []);

  const fetchTimeConfig = async () => {
    const ref = doc(db, 'config', 'timeslots');
    const snap = await getDoc(ref);
    return snap.exists() ? snap.data() : {
      default: [['09:00', '11:00'], ['11:15', '13:15'], ['14:15', '17:00']],
      tuesday: [['09:00', '11:00'], ['11:15', '13:15']],
      durations: {
        physio: 60,
        occupational: 60,
        speech: 30,
        vr: 60,
        hand_robotic: 60,
        gait_robotic: 60,
        psychology: 60
      }
    };
  };

  const formatTime = (timeStr, baseDate) => {
    const [h, m] = timeStr.split(':').map(Number);
    const dt = new Date(baseDate);
    dt.setHours(h, m, 0, 0);
    return dt;
  };

  const isFree = (slotArr, start, end) => !slotArr.some(([s, e]) => start < e && s < end);
  const assignSlot = (map, id, start, end) => {
    if (!map[id]) map[id] = [];
    map[id].push([start, end]);
  };

const generateSchedule = async () => {
  const tempSchedule = [];
  const config = await fetchTimeConfig();
  const durations = config.durations;
  const startDate = new Date(selectedDate);
  const daysToSchedule = weekMode ? 7 : 1;

  const scheduleSnap = await getDocs(collection(db, 'schedule'));
  const oldSchedule = scheduleSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

  const patientIds = patients.map(p => p.id + ':' + p.therapies.join(',')).sort();
  const doctorIds = doctors.map(d => d.id + ':' + d.therapy + ':' + d.available).sort();
  const prevPatientIds = [...new Set(oldSchedule.map(s => s.patientId))].sort();
  const prevDoctorIds = [...new Set(oldSchedule.map(s => s.doctorId))].sort();

  const samePatients = JSON.stringify(patientIds) === JSON.stringify(prevPatientIds);
  const sameDoctors = JSON.stringify(doctorIds) === JSON.stringify(prevDoctorIds);

  if (oldSchedule.length > 0 && samePatients && sameDoctors) {
    console.log("Reusing existing schedule...");
    setSchedule(oldSchedule.sort((a, b) => new Date(a.startTime) - new Date(b.startTime)));
    return;
  }

  for (let d = 0; d < daysToSchedule; d++) {
    const currentDate = new Date(startDate);
    currentDate.setDate(startDate.getDate() + d);

    const isTuesday = currentDate.getDay() === 2;
    const slotBlocks = isTuesday ? config.tuesday : config.default;

    const allSlots = [];
    for (let [start, end] of slotBlocks) {
      const startTime = formatTime(start, currentDate);
      const endTime = formatTime(end, currentDate);
      let current = new Date(startTime);
      while (current.getTime() + 30 * 60000 <= endTime.getTime()) {
        const slotEnd = new Date(current.getTime() + 30 * 60000);
        allSlots.push([new Date(current), slotEnd]);
        current = new Date(current.getTime() + 15 * 60000);
      }
    }

    const doctorUsage = {};
    const patientUsage = {};
    const doctorAssignmentPerPatient = {};

    for (let patient of patients) {
      patientUsage[patient.id] = [];

      for (let therapy of patient.therapies) {
        const slotCount = patient.therapySlots?.[therapy] || 1;
        const duration = durations[therapy] || 60;

        const assignedId = patient.assignedDoctors?.[therapy];
        const availableDoctors = assignedId
          ? doctors.filter(d => d.id === assignedId && d.available)
          : doctors.filter(d => d.therapy === therapy && d.available);

        let selectedDoctor;
        if (assignedId) {
          selectedDoctor = availableDoctors[0];
        } else {
          // Try to use same doctor as before
          const previous = doctorAssignmentPerPatient[`${patient.id}-${therapy}`];
          if (previous && availableDoctors.find(d => d.id === previous)) {
            selectedDoctor = availableDoctors.find(d => d.id === previous);
          } else {
            selectedDoctor = availableDoctors[Math.floor(Math.random() * availableDoctors.length)];
            doctorAssignmentPerPatient[`${patient.id}-${therapy}`] = selectedDoctor?.id;
          }
        }

        if (!selectedDoctor) continue;

        doctorUsage[selectedDoctor.id] = doctorUsage[selectedDoctor.id] || [];

        const slotsToAssign = [];
        const forenoon = [];
        const afternoon = [];
        const midday = [];

        for (let [s, e] of allSlots) {
          const hour = s.getHours();
          if (hour < 12 || (hour === 12 && s.getMinutes() <= 15)) forenoon.push([s, e]);
          else if (hour >= 13 && s.getMinutes() >= 15) afternoon.push([s, e]);
          else midday.push([s, e]);
        }

        const pickSlot = (pool) => {
          for (let [s, e] of pool) {
            const dBusy = doctorUsage[selectedDoctor.id].some(([ds, de]) => s < de && ds < e);
            const pBusy = patientUsage[patient.id].some(([ps, pe]) => s < pe && ps < e);
            const pTherapyConflict = tempSchedule.some(entry =>
              entry.patientId === patient.id &&
              new Date(entry.startTime).getTime() === s.getTime()
            );
            if (!dBusy && !pBusy && !pTherapyConflict) {
              return [s, e];
            }
          }
          return null;
        };

        if (slotCount === 1) {
          const slot = pickSlot([...forenoon, ...afternoon, ...midday]);
          if (slot) slotsToAssign.push(slot);
        } else if (slotCount === 2) {
          const slot1 = pickSlot(forenoon);
          const slot2 = pickSlot(afternoon);
          if (slot1 && slot2) {
            slotsToAssign.push(slot1, slot2);
          }
        } else if (slotCount === 3) {
          const slot1 = pickSlot(forenoon);
          const slot2 = pickSlot(midday);
          const slot3 = pickSlot(afternoon);
          if (slot1 && slot2 && slot3) {
            slotsToAssign.push(slot1, slot2, slot3);
          }
        }

        for (let [start, end] of slotsToAssign) {
          doctorUsage[selectedDoctor.id].push([start, end]);
          patientUsage[patient.id].push([start, end]);
          tempSchedule.push({
            patientId: patient.id,
            doctorId: selectedDoctor.id,
            therapy,
            startTime: start.toISOString()
          });
        }
      }
    }
  }

  for (let docu of scheduleSnap.docs) {
    await deleteDoc(doc(collection(db, 'schedule'), docu.id));
  }

  for (let entry of tempSchedule) {
    await addDoc(collection(db, 'schedule'), entry);
  }

  tempSchedule.sort((a, b) => new Date(a.startTime) - new Date(b.startTime));
  setSchedule(tempSchedule);
};







  const showFormattedTime = iso => format(new Date(iso), 'yyyy-MM-dd HH:mm');

  // ✅ Filtered schedule based on searchTerm
  const filteredSchedule = schedule.filter(s => {
    const patient = patients.find(p => p.id === s.patientId);
    const doctor = doctors.find(d => d.id === s.doctorId);
    return (
      (patient?.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (doctor?.name || '').toLowerCase().includes(searchTerm.toLowerCase())
    );
  });


const handleManualSlotChange = (field, value) => {
  setManualSlot(prev => ({ ...prev, [field]: value }));
};

const addManualSlot = async () => {
  if (!manualSlot.patientId || !manualSlot.therapy || !manualSlot.doctorId || !manualSlot.startTime) {
    alert("Please fill in all fields");
    return;
  }

  await addDoc(collection(db, 'schedule'), {
    patientId: manualSlot.patientId,
    therapy: manualSlot.therapy,
    doctorId: manualSlot.doctorId,
    startTime: new Date(manualSlot.startTime).toISOString()
  });

  // Clear form
  setManualSlot({
    patientId: '',
    therapy: '',
    doctorId: '',
    startTime: ''
  });

  // Refresh schedule
  const scheduleSnap = await getDocs(collection(db, 'schedule'));
  const updatedSchedule = scheduleSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }))
    .sort((a, b) => new Date(a.startTime) - new Date(b.startTime));
  setSchedule(updatedSchedule);
};



  return (
    <div>
      <h3>Therapy Scheduler</h3>

      <label>
        Select Date:{' '}
        <input
          type="date"
          value={selectedDate}
          onChange={e => setSelectedDate(e.target.value)}
        />
      </label>

      <label style={{ marginLeft: '20px' }}>
        <input
          type="checkbox"
          checked={weekMode}
          onChange={e => setWeekMode(e.target.checked)}
        />{' '}
        Schedule for full week
      </label>

      <br />
      <button style={{ marginTop: '10px' }} onClick={generateSchedule}>
        Generate Schedule
      </button>

      <div style={{ marginTop: '15px' }}>
        <input
          type="text"
          placeholder="Search patient or doctor"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{ padding: '6px', width: '300px' }}
        />
      </div>

      <table border="1" style={{ marginTop: '20px', width: '100%' }}>
        <thead>
          <tr>
            <th>Department</th>
            <th>Patient</th>
            <th>Doctor</th>
            <th>Start Time</th>
          </tr>
        </thead>
        <tbody>
          {filteredSchedule.map((s, i) => {
            const patient = patients.find(p => p.id === s.patientId);
            const doctor = doctors.find(d => d.id === s.doctorId);
            return (
              <tr key={i}>
                <td>{s.therapy}</td>
                <td>{patient ? patient.name : s.patientId}</td>
                <td>{doctor ? doctor.name : s.doctorId}</td>
                <td>{showFormattedTime(s.startTime)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <h3>Manually Add Slot</h3>

<div style={{ border: '1px solid #ccc', padding: 10, marginTop: 20 }}>
  <label>
    Patient:{' '}
    <select
      value={manualSlot.patientId}
      onChange={e => handleManualSlotChange('patientId', e.target.value)}
    >
      <option value="">Select</option>
      {patients.map(p => (
        <option key={p.id} value={p.id}>{p.name}</option>
      ))}
    </select>
  </label>

  {manualSlot.patientId && (
    <>
      <label style={{ marginLeft: 10 }}>
        Therapy:{' '}
        <select
          value={manualSlot.therapy}
          onChange={e => handleManualSlotChange('therapy', e.target.value)}
        >
          <option value="">Select</option>
          {(patients.find(p => p.id === manualSlot.patientId)?.therapies || []).map(therapy => (
            <option key={therapy} value={therapy}>{therapy}</option>
          ))}
        </select>
      </label>
    </>
  )}

  {manualSlot.therapy && (
    <>
      <label style={{ marginLeft: 10 }}>
        Doctor:{' '}
        <select
          value={manualSlot.doctorId}
          onChange={e => handleManualSlotChange('doctorId', e.target.value)}
        >
          <option value="">Select</option>
          {doctors
            .filter(d => d.therapy === manualSlot.therapy && d.available)
            .map(doc => (
              <option key={doc.id} value={doc.id}>{doc.name}</option>
            ))}
        </select>
      </label>
    </>
  )}

  <label style={{ marginLeft: 10 }}>
    Start Time:{' '}
    <input
      type="datetime-local"
      value={manualSlot.startTime}
      onChange={e => handleManualSlotChange('startTime', e.target.value)}
    />
  </label>

  <button onClick={addManualSlot} style={{ marginLeft: 10 }}>➕ Add Slot</button>
</div>

    </div>
    
  );
};


export default Scheduler;
