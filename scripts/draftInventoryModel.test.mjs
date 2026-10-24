import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  TARGET, LIMITS, DRAFT_FIELDS, InventoryError, safeError, makePseudonymizer,
  validCreation, classifyDraft, objectExposure, assertReadRequest, templateAvailable,
} from "./draftInventoryModel.mjs";
import { parseOptions, createReader, collectInventory } from "./inventoryLegacyDrafts.mjs";

const slug = "synthetic-private-slug";
const bytes = Buffer.from("<html>synthetic-only</html>");
const hash = createHash("sha256").update(bytes).digest("hex");
function fixture() {
  const doc = { userId: "synthetic-owner", editor: "html", plantillaId: "synthetic-template",
    draftCreation: { mode: "html", htmlSha256: hash,
      sourcePath: "plantillas/synthetic-template/version/index.html", sourceGeneration: "123" } };
  const metadata = { name: `borradores/${slug}/index.html`, generation: "456", size: String(bytes.length),
    metadata: { ownerUid: doc.userId, draftSlug: slug, htmlSha256: hash } };
  return { slug, doc, artifact: { state: "present", metadata } };
}
const fsRoot = `https://firestore.googleapis.com/v1/projects/${TARGET.project}/databases/(default)/documents`;
const storageRoot = `https://storage.googleapis.com/storage/v1/b/${TARGET.bucket}`;
const query = { structuredQuery: { from: [{ collectionId: "borradores" }], limit: 1,
  select: { fields: DRAFT_FIELDS.map(fieldPath => ({ fieldPath })) } } };

test("metadata equality is pending; only verified bytes qualify as compatible", () => {
  const item = fixture();
  assert.equal(classifyDraft(item).classification, "pending_hash");
  item.artifact.hash = "match";
  assert.equal(classifyDraft(item).classification, "compatible");
  item.artifact.hash = "mismatch";
  assert.equal(classifyDraft(item).reason, "html_hash_mismatch");
});

test("owner, marker, source namespace and mode cannot be inferred or adopted", () => {
  for (const mutate of [
    x => { delete x.doc.draftCreation; },
    x => { x.artifact.metadata.metadata.ownerUid = "other"; },
    x => { x.artifact.metadata.metadata.draftSlug = "other"; },
    x => { x.doc.editor = "konva"; },
    x => { delete x.doc.editor; delete x.doc.draftCreation; },
    x => { x.doc.draftCreation.sourcePath = "plantillas/other/index.html"; },
    x => { x.doc.draftCreation.sourceGeneration = "invalid"; },
    x => { x.doc.userId = ""; },
    x => { x.doc = null; },
  ]) { const item = fixture(); mutate(item); assert.equal(classifyDraft(item).classification, "block"); }
  assert.equal(validCreation(fixture().doc), true);
});

test("historical source paths accepted by the reader remain unresolved and unfetchable", () => {
  for (const path of ["plantillas/synthetic-template/../index.html",
    "plantillas/synthetic-template//index.html", "plantillas/synthetic-template/ unusual /index.html"]) {
    const item = fixture(); item.doc.draftCreation.sourcePath = path; item.artifact.hash = "match";
    assert.equal(validCreation(item.doc), false);
    assert.equal(classifyDraft(item).classification, "unresolved");
    assert.equal(classifyDraft(item).reason, "binding_outside_inventory_path_policy");
    assert.throws(() => assertReadRequest(`${storageRoot}/o/${encodeURIComponent(path)}?alt=media&generation=123`, "GET"), InventoryError);
    item.doc.draftCreation.htmlSha256 = "invalid";
    assert.equal(classifyDraft(item).classification, "block");
    assert.equal(classifyDraft(item).reason, "missing_or_invalid_binding");
  }
});

test("missing editor with a valid marker is unresolved without private content projection", () => {
  const item = fixture(); delete item.doc.editor;
  assert.equal(classifyDraft(item).classification, "unresolved");
  assert.equal(classifyDraft(item).reason, "legacy_mode_unverified");
  delete item.doc.draftCreation;
  assert.equal(classifyDraft(item).classification, "block");
  assert.equal(classifyDraft(item).reason, "missing_or_invalid_binding");
});

