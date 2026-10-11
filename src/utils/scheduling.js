// Pure scheduling logic (no Firebase, no React) so it can be unit-tested.
import {
  MS_MIN,
  addDays,
  atTime,
  dateKey,
  hhmmToMinutes,
  minutesOfDay,
  timeKey
} from './timeUtils';

export const DEFAULT_DURATION = 60; // minutes, when a therapy has no valid duration in Time Config
export const LEGACY_DURATION = 30; // sessions saved before durations existed were 30-minute slots
export const SLOT_STEP_MINUTES = 15; // sessions may start every 15 minutes
export const AM_PM_CUTOFF_MIN = 13 * 60; // half-day leave: "morning" ends / "afternoon" starts at 13:00

export const DEFAULT_CONFIG = {
  default: [['09:00', '11:00'], ['11:15', '13:15'], ['14:15', '17:00']],
  tuesday: [['09:00', '11:00'], ['11:15', '13:15']],
  closedDays: [],
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

// Firestore cannot store arrays of arrays, so Time Config is saved as [{start, end}].
// This accepts either shape and always returns [[start, end], ...].
const toBlocks = (value, fallback) => {
  if (!Array.isArray(value)) return fallback;
  return value
    .map((b) => (Array.isArray(b) ? [b[0], b[1]] : [b?.start, b?.end]))
    .filter(([s, e]) => typeof s === 'string' && typeof e === 'string' && s && e);
};

export const normalizeConfig = (raw) => ({
  default: toBlocks(raw?.default, DEFAULT_CONFIG.default),
  tuesday: toBlocks(raw?.tuesday, DEFAULT_CONFIG.tuesday),
  closedDays: Array.isArray(raw?.closedDays) ? raw.closedDays.map(Number) : [],
  durations: { ...DEFAULT_CONFIG.durations, ...(raw?.durations || {}) }
});

export const serializeBlocks = (blocks) => blocks.map(([start, end]) => ({ start, end }));

export const getBlocks = (config, day) => (day.getDay() === 2 ? config.tuesday : config.default);
export const isClosedDay = (config, day) => (config.closedDays || []).includes(day.getDay());

export const getDuration = (durations, therapy) => {
  const d = Number(durations?.[therapy]);
  return d > 0 ? d : DEFAULT_DURATION;
};

// ---------- sessions ----------
export const sessionDuration = (s) => (s.duration > 0 ? s.duration : LEGACY_DURATION);
export const sessionStart = (s) => new Date(s.startTime);
export const sessionEnd = (s) => new Date(sessionStart(s).getTime() + sessionDuration(s) * MS_MIN);
export const statusOf = (s) => s.status || 'scheduled';
export const isActive = (s) => statusOf(s) !== 'cancelled';
export const overlaps = (aStart, aEnd, bStart, bEnd) => aStart < bEnd && bStart < aEnd;

// ---------- doctors / leave ----------
export const leaveCovers = (doctor, start) => {
  const key = dateKey(start);
  const mins = minutesOfDay(start);
  return (doctor.leave || []).some(
    (l) =>
      l.date === key &&
      (!l.part || l.part === 'full' ||
        (l.part === 'am' && mins < AM_PM_CUTOFF_MIN) ||
        (l.part === 'pm' && mins >= AM_PM_CUTOFF_MIN))
  );
};

// ---------- equipment ----------
export const equipmentFor = (equipment, therapy) => equipment.filter((e) => e.therapy === therapy);
export const needsEquipment = (equipment, therapy) => equipmentFor(equipment, therapy).length > 0;

export function pickEquipment({ equipment, therapy, startTime, duration, sessions, ignoreId = null, preferId = null }) {
  const all = equipmentFor(equipment, therapy);
  if (all.length === 0) return { needed: false, id: null };
  const a = new Date(startTime).getTime();
  const b = a + duration * MS_MIN;
  const free = all
    .filter((u) => u.available !== false)
    .filter(
      (u) =>
        !sessions.some(
          (s) =>
            s.id !== ignoreId &&
            isActive(s) &&
            s.equipmentId === u.id &&
            overlaps(a, b, sessionStart(s).getTime(), sessionEnd(s).getTime())
        )
    );
  if (preferId && free.some((u) => u.id === preferId)) return { needed: true, id: preferId };
  return { needed: true, id: free[0]?.id || null };
}

// ---------- slot generation ----------
export function slotsForDay(config, day, duration, step = SLOT_STEP_MINUTES) {
  const slots = [];
  for (const [start, end] of getBlocks(config, day)) {
    const blockEnd = atTime(day, end).getTime();
    let cur = atTime(day, start).getTime();
    while (cur + duration * MS_MIN <= blockEnd) {
      slots.push([new Date(cur), new Date(cur + duration * MS_MIN)]);
      cur += step * MS_MIN;
    }
  }
  return slots;
}

// forenoon: start <= 12:15, afternoon: start >= 13:15, midday: in between
export function groupSlots(slots) {
  const forenoon = [];
  const midday = [];
  const afternoon = [];
  for (const slot of slots) {
    const m = minutesOfDay(slot[0]);
    if (m <= 12 * 60 + 15) forenoon.push(slot);
    else if (m >= 13 * 60 + 15) afternoon.push(slot);
    else midday.push(slot);
  }
  return { forenoon, midday, afternoon };
}

export const requestsFromPatients = (patients) => {
  const requests = [];
  for (const patient of patients) {
    for (const therapy of patient.therapies || []) {
      requests.push({ patient, therapy, slotCount: patient.therapySlots?.[therapy] || 1 });
    }
  }
  return requests;
};

export const memoryKey = (patientId, therapy) => `${patientId}|${therapy}`;

const busy = (arr, a, b) => (arr || []).some(([s, e]) => a < e && s < b);

/**
 * Place sessions for ONE day.
 *  - requests: [{ patient, therapy, slotCount }]
 *  - existing: sessions already booked (any date); only active ones on `day` block time
 *  - memory:   { "patientId|therapy": doctorId } keeps the same doctor across days
 *  - notBefore: ms timestamp, slots starting earlier are skipped
 */
export function placeSessions({ day, requests, doctors, equipment = [], config, existing = [], memory = {}, notBefore = 0 }) {
  const placed = [];
  const unplaced = [];
  if (isClosedDay(config, day)) return { placed, unplaced };

  const dayKey = dateKey(day);
  const doctorUsage = {};
  const patientUsage = {};
  const equipmentUsage = {};
  const add = (map, id, a, b) => {
    if (!map[id]) map[id] = [];
    map[id].push([a, b]);
  };
  for (const s of existing) {
    if (!isActive(s)) continue;
    const start = sessionStart(s);
    if (dateKey(start) !== dayKey) continue;
    const a = start.getTime();
    const b = a + sessionDuration(s) * MS_MIN;
    add(doctorUsage, s.doctorId, a, b);
    add(patientUsage, s.patientId, a, b);
    if (s.equipmentId) add(equipmentUsage, s.equipmentId, a, b);
  }

  const poolCache = {};
  const getPools = (duration) => {
    if (!poolCache[duration]) poolCache[duration] = groupSlots(slotsForDay(config, day, duration));
    return poolCache[duration];
  };
  const load = (d) => (doctorUsage[d.id] || []).reduce((n, [s, e]) => n + (e - s), 0);

  for (const { patient, therapy, slotCount } of requests) {
    const base = { date: dayKey, patientId: patient.id, patientName: patient.name, therapy };
    const duration = getDuration(config.durations, therapy);
    const pools = getPools(duration);
    const assignedId = patient.assignedDoctors?.[therapy] || null;

    let candidates = assignedId
      ? doctors.filter((d) => d.id === assignedId)
      : doctors.filter((d) => d.therapy === therapy);
    candidates = candidates.filter((d) => d.available !== false);
    if (candidates.length === 0) {
      unplaced.push({ ...base, reason: 'no doctor available' });
      continue;
    }

    // doctors who are off for the whole day are not worth trying
    const onLeaveAllDay = (d) => leaveCovers(d, atTime(day, '09:00')) && leaveCovers(d, atTime(day, '15:00'));
    const present = candidates.filter((d) => !onLeaveAllDay(d));
    if (present.length === 0) {
      unplaced.push({ ...base, reason: 'doctor on leave' });
      continue;
    }
    candidates = present;

    const units = equipmentFor(equipment, therapy);
    const usableUnits = units.filter((u) => u.available !== false);
    if (units.length > 0 && usableUnits.length === 0) {
      unplaced.push({ ...base, reason: 'no equipment available' });
      continue;
    }

    // least-busy doctor first, but keep the patient's usual doctor if there is one
    const preferred = memory[memoryKey(patient.id, therapy)];
    candidates = [...candidates].sort(
      (x, y) =>
        (y.id === preferred) - (x.id === preferred) ||
        load(x) - load(y) ||
        String(x.name).localeCompare(String(y.name))
    );

    // Long sessions leave no start times around midday, so for 3 sessions a day
    // the forenoon is split in two (early / late) instead.
    const half = Math.ceil(pools.forenoon.length / 2);
    const threeWay =
      pools.midday.length > 0
        ? [pools.forenoon, pools.midday, pools.afternoon]
        : [pools.forenoon.slice(0, half), pools.forenoon.slice(half), pools.afternoon];
    const poolList =
      slotCount === 1
        ? [[...pools.forenoon, ...pools.afternoon, ...pools.midday]]
        : slotCount === 2
          ? [pools.forenoon, pools.afternoon]
          : slotCount === 3
            ? threeWay
            : [];

    let success = null;
    for (const doctor of candidates) {
      const chosen = [];
      const pick = (pool) => {
        for (const [s, e] of pool) {
          const a = s.getTime();
          const b = e.getTime();
          if (a < notBefore) continue;
          if (leaveCovers(doctor, s)) continue;
          if (busy(doctorUsage[doctor.id], a, b)) continue;
          if (busy(patientUsage[patient.id], a, b)) continue;
          if (chosen.some((c) => a < c.b && c.a < b)) continue;
          let equipmentId = null;
          if (usableUnits.length > 0) {
            const unit = usableUnits.find(
              (u) => !busy(equipmentUsage[u.id], a, b) && !chosen.some((c) => c.equipmentId === u.id && a < c.b && c.a < b)
            );
            if (!unit) continue;
            equipmentId = unit.id;
          }
          return { a, b, s, equipmentId };
        }
        return null;
      };
      let ok = poolList.length > 0;
      for (const pool of poolList) {
        const r = pick(pool);
        if (!r) {
          ok = false;
          break;
        }
        chosen.push(r);
      }
      if (ok) {
        success = { doctor, chosen };
        break;
      }
    }

    if (!success) {
      unplaced.push({ ...base, reason: 'no free slot' });
      continue;
    }

    memory[memoryKey(patient.id, therapy)] = success.doctor.id;
    for (const c of success.chosen) {
      add(doctorUsage, success.doctor.id, c.a, c.b);
      add(patientUsage, patient.id, c.a, c.b);
      if (c.equipmentId) add(equipmentUsage, c.equipmentId, c.a, c.b);
      placed.push({
        patientId: patient.id,
        doctorId: success.doctor.id,
        therapy,
        startTime: c.s.toISOString(),
        duration,
        equipmentId: c.equipmentId,
        status: 'scheduled'
      });
    }
  }
  return { placed, unplaced };
}

export function buildSchedule({ days, patients, doctors, equipment = [], config, existing = [] }) {
  const memory = {};
  const requests = requestsFromPatients(patients);
  const placed = [];
  const unplaced = [];
  for (const day of days) {
    const r = placeSessions({ day, requests, doctors, equipment, config, existing, memory });
    placed.push(...r.placed);
    unplaced.push(...r.unplaced);
  }
  return { placed, unplaced };
}

// First free slot (searching day by day) for one extra session, e.g. to reschedule a missed one
export function findNextSlot({ fromDay, maxDays = 21, patient, therapy, preferredDoctorId = null, doctors, equipment = [], config, existing, notBefore = 0 }) {
  const memory = preferredDoctorId ? { [memoryKey(patient.id, therapy)]: preferredDoctorId } : {};
  for (let i = 0; i < maxDays; i++) {
    const day = addDays(fromDay, i);
    const r = placeSessions({
      day,
      requests: [{ patient, therapy, slotCount: 1 }],
      doctors,
      equipment,
      config,
      existing,
      memory,
      notBefore
    });
    if (r.placed.length) return r.placed[0];
  }
  return null;
}

export function planDates({ startDay, weeks, weekdays, closedDays = [] }) {
  const dates = [];
  for (let i = 0; i < weeks * 7; i++) {
    const d = addDays(startDay, i);
    if (weekdays.includes(d.getDay()) && !closedDays.includes(d.getDay())) dates.push(d);
  }
  return dates;
}

// ---------- conflict checks (manual add, edit, drag & drop) ----------
export function findConflicts({ candidate, sessions, doctors, patients, equipment = [], config, ignoreId = null }) {
  const out = [];
  const start = new Date(candidate.startTime);
  const a = start.getTime();
  const duration = candidate.duration > 0 ? candidate.duration : getDuration(config.durations, candidate.therapy);
  const b = a + duration * MS_MIN;
  const doctor = doctors.find((d) => d.id === candidate.doctorId);
  const patient = patients.find((p) => p.id === candidate.patientId);
  const unit = equipment.find((u) => u.id === candidate.equipmentId);
  const doctorName = doctor?.name || 'Doctor';
  const patientName = patient?.name || 'Patient';

  for (const s of sessions) {
    if (s.id === ignoreId || !isActive(s)) continue;
    const sa = sessionStart(s).getTime();
    const sb = sa + sessionDuration(s) * MS_MIN;
    if (!overlaps(a, b, sa, sb)) continue;
    const range = `${timeKey(new Date(sa))}-${timeKey(new Date(sb))}`;
    if (s.doctorId === candidate.doctorId) {
      const other = patients.find((p) => p.id === s.patientId)?.name || 'another patient';
      out.push({ type: 'doctor', message: `${doctorName} is already booked ${range} (${other})` });
    }
    if (s.patientId === candidate.patientId) {
      out.push({ type: 'patient', message: `${patientName} already has ${s.therapy} at ${range}` });
    }
    if (candidate.equipmentId && s.equipmentId === candidate.equipmentId) {
      out.push({ type: 'equipment', message: `${unit?.name || 'Equipment'} is already in use ${range}` });
    }
  }

  if (doctor) {
    if (doctor.available === false) out.push({ type: 'unavailable', message: `${doctorName} is marked unavailable` });
    if (leaveCovers(doctor, start)) out.push({ type: 'leave', message: `${doctorName} is on leave at that time` });
    if (doctor.therapy !== candidate.therapy) {
      out.push({ type: 'therapy', message: `${doctorName} provides ${doctor.therapy}, but the session is ${candidate.therapy}` });
    }
  }
  if (isClosedDay(config, start)) {
    out.push({ type: 'hours', message: 'That day is marked closed in Time Config' });
  } else {
    const fits = getBlocks(config, start).some(
      ([bs, be]) => a >= atTime(start, bs).getTime() && b <= atTime(start, be).getTime()
    );
    if (!fits) out.push({ type: 'hours', message: 'That time is outside the hours set in Time Config' });
  }
  return out;
}

export const formatConflicts = (list) => list.map((c) => `- ${c.message}`).join('\n');

// ---------- doctor leave / unavailability ----------
export function reassignAffected({ affected, allSessions, doctors }) {
  const working = allSessions.map((s) => ({ ...s }));
  const moves = [];
  const failed = [];
  for (const s of affected) {
    const start = sessionStart(s);
    const a = start.getTime();
    const b = sessionEnd(s).getTime();
    const alt = doctors
      .filter((d) => d.id !== s.doctorId && d.therapy === s.therapy && d.available !== false && !leaveCovers(d, start))
      .find(
        (d) =>
          !working.some(
            (w) =>
              w.id !== s.id &&
              isActive(w) &&
              w.doctorId === d.id &&
              overlaps(a, b, sessionStart(w).getTime(), sessionEnd(w).getTime())
          )
      );
    if (alt) {
      moves.push({ sessionId: s.id, doctorId: alt.id });
      working.find((w) => w.id === s.id).doctorId = alt.id;
    } else {
      failed.push(s);
    }
  }
  return { moves, failed };
}

// Upcoming, still-scheduled sessions of a doctor, optionally limited to a leave entry
export function sessionsAffected({ doctorId, schedule, fromMs, leave = null }) {
  return schedule.filter((s) => {
    if (s.doctorId !== doctorId || statusOf(s) !== 'scheduled') return false;
    const start = sessionStart(s);
    if (start.getTime() < fromMs) return false;
    return leave ? leaveCovers({ leave: [leave] }, start) : true;
  });
}

export const blockMinutes = (config, day) =>
  isClosedDay(config, day)
    ? 0
    : getBlocks(config, day).reduce((n, [s, e]) => n + (hhmmToMinutes(e) - hhmmToMinutes(s)), 0);
