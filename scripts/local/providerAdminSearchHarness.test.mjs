import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { measuredDatabase } from "./providerAdminSearchFixtures.mjs";

const require = createRequire(import.meta.url);
test("test-only Firestore measurement counts fetched batches separately from examined results", async () => {
  const queries = [], documentReads = [];
  const query = { orderBy() { return this; }, limit(value) { queries.push(value); return this; }, select() { return this; }, startAfter() { return this; }, async get() { return { docs: Array.from({ length: 101 }, (_, id) => ({ id })), size: 101 }; } };
  const db = { collection(name) { assert.equal(name, "proveedores"); return query; }, doc(name) { return { async get() { documentReads.push(name); return { exists: true }; } }; } };
  const metrics = { queries: 0, received: 0, documentReads: 0, batches: [] };
  const measured = measuredDatabase(db, metrics);
  assert.equal((await measured.collection("proveedores").orderBy("id").limit(101).select("nombre").startAfter("start").get()).docs.length, 101);
  await measured.doc("app_config/proveedoresBeta").get();
  assert.deepEqual(queries, [101]); assert.equal(documentReads.length, 1);
  assert.equal(metrics.queries, 1); assert.equal(metrics.received, 101); assert.equal(metrics.documentReads, 1); assert.equal(metrics.batches.length, 1);
  assert.equal(db.collection("proveedores"), query, "Original database remains unmodified");
});

test("focused mode keeps bounds and retains only explicitly permitted synthetic evidence", () => {
  const root = path.resolve(import.meta.dirname, "../..");
  const launcher = readFileSync(path.join(root, "scripts/local/runLocal.cjs"), "utf8");
  assert.match(launcher, /adminSearchOnly = mode === "provider-admin-search"/);
  assert.match(launcher, /provider-admin-search-api.*providerAdminSearch\.test\.mjs/);
  assert.match(launcher, /provider-admin-search-browser.*providerAdminSearch\.browser\.test\.mjs/);
  assert.match(launcher, /provider-admin-search-warmup.*warmProviderAdminSearch\.cjs/);
  assert.match(launcher, /25\) \* 60000/);
  const { Evidence } = require("./evidence.cjs");
  const temp = mkdtempSync(path.join(root, ".local-isolation/search-evidence-test-"));
  const session = path.join(temp, "session"); mkdirSync(session);
  writeFileSync(path.join(session, "provider-admin-search-api-evidence.json"), "{}");
  writeFileSync(path.join(session, "private-profile.json"), "do not collect");
  const report = new Evidence(temp, "synthetic-test", []); report.collect(session);
  assert.ok(existsSync(path.join(report.directory, "provider-admin-search-api-evidence.json")));
  assert.equal(existsSync(path.join(report.directory, "private-profile.json")), false);
});
