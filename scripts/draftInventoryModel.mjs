// Pure observations for the historical inventory. These are not authorization
// decisions and must never be used to adopt an object or backfill ownership.
import { createHmac, randomBytes } from "node:crypto";
import { normalizeTemplateDocument } from "../shared/templates/contract.js";

export const TARGET = Object.freeze({
  project: "reservaeldia-7a440",
  bucket: "reservaeldia-7a440.firebasestorage.app",
});
export const LIMITS = Object.freeze({
  docs: 200, objectsPerPrefix: 200, requests: 200,
  totalBytes: 10 * 1024 * 1024, objectBytes: 2 * 1024 * 1024,
  responseBytes: 512 * 1024, seconds: 180, page: 25,
});
export const DRAFT_FIELDS = Object.freeze([
  "userId", "plantillaId", "editor", "estadoBorrador", "enPapeleraAt",
  "draftCreation.mode", "draftCreation.htmlSha256",
  "draftCreation.sourcePath", "draftCreation.sourceGeneration",
]);

export class InventoryError extends Error {
  constructor(code) { super(code); this.code = code; }
}
const SAFE_ERRORS = new Set([
  "invalid_arguments", "invalid_target", "missing_token", "unsafe_environment",
  "request_limit", "byte_limit", "response_limit", "deadline", "network_error",
  "invalid_response", "remote_401", "remote_403", "remote_404", "remote_429",
  "remote_5xx", "remote_other", "unsafe_request", "unsupported_encoding",
]);
export function safeError(error) {
  return SAFE_ERRORS.has(error?.code) ? error.code : "unexpected_error";
}

export function makePseudonymizer(key = randomBytes(32)) {
  if (!Buffer.isBuffer(key) || key.length < 32) throw new InventoryError("invalid_arguments");
  // Key is ephemeral, never returned/persisted. Namespace prevents correlation
  // of an owner UID with a coincidentally equal object/document identifier.
  return (namespace, id) => createHmac("sha256", key)
    .update(`${namespace}\0${id}`).digest("hex").slice(0, 24);
}

export function isSegment(value) {
  return typeof value === "string" && value.length > 0 && value === value.trim() &&
    Buffer.byteLength(value) <= 1500 && !/[\\/]/.test(value) &&
    ![".", ".."].includes(value) && !/^__.*__$/.test(value) &&
    !Array.from(value).some(c => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127);
}

function readerAcceptsCreationMarker(doc) {
  const value = doc?.draftCreation;
  // Match readCreation in legacyHtmlDraft.ts before applying the stricter
  // inventory transport policy. A path we refuse to fetch is not proof that
  // the application reader rejects the historical marker.
  return value?.mode === "html" && /^[a-f0-9]{64}$/.test(value.htmlSha256) &&
    typeof value.sourcePath === "string" && value.sourcePath.startsWith(`plantillas/${doc.plantillaId}/`) &&
    value.sourcePath.endsWith("/index.html") && /^\d+$/.test(value.sourceGeneration);
}

export function validCreation(doc) {
  const value = doc?.draftCreation;
  if (!readerAcceptsCreationMarker(doc) || !isSegment(doc?.plantillaId) ||
      typeof value.sourceGeneration !== "string") return false;
  const parts = value.sourcePath.split("/");
  return parts.length >= 3 && parts[0] === "plantillas" &&
    parts[1] === doc.plantillaId && parts.at(-1) === "index.html" && parts.every(isSegment);
}

function isTrash(doc) {
  if (["borrador_papelera", "trash", "papelera", "trashed"]
    .includes(String(doc.estadoBorrador || "").trim().toLowerCase())) return true;
  const value = doc.enPapeleraAt;
  const millis = typeof value === "number" ? value :
    typeof value === "string" ? Date.parse(value) : Number(value?.seconds) * 1000;
  return Number.isFinite(millis) && millis > 0;
}

export function templateAvailable(data) {
  if (!data) return false;
  const normalized = normalizeTemplateDocument(data, "inventory-template");
  return normalized.estado !== "archived" && normalized.estadoEditorial === "publicada";
}

export function objectExposure(metadata, aclMode = "unobserved") {
  const custom = metadata?.metadata || {};
  const token = custom.firebaseStorageDownloadTokens;
  const tokenPresent = Array.isArray(token) ? token.length > 0 :
    token !== undefined && token !== null && String(token).trim().length > 0;
  const grants = Array.isArray(metadata?.acl) ? metadata.acl : [];
  return {
    downloadTokenPresent: tokenPresent,
    aclObservation: aclMode,
    aclAllUsers: grants.some(g => g.entity === "allUsers"),
    aclAllAuthenticatedUsers: grants.some(g => g.entity === "allAuthenticatedUsers"),
    publicCacheDirective: /(?:^|,)\s*public(?:\s|,|$)/i.test(metadata?.cacheControl || ""),
  };
}

