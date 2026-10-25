import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { httpsCallable } from "firebase/functions";
import { doc, setDoc, getDocFromServer } from "firebase/firestore";
import { createProviderAdminSearchFixtures, SEARCH_ROW_COUNT, SEARCH_TARGET, SEARCH_GROUP, searchId } from "./providerAdminSearchFixtures.mjs";
import { ordinary, adminClaim } from "./providerBetaFixtures.mjs";
import { contract } from "./editorFlowFixtures.mjs";

let fixture;
const report = { project: contract.LOCAL_PROJECT, synthetic: true, remoteEffects: false, rows: SEARCH_ROW_COUNT, performanceBaselineAvailable: false, measurements: [], checks: [], timingMeaning: "Local emulator elapsed times, not production latency or billing. Instrumented handler calls count actual returned documents; callable calls independently verify authentication and transport. Functional RED evidence is separate and does not establish a timing improvement." };
const rejects = (operation, code) => assert.rejects(operation, error => error.code === code);
const list = fields => fixture.admin("list", fields);
async function measured(label, filters) {
  const { result, metrics } = await fixture.measuredList(filters);
  metrics.responseBytes = Buffer.byteLength(JSON.stringify(result), "utf8");
  report.measurements.push({ label, ...metrics, matched: result.items.length, hasMore: Boolean(result.nextCursor) });
  assert.ok(metrics.received <= 5050); assert.ok(metrics.examined <= 5000); assert.ok(metrics.queries <= 50);
  assert.ok(metrics.responseBytes <= 262144);
  assert.equal(metrics.documentReads, 1, "The independent panel gate is read once");
  assert.ok(metrics.received >= metrics.examined, "Received counts include query overfetch");
  return result;
}
before(async () => {
  fixture = await createProviderAdminSearchFixtures(); report.datasetHash = fixture.datasetHash;
  assert.equal((await fixture.db.collection("proveedores").select().get()).size, SEARCH_ROW_COUNT, "Directory fixture base creates no hidden providers");
});
after(async () => {
  try { if (fixture) await fixture.cleanup(); }
  finally { await writeFile(path.join(process.env.RESERVA_LOCAL_SESSION, "provider-admin-search-api-evidence.json"), JSON.stringify(report, null, 2)); }
});

test("search finds the last of 3205 mixed legacy/current records in the first complete response", async () => {
  const started = performance.now();
  const result = await list({ search: "alamo final", pageSize: 20 });
  report.measurements.push({ label: "callable-first-search", elapsedMs: performance.now() - started, examined: result.scanned, matched: result.items.length });
  assert.deepEqual(result.items.map(item => item.id), [searchId(3204)]);
  assert.equal(result.nextCursor, null); assert.equal(result.items[0].nombre, SEARCH_TARGET);
  assert.doesNotMatch(JSON.stringify(result), /SEARCH-PRIVATE-INTERNAL|fuente|notasInternas|emailsAlternativos|contenido|actorUid/);
  for (const search of ["target@example.test", "alias-target@example.test", "LEGADO EXTREMO", "entry-3203@example.test"]) {
    const page = await list({ search });
    assert.deepEqual(page.items.map(item => item.id), [search.includes("3203") || search.includes("LEGADO") ? searchId(3203) : searchId(3204)]);
    assert.equal(page.nextCursor, null);
  }
  report.checks.push("late name/email/alternate-email and legacy matches, first response complete, summary allowlist");
});

test("sparse boundaries, combined filters and complete misses expose no intermediate empty page", async () => {
  const boundaries = await measured("boundaries", { search: "frontera", pageSize: 20 });
  assert.deepEqual(boundaries.items.map(item => item.id), [499, 500, 501, 2999, 3000].map(searchId));
  assert.equal(boundaries.nextCursor, null);
  const combined = await list({ search: "alamo", categoryId: "salones-fiestas", city: "la plata", publication: "publicada", owner: "responsable", pending: false });
  assert.deepEqual(combined.items.map(item => item.id), [searchId(3204)]);
  assert.deepEqual((await list({ search: "alamo", pending: true })).items, []);
  const empty = await measured("complete-miss", { search: "no-existing-synthetic-provider" });
  assert.deepEqual(empty.items, []); assert.equal(empty.nextCursor, null); assert.equal(empty.scanned, SEARCH_ROW_COUNT);
  report.checks.push("500/3000 boundaries, filters combined, truthful complete miss");
});

