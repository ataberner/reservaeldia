import { initializeApp } from "firebase/app";
import { getFirestore } from 'firebase/firestore';
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyALCvU48_HRp26cXpQcTX5S33Adpwfl3z4",
  authDomain: "reservaeldia-7a440.firebaseapp.com",
  projectId: "reservaeldia-7a440",
  storageBucket: "reservaeldia-7a440.firebasestorage.app",
  messagingSenderId: "860495975406",
  appId: "1:860495975406:web:3a49ad0cf55d60313534ff",
  measurementId: "G-NPTJQXS655"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);  

export { app, db, auth };