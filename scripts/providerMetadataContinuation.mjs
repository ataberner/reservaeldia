// Fixed, read-only provider projection. Never fetches image URLs or stores them.
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { TARGET, LIMITS, InventoryError, safeError, makePseudonymizer, isSegment } from "./draftInventoryModel.mjs";
import { createReader } from "./inventoryLegacyDrafts.mjs";
import { readCheckpoint, saveCheckpoint, validateSessionDir, sanitizeObject, TOTAL_LIMITS } from "./inventoryContinuation.mjs";

const root = `https://firestore.googleapis.com/v1/projects/${TARGET.project}/databases/(default)/documents`;
const prefix = `projects/${TARGET.project}/databases/(default)/documents/proveedores/`;
export const PROVIDER_FIELDS = Object.freeze(["estado", "activo", "visible", "imagenes.portada.storagePath", "imagenes.portada.url", "imagenes.galeria"]);
const states = new Set(["importado", "borrador", "pendiente_revision", "publicado", "pausado", "rechazado", "eliminado"]);

export function assertProviderReadRequest(address, method, body) {
  const query = body?.structuredQuery;
  if (address !== `${root}:runQuery` || method !== "POST" || !query ||
      Object.keys(body).length !== 1 || Object.keys(query).some(key => !["from", "select", "orderBy", "limit", "startAt"].includes(key)) ||
      JSON.stringify(query.from) !== JSON.stringify([{ collectionId: "proveedores" }]) ||
      JSON.stringify(query.select) !== JSON.stringify({ fields: PROVIDER_FIELDS.map(fieldPath => ({ fieldPath })) }) ||
      JSON.stringify(query.orderBy) !== JSON.stringify([{ field: { fieldPath: "__name__" }, direction: "ASCENDING" }]) ||
      query.limit !== 10) throw new InventoryError("unsafe_request");
  if (query.startAt) {
    const cursor = query.startAt.values?.[0]?.referenceValue;
    if (Object.keys(query.startAt).length !== 2 || query.startAt.before !== false || query.startAt.values?.length !== 1 ||
        Object.keys(query.startAt.values[0]).length !== 1 || typeof cursor !== "string" || !cursor.startsWith(prefix) || !isSegment(cursor.slice(prefix.length))) {
      throw new InventoryError("unsafe_request");
    }
  }
}

