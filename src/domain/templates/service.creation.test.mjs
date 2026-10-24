import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";

const requireFunctions = createRequire(new URL("../../../functions/package.json", import.meta.url));
const ts = requireFunctions("typescript");
const source = fs.readFileSync(new URL("./service.js", import.meta.url), "utf8");
const code = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const tick = () => new Promise(resolve => setImmediate(resolve));
const plain = value => JSON.parse(JSON.stringify(value));

// Execute the real transport adapter with offline SDK doubles. Every import is
// explicit: no Firebase app, credentials, bucket, telemetry or font loader runs.
function fixture({ copy, read } = {}) {
  const calls = { copies: [], reads: [], writes: [] };
  const timers = new Map();
  let nextTimer = 0;
  const dependencies = {
    "firebase/functions": {
      httpsCallable: (_functions, name) => async payload => {
        assert.equal(name, "copiarPlantilla");
        calls.copies.push(plain(payload));
        return copy ? copy(payload) : { data: { slug: payload.slug } };
      },
    },
    "firebase/firestore": {
      doc: (_db, collection, id) => ({ collection, id }),
      getDoc: async reference => {
        calls.reads.push(plain(reference));
        return read ? read(reference) : { exists: () => false };
      },
      updateDoc: async (...args) => { calls.writes.push(args); },
      serverTimestamp: () => "synthetic-timestamp",
    },
    "@/firebase": { db: {}, functions: {} },
    "./repository.js": {},
    "./formModel.js": {},
    "./personalization.js": {},
    "./galleryUpload.js": {},
    "@/domain/drafts/sourceOfTruth": {},
    "@/domain/countdownAudit/runtime": {},
    "@/lib/textCenteringPolicy": {},
    "./draftPersonalizationDebug.js": { logTemplateDraftDebug() {} },
    "./personalizationContract.js": {},
  };
  const exports = {};
  vm.runInNewContext(code, {
    exports,
    setTimeout(callback, delay) {
      const id = ++nextTimer;
      timers.set(id, { callback, delay });
      return id;
    },
    clearTimeout: id => timers.delete(id),
    require(name) {
      assert.ok(Object.hasOwn(dependencies, name), `Unexpected dependency ${name}`);
      return dependencies[name];
    },
  }, { filename: "templates/service.js" });
  return {
    calls,
    api: exports,
    timers,
    async nextTimer() {
      const entry = timers.entries().next().value;
      assert.ok(entry, "Expected an existing recovery timer");
      timers.delete(entry[0]);
      entry[1].callback();
      await tick();
    },
  };
}

test("template creation sends the existing caller contract once and leaves writes to the backend", async () => {
  const f = fixture();
  const result = await f.api.createDraftFromTemplate({
    templateId: " template-synthetic ", templateName: "Invitación de prueba",
  });
  assert.match(result.slug, /^invitacion-de-prueba-\d+$/);
  assert.deepEqual(f.calls.copies, [{ plantillaId: "template-synthetic", slug: result.slug }]);
  assert.deepEqual(f.calls.reads, []);
  assert.deepEqual(f.calls.writes, []);
  assert.equal(f.timers.size, 0);
});

test("invalid templates are rejected before any callable or document access", async () => {
  const f = fixture();
  await assert.rejects(f.api.createDraftFromTemplate({ templateId: " " }), /plantilla invalida/);
  assert.deepEqual(f.calls, { copies: [], reads: [], writes: [] });
});

for (const code of ["functions/permission-denied", "functions/already-exists", "functions/failed-precondition"]) {
  test(`${code} preserves the server rejection without a replacement draft or fallback write`, async () => {
    const failure = Object.assign(new Error("Synthetic creation conflict"), { code });
    const f = fixture({ copy: async () => { throw failure; } });
    await assert.rejects(f.api.createDraftFromTemplate({ templateId: "template-synthetic" }), error => error === failure);
    assert.equal(f.calls.copies.length, 1);
    assert.deepEqual(f.calls.reads, []);
    assert.deepEqual(f.calls.writes, []);
    assert.equal(f.timers.size, 0);
  });
}

test("a timed out callable confirms the same draft slug without issuing another creation", async () => {
  let completeCopy;
  let reads = 0;
  const f = fixture({
    copy: () => new Promise(resolve => { completeCopy = resolve; }),
    read: async () => {
      const exists = ++reads >= 2;
      return { exists: () => exists };
    },
  });
  const pending = f.api.createDraftFromTemplate({ templateId: "template-synthetic" });
  const requestedSlug = f.calls.copies[0].slug;
  await f.nextTimer();
  await f.nextTimer();
  const result = await pending;
  assert.equal(result.slug, requestedSlug);
  assert.equal(f.calls.copies.length, 1);
  assert.deepEqual(f.calls.reads, [
    { collection: "borradores", id: requestedSlug },
    { collection: "borradores", id: requestedSlug },
  ]);
  completeCopy({ data: { slug: requestedSlug } });
  await tick();
  assert.deepEqual(f.calls.writes, []);
  assert.equal(f.timers.size, 0);
});

test("failed timeout readback never creates a second draft or accepts an unreadable document", async () => {
  const denied = Object.assign(new Error("Synthetic unreadable draft"), { code: "permission-denied" });
  const f = fixture({ copy: () => new Promise(() => {}), read: async () => { throw denied; } });
  const pending = f.api.createDraftFromTemplate({ templateId: "template-synthetic" });
  const rejected = assert.rejects(pending, /esta tardando mas de lo esperado/);
  for (let attempt = 0; attempt < 10 && f.timers.size; attempt++) await f.nextTimer();
  assert.equal(f.timers.size, 0, "Readback must have a bounded recovery window");
  await rejected;
  assert.equal(f.calls.copies.length, 1);
  assert.ok(f.calls.reads.length > 0 && f.calls.reads.length <= 10);
  assert.ok(f.calls.reads.every(item => item.id === f.calls.copies[0].slug));
  assert.deepEqual(f.calls.writes, []);
});

test("opening without personalization accepts the server result without resetting draft content", async () => {
  const f = fixture({ copy: async payload => ({ data: { slug: payload.slug } }) });
  const result = await f.api.createDraftFromTemplateWithInput({
    template: { id: "template-synthetic", nombre: "Plantilla" },
    userId: "synthetic-owner",
    applyChanges: false,
  });
  assert.equal(result.slug, f.calls.copies[0].slug);
  assert.equal(result.applied, false);
  assert.deepEqual(plain(result.changedKeys), []);
  assert.deepEqual(f.calls.reads, []);
  assert.deepEqual(f.calls.writes, []);
});
