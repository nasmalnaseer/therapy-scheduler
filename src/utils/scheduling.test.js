import {
  DEFAULT_CONFIG,
  buildSchedule,
  findConflicts,
  findNextSlot,
  getBlocks,
  normalizeConfig,
  pickEquipment,
  placeSessions,
  planDates,
  reassignAffected,
  requestsFromPatients,
  sessionEnd,
  sessionStart,
  sessionsAffected,
  sessionsOnLeave,
  slotsForDay
} from './scheduling';
import { attendanceByTherapy, attendanceStats, capacityMinutes, doctorUtilization, weeklyTherapyCounts } from './reports';
import { buildPatientMessage, normalizePhone, whatsappUrl } from './share';
import { atTime, dateKey, parseDateKey, timeKey } from './timeUtils';

const MONDAY = parseDateKey('2026-10-12');
const TUESDAY = parseDateKey('2026-10-13');
const config = (durations = {}, extra = {}) => normalizeConfig({ ...DEFAULT_CONFIG, durations: { ...DEFAULT_CONFIG.durations, ...durations }, ...extra });
const doctor = (id, therapy, extra = {}) => ({ id, name: `Dr ${id}`, therapy, available: true, ...extra });
const patient = (id, therapies, extra = {}) => ({ id, name: `Patient ${id}`, therapies, ...extra });
const times = (placed) => placed.map((s) => timeKey(sessionStart(s)));

describe('config', () => {
  test('accepts the old nested-array shape and the Firestore-safe object shape', () => {
    const a = normalizeConfig({ default: [['09:00', '10:00']] });
    const b = normalizeConfig({ default: [{ start: '09:00', end: '10:00' }] });
    expect(a.default).toEqual([['09:00', '10:00']]);
    expect(b.default).toEqual([['09:00', '10:00']]);
    expect(b.tuesday).toEqual(DEFAULT_CONFIG.tuesday);
    expect(normalizeConfig(null).durations.speech).toBe(30);
  });

  test('an empty Tuesday list means no sessions on Tuesday hours (not the default)', () => {
    expect(normalizeConfig({ tuesday: [] }).tuesday).toEqual([]);
  });
});

describe('durations and slots', () => {
  test('a 60 minute session only starts where 60 minutes fit in a block', () => {
    const slots = slotsForDay(config(), MONDAY, 60);
    expect(slots.every(([s, e]) => e - s === 60 * 60000)).toBe(true);
    expect(timeKey(slots[slots.length - 1][0])).toBe('16:00');
    expect(slots.some(([s]) => timeKey(s) === '10:15')).toBe(false); // 10:15 + 60 > 11:00
  });

  test('capacity of one doctor shrinks as sessions get longer', () => {
    const one = (mins) => {
      const patients = Array.from({ length: 20 }, (_, i) => patient(`p${i}`, ['physio']));
      const r = buildSchedule({ days: [MONDAY], patients, doctors: [doctor('d1', 'physio')], config: config({ physio: mins }), existing: [] });
      return r.placed.length;
    };
    expect(one(60)).toBe(6);
    expect(one(30)).toBeGreaterThan(one(60));
  });
});

