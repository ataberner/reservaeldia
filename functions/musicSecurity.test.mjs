import assert from "node:assert/strict";
import test from "node:test";
import { requireBuiltModule } from "./testUtils/requireBuiltModule.mjs";
const { buildDraftMusicPatch, saveDraftWithMusicHandler } = requireBuiltModule("lib/music/draftMusicWrite.js");
const { normalizeMusicConfig } = requireBuiltModule("lib/music/config.js");
const music = { ...normalizeMusicConfig(null), enabled: true, track: { source: "catalog", id: "perfect-ed-sheeran" } };
const request = (uid, token = { admin: true }, patch = { music }) => ({ auth: uid ? { uid, token } : undefined, data: { draftId: "draft-test", patch } });
const pilotToken = { email: "jpeses@gmail.com", email_verified: true };
function store(owner = "owner", exists = true, savedMusic) {
  const writes = [];
  const ref = { id: "draft-test" };
  return { writes, db: {
    collection: (name) => { assert.equal(name, "borradores"); return { doc: (id) => { assert.equal(id, "draft-test"); return ref; } }; },
    runTransaction: async (run) => run({ get: async () => ({ exists, data: () => ({ userId: owner, ...(savedMusic ? { music: savedMusic } : {}) }) }), set: (target, patch, options) => { assert.deepEqual(options.mergeFields, Object.keys(patch)); writes.push({ target, patch }); } }),
  } };
}

test("music write denies unauthenticated, ordinary and unsupported role claims for music mutations", async () => {
  for (const [uid, token, code] of [[null, {}, "unauthenticated"], ["owner", {}, "permission-denied"], ["owner", { role: "admin" }, "permission-denied"], ["owner", { superadmin: true }, "permission-denied"]]) {
    await assert.rejects(saveDraftWithMusicHandler(request(uid, token), store().db), { code });
  }
});
test("music write authorizes configured superadmin without changing claims or Rules", async (t) => {
  const previous = process.env.SUPERADMINS_UIDS;
  process.env.SUPERADMINS_UIDS = "owner";
  t.after(() => { if (previous === undefined) delete process.env.SUPERADMINS_UIDS; else process.env.SUPERADMINS_UIDS = previous; });
  const fake = store();
  assert.deepEqual(await saveDraftWithMusicHandler(request("owner", {}), fake.db), { ok: true, draftId: "draft-test" });
  assert.equal(fake.writes.length, 1);
});

test("verified music pilot can save and disable music in their own draft without admin claims", async () => {
  for (const email of ["jpeses@gmail.com", " JPESES@GMAIL.COM "]) {
    const fake = store();
    const authToken = { ...pilotToken, email };
    await saveDraftWithMusicHandler(request("owner", authToken, { music, nombre: "Pilot invitation", objetos: [], secciones: [] }), fake.db);
    assert.deepEqual(fake.writes[0].patch.music, music);
    assert.equal(fake.writes[0].patch.nombre, "Pilot invitation");
    const saved = store("owner", true, music);
    await saveDraftWithMusicHandler(request("owner", authToken, { music: { ...music, enabled: false } }), saved.db);
    assert.deepEqual(saved.writes[0].patch.music, { ...music, enabled: false });
    assert.equal(Object.hasOwn(authToken, "admin"), false);
  }
});

