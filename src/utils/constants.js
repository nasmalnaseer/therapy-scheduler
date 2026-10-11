export const THERAPIES = [
  'physio',
  'occupational',
  'speech',
  'vr',
  'hand_robotic',
  'gait_robotic',
  'psychology'
];

export const prettyTherapy = (t = '') => t.replace(/_/g, ' ');

export const STATUS = {
  SCHEDULED: 'scheduled',
  ATTENDED: 'attended',
  MISSED: 'missed',
  CANCELLED: 'cancelled'
};

export const STATUS_LABELS = {
  scheduled: 'Scheduled',
  attended: 'Attended',
  missed: 'Missed',
  cancelled: 'Cancelled'
};

export const WEEKDAYS = [
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
  { value: 0, label: 'Sun' }
];

export const LEAVE_PARTS = {
  full: 'Full day',
  am: 'Morning only',
  pm: 'Afternoon only'
};

export const APP_NAME = 'Hospital Therapy Scheduler';
export const DEFAULT_COUNTRY_CODE = '91';

// How many days of past sessions the app loads (keeps reads small as history grows)
export const SCHEDULE_HISTORY_DAYS = 120;
