// Resumable READ ONLY inventory. Private paths/cursors are persisted only in a
// CurrentUser DPAPI envelope under the ignored local evidence directory.
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { pathToFileURL } from "node:url";
import { createReader } from "./inventoryLegacyDrafts.mjs";
import { TARGET, LIMITS, DRAFT_FIELDS, InventoryError, safeError, makePseudonymizer,
  decodeFields, classifyDraft, validCreation, isSegment, objectExposure, templateAvailable } from "./draftInventoryModel.mjs";

const fsRoot = `https://firestore.googleapis.com/v1/projects/${TARGET.project}/databases/(default)/documents`;
const storageRoot = `https://storage.googleapis.com/storage/v1/b/${TARGET.bucket}`;
const stages = ["bucket", "drafts", "borradores_versions", "proveedores_versions", "borradores_soft", "proveedores_soft", "join", "classify", "complete"];
export const TOTAL_LIMITS = Object.freeze({ drafts: 20000, objectsPerStage: 20000, bytes: 100 * 1024 * 1024, requests: 5000 });
const BATCH_LIMITS = Object.freeze({ requests: LIMITS.requests, totalBytes: LIMITS.totalBytes, responseBytes: LIMITS.responseBytes,
  seconds: LIMITS.seconds, page: LIMITS.page, maxPages: { default: 20, maximum: 80 } });
const fields = "name,generation,metageneration,size,contentType,contentEncoding,cacheControl,metadata,timeDeleted,softDeleteTime,hardDeleteTime";
const hash = value => createHash("sha256").update(value).digest("hex");

export function dpapi(value, decrypt = false) {
  if (process.platform !== "win32") throw new InventoryError("unsafe_environment");
  const script = `Add-Type -AssemblyName System.Security; $inputText=[Console]::In.ReadToEnd(); try { ` +
    (decrypt ? `[byte[]]$inputBytes=[Convert]::FromBase64String($inputText); $result=[Security.Cryptography.ProtectedData]::Unprotect($inputBytes,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser); [Console]::Out.Write([Text.Encoding]::UTF8.GetString($result));` :
      `[byte[]]$inputBytes=[Text.Encoding]::UTF8.GetBytes($inputText); $result=[Security.Cryptography.ProtectedData]::Protect($inputBytes,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser); [Console]::Out.Write([Convert]::ToBase64String($result));`) +
    ` } catch { [Console]::Error.Write('CHECKPOINT_CIPHER_FAILED'); exit 1 }`;
  const result = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], {
    input: value, encoding: "utf8", timeout: 30000, windowsHide: true, maxBuffer: 32 * 1024 * 1024,
  });
  if (result.status !== 0 || result.error) throw new InventoryError("unsafe_environment");
  return result.stdout;
}

export function validateSessionDir(dir, root = process.cwd()) {
  const parent = fs.realpathSync(path.join(root, ".local-isolation"));
  const resolved = fs.realpathSync(dir);
  if (path.dirname(resolved) !== parent || !/^inventory-continuation-[A-Za-z0-9_-]+$/.test(path.basename(resolved)) ||
      !fs.readFileSync(path.join(root, ".gitignore"), "utf8").split(/\r?\n/).includes("/.local-isolation/")) {
    throw new InventoryError("unsafe_environment");
  }
  return resolved;
}

export function saveCheckpoint(dir, state, cipher = dpapi) {
  const destination = path.join(dir, "checkpoint.dpapi");
  const temporary = path.join(dir, `checkpoint-${randomBytes(8).toString("hex")}.tmp`);
  const payload = cipher(JSON.stringify(state));
  fs.writeFileSync(temporary, payload, { flag: "wx", mode: 0o600 });
  fs.renameSync(temporary, destination);
}

export function readCheckpoint(dir, cipher = dpapi) {
  const state = JSON.parse(cipher(fs.readFileSync(path.join(dir, "checkpoint.dpapi"), "utf8"), true));
  if (state.schemaVersion !== 1 || state.target?.project !== TARGET.project || state.target?.bucket !== TARGET.bucket ||
      !stages.includes(state.stage) || !/^[a-f0-9]{64}$/.test(state.key)) throw new InventoryError("invalid_target");
  return state;
}

