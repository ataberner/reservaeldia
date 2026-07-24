import test from "node:test";
import assert from "node:assert/strict";

import { requireBuiltModule } from "./testUtils/requireBuiltModule.mjs";

const {
  documentReferencesCountdownPreset,
  planPublishDraftTransition,
  planSaveDraftTransition,
  resolveCountdownPresetDeletionPolicy,
  resolvePublicCatalogVersion,
} = requireBuiltModule("lib/countdownPresets/phase1Policy.js");

function publishedRoot(activeVersion, extra = {}) {
  return {
    estado: "published",
    activeVersion,
    ...extra,
  };
}

function publishedVersion(version, extra = {}) {
  return {
    version,
    nombre: `Version ${version}`,
    layout: {},
    ...extra,
  };
}

test("public catalog resolves only the active immutable version and ignores a root draft", () => {
  const version = publishedVersion(3, { nombre: "Publicado" });
  const result = resolvePublicCatalogVersion({
    rootData: publishedRoot(3, {
      draftVersion: 9,
      draft: { nombre: "Borrador privado" },
    }),
    versionExists: true,
    versionData: version,
  });

  assert.deepEqual(result, {
    ok: true,
    activeVersion: 3,
    versionData: version,
  });
});

test("public catalog accepts published presets without drafts", () => {
  const result = resolvePublicCatalogVersion({
    rootData: publishedRoot(1),
    versionExists: true,
    versionData: publishedVersion(1),
  });
  assert.equal(result.ok, true);
  assert.equal(result.activeVersion, 1);
});

test("public catalog fails closed for zero, missing, deleted, mismatched, and corrupt versions", () => {
  assert.deepEqual(
    resolvePublicCatalogVersion({
      rootData: publishedRoot(0),
      versionExists: true,
      versionData: publishedVersion(1),
    }),
    { ok: false, reason: "active-version-invalid" }
  );
  assert.deepEqual(
    resolvePublicCatalogVersion({
      rootData: publishedRoot(undefined),
      versionExists: true,
      versionData: publishedVersion(1),
    }),
    { ok: false, reason: "active-version-invalid" }
  );
  assert.deepEqual(
    resolvePublicCatalogVersion({
      rootData: publishedRoot(2),
      versionExists: false,
      versionData: null,
    }),
    { ok: false, reason: "active-version-missing" }
  );
  assert.deepEqual(
    resolvePublicCatalogVersion({
      rootData: publishedRoot(2),
      versionExists: true,
      versionData: publishedVersion(1),
    }),
    { ok: false, reason: "version-number-mismatch" }
  );
  assert.deepEqual(
    resolvePublicCatalogVersion({
      rootData: publishedRoot(2),
      versionExists: true,
      versionData: "corrupt",
    }),
    { ok: false, reason: "version-corrupt" }
  );
});

test("save transitions serialize save-vs-save without losing the winning draft", () => {
  const first = planSaveDraftTransition({
    currentDraftVersion: null,
    expectedDraftVersion: null,
  });
  assert.deepEqual(first, { kind: "commit", nextDraftVersion: 1 });

  const missingDocument = planSaveDraftTransition({
    currentDraftVersion: undefined,
    expectedDraftVersion: null,
  });
  assert.deepEqual(missingDocument, {
    kind: "commit",
    nextDraftVersion: 1,
  });

  const concurrent = planSaveDraftTransition({
    currentDraftVersion: first.nextDraftVersion,
    expectedDraftVersion: null,
  });
  assert.deepEqual(concurrent, {
    kind: "conflict",
    reason: "draft-version-mismatch",
  });
});

test("save and publish transitions protect save-vs-publish and publish-vs-publish", () => {
  const publish = planPublishDraftTransition({
    currentDraftVersion: 4,
    expectedDraftVersion: 4,
    activeVersion: 2,
    hasDraft: true,
  });
  assert.deepEqual(publish, { kind: "commit", nextActiveVersion: 3 });

  assert.deepEqual(
    planSaveDraftTransition({
      currentDraftVersion: null,
      expectedDraftVersion: 4,
    }),
    { kind: "conflict", reason: "draft-version-mismatch" }
  );
  assert.deepEqual(
    planPublishDraftTransition({
      currentDraftVersion: null,
      expectedDraftVersion: 4,
      activeVersion: 3,
      hasDraft: false,
    }),
    { kind: "conflict", reason: "draft-version-mismatch" }
  );
});

