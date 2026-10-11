import { addDoc, collection, deleteDoc, doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useData } from '../context/DataContext';
import {
  findConflicts,
  findNextSlot,
  formatConflicts,
  pickEquipment,
  sessionDuration,
  sessionStart,
  statusOf
} from '../utils/scheduling';
import { startOfDay } from '../utils/timeUtils';

// Shared actions for a single session: edit/move (with clash check), status, reschedule, delete.
export default function useSessionOps() {
  const { schedule, doctors, patients, equipment, config } = useData();

  const guard = (conflicts, verb) =>
    conflicts.length === 0 || window.confirm(`${formatConflicts(conflicts)}\n\n${verb} anyway?`);

  // changes: { patientId?, doctorId?, startTime? (ISO) }  -> true if saved
  const update = async (session, changes) => {
    const next = { ...session, ...changes };
    const duration = sessionDuration(session);
    const eq = pickEquipment({
      equipment,
      therapy: next.therapy,
      startTime: next.startTime,
      duration,
      sessions: schedule,
      ignoreId: session.id,
      preferId: session.equipmentId
    });
    const candidate = { ...next, duration, equipmentId: eq.id };
    const conflicts = findConflicts({ candidate, sessions: schedule, doctors, patients, equipment, config, ignoreId: session.id });
    if (eq.needed && !eq.id) conflicts.push({ type: 'equipment', message: 'No free equipment unit at that time' });
    if (!guard(conflicts, 'Save')) return false;
    await updateDoc(doc(db, 'schedule', session.id), {
      patientId: next.patientId,
      doctorId: next.doctorId,
      startTime: next.startTime,
      equipmentId: eq.id ?? null
    });
    return true;
  };

  const setStatus = (session, status) => updateDoc(doc(db, 'schedule', session.id), { status });

  // For missed / cancelled sessions: books the next free slot as a new session
  const reschedule = async (session) => {
    const patient = patients.find((p) => p.id === session.patientId);
    if (!patient) {
      alert('This patient no longer exists.');
      return false;
    }
    const now = Date.now();
    const from = sessionStart(session).getTime() > now ? sessionStart(session) : new Date(now);
    const slot = findNextSlot({
      fromDay: startOfDay(from),
      patient,
      therapy: session.therapy,
      preferredDoctorId: session.doctorId,
      doctors,
      equipment,
      config,
      existing: schedule,
      notBefore: Math.max(now, from.getTime())
    });
    if (!slot) {
      alert('No free slot was found in the next 3 weeks.');
      return false;
    }
    const when = sessionStart(slot).toLocaleString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    if (!window.confirm(`Book a new ${session.therapy} session for ${patient.name} on ${when}?`)) return false;
    await addDoc(collection(db, 'schedule'), { ...slot, rescheduledFrom: session.id });
    return true;
  };

  const remove = async (session) => {
    if (!window.confirm('Delete this session permanently? (Use Cancel to keep it in the history.)')) return false;
    await deleteDoc(doc(db, 'schedule', session.id));
    return true;
  };

  return { update, setStatus, reschedule, remove, statusOf };
}