describe('placement', () => {
  test('never overlaps doctor or patient, stores duration and status', () => {
    const patients = [patient('a', ['physio', 'speech']), patient('b', ['physio'])];
    const doctors = [doctor('d1', 'physio'), doctor('d2', 'speech')];
    const { placed } = buildSchedule({ days: [MONDAY], patients, doctors, config: config(), existing: [] });
    expect(placed).toHaveLength(3);
    expect(placed.every((s) => s.status === 'scheduled' && s.duration > 0)).toBe(true);
    const d1 = placed.filter((s) => s.doctorId === 'd1');
    expect(sessionEnd(d1[0]) <= sessionStart(d1[1]) || sessionEnd(d1[1]) <= sessionStart(d1[0])).toBe(true);
  });

  test('balances load between two doctors of the same therapy', () => {
    const patients = [patient('a', ['physio']), patient('b', ['physio'])];
    const { placed } = buildSchedule({ days: [MONDAY], patients, doctors: [doctor('d1', 'physio'), doctor('d2', 'physio')], config: config(), existing: [] });
    expect(new Set(placed.map((s) => s.doctorId)).size).toBe(2);
  });

  test('respects sessions that already exist (attended ones are kept)', () => {
    const existing = [{ id: 'x', patientId: 'z', doctorId: 'd1', therapy: 'physio', startTime: atTime(MONDAY, '09:00').toISOString(), duration: 60, status: 'attended' }];
    const { placed } = buildSchedule({ days: [MONDAY], patients: [patient('a', ['physio'])], doctors: [doctor('d1', 'physio')], config: config(), existing });
    expect(times(placed)).toEqual(['10:00']);
  });

  test('cancelled sessions free their slot', () => {
    const existing = [{ id: 'x', patientId: 'z', doctorId: 'd1', therapy: 'physio', startTime: atTime(MONDAY, '09:00').toISOString(), duration: 60, status: 'cancelled' }];
    const { placed } = buildSchedule({ days: [MONDAY], patients: [patient('a', ['physio'])], doctors: [doctor('d1', 'physio')], config: config(), existing });
    expect(times(placed)).toEqual(['09:00']);
  });

  test('keeps the assigned doctor, and reports when there is none', () => {
    const p = patient('a', ['physio'], { assignedDoctors: { physio: 'd2' } });
    const r = buildSchedule({ days: [MONDAY], patients: [p], doctors: [doctor('d1', 'physio'), doctor('d2', 'physio', { available: false })], config: config(), existing: [] });
    expect(r.placed).toHaveLength(0);
    expect(r.unplaced[0].reason).toBe('no doctor available');
  });

  test('2 and 3 sessions a day spread over the day without overlapping each other', () => {
    for (const n of [2, 3]) {
      const p = patient('a', ['physio'], { therapySlots: { physio: n } });
      const { placed } = buildSchedule({ days: [MONDAY], patients: [p], doctors: [doctor('d1', 'physio'), doctor('d2', 'physio')], config: config(), existing: [] });
      expect(placed).toHaveLength(n);
      const sorted = [...placed].sort((x, y) => sessionStart(x) - sessionStart(y));
      for (let i = 1; i < sorted.length; i++) expect(sessionEnd(sorted[i - 1]) <= sessionStart(sorted[i])).toBe(true);
    }
  });

  test('3 sessions a day also works for 60 minute therapies (no midday start times exist)', () => {
    const p = patient('a', ['physio'], { therapySlots: { physio: 3 } });
    const { placed } = buildSchedule({ days: [MONDAY], patients: [p], doctors: [doctor('d1', 'physio')], config: config(), existing: [] });
    expect(times(placed)).toEqual(['09:00', '11:15', '14:15']);
  });

  test('all-or-nothing: a patient needing 3 sessions gets none if only 2 fit', () => {
    const cfg = normalizeConfig({ default: [{ start: '09:00', end: '11:00' }] });
    const p = patient('a', ['physio'], { therapySlots: { physio: 3 } });
    const r = buildSchedule({ days: [MONDAY], patients: [p], doctors: [doctor('d1', 'physio')], config: cfg, existing: [] });
    expect(r.placed).toHaveLength(0);
    expect(r.unplaced).toHaveLength(1);
  });

  test('closed days get no sessions and no warnings', () => {
    const r = buildSchedule({ days: [MONDAY], patients: [patient('a', ['physio'])], doctors: [doctor('d1', 'physio')], config: config({}, { closedDays: [1] }), existing: [] });
    expect(r.placed).toHaveLength(0);
    expect(r.unplaced).toHaveLength(0);
  });

  test('Tuesday uses the shorter Tuesday hours', () => {
    expect(getBlocks(config(), TUESDAY)).toEqual(DEFAULT_CONFIG.tuesday);
    const slots = slotsForDay(config(), TUESDAY, 60);
    expect(Math.max(...slots.map(([s]) => s.getHours()))).toBeLessThan(13);
  });
});

