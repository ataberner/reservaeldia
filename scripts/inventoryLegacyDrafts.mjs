#!/usr/bin/env node
// No SDK, implicit ADC, dotenv, browser, remote writes or app handler invocation.
// Access token is supplied explicitly in memory by the authorized operator.
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import {
  TARGET, LIMITS, DRAFT_FIELDS, InventoryError, safeError, makePseudonymizer,
  isSegment, validCreation, classifyDraft, decodeFields, objectExposure,
  templateAvailable, assertReadRequest,
} from "./draftInventoryModel.mjs";

export function parseOptions(args) {
  const options = { execute: false, verifyHashes: false, inspectAcl: false,
    maxDocs: LIMITS.docs, maxObjects: LIMITS.objectsPerPrefix };
  const flags = new Map([["--execute-read-only", "execute"], ["--verify-hashes", "verifyHashes"], ["--inspect-acl", "inspectAcl"]]);
  const values = new Map([["--project", "project"], ["--bucket", "bucket"], ["--max-docs", "maxDocs"], ["--max-objects", "maxObjects"]]);
  const seen = new Set();
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (seen.has(arg)) throw new InventoryError("invalid_arguments");
    seen.add(arg);
    if (flags.has(arg)) options[flags.get(arg)] = true;
    else if (values.has(arg) && args[i + 1] && !args[i + 1].startsWith("--")) options[values.get(arg)] = args[++i];
    else throw new InventoryError("invalid_arguments");
  }
  for (const [key, cap] of [["maxDocs", LIMITS.docs], ["maxObjects", LIMITS.objectsPerPrefix]]) {
    options[key] = Number(options[key]);
    if (!Number.isInteger(options[key]) || options[key] < 1 || options[key] > cap) throw new InventoryError("invalid_arguments");
  }
  if ((options.project && options.project !== TARGET.project) || (options.bucket && options.bucket !== TARGET.bucket) ||
      (options.execute && (!options.project || !options.bucket))) throw new InventoryError("invalid_target");
  return options;
}

