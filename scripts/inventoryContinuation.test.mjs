import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { TARGET, makePseudonymizer, InventoryError } from "./draftInventoryModel.mjs";
import { TOTAL_LIMITS, initialState, sanitizeObject, publicSummary, runBatch, saveCheckpoint, readCheckpoint, dpapi, validateSessionDir } from "./inventoryContinuation.mjs";

const previous = { target: TARGET, bucket: { publicPrincipalBinding: false } };
function readerFixture({ failOnce = false } = {}) {
  const calls = []; let failed = false;
  const reader = { usage: { requests: 0, bytes: 0 }, async request(raw, options = {}) {
    reader.usage.requests++; reader.usage.bytes += 100;
    const u = new URL(raw); calls.push({ url: raw, body: options.body });
    if (u.pathname.endsWith(`/b/${TARGET.bucket}`)) return { etag: "synthetic-etag", softDeletePolicy: { retentionDurationSeconds: "604800" }, defaultObjectAcl: [] };
    if (u.pathname.endsWith(":runQuery")) {
      const resumed = options.body.structuredQuery.startAt;
      const count = resumed ? 2 : 25;
      return Array.from({ length: count }, (_, i) => ({ document: {
        name: `projects/${TARGET.project}/databases/(default)/documents/borradores/private-${String((resumed ? 25 : 0) + i).padStart(3, "0")}`,
        fields: { editor: { stringValue: "konva" }, userId: { stringValue: "synthetic-private-owner" } },
      } }));
    }
    if (u.pathname.endsWith("/o")) {
      if (failOnce && !failed) { failed = true; throw new InventoryError("network_error"); }
      if (u.searchParams.get("prefix") === "proveedores/" && u.searchParams.get("versions") === "true") {
        const second = u.searchParams.get("pageToken");
        return { items: [{ name: `proveedores/private-provider/${second ? 'b' : 'a'}.webp`, generation: second ? "22" : "11", metageneration: "1", size: "1",
          ...(second ? { timeDeleted: "2026-10-01T00:00:00Z" } : {}),
          metadata: { firebaseStorageDownloadTokens: "synthetic-private-token" },
          acl: [{ entity: "user-person@example.test", role: "OWNER" }] }],
          ...(!second ? { nextPageToken: "private-page-token" } : {}) };
      }
      return { items: [] };
    }
    throw new InventoryError("unsafe_request");
  } };
  return { reader, calls };
}

test("previous pseudonymous sample cannot become an invented resume cursor", () => {
  const state = initialState(previous);
  assert.equal(state.stage, "bucket"); assert.equal(state.cursor, null);
  assert.equal(state.oldSample.reusableCursor, false); assert.equal(state.oldSample.reReadInitialPagesRequired, true);
});

test("summary reports effective pagination budgets, not the initial sample caps", () => {
  const summary = publicSummary(initialState(previous));
  assert.equal("docs" in summary.batchLimits, false); assert.equal("objectsPerPrefix" in summary.batchLimits, false);
  assert.deepEqual(summary.batchLimits.maxPages, { default: 20, maximum: 80 });
  assert.equal(summary.batchLimits.page, 25); assert.equal(summary.totalLimits.objectsPerStage, 20000);
});

test("metadata conversion removes token values and personal ACL principals before persistence", () => {
  const item = sanitizeObject({ name: "proveedores/private-name/file.png", generation: "1", metageneration: "2",
    metadata: { firebaseStorageDownloadTokens: "secret-one,secret-two", ownerUid: "private-owner" },
    acl: [{ entity: "user-private@example.test", role: "OWNER" }, { entity: "allUsers", role: "READER" }],
  }, "proveedores_versions", makePseudonymizer(Buffer.alloc(32, 1)), "observed");
  assert.equal(item.tokenAliases.length, 2); assert.equal(item.exposure.aclAllUsers, true);
  assert.doesNotMatch(JSON.stringify(item), /secret-one|secret-two|private-owner|private@example/);
});

test("checkpoint encrypts cursors and survives atomic replacement, without persisting plaintext", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "inventory-unit-"));
  const cipher = (value, decrypt) => decrypt ? Buffer.from(value, "base64").toString() : Buffer.from(value).toString("base64");
  try {
    const state = initialState(previous); state.cursor = "private-cursor";
    saveCheckpoint(dir, state, cipher);
    assert.doesNotMatch(fs.readFileSync(path.join(dir, "checkpoint.dpapi"), "utf8"), /private-cursor/);
    state.cursor = "second-private-cursor"; saveCheckpoint(dir, state, cipher);
    assert.equal(readCheckpoint(dir, cipher).cursor, state.cursor);
    assert.deepEqual(fs.readdirSync(dir), ["checkpoint.dpapi"]);
  } finally { fs.rmSync(dir, { recursive: true }); }
});

