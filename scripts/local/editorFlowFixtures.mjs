import assert from "node:assert/strict";
import { readFileSync, realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
export const contract = require("../../shared/firebaseEnvironment.cjs");
export const origin = "http://localhost:3100";
export const functionUrl = name => `http://${contract.HOST}:${contract.EMULATORS.functions}/${contract.LOCAL_PROJECT}/${contract.REGION}/${name}`;

export function assertEditorFlowSession() {
  const session = process.env.RESERVA_LOCAL_SESSION;
  assert.ok(session, "Run through the isolated launcher; standalone editor browser tests are disabled");
  const workspace = realpathSync(path.join(session, "workspace"));
  assert.equal(realpathSync(process.cwd()), workspace);
  assert.equal(realpathSync(fileURLToPath(new URL("../..", import.meta.url))), workspace);
  const marker = JSON.parse(readFileSync(path.join(session, "session.json"), "utf8"));
  assert.equal(marker.owner, "reservaeldia-local");
  assert.equal(marker.project, contract.LOCAL_PROJECT);
  assert.equal(marker.stopped, undefined);
  assert.equal(process.env.EMAIL_MODE, "disabled");
  assert.equal(process.env.RESERVA_FIREBASE_MODE, "emulators");
  assert.equal(process.env.GCLOUD_PROJECT, contract.LOCAL_PROJECT);
  assert.ok(!process.env.GOOGLE_APPLICATION_CREDENTIALS);
  const environment = contract.readClientEnvironment();
  assert.equal(environment.mode, "emulators");
  assert.equal(environment.config.projectId, contract.LOCAL_PROJECT);
  assert.equal(environment.config.storageBucket, contract.LOCAL_BUCKET);
  for (const [service, variable] of Object.entries({ auth: "FIREBASE_AUTH_EMULATOR_HOST", firestore: "FIRESTORE_EMULATOR_HOST", storage: "FIREBASE_STORAGE_EMULATOR_HOST", functions: "FIREBASE_FUNCTIONS_EMULATOR_HOST" })) {
    assert.equal(process.env[variable], `${contract.HOST}:${contract.EMULATORS[service]}`);
  }
  require("./networkGuard.cjs");
  return session;
}

export async function waitForFixture(check, message, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const result = await check();
    if (result) return result;
    await new Promise(resolve => setTimeout(resolve, 150));
  }
  assert.fail(message);
}

