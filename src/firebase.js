import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { getFunctions, connectFunctionsEmulator } from "firebase/functions";
import { getStorage } from "firebase/storage";

const firebaseAuthDomain =
  process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ||
  (process.env.NODE_ENV === "development"
    ? "reservaeldia-7a440.firebaseapp.com"
    : "reservaeldia.com.ar");

const firebaseConfig = {
  apiKey: "AIzaSyALCvU48_HRp26cXpQcTX5S33Adpwfl3z4",
  authDomain: firebaseAuthDomain,
  projectId: "reservaeldia-7a440",
  storageBucket: "reservaeldia-7a440.firebasestorage.app",
  messagingSenderId: "860495975406",
  appId: "1:860495975406:web:3a49ad0cf55d60313534ff",
};

const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);
export const auth = getAuth(app);
export const storage = getStorage(app);

// 🔹 Functions
export const functions = getFunctions(app, "us-central1");

const isLocalhost =
  typeof window !== "undefined" &&
  (window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1");

const USE_EMULATORS =
  isLocalhost && process.env.NEXT_PUBLIC_USE_EMULATORS === "true";

// ✅ SOLO en localhost + flag true
if (USE_EMULATORS) {
  console.log("[Firebase] Functions → EMULATOR");
  connectFunctionsEmulator(functions, "127.0.0.1", 5001);
} else {
  console.log("[Firebase] Functions → CLOUD");
}


export default app;