export function initialState(previousReport) {
  if (previousReport.target?.project !== TARGET.project || previousReport.target?.bucket !== TARGET.bucket) throw new InventoryError("invalid_target");
  return { schemaVersion: 1, target: TARGET, key: randomBytes(32).toString("hex"),
    startedAt: new Date().toISOString(), stage: "bucket", cursor: null, pages: {},
    oldSample: { reusableCursor: false, reReadInitialPagesRequired: true,
      directBucketIam: previousReport.bucket, historicalReportOnly: true },
    bucket: null, docs: [], objects: [], classifications: [], probes: {},
    stageCounts: {}, completed: {}, errors: {}, usage: { requests: 0, bytes: 0 }, batches: 0 };
}

export function sanitizeObject(metadata, stage, pseudonym, aclMode) {
  const custom = metadata.metadata || {};
  const rawToken = custom.firebaseStorageDownloadTokens;
  const tokens = typeof rawToken === "string" ? rawToken.split(",").map(x => x.trim()).filter(Boolean) : [];
  return { name: metadata.name, generation: String(metadata.generation), metageneration: String(metadata.metageneration || ""),
    alias: pseudonym("object", metadata.name), stage,
    life: stage.endsWith("_soft") ? "soft_deleted" : metadata.timeDeleted ? "noncurrent" : "live",
    size: String(metadata.size || ""), contentEncoding: metadata.contentEncoding || null,
    exposure: objectExposure(metadata, aclMode), tokenAliases: tokens.map(token => pseudonym("token", token)),
    binding: { ...(typeof custom.ownerUid === "string" ? { ownerUid: pseudonym("uid", custom.ownerUid) } : {}),
      ...(typeof custom.draftSlug === "string" ? { draftSlug: custom.draftSlug } : {}),
      ...(typeof custom.htmlSha256 === "string" ? { htmlSha256: custom.htmlSha256 } : {}) } };
}

function sanitizeDoc(document, pseudonym) {
  const prefix = `projects/${TARGET.project}/databases/(default)/documents/borradores/`;
  if (!document.name?.startsWith(prefix) || !isSegment(document.name.slice(prefix.length))) throw new InventoryError("invalid_response");
  const data = decodeFields(document.fields);
  if (typeof data.userId === "string") data.userId = pseudonym("uid", data.userId);
  return { slug: document.name.slice(prefix.length), name: document.name, data };
}

function url(base, params = {}) {
  const result = new URL(base);
  for (const [key, value] of Object.entries(params)) if (value !== undefined) result.searchParams.set(key, String(value));
  return result.toString();
}
function advance(state) { state.completed[state.stage] = true; state.stage = stages[stages.indexOf(state.stage) + 1]; state.cursor = null; }
function increment(object, key) { object[key] = (object[key] || 0) + 1; }

export function publicSummary(state) {
  const categories = {}, reasons = {}, objects = {}, exposures = {}, flags = [];
  for (const row of state.classifications) { increment(categories, row.classification); increment(reasons, row.reason); }
  for (const row of state.objects) {
    increment(objects, `${row.stage}.${row.life}`);
    for (const [key, value] of Object.entries(row.exposure)) if (value === true) increment(exposures, `${row.stage}.${key}`);
    if (row.exposure.downloadTokenPresent || row.exposure.aclAllUsers || row.exposure.aclAllAuthenticatedUsers) {
      flags.push({ alias: row.alias, generation: row.generation, metageneration: row.metageneration,
        stage: row.stage, life: row.life, exposure: row.exposure, tokenAliases: row.tokenAliases });
    }
  }
  return { schemaVersion: 1, target: TARGET, startedAt: state.startedAt, lastObservedAt: state.lastObservedAt,
    stage: state.stage, completed: state.completed, totalLimits: TOTAL_LIMITS,
    batchLimits: BATCH_LIMITS,
    checkpoint: "DPAPI CurrentUser; private paths/cursors, no token values or personal ACL principals",
    originalSample: state.oldSample, coverage: { allPagesFinished: state.stage === "complete",
      pointInTimeSnapshot: false, firestoreHistoryOrPitr: "not_requested", unrelatedPrefixesAndExternalCopies: "not_observed",
      hashVerification: "metadata_only; private_content_not_downloaded", inheritedIam: "separate_audit",
      softDeletedListing: state.softDeletedListing || "pending" },
    bucket: state.bucket, counts: { drafts: state.docs.length, objectVersions: state.objects.length, objects, categories, reasons, exposures },
    flags, usage: state.usage, batches: state.batches, errorsObserved: state.errors, unresolvedError: state.blocked || null,
    complete: state.stage === "complete" && !state.blocked &&
      (state.bucket?.defaultAclObserved || state.bucket?.uniformBucketLevelAccess) &&
      state.softDeletedListing === "all_pages_observed" &&
      state.objects.every(row => row.exposure.aclObservation !== "unobserved") &&
      !state.classifications.some(row => ["pending_hash", "unresolved"].includes(row.classification)),
    noRemoteWrites: true };
}

