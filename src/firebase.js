import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { getFunctions } from "firebase/functions";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyALCvU48_HRp26cXpQcTX5S33Adpwfl3z4",
  authDomain: "reservaeldia-7a440.firebaseapp.com",
  projectId: "reservaeldia-7a440",
  storageBucket: "reservaeldia-7a440.firebasestorage.app",
  messagingSenderId: "860495975406",
  appId: "1:860495975406:web:3a49ad0cf55d60313534ff",
};

const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);
export const auth = getAuth(app);
export const functions = getFunctions(app);
export const storage = getStorage(app);