export function createReader({ token, fetchImpl = fetch, now = Date.now, limits = LIMITS, requestGuard = assertReadRequest }) {
  const started = now();
  const usage = { requests: 0, bytes: 0 };
  async function request(url, { method = "GET", body, media = false, maxBytes = limits.responseBytes } = {}) {
    requestGuard(url, method, body);
    if (usage.requests >= limits.requests) throw new InventoryError("request_limit");
    const remainingMs = limits.seconds * 1000 - (now() - started);
    if (remainingMs <= 0) throw new InventoryError("deadline");
    if (usage.bytes >= limits.totalBytes) throw new InventoryError("byte_limit");
    usage.requests++;
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), Math.min(15000, remainingMs));
    let response;
    try {
      response = await fetchImpl(url, {
        method, redirect: "error", signal: abort.signal,
        headers: { Authorization: `Bearer ${token}`, "Accept-Encoding": "identity",
          ...(media && maxBytes > 0 ? { Range: `bytes=0-${maxBytes - 1}` } : {}),
          ...(body ? { "Content-Type": "application/json" } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      if (!response.ok) {
        await response.body?.cancel();
        const code = [401, 403, 404, 429].includes(response.status) ? `remote_${response.status}` :
          response.status >= 500 ? "remote_5xx" : "remote_other";
        throw new InventoryError(code);
      }
      if (media && response.headers.get("content-encoding") && response.headers.get("content-encoding") !== "identity") {
        await response.body?.cancel();
        throw new InventoryError("unsupported_encoding");
      }
      const declared = Number(response.headers.get("content-length"));
      if (declared > maxBytes || declared > limits.totalBytes - usage.bytes) {
        await response.body?.cancel();
        throw new InventoryError(declared > maxBytes ? "response_limit" : "byte_limit");
      }
      const chunks = [];
      let size = 0;
      for await (const chunk of response.body || []) {
        size += chunk.length; usage.bytes += chunk.length;
        if (size > maxBytes || usage.bytes > limits.totalBytes) {
          abort.abort();
          throw new InventoryError(size > maxBytes ? "response_limit" : "byte_limit");
        }
        chunks.push(chunk);
      }
      const bytes = Buffer.concat(chunks);
      if (media) return bytes;
      try { return JSON.parse(bytes.toString("utf8")); }
      catch { throw new InventoryError("invalid_response"); }
    } catch (error) {
      if (error instanceof InventoryError) throw error;
      throw new InventoryError(abort.signal.aborted ? "deadline" : "network_error");
    } finally { clearTimeout(timer); }
  }
  return { request, usage };
}

const storageRoot = `https://storage.googleapis.com/storage/v1/b/${TARGET.bucket}`;
const fsRoot = `https://firestore.googleapis.com/v1/projects/${TARGET.project}/databases/(default)/documents`;
const objectFields = "name,generation,metageneration,size,contentType,contentEncoding,cacheControl,metadata";
function urlWith(base, params) {
  const url = new URL(base);
  for (const [key, value] of Object.entries(params)) if (value !== undefined) url.searchParams.set(key, String(value));
  return url.toString();
}
function docUrl(collection, id, fields) {
  const url = new URL(`${fsRoot}/${collection}/${encodeURIComponent(id)}`);
  for (const field of fields) url.searchParams.append("mask.fieldPaths", field);
  return url.toString();
}

export async function collectInventory(options, reader, emit = () => {}, pseudonym = makePseudonymizer()) {
  const report = {
    schemaVersion: 1, mode: options.verifyHashes ? "bounded_sha256" : "metadata_only",
    target: TARGET, limits: { ...LIMITS, docs: options.maxDocs, objectsPerPrefix: options.maxObjects },
    coverage: { draftsQueryComplete: false, objectsComplete: { borradores: false, proveedores: false },
      historicalProvenance: "not_established", pointInTimeSnapshot: false,
      signedUrlsCachesInheritedIamAndOtherPrefixes: "not_observed" },
    counts: { queriedDrafts: 0, associatedDraftReads: 0, templateReads: 0,
      objects: { borradores: 0, proveedores: 0 }, hashes: 0 },
    bucket: { metadata: "unobserved", iam: "unobserved", acl: "unobserved" },
    classifications: {}, exposures: {}, errors: {}, records: [],
  };
  const docs = new Map();
  const objects = new Map();
  const count = (target, key) => { target[key] = (target[key] || 0) + 1; };
  const note = error => { count(report.errors, safeError(error)); };
  const progress = stage => emit({ stage, queriedDrafts: report.counts.queriedDrafts,
    objects: report.counts.objects, requests: reader.usage.requests, bytes: reader.usage.bytes });
  const readOptional = async url => {
    try { return { state: "present", value: await reader.request(url) }; }
    catch (error) {
      if (safeError(error) === "remote_404") return { state: "absent" };
      note(error); return { state: "unknown" };
    }
  };
  try {
    const bucket = await readOptional(urlWith(storageRoot, {
      fields: "iamConfiguration(uniformBucketLevelAccess,publicAccessPrevention)",
    }));
    report.bucket.metadata = bucket.state;
    report.bucket.uniformBucketLevelAccess = bucket.state === "present" ?
      bucket.value?.iamConfiguration?.uniformBucketLevelAccess?.enabled === true : null;
    report.bucket.publicAccessPreventionEnforced = bucket.state === "present" ?
      bucket.value?.iamConfiguration?.publicAccessPrevention === "enforced" : null;
    if (options.inspectAcl) {
      const policy = await readOptional(urlWith(`${storageRoot}/iam`, {
        optionsRequestedPolicyVersion: 3, fields: "bindings(members,condition)",
      }));
      report.bucket.iam = policy.state;
      report.bucket.publicPrincipalBinding = (policy.value?.bindings || [])
        .some(binding => binding.members?.some(member => ["allUsers", "allAuthenticatedUsers"].includes(member)));
      report.bucket.conditionalPublicBinding = (policy.value?.bindings || [])
        .some(binding => binding.condition && binding.members?.some(member => ["allUsers", "allAuthenticatedUsers"].includes(member)));
    }
    report.bucket.acl = !options.inspectAcl ? "not_requested" :
      report.bucket.uniformBucketLevelAccess ? "disabled_by_uniform_access" : "requested_per_object";

    let cursor;
    while (report.counts.queriedDrafts < options.maxDocs) {
      const limit = Math.min(LIMITS.page, options.maxDocs - report.counts.queriedDrafts);
      const rows = await reader.request(`${fsRoot}:runQuery`, { method: "POST", body: { structuredQuery: {
        from: [{ collectionId: "borradores" }], select: { fields: DRAFT_FIELDS.map(fieldPath => ({ fieldPath })) },
        orderBy: [{ field: { fieldPath: "__name__" }, direction: "ASCENDING" }], limit,
        ...(cursor ? { startAt: { values: [{ referenceValue: cursor }], before: false } } : {}),
      } } });
      if (!Array.isArray(rows)) throw new InventoryError("invalid_response");
      const found = rows.filter(row => row.document).map(row => row.document);
      if (found.length > limit) throw new InventoryError("invalid_response");
      for (const doc of found) {
        const prefix = `projects/${TARGET.project}/databases/(default)/documents/borradores/`;
        if (!doc.name?.startsWith(prefix) || !isSegment(doc.name.slice(prefix.length))) throw new InventoryError("invalid_response");
        docs.set(doc.name.slice(prefix.length), decodeFields(doc.fields));
        report.counts.queriedDrafts++;
      }
      progress("draft_metadata");
      if (found.length < limit) { report.coverage.draftsQueryComplete = true; break; }
      if (cursor === found.at(-1).name) throw new InventoryError("invalid_response");
      cursor = found.at(-1).name;
    }

    for (const prefix of ["borradores", "proveedores"]) {
      let pageToken;
      while (report.counts.objects[prefix] < options.maxObjects) {
        let fullAcl = options.inspectAcl && !report.bucket.uniformBucketLevelAccess && report.bucket.acl !== "unobserved_permission";
        const params = {
          prefix: `${prefix}/`, maxResults: Math.min(LIMITS.page, options.maxObjects - report.counts.objects[prefix]),
          projection: fullAcl ? "full" : "noAcl",
          fields: `nextPageToken,items(${objectFields}${fullAcl ? ",acl(entity,role)" : ""})`, pageToken,
        };
        let page;
        try { page = await reader.request(urlWith(`${storageRoot}/o`, params)); }
        catch (error) {
          if (!fullAcl || safeError(error) !== "remote_403") throw error;
          note(error); fullAcl = false; report.bucket.acl = "unobserved_permission";
          page = await reader.request(urlWith(`${storageRoot}/o`, {
            ...params, projection: "noAcl", fields: `nextPageToken,items(${objectFields})`,
          }));
        }
        const items = page.items || [];
        if (!Array.isArray(items) || items.length > params.maxResults) throw new InventoryError("invalid_response");
        for (const metadata of items) {
          if (typeof metadata.name !== "string" || !metadata.name.startsWith(`${prefix}/`)) throw new InventoryError("invalid_response");
          report.counts.objects[prefix]++;
          if (prefix === "borradores") objects.set(metadata.name, metadata);
          const aclMode = fullAcl ? (Array.isArray(metadata.acl) ? "observed" : "unobserved_missing") : report.bucket.acl;
          if (aclMode === "unobserved_missing") report.coverage.objectAclIncomplete = true;
          const exposure = objectExposure(metadata, aclMode);
          for (const [key, value] of Object.entries(exposure)) if (value === true) count(report.exposures, `${prefix}.${key}`);
          report.records.push({ kind: prefix === "borradores" ? "draft_object" : "provider_object",
            id: pseudonym("object", metadata.name), exposure });
        }
        progress(`${prefix}_object_metadata`);
        if (!page.nextPageToken) { report.coverage.objectsComplete[prefix] = true; break; }
        if (pageToken === page.nextPageToken) throw new InventoryError("invalid_response");
        pageToken = page.nextPageToken;
      }
    }

    // A sampled list cannot prove a document absent. Read an exact projected doc
    // before classifying an index object not joined to the query sample.
    for (const path of objects.keys()) {
      const parts = path.split("/");
      if (parts.length !== 3 || parts[2] !== "index.html" || !isSegment(parts[1]) || docs.has(parts[1])) continue;
      if (report.counts.queriedDrafts + report.counts.associatedDraftReads >= options.maxDocs) {
        report.records.push({ kind: "unjoined_html_object", id: pseudonym("object", path), reason: "document_budget" });
        continue;
      }
      const probe = await readOptional(docUrl("borradores", parts[1], DRAFT_FIELDS));
      report.counts.associatedDraftReads++;
      if (probe.state === "present") docs.set(parts[1], decodeFields(probe.value.fields));
      else if (probe.state === "absent") docs.set(parts[1], null);
      else report.records.push({ kind: "unjoined_html_object", id: pseudonym("object", path), reason: "document_unobserved" });
    }

    async function objectProbe(name, generation) {
      const existing = !generation && objects.get(name);
      if (existing) return { state: "present", metadata: existing };
      const probe = await readOptional(urlWith(`${storageRoot}/o/${encodeURIComponent(name)}`, {
        fields: objectFields, generation,
      }));
      if (probe.state === "present" && (probe.value.name !== name ||
          (generation && probe.value.generation !== generation))) throw new InventoryError("invalid_response");
      return { state: probe.state, ...(probe.value ? { metadata: probe.value } : {}) };
    }
    async function hashProbe(name, probe, expected) {
      if (!options.verifyHashes || probe.state !== "present") return probe;
      const metadata = probe.metadata;
      if (!/^\d+$/.test(metadata?.generation || "") || !/^\d+$/.test(String(metadata?.size)) ||
          Number(metadata.size) > LIMITS.objectBytes || Number(metadata.size) > LIMITS.totalBytes - reader.usage.bytes ||
          (metadata.contentEncoding && metadata.contentEncoding !== "identity")) return { ...probe, hash: "skipped_limit_or_encoding" };
      try {
        const bytes = await reader.request(urlWith(`${storageRoot}/o/${encodeURIComponent(name)}`, {
          alt: "media", generation: metadata.generation,
        }), { media: true, maxBytes: Math.min(LIMITS.objectBytes, Number(metadata.size)) });
        report.counts.hashes++;
        if (bytes.length !== Number(metadata.size)) return { ...probe, hash: "unverified_size_changed" };
        return { ...probe, hash: createHash("sha256").update(bytes).digest("hex") === expected ? "match" : "mismatch" };
      } catch (error) { note(error); return { ...probe, hash: "unverified_error" }; }
    }
    for (const [slug, doc] of docs) {
      const path = `borradores/${slug}/index.html`;
      // Avoid a request per modern document where a completed object list proves
      // there is no HTML. A partial list always requires an exact lookup.
      let artifact = objects.has(path) ? { state: "present", metadata: objects.get(path) } :
        report.coverage.objectsComplete.borradores ? { state: "absent" } : await objectProbe(path);
      let source, template;
      const initial = classifyDraft({ slug, doc, artifact });
      if (doc?.editor === "html" && validCreation(doc) && initial.classification !== "block") {
        artifact = await hashProbe(path, artifact, doc.draftCreation.htmlSha256);
        if (artifact.state === "absent") {
          source = await objectProbe(doc.draftCreation.sourcePath, doc.draftCreation.sourceGeneration);
          source = await hashProbe(doc.draftCreation.sourcePath, source, doc.draftCreation.htmlSha256);
          if (report.counts.queriedDrafts + report.counts.associatedDraftReads + report.counts.templateReads < options.maxDocs) {
            const probe = await readOptional(docUrl("plantillas", doc.plantillaId, ["estado", "estadoEditorial"]));
            report.counts.templateReads++;
            template = probe.state === "present" ? templateAvailable(decodeFields(probe.value.fields)) :
              probe.state === "absent" ? false : undefined;
          }
        }
      }
      const classification = classifyDraft({ slug, doc, artifact, source, template });
      count(report.classifications, classification.classification);
      report.records.push({ kind: "draft", id: pseudonym("draft", slug), ...classification,
        ...(artifact.state === "present" ? { objectId: pseudonym("object", path),
          artifactExposure: objectExposure(artifact.metadata,
            Array.isArray(artifact.metadata.acl) ? "observed" : report.bucket.uniformBucketLevelAccess ?
              "disabled_by_uniform_access" : "unobserved") } : {}),
        artifactObservation: artifact.state, hashObservation: artifact.hash || "not_performed",
        sourceObservation: source?.state || "not_performed", sourceHashObservation: source?.hash || "not_performed" });
    }
  } catch (error) { note(error); }
  report.usage = { ...reader.usage };
  report.coverage.hashVerificationComplete = options.verifyHashes && report.coverage.draftsQueryComplete &&
    report.coverage.objectsComplete.borradores && Object.keys(report.errors).length === 0 &&
    !report.records.some(record => record.kind === "unjoined_html_object" ||
      ["pending_hash", "unresolved"].includes(record.classification));
  report.completeWithinDeclaredScope = report.coverage.draftsQueryComplete &&
    Object.values(report.coverage.objectsComplete).every(Boolean) && Object.keys(report.errors).length === 0 &&
    report.bucket.metadata === "present" && (!options.inspectAcl || report.bucket.iam === "present") &&
    (!options.verifyHashes || report.coverage.hashVerificationComplete) && !report.coverage.objectAclIncomplete &&
    !report.records.some(record => record.kind === "unjoined_html_object");
  report.noWritesPerformed = true;
  progress("finished");
  return report;
}

export async function main(args = process.argv.slice(2), env = process.env) {
  try {
    const options = parseOptions(args);
    if (!options.execute) {
      process.stdout.write(JSON.stringify({ mode: "plan_only_no_network", target: TARGET, limits: LIMITS,
        requiredFlags: ["--execute-read-only", "--project", "--bucket"],
        credential: "RESERVA_INVENTORY_ACCESS_TOKEN supplied by operator; no implicit ADC",
        optional: ["--verify-hashes", "--inspect-acl", "--max-docs", "--max-objects"] }, null, 2) + "\n");
      return 0;
    }
    if (["FIRESTORE_EMULATOR_HOST", "STORAGE_EMULATOR_HOST", "FIREBASE_STORAGE_EMULATOR_HOST",
      "NODE_DEBUG", "DEBUG", "NODE_OPTIONS", "SSLKEYLOGFILE", "NODE_EXTRA_CA_CERTS"]
      .some(name => env[name]) || env.NODE_TLS_REJECT_UNAUTHORIZED === "0") throw new InventoryError("unsafe_environment");
    const token = env.RESERVA_INVENTORY_ACCESS_TOKEN;
    if (typeof token !== "string" || !token || /\s/.test(token)) throw new InventoryError("missing_token");
    const reader = createReader({ token });
    const report = await collectInventory(options, reader,
      progress => process.stderr.write(JSON.stringify(progress) + "\n"));
    process.stdout.write(JSON.stringify(report, null, 2) + "\n");
    return report.completeWithinDeclaredScope ? 0 : 2;
  } catch (error) {
    process.stderr.write(JSON.stringify({ status: "stopped", error: safeError(error) }) + "\n");
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main();
}
