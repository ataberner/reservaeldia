import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { adminProvidersHandler } = require("./lib/providers/betaService.js");
const search = require("./lib/providers/adminSearch.js");
const ACTOR = "synthetic-search-superadmin";
const previousSuperadmins = process.env.SUPERADMINS_UIDS;
before(() => { process.env.SUPERADMINS_UIDS = ACTOR; });
after(() => {
  if (previousSuperadmins === undefined) delete process.env.SUPERADMINS_UIDS;
  else process.env.SUPERADMINS_UIDS = previousSuperadmins;
});

function record(index, changes = {}) {
  return { id: `admin_scan_${String(index).padStart(6, "0")}`, data: {
    nombre: "Otro negocio sintético", categoriaPrincipalId: "foto-video", categoriaIds: ["foto-video"],
    contacto: { email: "other@example.test", emailsAlternativos: [] }, ubicacion: { ciudad: "La Plata" },
    estado: "publicado", propietario: { userId: null },
    beta: { version: 1, revision: 1, contenidoRevision: 1, estadoRevision: "sin_cambios", notasInternas: "PRIVATE_SEARCH_SENTINEL" },
    aprobada: { revision: 1 }, fuente: { private: "PRIVATE_SEARCH_SENTINEL" }, ...changes,
  } };
}

// Synthetic query adapter exercises the real handler; it cannot reach Firebase.
function database(records) {
  const reads = [];
  return { reads, db: {
    doc(path) {
      assert.equal(path, "app_config/proveedoresBeta");
      return { get: async () => ({ data: () => ({ panelEnabled: true }) }) };
    },
    collection(name) {
      assert.equal(name, "proveedores");
      let afterId = null, limit = null;
      const query = {
        orderBy() { return query; },
        select() { return query; },
        limit(value) { limit = value; return query; },
        startAfter(value) { afterId = value; return query; },
        async get() {
          assert.ok(Number.isInteger(limit) && limit > 0 && limit <= 101);
          const found = records.filter(item => afterId === null || item.id > afterId).slice(0, limit);
          reads.push({ received: found.length, limit });
          return { size: found.length, empty: found.length === 0, docs: found.map(item => ({ id: item.id, data: () => item.data })) };
        },
      };
      return query;
    },
  } };
}
const list = (db, payload = {}) => adminProvidersHandler({ auth: { uid: ACTOR, token: {} }, data: { operation: "list", ...payload } }, db);

test("a matching provider after 500 exclusions appears on the first results page", async () => {
  const rows = Array.from({ length: 601 }, (_, index) => record(index, index === 600 ? { nombre: "Objetivo sintético" } : {}));
  const fixture = database(rows);
  const result = await list(fixture.db, { search: "objetivo", pageSize: 20 });
  assert.deepEqual(result.items.map(item => item.id), [rows[600].id]);
  assert.equal(result.nextCursor, null);
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE_SEARCH_SENTINEL|notasInternas|fuente|emailsAlternativos/);
});

test("a full page followed only by exclusions is the final page", async () => {
  const rows = Array.from({ length: 650 }, (_, index) => record(index, index < 2 ? { nombre: "Objetivo sintético" } : {}));
  const fixture = database(rows);
  const result = await list(fixture.db, { search: "objetivo", pageSize: 2 });
  assert.equal(result.items.length, 2);
  assert.equal(result.nextCursor, null, "Siguiente requires another matching provider, not merely another stored row");
});

test("sparse matching pages retain lookahead without duplicates or skipped matches", async () => {
  const indices = [600, 1100, 1600];
  const fixture = database(Array.from({ length: 1700 }, (_, index) => record(index, indices.includes(index) ? { nombre: "Objetivo sintético" } : {})));
  const first = await list(fixture.db, { search: "objetivo", pageSize: 2 });
  assert.deepEqual(first.items.map(item => item.id), [record(600).id, record(1100).id]);
  assert.ok(first.nextCursor);
  const second = await list(fixture.db, { search: "objetivo", pageSize: 2, cursor: first.nextCursor });
  assert.deepEqual(second.items.map(item => item.id), [record(1600).id]);
  assert.equal(second.nextCursor, null);
});

test("scan bounds fail explicitly without returning a partial page", async () => {
  const fixture = database(Array.from({ length: 5001 }, (_, index) => record(index, index === 0 ? { nombre: "Objetivo sintético" } : {})));
  await assert.rejects(() => list(fixture.db, { search: "objetivo", pageSize: 20 }), { code: "resource-exhausted" });
  assert.equal(fixture.reads.length, 50);
  assert.equal(fixture.reads.reduce((sum, read) => sum + read.received, 0), 5050);
});

test("an actual end at the 5000th examined row is complete, including an empty result", async () => {
  const fixture = database(Array.from({ length: 5000 }, (_, index) => record(index)));
  const result = await list(fixture.db, { search: "no coincidencias" });
  assert.deepEqual(result.items, []); assert.equal(result.nextCursor, null); assert.equal(result.scanned, 5000);
  assert.equal(fixture.reads.length, 50);
  assert.equal(fixture.reads.reduce((sum, read) => sum + read.received, 0), 5049);
});

