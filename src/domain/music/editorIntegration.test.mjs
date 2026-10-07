import test from "node:test";
import assert from "node:assert/strict";
import { canAccessMusic } from "./access.js";
import { buildDraftMusicCallableRequest } from "./draftMusicTransport.js";
import { normalizeDraftRenderState } from "../drafts/sourceOfTruth.js";
import { buildPersistableRenderState } from "../../components/editor/persistence/borradorSyncRenderState.js";
import { readEditorRenderSnapshot, syncEditorSnapshotRenderState } from "../../lib/editorSnapshotAdapter.js";
import { buildDashboardPreviewRenderPayload, buildDashboardPreviewGeneratorInput } from "../dashboard/previewSession.js";

const music = { version: 1, enabled: true, track: { source: "catalog", id: "platform-demo" }, volume: 0.35, loop: true };

test("availability, authorization and read-only mode are independent gates", () => {
  assert.equal(canAccessMusic(), false);
  assert.equal(canAccessMusic({ canManageSite: true }), true);
  assert.equal(canAccessMusic({ available: false, canManageSite: true }), false);
  assert.equal(canAccessMusic({ available: true, canManageSite: false }), false);
  assert.equal(canAccessMusic({ canManageSite: true, editorReadOnly: true }), false);
});

test("verified music pilot can edit drafts without administrative access", () => {
  const pilot = { userUid: "pilot", userEmail: "jpeses@gmail.com", userEmailVerified: true,
    editorSession: { kind: "draft", id: "owned-draft" }, canManageSite: false };
  assert.equal(canAccessMusic(pilot), true);
  assert.equal(canAccessMusic({ ...pilot, userEmail: " JPESES@GMAIL.COM " }), true);
  for (const patch of [
    { userUid: "" }, { userEmail: "another@example.test" }, { userEmail: "jpeses+other@gmail.com" },
    { userEmailVerified: false }, { userEmailVerified: "true" }, { userEmail: null },
    { editorSession: null }, { editorSession: { kind: "template" } },
    { editorReadOnly: true }, { available: false },
  ]) assert.equal(canAccessMusic({ ...pilot, ...patch }), false, JSON.stringify(patch));
});

test("legacy editor persistence/snapshots do not materialize an optional music property", () => {
  const state = normalizeDraftRenderState({ objetos: [], secciones: [] });
  assert.equal(Object.hasOwn(state, "music"), false);
  assert.equal(Object.hasOwn(buildPersistableRenderState(state), "music"), false);
  const target = {};
  syncEditorSnapshotRenderState(state, target);
  assert.equal(Object.hasOwn(readEditorRenderSnapshot(target), "music"), false);
  const { generatorOptions } = buildDashboardPreviewGeneratorInput({ previewPayload: buildDashboardPreviewRenderPayload(state) });
  assert.equal(Object.hasOwn(generatorOptions, "music"), false);
});

test("music selection survives OFF, persistence, snapshot clone and preview handoff without a URL", () => {
  const state = normalizeDraftRenderState({ objetos: [], secciones: [], music: { ...music, enabled: false, url: "https://untrusted.test/a.mp3" } });
  const persisted = buildPersistableRenderState(state);
  assert.deepEqual(persisted.music, { ...music, enabled: false });
  const target = {};
  syncEditorSnapshotRenderState(persisted, target);
  const snapshot = readEditorRenderSnapshot(target);
  snapshot.music.track.id = "modified-copy";
  assert.equal(readEditorRenderSnapshot(target).music.track.id, "platform-demo");
  const { generatorOptions } = buildDashboardPreviewGeneratorInput({ previewPayload: buildDashboardPreviewRenderPayload(persisted) });
  assert.deepEqual(generatorOptions.music, { ...music, enabled: false });
});

test("callable transport strips server-owned metadata without changing authoring values", () => {
  const sentinel = { forbiddenSentinel: true };
  const patch = { music, objetos: [], ultimaEdicion: sentinel,
    draftContentMeta: { lastReason: "preview", updatedAt: sentinel },
    templateInput: { values: { title: "Local test" }, appliedAt: sentinel, updatedAt: sentinel },
    templateAuthoringDraft: { defaults: {}, updatedAt: sentinel },
  };
  const request = buildDraftMusicCallableRequest("draft-test", patch);
  assert.equal(request.draftId, "draft-test");
  assert.equal(JSON.stringify(request).includes("forbiddenSentinel"), false);
  assert.deepEqual(request.patch.templateInput.values, { title: "Local test" });
  assert.equal(patch.ultimaEdicion, sentinel);
});
