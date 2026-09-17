import { initializeApp, getApps } from "firebase/app";
import { getFirestore, connectFirestoreEmulator } from "firebase/firestore";
import { getAuth, connectAuthEmulator } from "firebase/auth";
import { getFunctions, connectFunctionsEmulator } from "firebase/functions";
import { getStorage, connectStorageEmulator } from "firebase/storage";
import environmentContract from "../shared/firebaseEnvironment.cjs";
import { initializeFirebaseServices } from "./config/initializeFirebaseServices.js";

export const firebaseEnvironment = environmentContract.readClientEnvironment();
const services = initializeFirebaseServices({
  initializeApp, getApps, getAuth, getFirestore, getFunctions, getStorage,
  connectAuthEmulator, connectFirestoreEmulator, connectFunctionsEmulator, connectStorageEmulator,
}, firebaseEnvironment);

export const { db, auth, storage, functions } = services;
export default services.app;
