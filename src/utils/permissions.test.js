import { ROLES, NAV, ROUTE_PERMISSIONS, allowedStatuses, can, normalizeRole } from './permissions';

describe('roles', () => {
  test('the old "viewer" role is the read-only manager', () => {
    expect(normalizeRole('viewer')).toBe('manager');
    expect(normalizeRole('admin')).toBe('admin');
    expect(normalizeRole('hacker')).toBeNull();
    expect(normalizeRole(undefined)).toBeNull();
    expect(can('viewer', 'reports.view')).toBe(true);
    expect(can('viewer', 'sessions.edit')).toBe(false);
  });

  test('admin can do everything', () => {
    ['users.manage', 'config.edit', 'sessions.edit', 'patients.delete', 'doctors.manage', 'equipment.manage'].forEach((a) => expect(can('admin', a)).toBe(true));
  });

  test('only admin manages logins, Time Config, and adds or deletes doctors, equipment and patients', () => {
    ['users.manage', 'config.edit', 'doctors.manage', 'equipment.manage', 'patients.delete'].forEach((a) => {
      expect(ROLES.filter((r) => can(r, a))).toEqual(['admin']);
    });
  });

  test('scheduling staff can plan and register patients but not touch logins or Time Config', () => {
    ['schedule.generate', 'plans.manage', 'sessions.edit', 'patients.edit', 'patients.contacts', 'doctors.availability', 'equipment.availability'].forEach((a) => expect(can('scheduler', a)).toBe(true));
    ['users.manage', 'config.edit', 'doctors.manage', 'patients.delete'].forEach((a) => expect(can('scheduler', a)).toBe(false));
  });

  test('doctor: own sessions and leave only; no patients, no contacts, no schedule changes', () => {
    expect(can('doctor', 'sessions.status')).toBe(true);
    expect(can('doctor', 'leave.own')).toBe(true);
    ['sessions.edit', 'schedule.generate', 'patients.read', 'patients.contacts', 'reports.view', 'export.view', 'doctors.availability'].forEach((a) => expect(can('doctor', a)).toBe(false));
    expect(allowedStatuses('doctor')).toEqual(['scheduled', 'attended', 'missed']);
  });

  test('reception checks patients in and sees phone numbers but cannot change the schedule or cancel', () => {
    expect(can('reception', 'sessions.status')).toBe(true);
    expect(can('reception', 'patients.contacts')).toBe(true);
    ['sessions.edit', 'schedule.generate', 'patients.edit', 'reports.view'].forEach((a) => expect(can('reception', a)).toBe(false));
    expect(allowedStatuses('reception')).not.toContain('cancelled');
  });

  test('manager is read-only and never sees phone numbers', () => {
    ['dashboard.view', 'reports.view', 'export.view', 'patients.read'].forEach((a) => expect(can('manager', a)).toBe(true));
    ['sessions.status', 'sessions.edit', 'patients.contacts', 'timetable.view', 'print.view'].forEach((a) => expect(can('manager', a)).toBe(false));
    expect(allowedStatuses('manager')).toEqual([]);
  });

  test('only admin and scheduling staff may set every status', () => {
    expect(allowedStatuses('admin')).toContain('cancelled');
    expect(allowedStatuses('scheduler')).toContain('cancelled');
  });

  test('unknown roles and unknown actions get nothing', () => {
    expect(can('janitor', 'dashboard.view')).toBe(false);
    expect(can('admin', 'launch.rockets')).toBe(false);
    expect(can(null, 'dashboard.view')).toBe(false);
  });

  test('every sidebar link has a permission and every role has at least the dashboard', () => {
    NAV.forEach(([, items]) => items.forEach(([path, label, perm]) => {
      expect(path.startsWith('/')).toBe(true);
      expect(label.length).toBeGreaterThan(2);
      expect(perm).toBeTruthy();
    }));
    ROLES.forEach((r) => expect(can(r, ROUTE_PERMISSIONS['/'])).toBe(true));
  });

  test('each role sees the pages it should', () => {
    const pages = (role) => Object.entries(ROUTE_PERMISSIONS).filter(([, perm]) => can(role, perm)).map(([p]) => p);
    expect(pages('manager')).toEqual(['/', '/reports', '/export']);
    expect(pages('doctor')).toEqual(['/', '/timetable', '/check-in', '/print', '/my-leave']);
    expect(pages('reception')).toEqual(['/', '/timetable', '/check-in', '/print']);
    expect(pages('scheduler')).not.toContain('/users');
    expect(pages('scheduler')).not.toContain('/time-config');
    expect(pages('admin')).toContain('/users');
  });
});
