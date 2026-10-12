import { getApps, initializeApp } from 'firebase/app';
import { createUserWithEmailAndPassword, getAuth, sendPasswordResetEmail, signOut } from 'firebase/auth';
import { auth, firebaseConfig } from '../firebase';

// A second, private Firebase connection is used to create accounts.
// Creating a user signs that user in, so doing it on the main connection would sign the admin out.
const creatorApp = () => getApps().find((a) => a.name === 'user-creator') || initializeApp(firebaseConfig, 'user-creator');

// Nobody ever sees this password: the new user sets their own through the emailed link.
const randomPassword = () => {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return `${Array.from(bytes, (b) => b.toString(36).padStart(2, '0')).join('').slice(0, 28)}Aa1!`;
};

// returns the new account's uid
export async function createLogin(email) {
  const creatorAuth = getAuth(creatorApp());
  try {
    const cred = await createUserWithEmailAndPassword(creatorAuth, email, randomPassword());
    return cred.user.uid;
  } finally {
    await signOut(creatorAuth).catch(() => {});
  }
}

export const sendPasswordEmail = (email) => sendPasswordResetEmail(auth, email);

export const friendlyAuthError = (err) => {
  switch (err?.code) {
    case 'auth/email-already-in-use':
      return 'That email already has a login. Use "Add an existing login" below and paste its UID from the Firebase console.';
    case 'auth/invalid-email':
      return 'That email address does not look right.';
    case 'auth/operation-not-allowed':
      return 'Email/Password sign-in is not switched on in the Firebase console.';
    case 'auth/network-request-failed':
      return 'No internet connection.';
    case 'permission-denied':
      return 'You do not have permission to do that.';
    default:
      return err?.message || 'Something went wrong.';
  }
};