describe('equipment', () => {
  const eq = [{ id: 'e1', name: 'VR kit', therapy: 'vr', available: true }];
  test('two doctors cannot use the single VR kit at the same time', () => {
    const patients = [patient('a', ['vr']), patient('b', ['vr'])];
    const doctors = [doctor('d1', 'vr'), doctor('d2', 'vr')];
    const { placed } = buildSchedule({ days: [MONDAY], patients, doctors, equipment: eq, config: config(), existing: [] });
    expect(placed).toHaveLength(2);
    expect(placed.every((s) => s.equipmentId === 'e1')).toBe(true);
    const [x, y] = placed;
    expect(sessionEnd(x) <= sessionStart(y) || sessionEnd(y) <= sessionStart(x)).toBe(true);
  });

  test('therapies with no equipment listed are not limited', () => {
    const { placed } = buildSchedule({ days: [MONDAY], patients: [patient('a', ['physio'])], doctors: [doctor('d1', 'physio')], equipment: eq, config: config(), existing: [] });
    expect(placed[0].equipmentId).toBeNull();
  });

  test('equipment that is all out of service blocks the therapy with a clear reason', () => {
    const broken = [{ ...eq[0], available: false }];
    const r = buildSchedule({ days: [MONDAY], patients: [patient('a', ['vr'])], doctors: [doctor('d1', 'vr')], equipment: broken, config: config(), existing: [] });
    expect(r.unplaced[0].reason).toBe('no equipment available');
  });

  test('pickEquipment skips units that are busy', () => {
    const sessions = [{ id: 's', status: 'scheduled', equipmentId: 'e1', startTime: atTime(MONDAY, '09:00').toISOString(), duration: 60 }];
    const two = [...eq, { id: 'e2', name: 'VR kit 2', therapy: 'vr', available: true }];
    const r = pickEquipment({ equipment: two, therapy: 'vr', startTime: atTime(MONDAY, '09:30').toISOString(), duration: 60, sessions });
    expect(r.id).toBe('e2');
    const none = pickEquipment({ equipment: eq, therapy: 'vr', startTime: atTime(MONDAY, '09:30').toISOString(), duration: 60, sessions });
    expect(none).toEqual({ needed: true, id: null });
  });
});

describe('doctor leave', () => {
  const leave = (part) => [{ date: '2026-10-12', part }];
  test('full-day leave moves sessions to the other doctor', () => {
    const doctors = [doctor('d1', 'physio', { leave: leave('full') }), doctor('d2', 'physio')];
    const { placed } = buildSchedule({ days: [MONDAY], patients: [patient('a', ['physio'])], doctors, config: config(), existing: [] });
    expect(placed[0].doctorId).toBe('d2');
  });

  test('if every doctor is off, the reason says so', () => {
    const r = buildSchedule({ days: [MONDAY], patients: [patient('a', ['physio'])], doctors: [doctor('d1', 'physio', { leave: leave('full') })], config: config(), existing: [] });
    expect(r.unplaced[0].reason).toBe('doctor on leave');
  });

  test('morning leave means only afternoon sessions, afternoon leave only morning', () => {
    const am = buildSchedule({ days: [MONDAY], patients: [patient('a', ['physio'])], doctors: [doctor('d1', 'physio', { leave: leave('am') })], config: config(), existing: [] });
    expect(sessionStart(am.placed[0]).getHours()).toBeGreaterThanOrEqual(13);
    const pm = buildSchedule({ days: [MONDAY], patients: [patient('a', ['physio'])], doctors: [doctor('d1', 'physio', { leave: leave('pm') })], config: config(), existing: [] });
    expect(sessionStart(pm.placed[0]).getHours()).toBeLessThan(13);
  });

  test('reassignAffected moves sessions only to a free doctor of the same therapy', () => {
    const doctors = [doctor('d1', 'physio'), doctor('d2', 'physio'), doctor('d3', 'speech')];
    const mk = (id, doctorId, hhmm) => ({ id, patientId: id, doctorId, therapy: 'physio', startTime: atTime(MONDAY, hhmm).toISOString(), duration: 60, status: 'scheduled' });
    const all = [mk('s1', 'd1', '09:00'), mk('s2', 'd1', '10:00'), mk('s3', 'd2', '09:00')];
    const { moves, failed } = reassignAffected({ affected: [all[0], all[1]], allSessions: all, doctors });
    expect(moves).toEqual([{ sessionId: 's2', doctorId: 'd2' }]); // d2 is busy at 09:00 but free at 10:00
    expect(failed.map((s) => s.id)).toEqual(['s1']);
  });

  test('sessionsAffected finds only upcoming scheduled sessions covered by the leave', () => {
    const s = (id, hhmm, status = 'scheduled') => ({ id, doctorId: 'd1', status, startTime: atTime(MONDAY, hhmm).toISOString(), duration: 60 });
    const list = [s('a', '09:00'), s('b', '14:15'), s('c', '10:00', 'attended')];
    const hit = sessionsAffected({ doctorId: 'd1', schedule: list, fromMs: 0, leave: { date: '2026-10-12', part: 'am' } });
    expect(hit.map((x) => x.id)).toEqual(['a']);
  });
});

