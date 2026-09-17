/* eslint-env browser -- readClientEnvironment also runs in the browser; typeof window guards Node callers. */
// One destination contract for the browser, Admin, generated HTML and local CLI.
const LOCAL_PROJECT = "demo-reservaeldia-local";
const LOCAL_BUCKET = `${LOCAL_PROJECT}.appspot.com`;
const REGION = "us-central1";
const EMULATORS = Object.freeze({ auth: 19099, firestore: 18080, functions: 15001, storage: 19199 });
const HOST = "127.0.0.1";
const PRODUCTION_CONFIG = Object.freeze({
  apiKey: "AIzaSyALCvU48_HRp26cXpQcTX5S33Adpwfl3z4",
  projectId: "reservaeldia-7a440",
  storageBucket: "reservaeldia-7a440.firebasestorage.app",
  messagingSenderId: "860495975406",
  appId: "1:860495975406:web:3a49ad0cf55d60313534ff",
});

function fail(problem) {
  throw new Error(`[Firebase environment] ${problem}`);
}

function resolveFirebaseEnvironment(input = {}) {
  const mode = input.mode || (input.nodeEnv === "production" ? "prod" : "emulators");
  if (!["prod", "emulators"].includes(mode)) fail("Modo desconocido; usar emulators o prod.");
  if (mode === "prod") {
    if (input.nodeEnv !== "production" && !input.allowRemote) fail("Desarrollo remoto deshabilitado. Usar npm run dev para el entorno demo.");
    if (input.projectId && input.projectId !== PRODUCTION_CONFIG.projectId) fail("Proyecto incompatible con prod.");
    if (input.bucket && input.bucket !== PRODUCTION_CONFIG.storageBucket) fail("Bucket incompatible con prod.");
    if (input.emulators && Object.values(input.emulators).some(Boolean)) fail("prod no admite una mezcla de emuladores.");
    return {
      mode, region: REGION,
      config: { ...PRODUCTION_CONFIG, authDomain: input.authDomain || (input.nodeEnv === "development" ? "reservaeldia-7a440.firebaseapp.com" : "reservaeldia.com.ar") },
      functionsBaseUrl: `https://${REGION}-${PRODUCTION_CONFIG.projectId}.cloudfunctions.net`,
      publicBaseUrl: "https://reservaeldia.com.ar",
    };
  }
  if (input.projectId !== LOCAL_PROJECT) fail(`Se requiere el proyecto ${LOCAL_PROJECT}. Iniciar con npm run dev.`);
  if (input.bucket !== LOCAL_BUCKET) fail(`Se requiere el bucket demo ${LOCAL_BUCKET}.`);
  if (input.hostname && !["localhost", HOST, "[::1]", "::1"].includes(input.hostname)) fail("El navegador local debe usar localhost o loopback.");
  for (const [service, port] of Object.entries(EMULATORS)) {
    if (input.emulators?.[service] !== `${HOST}:${port}`) fail(`Falta o es incompatible el endpoint local de ${service}.`);
  }
  if (input.authDomain && input.authDomain !== "localhost") fail("Auth domain incompatible con el entorno demo.");
  return {
    mode, region: REGION, host: HOST, ports: EMULATORS,
    config: { apiKey: "demo-local-api-key", authDomain: "localhost", projectId: LOCAL_PROJECT, storageBucket: LOCAL_BUCKET, appId: "demo-local-app", messagingSenderId: "000000000000" },
    functionsBaseUrl: `http://${HOST}:${EMULATORS.functions}/${LOCAL_PROJECT}/${REGION}`,
    publicBaseUrl: "http://localhost:3100",
  };
}

// Explicit references are required for Next's build-time public env replacement.
function readClientEnvironment() {
  return resolveFirebaseEnvironment({
    mode: process.env.NEXT_PUBLIC_FIREBASE_MODE,
    nodeEnv: process.env.NODE_ENV,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    bucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    hostname: typeof window === "undefined" ? undefined : window.location.hostname,
    emulators: {
      auth: process.env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST,
      firestore: process.env.NEXT_PUBLIC_FIRESTORE_EMULATOR_HOST,
      functions: process.env.NEXT_PUBLIC_FIREBASE_FUNCTIONS_EMULATOR_HOST,
      storage: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_EMULATOR_HOST,
    },
  });
}

function localEnvironmentInput() {
  return { mode: "emulators", projectId: LOCAL_PROJECT, bucket: LOCAL_BUCKET,
    emulators: Object.fromEntries(Object.entries(EMULATORS).map(([name, port]) => [name, `${HOST}:${port}`])) };
}

function readRenderEnvironment() {
  const mode = process.env.NEXT_PUBLIC_FIREBASE_MODE || process.env.RESERVA_FIREBASE_MODE;
  if (mode) return readClientEnvironment();
  // Pure render callers historically need no Firebase initialization.
  return resolveFirebaseEnvironment({ mode: "prod", nodeEnv: "production" });
}

function assertLocalUrl(value) {
  let url;
  try { url = new URL(value); } catch { fail("Endpoint local inválido."); }
  if (url.protocol !== "http:" || ![HOST, "localhost", "[::1]"].includes(url.hostname) || url.username || url.password) fail("Endpoint remoto bloqueado antes de la petición.");
  const decoded = decodeURIComponent(url.pathname);
  if (url.port === String(EMULATORS.functions) && !decoded.startsWith(`/${LOCAL_PROJECT}/${REGION}/`)) fail("Proyecto de Functions incompatible.");
  const bucket = decoded.match(/\/b\/([^/]+)/)?.[1];
  if (bucket && bucket !== LOCAL_BUCKET) fail("Bucket del endpoint incompatible.");
  const project = decoded.match(/\/projects\/([^/]+)/)?.[1];
  if (project && project !== LOCAL_PROJECT) fail("Proyecto del endpoint incompatible.");
  return url;
}

function localContentSecurityPolicy() {
  const local = "http://127.0.0.1:* http://localhost:*";
  return `default-src 'self' data: blob: ${local}; script-src 'self' 'unsafe-inline' 'unsafe-eval' blob: ${local}; style-src 'self' 'unsafe-inline' ${local}; connect-src 'self' ${local} ws://localhost:* ws://127.0.0.1:*; img-src 'self' data: blob: ${local}; font-src 'self' data: ${local}; frame-src 'self' blob: ${local}; object-src 'none'; base-uri 'self'; form-action 'self' ${local}`;
}

module.exports = { LOCAL_PROJECT, LOCAL_BUCKET, REGION, EMULATORS, HOST, PRODUCTION_CONFIG, resolveFirebaseEnvironment, readClientEnvironment, readRenderEnvironment, localEnvironmentInput, assertLocalUrl, localContentSecurityPolicy };
