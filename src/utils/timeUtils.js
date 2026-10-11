const pad = (n) => String(n).padStart(2, '0');

export const MS_MIN = 60000;

// Local-date helpers. "key" = 'yyyy-MM-dd' in the user's local time zone.
export const dateKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const timeKey = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

export const parseDateKey = (key) => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
};

export const atTime = (day, hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date(day);
  d.setHours(h, m, 0, 0);
  return d;
};

export const hhmmToMinutes = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

export const minutesOfDay = (d) => d.getHours() * 60 + d.getMinutes();

export const addDays = (d, n) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};

export const startOfDay = (d) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};

// Monday-based week start
export const startOfWeek = (d) => {
  const x = startOfDay(d);
  const diff = (x.getDay() + 6) % 7;
  x.setDate(x.getDate() - diff);
  return x;
};

export const toLocalInputValue = (iso) => {
  const d = new Date(iso);
  return `${dateKey(d)}T${timeKey(d)}`;
};

export const formatNiceDate = (d) =>
  d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