describe('doctor-role support', () => {
  test('every new session carries the patient name (doctors cannot read the patient list)', () => {
    const { placed } = buildSchedule({ days: [MONDAY], patients: [patient('a', ['physio'])], doctors: [doctor('d1', 'physio')], config: config(), existing: [] });
    expect(placed[0].patientName).toBe('Patient a');
  });

  test('sessionsOnLeave finds upcoming sessions of doctors who are on leave or unavailable', () => {
    const docs = [doctor('d1', 'physio', { leave: [{ date: '2026-10-12', part: 'am' }] }), doctor('d2', 'physio', { available: false }), doctor('d3', 'physio')];
    const s = (id, doctorId, hhmm, status = 'scheduled') => ({ id, doctorId, status, startTime: atTime(MONDAY, hhmm).toISOString(), duration: 60 });
    const list = [s('a', 'd1', '09:00'), s('b', 'd1', '14:15'), s('c', 'd2', '10:00'), s('d', 'd3', '10:00'), s('e', 'd1', '09:00', 'cancelled')];
    expect(sessionsOnLeave({ schedule: list, doctors: docs, fromMs: 0 }).map((x) => x.id)).toEqual(['a', 'c']);
    expect(sessionsOnLeave({ schedule: list, doctors: docs, fromMs: atTime(MONDAY, '09:30').getTime() }).map((x) => x.id)).toEqual(['c']);
  });
});

describe('conflict checks', () => {
  const doctors = [doctor('d1', 'physio', { leave: [{ date: '2026-10-13', part: 'full' }] }), doctor('d2', 'speech')];
  const patients = [patient('a', ['physio']), patient('b', ['physio'])];
  const sessions = [{ id: 's1', patientId: 'a', doctorId: 'd1', therapy: 'physio', startTime: atTime(MONDAY, '09:00').toISOString(), duration: 60, status: 'scheduled', equipmentId: 'e1' }];
  const equipment = [{ id: 'e1', name: 'Robot', therapy: 'physio', available: true }];
  const check = (candidate, ignoreId = null) => findConflicts({ candidate, sessions, doctors, patients, equipment, config: config(), ignoreId }).map((c) => c.type);

  test('flags a double-booked doctor and a double-booked patient', () => {
    expect(check({ patientId: 'b', doctorId: 'd1', therapy: 'physio', startTime: atTime(MONDAY, '09:30').toISOString(), duration: 60 })).toContain('doctor');
    expect(check({ patientId: 'a', doctorId: 'd2', therapy: 'speech', startTime: atTime(MONDAY, '09:30').toISOString(), duration: 30 })).toContain('patient');
  });
  test('back-to-back sessions are fine', () => {
    expect(check({ patientId: 'b', doctorId: 'd1', therapy: 'physio', startTime: atTime(MONDAY, '10:00').toISOString(), duration: 60 })).toEqual([]);
  });
  test('flags busy equipment, leave, wrong therapy and out-of-hours', () => {
    expect(check({ patientId: 'b', doctorId: 'd1', therapy: 'physio', equipmentId: 'e1', startTime: atTime(MONDAY, '09:00').toISOString(), duration: 60 })).toContain('equipment');
    expect(check({ patientId: 'b', doctorId: 'd1', therapy: 'physio', startTime: atTime(TUESDAY, '09:00').toISOString(), duration: 60 })).toContain('leave');
    expect(check({ patientId: 'b', doctorId: 'd2', therapy: 'physio', startTime: atTime(MONDAY, '11:15').toISOString(), duration: 60 })).toContain('therapy');
    expect(check({ patientId: 'b', doctorId: 'd1', therapy: 'physio', startTime: atTime(MONDAY, '18:00').toISOString(), duration: 60 })).toContain('hours');
  });
  test('editing a session does not conflict with itself', () => {
    expect(check({ patientId: 'a', doctorId: 'd1', therapy: 'physio', equipmentId: 'e1', startTime: atTime(MONDAY, '09:15').toISOString(), duration: 60 }, 's1')).toEqual([]);
  });
});

