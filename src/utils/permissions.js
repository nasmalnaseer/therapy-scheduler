// One place that says who may do what. The screens use it to show or hide things;
// firestore.rules enforces the same rules on the server (keep the two in step).

export const ROLES = ['admin', 'scheduler', 'doctor', 'reception', 'manager'];

export const ROLE_LABELS = {
  admin: 'Admin',
  scheduler: 'Scheduling staff',
  doctor: 'Doctor / Therapist',
  reception: 'Reception',
  manager: 'Manager (read-only)'
};

export const ROLE_HELP = {
  admin: 'Everything, including logins, Time Config, doctors, equipment and patients.',
  scheduler: 'Builds and edits the schedule, registers patients, marks attendance. Cannot manage logins or Time Config.',
  doctor: 'Sees only their own sessions, marks them attended or missed, and adds their own leave.',
  reception: 'Sees the timetable, checks patients in, prints sheets and sends WhatsApp reminders. Cannot change the schedule.',
  manager: 'Dashboard, reports and export only. Cannot change anything or see phone numbers.'
};

// Accounts created by hand in the first version used "viewer"; that is the read-only manager role now.
export const normalizeRole = (role) => (role === 'viewer' ? 'manager' : ROLES.includes(role) ? role : null);

const ALL = ROLES;

export const PERMISSIONS = {
  // pages
  'dashboard.view': ALL,
  'timetable.view': ['admin', 'scheduler', 'doctor', 'reception'],
  'print.view': ['admin', 'scheduler', 'doctor', 'reception'],
  'checkin.view': ['admin', 'scheduler', 'doctor', 'reception'],
  'reports.view': ['admin', 'scheduler', 'manager'],
  'export.view': ['admin', 'scheduler', 'manager'],

  // sessions
  'schedule.generate': ['admin', 'scheduler'],
  'plans.manage': ['admin', 'scheduler'],
  'sessions.edit': ['admin', 'scheduler'], // add, move, change patient, cancel, reschedule, delete
  'sessions.status': ['admin', 'scheduler', 'doctor', 'reception'], // attended / missed / undo

  // patients
  'patients.read': ['admin', 'scheduler', 'reception', 'manager'],
  'patients.edit': ['admin', 'scheduler'],
  'patients.delete': ['admin'],
  'patients.contacts': ['admin', 'scheduler', 'reception'], // phone numbers

  // doctors, leave, equipment
  'doctors.manage': ['admin'], // add / delete a doctor
  'doctors.availability': ['admin', 'scheduler'], // availability, anyone's leave
  'leave.own': ['doctor'],
  'equipment.manage': ['admin'], // add / delete
  'equipment.availability': ['admin', 'scheduler'], // in service / out of service

  // setup
  'config.edit': ['admin'],
  'users.manage': ['admin']
};

export const can = (role, action) => (PERMISSIONS[action] || []).includes(normalizeRole(role));

// The statuses a role may set on a session
export const allowedStatuses = (role) =>
  can(role, 'sessions.edit')
    ? ['scheduled', 'attended', 'missed', 'cancelled']
    : can(role, 'sessions.status')
      ? ['scheduled', 'attended', 'missed']
      : [];

// Sidebar: [section, [[path, label, permission], ...]]
export const NAV = [
  ['Daily', [
    ['/', '🏠 Dashboard', 'dashboard.view'],
    ['/timetable', '🗓️ Timetable', 'timetable.view'],
    ['/check-in', '✅ Check-in', 'checkin.view'],
    ['/print', '🖨️ Print & Share', 'print.view'],
    ['/reports', '📈 Reports', 'reports.view'],
    ['/export', '📄 Export', 'export.view'],
    ['/my-leave', '🏖️ My Leave', 'leave.own']
  ]],
  ['Scheduling', [
    ['/schedule', '⚙️ Scheduler', 'schedule.generate'],
    ['/edit-schedule', '✏️ Edit Sessions', 'sessions.edit'],
    ['/plans', '🔁 Recurring Plans', 'plans.manage']
  ]],
  ['Setup', [
    ['/add-doctor', '🧑‍⚕️ Doctors & Leave', 'doctors.availability'],
    ['/add-patient', '🧑‍🦽 Patients', 'patients.edit'],
    ['/equipment', '🦾 Equipment', 'equipment.availability'],
    ['/time-config', '🕒 Time Config', 'config.edit'],
    ['/users', '👥 Users & Roles', 'users.manage']
  ]]
];

// route -> permission needed (used to block pages typed into the address bar)
export const ROUTE_PERMISSIONS = Object.fromEntries(NAV.flatMap(([, items]) => items.map(([path, , perm]) => [path, perm])));