test("trash aliases/timestamps block even when the binding and bytes match", () => {
  for (const field of [{ estadoBorrador: " Papelera " }, { estadoBorrador: "borrador_papelera" },
    { enPapeleraAt: "2026-01-01T00:00:00Z" }, { enPapeleraAt: 1 }]) {
    const item = fixture(); Object.assign(item.doc, field); item.artifact.hash = "match";
    assert.equal(classifyDraft(item).reason, "trash");
  }
});

test("recovery needs absent destination, pinned source bytes and current template availability", () => {
  const item = fixture(); item.artifact = { state: "absent" };
  item.source = { state: "present" }; item.template = true;
  assert.equal(classifyDraft(item).classification, "pending_hash");
  item.source.hash = "match";
  assert.equal(classifyDraft(item).classification, "recovery_verifiable");
  item.template = false;
  assert.equal(classifyDraft(item).reason, "template_not_available");
  item.template = undefined;
  assert.equal(classifyDraft(item).classification, "unresolved");
  item.source.state = "absent";
  assert.equal(classifyDraft(item).reason, "pinned_source_missing");
});

test("template availability consumes the existing shared normalization contract", () => {
  assert.equal(templateAvailable(null), false);
  assert.equal(templateAvailable({ estadoEditorial: "en_proceso" }), false);
  assert.equal(templateAvailable({ estadoEditorial: "publicada", estado: "archived" }), false);
  assert.equal(templateAvailable({}), true); // Existing legacy fallback, not a new policy.
});

test("exposure output reveals booleans only, with ACL coverage distinct from token presence", () => {
  const exposure = objectExposure({ metadata: { firebaseStorageDownloadTokens: "private-token-do-not-output" },
    acl: [{ entity: "allUsers", role: "READER" }, { entity: "user-person@example.test", role: "OWNER" }],
    cacheControl: "public,max-age=3600" }, "observed");
  assert.equal(exposure.downloadTokenPresent, true);
  assert.equal(exposure.aclAllUsers, true);
  assert.equal(exposure.publicCacheDirective, true);
  assert.doesNotMatch(JSON.stringify(exposure), /private-token|person@example/);
  assert.equal(objectExposure({}).aclObservation, "unobserved");
});

test("pseudonyms are namespace isolated and uncorrelated across random run keys", () => {
  const first = makePseudonymizer(); const second = makePseudonymizer();
  assert.equal(first("draft", slug), first("draft", slug));
  assert.notEqual(first("draft", slug), first("object", slug));
  assert.notEqual(first("draft", slug), second("draft", slug));
  assert.match(first("draft", slug), /^[a-f0-9]{24}$/);
});

test("remote opt-in requires exact explicit target and bounded arguments", () => {
  assert.equal(parseOptions([]).execute, false);
  for (const args of [["--execute-read-only"], ["--project", "other"], ["--bucket", "other"],
    ["--max-docs", "201"], ["--max-objects", "0"], ["--unknown"], ["--verify-hashes", "--verify-hashes"]]) {
    assert.throws(() => parseOptions(args), InventoryError);
  }
  assert.equal(parseOptions(["--execute-read-only", "--project", TARGET.project, "--bucket", TARGET.bucket]).execute, true);
});