export async function runBatch(state, reader, save, { maxPages = 20, verifyHashes = false, emit = () => {} } = {}) {
  // This continuation is explicitly metadata-only. The separate original
  // bounded hash diagnostic is outside this run's authorization.
  if (verifyHashes) throw new InventoryError("invalid_arguments");
  if (!Number.isInteger(maxPages) || maxPages < 1 || maxPages > 80) throw new InventoryError("invalid_arguments");
  const pseudonym = makePseudonymizer(Buffer.from(state.key, "hex"));
  const before = { ...reader.usage };
  let accounted = { ...before }, count = 0;
  let pageStart;
  async function checkpoint() {
    state.usage.requests += reader.usage.requests - accounted.requests;
    state.usage.bytes += reader.usage.bytes - accounted.bytes;
    state.lastObservedAt = new Date().toISOString();
    await save(state);
    accounted = { ...reader.usage };
    emit({ stage: state.stage, drafts: state.docs.length, objectVersions: state.objects.length, usage: state.usage });
  }
  async function request(address, options) {
    if (state.usage.requests + reader.usage.requests - accounted.requests >= TOTAL_LIMITS.requests) throw new InventoryError("request_limit");
    const remaining = TOTAL_LIMITS.bytes - state.usage.bytes - reader.usage.bytes + accounted.bytes;
    if (remaining <= 0) throw new InventoryError("byte_limit");
    const maxBytes = Math.min(options?.maxBytes ?? LIMITS.responseBytes, remaining);
    try { return await reader.request(address, { ...options, maxBytes }); }
    catch (error) {
      if (maxBytes === remaining && safeError(error) === "response_limit") throw new InventoryError("byte_limit");
      throw error;
    }
  }
  try {
    while (state.stage !== "complete" && count < maxPages) {
      pageStart = structuredClone(state);
      const stage = state.stage;
      if (stage === "bucket") {
        const value = await request(url(storageRoot, { projection: "full",
          fields: "etag,iamConfiguration(uniformBucketLevelAccess,publicAccessPrevention),versioning,softDeletePolicy,defaultObjectAcl(entity,role)" }));
        state.bucket = { etagSha256: typeof value.etag === "string" ? hash(value.etag) : null,
          uniformBucketLevelAccess: value.iamConfiguration?.uniformBucketLevelAccess?.enabled === true,
          publicAccessPreventionEnforced: value.iamConfiguration?.publicAccessPrevention === "enforced",
          versioningEnabled: value.versioning?.enabled === true,
          softDeleteRetentionSeconds: Number(value.softDeletePolicy?.retentionDurationSeconds || 0),
          defaultAclObserved: Array.isArray(value.defaultObjectAcl),
          defaultAclAllUsers: value.defaultObjectAcl?.some(row => row.entity === "allUsers") || false,
          defaultAclAllAuthenticatedUsers: value.defaultObjectAcl?.some(row => row.entity === "allAuthenticatedUsers") || false };
        advance(state);
      } else if (stage === "drafts") {
        if (state.docs.length >= TOTAL_LIMITS.drafts) throw new InventoryError("request_limit");
        const rows = await request(`${fsRoot}:runQuery`, { method: "POST", body: { structuredQuery: {
          from: [{ collectionId: "borradores" }], select: { fields: DRAFT_FIELDS.map(fieldPath => ({ fieldPath })) },
          orderBy: [{ field: { fieldPath: "__name__" }, direction: "ASCENDING" }], limit: LIMITS.page,
          ...(state.cursor ? { startAt: { values: [{ referenceValue: state.cursor }], before: false } } : {}),
        } } });
        if (!Array.isArray(rows)) throw new InventoryError("invalid_response");
        const documents = rows.filter(row => row.document).map(row => row.document);
        if (documents.length > LIMITS.page) throw new InventoryError("invalid_response");
        for (const document of documents) {
          const row = sanitizeDoc(document, pseudonym);
          if (state.docs.some(existing => existing.name === row.name)) throw new InventoryError("invalid_response");
          state.docs.push(row);
        }
        if (documents.length < LIMITS.page) advance(state);
        else { if (state.cursor === documents.at(-1).name) throw new InventoryError("invalid_response"); state.cursor = documents.at(-1).name; }
      } else if (stage.endsWith("_versions") || stage.endsWith("_soft")) {
        const prefix = stage.split("_")[0];
        if (stage.endsWith("_soft") && state.bucket.softDeleteRetentionSeconds === 0) {
          // The API rejects softDeleted=true without an active policy. This
          // records unavailable history rather than claiming an empty listing.
          state.softDeletedListing = "unavailable_current_policy_disabled";
          advance(state); count++; increment(state.pages, stage); await checkpoint(); pageStart = undefined;
          continue;
        }
        if ((state.stageCounts[stage] || 0) >= TOTAL_LIMITS.objectsPerStage) throw new InventoryError("request_limit");
        const fullAcl = !state.bucket.uniformBucketLevelAccess;
        const page = await request(url(`${storageRoot}/o`, { prefix: `${prefix}/`, maxResults: LIMITS.page,
          projection: fullAcl ? "full" : "noAcl", fields: `nextPageToken,items(${fields}${fullAcl ? ",acl(entity,role)" : ""})`,
          ...(stage.endsWith("_soft") ? { softDeleted: true } : { versions: true }), pageToken: state.cursor || undefined,
        }));
        if (!Array.isArray(page.items || []) || (page.items || []).length > LIMITS.page) throw new InventoryError("invalid_response");
        for (const metadata of page.items || []) {
          if (typeof metadata.name !== "string" || !metadata.name.startsWith(`${prefix}/`) || !/^\d+$/.test(metadata.generation)) throw new InventoryError("invalid_response");
          const row = sanitizeObject(metadata, stage, pseudonym, fullAcl ? Array.isArray(metadata.acl) ? "observed" : "unobserved" : "disabled_by_uniform_access");
          if (state.objects.some(existing => existing.stage === row.stage && existing.name === row.name && existing.generation === row.generation)) throw new InventoryError("invalid_response");
          state.objects.push(row); increment(state.stageCounts, stage);
        }
        if (!page.nextPageToken) { if (stage === "proveedores_soft") state.softDeletedListing = "all_pages_observed"; advance(state); }
        else { if (state.cursor === page.nextPageToken) throw new InventoryError("invalid_response"); state.cursor = page.nextPageToken; }
      } else if (stage === "join") {
        const files = state.objects.filter(row => row.stage === "borradores_versions" && row.life === "live" &&
          /^borradores\/[^/]+\/index\.html$/.test(row.name));
        const offset = Number(state.cursor || 0);
        const entries = files.slice(offset, offset + LIMITS.page);
        for (const file of entries) {
          const slug = file.name.split("/")[1];
          if (!isSegment(slug) || state.docs.some(doc => doc.slug === slug)) continue;
          if (state.docs.length >= TOTAL_LIMITS.drafts) throw new InventoryError("request_limit");
          const address = new URL(`${fsRoot}/borradores/${encodeURIComponent(slug)}`);
          for (const field of DRAFT_FIELDS) address.searchParams.append("mask.fieldPaths", field);
          try { state.docs.push(sanitizeDoc(await request(address.toString()), pseudonym)); }
          catch (error) {
            if (safeError(error) === "remote_404") state.docs.push({ slug, name: address.pathname, data: null });
            else throw error;
          }
        }
        if (offset + entries.length === files.length) advance(state); else state.cursor = String(offset + entries.length);
      } else if (stage === "classify") {
        const offset = Number(state.cursor || 0);
        const entries = state.docs.slice(offset, offset + LIMITS.page);
        for (const entry of entries) {
          const file = state.objects.find(row => row.name === `borradores/${entry.slug}/index.html` && row.life === "live");
          let artifact = file ? { state: "present", metadata: { metadata: file.binding } } : { state: "absent" };
          let source, template;
          const initial = classifyDraft({ slug: entry.slug, doc: entry.data, artifact });
          if (entry.data?.editor === "html" && validCreation(entry.data) && initial.classification !== "block") {
            const marker = entry.data.draftCreation;
            const name = file?.name || marker.sourcePath;
            if (!file) {
              try {
                const metadata = await request(url(`${storageRoot}/o/${encodeURIComponent(name)}`, { generation: marker.sourceGeneration, fields }));
                if (metadata.name !== name || metadata.generation !== marker.sourceGeneration) throw new InventoryError("invalid_response");
                source = { state: "present" };
              } catch (error) { if (safeError(error) === "remote_404") source = { state: "absent" }; else throw error; }
              const address = new URL(`${fsRoot}/plantillas/${encodeURIComponent(entry.data.plantillaId)}`);
              for (const field of ["estado", "estadoEditorial"]) address.searchParams.append("mask.fieldPaths", field);
              try { template = templateAvailable(decodeFields((await request(address.toString())).fields)); }
              catch (error) { if (safeError(error) === "remote_404") template = false; else throw error; }
            }
          }
          state.classifications.push({ alias: pseudonym("draft", entry.slug), ...classifyDraft({ slug: entry.slug, doc: entry.data, artifact, source, template }) });
        }
        if (offset + entries.length === state.docs.length) advance(state); else state.cursor = String(offset + entries.length);
      }
      if (state.blocked?.stage === stage) delete state.blocked;
      count++; increment(state.pages, stage); await checkpoint(); pageStart = undefined;
    }
  } catch (error) {
    if (pageStart) Object.assign(state, pageStart);
    state.blocked = { stage: state.stage, code: safeError(error) };
    increment(state.errors, safeError(error)); await checkpoint();
  }
  state.batches++; await checkpoint();
  return publicSummary(state);
}

