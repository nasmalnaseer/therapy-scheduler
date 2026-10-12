import React, { useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import StatusBadge from './StatusBadge';
import { APP_NAME, prettyTherapy } from '../utils/constants';
import { dateKey, formatNiceDate, parseDateKey, timeKey } from '../utils/timeUtils';
import { isActive, sessionDuration, sessionEnd, sessionStart } from '../utils/scheduling';
import { buildPatientMessage, whatsappUrl } from '../utils/share';

// One printable page per doctor or per patient. "Print" -> choose "Save as PDF" in the print dialog.
export default function PrintSheets() {
  const { role, doctorId, can } = useAuth();
  const { schedule, doctors, patients, equipmentName, patientName, doctorName } = useData();
  const patientSheets = can('patients.read') && role !== 'doctor'; // doctors only ever print their own sheet
  const [dateStr, setDateStr] = useState(dateKey(new Date()));
  const [mode, setMode] = useState('doctor');
  const [who, setWho] = useState('all');

  const day = parseDateKey(dateStr);
  const sessions = useMemo(
    () =>
      schedule
        .filter((s) => isActive(s) && dateKey(sessionStart(s)) === dateStr)
        .sort((a, b) => sessionStart(a) - sessionStart(b)),
    [schedule, dateStr]
  );

  const people = mode === 'doctor' ? doctors.filter((d) => role !== 'doctor' || d.id === doctorId) : patients;
  const key = mode === 'doctor' ? 'doctorId' : 'patientId';
  const sheets = people
    .filter((p) => who === 'all' || p.id === who)
    .map((p) => ({ person: p, list: sessions.filter((s) => s[key] === p.id) }))
    .filter((x) => x.list.length > 0 || who !== 'all')
    .sort((a, b) => a.person.name.localeCompare(b.person.name));

  const share = (patient, list) => {
    const text = buildPatientMessage({ patient, sessions: list, doctors, day });
    window.open(whatsappUrl(patient.phone, text), '_blank', 'noopener');
  };

  return (
    <div>
      <div className="no-print">
        <h3>Print & Share</h3>
        <div className="row">
          <input type="date" value={dateStr} onChange={(e) => e.target.value && setDateStr(e.target.value)} />
          {patientSheets && (
            <select value={mode} onChange={(e) => { setMode(e.target.value); setWho('all'); }}>
              <option value="doctor">Doctor sheets</option>
              <option value="patient">Patient sheets</option>
            </select>
          )}
          <select value={who} onChange={(e) => setWho(e.target.value)}>
            <option value="all">{mode === 'doctor' ? 'All doctors' : 'All patients with sessions'}</option>
            {[...people].sort((a, b) => a.name.localeCompare(b.name)).map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <button onClick={() => window.print()} disabled={sheets.length === 0}>🖨️ Print / Save as PDF</button>
        </div>
        {mode === 'patient' && <p className="muted">The WhatsApp button opens a ready-to-send message. Patients without a phone number saved will let you pick the contact in WhatsApp.</p>}
      </div>

      {sheets.length === 0 && <p className="muted no-print">Nothing scheduled on {formatNiceDate(day)}.</p>}

      {sheets.map(({ person, list }) => (
        <section key={person.id} className="card print-sheet">
          <div className="row spread">
            <div>
              <h3 style={{ marginBottom: 2 }}>{person.name}{mode === 'doctor' && <span className="muted"> · {prettyTherapy(person.therapy)}</span>}</h3>
              <div className="muted">{APP_NAME} · {formatNiceDate(day)}</div>
            </div>
            {mode === 'patient' && list.length > 0 && can('patients.contacts') && (
              <button className="secondary small no-print" onClick={() => share(person, list)}>💬 WhatsApp</button>
            )}
          </div>
          {list.length === 0 ? (
            <p className="muted">No sessions.</p>
          ) : (
            <table className="data-table" style={{ marginTop: 10, tableLayout: 'fixed' }}>
              <thead>
                <tr>
                  <th>Time</th>
                  <th>{mode === 'doctor' ? 'Patient' : 'Doctor'}</th>
                  {mode === 'patient' && <th>Therapy</th>}
                  <th>Equipment</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {list.map((s) => (
                  <tr key={s.id}>
                    <td>{timeKey(sessionStart(s))} – {timeKey(sessionEnd(s))} <span className="muted">({sessionDuration(s)} min)</span></td>
                    <td>{mode === 'doctor' ? patientName(s.patientId) : doctorName(s.doctorId)}{mode === 'doctor' && <span className="muted"> · {prettyTherapy(s.therapy)}</span>}</td>
                    {mode === 'patient' && <td>{prettyTherapy(s.therapy)}</td>}
                    <td>{equipmentName(s.equipmentId) || '-'}</td>
                    <td><StatusBadge session={s} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      ))}
    </div>
  );
}