test("completed save and publish operation ids replay the original result", () => {
  const saveResult = { presetId: "preset-a", draftVersion: 5 };
  const publishResult = { presetId: "preset-a", activeVersion: 3 };

  assert.deepEqual(
    planSaveDraftTransition({
      currentDraftVersion: 5,
      expectedDraftVersion: 4,
      operationData: {
        type: "save",
        status: "completed",
        result: saveResult,
      },
    }),
    { kind: "replay", result: saveResult }
  );
  assert.deepEqual(
    planPublishDraftTransition({
      currentDraftVersion: null,
      expectedDraftVersion: 4,
      activeVersion: 3,
      hasDraft: false,
      operationData: {
        type: "publish",
        status: "completed",
        result: publishResult,
      },
    }),
    { kind: "replay", result: publishResult }
  );
});

test("operation ids cannot be reused across operation types", () => {
  assert.deepEqual(
    planPublishDraftTransition({
      currentDraftVersion: 1,
      expectedDraftVersion: 1,
      activeVersion: 0,
      hasDraft: true,
      operationData: {
        type: "save",
        status: "completed",
        result: { draftVersion: 1 },
      },
    }),
    { kind: "conflict", reason: "operation-type-mismatch" }
  );
});

test("incomplete operations fail closed and cannot advance a version", () => {
  assert.deepEqual(
    planSaveDraftTransition({
      currentDraftVersion: 2,
      expectedDraftVersion: 2,
      operationData: {
        type: "save",
        status: "staging",
      },
    }),
    { kind: "conflict", reason: "operation-incomplete" }
  );
  assert.deepEqual(
    planPublishDraftTransition({
      currentDraftVersion: 2,
      expectedDraftVersion: 2,
      activeVersion: 1,
      hasDraft: false,
    }),
    { kind: "conflict", reason: "draft-missing" }
  );
});

test("published presets, immutable versions, and live references force tombstones", () => {
  assert.equal(
    resolveCountdownPresetDeletionPolicy({
      activeVersion: 2,
      versionCount: 2,
      referenceCount: 0,
    }),
    "tombstone"
  );
  assert.equal(
    resolveCountdownPresetDeletionPolicy({
      activeVersion: null,
      versionCount: 1,
      referenceCount: 0,
    }),
    "tombstone"
  );
  assert.equal(
    resolveCountdownPresetDeletionPolicy({
      activeVersion: null,
      versionCount: 0,
      referenceCount: 1,
    }),
    "tombstone"
  );
  assert.equal(
    resolveCountdownPresetDeletionPolicy({
      activeVersion: null,
      versionCount: 0,
      referenceCount: 0,
    }),
    "hard-delete"
  );
});

test("asset protection detects direct, grouped, and encoded frame references", () => {
  assert.equal(
    documentReferencesCountdownPreset(
      {
        objetos: [
          {
            tipo: "grupo",
            children: [
              {
                tipo: "countdown",
                presetId: "preset-a",
              },
            ],
          },
        ],
      },
      "preset-a"
    ),
    true
  );
  assert.equal(
    documentReferencesCountdownPreset(
      {
        objetos: [
          {
            tipo: "countdown",
            frameSvgUrl:
              "https://firebasestorage.googleapis.com/v0/b/demo/o/assets%2Fcountdown%2Fframes%2Fpreset-a%2Fv2%2Fframe.svg?alt=media",
          },
        ],
      },
      "preset-a"
    ),
    true
  );
  assert.equal(
    documentReferencesCountdownPreset(
      { objetos: [{ tipo: "countdown", presetId: "preset-b" }] },
      "preset-a"
    ),
    false
  );
});
