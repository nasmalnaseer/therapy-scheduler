import { placeSessions, planDates } from './scheduling';
import { dateKey } from './timeUtils';

// Builds the sessions for a recurring plan (pure, so it can be previewed and tested).
export function buildPlan({ patient, therapy, weekdays, weeks, startDay, doctors, equipment = [], config, existing = [] }) {
  const dates = planDates({ startDay, weeks, weekdays, closedDays: config.closedDays });
  const planId = `plan_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  const memory = {};
  const placed = [];
  const unplaced = [];
  let busy = existing;
  for (const day of dates) {
    const r = placeSessions({
      day,
      requests: [{ patient, therapy, slotCount: 1 }],
      doctors,
      equipment,
      config,
      existing: busy,
      memory
    });
    r.placed.forEach((p) => placed.push({ ...p, planId }));
    unplaced.push(...r.unplaced.map((u) => ({ ...u, date: dateKey(day) })));
    busy = busy.concat(r.placed);
  }
  return { planId, placed, unplaced };
}
