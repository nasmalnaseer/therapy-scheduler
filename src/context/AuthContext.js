import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../firebase';

export const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

// Roles live in Firestore at users/{uid} -> { role: 'admin' | 'viewer' }.
// They are created by hand in the Firebase console (see CHANGES.md), never from the app.
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null);
  const [loading, setLoading] = useState(true);
  const [roleError, setRoleError] = useState('');

  useEffect(
    () =>
      onAuthStateChanged(auth, (u) => {
        setUser(u);
        if (!u) {
          setRole(null);
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
        setRole(snap.exists() ? snap.data().role : null);
        setRoleError('');
        setLoading(false);
      },
      (err) => {
        setRole(null);
        setRoleError(err.message);
        setLoading(false);
      }
    );
  }, [user]);

  const value = useMemo(
    () => ({
      user,
      role,
      isAdmin: role === 'admin',
      loading,
      roleError,
      login: (email, password) => signInWithEmailAndPassword(auth, email, password),
      logout: () => signOut(auth)
    }),
    [user, role, loading, roleError]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