test("request allowlist rejects writes, wrong targets, arbitrary paths and unprojected docs", () => {
  assert.doesNotThrow(() => assertReadRequest(`${fsRoot}:runQuery`, "POST", query));
  assert.doesNotThrow(() => assertReadRequest(`${fsRoot}/borradores/demo?mask.fieldPaths=editor`, "GET"));
  assert.doesNotThrow(() => assertReadRequest(`${storageRoot}/o?prefix=proveedores%2F&maxResults=25`, "GET"));
  for (const [url, method, body] of [
    [`${storageRoot}/o/demo`, "DELETE"], [`${storageRoot}/o/demo`, "PATCH"],
    [`${fsRoot}:commit`, "POST", {}], [`${fsRoot}/usuarios/person`, "GET"],
    [`${fsRoot}/borradores/demo`, "GET"], [`${fsRoot}/borradores/demo?mask.fieldPaths=contenido`, "GET"],
    [`${fsRoot}:runQuery`, "POST", { structuredQuery: { from: [{ collectionId: "usuarios" }], limit: 1 } }],
    [`${fsRoot}:runQuery`, "POST", { structuredQuery: { from: [{ collectionId: "borradores" }], limit: 1 } }],
    [`${storageRoot}/o?prefix=usuarios%2F&maxResults=25`, "GET"],
    [`${storageRoot}/o/borradores%2Fdemo%2Findex.html?alt=media`, "GET"],
    [`${storageRoot}/o/proveedores%2Fdemo%2Fimage.jpg?alt=media&generation=1`, "GET"],
    [storageRoot.replace(TARGET.bucket, "other"), "GET"],
    [storageRoot.replace("https:", "http:"), "GET"],
    [storageRoot.replace("storage.googleapis.com", "attacker.example"), "GET"],
  ]) assert.throws(() => assertReadRequest(url, method, body), InventoryError);
});

test("HTTP errors and network failures never carry raw bodies, URLs or tokens", async () => {
  const privateText = "sensitive-private-token-url-owner";
  for (const fetchImpl of [
    async () => new Response(privateText, { status: 403 }),
    async () => { throw new Error(privateText); },
  ]) {
    const reader = createReader({ token: privateText, fetchImpl });
    await assert.rejects(reader.request(storageRoot), error => {
      assert.doesNotMatch(JSON.stringify({ error: safeError(error), message: error.message }), /sensitive/);
      return true;
    });
  }
  assert.equal(safeError({ code: privateText, message: privateText }), "unexpected_error");
});

test("transport rejects redirects, bounds response bytes and does not retry", async () => {
  let calls = 0;
  const reader = createReader({ token: "synthetic", fetchImpl: async (_url, request) => {
    calls++; assert.equal(request.redirect, "error");
    return new Response("0123456789");
  }, limits: { ...LIMITS, responseBytes: 5, requests: 1 } });
  await assert.rejects(reader.request(storageRoot), error => safeError(error) === "response_limit");
  await assert.rejects(reader.request(storageRoot), error => safeError(error) === "request_limit");
  assert.equal(calls, 1);
});

test("declared response size is rejected before reading and deadline before fetching", async () => {
  let reads = 0;
  const reader = createReader({ token: "synthetic", fetchImpl: async () => ({ ok: true,
    headers: new Headers({ "content-length": "999" }),
    body: { cancel() {}, async *[Symbol.asyncIterator]() { reads++; yield Buffer.alloc(999); } },
  }), limits: { ...LIMITS, responseBytes: 10 } });
  await assert.rejects(reader.request(storageRoot), error => safeError(error) === "response_limit");
  assert.equal(reads, 0);
  let time = 0;
  const expired = createReader({ token: "synthetic", now: () => time, fetchImpl: async () => { reads++; } });
  time = LIMITS.seconds * 1000 + 1;
  await assert.rejects(expired.request(storageRoot), error => safeError(error) === "deadline");
  assert.equal(reads, 0);
});