function invitationHtml(title, marker) {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>body{margin:0;background:#f4e8da;color:#4b244a;font-family:Arial,sans-serif}main{max-width:640px;margin:8vh auto;padding:40px;text-align:center;background:#fffaf3;border-radius:20px}h1{font-size:36px}p{line-height:1.6}</style></head><body><main><p>RESERVA EL DIA · PRUEBA LOCAL</p><h1>${title}</h1><p id="synthetic-content">${marker}</p><p>Contenido de prueba sin datos personales.</p></main></body></html>`;
}

export async function createEditorFlowFixtures() {
  assertEditorFlowSession();
  const { ensureAdminApp, localBackendEnvironment } = require("../../functions/lib/firebaseAdmin.js");
  assert.equal(localBackendEnvironment().config.projectId, contract.LOCAL_PROJECT);
  const admin = ensureAdminApp(), db = admin.firestore(), bucket = admin.storage().bucket();
  assert.equal(bucket.name, contract.LOCAL_BUCKET);
  const runId = `editor-ui-${randomUUID()}`;
  const shortId = runId.slice(-12);
  const templateId = `${runId}-template`, legacyTemplateId = `${runId}-html`;
  const templateName = `Invitacion sintetica ${shortId}`;
  const tagSlug = `${runId}-tag`, publicSlug = `${runId}-public`, privateSlug = `${runId}-private`;
  const textId = "synthetic-title";
  const documents = new Set(), objects = new Set(), users = [];
  let cleanupCompleted = false;

  async function createDocument(resource, data) {
    await db.doc(resource).create(data);
    documents.add(resource);
  }
  async function createObject(resource, content, contentType) {
    await bucket.file(resource).save(content, { contentType, preconditionOpts: { ifGenerationMatch: 0 } });
    objects.add(resource);
  }
  function trackDraft(slug, uid) {
    assert.ok(slug === privateSlug || slug.startsWith(`invitacion-sintetica-${shortId}-`));
    documents.add(`borradores/${slug}`);
    documents.add(`analyticsEvents/invitacion_creada:${slug}`);
    objects.add(`borradores/${slug}/index.html`);
    objects.add(`thumbnails_borradores/${uid}/${slug}.webp`);
  }
  async function cleanup() {
    if (cleanupCompleted) return;
    cleanupCompleted = true;
    const outcomes = await Promise.allSettled([
      ...[...objects].map(resource => bucket.file(resource).delete({ ignoreNotFound: true })),
      ...[...documents].map(resource => db.doc(resource).delete()),
      ...users.map(user => admin.auth().deleteUser(user.uid)),
    ]);
    await admin.delete();
    assert.ok(outcomes.every(outcome => outcome.status === "fulfilled"), "Editor synthetic fixture cleanup failed");
  }

  try {
    for (const label of ["a", "b"]) {
      const user = { uid: `${runId}-${label}`, email: `${runId}-${label}@example.test`, password: `Synthetic-${randomUUID()}!` };
      await admin.auth().createUser({ ...user, emailVerified: true, displayName: `Persona sintetica ${label.toUpperCase()}` });
      users.push(user);
      // Existing verified users are fixture setup; login below uses the actual
      // email/password form. Tour opt-out is a normal saved user preference.
      await createDocument(`usuarios/${user.uid}`, { uid: user.uid, email: user.email, nombre: "Persona", apellido: `Sintetica ${label.toUpperCase()}`, fechaNacimiento: "1990-01-02", nombreCompleto: `Persona Sintetica ${label.toUpperCase()}`, profileComplete: true, uiPreferences: { assistantTourOptOut: true } });
      for (const collection of ["welcomeEmailDeliveries", "newUserNotificationDeliveries", "analyticsUsers"]) documents.add(`${collection}/${user.uid}`);
      documents.add(`analyticsEvents/registro_usuario:${user.uid}`);
      await waitForFixture(async () => {
        const snapshots = await Promise.all(["welcomeEmailDeliveries", "newUserNotificationDeliveries"].map(collection => db.doc(`${collection}/${user.uid}`).get()));
        if (!snapshots.every(snapshot => snapshot.exists)) return false;
        for (const snapshot of snapshots) {
          assert.equal(snapshot.data().status, "skipped");
          assert.equal(snapshot.data().skipReason, "EMAIL_DISABLED");
          assert.equal(snapshot.data().attempts, 0);
        }
        return true;
      }, "Disabled synthetic registration effects did not settle");
    }
    const metadata = { nombre: templateName, tipo: "boda", estado: "active", estadoEditorial: "publicada", tags: [tagSlug], editor: "konva" };
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="480"><rect width="480" height="480" fill="#f4e8da"/><rect x="40" y="40" width="400" height="400" rx="24" fill="#fffaf3"/><text x="240" y="215" text-anchor="middle" font-family="Arial" font-size="24" fill="#4b244a">Invitacion sintetica</text><text x="240" y="260" text-anchor="middle" font-family="Arial" font-size="18" fill="#4b244a">Prueba local del editor</text></svg>';
    await createDocument(`plantillas/${templateId}`, { ...metadata, objetos: [{ id: textId, tipo: "texto", seccionId: "synthetic-section", texto: "Texto inicial sintetico", x: 160, y: 180, width: 380, fontSize: 32, fontFamily: "Arial", color: "#4b244a", align: "left", rotation: 0 }], secciones: [{ id: "synthetic-section", orden: 0, altoModo: "fijo", altura: 600, fondo: "#fffaf3" }] });
    await createDocument(`plantillas_catalog/${templateId}`, { ...metadata, portada: `data:image/svg+xml,${encodeURIComponent(svg)}` });
    await createDocument(`plantillas_tags/${tagSlug}`, { slug: tagSlug, label: "Prueba sintetica", active: true });
    // This singleton is required by the real dashboard. Never overwrite a
    // previously configured session; the fresh launcher must own this fixture.
    await createDocument("site_settings/dashboard_home", { version: 1, featuredRow: { active: true, tagSlug }, categoryRows: [], updatedByUid: users[0].uid });
    await createDocument(`plantillas/${legacyTemplateId}`, { nombre: "HTML privado sintetico", tipo: "boda", estado: "active", estadoEditorial: "publicada", editor: "html", objetos: [], secciones: [] });
    await createObject(`plantillas/${legacyTemplateId}/index.html`, invitationHtml("Vista privada sintetica", "SYNTHETIC-PRIVATE-EDITOR-FLOW"), "text/html");
    await createDocument(`publicadas/${publicSlug}`, { userId: users[0].uid, nombre: "Vista publica sintetica", estado: "publicada_activa", publicadaEn: new Date(), venceAt: new Date(Date.now() + 86400000) });
    await createObject(`publicadas/${publicSlug}/index.html`, invitationHtml("Vista publica sintetica", "SYNTHETIC-PUBLIC-EDITOR-FLOW"), "text/html");
    return { db, bucket, users, templateId, templateName, legacyTemplateId, publicSlug, privateSlug, textId, trackDraft, cleanup };
  } catch (error) {
    await cleanup();
    throw error;
  }
}