describe('reschedule and plans', () => {
  test('findNextSlot skips slots before notBefore and full days', () => {
    const p = patient('a', ['physio']);
    const slot = findNextSlot({ fromDay: MONDAY, patient: p, therapy: 'physio', doctors: [doctor('d1', 'physio')], config: config(), existing: [], notBefore: atTime(MONDAY, '10:30').getTime() });
    expect(timeKey(sessionStart(slot))).toBe('11:15');
  });

  test('planDates picks the chosen weekdays for N weeks and skips closed days', () => {
    const dates = planDates({ startDay: MONDAY, weeks: 2, weekdays: [1, 3, 5] });
    expect(dates.map(dateKey)).toEqual(['2026-10-12', '2026-10-14', '2026-10-16', '2026-10-19', '2026-10-21', '2026-10-23']);
    expect(planDates({ startDay: MONDAY, weeks: 1, weekdays: [1, 3], closedDays: [3] }).map(dateKey)).toEqual(['2026-10-12']);
  });
});

describe('reports', () => {
  const s = (therapy, status, day, hhmm, doctorId = 'd1', duration = 60) => ({ therapy, status, doctorId, duration, startTime: atTime(parseDateKey(day), hhmm).toISOString() });
  const list = [s('physio', 'attended', '2026-10-12', '09:00'), s('physio', 'missed', '2026-10-12', '10:00'), s('speech', 'attended', '2026-10-14', '09:00', 'd2', 30), s('speech', 'cancelled', '2026-10-14', '10:00', 'd2', 30), s('physio', 'scheduled', '2026-10-20', '09:00')];

  test('attendance and missed rate ignore sessions that have not happened yet', () => {
    const st = attendanceStats(list);
    expect(st).toMatchObject({ attended: 2, missed: 1, cancelled: 1, scheduled: 1 });
    expect(st.missedRate).toBeCloseTo(1 / 3);
    expect(attendanceStats([s('physio', 'scheduled', '2026-10-12', '09:00')]).missedRate).toBeNull();
    expect(attendanceByTherapy(list).map((x) => x.therapy)).toEqual(['physio', 'speech']);
  });

  test('weekly counts group by Monday and exclude cancelled', () => {
    const rows = weeklyTherapyCounts(list);
    expect(rows.map((r) => r.weekStart)).toEqual(['2026-10-12', '2026-10-19']);
    expect(rows[0].counts).toEqual({ physio: 2, speech: 1 });
  });

  test('capacity drops with leave and utilization uses working days only', () => {
    const cfg = config();
    expect(capacityMinutes(cfg, MONDAY, doctor('d1', 'physio'))).toBe(120 + 120 + 165);
    expect(capacityMinutes(cfg, MONDAY, doctor('d1', 'physio', { leave: [{ date: '2026-10-12', part: 'full' }] }))).toBe(0);
    expect(capacityMinutes(cfg, MONDAY, doctor('d1', 'physio', { leave: [{ date: '2026-10-12', part: 'pm' }] }))).toBe(120 + 105); // 11:15-13:15 is split by the 13:00 cutoff
    const u = doctorUtilization({ sessions: list, doctors: [doctor('d1', 'physio'), doctor('d2', 'speech')], config: cfg, fromKey: '2026-10-12', toKey: '2026-10-25' });
    const d1 = u.find((x) => x.doctor.id === 'd1');
    expect(d1.sessions).toBe(3);
    expect(d1.workingDays).toBe(3);
    expect(d1.bookedMin).toBe(180);
  });
});

describe('sharing', () => {
  test('phone numbers become wa.me digits (India by default)', () => {
    expect(normalizePhone('98765 43210')).toBe('919876543210');
    expect(normalizePhone('+91 98765-43210')).toBe('919876543210');
    expect(normalizePhone('098765 43210')).toBe('919876543210');
    expect(normalizePhone('')).toBe('');
  });
  test('message lists the sessions in time order and the link is encoded', () => {
    const doctors = [doctor('d1', 'physio')];
    const sessions = [
      { doctorId: 'd1', therapy: 'speech', startTime: atTime(MONDAY, '11:15').toISOString(), duration: 30 },
      { doctorId: 'd1', therapy: 'physio', startTime: atTime(MONDAY, '09:00').toISOString(), duration: 60 }
    ];
    const msg = buildPatientMessage({ patient: patient('a', []), sessions, doctors, day: MONDAY });
    expect(msg.indexOf('09:00')).toBeLessThan(msg.indexOf('11:15'));
    expect(msg).toContain('Patient a');
    expect(whatsappUrl('9876543210', msg).startsWith('https://wa.me/919876543210?text=')).toBe(true);
  });
});

