import test from "node:test";
import assert from "node:assert/strict";
import { installFirebaseStorageMock } from "./testUtils/firebaseStorageMock.mjs";
import { requireBuiltModule } from "./testUtils/requireBuiltModule.mjs";
import { AUTHORIZED_RENDER_CONTEXT } from "./testUtils/authorizedRenderFixture.mjs";
const { normalizeDraftRenderState } = requireBuiltModule("lib/drafts/sourceOfTruth.js");
const { prepareRenderPayload, validatePreparedRenderPayload, buildPreviewRenderPayloadFromPreparedPayload, generateHtmlFromPreparedRenderPayload } = requireBuiltModule("lib/render/prepareRenderPayload.js");
const { normalizeMusicConfig } = requireBuiltModule("lib/music/config.js");
const { saveDraftWithMusicHandler } = requireBuiltModule("lib/music/draftMusicWrite.js");
const music = { ...normalizeMusicConfig(null), enabled: true, track: { source: "catalog", id: "perfect-ed-sheeran" } };
const draft = (config) => ({ objetos: [{ id: "title", tipo: "texto", texto: "Invitation", seccionId: "hero", x: 20, y: 20, width: 300, height: 60, fontSize: 32 }], secciones: [{ id: "hero", orden: 1, altura: 600, fondo: "#fff" }], ...(config === undefined ? {} : { music: config }) });

test("legacy and disabled music produce no entry gate or audio resource in either prepared surface", async (t) => {
  const mock = installFirebaseStorageMock(); t.after(() => mock.restore());
  for (const config of [undefined, { ...music, enabled: false }]) {
    const prepared = await prepareRenderPayload(draft(config), { assetAccess: AUTHORIZED_RENDER_CONTEXT });
    assert.equal(prepared.draftRenderState.music.enabled, false);
    assert.equal(buildPreviewRenderPayloadFromPreparedPayload(prepared).musicResource, null);
    for (const isPreview of [true, false]) {
      const html = generateHtmlFromPreparedRenderPayload(prepared, { slug: "music-test", isPreview });
      assert.doesNotMatch(html, /id="invitation-entry-gate"/);
      assert.doesNotMatch(html, /assets\/music\/perfect\.mp3/);
    }
  }
});
test("prepared preview and publication share canonical selection and the same music runtime resource", async (t) => {
  const mock = installFirebaseStorageMock(); t.after(() => mock.restore());
  const prepared = await prepareRenderPayload(draft(music), { assetAccess: AUTHORIZED_RENDER_CONTEXT });
  assert.equal(validatePreparedRenderPayload(prepared).canPublish, true);
  const preview = buildPreviewRenderPayloadFromPreparedPayload(prepared);
  assert.deepEqual(preview.music, music);
  assert.equal(preview.musicResource.id, "perfect-ed-sheeran");
  assert.match(preview.musicResource.url, /^https:\/\/reservaeldia\.com\.ar\/assets\/music\/perfect\.mp3$/);
  for (const isPreview of [true, false]) {
    const html = generateHtmlFromPreparedRenderPayload(prepared, { slug: "music-test", isPreview });
    assert.match(html, /id="invitation-entry-gate"/);
    assert.match(html, /__invitationMusicRuntime/);
    assert.match(html, /assets\/music\/perfect\.mp3/);
  }
  assert.equal(mock.downloadReads.length, 0);
});
test("unavailable tracks warn and leave invitation accessible without a gate", async (t) => {
  const mock = installFirebaseStorageMock(); t.after(() => mock.restore());
  for (const track of [null, { source: "catalog", id: "not-in-catalog" }, { source: "user", id: "future" }]) {
    const prepared = await prepareRenderPayload(draft({ ...music, track }), { assetAccess: AUTHORIZED_RENDER_CONTEXT });
    const result = validatePreparedRenderPayload(prepared);
    assert.equal(result.canPublish, true);
    assert.ok(result.warnings.some((issue) => issue.code === "music-track-unavailable"));
    assert.doesNotMatch(generateHtmlFromPreparedRenderPayload(prepared), /id="invitation-entry-gate"/);
  }
});

test("music saved by the verified pilot reaches preview and published HTML", async (t) => {
  const mock = installFirebaseStorageMock(); t.after(() => mock.restore());
  let savedDraft = { userId: "pilot", ...draft() };
  const ref = {};
  const db = {
    collection: () => ({ doc: () => ref }),
    runTransaction: async run => run({
      get: async () => ({ exists: true, data: () => savedDraft }),
      set: (_, patch) => { savedDraft = { ...savedDraft, ...patch }; },
    }),
  };
  await saveDraftWithMusicHandler({
    auth: { uid: "pilot", token: { email: "jpeses@gmail.com", email_verified: true } },
    data: { draftId: "pilot-draft", patch: { music } },
  }, db);
  const prepared = await prepareRenderPayload(savedDraft, { assetAccess: { kind: "draft", ownerUid: "pilot", draftId: "pilot-draft" } });
  assert.equal(validatePreparedRenderPayload(prepared).canPublish, true);
  assert.deepEqual(buildPreviewRenderPayloadFromPreparedPayload(prepared).music, music);
  for (const isPreview of [true, false]) {
    const html = generateHtmlFromPreparedRenderPayload(prepared, { slug: "pilot-draft", isPreview });
    assert.match(html, /id="invitation-entry-gate"/);
    assert.match(html, /assets\/music\/perfect\.mp3/);
  }
});
test("draft source of truth normalizes music and cannot persist a physical audio URL", () => {
  assert.deepEqual(normalizeDraftRenderState({}).music, normalizeMusicConfig(null));
  const normalized = normalizeDraftRenderState({ music: { ...music, url: "https://foreign.example/track.mp3", track: { ...music.track, audioReference: "/foreign.mp3" } } });
  assert.deepEqual(normalized.music, music);
});
