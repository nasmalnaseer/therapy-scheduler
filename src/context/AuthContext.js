import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { can, normalizeRole } from '../utils/permissions';

export const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

// Each person has one document at users/{uid}:
//   { name, email, role, active, doctorId? }
// role is admin | scheduler | doctor | reception | manager. Admins create these from the Users page.
// The very first admin is created by hand in the Firebase console (see CHANGES.md).
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [roleError, setRoleError] = useState('');

  useEffect(
    () =>
      onAuthStateChanged(auth, (u) => {
        setUser(u);
        if (!u) {
          setProfile(null);
          setRoleError('');
          setLoading(false);
        } else {
          setLoading(true);
        }
      }),
    []
  );

  useEffect(() => {
    if (!user) return undefined;
    return onSnapshot(
      doc(db, 'users', user.uid),
      (snap) => {
        setProfile(snap.exists() ? snap.data() : null);
        setRoleError('');
        setLoading(false);
      },
      (err) => {
        setProfile(null);
        setRoleError(err.message);
        setLoading(false);
      }
    );
  }, [user]);

  const value = useMemo(() => {
    const inactive = !!profile && profile.active === false;
    const role = inactive ? null : normalizeRole(profile?.role);
    return {
      user,
      profile,
      role,
      inactive,
      doctorId: profile?.doctorId || null,
      isAdmin: role === 'admin',
      can: (action) => can(role, action),
      loading,
      roleError,
      login: (email, password) => signInWithEmailAndPassword(auth, email, password),
      logout: () => signOut(auth)
    };
  }, [user, profile, loading, roleError]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
