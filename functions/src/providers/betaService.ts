import { randomUUID } from "crypto";
import { FieldPath, type Firestore, type Transaction } from "firebase-admin/firestore";
import { HttpsError, type CallableRequest } from "firebase-functions/v2/https";
import { requireSuperAdmin } from "../auth/adminAuth";
import { PROVIDER_IMAGE_MAX_BYTES, PROVIDER_IMAGE_MIME_TYPES } from "./config";
import {
  PROVIDER_BETA_CONFIG_PATH, PROVIDER_SERVICES, PROVIDER_VENUE_FEATURES, VENUE_CATEGORY_IDS,
  ProviderBetaError, createProviderBetaDocument, normalizeProviderDraft, projectProviderPublicContent,
  providerBetaControls, providerBetaMetadata, providerDraftFromDocument, providerPublicationState,
  providerRecord, transitionProviderBeta, sanitizeProviderPublicSnapshot, providerHasPendingChanges, type ProviderBetaOperation, type ProviderDraft,
} from "./betaModel";
import { verifyProviderImageReferences } from "./betaMedia";
import { normalizeAdminSearchFilters, ProviderAdminSearchError, searchAdminProviders } from "./adminSearch";

type Data = Record<string, unknown>;
const MUTATIONS = ["save", "submit", "approve", "requestChanges", "pause", "archive", "resume"];
function providerId(value: unknown): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{1,160}$/.test(value)) throw new HttpsError("invalid-argument", "Identificador de ficha inválido.");
  return value;
}
function serialize(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (value && typeof (value as { toDate?: unknown }).toDate === "function") return (value as { toDate(): Date }).toDate().toISOString();
  if (Array.isArray(value)) return value.map(serialize);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, serialize(item)]));
  return value;
}
export function providerAdminDto(id: string, document: Data, history: Data[] = [], historyCursor: string | null = null, versionToken: string | null = null): Data {
  const beta = providerBetaMetadata(document);
  const pending = providerRecord(document.revisionPendiente);
  const approved = providerRecord(document.aprobada);
  const owner = providerRecord(document.propietario);
  return serialize({
    id, revision: beta.revision, versionToken, contentRevision: beta.contenidoRevision, hasPendingChanges: providerHasPendingChanges(document),
    draft: providerDraftFromDocument(document),
    approved: document.aprobada ? { revision: approved.revision, content: sanitizeProviderPublicSnapshot(approved.contenido), approvedAt: approved.aprobadaEn } : null,
    review: { status: beta.estadoRevision, revision: pending.revision ?? null, content: pending.contenido ? sanitizeProviderPublicSnapshot(pending.contenido) : null, reason: beta.motivoCorreccion },
    publication: { state: providerPublicationState(document), pauseSource: beta.pausaOrigen },
    owner: { userId: typeof owner.userId === "string" ? owner.userId : null, reclamado: owner.reclamado === true },
    internalNotes: beta.notasInternas,
    history, historyCursor,
  }) as Data;
}
async function requirePanel(db: Firestore, transaction?: Transaction): Promise<void> {
  const reference = db.doc(PROVIDER_BETA_CONFIG_PATH);
  const config = transaction ? await transaction.get(reference) : await reference.get();
  if (!providerBetaControls(config.data()).panelEnabled) throw new HttpsError("permission-denied", "La beta de proveedores está cerrada.");
}
async function readProvider(db: Firestore, id: string): Promise<Data> {
  const document = await db.collection("proveedores").doc(id).get();
  if (!document.exists) throw new HttpsError("not-found", "No encontramos esa ficha.");
  return document.data() || {};
}
async function readHistory(db: Firestore, id: string, cursor: unknown = null, pageSize = 50): Promise<{ items: Data[]; nextCursor: string | null }> {
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 50) throw new HttpsError("invalid-argument", "Tamaño de página inválido.");
  const history = db.collection("proveedores").doc(id).collection("historial");
  let query = history.orderBy("at", "desc").orderBy(FieldPath.documentId(), "desc").limit(pageSize + 1);
  if (cursor) {
    const previous = await history.doc(providerId(cursor)).get();
    if (!previous.exists) throw new HttpsError("invalid-argument", "Página de actividad inválida.");
    query = query.startAfter(previous);
  }
  const snapshot = await query.get();
  const items = snapshot.docs.slice(0, pageSize).map((document) => {
    const entry = document.data();
    return { id: document.id, actorUid: entry.actorUid, at: entry.at, action: entry.action, changedFields: entry.changedFields, reason: entry.reason || null, revision: entry.revision };
  });
  return { items, nextCursor: snapshot.size > pageSize ? items[items.length - 1].id : null };
}
async function responseWithHistory(db: Firestore, id: string, document: Data): Promise<Data> {
  const history = await readHistory(db, id);
  return { provider: providerAdminDto(id, document, history.items, history.nextCursor) };
}
async function validateRuntimeCategories(transaction: Transaction, db: Firestore, draft: ProviderDraft): Promise<void> {
  for (const id of draft.categoriaIds) {
    const category = await transaction.get(db.collection("categorias_proveedores").doc(id));
    if (!category.exists || category.data()?.activa !== true || category.data()?.slug !== id) throw new HttpsError("failed-precondition", "Una categoría no está disponible en el catálogo. Revisá la ficha.", { fields: ["categoriaIds"] });
  }
}
async function listProviders(db: Firestore, data: Data): Promise<Data> {
  const filters = normalizeAdminSearchFilters(data);
  return searchAdminProviders(async (after, limit) => {
    // Include one extra row to distinguish a full batch from the actual end.
    // Legacy records use their canonical fields; no search-field migration.
    let query = db.collection("proveedores").orderBy(FieldPath.documentId()).limit(limit + 1)
      .select("nombre", "categoriaPrincipalId", "categoriaIds", "ubicacion.ciudad", "contacto.email", "contacto.emailsAlternativos", "estado", "propietario.userId", "beta.revision", "beta.contenidoRevision", "beta.estadoRevision", "aprobada.revision");
    if (after) query = query.startAfter(after);
    const snapshot = await query.get();
    return { records: snapshot.docs.slice(0, limit).map(record => ({ id: record.id, data: record.data() })), received: snapshot.size, exhausted: snapshot.size <= limit };
  }, filters, data.cursor);
}

