import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const model = require("./lib/providers/betaModel.js");
const { validateProveedor } = require("./lib/providers/validation.js");
const { mapPortalProviderRecord } = require("./lib/providers/mapper.js");
const { providerAdminDto, adminProvidersHandler } = require("./lib/providers/betaService.js");
const NOW = new Date("2026-10-25T12:00:00Z");
const ACTOR = "synthetic-admin";
function completeDraft(overrides = {}) {
  return model.normalizeProviderDraft({ nombre: "Estudio sintético", categoriaPrincipalId: "foto-video", descripcionCorta: "Fotografía de casamientos", descripcion: "Cobertura fotográfica completa del casamiento.", contacto: { email: "estudio@example.test" }, ubicacion: { ciudad: "La Plata", nivel1Nombre: "Buenos Aires", paisCodigo: "AR" }, cobertura: ["La Plata"], ...overrides }, undefined, NOW);
}
function create(draft = completeDraft()) { return model.createProviderBetaDocument(draft, "prov_synthetic", ACTOR, NOW); }
function change(document, operation, extra = {}) {
  return model.transitionProviderBeta(document, { operation, expectedRevision: document.beta.revision, ...extra }, ACTOR, NOW).document;
}
function approve(document) {
  const submitted = change(document, "submit");
  return change(submitted, "approve", { reviewRevision: submitted.revisionPendiente.revision });
}

