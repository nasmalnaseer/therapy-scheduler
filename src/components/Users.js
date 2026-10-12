import React, { useEffect, useMemo, useState } from 'react';
import { collection, deleteDoc, deleteField, doc, getDocs, onSnapshot, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { ROLES, ROLE_HELP, ROLE_LABELS, normalizeRole } from '../utils/permissions';
import { createLogin, friendlyAuthError, sendPasswordEmail } from '../utils/adminAuth';
import { commitOps } from '../utils/firestoreOps';

const emptyForm = { name: '', email: '', role: 'scheduler', doctorId: '' };

// Admin only: create logins, choose roles, switch people off.
export default function Users() {
  const { user } = useAuth();
  const { doctors, patients, schedule } = useData();
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null); // { kind: 'ok' | 'bad', text }
  const [editing, setEditing] = useState(null); // { id, role, doctorId }
  const [byUid, setByUid] = useState({ uid: '', ...emptyForm });
  const [showUid, setShowUid] = useState(false);

  useEffect(
    () =>
      onSnapshot(
        collection(db, 'users'),
        (snap) => setUsers(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
        (err) => setMessage({ kind: 'bad', text: friendlyAuthError(err) })
      ),
    []
  );

  const doctorLabel = (id) => doctors.find((d) => d.id === id)?.name || '';
  const sorted = useMemo(() => [...users].sort((a, b) => (a.name || a.email || '').localeCompare(b.name || b.email || '')), [users]);

  const profileFor = (f, uid) => ({
    name: f.name.trim(),
    email: f.email.trim().toLowerCase(),
    role: f.role,
    active: true,
    ...(f.role === 'doctor' ? { doctorId: f.doctorId } : {}),
    createdAt: new Date().toISOString(),
    createdBy: user.uid
  });

  const invalid = (f) => {
    if (!f.name.trim()) return 'Please enter the person\'s name.';
    if (!/^\S+@\S+\.\S+$/.test(f.email.trim())) return 'Please enter a valid email address.';
    if (f.role === 'doctor' && !f.doctorId) return 'Choose which doctor record this login belongs to.';
    return '';
  };

  const run = async (fn) => {
    setBusy(true);
    setMessage(null);
    try {
      await fn();
    } catch (err) {
      setMessage({ kind: 'bad', text: friendlyAuthError(err) });
    } finally {
      setBusy(false);
    }
  };

  const create = () => {
    const problem = invalid(form);
    if (problem) return setMessage({ kind: 'bad', text: problem });
    run(async () => {
      const email = form.email.trim().toLowerCase();
      const uid = await createLogin(email);
      try {
        await setDoc(doc(db, 'users', uid), profileFor(form, uid));
      } catch (err) {
        setMessage({ kind: 'bad', text: `The login was created (UID ${uid}) but its role could not be saved: ${friendlyAuthError(err)} Use "Add an existing login" with this UID to finish.` });
        return;
      }
      let emailed = true;
      try {
        await sendPasswordEmail(email);
      } catch {
        emailed = false;
      }
      setForm(emptyForm);
      setMessage({
        kind: emailed ? 'ok' : 'bad',
        text: emailed
          ? `Login created for ${email}. A link to set their password was emailed to them.`
          : `Login created for ${email}, but the password email could not be sent. Use "Send password email" on their row.`
      });
    });
  };

  const addByUid = () => {
    const problem = invalid(byUid) || (byUid.uid.trim() ? '' : 'Paste the UID from the Firebase console.');
    if (problem) return setMessage({ kind: 'bad', text: problem });
    run(async () => {
      await setDoc(doc(db, 'users', byUid.uid.trim()), profileFor(byUid));
      setByUid({ uid: '', ...emptyForm });
      setMessage({ kind: 'ok', text: 'Role saved. They can sign in with their existing password.' });
    });
  };

  const saveEdit = () => {
    if (editing.role === 'doctor' && !editing.doctorId) return setMessage({ kind: 'bad', text: 'Choose which doctor this login belongs to.' });
    run(async () => {
      await updateDoc(doc(db, 'users', editing.id), {
        role: editing.role,
        doctorId: editing.role === 'doctor' ? editing.doctorId : deleteField()
      });
      setEditing(null);
      setMessage({ kind: 'ok', text: 'Role updated. It applies the next time they open the app.' });
    });
  };

  const setActive = (u, active) =>
    run(async () => {
      await updateDoc(doc(db, 'users', u.id), { active });
      setMessage({ kind: 'ok', text: active ? `${u.name || u.email} can sign in again.` : `${u.name || u.email} is switched off and can no longer open the app.` });
    });

  const resend = (u) =>
    run(async () => {
      await sendPasswordEmail(u.email);
      setMessage({ kind: 'ok', text: `Password email sent to ${u.email}.` });
    });

  const remove = (u) => {
    if (!window.confirm(`Remove ${u.name || u.email}? They lose all access. (Use Deactivate instead if they may come back.)`)) return;
    run(async () => {
      await deleteDoc(doc(db, 'users', u.id));
      setMessage({ kind: 'ok', text: `${u.name || u.email} removed.` });
    });
  };

  // ---- one-time tidy-ups for data created before roles existed ----
  const movePhones = () =>
    run(async () => {
      const snap = await getDocs(collection(db, 'patients'));
      const ops = [];
      snap.docs.forEach((d) => {
        if (!('phone' in d.data())) return;
        const phone = String(d.data().phone || '').trim();
        if (phone) ops.push({ type: 'set', col: 'patientContacts', id: d.id, data: { phone } });
        ops.push({ type: 'update', col: 'patients', id: d.id, data: { phone: deleteField() } });
      });
      if (ops.length === 0) return setMessage({ kind: 'ok', text: 'Nothing to move: no phone numbers are stored on patient records.' });
      await commitOps(ops);
      setMessage({ kind: 'ok', text: `Moved ${ops.filter((o) => o.type === 'set').length} phone number(s) into the restricted contacts list.` });
    });

  const fillNames = () =>
    run(async () => {
      const missing = schedule.filter((s) => !s.patientName);
      const ops = missing
        .map((s) => ({ s, p: patients.find((x) => x.id === s.patientId) }))
        .filter(({ p }) => p)
        .map(({ s, p }) => ({ type: 'update', col: 'schedule', id: s.id, data: { patientName: p.name } }));
      if (ops.length === 0) return setMessage({ kind: 'ok', text: 'Every loaded session already has its patient name.' });
      await commitOps(ops);
      setMessage({ kind: 'ok', text: `Added the patient name to ${ops.length} session(s).` });
    });

  const roleField = (f, set) => (
    <>
      <select value={f.role} onChange={(e) => set({ ...f, role: e.target.value })}>
        {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
      </select>
      {f.role === 'doctor' && (
        <select value={f.doctorId || ''} onChange={(e) => set({ ...f, doctorId: e.target.value })}>
          <option value="">Which doctor?</option>
          {doctors.map((d) => <option key={d.id} value={d.id}>{d.name} ({d.therapy})</option>)}
        </select>
      )}
    </>
  );

  return (
    <div>
      <h3>👥 Users & Roles</h3>

      {message && <div className={`notice ${message.kind === 'ok' ? 'ok' : 'bad'}`}>{message.text}</div>}

      <div className="card">
        <h4>Create a login</h4>
        <div className="row">
          <input type="text" placeholder="Full name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <input type="email" placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          {roleField(form, setForm)}
          <button onClick={create} disabled={busy}>{busy ? 'Working…' : 'Create login'}</button>
        </div>
        <p className="muted">{ROLE_HELP[form.role]}</p>
        <p className="muted">They receive an email with a link to choose their own password. You never see or set it.</p>
      </div>

      <div className="card">
        <h4>People with access ({users.length})</h4>
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {sorted.map((u) => {
                const isMe = u.id === user?.uid;
                const role = normalizeRole(u.role);
                const isEditing = editing?.id === u.id;
                return (
                  <tr key={u.id}>
                    <td>{u.name || <span className="muted">(no name)</span>}{isMe && <span className="muted"> (you)</span>}</td>
                    <td>{u.email || <span className="muted">{u.id.slice(0, 8)}…</span>}</td>
                    <td>
                      {isEditing ? (
                        <div className="row">{roleField(editing, setEditing)}</div>
                      ) : (
                        <>
                          {ROLE_LABELS[role] || u.role}
                          {role === 'doctor' && <div className="muted">{doctorLabel(u.doctorId) || 'not linked'}</div>}
                        </>
                      )}
                    </td>
                    <td>{u.active === false ? <span className="badge warn">Deactivated</span> : <span className="badge ok">Active</span>}</td>
                    <td>
                      {isMe ? <span className="muted">your own account cannot be changed here</span> : isEditing ? (
                        <>
                          <button className="small" disabled={busy} onClick={saveEdit}>Save</button>
                          <button className="small secondary" onClick={() => setEditing(null)}>Cancel</button>
                        </>
                      ) : (
                        <>
                          <button className="small secondary" onClick={() => setEditing({ id: u.id, role: role || 'scheduler', doctorId: u.doctorId || '' })}>Change role</button>
                          {u.active === false
                            ? <button className="small" disabled={busy} onClick={() => setActive(u, true)}>Reactivate</button>
                            : <button className="small secondary" disabled={busy} onClick={() => setActive(u, false)}>Deactivate</button>}
                          {u.email && <button className="small secondary" disabled={busy} onClick={() => resend(u)}>Send password email</button>}
                          <button className="small danger" disabled={busy} onClick={() => remove(u)}>Remove</button>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
              {sorted.length === 0 && <tr><td colSpan="5" className="muted">No users yet.</td></tr>}
            </tbody>
          </table>
        </div>
        <p className="muted">Deactivate switches access off straight away. The sign-in itself stays in Firebase (deleting it needs the Firebase console).</p>
      </div>

      <div className="card">
        <h4 style={{ cursor: 'pointer' }} onClick={() => setShowUid(!showUid)}>{showUid ? '▾' : '▸'} Add an existing login</h4>
        {showUid && (
          <>
            <p className="muted">For someone who already has a Firebase login (for example one created in the console). Paste their UID from Authentication → Users.</p>
            <div className="row">
              <input type="text" placeholder="UID" value={byUid.uid} onChange={(e) => setByUid({ ...byUid, uid: e.target.value })} />
              <input type="text" placeholder="Full name" value={byUid.name} onChange={(e) => setByUid({ ...byUid, name: e.target.value })} />
              <input type="email" placeholder="Email" value={byUid.email} onChange={(e) => setByUid({ ...byUid, email: e.target.value })} />
              {roleField(byUid, setByUid)}
              <button onClick={addByUid} disabled={busy}>Save role</button>
            </div>
          </>
        )}
      </div>

      <div className="card">
        <h4>One-time tidy-ups</h4>
        <p className="muted">Needed once if you used the app before roles were added. Safe to run again.</p>
        <div className="row">
          <button className="secondary" onClick={movePhones} disabled={busy}>Move patient phone numbers to the restricted list</button>
          <button className="secondary" onClick={fillNames} disabled={busy}>Add patient names to older sessions (needed for doctor logins)</button>
        </div>
      </div>
    </div>
  );
}
