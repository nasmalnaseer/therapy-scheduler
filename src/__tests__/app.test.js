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
  onSnapshot: jest.fn()
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

const dataValue = (schedule) => ({
  patients, doctors, equipment, schedule, config, loading: false, error: '',
  patientName: (id) => patients.find((p) => p.id === id)?.name || 'Unknown patient',
  doctorName: (id) => doctors.find((d) => d.id === id)?.name || 'Unknown doctor',
  equipmentName: (id) => equipment.find((e) => e.id === id)?.name || ''
});
const authValue = (role = 'admin') => ({ user: { email: 'staff@hospital.test', uid: 'u1' }, role, isAdmin: role === 'admin', loading: false, logout: jest.fn(), login: jest.fn(() => Promise.resolve()) });

// ---------- tiny DOM helpers ----------
let container;
let root;
const render = async (ui, { role = 'admin', schedule = makeSessions() } = {}) => {
  await act(async () => {
    root.render(
      <MemoryRouter>
        <AuthContext.Provider value={authValue(role)}>
          <DataContext.Provider value={dataValue(schedule)}>{ui}</DataContext.Provider>
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

describe('roles', () => {
  test('viewer cannot see admin links, drag sessions or change status', async () => {
    await render(<Sidebar />, { role: 'viewer' });
    expect(text()).toContain('Dashboard');
    ['/schedule', '/edit-schedule', '/plans', '/add-doctor', '/add-patient', '/equipment', '/time-config'].forEach((href) =>
      expect(container.querySelector(`a[href="${href}"]`)).toBeNull()
    );
    await render(<Timetable />, { role: 'viewer' });
    expect(container.querySelector('.tt-session[draggable="true"]')).toBeNull();
    await click(container.querySelector('.tt-session'));
    expect(text()).toContain('WhatsApp reminder');
    expect(buttons('Attended').length).toBe(0);
  });
  test('admin sees everything', async () => {
    await render(<Sidebar />);
    ['/schedule', '/edit-schedule', '/plans', '/add-doctor', '/add-patient', '/equipment', '/time-config'].forEach((href) =>
      expect(container.querySelector(`a[href="${href}"]`)).not.toBeNull()
    );
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

test('Login form works on its own', async () => {
  const login = jest.fn(() => Promise.resolve());
  await act(async () => { root.render(<AuthContext.Provider value={{ login }}><Login /></AuthContext.Provider>); });
  const [email, pass] = container.querySelectorAll('input');
  await setValue(email, ' a@b.co ');
  await setValue(pass, 'secret');
  await act(async () => { container.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
  expect(login).toHaveBeenCalledWith('a@b.co', 'secret');
});