test("cursors bind all normalized filters, page size, version, scope and fixed order", async () => {
  const fixture = database([record(0), record(1), record(2)]);
  const original = { search: "  ÓTRO   NEGOCIO ", city: "LÁ PLATA", pageSize: 1 };
  const first = await list(fixture.db, original);
  const next = await list(fixture.db, { ...original, search: "otro negocio", city: "la plata", cursor: first.nextCursor });
  assert.equal(next.items[0].id, record(1).id);
  for (const change of [{ search: "different" }, { city: "different" }, { categoryId: "foto-video" }, { publication: "publicada" }, { owner: "plataforma" }, { pending: false }, { pageSize: 2 }, { order: "documentId:desc" }]) {
    await assert.rejects(() => list(fixture.db, { ...original, ...change, cursor: first.nextCursor }), { code: "invalid-argument" });
  }
  const decoded = JSON.parse(Buffer.from(first.nextCursor, "base64url").toString("utf8"));
  for (const change of [{ version: 2 }, { scope: "directory" }, { order: "documentId:desc" }, { extra: true }, { lastId: "unsafe/path" }]) {
    const cursor = Buffer.from(JSON.stringify({ ...decoded, ...change })).toString("base64url");
    await assert.rejects(() => list(fixture.db, { ...original, cursor }), { code: "invalid-argument" });
  }
  for (const cursor of [record(0).id, "not json", "A".repeat(801), {}]) await assert.rejects(() => list(fixture.db, { ...original, cursor }), { code: "invalid-argument" });
});

test("invalid filters are rejected before provider reads", async () => {
  const fixture = database([record(0)]);
  for (const invalid of [{ pageSize: "20" }, { pageSize: true }, { pageSize: 0 }, { pageSize: 51 }, { pageSize: 1.1 }, { search: {} }, { search: "A".repeat(201) }, { city: 3 }, { categoryId: "unsafe/path" }, { publication: "publicado" }, { owner: "admin" }, { pending: "false" }]) {
    await assert.rejects(() => list(fixture.db, invalid), { code: "invalid-argument" });
  }
  assert.equal(fixture.reads.length, 0);
});

test("legacy names, alternate emails and primary category remain searchable without new fields", async () => {
  const legacy = record(0, { nombre: "Ámbar", categoriaIds: undefined, beta: undefined, aprobada: undefined,
    contacto: { email: null, emailsAlternativos: ["legado@example.test"] }, estado: "pendiente" });
  const fixture = database([legacy]);
  for (const query of [{ search: "ambar" }, { search: "LEGADO@example.test" }, { categoryId: "foto-video" }, { pending: true, publication: "borrador", owner: "plataforma" }]) {
    assert.deepEqual((await list(fixture.db, query)).items.map(item => item.id), [legacy.id]);
  }
  assert.equal((await list(fixture.db, { pending: false })).items.length, 0);
});

test("the 20 second deadline rejects a completed slow batch without a partial response", async () => {
  let clock = 0, calls = 0;
  await assert.rejects(() => search.searchAdminProviders(async () => {
    calls += 1; clock = 20000;
    return { records: [record(0)], received: 1, exhausted: true };
  }, search.normalizeAdminSearchFilters({}), null, () => clock), { code: "deadline-exceeded" });
  assert.equal(calls, 1);
});

test("the deadline also rejects a pending SDK read and schedules no further batch", async context => {
  context.mock.timers.enable({ apis: ["setTimeout"] });
  let calls = 0;
  const pending = search.searchAdminProviders(() => { calls += 1; return new Promise(() => {}); }, search.normalizeAdminSearchFilters({}), null, () => 0);
  const rejection = assert.rejects(pending, { code: "deadline-exceeded" });
  context.mock.timers.tick(20000);
  await rejection;
  assert.equal(calls, 1);
});

test("the UTF-8 JSON response is bounded without silently truncating legacy values", async () => {
  const maximumBytes = 256 * 1024;
  assert.equal(search.ADMIN_SEARCH_LIMITS.responseBytes, maximumBytes);
  const normal = await list(database([record(0)]).db);
  assert.ok(Buffer.byteLength(JSON.stringify(normal), "utf8") < maximumBytes);
  const emptyName = record(0, { nombre: "X" });
  const base = await list(database([emptyName]).db);
  const paddingBytes = maximumBytes - Buffer.byteLength(JSON.stringify(base), "utf8");
  const name = "X" + "á".repeat(Math.floor(paddingBytes / 2)) + "a".repeat(paddingBytes % 2);
  const atBoundary = await list(database([record(0, { nombre: name })]).db);
  assert.equal(Buffer.byteLength(JSON.stringify(atBoundary), "utf8"), maximumBytes);
  assert.equal(atBoundary.items[0].nombre, name);
  await assert.rejects(() => list(database([record(0, { nombre: name + "a" })]).db), { code: "resource-exhausted" });
  // A cursor is part of the size budget too, not only the accumulated items.
  await assert.rejects(() => list(database([record(0, { nombre: name }), record(1)]).db, { pageSize: 1 }), { code: "resource-exhausted" });
});
