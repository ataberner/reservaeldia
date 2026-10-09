import { initializeApp, getApps } from "firebase/app";
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from "firebase/app-check";
import { getFirestore, connectFirestoreEmulator } from "firebase/firestore";
import { getAuth, connectAuthEmulator } from "firebase/auth";
import { getFunctions, connectFunctionsEmulator } from "firebase/functions";
import { getStorage, connectStorageEmulator } from "firebase/storage";
import environmentContract from "../shared/firebaseEnvironment.cjs";
import { initializeFirebaseServices } from "./config/initializeFirebaseServices.js";

export const firebaseEnvironment = environmentContract.readClientEnvironment();
const services = initializeFirebaseServices({
  initializeApp, getApps, getAuth, getFirestore, getFunctions, getStorage,
  initializeAppCheck, ReCaptchaEnterpriseProvider,
  connectAuthEmulator, connectFirestoreEmulator, connectFunctionsEmulator, connectStorageEmulator,
}, firebaseEnvironment);

export const { db, auth, storage, functions } = services;
export default services.app;