test("DPAPI CurrentUser round-trip encrypts a synthetic cursor only", { skip: process.platform !== "win32" }, () => {
  const plaintext = JSON.stringify({ cursor: "synthetic-private-cursor-no-real-data" });
  const encrypted = dpapi(plaintext);
  assert.doesNotMatch(encrypted, /synthetic-private/);
  assert.equal(dpapi(encrypted, true), plaintext);
});

test("session storage rejects paths outside the ignored direct evidence namespace", () => {
  assert.throws(() => validateSessionDir(process.cwd()), InventoryError);
});

test("pagination resumes exact saved cursor and does not repeat completed pages", async () => {
  const state = initialState(previous); const api = readerFixture(); let saved;
  await runBatch(state, api.reader, value => { saved = structuredClone(value); }, { maxPages: 2 });
  assert.equal(saved.stage, "drafts"); assert.match(saved.cursor, /private-024$/); assert.equal(saved.docs.length, 25);
  const before = api.calls.length;
  await runBatch(saved, api.reader, () => {}, { maxPages: 80 });
  assert.equal(saved.stage, "complete"); assert.equal(saved.docs.length, 27);
  assert.equal(api.calls[before].body.structuredQuery.startAt.values[0].referenceValue, state.cursor);
  const versionsCalls = api.calls.filter(call => new URL(call.url).searchParams.get("versions") === "true");
  const softCalls = api.calls.filter(call => new URL(call.url).searchParams.get("softDeleted") === "true");
  assert.equal(versionsCalls.length, 3); assert.equal(softCalls.length, 2);
  assert.equal(api.calls.some(call => new URL(call.url).searchParams.get("alt") === "media"), false);
  const summary = publicSummary(saved);
  assert.equal(summary.complete, true); assert.equal(summary.counts.categories.outside_html_scope, 27);
  assert.doesNotMatch(JSON.stringify(summary), /private-0|private-provider|private-page-token|synthetic-private-token|person@example/);
});

test("failed pages keep their cursor and can resume without duplicate rows", async () => {
  const state = initialState(previous); const api = readerFixture({ failOnce: true });
  await runBatch(state, api.reader, () => {}, { maxPages: 80 });
  assert.equal(state.stage, "borradores_versions"); assert.equal(state.cursor, null); assert.equal(state.docs.length, 27);
  assert.equal(state.errors.network_error, 1);
  await runBatch(state, api.reader, () => {}, { maxPages: 80 });
  assert.equal(state.stage, "complete"); assert.equal(state.docs.length, 27); assert.equal(state.objects.length, 2);
  assert.equal(publicSummary(state).complete, true);
  assert.equal(publicSummary(state).errorsObserved.network_error, 1); // Prior failure remains visible after recovery.
});

test("batch limits fail before network access", async () => {
  for (const maxPages of [0, 81, 1.5]) {
    const api = readerFixture();
    await assert.rejects(runBatch(initialState(previous), api.reader, () => {}, { maxPages }), InventoryError);
    assert.equal(api.calls.length, 0);
  }
});

test("continuation rejects private content verification before any request", async () => {
  const api = readerFixture();
  await assert.rejects(runBatch(initialState(previous), api.reader, () => {}, { verifyHashes: true }), InventoryError);
  assert.equal(api.calls.length, 0);
});

test("global remaining byte budget constrains the final response and reports byte_limit", async () => {
  const state = initialState(previous); state.usage.bytes = TOTAL_LIMITS.bytes - 50;
  const reader = { usage: { requests: 0, bytes: 0 }, request: async (_url, options) => {
    assert.equal(options.maxBytes, 50); reader.usage.requests++;
    throw new InventoryError("response_limit");
  } };
  await runBatch(state, reader, () => {});
  assert.equal(state.blocked.code, "byte_limit"); assert.equal(state.stage, "bucket");
});

test("missing default ACL or unavailable soft-deleted history cannot claim complete", async () => {
  const state = initialState(previous), api = readerFixture();
  await runBatch(state, api.reader, () => {}, { maxPages: 80 });
  assert.equal(publicSummary(state).complete, true);
  state.bucket.defaultAclObserved = false;
  assert.equal(publicSummary(state).complete, false);
  state.bucket.uniformBucketLevelAccess = true;
  assert.equal(publicSummary(state).complete, true);
  state.softDeletedListing = "unavailable_current_policy_disabled";
  assert.equal(publicSummary(state).complete, false);
});

test("disabled current soft delete policy records unavailable history without an invalid request", async () => {
  const state = initialState(previous), api = readerFixture();
  state.stage = "borradores_soft"; state.bucket = { softDeleteRetentionSeconds: 0, defaultAclObserved: true };
  await runBatch(state, api.reader, () => {}, { maxPages: 80 });
  assert.equal(state.stage, "complete"); assert.equal(api.calls.length, 0);
  assert.equal(state.softDeletedListing, "unavailable_current_policy_disabled");
  assert.equal(publicSummary(state).complete, false);
});
