import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { initializeApp, deleteApp } from "firebase/app";
import { getAuth, connectAuthEmulator, signInWithEmailAndPassword, getIdToken } from "firebase/auth";
import { getFunctions, connectFunctionsEmulator, httpsCallable } from "firebase/functions";
import { getFirestore, connectFirestoreEmulator, terminate } from "firebase/firestore";
import { getStorage, connectStorageEmulator } from "firebase/storage";
import { createProviderBetaFixtures, operator, publishableDraft } from "./providerBetaFixtures.mjs";
import { contract, functionUrl } from "./editorFlowFixtures.mjs";

const require = createRequire(import.meta.url);
export const venueDraft = Object.freeze({ ...publishableDraft, nombre: "Jardín Claro sintético", categoriaPrincipalId: "salones-fiestas",
  descripcionCorta: "Un lugar sintético para celebrar.", descripcion: "Salón de prueba para el directorio privado, sin datos de un negocio real.",
  contacto: { email: "jardin@example.test", whatsapp: "+5492215550100" }, cobertura: [],
  espacio: { capacidadMaxima: 200, capacidadMinima: null, cubierto: true, aireLibre: null, caracteristicas: [], coordenadasVerificadas: false },
  ubicacion: { ciudad: "La Plata", nivel1Nombre: "Buenos Aires", paisCodigo: "AR", direccionCompleta: "Calle sintética 123" } });
export const photographerDraft = Object.freeze({ ...publishableDraft, nombre: "Luz Sur sintético", contacto: { email: "luz@example.test" },
  ubicacion: { ...publishableDraft.ubicacion, direccionCompleta: "DIRECCION-PARTICULAR-SINTETICA-NO-PUBLICAR" } });

// This fixture can only initialize the credential-free demo session verified by
// createProviderBetaFixtures. All mutations below target those local services.
export async function createProviderDirectoryFixtures({ privateEnabled = true, panelEnabled = true } = {}) {
  const base = await createProviderBetaFixtures({ enabled: false });
  const clients = [];
  await base.createDocument("app_config/proveedoresBeta", { panelEnabled, privateDirectoryEnabled: privateEnabled, onboardingEnabled: false, directoryEnabled: false });
  async function client(user) {
    const app = initializeApp({ projectId: contract.LOCAL_PROJECT, storageBucket: contract.LOCAL_BUCKET, apiKey: "synthetic-emulator-only", authDomain: "localhost" }, `directory-${randomUUID()}`);
    const auth = getAuth(app), functions = getFunctions(app), db = getFirestore(app), storage = getStorage(app);
    connectAuthEmulator(auth, `http://${contract.HOST}:${contract.EMULATORS.auth}`, { disableWarnings: true });
    connectFunctionsEmulator(functions, contract.HOST, contract.EMULATORS.functions);
    connectFirestoreEmulator(db, contract.HOST, contract.EMULATORS.firestore);
    connectStorageEmulator(storage, contract.HOST, contract.EMULATORS.storage);
    storage.maxOperationRetryTime = 2000;
    const result = { app, auth, functions, db, storage };
    clients.push(result);
    if (user) await signInWithEmailAndPassword(auth, user.email, user.password);
    return result;
  }
  const privileged = await client(operator);
  const call = async (who, endpoint, data) => (await httpsCallable(who.functions, endpoint, { timeout: 60000 })(data)).data;
  const admin = (operation, data = {}) => call(privileged, "adminProvidersV1", { operation, ...data });
  const directory = (who, operation, data = {}) => call(who, "providerDirectoryV1", { operation, ...data });
  const mutate = async (provider, operation, data = {}) => (await admin(operation, { id: provider.id, expectedRevision: provider.revision,
    ...(provider.versionToken ? { expectedVersionToken: provider.versionToken } : {}), ...data })).provider;
  async function upload(providerId, color = "#b7c7b2") {
    const bytes = await require("../../functions/node_modules/sharp")({ create: { width: 64, height: 64, channels: 3, background: color } }).png().toBuffer();
    const response = await fetch(`${functionUrl("providerAdminImageV1")}?providerId=${encodeURIComponent(providerId)}`, {
      method: "POST", headers: { Authorization: `Bearer ${await getIdToken(privileged.auth.currentUser)}`, "Content-Type": "image/png", Origin: "http://localhost:3100" }, body: bytes,
    });
    assert.equal(response.status, 201, "Synthetic image upload succeeds through the real local handler");
    const { image } = await response.json(); base.objects.add(image.storagePath); return image;
  }
  async function create(draft = photographerDraft, options = {}) {
    let { provider } = await admin("create", { draft, internalNotes: "DIRECTORY-PRIVATE-INTERNAL" });
    base.providerIds.add(provider.id);
    if (options.image) {
      const image = await upload(provider.id);
      provider = await mutate(provider, "save", { draft: { ...provider.draft, imagenes: { portada: image, logo: null, galeria: [image] } } });
    }
    if (options.approved !== false) {
      provider = await mutate(provider, "submit");
      provider = await mutate(provider, "approve", { reviewRevision: provider.review.revision });
    }
    return provider;
  }
  async function closeClients() {
    await Promise.all(clients.map(async value => { await terminate(value.db); await deleteApp(value.app); }));
  }
  async function cleanup() {
    await closeClients();
    await base.cleanup();
  }
  return { ...base, client, privileged, admin, directory, mutate, upload, create, closeClients, cleanup,
    setControls: fields => base.db.doc("app_config/proveedoresBeta").set(fields, { merge: true }) };
}