describe('randomized: every generated schedule is valid', () => {
  let seed = 7;
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
  test('300 random hospitals, week mode, with leave, equipment and closed days', () => {
    const T = ['physio', 'occupational', 'speech', 'vr', 'hand_robotic', 'gait_robotic', 'psychology'];
    const D = [15, 20, 30, 45, 60, 75, 90];
    let checked = 0;
    for (let run = 0; run < 300; run++) {
      const cfg = config(Object.fromEntries(T.map((t) => [t, D[Math.floor(rnd() * D.length)]])), { closedDays: rnd() > 0.7 ? [0] : [] });
      const doctors = [];
      T.forEach((t) => {
        for (let k = 0; k < 1 + Math.floor(rnd() * 2); k++) {
          const leave = rnd() > 0.7 ? [{ date: dateKey(new Date(2026, 9, 11 + Math.floor(rnd() * 7))), part: ['full', 'am', 'pm'][Math.floor(rnd() * 3)] }] : [];
          doctors.push(doctor(`${t}${k}`, t, { available: rnd() > 0.1, leave }));
        }
      });
      const equipment = ['vr', 'hand_robotic', 'gait_robotic'].flatMap((t) => (rnd() > 0.3 ? [{ id: `${t}-1`, name: t, therapy: t, available: true }] : []));
      const patients = Array.from({ length: 1 + Math.floor(rnd() * 12) }, (_, i) => {
        const ths = T.filter(() => rnd() > 0.65);
        if (!ths.length) ths.push('physio');
        return patient(`p${i}`, ths, { therapySlots: Object.fromEntries(ths.map((t) => [t, 1 + Math.floor(rnd() * 3)])) });
      });
      const days = Array.from({ length: 7 }, (_, i) => new Date(2026, 9, 11 + i));
      const { placed } = buildSchedule({ days, patients, doctors, equipment, config: cfg, existing: [] });
      const range = (s) => [sessionStart(s).getTime(), sessionEnd(s).getTime()];
      const clash = (list) => list.some((x, i) => list.some((y, j) => i < j && range(x)[0] < range(y)[1] && range(y)[0] < range(x)[1]));
      const by = (key) => placed.filter((s) => s[key]).reduce((m, s) => ((m[s[key]] ||= []).push(s), m), {});
      Object.values(by('doctorId')).forEach((l) => expect(clash(l)).toBe(false));
      Object.values(by('patientId')).forEach((l) => expect(clash(l)).toBe(false));
      Object.values(by('equipmentId')).forEach((l) => expect(clash(l)).toBe(false));
      for (const s of placed) {
        const start = sessionStart(s);
        const d = doctors.find((x) => x.id === s.doctorId);
        expect(d.available).toBe(true);
        expect(d.therapy).toBe(s.therapy);
        expect(cfg.closedDays).not.toContain(start.getDay());
        expect(findConflicts({ candidate: s, sessions: placed, doctors, patients, equipment, config: cfg, ignoreId: undefined }).filter((c) => ['leave', 'hours', 'unavailable', 'therapy'].includes(c.type))).toEqual([]);
        checked++;
      }
      // all-or-nothing per patient/therapy/day
      const groups = {};
      placed.forEach((s) => { const k = `${s.patientId}|${s.therapy}|${dateKey(sessionStart(s))}`; groups[k] = (groups[k] || 0) + 1; });
      Object.entries(groups).forEach(([k, n]) => {
        const [pid, th] = k.split('|');
        expect(n).toBe(patients.find((p) => p.id === pid).therapySlots[th]);
      });
    }
    expect(checked).toBeGreaterThan(1000);
  });
});

// keep the import used even if tests above change
test('requestsFromPatients expands one request per therapy', () => {
  expect(requestsFromPatients([patient('a', ['physio', 'speech'], { therapySlots: { speech: 2 } })]).map((r) => [r.therapy, r.slotCount])).toEqual([['physio', 1], ['speech', 2]]);
  expect(placeSessions({ day: MONDAY, requests: [], doctors: [], config: config() })).toEqual({ placed: [], unplaced: [] });
});
