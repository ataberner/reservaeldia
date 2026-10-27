import { createHash, randomUUID } from "node:crypto";
import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { HttpsError, type CallableRequest } from "firebase-functions/v2/https";
import { requireSuperAdmin } from "../auth/adminAuth";
import { buildDraftMusicPatch } from "../music/draftMusicWrite";
import { normalizeMusicConfig } from "../music/config";
import { buildDraftContentMeta } from "./sourceOfTruth";
import { DRAFT_STATES, resolveDraftStateFromData } from "./draftState";
import { requireDraftPathSegment } from "./templateDraftCreation";
const { MUSIC_FEATURE_AVAILABILITY } = require("../../shared/musicConfig.cjs");

type RecordValue = Record<string, unknown>;
const CONTENT_KEYS = [
  "nombre", "objetos", "secciones", "rsvp", "gifts", "music", "eventDetails",
  "templateAuthoringDraft", "templateInput", "tipoInvitacion", "portada", "portadaSource",
  "designerAiConversation",
];
const PATCH_KEYS = new Set([...CONTENT_KEYS, "draftContentMeta", "thumbnailUrl", "thumbnailUpdatedAt"]);
const INPUT_KEYS = new Set(["initialValues", "values", "defaults", "changedKeys", "policyVersion", "updatedAt"]);

function asRecord(value: unknown): RecordValue {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new HttpsError("invalid-argument", "El documento del editor no es valido.");
  }
  return value as RecordValue;
}

function canonicalContent(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalContent);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => [key, canonicalContent(child)]));
  }
  return value;
}

/** Content comparison ignores thumbnail and server timestamps, including nanosecond serialization differences. */
export function adminDraftContentRevision(data: RecordValue): string {
  const content = Object.fromEntries([...CONTENT_KEYS, "adminDraftRevision"].filter(key => key in data).map(key => [key, data[key]]));
  for (const key of ["templateInput", "templateAuthoringDraft"]) {
    if (!content[key] || typeof content[key] !== "object" || Array.isArray(content[key])) continue;
    const metadata = { ...content[key] as RecordValue };
    delete metadata.updatedAt;
    delete metadata.appliedAt;
    content[key] = metadata;
  }
  return createHash("sha256").update(JSON.stringify(canonicalContent(content))).digest("hex");
}

function assertEditable(data: RecordValue, ownerUid: string, expectedRevision: unknown): void {
  if (data.userId !== ownerUid) throw new HttpsError("permission-denied", "El borrador no pertenece al usuario indicado.");
  if (resolveDraftStateFromData(data) !== DRAFT_STATES.ACTIVE || data.templateWorkspace ||
      !Array.isArray(data.objetos) || !Array.isArray(data.secciones)) {
    throw new HttpsError("failed-precondition", "Este borrador no esta disponible para editar.");
  }
  if (typeof expectedRevision !== "string" || expectedRevision !== adminDraftContentRevision(data)) {
    throw new HttpsError("aborted", "El borrador cambio durante la edicion. Volve a abrirlo para cargar los cambios recientes.");
  }
}

