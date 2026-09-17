// SDK injection lets tests verify actual ordering and repeat initialization.
export function initializeFirebaseServices(sdk, environment) {
  // Existing consumers call getAuth()/getStorage() without passing an app.
  const appName = "[DEFAULT]";
  const existing = sdk.getApps().find((app) => app.name === appName);
  if (existing) {
    for (const key of ["projectId", "storageBucket", "apiKey", "authDomain"]) {
      if (existing.options[key] !== environment.config[key]) throw new Error(`Firebase app incompatible: ${key}`);
    }
  }
  const app = existing || sdk.initializeApp(environment.config, appName);
  // Kept on the SDK app: survives Next HMR without reconnecting used instances.
  const cacheKey = Symbol.for("reservaeldia.firebase.services");
  if (app[cacheKey]) {
    if (app[cacheKey].mode !== environment.mode) throw new Error("Firebase mode changed; restart required.");
    return app[cacheKey];
  }
  const auth = sdk.getAuth(app);
  if (environment.mode === "emulators") sdk.connectAuthEmulator(auth, `http://${environment.host}:${environment.ports.auth}`, { disableWarnings: true });
  const db = sdk.getFirestore(app);
  if (environment.mode === "emulators") sdk.connectFirestoreEmulator(db, environment.host, environment.ports.firestore);
  const functions = sdk.getFunctions(app, environment.region);
  if (environment.mode === "emulators") sdk.connectFunctionsEmulator(functions, environment.host, environment.ports.functions);
  const storage = sdk.getStorage(app);
  if (environment.mode === "emulators") sdk.connectStorageEmulator(storage, environment.host, environment.ports.storage);
  const services = { app, auth, db, functions, storage, mode: environment.mode };
  Object.defineProperty(app, cacheKey, { value: services });
  return services;
}