test("beta gates deny by default and unimplemented onboarding/directory cannot be opened by config", () => {
  for (const configuration of [undefined, null, {}, { panelEnabled: "true" }]) assert.equal(model.providerBetaControls(configuration).panelEnabled, false);
  assert.deepEqual(model.providerBetaControls({ panelEnabled: true, onboardingEnabled: true, directoryEnabled: true }), { panelEnabled: true, privateDirectoryEnabled: false, onboardingEnabled: false, directoryEnabled: false });
});
test("incomplete V3 draft preserves unknown values and canonical compatibility", () => {
  const document = create(model.normalizeProviderDraft({}));
  assert.equal(document.nombre, "");
  assert.equal(document.espacio.capacidadMaxima, null);
  assert.equal(document.espacio.cubierto, null);
  assert.equal(document.precio.modalidad, "consultar");
  assert.equal(document.visible, false);
  assert.deepEqual(validateProveedor(document), []);
  assert.throws(() => change(document, "submit"), (error) => error.code === "failed-precondition" && error.fields.includes("contacto"));
});
test("publication requires actual content/contact/coverage but never images, prices or services", () => {
  assert.deepEqual(model.providerPublicationIssues(completeDraft()), []);
  const missingCoverage = completeDraft({ cobertura: [] });
  assert.deepEqual(model.providerPublicationIssues(missingCoverage), ["cobertura"]);
  const venue = completeDraft({ categoriaPrincipalId: "salones-fiestas", cobertura: [] });
  assert.deepEqual(model.providerPublicationIssues(venue), []);
  assert.equal(approve(create(venue)).estado, "publicado");
  assert.equal(approve(create(venue)).visible, false);
});
test("save never changes approved version, and content may become incomplete again", () => {
  const published = approve(create());
  const snapshot = structuredClone(published.aprobada);
  const edited = change(published, "save", { draft: { ...model.providerDraftFromDocument(published), nombre: "" } });
  assert.deepEqual(edited.aprobada, snapshot);
  assert.equal(edited.estado, "publicado");
  assert.equal(edited.visible, false);
  assert.deepEqual(validateProveedor(edited), []);
});
test("pending status is derived from approved content and includes unsent changes, not internal notes", () => {
  const draft = create();
  assert.equal(model.providerHasPendingChanges(draft), true);
  const published = approve(draft);
  assert.equal(model.providerHasPendingChanges(published), false);
  const internal = change(published, "save", { draft: model.providerDraftFromDocument(published), internalNotes: "Evidencia privada" });
  assert.equal(internal.beta.contenidoRevision, published.beta.contenidoRevision);
  assert.equal(model.providerHasPendingChanges(internal), false);
  const edited = change(internal, "save", { draft: { ...model.providerDraftFromDocument(internal), nombre: "Nuevo nombre" } });
  assert.equal(edited.beta.estadoRevision, "sin_cambios");
  assert.equal(model.providerHasPendingChanges(edited), true);
  assert.equal(model.providerHasPendingChanges(approve(edited)), false);
});
test("approval is bound to concrete revision and concurrent edits never overwrite silently", () => {
  const initial = create();
  const submitted = change(initial, "submit");
  const edited = change(submitted, "save", { draft: { ...model.providerDraftFromDocument(submitted), nombre: "Edición posterior" } });
  assert.throws(() => change(edited, "approve", { reviewRevision: submitted.revisionPendiente.revision }), { code: "aborted" });
  assert.throws(() => model.transitionProviderBeta(edited, { operation: "save", expectedRevision: initial.beta.revision, draft: completeDraft() }, ACTOR, NOW), { code: "aborted" });
  assert.throws(() => change(submitted, "approve", { reviewRevision: 999 }), { code: "aborted" });
  assert.equal(approve(edited).aprobada.contenido.nombre, "Edición posterior");
});
test("approval preserves pauses/archive and resume respects administrative restrictions", () => {
  let document = change(create(), "pause", { reason: "Verificación pendiente" });
  document = approve(document);
  assert.equal(document.estado, "pausado");
  assert.equal(document.beta.pausaOrigen, "administracion");
  document = change(document, "resume");
  assert.equal(document.estado, "publicado");
  const archived = change(document, "archive", { reason: "Cese de actividad" });
  assert.equal(archived.activo, false);
  assert.equal(approve(archived).estado, "eliminado");
  assert.deepEqual(archived.propietario, document.propietario);
  assert.ok(archived.aprobada);
  const restricted = change(document, "pause", { reason: "Restricción" });
  restricted.validacion.estado = "suspendido";
  assert.throws(() => change(restricted, "resume"), { code: "failed-precondition" });
  const restrictedDraft = create();
  restrictedDraft.validacion.estado = "suspendido";
  const approvedRestricted = approve(restrictedDraft);
  assert.equal(approvedRestricted.estado, "pausado");
  assert.equal(approvedRestricted.beta.pausaOrigen, "administracion");
  assert.equal(approvedRestricted.validacion.estado, "suspendido");
});
test("correction requests preserve approved snapshot and require a reason", () => {
  const published = approve(create());
  const submitted = change(published, "submit");
  assert.throws(() => change(submitted, "requestChanges"), { code: "invalid-argument" });
  const corrected = change(submitted, "requestChanges", { reason: "Revisar descripción" });
  assert.equal(corrected.beta.estadoRevision, "requiere_correcciones");
  assert.equal(corrected.beta.motivoCorreccion, "Revisar descripción");
  assert.deepEqual(corrected.aprobada, published.aprobada);
});
test("projection excludes canonical private data, personal address, source metadata and private image URLs", () => {
  const draft = completeDraft({ ubicacion: { ciudad: "La Plata", nivel1Nombre: "Buenos Aires", direccionCompleta: "Dirección particular privada", coordenadas: { latitud: -34, longitud: -58 } }, imagenes: { portada: { id: "photo", storagePath: "proveedores/prov_synthetic/media/photo.webp", url: "https://private.test/?token=secret", urlOriginal: "https://source.test/private", alt: "Imagen" }, galeria: [] } });
  const document = create(draft);
  document.propietario.userId = "private-owner";
  document.beta.notasInternas = "private-notes";
  document.fuente.urlOriginal = "private-source";
  const content = model.projectProviderPublicContent(model.providerDraftFromDocument(document));
  const serialized = JSON.stringify(content);
  for (const secret of ["private-owner", "private-notes", "private-source", "Dirección particular", "token=", "urlOriginal", "enviadaPor", "propietario", "fuente", "importacion"]) assert.equal(serialized.includes(secret), false, secret);
  assert.equal("direccion" in content.ubicacion, false);
  assert.equal("coordenadas" in content.ubicacion, false);
  assert.deepEqual(content.contratacion, {});
});
test("venue projection exposes coordinates only after explicit verification", () => {
  const draft = completeDraft({ categoriaPrincipalId: "salones-fiestas", ubicacion: { ciudad: "La Plata", nivel1Nombre: "Buenos Aires", direccionCompleta: "Establecimiento sintético", coordenadas: { latitud: -34, longitud: -58 } } });
  assert.equal(model.projectProviderPublicContent(draft).ubicacion.coordenadas, null);
  draft.espacio.coordenadasVerificadas = true;
  draft.ubicacion.coordenadas.internalNotes = "private-coordinate-evidence";
  assert.deepEqual(model.projectProviderPublicContent(draft).ubicacion.coordenadas, { latitud: -34, longitud: -58 });
  const snapshot = model.projectProviderPublicContent(draft);
  snapshot.ubicacion.coordenadas.internalNotes = "private-coordinate-evidence";
  assert.deepEqual(model.sanitizeProviderPublicSnapshot(snapshot).ubicacion.coordenadas, { latitud: -34, longitud: -58 });
  draft.ubicacion.coordenadas.latitud = 999;
  assert.equal(model.projectProviderPublicContent(draft).ubicacion.coordenadas, null);
});
test("public projection and existing snapshots discard unknown nested private fields", () => {
  const draft = completeDraft();
  draft.precio.internalEvidence = "private-price-evidence";
  draft.contratacion.internalNotes = "private-hiring-note";
  draft.imagenes.privateDocument = "private-image-evidence";
  const content = model.projectProviderPublicContent(draft);
  content.precio.internalEvidence = "private-price-evidence";
  content.contratacion.internalNotes = "private-hiring-note";
  content.propietario = { userId: "private-owner" };
  const clean = model.sanitizeProviderPublicSnapshot(content);
  assert.equal(JSON.stringify(clean).includes("private-"), false);
  const document = create(draft);
  document.aprobada = { revision: 1, contenido: content, aprobadaEn: NOW, aprobadaPor: ACTOR };
  document.revisionPendiente = { revision: 1, contenido: content, enviadaEn: NOW, enviadaPor: ACTOR };
  const dto = providerAdminDto("prov_synthetic", document);
  assert.equal(JSON.stringify(dto.approved.content).includes("private-"), false);
  assert.equal(JSON.stringify(dto.review.content).includes("private-"), false);
});
test("payload cannot set permissions, IDs, lifecycle, owner, source or review state", () => {
  for (const field of ["id", "propietario", "beta", "fuente", "estado", "visible", "admin", "aprobada"]) assert.throws(() => model.normalizeProviderDraft({ [field]: "malicious" }), { code: "invalid-argument" });
  assert.throws(() => completeDraft({ contacto: { sitioWeb: "javascript:alert(1)" } }), { code: "invalid-argument" });
  assert.throws(() => completeDraft({ servicios: ["maquillaje"] }), { code: "invalid-argument" });
  assert.throws(() => completeDraft({ categoriaIds: ["salones-fiestas"] }), { code: "invalid-argument" });
});
test("phone edits remove stale normalized values without silently changing WhatsApp", () => {
  const previous = completeDraft({ contacto: { telefonoOriginal: "+541122223333", telefonoNormalizado: "+541122223333", whatsapp: "+5491122223333", email: "contacto@example.test" } });
  const edited = model.normalizeProviderDraft({ ...previous, contacto: { ...previous.contacto, telefonoOriginal: "+541144445555" } }, previous, NOW);
  assert.equal(edited.contacto.telefonoNormalizado, "+541144445555");
  assert.equal(edited.contacto.whatsapp, "+5491122223333");
  assert.equal(model.projectProviderPublicContent(edited).contacto.telefono, "+541144445555");
  const incomplete = model.normalizeProviderDraft({ ...previous, contacto: { ...previous.contacto, telefonoOriginal: "1234" } }, previous, NOW);
  assert.equal(incomplete.contacto.telefonoNormalizado, null);
});
test("existing mixed category families remain editable without inventing a migration", () => {
  const previous = completeDraft();
  previous.categoriaIds.push("salones-fiestas");
  assert.deepEqual(model.normalizeProviderDraft({ ...previous, nombre: "Nombre corregido" }, previous, NOW).categoriaIds, previous.categoriaIds);
});
test("prices require positive amount/currency/unit and use persisted native dates without inferred minima", () => {
  assert.throws(() => completeDraft({ precio: { modalidad: "desde", importe: 0, moneda: "ARS", unidad: "evento" } }), { code: "invalid-argument" });
  const draft = completeDraft({ precio: { modalidad: "desde", importe: 100, moneda: "ARS", unidad: "evento" } });
  assert.ok(draft.precio.actualizadoEn instanceof Date);
  const later = new Date("2026-10-26T12:00:00Z");
  const unchanged = model.normalizeProviderDraft(draft, draft, later);
  assert.equal(unchanged.precio.actualizadoEn.toISOString(), NOW.toISOString());
  const changed = model.normalizeProviderDraft({ ...draft, precio: { ...draft.precio, importe: 120 } }, draft, later);
  assert.equal(changed.precio.actualizadoEn.toISOString(), later.toISOString());
});
test("schema2 import reads without mutation and upgrades on explicit save preserving identity/provenance", () => {
  const legacy = mapPortalProviderRecord({ categoria: "foto-video", nombre: "Importado sintético", pagina: "https://portalcasamientos.com.ar/foto-video/estudio-ab123", email: "original@example.test", localidad: "La Plata", provincia: "Buenos Aires", pais: "AR", sitio_web: "https://example.test" }, { sourceFile: { version: 1, createdAt: null, reason: null, origin: "https://portalcasamientos.com.ar", providerUrls: [], results: [] }, sourceFileName: "fixture.json", dateFactory: () => NOW }).document;
  legacy.descripcionCorta = "Descripción literal ".repeat(50);
  legacy.redesSociales.otras = [{ tipo: "valor_original_invalido", url: "dominio sin esquema" }];
  const original = structuredClone(legacy);
  const dto = providerAdminDto("pcar_existing", legacy);
  assert.equal(dto.revision, 0);
  assert.equal(dto.draft.espacio.capacidadMaxima, null);
  assert.deepEqual(legacy, original);
  const upgraded = model.transitionProviderBeta(legacy, { operation: "save", expectedRevision: 0, draft: { ...dto.draft, nombre: "Nombre corregido" } }, ACTOR, NOW).document;
  assert.equal(upgraded.schemaVersion, 3);
  assert.deepEqual(upgraded.fuente, legacy.fuente);
  assert.deepEqual(upgraded.propietario, legacy.propietario);
  assert.equal(upgraded.slug, legacy.slug);
  assert.equal(upgraded.descripcionCorta, legacy.descripcionCorta.trim());
  assert.equal(upgraded.redesSociales.otras[0].url, "dominio sin esquema");
  assert.deepEqual(model.projectProviderPublicContent(model.providerDraftFromDocument(upgraded)).redesSociales.otras, []);
});
test("authorization executes before reads and cannot be obtained through profile/admin claims", async () => {
  const previous = process.env.SUPERADMINS_UIDS;
  process.env.SUPERADMINS_UIDS = ACTOR;
  try {
    const db = { doc() { throw new Error("unexpected read"); } };
    for (const request of [{ data: { operation: "access" } }, { auth: { uid: "ordinary", token: { admin: true, superadmin: true, role: "admin" } }, data: { operation: "access" } }]) await assert.rejects(() => adminProvidersHandler(request, db), (error) => ["unauthenticated", "permission-denied"].includes(error.code));
    const closedDb = { doc() { return { get: async () => ({ data: () => ({}) }) }; } };
    await assert.rejects(() => adminProvidersHandler({ auth: { uid: ACTOR, token: {} }, data: { operation: "list" } }, closedDb), { code: "permission-denied" });
  } finally { if (previous === undefined) delete process.env.SUPERADMINS_UIDS; else process.env.SUPERADMINS_UIDS = previous; }
});
