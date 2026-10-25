import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { assertEditorFlowSession, contract } from "./editorFlowFixtures.mjs";

const require = createRequire(import.meta.url);
export const operator = Object.freeze({ uid: "local-provider-admin", email: "local-provider-admin@example.test", password: "Local-provider-only-1!" });
export const ordinary = Object.freeze({ uid: "local-provider-couple", email: "local-provider-couple@example.test", password: "Local-provider-only-2!" });
export const adminClaim = Object.freeze({ uid: "local-provider-claim", email: "local-provider-claim@example.test", password: "Local-provider-only-3!" });
export const publishableDraft = Object.freeze({ nombre: "Estudio Aurora sintético", categoriaPrincipalId: "foto-video",
  descripcionCorta: "Fotografía para casamientos.", descripcion: "Equipo sintético de fotografía para probar la beta privada.",
  contacto: { email: "aurora@example.test" }, ubicacion: { ciudad: "La Plata", nivel1Nombre: "Buenos Aires", paisCodigo: "AR" }, cobertura: ["La Plata"] });

export async function createProviderBetaFixtures({ enabled = true } = {}) {
  assertEditorFlowSession();
  assert.equal(process.env.SUPERADMINS_UIDS, operator.uid);
  const { ensureAdminApp, localBackendEnvironment } = require("../../functions/lib/firebaseAdmin.js");
  assert.equal(localBackendEnvironment().config.projectId, contract.LOCAL_PROJECT);
  const app = ensureAdminApp(), db = app.firestore(), bucket = app.storage().bucket();
  assert.equal(bucket.name, contract.LOCAL_BUCKET);
  const documents = new Set(), providerIds = new Set(), users = [], objects = new Set();
  const runId = `provider-beta-${randomUUID()}`;
  const createDocument = async (resource, data) => { await db.doc(resource).create(data); documents.add(resource); };
  async function cleanup() {
    const results = await Promise.allSettled([
      ...[...providerIds].map(id => db.recursiveDelete(db.doc(`proveedores/${id}`))),
      ...[...documents].map(resource => db.doc(resource).delete()),
      ...[...objects].map(resource => bucket.file(resource).delete({ ignoreNotFound: true })),
      ...users.map(user => app.auth().deleteUser(user.uid)),
    ]);
    await app.delete();
    assert.ok(results.every(result => result.status === "fulfilled"), "Synthetic provider fixtures must clean up");
  }
  try {
    for (const user of [operator, ordinary, adminClaim]) {
      await app.auth().createUser({ ...user, emailVerified: true, displayName: "Persona sintética beta" });
      users.push(user);
      if (user === adminClaim) await app.auth().setCustomUserClaims(user.uid, { admin: true });
      await createDocument(`usuarios/${user.uid}`, { uid: user.uid, email: user.email, nombre: "Persona", apellido: "Sintética", fechaNacimiento: "1990-01-01", profileComplete: true, uiPreferences: { assistantTourOptOut: true } });
      for (const collection of ["welcomeEmailDeliveries", "newUserNotificationDeliveries", "analyticsUsers"]) documents.add(`${collection}/${user.uid}`);
      documents.add(`analyticsEvents/registro_usuario:${user.uid}`);
    }
    for (const { documentId, ...category } of require("../../functions/lib/providers/config.js").PROVIDER_CATEGORY_CATALOG) {
      await createDocument(`categorias_proveedores/${documentId}`, { ...category, creadoEn: new Date(), actualizadoEn: new Date() });
    }
    if (enabled) await createDocument("app_config/proveedoresBeta", { panelEnabled: true, onboardingEnabled: false, directoryEnabled: false });
    return { app, db, bucket, runId, users, createDocument, documents, providerIds, objects, cleanup };
  } catch (error) { await cleanup(); throw error; }
}