function toFields(data) {
  return Object.fromEntries(Object.entries(data).map(([key, value]) => [key,
    typeof value === "string" ? { stringValue: value } : { mapValue: { fields: toFields(value) } }]));
}
function fakeApi({ withDoc = true, missingObject = false, aclDenied = false, extraPage = false, oversized = false, sourcePath } = {}) {
  const item = fixture(); const calls = [];
  if (oversized) item.artifact.metadata.size = String(LIMITS.objectBytes + 1);
  if (sourcePath) item.doc.draftCreation.sourcePath = sourcePath;
  const fake = async (raw, request) => {
    const u = new URL(raw); calls.push({ url: raw, method: request.method });
    if (u.searchParams.get("alt") === "media") return new Response(bytes);
    if (u.pathname.endsWith(":runQuery")) return Response.json(withDoc ? [{ document: {
      name: `projects/${TARGET.project}/databases/(default)/documents/borradores/${slug}`, fields: toFields(item.doc),
    } }] : []);
    if (u.pathname.endsWith("/iam")) return Response.json({ bindings: [] });
    if (u.pathname.endsWith(`/b/${TARGET.bucket}`)) return Response.json({ iamConfiguration: {
      uniformBucketLevelAccess: { enabled: !aclDenied }, publicAccessPrevention: "inherited",
    } });
    if (u.pathname.endsWith("/o")) {
      if (aclDenied && u.searchParams.get("projection") === "full") return new Response("sensitive-403-body", { status: 403 });
      const items = u.searchParams.get("prefix") === "borradores/" && !missingObject ? [item.artifact.metadata] : [];
      return Response.json({ items, ...(extraPage ? { nextPageToken: "sensitive-cursor" } : {}) });
    }
    if (u.pathname.includes("/documents/borradores/")) return new Response("not found private-name", { status: 404 });
    if (u.pathname.includes("/documents/plantillas/")) return Response.json({ fields: toFields({ estadoEditorial: "publicada" }) });
    if (decodeURIComponent(u.pathname).includes("/plantillas/")) return Response.json({
      name: item.doc.draftCreation.sourcePath, generation: "123", size: String(bytes.length),
    });
    throw new Error("unexpected synthetic request");
  };
  return { calls, reader: createReader({ token: "synthetic-token", fetchImpl: fake }) };
}
const options = { execute: true, inspectAcl: true, verifyHashes: false, maxDocs: 10, maxObjects: 10 };

test("metadata inventory never downloads bytes and outputs no raw identifiers", async () => {
  const api = fakeApi(); const progress = [];
  const report = await collectInventory(options, api.reader, entry => progress.push(entry));
  assert.equal(report.classifications.pending_hash, 1);
  assert.equal(report.counts.hashes, 0);
  assert.equal(api.calls.some(call => call.url.includes("alt=media")), false);
  assert.equal(report.completeWithinDeclaredScope, true);
  assert.doesNotMatch(JSON.stringify({ report, progress }), /synthetic-private-slug|synthetic-owner|synthetic-template|synthetic-token/);
});

test("hash verification pins generation and classifies matching HTML", async () => {
  const api = fakeApi();
  const report = await collectInventory({ ...options, verifyHashes: true }, api.reader);
  assert.equal(report.classifications.compatible, 1);
  assert.equal(report.counts.hashes, 1);
  const media = api.calls.filter(call => call.url.includes("alt=media"));
  assert.equal(media.length, 1); assert.match(media[0].url, /generation=456/);
});

test("recovery is verified without writing and only from the pinned source", async () => {
  const api = fakeApi({ missingObject: true });
  const report = await collectInventory({ ...options, verifyHashes: true }, api.reader);
  assert.equal(report.classifications.recovery_verifiable, 1);
  assert.equal(report.counts.templateReads, 1);
  assert.equal(api.calls.every(call => ["GET", "POST"].includes(call.method)), true);
  assert.equal(api.calls.filter(call => call.method === "POST").every(call => call.url.endsWith(":runQuery")), true);
});

test("inventory performs no source or hash requests for a historical path outside its policy", async () => {
  const api = fakeApi({ missingObject: true, sourcePath: "plantillas/synthetic-template//index.html" });
  const report = await collectInventory({ ...options, verifyHashes: true }, api.reader);
  assert.equal(report.classifications.unresolved, 1);
  assert.equal(report.counts.hashes, 0);
  assert.equal(report.counts.templateReads, 0);
  assert.equal(report.coverage.hashVerificationComplete, false);
  assert.equal(report.completeWithinDeclaredScope, false);
  assert.equal(api.calls.some(call => call.url.includes("alt=media") ||
    decodeURIComponent(new URL(call.url).pathname).includes("/plantillas/")), false);
});

