// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getFirestore } from 'firebase/firestore';
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyBj2HX3hZQOQQ1ssOp-aGQgaYI3rdYBN94",
  authDomain: "hospital-scheduler-c7365.firebaseapp.com",
  projectId: "hospital-scheduler-c7365",
  storageBucket: "hospital-scheduler-c7365.firebasestorage.app",
  messagingSenderId: "223474751211",
  appId: "1:223474751211:web:2fe201e2c9fe2777a310ae"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

export { db };