export async function main(args = process.argv.slice(2), env = process.env) {
  try {
    const flag = args.includes("--execute-read-only");
    if (!flag) { console.log(JSON.stringify({ mode: "plan_only", target: TARGET, perBatch: BATCH_LIMITS, total: TOTAL_LIMITS, checkpoint: "DPAPI CurrentUser" })); return 0; }
    const allowed = new Set(["--execute-read-only", "--session", "--project", "--bucket", "--max-pages"]);
    const parsed = {};
    for (let i = 0; i < args.length; i++) {
      const key = args[i]; if (!allowed.has(key) || key in parsed) throw new InventoryError("invalid_arguments");
      parsed[key] = key === "--execute-read-only" ? true : args[++i];
    }
    if (parsed["--project"] !== TARGET.project || parsed["--bucket"] !== TARGET.bucket) throw new InventoryError("invalid_target");
    if (["NODE_OPTIONS", "NODE_DEBUG", "DEBUG", "SSLKEYLOGFILE", "NODE_EXTRA_CA_CERTS", "FIRESTORE_EMULATOR_HOST", "FIREBASE_STORAGE_EMULATOR_HOST"]
      .some(key => env[key]) || env.NODE_TLS_REJECT_UNAUTHORIZED === "0") throw new InventoryError("unsafe_environment");
    const token = env.RESERVA_INVENTORY_ACCESS_TOKEN;
    if (typeof token !== "string" || !token || /\s/.test(token)) throw new InventoryError("missing_token");
    const dir = validateSessionDir(parsed["--session"]);
    const lock = path.join(dir, "running.lock");
    fs.writeFileSync(lock, String(process.pid), { flag: "wx" });
    try {
      const state = fs.existsSync(path.join(dir, "checkpoint.dpapi")) ? readCheckpoint(dir) :
        initialState(JSON.parse(fs.readFileSync(".local-isolation/inventory-nmiugX/inventory.json", "utf8")));
      saveCheckpoint(dir, state);
      const result = await runBatch(state, createReader({ token }), current => saveCheckpoint(dir, current), {
        maxPages: Number(parsed["--max-pages"] || 20),
        emit: progress => process.stderr.write(JSON.stringify(progress) + "\n"),
      });
      fs.writeFileSync(path.join(dir, "summary.json"), JSON.stringify(result, null, 2));
      console.log(JSON.stringify(result)); return result.complete ? 0 : 2;
    } finally { fs.unlinkSync(lock); }
  } catch (error) { console.error(JSON.stringify({ status: "stopped", error: safeError(error) })); return 1; }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = await main();