function editorPatch(rawPatch: unknown, current: RecordValue, actorUid: string, timestamp: unknown): RecordValue {
  const incoming = asRecord(rawPatch);
  if (!Object.keys(incoming).length || Object.keys(incoming).some(key =>
    !PATCH_KEYS.has(key) && !(key.startsWith("templateInput.") && INPUT_KEYS.has(key.slice(14))))) {
    throw new HttpsError("invalid-argument", "La operacion solo admite campos del editor.");
  }
  const patch = { ...incoming };
  const dotted = Object.keys(patch).filter(key => key.startsWith("templateInput."));
  if (dotted.length) {
    if ("templateInput" in patch) throw new HttpsError("invalid-argument", "El contenido dinamico es ambiguo.");
    const input = { ...(current.templateInput ? asRecord(current.templateInput) : {}) };
    for (const key of dotted) { input[key.slice(14)] = patch[key]; delete patch[key]; }
    patch.templateInput = input;
  }
  for (const key of ["objetos", "secciones"]) {
    if (key in patch && !Array.isArray(patch[key])) throw new HttpsError("invalid-argument", "Los objetos y secciones deben ser listas.");
  }
  for (const key of ["nombre", "tipoInvitacion", "thumbnailUrl"]) {
    if (key in patch && typeof patch[key] !== "string") throw new HttpsError("invalid-argument", "Los metadatos del borrador no son validos.");
  }
  if ("music" in patch) {
    const unchanged = JSON.stringify(normalizeMusicConfig(patch.music)) === JSON.stringify(normalizeMusicConfig(current.music));
    if (!unchanged && MUSIC_FEATURE_AVAILABILITY.editor !== true) {
      throw new HttpsError("failed-precondition", "Musica no esta disponible.");
    }
    patch.music = buildDraftMusicPatch({ music: patch.music }, timestamp, current.music).music;
    if (unchanged) {
      if (Object.prototype.hasOwnProperty.call(current, "music")) patch.music = current.music;
      else delete patch.music;
    }
  }
  for (const key of ["templateAuthoringDraft", "templateInput"]) {
    if (!(key in patch)) continue;
    const content = { ...asRecord(patch[key]) };
    delete content.updatedAt;
    delete content.appliedAt;
    patch[key] = {
      ...content,
      ...(key === "templateAuthoringDraft" ? { updatedByUid: actorUid } : {}),
      ...(key === "templateInput" && current.templateInput && asRecord(current.templateInput).appliedAt != null
        ? { appliedAt: asRecord(current.templateInput).appliedAt } : {}),
      updatedAt: timestamp,
    };
  }
  if ("thumbnailUpdatedAt" in patch) patch.thumbnailUpdatedAt = timestamp;
  return patch;
}

export async function saveAdminDraftPatchHandler(
  request: CallableRequest<unknown>, db: Firestore,
  normalizeAssets: (patch: RecordValue, context: { actorUid: string; ownerUid: string; slug: string; persistedDraft: RecordValue }) => Promise<RecordValue> = async patch => patch
): Promise<{ ok: true; slug: string; revision: string; adminDraftRevision: string | null }> {
  const actorUid = requireSuperAdmin(request);
  const data = asRecord(request.data);
  const slug = requireDraftPathSegment(data.slug, "slug");
  const ownerUid = requireDraftPathSegment(data.ownerUid, "ownerUid");
  const ref = db.collection("borradores").doc(slug);
  const before = await ref.get();
  if (!before.exists) throw new HttpsError("not-found", "El borrador no existe.");
  const initial = before.data() || {};
  assertEditable(initial, ownerUid, data.expectedRevision);
  // Reject field/ownership attacks before Storage effects; recheck CAS in the transaction below.
  editorPatch(data.patch, initial, actorUid, null);
  // Never trust client-provided asset history. Every antecedent belongs to the
  // content revision rechecked inside the transaction, excluding audit/metadata.
  const persistedDraft = Object.fromEntries(CONTENT_KEYS.filter(key => key in initial).map(key => [key, initial[key]]));
  const normalized = await normalizeAssets(asRecord(data.patch), { actorUid, ownerUid, slug, persistedDraft });
  const operationId = randomUUID();
  return db.runTransaction(async transaction => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) throw new HttpsError("not-found", "El borrador no existe.");
    const current = snapshot.data() || {};
    assertEditable(current, ownerUid, data.expectedRevision);
    const timestamp = FieldValue.serverTimestamp();
    const patch = editorPatch(normalized, current, actorUid, timestamp);
    const editsContent = Object.keys(patch).some(key => CONTENT_KEYS.includes(key));
    if (editsContent) {
      const metadata = patch.draftContentMeta ? asRecord(patch.draftContentMeta) : {};
      patch.adminDraftRevision = operationId;
      patch.draftContentMeta = { ...buildDraftContentMeta({ lastWriter: "canvas", reason: metadata.lastReason }), updatedAt: timestamp };
      patch.ultimaEdicion = timestamp;
      patch.adminAudit = {
        ...(current.adminAudit ? asRecord(current.adminAudit) : {}),
        updatedByUid: actorUid, updatedAt: timestamp, ownerUid, role: "superadmin",
      };
    } else {
      delete patch.draftContentMeta;
      if (!Object.keys(patch).length) throw new HttpsError("invalid-argument", "No hay cambios para guardar.");
    }
    transaction.set(ref, patch, { mergeFields: Object.keys(patch) });
    const next = { ...current, ...patch };
    return { ok: true as const, slug, revision: adminDraftContentRevision(next),
      adminDraftRevision: typeof next.adminDraftRevision === "string" ? next.adminDraftRevision : null };
  });
}