test("music pilot access rejects unverified identities, other users and forged body identity", async () => {
  for (const token of [
    {}, { email: pilotToken.email }, { ...pilotToken, email_verified: false },
    { ...pilotToken, email_verified: "true" }, { ...pilotToken, email: "another@example.test" },
    { ...pilotToken, email: "jpeses+other@gmail.com" },
  ]) {
    const fake = store();
    const forged = request("owner", token);
    Object.assign(forged.data, { email: pilotToken.email, email_verified: true, admin: true });
    await assert.rejects(saveDraftWithMusicHandler(forged, fake.db), { code: "permission-denied" });
    assert.equal(fake.writes.length, 0);
  }
  for (const [owner, exists, code] of [["foreign", true, "permission-denied"], ["owner", false, "not-found"]]) {
    const fake = store(owner, exists);
    await assert.rejects(saveDraftWithMusicHandler(request("owner", pilotToken), fake.db), { code });
    assert.equal(fake.writes.length, 0);
  }
});
test("music save commits the whole editor patch atomically and preserves selection when disabled", async () => {
  const fake = store();
  const disabled = { ...music, enabled: false };
  await saveDraftWithMusicHandler(request("owner", { admin: true }, { music: disabled, objetos: [], secciones: [], nombre: "Invitation", draftContentMeta: { lastReason: "music-toggle", lastWriter: "publish", updatedAt: "forged" } }), fake.db);
  assert.equal(fake.writes.length, 1);
  const patch = fake.writes[0].patch;
  assert.deepEqual(patch.music, disabled);
  assert.equal(patch.nombre, "Invitation");
  assert.deepEqual(patch.objetos, []);
  assert.equal(patch.draftContentMeta.lastWriter, "canvas");
  assert.equal(patch.draftContentMeta.lastReason, "music-toggle");
  assert.equal(patch.draftContentMeta.updatedAt, patch.ultimaEdicion);
  assert.notEqual(patch.ultimaEdicion, "forged");
});
test("admin and superadmin cannot change another owner's draft or create missing drafts", async () => {
  for (const [owner, exists, code] of [["foreign", true, "permission-denied"], ["owner", false, "not-found"]]) {
    const fake = store(owner, exists);
    await assert.rejects(saveDraftWithMusicHandler(request("owner"), fake.db), { code });
    assert.equal(fake.writes.length, 0);
  }
});
test("music write rejects privilege fields, field paths, private sources and arbitrary audio references", () => {
  for (const patch of [
    { music, userId: "foreign" }, { music, slugPublico: "forged" }, { music, "music.enabled": true },
    { music: { ...music, url: "https://example.test/audio.mp3" } },
    { music: { ...music, track: { source: "user", id: "private" } } },
    { music: { ...music, track: { source: "catalog", id: "../../audio.mp3" } } },
    { music: { ...music, volume: -1 } }, { music: { ...music, volume: Number.NaN } },
    { music: { ...music, enabled: "true" } }, { objetos: [] }, { music, secciones: {} },
  ]) assert.throws(() => buildDraftMusicPatch(patch, "now"), { code: "invalid-argument" });
  assert.throws(() => buildDraftMusicPatch({ music: { ...music, track: { source: "catalog", id: "missing" } } }, "now"), { code: "failed-precondition" });
});
test("music enabled without selection remains a valid editor state", () => {
  assert.equal(buildDraftMusicPatch({ music: { ...music, track: null } }, "now").music.enabled, true);
});

test("an unchanged future source remains preserved while editing other fields", () => {
  const future = { ...music, track: { source: "user", id: "owned-track" } };
  assert.deepEqual(buildDraftMusicPatch({ music: future, nombre: "Updated" }, "now", future).music, future);
  assert.throws(() => buildDraftMusicPatch({ music: { ...future, volume: 0.9 } }, "now", future), { code: "invalid-argument" });
});

test("ordinary owners can save other fields while preserving active or future music exactly", async () => {
  for (const saved of [music, { ...music, track: { source: "user", id: "future-track" } }, { ...music, track: { source: "catalog", id: "inactive-track" } }]) {
    const fake = store("owner", true, saved);
    await saveDraftWithMusicHandler(request("owner", {}, { music: saved, nombre: "Updated title" }), fake.db);
    assert.equal(fake.writes.length, 1);
    assert.equal(fake.writes[0].patch.music, saved);
    assert.equal(fake.writes[0].patch.nombre, "Updated title");
    await assert.rejects(saveDraftWithMusicHandler(request("owner", {}, { music: { ...saved, enabled: false } }), fake.db), { code: "permission-denied" });
  }
});
