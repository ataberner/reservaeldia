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
import { buildDesignerAiCapabilitySnapshot } from "../../editor/designerAiCapabilities.js";
import { buildDesignerAiGuidedQuestion } from "../../editor/designerAiGuidedConversation.js";
import ledgerRuntime from "../../../../shared/designerAiConversationLedger.js";

const require = createRequire(import.meta.url);
const ts = require("../../../../functions/node_modules/typescript");
const serviceSource = readFileSync(new URL("./service.js", import.meta.url), "utf8");

// Use the same metadata producer as copiarPlantilla, without loading Firebase.
const metadataModule = { exports: {} };
new Function("module", "exports", ts.transpileModule(readFileSync(
  new URL("../../../../functions/src/templates/draftAuthoringMetadata.ts", import.meta.url), "utf8"
), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText)(
  metadataModule, metadataModule.exports
);
const { buildDraftTemplateAuthoringMetadata } = metadataModule.exports;
const { buildDesignerAiConversationBrief } = ledgerRuntime;

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

function copiedInvitationDraft() {
  const template = {
    fieldsSchema: [
      { key: "event_primary_person_name", type: "text", eventDetailsRole: "primary_person_name", applyTargets: [] },
      { key: "event_secondary_person_name", type: "text", eventDetailsRole: "secondary_person_name", applyTargets: [] },
    ],
    defaults: { event_primary_person_name: "Clara", event_secondary_person_name: "Bruno" },
  };
  return {
    plantillaId: "synthetic-template", sourceTemplateId: "synthetic-template",
    objetos: [], secciones: [], eventDetails: { mode: "single" },
    templateAuthoringDraft: buildDraftTemplateAuthoringMetadata({
      template, templateId: "synthetic-template", uid: "synthetic-user", updatedAt: "synthetic-time",
    }),
  };
}

function invitationCapabilities(authoringSnapshot, document, conversationState) {
  return buildDesignerAiCapabilitySnapshot({
    authoringSnapshot, renderSnapshot: document, conversationState,
    documentNameState: { documentKind: "draft", documentId: "synthetic-draft", editable: true },
  });
}

test("copied template authoring keeps sample names unconfirmed through initial load, persistence and reentry", async () => {
  const original = copiedInvitationDraft();
  const expectedDefaults = original.templateAuthoringDraft.defaults;
  // copiarPlantilla stores authoring defaults, without root defaults/templateInput.
  assert.equal(Object.hasOwn(original, "templateInput"), false);
  assert.equal(Object.hasOwn(original, "defaults"), false);
  const harness = createHarness(original);
  const loaded = await harness.loadAuthoringState({
    slug: "synthetic-draft", templateId: original.plantillaId,
    preloadedDraft: original, persistMigration: true,
  });
  assert.deepEqual(loaded.templateInput.defaults, expectedDefaults);
  assert.deepEqual(Object.fromEntries(Object.keys(expectedDefaults).map((key) =>
    [key, loaded.templateInput.values[key]])), expectedDefaults);
  assert.deepEqual(loaded.templateInput.changedKeys, []);
  assert.equal(harness.writes.length, 1);

  const reopened = await harness.loadAuthoringState({ slug: "synthetic-draft", persistMigration: true });
  assert.equal(reopened.migration.applied, false);
  assert.equal(harness.writes.length, 1);
  for (const [authoringSnapshot, conversationState] of [[loaded, null], [reopened, { usage: { hasStarted: true } }]]) {
    const snapshot = invitationCapabilities(authoringSnapshot, harness.document, conversationState);
    assert.equal(snapshot.availability.people, true);
    assert.equal(buildDesignerAiConversationBrief(snapshot).nextStep.kind, "names");
    assert.match(buildDesignerAiGuidedQuestion(snapshot), /nombres/i);
    for (const id of ["event.people.primary_name", "event.people.secondary_name"]) {
      const leaf = snapshot.ledger.leaves.find((entry) => entry.id === id);
      assert.equal(leaf.status, "pending");
      assert.notEqual(leaf.provenance, "existing_user_data");
    }
  }
  assert.deepEqual(harness.document.templateInput.defaults, expectedDefaults);
  assert.deepEqual(harness.document.templateInput.changedKeys, []);
});

test("manual names saved after copied-template hydration remain confirmed when the draft is reopened", async () => {
  const harness = createHarness(copiedInvitationDraft());
  const loaded = await harness.loadAuthoringState({ slug: "synthetic-draft", persistMigration: true });
  const names = { event_primary_person_name: "Ana", event_secondary_person_name: "Luz" };
  await harness.saveAuthoringDraft({
    slug: "synthetic-draft", templateId: "synthetic-template",
    state: { ...loaded, values: names, objetos: [] },
  });
  const reopened = await harness.loadAuthoringState({ slug: "synthetic-draft", persistMigration: true });
  assert.deepEqual(reopened.templateInput.defaults, copiedInvitationDraft().templateAuthoringDraft.defaults);
  assert.deepEqual(reopened.templateInput.values, names);
  assert.deepEqual(reopened.templateInput.changedKeys, Object.keys(names));
  const snapshot = invitationCapabilities(reopened, harness.document, { usage: { hasStarted: true } });
  assert.equal(buildDesignerAiConversationBrief(snapshot).nextStep.kind, "event_structure");
  for (const id of ["event.people.primary_name", "event.people.secondary_name"]) {
    const leaf = snapshot.ledger.leaves.find((entry) => entry.id === id);
    assert.equal(leaf.status, "resolved_from_existing_user_data");
  }
});

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


test("template creation preserves optional music identity without introducing it for legacy", () => {
  const source = legacyDraft();
  const harness = createHarness(source);
  const legacyPayload = harness.buildTemplatePayloadFromAuthoring({ draftData: source });
  assert.equal(Object.hasOwn(legacyPayload, "music"), false);
  const music = { version: 1, enabled: true, track: { source: "catalog", id: "platform-demo" }, volume: 0.35, loop: true };
  const payload = harness.buildTemplatePayloadFromAuthoring({ draftData: { ...source, music } });
  assert.deepEqual(payload.music, music);
});
