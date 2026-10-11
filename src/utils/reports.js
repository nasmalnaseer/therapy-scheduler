import { MS_MIN, addDays, dateKey, hhmmToMinutes, parseDateKey, startOfWeek } from './timeUtils';
import {
  AM_PM_CUTOFF_MIN,
  getBlocks,
  isActive,
  isClosedDay,
  sessionDuration,
  sessionStart,
  statusOf
} from './scheduling';

export function attendanceStats(sessions) {
  const stats = { scheduled: 0, attended: 0, missed: 0, cancelled: 0, total: sessions.length };
  for (const s of sessions) stats[statusOf(s)] = (stats[statusOf(s)] || 0) + 1;
  const done = stats.attended + stats.missed;
  stats.missedRate = done > 0 ? stats.missed / done : null; // null = nothing to measure yet
  return stats;
}

export function attendanceByTherapy(sessions) {
  const groups = {};
  for (const s of sessions) (groups[s.therapy] ||= []).push(s);
  return Object.entries(groups)
    .map(([therapy, list]) => ({ therapy, ...attendanceStats(list) }))
    .sort((a, b) => a.therapy.localeCompare(b.therapy));
}

// Sessions per therapy per week (weeks start on Monday), cancelled sessions excluded
export function weeklyTherapyCounts(sessions) {
  const weeks = {};
  for (const s of sessions) {
    if (!isActive(s)) continue;
    const key = dateKey(startOfWeek(sessionStart(s)));
    weeks[key] ||= { weekStart: key, total: 0, counts: {} };
    weeks[key].counts[s.therapy] = (weeks[key].counts[s.therapy] || 0) + 1;
    weeks[key].total += 1;
  }
  return Object.values(weeks).sort((a, b) => a.weekStart.localeCompare(b.weekStart));
}

// Minutes a doctor could work on a day: configured hours minus leave
export function capacityMinutes(config, day, doctor) {
  if (isClosedDay(config, day)) return 0;
  const key = dateKey(day);
  const leaves = (doctor.leave || []).filter((l) => l.date === key).map((l) => l.part || 'full');
  if (leaves.includes('full')) return 0;
  let total = 0;
  for (const [s, e] of getBlocks(config, day)) {
    const start = hhmmToMinutes(s);
    const end = hhmmToMinutes(e);
    const am = Math.max(0, Math.min(end, AM_PM_CUTOFF_MIN) - start);
    const pm = end - start - am;
    total += (leaves.includes('am') ? 0 : am) + (leaves.includes('pm') ? 0 : pm);
  }
  return total;
}

/**
 * Booked time vs available time per doctor.
 * "Working days" = days in the range that have at least one session, so closed or unused days don't drag the figure down.
 */
export function doctorUtilization({ sessions, doctors, config, fromKey, toKey }) {
  const inRange = sessions.filter((s) => {
    const k = dateKey(sessionStart(s));
    return isActive(s) && k >= fromKey && k <= toKey;
  });
  const workingDays = [...new Set(inRange.map((s) => dateKey(sessionStart(s))))].sort();
  return doctors
    .map((doctor) => {
      const mine = inRange.filter((s) => s.doctorId === doctor.id);
      const bookedMin = mine.reduce((n, s) => n + sessionDuration(s), 0);
      const capacityMin = workingDays.reduce((n, k) => n + capacityMinutes(config, parseDateKey(k), doctor), 0);
      return {
        doctor,
        sessions: mine.length,
        bookedMin,
        capacityMin,
        pct: capacityMin > 0 ? Math.min(100, Math.round((bookedMin / capacityMin) * 100)) : 0,
        workingDays: workingDays.length
      };
    })
    .sort((a, b) => b.pct - a.pct || a.doctor.name.localeCompare(b.doctor.name));
}

export const rangeKeys = (from, to) => {
  const keys = [];
  for (let d = from; dateKey(d) <= dateKey(to); d = addDays(d, 1)) keys.push(dateKey(d));
  return keys;
};

export const minutesToLabel = (m) => {
  const h = Math.floor(m / 60);
  const r = m % 60;
  return h ? `${h}h${r ? ` ${r}m` : ''}` : `${r}m`;
};

export const toMs = (min) => min * MS_MIN;