test("oversized HTML is not downloaded and hash coverage remains incomplete", async () => {
  const api = fakeApi({ oversized: true });
  const report = await collectInventory({ ...options, verifyHashes: true }, api.reader);
  assert.equal(report.classifications.pending_hash, 1);
  assert.equal(report.counts.hashes, 0);
  assert.equal(report.coverage.hashVerificationComplete, false);
  assert.equal(report.completeWithinDeclaredScope, false);
  assert.equal(api.calls.some(call => call.url.includes("alt=media")), false);
});

test("total response budget stops the next request and media uses a bounded range", async () => {
  let calls = 0;
  const reader = createReader({ token: "synthetic", limits: { ...LIMITS, totalBytes: 4 },
    fetchImpl: async (_url, request) => {
      calls++; assert.equal(request.headers.Range, "bytes=0-3");
      return new Response("1234");
    } });
  const mediaUrl = `${storageRoot}/o/borradores%2Fdemo%2Findex.html?alt=media&generation=1`;
  assert.equal((await reader.request(mediaUrl, { media: true, maxBytes: 4 })).length, 4);
  await assert.rejects(reader.request(mediaUrl, { media: true, maxBytes: 4 }), error => safeError(error) === "byte_limit");
  assert.equal(calls, 1);
});

test("an object outside query sample requires a projected exact document read before orphan classification", async () => {
  const api = fakeApi({ withDoc: false });
  const report = await collectInventory(options, api.reader);
  assert.equal(report.counts.associatedDraftReads, 1);
  assert.equal(report.records.find(record => record.kind === "draft").reason, "document_absent");
  assert.equal(api.calls.some(call => call.url.includes("/documents/borradores/") && call.url.includes("mask.fieldPaths")), true);
});

test("caps and denied ACL permissions remain incomplete; metadata may continue without ACL", async () => {
  const capped = fakeApi({ extraPage: true });
  const report = await collectInventory({ ...options, maxDocs: 1, maxObjects: 1 }, capped.reader);
  assert.equal(report.coverage.draftsQueryComplete, false);
  assert.equal(report.coverage.objectsComplete.borradores, false);
  assert.equal(report.completeWithinDeclaredScope, false);
  const denied = fakeApi({ aclDenied: true });
  const partial = await collectInventory(options, denied.reader);
  assert.equal(partial.bucket.acl, "unobserved_permission");
  assert.equal(partial.counts.objects.borradores, 1);
  assert.equal(partial.completeWithinDeclaredScope, false);
  assert.equal(partial.errors.remote_403, 1);
  assert.doesNotMatch(JSON.stringify(partial), /sensitive-403|sensitive-cursor/);
});

test("CLI default is offline and ignores available tokens; remote execution without token fails closed", () => {
  const script = fileURLToPath(new URL("./inventoryLegacyDrafts.mjs", import.meta.url));
  const env = Object.fromEntries(Object.entries(process.env)
    .filter(([name]) => ["path", "systemroot", "windir", "comspec", "pathext"].includes(name.toLowerCase())));
  const plan = spawnSync(process.execPath, [script], {
    env: { ...env, RESERVA_INVENTORY_ACCESS_TOKEN: "private-token-never-output" }, encoding: "utf8", timeout: 10000, windowsHide: true,
  });
  assert.equal(plan.status, 0); assert.match(plan.stdout, /plan_only_no_network/);
  assert.doesNotMatch(plan.stdout + plan.stderr, /private-token-never-output/);
  const remote = spawnSync(process.execPath, [script, "--execute-read-only", "--project", TARGET.project, "--bucket", TARGET.bucket], {
    env, encoding: "utf8", timeout: 10000, windowsHide: true,
  });
  assert.equal(remote.status, 1); assert.match(remote.stderr, /missing_token/);
});