export function imageReference(value, kind, pseudonym) {
  if (typeof value !== "string" || !value) return null;
  if (kind === "storagePath") return value.startsWith("proveedores/") && !/[?#]/.test(value)
    ? { kind, targetName: value, objectAlias: pseudonym("object", value), tokenAliases: [] } : { kind: "unrecognized_storage_path" };
  try {
    const url = new URL(value); let name;
    if (url.protocol !== "https:" || url.username || url.password) return { kind: "unrecognized_url" };
    const firebase = `/v0/b/${TARGET.bucket}/o/`;
    const gcs = `/${TARGET.bucket}/`;
    if (url.hostname === "firebasestorage.googleapis.com" && url.pathname.startsWith(firebase)) name = decodeURIComponent(url.pathname.slice(firebase.length));
    else if (url.hostname === "storage.googleapis.com" && url.pathname.startsWith(gcs)) name = decodeURIComponent(url.pathname.slice(gcs.length));
    else return { kind: "external_or_unrecognized_url" };
    if (!name.startsWith("proveedores/")) return { kind: "other_prefix_url" };
    return { kind: "target_storage_url", targetName: name, objectAlias: pseudonym("object", name),
      tokenAliases: url.searchParams.getAll("token").filter(Boolean).map(token => pseudonym("token", token)) };
  } catch { return { kind: "unrecognized_url" }; }
}

export function sanitizeProvider(document, pseudonym) {
  if (!document.name?.startsWith(prefix) || !isSegment(document.name.slice(prefix.length))) throw new InventoryError("invalid_response");
  const fields = document.fields || {}, data = { estado: fields.estado?.stringValue, activo: fields.activo?.booleanValue, visible: fields.visible?.booleanValue }, refs = [];
  const images = fields.imagenes?.mapValue?.fields;
  const append = (image, field) => {
    if (!image || typeof image !== "object") return;
    for (const kind of ["storagePath", "url"]) {
      const ref = imageReference(image[kind]?.stringValue, kind, pseudonym);
      if (ref) refs.push({ field: `${field}.${kind}`, ...ref });
    }
  };
  append(images?.portada?.mapValue?.fields, "imagenes.portada");
  const gallery = images?.galeria?.arrayValue?.values;
  if (Array.isArray(gallery)) gallery.forEach((image, index) => append(image.mapValue?.fields, `imagenes.galeria[${index}]`));
  return { name: document.name, alias: pseudonym("provider", document.name.slice(prefix.length)),
    state: states.has(data.estado) ? data.estado : "unknown", active: typeof data.activo === "boolean" ? data.activo : null,
    visible: typeof data.visible === "boolean" ? data.visible : null,
    publicEligible: data.estado === "publicado" && data.activo === true && data.visible === true, refs };
}

export function providerSummary(state) {
  const value = state.providerInventory || { rows: [], done: false }, counts = { documents: value.rows.length, states: {}, publicEligible: 0, imageReferences: 0, referenceKinds: {}, tokenUrls: 0 }, matches = [];
  const rootsComplete = state.namespaceRootMetadata?.done === true && state.namespaceRootMetadata.rows.every(row => !row.present || row.exposure.aclObservation !== "unobserved");
  const increment = (map, key) => { map[key] = (map[key] || 0) + 1; };
  const flagged = state.objects.filter(row => row.exposure.downloadTokenPresent || row.exposure.aclAllUsers || row.exposure.aclAllAuthenticatedUsers);
  for (const row of value.rows) {
    increment(counts.states, row.state); if (row.publicEligible) counts.publicEligible++;
    for (const ref of row.refs) {
      counts.imageReferences++; increment(counts.referenceKinds, ref.kind); if (ref.tokenAliases?.length) counts.tokenUrls++;
      for (const object of flagged.filter(object => object.name === ref.targetName)) matches.push({ providerAlias: row.alias, objectAlias: object.alias,
        generation: object.generation, life: object.life, field: ref.field, kind: ref.kind, publicEligible: row.publicEligible,
        tokenMatches: (ref.tokenAliases || []).filter(alias => object.tokenAliases.includes(alias)).length });
    }
  }
  return { mode: "provider_metadata_read_only", target: TARGET, lastObservedAt: value.lastObservedAt,
    documentsComplete: value.done && !value.blocked, complete: value.done && !value.blocked && state.flaggedMetadata?.done === true && !state.flaggedMetadata?.blocked && rootsComplete,
    counts, flaggedObjectReferences: matches, errorsObserved: value.errors || {}, unresolvedError: value.blocked || null, usage: state.usage,
    flaggedMetadata: { observed: state.flaggedMetadata?.rows?.length || 0, complete: state.flaggedMetadata?.done === true,
      unresolvedError: state.flaggedMetadata?.blocked || null, checksums: "stored_only_in_DPAPI", results: (state.flaggedMetadata?.rows || []).map(row => ({
        alias: row.alias, generation: row.generation, metageneration: row.metageneration, available: row.available,
        metadataChangedFromList: row.metadataChangedFromList, checksumObserved: Boolean(row.crc32c || row.md5Hash), exposure: row.exposure,
      })) },
    namespaceRoots: { complete: rootsComplete, unresolvedError: state.namespaceRootMetadata?.blocked || null,
      historicalGenerations: "not_observed", rows: (state.namespaceRootMetadata?.rows || []).map(row => ({ namespace: row.namespace,
        present: row.present, alias: row.alias, generation: row.generation, metageneration: row.metageneration, exposure: row.exposure })) },
    coverage: { projection: PROVIDER_FIELDS, privateContacts: "not_requested", imageContents: "not_requested", urls: "parsed_in_memory_never_fetched_or_persisted",
      galeria: "array_projection_requires_maps_received; discard_all_fields_except_path_url_in_memory", outsideProjectionReferences: "not_observed", pointInTimeSnapshot: false }, noRemoteWrites: true };
}

export async function runProviders(state, reader, save, { maxPages = 20, emit = () => {} } = {}) {
  if (!Number.isInteger(maxPages) || maxPages < 1 || maxPages > 80 || state.stage !== "complete") throw new InventoryError("invalid_arguments");
  state.providerInventory ||= { rows: [], cursor: null, done: false, errors: {} };
  const value = state.providerInventory, pseudonym = makePseudonymizer(Buffer.from(state.key, "hex"));
  let accounted = { ...reader.usage };
  async function checkpoint() {
    state.usage.requests += reader.usage.requests - accounted.requests; state.usage.bytes += reader.usage.bytes - accounted.bytes;
    value.lastObservedAt = new Date().toISOString(); await save(state); accounted = { ...reader.usage };
    emit({ stage: "provider_documents", documents: value.rows.length, complete: value.done, usage: state.usage });
  }
  try {
    for (let page = 0; page < maxPages && !value.done; page++) {
      if (value.rows.length >= 20000 || state.usage.requests >= TOTAL_LIMITS.requests) throw new InventoryError("request_limit");
      const remaining = TOTAL_LIMITS.bytes - state.usage.bytes;
      if (remaining <= 0) throw new InventoryError("byte_limit");
      const maxBytes = Math.min(LIMITS.responseBytes, remaining);
      let response;
      try { response = await reader.request(`${root}:runQuery`, { method: "POST", maxBytes, body: { structuredQuery: {
        from: [{ collectionId: "proveedores" }], select: { fields: PROVIDER_FIELDS.map(fieldPath => ({ fieldPath })) },
        orderBy: [{ field: { fieldPath: "__name__" }, direction: "ASCENDING" }], limit: 10,
        ...(value.cursor ? { startAt: { values: [{ referenceValue: value.cursor }], before: false } } : {}),
      } } }); } catch (error) { if (maxBytes === remaining && safeError(error) === "response_limit") throw new InventoryError("byte_limit"); throw error; }
      if (!Array.isArray(response)) throw new InventoryError("invalid_response");
      const rows = response.filter(row => row.document).map(row => sanitizeProvider(row.document, pseudonym));
      if (rows.length > 10 || rows.some(row => value.rows.some(existing => existing.name === row.name)) || new Set(rows.map(row => row.name)).size !== rows.length) throw new InventoryError("invalid_response");
      value.rows.push(...rows); value.cursor = rows.at(-1)?.name || value.cursor; value.done = rows.length < 10; delete value.blocked;
      await checkpoint();
    }
  } catch (error) { const code = safeError(error); value.errors[code] = (value.errors[code] || 0) + 1; value.blocked = code; await checkpoint(); }
  return providerSummary(state);
}

function flaggedTargets(state) {
  const rows = state.objects.filter(row => row.stage === "proveedores_versions" && row.exposure.downloadTokenPresent);
  if (rows.length > 100) throw new InventoryError("request_limit");
  return rows.map(row => {
    const address = new URL(`https://storage.googleapis.com/storage/v1/b/${TARGET.bucket}/o/${encodeURIComponent(row.name)}`);
    address.searchParams.set("generation", row.generation);
    address.searchParams.set("projection", state.bucket.uniformBucketLevelAccess ? "noAcl" : "full");
    address.searchParams.set("fields", "name,generation,metageneration,crc32c,md5Hash,size,cacheControl,metadata" + (state.bucket.uniformBucketLevelAccess ? "" : ",acl(entity,role)"));
    return { row, address: address.toString() };
  });
}

export function flaggedMetadataGuard(state) {
  const allowed = new Set(flaggedTargets(state).map(row => row.address));
  return (address, method, body) => { if (method !== "GET" || body !== undefined || !allowed.has(address)) throw new InventoryError("unsafe_request"); };
}

export async function captureFlaggedMetadata(state, reader, save) {
  state.flaggedMetadata ||= { rows: [], done: false };
  const value = state.flaggedMetadata, pseudonym = makePseudonymizer(Buffer.from(state.key, "hex"));
  let accounted = { ...reader.usage };
  async function checkpoint() {
    state.usage.requests += reader.usage.requests - accounted.requests; state.usage.bytes += reader.usage.bytes - accounted.bytes;
    value.lastObservedAt = new Date().toISOString(); await save(state); accounted = { ...reader.usage };
  }
  try {
    for (const { row, address } of flaggedTargets(state)) {
      if (value.rows.some(item => item.name === row.name && item.generation === row.generation)) continue;
      if (state.usage.requests >= TOTAL_LIMITS.requests) throw new InventoryError("request_limit");
      const remaining = TOTAL_LIMITS.bytes - state.usage.bytes;
      if (remaining <= 0) throw new InventoryError("byte_limit");
      let metadata;
      const maxBytes = Math.min(LIMITS.responseBytes, remaining);
      try { metadata = await reader.request(address, { maxBytes }); }
      catch (error) {
        if (maxBytes === remaining && safeError(error) === "response_limit") throw new InventoryError("byte_limit");
        if (safeError(error) !== "remote_404") throw error;
        value.rows.push({ name: row.name, alias: row.alias, generation: row.generation, available: false }); await checkpoint(); continue;
      }
      if (metadata.name !== row.name || String(metadata.generation) !== row.generation) throw new InventoryError("invalid_response");
      const sanitized = sanitizeObject(metadata, row.stage, pseudonym, state.bucket.uniformBucketLevelAccess ? "disabled_by_uniform_access" : Array.isArray(metadata.acl) ? "observed" : "unobserved");
      value.rows.push({ ...sanitized, available: true, crc32c: /^[A-Za-z0-9+/]{6}==$/.test(metadata.crc32c || "") ? metadata.crc32c : null,
        md5Hash: /^[A-Za-z0-9+/]{22}==$/.test(metadata.md5Hash || "") ? metadata.md5Hash : null, metadataChangedFromList: sanitized.metageneration !== row.metageneration });
      await checkpoint();
    }
    value.done = true; delete value.blocked; await checkpoint();
  } catch (error) { value.blocked = safeError(error); await checkpoint(); }
}

function namespaceRootTargets(state) {
  return ["borradores", "proveedores"].map(namespace => {
    const address = new URL(`https://storage.googleapis.com/storage/v1/b/${TARGET.bucket}/o/${namespace}`);
    address.searchParams.set("projection", state.bucket.uniformBucketLevelAccess ? "noAcl" : "full");
    address.searchParams.set("fields", "name,generation,metageneration,size,cacheControl,metadata" + (state.bucket.uniformBucketLevelAccess ? "" : ",acl(entity,role)"));
    return { namespace, address: address.toString() };
  });
}

export function namespaceRootGuard(state) {
  const allowed = new Set(namespaceRootTargets(state).map(row => row.address));
  return (address, method, body) => { if (method !== "GET" || body !== undefined || !allowed.has(address)) throw new InventoryError("unsafe_request"); };
}

export async function captureNamespaceRoots(state, reader, save) {
  state.namespaceRootMetadata ||= { rows: [], done: false };
  const value = state.namespaceRootMetadata, pseudonym = makePseudonymizer(Buffer.from(state.key, "hex"));
  let accounted = { ...reader.usage };
  async function checkpoint() {
    state.usage.requests += reader.usage.requests - accounted.requests; state.usage.bytes += reader.usage.bytes - accounted.bytes;
    value.lastObservedAt = new Date().toISOString(); await save(state); accounted = { ...reader.usage };
  }
  try {
    for (const { namespace, address } of namespaceRootTargets(state)) {
      if (value.rows.some(row => row.namespace === namespace)) continue;
      if (state.usage.requests >= TOTAL_LIMITS.requests) throw new InventoryError("request_limit");
      const remaining = TOTAL_LIMITS.bytes - state.usage.bytes;
      if (remaining <= 0) throw new InventoryError("byte_limit");
      const maxBytes = Math.min(LIMITS.responseBytes, remaining);
      let metadata;
      try { metadata = await reader.request(address, { maxBytes }); }
      catch (error) {
        if (maxBytes === remaining && safeError(error) === "response_limit") throw new InventoryError("byte_limit");
        if (safeError(error) !== "remote_404") throw error;
        value.rows.push({ namespace, present: false }); await checkpoint(); continue;
      }
      if (metadata.name !== namespace || !/^\d+$/.test(metadata.generation || "")) throw new InventoryError("invalid_response");
      const row = sanitizeObject(metadata, "namespace_root", pseudonym, state.bucket.uniformBucketLevelAccess ? "disabled_by_uniform_access" : Array.isArray(metadata.acl) ? "observed" : "unobserved");
      value.rows.push({ namespace, present: true, ...row }); await checkpoint();
    }
    value.done = true; delete value.blocked; await checkpoint();
  } catch (error) { value.blocked = safeError(error); await checkpoint(); }
}

export async function main(args = process.argv.slice(2), env = process.env) {
  try {
    if (!args.includes("--execute-read-only")) { console.log(JSON.stringify({ mode: "plan_only", target: TARGET, fields: PROVIDER_FIELDS })); return 0; }
    const allowed = new Set(["--execute-read-only", "--session", "--project", "--bucket", "--max-pages"]), parsed = {};
    for (let i = 0; i < args.length; i++) { const key = args[i]; if (!allowed.has(key) || key in parsed) throw new InventoryError("invalid_arguments"); parsed[key] = key === "--execute-read-only" ? true : args[++i]; }
    if (parsed["--project"] !== TARGET.project || parsed["--bucket"] !== TARGET.bucket) throw new InventoryError("invalid_target");
    if (["NODE_OPTIONS", "NODE_DEBUG", "DEBUG", "SSLKEYLOGFILE", "NODE_EXTRA_CA_CERTS", "FIRESTORE_EMULATOR_HOST", "FIREBASE_STORAGE_EMULATOR_HOST"].some(key => env[key]) || env.NODE_TLS_REJECT_UNAUTHORIZED === "0") throw new InventoryError("unsafe_environment");
    const token = env.RESERVA_INVENTORY_ACCESS_TOKEN;
    if (typeof token !== "string" || !token || /\s/.test(token)) throw new InventoryError("missing_token");
    const dir = validateSessionDir(parsed["--session"]), lock = path.join(dir, "running.lock"); fs.writeFileSync(lock, String(process.pid), { flag: "wx" });
    try {
      const state = readCheckpoint(dir);
      await runProviders(state, createReader({ token, requestGuard: assertProviderReadRequest }), current => saveCheckpoint(dir, current), {
        maxPages: Number(parsed["--max-pages"] || 20), emit: value => process.stderr.write(JSON.stringify(value) + "\n"),
      });
      if (state.providerInventory.done) {
        await captureFlaggedMetadata(state, createReader({ token, requestGuard: flaggedMetadataGuard(state) }), current => saveCheckpoint(dir, current));
        await captureNamespaceRoots(state, createReader({ token, requestGuard: namespaceRootGuard(state) }), current => saveCheckpoint(dir, current));
      }
      const result = providerSummary(state);
      fs.writeFileSync(path.join(dir, "provider-summary.json"), JSON.stringify(result, null, 2)); console.log(JSON.stringify(result)); return result.complete ? 0 : 2;
    } finally { fs.unlinkSync(lock); }
  } catch (error) { console.error(JSON.stringify({ status: "stopped", error: safeError(error) })); return 1; }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = await main();
