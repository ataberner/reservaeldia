import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import * as sourceOfTruth from "../../drafts/sourceOfTruth.js";
import * as session from "../../drafts/session.js";
import * as validation from "./validation.js";
import * as contract from "../../../../shared/templates/contract.js";
import * as cover from "../../../../shared/coverImageContract.mjs";
import * as assets from "../../../../shared/renderAssetContract.js";
import * as migration from "./migration.js";
import { createDraftWriteCoordinator } from "../../../components/editor/persistence/draftWriteCoordinator.js";

const require = createRequire(import.meta.url);
const ts = require("../../../../functions/node_modules/typescript");
const serviceSource = readFileSync(new URL("./service.js", import.meta.url), "utf8");

// Execute the production service and migration; replace only remote I/O.
function createHarness(initialDocument) {
  const document = structuredClone(initialDocument);
  const writes = [];
  const dependencies = {
    "firebase/firestore": { serverTimestamp: () => "synthetic-timestamp" },
    "@/domain/drafts/sourceOfTruth": sourceOfTruth,
    "@/domain/drafts/session": session,
    "../repository.js": { getTemplateById: async () => assert.fail("Unexpected template read") },
    "@/components/editor/persistence/editorSessionPersistence": {
      readEditorSessionDocument: async () => ({ exists: true, data: structuredClone(document) }),
      persistEditorSessionPatch: async (write) => {
        writes.push(structuredClone(write));
        for (const [key, value] of Object.entries(write.patch)) {
          if (key.startsWith("templateInput.")) {
            document.templateInput ||= {};
            document.templateInput[key.slice("templateInput.".length)] = structuredClone(value);
          } else {
            document[key] = structuredClone(value);
          }
        }
      },
    },
    "./validation.js": validation,
    "../../../../shared/templates/contract.js": contract,
    "../../../../shared/coverImageContract.mjs": cover,
    "../../../../shared/renderAssetContract.js": assets,
    "./migration.js": migration,
  };
  const module = { exports: {} };
  const compiled = ts.transpileModule(serviceSource, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  new Function("require", "module", "exports", compiled)((id) => {
    assert.ok(Object.hasOwn(dependencies, id), `Unexpected dependency ${id}`);
    return dependencies[id];
  }, module, module.exports);
  return { ...module.exports, document, writes };
}

function legacyDraft() {
  return {
    plantillaId: "synthetic-template",
    objetos: [{ id: "title", tipo: "texto", texto: "Una invitacion", seccionId: "cover", x: 50, y: 50 }],
    secciones: [{ id: "cover", orden: 1, altura: 716, fondo: "#f2ece3" }],
    eventDetails: { mode: "single" },
    templateAuthoringDraft: {
      version: 1,
      sourceTemplateId: "synthetic-template",
      fieldsSchema: [{ key: "headline", label: "Titulo", type: "text", group: "general", applyTargets: [{ elementId: "title", path: "texto" }] }],
      defaults: { headline: "Una invitacion" },
    },
  };
}

for (const [kind, version] of [["draft", 1], ["template", 1], ["draft", 2]]) {
  test(`${kind} v${version} migration with a partial preload preserves persisted sections and objects`, async () => {
    const original = legacyDraft();
    original.templateAuthoringDraft.version = version;
    const harness = createHarness(original);
    // This is the shape the editor supplied when Como lost all its sections.
    const { secciones: _omitted, ...partial } = original;
    const loaded = await harness.loadAuthoringState({
      slug: "synthetic-draft", templateId: original.plantillaId,
      editorSession: { kind, id: kind === "draft" ? "synthetic-draft" : original.plantillaId },
      preloadedDraft: partial, persistMigration: true,
    });
    assert.equal(loaded.migration.persisted, true);
    assert.equal(harness.writes.length, 1);
    assert.deepEqual(harness.document.secciones, original.secciones);
    assert.deepEqual(harness.document.objetos, original.objetos);
    assert.equal(harness.document.templateAuthoringDraft.status.isReady, true);
    assert.equal(Object.hasOwn(harness.writes[0].patch, "secciones"), false);
    assert.equal(Object.hasOwn(harness.writes[0].patch, "objetos"), false);
  });
}

test("queued migration does not overwrite newer geometry with its earlier read", async () => {
  const original = legacyDraft();
  const harness = createHarness(original);
  const coordinator = createDraftWriteCoordinator();
  let release;
  let started;
  const start = new Promise((resolve) => { started = resolve; });
  const pending = coordinator.enqueueDraftWrite(() => new Promise((resolve) => {
    release = resolve;
    started();
  }));
  await start;
  const loading = harness.loadAuthoringState({
    slug: "synthetic-draft", preloadedDraft: original, persistMigration: true,
    enqueueDraftWrite: coordinator.enqueueDraftWrite,
  });
  harness.document.secciones[0].altura = 950;
  harness.document.objetos[0].x = 125;
  release();
  await Promise.all([pending, loading]);
  assert.equal(harness.document.secciones[0].altura, 950);
  assert.equal(harness.document.objetos[0].x, 125);
});

test("read-only migration writes nothing and migrating a saved draft again is idempotent", async () => {
  const harness = createHarness(legacyDraft());
  const readonly = await harness.loadAuthoringState({ slug: "synthetic-draft" });
  assert.equal(readonly.migration.requiresPersistence, true);
  assert.equal(harness.writes.length, 0);
  await harness.loadAuthoringState({ slug: "synthetic-draft", persistMigration: true });
  assert.equal(harness.writes.length, 1);
  const reopened = await harness.loadAuthoringState({ slug: "synthetic-draft", persistMigration: true });
  assert.equal(reopened.migration.applied, false);
  assert.equal(harness.writes.length, 1);
  assert.deepEqual(harness.document.secciones, legacyDraft().secciones);
});