test("matching pagination has lookahead, no duplicates, a truthful last page and query-bound cursors", async () => {
  const first = await measured("sparse-page-one", { search: SEARCH_GROUP, pageSize: 20 });
  assert.equal(first.items.length, 20); assert.ok(first.nextCursor);
  const second = await list({ search: SEARCH_GROUP, pageSize: 20, cursor: first.nextCursor });
  assert.deepEqual([...first.items, ...second.items].map(item => item.id), Array.from({ length: 21 }, (_, index) => searchId(2000 + index * 50)));
  assert.equal(second.items.length, 1); assert.equal(second.nextCursor, null);
  const exact = await list({ search: SEARCH_GROUP, pageSize: 21 });
  assert.equal(exact.items.length, 21); assert.equal(exact.nextCursor, null);
  for (const fields of [{ search: "other" }, { city: "La Plata" }, { pageSize: 10 }, { pending: true }]) {
    await rejects(() => list({ search: SEARCH_GROUP, pageSize: 20, cursor: first.nextCursor, ...fields }), "functions/invalid-argument");
  }
  for (const cursor of [searchId(20), "invalid", first.nextCursor + "x"]) await rejects(() => list({ search: SEARCH_GROUP, cursor }), "functions/invalid-argument");
  for (const pageSize of [0, 51, "20"]) await rejects(() => list({ pageSize }), "functions/invalid-argument");
  report.checks.push("matching-only pagination/lookahead, exact-full final page, scoped/tampered cursors rejected");
});

test("read amplification and five warm local timings are measured rather than inferred from scanned", async () => {
  await measured("unfiltered-first-page", { pageSize: 20 });
  await measured("instrumented-first-late-search", { search: "alamo final" });
  for (let sample = 1; sample <= 5; sample += 1) await measured(`warm-late-search-${sample}`, { search: "alamo final" });
  const warm = report.measurements.filter(item => item.label.startsWith("warm-late-search-")).map(item => item.elapsedMs).sort((a, b) => a - b);
  report.warmTiming = { samples: warm.length, medianMs: warm[2], maximumMs: warm.at(-1) };
  const first = report.measurements.find(item => item.label === "unfiltered-first-page");
  assert.ok(first.received > first.examined, "The metric must expose lookahead/overfetch instead of calling scanned reads");
  report.checks.push("actual query documents and independent gate reads, cold/warm timing evidence");
});

test("budget exhaustion is explicit and never reports a partial/empty successful search", { timeout: 120000 }, async () => {
  await fixture.withBudgetOverflow(async () => {
    await rejects(() => list({ search: "no-existing-synthetic-provider" }), "functions/resource-exhausted");
    await assert.rejects(() => fixture.measuredList({ search: "no-existing-synthetic-provider" }), error => {
      assert.equal(error.code, "resource-exhausted");
      assert.ok(error.testMetrics.received <= 5050); assert.ok(error.testMetrics.queries <= 50);
      report.measurements.push({ label: "budget-error", rows: 5001, ...error.testMetrics, error: error.code });
      return true;
    });
  });
  report.checks.push("5001-candidate budget explicit failure without partial results");
});

test("search volume does not expand access or expose canonical documents", async () => {
  const common = await fixture.client(ordinary), claimed = await fixture.client(adminClaim), anonymous = await fixture.client();
  const request = who => httpsCallable(who.functions, "adminProvidersV1")({ operation: "list", search: "alamo final" });
  await rejects(() => request(anonymous), "functions/unauthenticated");
  for (const who of [common, claimed]) await rejects(() => request(who), "functions/permission-denied");
  await setDoc(doc(common.db, "usuarios", ordinary.uid), { admin: true, role: "superadmin", providerBeta: true }, { merge: true });
  await rejects(() => request(common), "functions/permission-denied");
  for (const who of [fixture.privileged, common, claimed, anonymous]) await rejects(() => getDocFromServer(doc(who.db, "proveedores", searchId(3204))), "permission-denied");
  await fixture.setControls({ panelEnabled: false, privateDirectoryEnabled: true });
  try { await rejects(() => list({ search: "alamo final" }), "functions/permission-denied"); }
  finally { await fixture.setControls({ panelEnabled: true, privateDirectoryEnabled: false }); }
  report.checks.push("anonymous/common/claim/profile denied, independent gate, canonical SDK still denied");
});