/** All operations use the existing superadmin authority; profile fields are never read. */
export async function adminProvidersHandler(request: CallableRequest<unknown>, db: Firestore): Promise<unknown> {
  const actorUid = requireSuperAdmin(request);
  const data = providerRecord(request.data);
  const operation = data.operation;
  if (operation === "access") {
    const config = await db.doc(PROVIDER_BETA_CONFIG_PATH).get();
    const controls = providerBetaControls(config.data());
    return { enabled: controls.panelEnabled, controls };
  }
  await requirePanel(db);
  try {
    if (operation === "catalog") {
      const snapshot = await db.collection("categorias_proveedores").where("activa", "==", true).get();
      const categories = snapshot.docs.map((document) => ({ id: document.id, nombre: document.data().nombre, orden: document.data().orden, tipo: VENUE_CATEGORY_IDS.includes(document.id) ? "lugar" : "profesional" })).sort((a, b) => Number(a.orden) - Number(b.orden));
      return { categories, services: PROVIDER_SERVICES, features: PROVIDER_VENUE_FEATURES, imageUpload: { maxBytes: PROVIDER_IMAGE_MAX_BYTES, mimeTypes: PROVIDER_IMAGE_MIME_TYPES } };
    }
    if (operation === "list") return await listProviders(db, data);
    if (operation === "get") {
      const id = providerId(data.id);
      const snapshot = await db.collection("proveedores").doc(id).get();
      if (!snapshot.exists) throw new HttpsError("not-found", "No encontramos esa ficha.");
      const document = snapshot.data() || {};
      const history = await readHistory(db, id);
      const versionToken = !document.beta && snapshot.updateTime ? `${snapshot.updateTime.seconds}:${snapshot.updateTime.nanoseconds}` : null;
      return { provider: providerAdminDto(id, document, history.items, history.nextCursor, versionToken) };
    }
    if (operation === "history") {
      const id = providerId(data.id);
      await readProvider(db, id);
      return serialize(await readHistory(db, id, data.cursor, data.pageSize == null ? 50 : Number(data.pageSize)));
    }
    if (operation === "preview") {
      const document = await readProvider(db, providerId(data.id));
      const beta = providerBetaMetadata(document);
      if (data.version === "draft") return { content: projectProviderPublicContent(providerDraftFromDocument(document)), revision: beta.contenidoRevision, private: true };
      if (!["approved", "review"].includes(String(data.version))) throw new HttpsError("invalid-argument", "Versión de vista previa inválida.");
      const snapshot = providerRecord(data.version === "approved" ? document.aprobada : document.revisionPendiente);
      if (!snapshot.contenido) throw new HttpsError("failed-precondition", "Esa versión todavía no existe.");
      return { content: serialize(sanitizeProviderPublicSnapshot(snapshot.contenido)), revision: snapshot.revision, private: true };
    }
    if (operation === "create") {
      const id = `prov_${randomUUID().replace(/-/g, "")}`;
      const now = new Date();
      const draft = normalizeProviderDraft(data.draft || {}, undefined, now);
      const document = createProviderBetaDocument(draft, id, actorUid, now, data.internalNotes);
      const reference = db.collection("proveedores").doc(id);
      await db.runTransaction(async (transaction) => {
        await requirePanel(db, transaction);
        await validateRuntimeCategories(transaction, db, draft);
        const photos = draft.imagenes;
        if (photos.portada || photos.logo || photos.galeria.length) throw new HttpsError("failed-precondition", "Guardá la ficha antes de cargar sus imágenes.");
        transaction.create(reference, document);
        transaction.create(reference.collection("historial").doc("revision-1"), { actorUid, at: now, action: "create", changedFields: ["ficha"], reason: null, revision: 1 });
      });
      return responseWithHistory(db, id, document);
    }
    if (typeof operation === "string" && MUTATIONS.includes(operation)) {
      const id = providerId(data.id);
      const reference = db.collection("proveedores").doc(id);
      const document = await db.runTransaction(async (transaction) => {
        await requirePanel(db, transaction);
        const current = await transaction.get(reference);
        if (!current.exists) throw new HttpsError("not-found", "No encontramos esa ficha.");
        const before = current.data() || {};
        if (!before.beta) {
          const token = current.updateTime ? `${current.updateTime.seconds}:${current.updateTime.nanoseconds}` : null;
          if (!token || data.expectedVersionToken !== token) throw new HttpsError("aborted", "La ficha importada cambió desde su lectura. Recargala antes de continuar.");
        }
        const now = new Date();
        const changed = transitionProviderBeta(before, { operation: operation as ProviderBetaOperation, expectedRevision: data.expectedRevision, draft: data.draft, reviewRevision: data.reviewRevision, reason: data.reason, internalNotes: data.internalNotes }, actorUid, now);
        if (["save", "submit", "approve"].includes(operation)) await validateRuntimeCategories(transaction, db, providerDraftFromDocument(changed.document));
        if (operation === "save") {
          const trustedPhotos = await verifyProviderImageReferences(transaction, db, id, providerDraftFromDocument(changed.document).imagenes, { imagenes: providerDraftFromDocument(before).imagenes });
          changed.document.imagenes = trustedPhotos;
          const imagesChanged = JSON.stringify(providerDraftFromDocument(before).imagenes) !== JSON.stringify(trustedPhotos);
          changed.changedFields = changed.changedFields.filter((field) => field !== "imagenes");
          if (imagesChanged) changed.changedFields.push("imagenes");
          const publicChanged = JSON.stringify(projectProviderPublicContent(providerDraftFromDocument(before))) !== JSON.stringify(projectProviderPublicContent(providerDraftFromDocument(changed.document)));
          changed.document.beta.contenidoRevision = publicChanged ? changed.document.beta.revision : providerBetaMetadata(before).contenidoRevision;
        }
        transaction.set(reference, changed.document);
        transaction.create(reference.collection("historial").doc(`revision-${changed.document.beta.revision}`), { actorUid, at: now, action: operation, changedFields: changed.changedFields, reason: changed.reason, revision: changed.document.beta.revision });
        return changed.document;
      });
      return responseWithHistory(db, id, document);
    }
    throw new HttpsError("invalid-argument", "Acción de proveedores desconocida.");
  } catch (error) {
    if (error instanceof ProviderAdminSearchError) throw new HttpsError(error.code, error.message);
    if (error instanceof ProviderBetaError) throw new HttpsError(error.code, error.message, { fields: error.fields });
    throw error;
  }
}
