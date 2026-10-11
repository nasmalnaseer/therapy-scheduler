import { DEFAULT_COUNTRY_CODE, prettyTherapy } from './constants';
import { formatNiceDate, timeKey } from './timeUtils';
import { sessionEnd, sessionStart } from './scheduling';

// Turns what staff typed ("98765 43210", "+91 98765 43210", "098765 43210") into digits wa.me accepts
export function normalizePhone(raw, countryCode = DEFAULT_COUNTRY_CODE) {
  let digits = String(raw || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.length === 10) digits = countryCode + digits;
  else if (digits.length === 11 && digits.startsWith('0')) digits = countryCode + digits.slice(1);
  return digits;
}

export function whatsappUrl(phone, text) {
  const p = normalizePhone(phone);
  return `https://wa.me/${p}?text=${encodeURIComponent(text)}`;
}

export function buildPatientMessage({ patient, sessions, doctors, day }) {
  const lines = [...sessions]
    .sort((a, b) => sessionStart(a) - sessionStart(b))
    .map((s) => {
      const doctor = doctors.find((d) => d.id === s.doctorId);
      return `- ${timeKey(sessionStart(s))} to ${timeKey(sessionEnd(s))}: ${prettyTherapy(s.therapy)}${doctor ? ` with ${doctor.name}` : ''}`;
    });
  return [
    `Hello ${patient?.name || ''},`,
    `Your therapy schedule for ${formatNiceDate(day)}:`,
    ...lines,
    'Please arrive 10 minutes early. If you cannot attend, kindly let us know.'
  ].join('\n');
}