// A category describes only the observed reader contract. Metadata equality is
// not a byte hash, and even a matching hash does not establish historical authorship.
export function classifyDraft({ slug, doc, artifact, source, template }) {
  const result = (classification, reason, evidence = "metadata") => ({ classification, reason, evidence });
  if (!doc) return result("block", "document_absent");
  if (!isSegment(slug) || typeof doc.userId !== "string" || !doc.userId.trim()) {
    return result("block", "invalid_identity");
  }
  if (isTrash(doc)) return result("block", "trash");
  if (doc.editor === "konva") return result(
    artifact?.state === "present" ? "block" : "outside_html_scope",
    artifact?.state === "present" ? "modern_document_with_html_object" : "modern_document");
  // Reading contenido/objetos/secciones would pull personal payloads. Old docs
  // without an explicit editor need a separately scoped examination, not a guess.
  if (!readerAcceptsCreationMarker(doc)) return result("block", "missing_or_invalid_binding");
  if (!validCreation(doc)) return result("unresolved", "binding_outside_inventory_path_policy");
  if (!doc.editor) return result("unresolved", "legacy_mode_unverified");
  if (doc.editor !== "html") return result("block", "unsupported_editor");
  if (!artifact || artifact.state === "unknown") return result("unresolved", "object_unobserved");
  if (artifact.state === "present") {
    const custom = artifact.metadata?.metadata || {};
    if (custom.ownerUid !== doc.userId || custom.draftSlug !== slug ||
        custom.htmlSha256 !== doc.draftCreation.htmlSha256) return result("block", "binding_mismatch");
    if (artifact.hash === "mismatch") return result("block", "html_hash_mismatch", "sha256");
    return artifact.hash === "match" ? result("compatible", "reader_binding_and_bytes_match", "sha256") :
      result("pending_hash", "binding_matches_bytes_unverified");
  }
  if (artifact.state !== "absent") return result("unresolved", "object_unobserved");
  if (source?.state === "absent") return result("block", "pinned_source_missing");
  if (source?.hash === "mismatch") return result("block", "source_hash_mismatch", "sha256");
  if (template === false) return result("block", "template_not_available");
  if (source?.state !== "present" || template !== true) return result("unresolved", "recovery_prerequisites_unobserved");
  return source.hash === "match" ? result("recovery_verifiable", "pinned_source_and_template_verified", "sha256") :
    result("pending_hash", "pinned_source_available_bytes_unverified");
}

export function decodeFields(fields = {}) {
  const decode = value => {
    if ("stringValue" in value) return value.stringValue;
    if ("booleanValue" in value) return value.booleanValue;
    if ("integerValue" in value) return Number(value.integerValue);
    if ("doubleValue" in value) return value.doubleValue;
    if ("timestampValue" in value) return value.timestampValue;
    if ("mapValue" in value) return decodeFields(value.mapValue.fields);
    if ("nullValue" in value) return null;
    return undefined;
  };
  return Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, decode(value)]));
}

export function assertReadRequest(url, method, body, target = TARGET) {
  const u = new URL(url);
  if (u.protocol !== "https:" || u.username || u.password || u.hash || u.port) throw new InventoryError("unsafe_request");
  const fsRoot = `/v1/projects/${target.project}/databases/(default)/documents`;
  if (u.hostname === "firestore.googleapis.com") {
    if (method === "POST" && u.pathname === `${fsRoot}:runQuery`) {
      const q = body?.structuredQuery;
      if (!q || Object.keys(body).some(k => k !== "structuredQuery") ||
          Object.keys(q).some(k => !["from", "select", "orderBy", "limit", "startAt"].includes(k)) ||
          q.from?.length !== 1 || q.from[0].collectionId !== "borradores" || q.from[0].allDescendants ||
          !Number.isInteger(q.limit) || q.limit < 1 || q.limit > LIMITS.page ||
          !q.select?.fields?.length ||
          q.select?.fields?.some(f => !DRAFT_FIELDS.includes(f.fieldPath))) throw new InventoryError("unsafe_request");
      return;
    }
    const rest = u.pathname.slice(fsRoot.length + 1).split("/");
    const masks = u.searchParams.getAll("mask.fieldPaths");
    const allowedFields = rest[0] === "plantillas" ? ["estado", "estadoEditorial"] : DRAFT_FIELDS;
    if (method === "GET" && u.pathname.startsWith(`${fsRoot}/`) && rest.length === 2 &&
        ["borradores", "plantillas"].includes(rest[0]) && isSegment(decodeURIComponent(rest[1])) &&
        masks.length > 0 && masks.every(field => allowedFields.includes(field)) &&
        Array.from(u.searchParams.keys()).every(key => key === "mask.fieldPaths")) return;
    throw new InventoryError("unsafe_request");
  }
  const storageRoot = `/storage/v1/b/${target.bucket}`;
  if (u.hostname !== "storage.googleapis.com" || method !== "GET") throw new InventoryError("unsafe_request");
  if (u.pathname === storageRoot || u.pathname === `${storageRoot}/iam`) return;
  if (u.pathname === `${storageRoot}/o` && ["borradores/", "proveedores/"].includes(u.searchParams.get("prefix")) &&
      Number(u.searchParams.get("maxResults")) > 0 && Number(u.searchParams.get("maxResults")) <= LIMITS.page) return;
  if (u.pathname.startsWith(`${storageRoot}/o/`)) {
    const object = decodeURIComponent(u.pathname.slice(`${storageRoot}/o/`.length));
    if (["borradores", "plantillas"].includes(object.split("/")[0]) && object.split("/").every(isSegment)) {
      if (u.searchParams.get("alt") === "media" &&
          (!/^\d+$/.test(u.searchParams.get("generation") || "") || !object.endsWith("/index.html"))) {
        throw new InventoryError("unsafe_request");
      }
      return;
    }
  }
  throw new InventoryError("unsafe_request");
}
