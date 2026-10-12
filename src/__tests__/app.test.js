/**
 * Renders every page with sample data and clicks through the main actions.
 * Firebase is replaced by in-memory stand-ins, so nothing here talks to the network.
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';

// react-router v7 can't be loaded by Create React App's Jest 27 (it ignores package "exports"),
// so these tests use a tiny stand-in. The real router is exercised by the production build.
jest.mock(
  'react-router-dom',
  () => {
    const React = require('react');
    const Pass = ({ children }) => React.createElement(React.Fragment, null, children);
    return {
      MemoryRouter: Pass,
      BrowserRouter: Pass,
      Navigate: () => null,
      Route: () => null,
      Routes: ({ children }) => {
        const routes = React.Children.toArray(children);
        const home = routes.find((r) => r.props.path === '/');
        return home ? home.props.element : null;
      },
      NavLink: ({ to, className, children, onClick }) =>
        React.createElement('a', { href: to, onClick, className: typeof className === 'function' ? className({ isActive: false }) : className }, children)
    };
  },
  { virtual: true }
);
const { MemoryRouter } = require('react-router-dom');

// ---------- Firebase stand-ins ----------
const mockStore = { users: {}, patients: [], doctors: [], equipment: [], schedule: [], configDoc: null };
const mockCommit = jest.fn(() => Promise.resolve());
const mockBatch = { set: jest.fn(), update: jest.fn(), delete: jest.fn(), commit: (...a) => mockCommit(...a) };
let mockAuthUser = null;
let mockAuthCallbacks = [];

jest.mock('../firebase', () => ({ db: { __db: true }, auth: { __auth: true } }));
jest.mock('firebase/firestore', () => ({
  collection: jest.fn(),
  doc: jest.fn(),
  query: jest.fn(),
  where: jest.fn(),
  addDoc: jest.fn(),
  updateDoc: jest.fn(),
  deleteDoc: jest.fn(),
  setDoc: jest.fn(),
  writeBatch: jest.fn(),
  deleteField: jest.fn(),
  getDocs: jest.fn(),
  onSnapshot: jest.fn()
}));
jest.mock('../utils/adminAuth', () => ({
  createLogin: jest.fn(),
  sendPasswordEmail: jest.fn(),
  friendlyAuthError: (e) => (e && e.message) || 'error'
}));
jest.mock('firebase/auth', () => ({
  onAuthStateChanged: jest.fn(),
  signInWithEmailAndPassword: jest.fn(),
  signOut: jest.fn()
}));
jest.mock('exceljs', () => ({ __esModule: true, default: class { constructor() { this.xlsx = { writeBuffer: async () => new ArrayBuffer(1) }; } addWorksheet() { return { mergeCells() {}, getCell: () => ({}), getRow: () => ({ getCell: () => ({}) }), columns: [] }; } } }));
jest.mock('file-saver', () => ({ saveAs: jest.fn() }));

const firestore = require('firebase/firestore');
const fbAuth = require('firebase/auth');
const adminAuth = require('../utils/adminAuth');

// ---------- app imports (after mocks) ----------
const { AuthContext } = require('../context/AuthContext');
const { DataContext } = require('../context/DataContext');
const { default: App } = require('../App');
const { default: Dashboard } = require('../components/Dashboard');
const { default: Timetable } = require('../components/Timetable');
const { default: PrintSheets } = require('../components/PrintSheets');
const { default: Reports } = require('../components/Reports');
const { default: Export } = require('../components/Export');
const { default: Scheduler } = require('../components/Scheduler');
const { default: EditSchedule } = require('../components/EditSchedule');
const { default: Plans } = require('../components/Plans');
const { default: AddDoctor } = require('../components/AddDoctor');
const { default: AddPatient } = require('../components/AddPatient');
const { default: Equipment } = require('../components/Equipment');
const { default: TimeConfig } = require('../components/TimeSlotManager');
const { default: Sidebar } = require('../components/Sidebar');
const { default: Users } = require('../components/Users');
const { default: CheckIn } = require('../components/CheckIn');
const { default: MyLeave } = require('../components/MyLeave');
const { can: canRole } = require('../utils/permissions');
const { default: Login } = require('../components/Login');
const { buildSchedule, normalizeConfig, sessionStart } = require('../utils/scheduling');
const { dateKey, startOfDay } = require('../utils/timeUtils');

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// Create React App's Jest config uses resetMocks:true, which wipes implementations before each test,
// so they are (re)applied here in beforeEach.
function applyFirebaseMocks() {
  firestore.collection.mockImplementation((db, name) => ({ type: 'collection', name }));
  firestore.doc.mockImplementation((db, col, id) => ({ type: 'doc', col: col?.type === 'collection' ? col.name : col, id }));
  firestore.query.mockImplementation((ref) => ref);
  firestore.where.mockImplementation(() => ({}));
  firestore.addDoc.mockImplementation(() => Promise.resolve({ id: 'new' }));
  firestore.updateDoc.mockImplementation(() => Promise.resolve());
  firestore.deleteDoc.mockImplementation(() => Promise.resolve());
  firestore.setDoc.mockImplementation(() => Promise.resolve());
  firestore.writeBatch.mockImplementation(() => mockBatch);
  firestore.deleteField.mockImplementation(() => '__DELETE__');
  firestore.getDocs.mockImplementation(() => Promise.resolve({ docs: [] }));
  adminAuth.createLogin.mockImplementation(() => Promise.resolve('newuid'));
  adminAuth.sendPasswordEmail.mockImplementation(() => Promise.resolve());
  firestore.onSnapshot.mockImplementation((ref, ok) => {
    Promise.resolve().then(() => {
      if (ref.type === 'collection') {
        ok({ docs: (mockStore[ref.name] || []).map((d) => ({ id: d.id, data: () => { const { id, ...rest } = d; return rest; } })) });
      } else if (ref.col === 'users') {
        const u = mockStore.users[ref.id];
        ok({ exists: () => !!u, data: () => u });
      } else {
        ok({ exists: () => !!mockStore.configDoc, data: () => mockStore.configDoc });
      }
    });
    return () => {};
  });
  fbAuth.onAuthStateChanged.mockImplementation((auth, cb) => {
    mockAuthCallbacks.push(cb);
    Promise.resolve().then(() => cb(mockAuthUser));
    return () => {};
  });
  fbAuth.signInWithEmailAndPassword.mockImplementation(() => Promise.resolve());
  fbAuth.signOut.mockImplementation(() => Promise.resolve());
  mockBatch.commit = (...a) => mockCommit(...a);
  mockCommit.mockImplementation(() => Promise.resolve());
}

// ---------- sample data ----------
const config = normalizeConfig(null);
const doctors = [
  { id: 'd1', name: 'Dr Asha', therapy: 'physio', available: true, leave: [] },
  { id: 'd2', name: 'Dr Ben', therapy: 'physio', available: true, leave: [] },
  { id: 'd3', name: 'Dr Chitra', therapy: 'speech', available: true, leave: [] },
  { id: 'd4', name: 'Dr Dev', therapy: 'vr', available: true, leave: [] }
];
const patients = [
  { id: 'p1', name: 'Anil', phone: '98765 43210', therapies: ['physio', 'speech'] },
  { id: 'p2', name: 'Beena', therapies: ['physio'] },
  { id: 'p3', name: 'Chandran', therapies: ['vr'] }
];
const equipment = [{ id: 'e1', name: 'VR kit 1', therapy: 'vr', available: true }];
const today = startOfDay(new Date());
const makeSessions = () =>
  buildSchedule({ days: [today], patients, doctors, equipment, config, existing: [] }).placed.map((s, i) => ({ id: `s${i}`, ...s }));

// What each role really receives (mirrors DataContext): doctors get no patient list and only their own sessions,
// and only some roles get phone numbers.
const dataValue = (schedule, role = 'admin', doctorId = null) => {
  const seesPatients = canRole(role, 'patients.read');
  const seesPhones = canRole(role, 'patients.contacts');
  const visibleSchedule = role === 'doctor' ? schedule.filter((s) => s.doctorId === doctorId) : schedule;
  const visiblePatients = seesPatients ? patients.map((p) => ({ ...p, phone: seesPhones ? p.phone || '' : '' })) : [];
  const names = {};
  patients.forEach((p) => { names[p.id] = p.name; });
  return {
    patients: visiblePatients, doctors, equipment, schedule: visibleSchedule, config, loading: false, error: '',
    patientName: (id) => names[id] || 'Unknown patient',
    doctorName: (id) => doctors.find((d) => d.id === id)?.name || 'Unknown doctor',
    equipmentName: (id) => equipment.find((e) => e.id === id)?.name || '',
    phoneOf: (id) => (seesPhones ? patients.find((p) => p.id === id)?.phone || '' : '')
  };
};
const authValue = (role = 'admin', doctorId = null) => ({
  user: { email: 'staff@hospital.test', uid: 'u1' }, profile: { name: 'Test Person', role }, role, doctorId,
  isAdmin: role === 'admin', can: (a) => canRole(role, a), loading: false, inactive: false,
  logout: jest.fn(), login: jest.fn(() => Promise.resolve())
});

// ---------- tiny DOM helpers ----------
let container;
let root;
const render = async (ui, { role = 'admin', doctorId = null, schedule = makeSessions() } = {}) => {
  await act(async () => {
    root.render(
      <MemoryRouter>
        <AuthContext.Provider value={authValue(role, doctorId)}>
          <DataContext.Provider value={dataValue(schedule, role, doctorId)}>{ui}</DataContext.Provider>
        </AuthContext.Provider>
      </MemoryRouter>
    );
  });
};
const text = () => container.textContent;
const buttons = (label) => [...container.querySelectorAll('button')].filter((b) => b.textContent.includes(label));
const click = async (el) => { await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); }); };
const clickBtn = async (label, i = 0) => { const b = buttons(label)[i]; if (!b) throw new Error(`no button "${label}"`); await click(b); };
const setValue = async (el, value) => {
  const proto = el.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  await act(async () => {
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value);
    el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
  });
};

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  jest.clearAllMocks();
  applyFirebaseMocks();
  window.alert = jest.fn();
  window.confirm = jest.fn(() => true);
  window.open = jest.fn();
  window.print = jest.fn();
  mockAuthUser = null;
  mockAuthCallbacks = [];
  Object.assign(mockStore, { users: {}, patients, doctors, equipment, schedule: [], configDoc: null });
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('every page renders with data', () => {
  test('Dashboard shows today\'s numbers, doctors and up-next list', async () => {
    await render(<Dashboard />);
    expect(text()).toContain('Sessions today');
    expect(text()).toContain('Dr Asha');
    expect(text()).toContain('Up next');
    expect(text()).toMatch(/Equipment today/);
  });
  test('Timetable shows doctor columns and one block per session', async () => {
    const schedule = makeSessions();
    await render(<Timetable />, { schedule });
    expect(container.querySelectorAll('.tt-col').length).toBe(doctors.length);
    expect(container.querySelectorAll('.tt-session').length).toBe(schedule.length);
    expect(text()).toContain('Dr Chitra');
  });
  test('Print sheets: doctor and patient modes, print and WhatsApp', async () => {
    await render(<PrintSheets />);
    expect(container.querySelectorAll('.print-sheet').length).toBeGreaterThan(0);
    await clickBtn('Print / Save as PDF');
    expect(window.print).toHaveBeenCalled();
    const [modeSelect] = container.querySelectorAll('select');
    await setValue(modeSelect, 'patient');
    await clickBtn('WhatsApp', 0);
    expect(window.open.mock.calls[0][0]).toMatch(/^https:\/\/wa\.me\/(919876543210)?\?text=/);
  });
  test('Reports renders all four sections', async () => {
    await render(<Reports />);
    ['Doctor utilization', 'Attendance by therapy', 'Sessions per therapy per week', 'Missed rate'].forEach((t) => expect(text()).toContain(t));
  });
  test('Export, Equipment, Plans, EditSchedule, AddPatient, AddDoctor, TimeConfig render', async () => {
    for (const ui of [<Export />, <Equipment />, <Plans />, <EditSchedule />, <AddPatient />, <AddDoctor />, <TimeConfig />]) {
      await render(ui);
      expect(container.textContent.length).toBeGreaterThan(20);
    }
    expect(window.alert).not.toHaveBeenCalled();
  });
  test('works with an empty hospital (no data yet)', async () => {
    const emptyData = { ...dataValue([]), patients: [], doctors: [], equipment: [] };
    for (const ui of [<Dashboard />, <Timetable />, <PrintSheets />, <Reports />, <Scheduler />, <EditSchedule />, <Plans />, <AddDoctor />, <Equipment />]) {
      await act(async () => {
        root.render(<MemoryRouter><AuthContext.Provider value={authValue()}><DataContext.Provider value={emptyData}>{ui}</DataContext.Provider></AuthContext.Provider></MemoryRouter>);
      });
      expect(container.textContent.length).toBeGreaterThan(5);
    }
  });
});

describe('roles: what each person sees', () => {
  const links = () => [...container.querySelectorAll('.sidebar-link')].map((a) => a.getAttribute('href'));

  test('sidebar shows only the pages each role may open', async () => {
    const expected = {
      admin: ['/', '/timetable', '/check-in', '/print', '/reports', '/export', '/schedule', '/edit-schedule', '/plans', '/add-doctor', '/add-patient', '/equipment', '/time-config', '/users'],
      scheduler: ['/', '/timetable', '/check-in', '/print', '/reports', '/export', '/schedule', '/edit-schedule', '/plans', '/add-doctor', '/add-patient', '/equipment'],
      doctor: ['/', '/timetable', '/check-in', '/print', '/my-leave'],
      reception: ['/', '/timetable', '/check-in', '/print'],
      manager: ['/', '/reports', '/export']
    };
    for (const [role, hrefs] of Object.entries(expected)) {
      await render(<Sidebar />, { role, doctorId: role === 'doctor' ? 'd1' : null });
      expect(links()).toEqual(hrefs);
    }
  });

  test('sidebar shows the person\'s name and role label', async () => {
    await render(<Sidebar />, { role: 'reception' });
    expect(text()).toContain('Test Person');
    expect(text()).toContain('Reception');
  });

  test('manager sees no WhatsApp, no status buttons and no phone numbers', async () => {
    await render(<AddPatient />, { role: 'manager' });
    expect(text()).not.toContain('98765');
  });

  test('doctor: timetable shows only their own column and no drag, no edit controls', async () => {
    const schedule = makeSessions();
    await render(<Timetable />, { role: 'doctor', doctorId: 'd2', schedule });
    expect(container.querySelectorAll('.tt-col').length).toBe(1);
    expect(text()).toContain('Dr Ben');
    expect(text()).not.toContain('Dr Asha');
    expect(container.querySelector('.tt-session[draggable="true"]')).toBeNull();
    await click(container.querySelector('.tt-session'));
    expect(buttons('Attended').length + buttons('Missed').length).toBeGreaterThan(0);
    ['Cancel session', 'Reschedule', 'Save move', 'WhatsApp'].forEach((l) => expect(buttons(l).length).toBe(0));
  });

  test('doctor: dashboard is "My day" with only their own numbers and no patient list', async () => {
    await render(<Dashboard />, { role: 'doctor', doctorId: 'd2' });
    expect(text()).toContain('My day');
    expect(text()).not.toContain('Patients with no session today');
    expect(text()).not.toContain('Dr Asha');
  });

  test('doctor: check-in lists only their sessions, can tick them but cannot cancel', async () => {
    await render(<CheckIn />, { role: 'doctor', doctorId: 'd2' });
    const doctorsInTable = [...container.querySelectorAll('tbody tr')].filter((r) => r.textContent.includes('Dr '));
    expect(doctorsInTable.length).toBe(0); // the doctor column is hidden for doctors
    expect(buttons('Attended').length).toBeGreaterThan(0);
    expect(buttons('Cancel').length).toBe(0);
    expect(buttons('💬').length).toBe(0); // no phone numbers for doctors
  });

  test('doctor: print page offers only their own sheet', async () => {
    await render(<PrintSheets />, { role: 'doctor', doctorId: 'd2' });
    expect(container.querySelectorAll('select').length).toBe(1); // only the "which doctor" picker, no patient mode
    expect(container.querySelectorAll('.print-sheet').length).toBe(1);
    expect(container.querySelector('.print-sheet').textContent).toContain('Dr Ben');
  });

  test('reception: can check patients in and send reminders but not cancel, move or reschedule', async () => {
    await render(<Timetable />, { role: 'reception' });
    expect(container.querySelector('.tt-session[draggable="true"]')).toBeNull();
    await click(container.querySelector('.tt-session'));
    expect(buttons('WhatsApp reminder').length).toBe(1);
    expect(buttons('Attended').length).toBe(1);
    ['Cancel session', 'Reschedule', 'Save move'].forEach((l) => expect(buttons(l).length).toBe(0));
  });

  test('reception cannot bring back a cancelled session', async () => {
    const schedule = makeSessions();
    schedule[0] = { ...schedule[0], status: 'cancelled' };
    await render(<CheckIn />, { role: 'reception', schedule });
    // cancelled sessions are not even listed in check-in
    expect([...container.querySelectorAll('tbody tr')].length).toBe(schedule.length - 1);
  });

  test('scheduling staff: can edit sessions but cannot add or delete doctors, equipment or patients', async () => {
    await render(<AddDoctor />, { role: 'scheduler' });
    expect(text()).toContain('Doctors & Leave');
    expect(container.querySelector('input[placeholder="Doctor Name"]')).toBeNull();
    expect(buttons('Delete').length).toBe(0);
    expect(buttons('Leave').length).toBeGreaterThan(0);
    await render(<Equipment />, { role: 'scheduler' });
    expect(container.querySelector('input[type="text"]')).toBeNull();
    expect(buttons('Delete').length).toBe(0);
    expect(buttons('out of service').length).toBeGreaterThan(0);
    await render(<AddPatient />, { role: 'scheduler' });
    expect(buttons('Edit').length).toBeGreaterThan(0);
    expect(buttons('Delete').length).toBe(0);
  });

  test('admin sees every control', async () => {
    await render(<AddDoctor />);
    expect(container.querySelector('input[placeholder="Doctor Name"]')).not.toBeNull();
    expect(buttons('Delete').length).toBeGreaterThan(0);
    await render(<AddPatient />);
    expect(buttons('Delete').length).toBeGreaterThan(0);
  });
});

describe('actions', () => {
  test('Scheduler: generate replaces only "scheduled" sessions and keeps history', async () => {
    const existing = makeSessions();
    existing[0] = { ...existing[0], status: 'attended' };
    await render(<Scheduler />, { schedule: existing });
    await clickBtn('Generate Schedule');
    expect(window.confirm).toHaveBeenCalled(); // asks before replacing
    expect(mockCommit).toHaveBeenCalled();
    const deletes = mockBatch.delete.mock.calls.length;
    expect(deletes).toBe(existing.length - 1); // the attended one is not deleted
    expect(text()).toContain('Created');
  });
  test('Scheduler: manual add warns about a clash and respects "No"', async () => {
    const schedule = makeSessions();
    await render(<Scheduler />, { schedule });
    const first = schedule.find((s) => s.therapy === 'physio');
    const selects = container.querySelectorAll('.card select');
    await setValue(selects[0], first.patientId === 'p1' ? 'p2' : 'p1');
    await setValue(selects[1], 'physio');
    await setValue(selects[2], first.doctorId);
    const dt = container.querySelector('input[type="datetime-local"]');
    const s = sessionStart(first);
    await setValue(dt, `${dateKey(s)}T${String(s.getHours()).padStart(2, '0')}:${String(s.getMinutes()).padStart(2, '0')}`);
    window.confirm.mockReturnValueOnce(false);
    await clickBtn('Add Slot');
    expect(window.confirm.mock.calls[0][0]).toContain('already booked');
    expect(firestore.addDoc).not.toHaveBeenCalled();
  });
  test('Timetable: mark attended', async () => {
    await render(<Timetable />);
    await click(container.querySelector('.tt-session'));
    await clickBtn('Attended');
    const call = firestore.updateDoc.mock.calls.find(([, data]) => data.status === 'attended');
    expect(call).toBeTruthy();
  });
  test('Timetable: drag a session to another doctor and time', async () => {
    const schedule = makeSessions();
    await render(<Timetable />, { schedule });
    const cols = container.querySelectorAll('.tt-col');
    const fromCol = [...cols].findIndex((c) => c.querySelector('.tt-session'));
    const session = cols[fromCol].querySelector('.tt-session');
    const dt = { data: {}, setData(k, v) { this.data[k] = v; }, getData(k) { return this.data[k]; }, effectAllowed: '' };
    const fire = async (el, type, props = {}) => act(async () => {
      const ev = new MouseEvent(type, { bubbles: true, cancelable: true, ...props });
      Object.defineProperty(ev, 'dataTransfer', { value: dt });
      el.dispatchEvent(ev);
    });
    await fire(session, 'dragstart', { clientY: 0 });
    const target = cols[1 - fromCol > -1 && fromCol !== 1 ? 1 : 0];
    await fire(target, 'dragover');
    await fire(target, 'drop', { clientY: 130 }); // 130px / 1.3 = 100 minutes after the top of the grid
    const moved = firestore.updateDoc.mock.calls.find(([ref, data]) => ref.col === 'schedule' && data.startTime);
    expect(moved).toBeTruthy();
    const newStart = new Date(moved[1].startTime);
    expect(newStart.getMinutes() % 15).toBe(0);
    expect(newStart.getHours()).toBe(10); // 9:00 grid start + 100 min, snapped to a quarter hour
  });
  const at = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); const d = new Date(today); d.setHours(h, m, 0, 0); return d.toISOString(); };
  const physioSession = (id, patientId, doctorId, hhmm) => ({ id, patientId, doctorId, therapy: 'physio', startTime: at(hhmm), duration: 60, status: 'scheduled' });

  test('AddDoctor: adding leave offers to move the affected sessions to a free doctor', async () => {
    const schedule = [physioSession('x1', 'p1', 'd1', '09:00')]; // Dr Ben (d2) is free then
    await render(<AddDoctor />, { schedule });
    await click(buttons('Leave')[0]); // Dr Asha is listed first
    await setValue(container.querySelector('input[type="date"]'), dateKey(today));
    await clickBtn('Add leave');
    const leaveUpdate = firestore.updateDoc.mock.calls.find(([, d]) => Array.isArray(d.leave) && d.leave.length === 1);
    expect(leaveUpdate[1].leave[0]).toEqual({ date: dateKey(today), part: 'full' });
    expect(window.confirm.mock.calls[0][0]).toContain('can be moved');
    expect(mockBatch.update).toHaveBeenCalledWith({ type: 'doc', col: 'schedule', id: 'x1' }, { doctorId: 'd2' });
    expect(mockCommit).toHaveBeenCalled();
  });

  test('AddDoctor: when nobody else is free the app says so and moves nothing', async () => {
    const schedule = [physioSession('x1', 'p1', 'd1', '09:00'), physioSession('x2', 'p2', 'd2', '09:00')];
    await render(<AddDoctor />, { schedule });
    await click(buttons('Leave')[0]);
    await setValue(container.querySelector('input[type="date"]'), dateKey(today));
    await clickBtn('Add leave');
    expect(window.alert.mock.calls[0][0]).toContain('None can be moved automatically');
    expect(mockCommit).not.toHaveBeenCalled();
  });

  test('AddDoctor: marking a doctor unavailable also offers to move their upcoming sessions', async () => {
    const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1); tomorrow.setHours(10, 0, 0, 0);
    const schedule = [{ ...physioSession('x1', 'p1', 'd1', '09:00'), startTime: tomorrow.toISOString() }];
    await render(<AddDoctor />, { schedule });
    await clickBtn('Mark Unavailable', 0);
    expect(firestore.updateDoc.mock.calls[0][1]).toEqual({ available: false });
    expect(mockBatch.update).toHaveBeenCalledWith({ type: 'doc', col: 'schedule', id: 'x1' }, { doctorId: 'd2' });
  });

  test('Time Config saves slots as objects (Firestore rejects arrays of arrays)', async () => {
    await render(<TimeConfig />);
    await clickBtn('Save Config');
    const [, payload] = firestore.setDoc.mock.calls[0];
    expect(payload.default[0]).toEqual({ start: '09:00', end: '11:00' });
    expect(Array.isArray(payload.default[0])).toBe(false);
    expect(payload.durations.speech).toBe(30);
    expect(payload.closedDays).toEqual([]);
  });
  test('Plans: preview then save creates sessions with a planId', async () => {
    await render(<Plans />, { schedule: [] });
    const [patientSel, therapySel] = container.querySelectorAll('select');
    await setValue(patientSel, 'p2');
    await setValue(therapySel, 'physio');
    await clickBtn('Preview plan');
    expect(text()).toContain('can be booked');
    await clickBtn('Save plan');
    expect(mockCommit).toHaveBeenCalled();
    const added = mockBatch.set.mock.calls.map(([, data]) => data);
    expect(added.length).toBeGreaterThan(5);
    expect(new Set(added.map((a) => a.planId)).size).toBe(1);
  });
  test('Equipment: add a unit', async () => {
    await render(<Equipment />);
    await setValue(container.querySelector('input[type="text"]'), 'Gait robot');
    await setValue(container.querySelector('select'), 'gait_robotic');
    await clickBtn('Add equipment');
    expect(firestore.addDoc.mock.calls[0][1]).toEqual({ name: 'Gait robot', therapy: 'gait_robotic', available: true });
  });
  test('EditSchedule: cancel a session and book a replacement for a missed one', async () => {
    const schedule = makeSessions();
    schedule[0] = { ...schedule[0], status: 'missed', startTime: new Date(Date.now() - 3600000).toISOString() };
    await render(<EditSchedule />, { schedule });
    await clickBtn('Cancel', 0);
    expect(firestore.updateDoc.mock.calls.some(([, d]) => d.status === 'cancelled')).toBe(true);
  });
});

describe('real AuthContext + DataContext through <App />', () => {
  const mountApp = async () => { await act(async () => { root.render(<App />); }); await act(async () => {}); await act(async () => {}); };

  test('signed out -> login form; wrong password shows a friendly message', async () => {
    await mountApp();
    expect(text()).toContain('Sign in');
    fbAuth.signInWithEmailAndPassword.mockImplementationOnce(() => Promise.reject({ code: 'auth/invalid-credential' }));
    const [email, pass] = container.querySelectorAll('input');
    await setValue(email, 'a@b.co');
    await setValue(pass, 'nope');
    await act(async () => { container.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
    expect(text()).toContain('Wrong email or password');
  });
  test('signed in without a role -> "No access yet"', async () => {
    mockAuthUser = { uid: 'u9', email: 'new@hospital.test' };
    await mountApp();
    expect(text()).toContain('No access yet');
  });
  test('signed in as admin -> dashboard loads live data', async () => {
    mockAuthUser = { uid: 'u1', email: 'boss@hospital.test' };
    mockStore.users.u1 = { role: 'admin' };
    mockStore.schedule = makeSessions();
    await mountApp();
    expect(text()).toContain('Dashboard');
    expect(text()).toContain('boss@hospital.test');
    expect(text()).toContain('Time Config');
  });
  test('signed in as viewer -> no admin links', async () => {
    mockAuthUser = { uid: 'u2', email: 'view@hospital.test' };
    mockStore.users.u2 = { role: 'viewer' };
    await mountApp();
    expect(text()).toContain('Dashboard');
    expect(text()).not.toContain('Time Config');
  });
});

describe('account states and what each role is allowed to load', () => {
  const mountApp = async () => { await act(async () => { root.render(<App />); }); await act(async () => {}); await act(async () => {}); };
  const collectionsRead = () => firestore.collection.mock.calls.map((c) => c[1]);

  test('a deactivated account is told so and loads no data', async () => {
    mockAuthUser = { uid: 'u3', email: 'gone@hospital.test' };
    mockStore.users.u3 = { role: 'admin', active: false };
    await mountApp();
    expect(text()).toContain('Account deactivated');
    expect(collectionsRead()).not.toContain('patients');
  });

  test('a doctor login that is not linked to a doctor record cannot continue', async () => {
    mockAuthUser = { uid: 'u4', email: 'dr@hospital.test' };
    mockStore.users.u4 = { role: 'doctor' };
    await mountApp();
    expect(text()).toContain('Not linked to a doctor yet');
  });

  test('an unknown role string gets no access', async () => {
    mockAuthUser = { uid: 'u5', email: 'odd@hospital.test' };
    mockStore.users.u5 = { role: 'superhero' };
    await mountApp();
    expect(text()).toContain('No access yet');
  });

  test('old "viewer" accounts keep working as read-only managers', async () => {
    mockAuthUser = { uid: 'u2', email: 'view@hospital.test' };
    mockStore.users.u2 = { role: 'viewer' };
    await mountApp();
    expect(text()).toContain('Manager');
    expect(container.querySelector('a[href="/reports"]')).not.toBeNull();
    expect(container.querySelector('a[href="/schedule"]')).toBeNull();
  });

  test('a doctor only asks for their own sessions and never touches patients or phone numbers', async () => {
    mockAuthUser = { uid: 'u6', email: 'asha@hospital.test' };
    mockStore.users.u6 = { role: 'doctor', doctorId: 'd1', name: 'Dr Asha' };
    mockStore.schedule = makeSessions();
    await mountApp();
    expect(text()).toContain('My day');
    expect(collectionsRead()).not.toContain('patients');
    expect(collectionsRead()).not.toContain('patientContacts');
    expect(firestore.where.mock.calls).toEqual(expect.arrayContaining([['doctorId', '==', 'd1']]));
  });

  test('reception loads patients and phone numbers; a manager loads patients but not phone numbers', async () => {
    mockAuthUser = { uid: 'u7', email: 'desk@hospital.test' };
    mockStore.users.u7 = { role: 'reception' };
    await mountApp();
    expect(collectionsRead()).toEqual(expect.arrayContaining(['patients', 'patientContacts']));
    act(() => root.unmount());
    root = createRoot(container);
    jest.clearAllMocks();
    applyFirebaseMocks();
    mockAuthUser = { uid: 'u8', email: 'mgr@hospital.test' };
    mockStore.users.u8 = { role: 'manager' };
    await mountApp();
    expect(collectionsRead()).toContain('patients');
    expect(collectionsRead()).not.toContain('patientContacts');
  });
});

describe('Users & Roles page (admin)', () => {
  const fill = async (name, email, role, doctor) => {
    const card = container.querySelector('.card'); // the "Create a login" card
    const [nameInput, emailInput] = card.querySelectorAll('input');
    await setValue(nameInput, name);
    await setValue(emailInput, email);
    await setValue(card.querySelectorAll('select')[0], role);
    if (doctor) await setValue(card.querySelectorAll('select')[1], doctor);
  };
  const existing = [
    { id: 'u1', name: 'Me Admin', email: 'me@hospital.test', role: 'admin', active: true },
    { id: 'u9', name: 'Sam Scheduler', email: 'sam@hospital.test', role: 'scheduler', active: true },
    { id: 'u10', name: 'Old Viewer', email: 'old@hospital.test', role: 'viewer' }
  ];
  const renderUsers = async () => {
    mockStore.users = {};
    firestore.onSnapshot.mockImplementation((ref, ok) => {
      Promise.resolve().then(() => ref.name === 'users' && ok({ docs: existing.map((u) => ({ id: u.id, data: () => { const { id, ...rest } = u; return rest; } })) }));
      return () => {};
    });
    await render(<Users />);
    await act(async () => {});
  };

  test('creates a login, saves the role document and emails a password link', async () => {
    await renderUsers();
    await fill('Nina Nurse', ' Nina@Hospital.TEST ', 'reception');
    await clickBtn('Create login');
    expect(adminAuth.createLogin).toHaveBeenCalledWith('nina@hospital.test');
    const [ref, data] = firestore.setDoc.mock.calls[0];
    expect(ref).toEqual({ type: 'doc', col: 'users', id: 'newuid' });
    expect(data).toMatchObject({ name: 'Nina Nurse', email: 'nina@hospital.test', role: 'reception', active: true, createdBy: 'u1' });
    expect('doctorId' in data).toBe(false);
    expect(Object.values(data).includes(undefined)).toBe(false); // Firestore rejects undefined
    expect(adminAuth.sendPasswordEmail).toHaveBeenCalledWith('nina@hospital.test');
    expect(text()).toContain('Login created for nina@hospital.test');
  });

  test('a doctor login must be linked to a doctor record and stores the link', async () => {
    await renderUsers();
    await fill('Dr New', 'new@hospital.test', 'doctor');
    await clickBtn('Create login');
    expect(text()).toContain('Choose which doctor');
    expect(adminAuth.createLogin).not.toHaveBeenCalled();
    await fill('Dr New', 'new@hospital.test', 'doctor', 'd3');
    await clickBtn('Create login');
    expect(firestore.setDoc.mock.calls[0][1]).toMatchObject({ role: 'doctor', doctorId: 'd3' });
  });

  test('bad input is rejected before anything is created', async () => {
    await renderUsers();
    await fill('', 'x@y.co', 'scheduler');
    await clickBtn('Create login');
    expect(text()).toContain('enter the person');
    await fill('Name', 'not-an-email', 'scheduler');
    await clickBtn('Create login');
    expect(text()).toContain('valid email');
    expect(adminAuth.createLogin).not.toHaveBeenCalled();
  });

  test('if the email already has a login the admin gets a clear explanation', async () => {
    await renderUsers();
    adminAuth.createLogin.mockImplementationOnce(() => Promise.reject({ message: 'That email already has a login.' }));
    await fill('Dup', 'dup@hospital.test', 'scheduler');
    await clickBtn('Create login');
    expect(text()).toContain('already has a login');
    expect(firestore.setDoc).not.toHaveBeenCalled();
  });

  test('lists everyone, treats legacy viewers as managers, and protects the admin\'s own row', async () => {
    await renderUsers();
    expect(text()).toContain('Sam Scheduler');
    expect(text()).toContain('Manager (read-only)'); // the old "viewer"
    const myRow = [...container.querySelectorAll('tbody tr')].find((r) => r.textContent.includes('Me Admin'));
    expect(myRow.textContent).toContain('(you)');
    expect(myRow.querySelectorAll('button').length).toBe(0);
  });

  test('deactivate, reactivate-style updates and role changes write only the fields they should', async () => {
    await renderUsers();
    const sam = () => [...container.querySelectorAll('tbody tr')].find((r) => r.textContent.includes('Sam Scheduler'));
    await click([...sam().querySelectorAll('button')].find((b) => b.textContent === 'Deactivate'));
    expect(firestore.updateDoc).toHaveBeenCalledWith({ type: 'doc', col: 'users', id: 'u9' }, { active: false });
    await click([...sam().querySelectorAll('button')].find((b) => b.textContent === 'Change role'));
    await setValue(sam().querySelector('select'), 'manager');
    await click([...sam().querySelectorAll('button')].find((b) => b.textContent === 'Save'));
    expect(firestore.updateDoc).toHaveBeenCalledWith({ type: 'doc', col: 'users', id: 'u9' }, { role: 'manager', doctorId: '__DELETE__' });
  });

  test('sends a password email on request and removes access after confirmation', async () => {
    await renderUsers();
    const sam = () => [...container.querySelectorAll('tbody tr')].find((r) => r.textContent.includes('Sam Scheduler'));
    await click([...sam().querySelectorAll('button')].find((b) => b.textContent === 'Send password email'));
    expect(adminAuth.sendPasswordEmail).toHaveBeenCalledWith('sam@hospital.test');
    await click([...sam().querySelectorAll('button')].find((b) => b.textContent === 'Remove'));
    expect(window.confirm).toHaveBeenCalled();
    expect(firestore.deleteDoc).toHaveBeenCalledWith({ type: 'doc', col: 'users', id: 'u9' });
  });

  test('"Add an existing login" saves a role for a UID from the Firebase console', async () => {
    await renderUsers();
    await click(container.querySelectorAll('h4')[2]); // expand
    const inputs = [...container.querySelectorAll('input')].filter((i) => i.placeholder === 'UID');
    await setValue(inputs[0], 'abc123uid');
    const section = inputs[0].closest('.card');
    const [name, email] = [...section.querySelectorAll('input')].slice(1);
    await setValue(name, 'Console Person');
    await setValue(email, 'console@hospital.test');
    await click([...section.querySelectorAll('button')].find((b) => b.textContent === 'Save role'));
    expect(firestore.setDoc.mock.calls[0][0]).toEqual({ type: 'doc', col: 'users', id: 'abc123uid' });
    expect(firestore.setDoc.mock.calls[0][1]).toMatchObject({ name: 'Console Person', role: 'scheduler' });
  });

  test('tidy-up: moves phone numbers off the patient records into the restricted collection', async () => {
    await renderUsers();
    firestore.getDocs.mockImplementation(() => Promise.resolve({ docs: [
      { id: 'p1', data: () => ({ name: 'Anil', phone: '98765 43210' }) },
      { id: 'p2', data: () => ({ name: 'Beena' }) },
      { id: 'p3', data: () => ({ name: 'Chandran', phone: '' }) }
    ] }));
    await clickBtn('Move patient phone numbers');
    expect(mockBatch.set).toHaveBeenCalledWith({ type: 'doc', col: 'patientContacts', id: 'p1' }, { phone: '98765 43210' });
    expect(mockBatch.update).toHaveBeenCalledWith({ type: 'doc', col: 'patients', id: 'p1' }, { phone: '__DELETE__' });
    expect(mockBatch.update).toHaveBeenCalledWith({ type: 'doc', col: 'patients', id: 'p3' }, { phone: '__DELETE__' });
    expect(mockBatch.update).not.toHaveBeenCalledWith({ type: 'doc', col: 'patients', id: 'p2' }, expect.anything());
    expect(text()).toContain('Moved 1 phone number');
  });

  test('tidy-up: adds patient names to older sessions', async () => {
    const old = makeSessions().map((s) => { const { patientName, ...rest } = s; return rest; });
    mockStore.users = {};
    firestore.onSnapshot.mockImplementation((ref, ok) => { Promise.resolve().then(() => ref.name === 'users' && ok({ docs: [] })); return () => {}; });
    await render(<Users />, { schedule: old });
    await clickBtn('Add patient names to older sessions');
    expect(mockBatch.update.mock.calls.length).toBe(old.length);
    expect(mockBatch.update.mock.calls[0][1]).toHaveProperty('patientName');
  });
});

describe('check-in, my leave, patients and the dashboard alert', () => {
  test('reception ticks a patient attended and missed from the check-in list', async () => {
    await render(<CheckIn />, { role: 'reception' });
    await clickBtn('Attended', 0);
    await clickBtn('Missed', 0);
    const statuses = firestore.updateDoc.mock.calls.map(([, d]) => d.status);
    expect(statuses).toEqual(expect.arrayContaining(['attended', 'missed']));
    expect(buttons('💬').length).toBeGreaterThan(0);
    await clickBtn('💬', 0);
    expect(window.open.mock.calls[0][0]).toMatch(/^https:\/\/wa\.me\//);
  });

  test('a doctor adds and removes their own leave and is warned about sessions inside it', async () => {
    const schedule = makeSessions();
    const mine = schedule.find((s) => s.doctorId === 'd1');
    await render(<MyLeave />, { role: 'doctor', doctorId: 'd1', schedule });
    await setValue(container.querySelector('input[type="date"]'), dateKey(today));
    await clickBtn('Add leave');
    const [ref, data] = firestore.updateDoc.mock.calls[0];
    expect(ref).toEqual({ type: 'doc', col: 'doctors', id: 'd1' });
    expect(data).toEqual({ leave: [{ date: dateKey(today), part: 'full' }] });
    expect(mine).toBeTruthy();
  });

  test('my leave shows the sessions that clash and tells the scheduling staff will move them', async () => {
    const schedule = makeSessions();
    const withLeave = { ...dataValue(schedule, 'doctor', 'd1') };
    withLeave.doctors = doctors.map((d) => (d.id === 'd1' ? { ...d, leave: [{ date: dateKey(today), part: 'full' }] } : d));
    await act(async () => {
      root.render(<MemoryRouter><AuthContext.Provider value={authValue('doctor', 'd1')}><DataContext.Provider value={withLeave}><MyLeave /></DataContext.Provider></AuthContext.Provider></MemoryRouter>);
    });
    expect(text()).toContain('fall inside this leave');
    expect(text()).toContain('scheduling staff');
  });

  test('adding a patient stores the phone number in patientContacts, not on the patient', async () => {
    await render(<AddPatient />);
    await setValue(container.querySelector('input[type="text"]'), 'New Person');
    await setValue(container.querySelector('input[type="tel"]'), '99999 11111');
    await clickBtn('Add Patient');
    const [, patientDoc] = firestore.addDoc.mock.calls[0];
    expect('phone' in patientDoc).toBe(false);
    expect(firestore.setDoc).toHaveBeenCalledWith({ type: 'doc', col: 'patientContacts', id: 'new' }, { phone: '99999 11111' });
  });

  test('editing a patient removes any old phone field and updates the contact', async () => {
    await render(<AddPatient />);
    await clickBtn('Edit', 0);
    await setValue(container.querySelector('input[type="tel"]'), '90000 00000');
    await clickBtn('Update Patient');
    const [ref, data] = firestore.updateDoc.mock.calls[0];
    expect(ref.col).toBe('patients');
    expect(data.phone).toBe('__DELETE__');
    expect(firestore.setDoc.mock.calls[0][1]).toEqual({ phone: '90000 00000' });
  });

  test('only admins can delete a patient, and the contact goes with them', async () => {
    await render(<AddPatient />);
    await clickBtn('Delete', 0);
    const cols = firestore.deleteDoc.mock.calls.map(([ref]) => ref.col);
    expect(cols).toEqual(['patients', 'patientContacts']);
  });

  test('dashboard flags sessions stuck with a doctor on leave and moves them on request', async () => {
    const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);
    const ymd = dateKey(tomorrow);
    const s = { id: 'x1', patientId: 'p1', doctorId: 'd1', therapy: 'physio', status: 'scheduled', duration: 60, startTime: new Date(tomorrow.getFullYear(), tomorrow.getMonth(), tomorrow.getDate(), 10).toISOString() };
    const value = dataValue([s]);
    value.doctors = doctors.map((d) => (d.id === 'd1' ? { ...d, leave: [{ date: ymd, part: 'full' }] } : d));
    await act(async () => {
      root.render(<MemoryRouter><AuthContext.Provider value={authValue('scheduler')}><DataContext.Provider value={value}><Dashboard /></DataContext.Provider></AuthContext.Provider></MemoryRouter>);
    });
    expect(text()).toContain('Needs attention');
    await clickBtn('Move them to free doctors');
    expect(mockBatch.update).toHaveBeenCalledWith({ type: 'doc', col: 'schedule', id: 'x1' }, { doctorId: 'd2' });
    // reception / managers do not get the alert (they cannot act on it)
    await act(async () => {
      root.render(<MemoryRouter><AuthContext.Provider value={authValue('reception')}><DataContext.Provider value={value}><Dashboard /></DataContext.Provider></AuthContext.Provider></MemoryRouter>);
    });
    expect(text()).not.toContain('Needs attention');
  });
});

test('Login form works on its own', async () => {
  const login = jest.fn(() => Promise.resolve());
  await act(async () => { root.render(<AuthContext.Provider value={{ login }}><Login /></AuthContext.Provider>); });
  const [email, pass] = container.querySelectorAll('input');
  await setValue(email, ' a@b.co ');
  await setValue(pass, 'secret');
  await act(async () => { container.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
  expect(login).toHaveBeenCalledWith('a@b.co', 'secret');
});
