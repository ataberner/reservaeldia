import * as admin from "firebase-admin";
import * as path from "node:path";
const environment = require("../shared/firebaseEnvironment.cjs");

export function localBackendEnvironment() {
  const env = process.env;
  const isLocal = env.FUNCTIONS_EMULATOR === "true" || env.RESERVA_FIREBASE_MODE === "emulators";
  if (!isLocal) {
    if (env.RESERVA_FIREBASE_MODE && env.RESERVA_FIREBASE_MODE !== "prod") throw new Error("Modo backend desconocido.");
    if (env.FIRESTORE_EMULATOR_HOST || env.FIREBASE_AUTH_EMULATOR_HOST || env.FIREBASE_STORAGE_EMULATOR_HOST || env.GCLOUD_PROJECT?.startsWith("demo-")) throw new Error("Emulación parcial: usar npm run dev.");
    return null;
  }
  if (env.RESERVA_FIREBASE_MODE !== "emulators") throw new Error("Functions local requiere el recorrido aislado: npm run dev.");
  if (!env.RESERVA_LOCAL_SESSION || !env.HOME || path.resolve(env.HOME) !== path.resolve(env.RESERVA_LOCAL_SESSION, "home")) throw new Error("Admin local requiere configuración personal vacía del lanzador aislado.");
  if (env.GOOGLE_APPLICATION_CREDENTIALS) throw new Error("Credenciales ADC explícitas no permitidas en local.");
  const resolved = environment.resolveFirebaseEnvironment({
    mode: env.RESERVA_FIREBASE_MODE, projectId: env.GCLOUD_PROJECT,
    bucket: env.FIREBASE_STORAGE_BUCKET,
    emulators: { auth: env.FIREBASE_AUTH_EMULATOR_HOST, firestore: env.FIRESTORE_EMULATOR_HOST,
      storage: env.FIREBASE_STORAGE_EMULATOR_HOST, functions: env.FIREBASE_FUNCTIONS_EMULATOR_HOST },
  });
  if (env.GOOGLE_CLOUD_PROJECT && env.GOOGLE_CLOUD_PROJECT !== resolved.config.projectId) throw new Error("GOOGLE_CLOUD_PROJECT incompatible.");
  if (env.STORAGE_EMULATOR_HOST && env.STORAGE_EMULATOR_HOST !== `http://${env.FIREBASE_STORAGE_EMULATOR_HOST}`) throw new Error("STORAGE_EMULATOR_HOST incompatible.");
  if (env.FIREBASE_CONFIG) {
    let config;
    try { config = JSON.parse(env.FIREBASE_CONFIG); } catch { throw new Error("FIREBASE_CONFIG debe ser JSON local explícito."); }
    if (config.projectId !== resolved.config.projectId || config.storageBucket !== resolved.config.storageBucket) throw new Error("FIREBASE_CONFIG incompatible con el demo.");
  }
  return resolved;
}

export function ensureAdminApp(productionBucket = process.env.FIREBASE_STORAGE_BUCKET || "reservaeldia-7a440.firebasestorage.app") {
  const local = localBackendEnvironment();
  if (admin.apps.length) {
    const app = admin.app();
    if (local && (app.options.projectId !== local.config.projectId || app.options.storageBucket !== local.config.storageBucket)) throw new Error("Admin existente incompatible con el demo.");
    return app;
  }
  if (local) {
    // Admin 13 requires its ADC credential type to construct Firestore/Storage.
    // Emulator transports supply their own unauthenticated/owner credentials.
    // Fail if a caller ever tries to obtain a real token from this object.
    const credential = admin.credential.applicationDefault();
    credential.getAccessToken = async () => { throw new Error("ADC token request blocked in local mode."); };
    return admin.initializeApp({ projectId: local.config.projectId, storageBucket: local.config.storageBucket,
      credential,
    });
  }
  return admin.initializeApp({ credential: admin.credential.applicationDefault(), storageBucket: productionBucket });
}

export function assertExternalEffectAllowed(provider: string) {
  if (localBackendEnvironment()) throw new Error(`Efecto externo bloqueado en local: ${provider}.`);
}
