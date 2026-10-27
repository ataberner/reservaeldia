import assert from "node:assert/strict";
import test, { before, after } from "node:test";
import { requireBuiltModule } from "./testUtils/requireBuiltModule.mjs";

const { resolveTemplateDraftCreationIdentity } = requireBuiltModule("lib/drafts/administrativeDraftCreation.js");
const { adminDraftContentRevision, saveAdminDraftPatchHandler } = requireBuiltModule("lib/drafts/administrativeDraftWrite.js");
const { createTemplateDraft } = requireBuiltModule("lib/drafts/templateDraftCreation.js");
const { hasModernDraftRenderState } = requireBuiltModule("lib/drafts/draftState.js");
const { saveDraftWithMusicHandler } = requireBuiltModule("lib/music/draftMusicWrite.js");
const originalSuperadmins = process.env.SUPERADMINS_UIDS;
before(() => { process.env.SUPERADMINS_UIDS = "superadmin"; });
after(() => { if (originalSuperadmins === undefined) delete process.env.SUPERADMINS_UIDS; else process.env.SUPERADMINS_UIDS = originalSuperadmins; });
const request = (uid, data, token = {}) => ({ auth: uid ? { uid, token } : undefined, data });

test("explicit empty Konva drafts remain openable without classifying empty legacy documents as modern", () => {
  assert.equal(hasModernDraftRenderState({ editor: "konva", objetos: [], secciones: [] }), true);
  assert.equal(hasModernDraftRenderState({ objetos: [{ id: "modern" }], secciones: [] }), true);
  for (const legacy of [null, {}, { objetos: [], secciones: [] }, { editor: "html", objetos: [], secciones: [] },
    { editor: "konva", objetos: [] }, { editor: "html", contenido: { title: "Legacy" } }]) {
    assert.equal(hasModernDraftRenderState(legacy), false);
  }
});

test("ordinary creation retains the authenticated owner without additional Auth reads", async () => {
  assert.deepEqual(await resolveTemplateDraftCreationIdentity(request("owner", {}), () => { throw new Error("unexpected lookup"); }),
    { actorUid: "owner", ownerUid: "owner", administrative: false });
});

test("only configured superadmins can select an existing owner; claims and payload identities cannot grant it", async () => {
  const lookups = [];
  const getUser = async uid => { lookups.push(uid); return { uid }; };
  for (const [uid, token, code] of [[null, {}, "unauthenticated"], ["user", {}, "permission-denied"],
    ["admin", { admin: true }, "permission-denied"], ["fake", { role: "superadmin", superadmin: true }, "permission-denied"]]) {
    await assert.rejects(resolveTemplateDraftCreationIdentity(request(uid, { ownerUid: "owner", actorUid: "superadmin" }, token), getUser), { code });
  }
  assert.deepEqual(lookups, []);
  assert.deepEqual(await resolveTemplateDraftCreationIdentity(request("superadmin", { ownerUid: "owner" }), getUser),
    { actorUid: "superadmin", ownerUid: "owner", administrative: true });
  assert.deepEqual(lookups, ["owner"]);
  await assert.rejects(resolveTemplateDraftCreationIdentity(request("superadmin", { ownerUid: "missing" }), async () => {
    throw Object.assign(new Error("missing"), { code: "auth/user-not-found" });
  }), { code: "not-found" });
  for (const ownerUid of ["", "owner/other", " owner", null, 42, "x".repeat(129)]) {
    await assert.rejects(resolveTemplateDraftCreationIdentity(request("superadmin", { ownerUid }), getUser), { code: "invalid-argument" });
  }
});

test("creation retries never replace owner, existing edits or template identity", async () => {
  let stored;
  const ref = { create: async data => { if (stored) throw { code: 6 }; stored = structuredClone(data); },
    get: async () => ({ exists: Boolean(stored), data: () => stored }) };
  const identity = { uid: "owner", plantillaId: "template", mode: "konva" };
  const initial = { userId: "owner", plantillaId: "template", editor: "konva", objetos: [], secciones: [],
    estadoBorrador: "borrador_activo", draftCreation: { mode: "konva", actorUid: "superadmin", ownerUid: "owner" } };
  assert.equal((await createTemplateDraft(ref, identity, initial)).created, true);
  stored.nombre = "Owner continued editing";
  assert.equal((await createTemplateDraft(ref, identity, initial)).created, false);
  assert.equal(stored.nombre, "Owner continued editing");
  assert.equal(stored.userId, "owner");
  await assert.rejects(createTemplateDraft(ref, { ...identity, uid: "superadmin" }, initial), { code: "permission-denied" });
  await assert.rejects(createTemplateDraft(ref, { ...identity, plantillaId: "other-template" }, initial), { code: "already-exists" });
});

function fixture(overrides = {}) {
  let current = { userId: "owner", editor: "konva", objetos: [{ id: "title", texto: "Original" }], secciones: [],
    nombre: "Original", estadoBorrador: "borrador_activo", plantillaId: "template", slugPublico: "published-before", ...overrides };
  const writes = [];
  let beforeTransaction = () => {};
  const snapshot = () => ({ exists: current !== null, data: () => structuredClone(current) });
  const ref = { get: async () => snapshot() };
  const db = { collection: name => { assert.equal(name, "borradores"); return { doc: id => { assert.equal(id, "draft"); return ref; } }; },
    runTransaction: async callback => {
      beforeTransaction();
      return callback({ get: async () => snapshot(), set: (target, patch, options) => {
        assert.equal(target, ref);
        assert.deepEqual(options.mergeFields, Object.keys(patch)); writes.push(patch); current = { ...current, ...patch };
      } });
    } };
  return { db, writes, current: () => current, mutate: patch => { current = { ...current, ...patch }; },
    race: callback => { beforeTransaction = callback; }, remove: () => { current = null; },
    save: (patch = { nombre: "Administrative edit" }, { uid = "superadmin", ownerUid = "owner", revision = adminDraftContentRevision(current), token = {}, normalize = async value => value } = {}) =>
      saveAdminDraftPatchHandler(request(uid, { slug: "draft", ownerUid, expectedRevision: revision, patch }, token), db, normalize) };
}

test("admin editor saves the same draft with owner, template and publication untouched and real actor audit", async () => {
  const f = fixture();
  const result = await f.save({ nombre: "Updated", objetos: [{ id: "title", texto: "Changed" }], rsvp: { enabled: true } });
  assert.equal(result.ok, true);
  assert.equal(f.current().userId, "owner");
  assert.equal(f.current().plantillaId, "template");
  assert.equal(f.current().slugPublico, "published-before");
  assert.equal(f.current().estadoBorrador, "borrador_activo");
  assert.equal(f.current().objetos[0].texto, "Changed");
  assert.equal(result.revision, adminDraftContentRevision(f.current()));
  assert.equal(result.adminDraftRevision, f.current().adminDraftRevision);
  assert.equal(f.current().adminAudit.updatedByUid, "superadmin");
  assert.equal(f.current().adminAudit.ownerUid, "owner");
  const second = await f.save({ gifts: { enabled: true } }, { revision: result.revision });
  assert.notEqual(second.adminDraftRevision, result.adminDraftRevision);
  assert.equal(f.writes.length, 2);
});

test("asset antecedents come only from persisted revision-protected content, never client history", async () => {
  const savedAsset = "plantillas/saved-template/assets/photo.webp";
  const forgedAsset = "plantillas/unrelated-template/assets/secret.webp";
  const f = fixture({ objetos: [{ id: "photo", src: savedAsset }], portada: savedAsset,
    thumbnailUrl: forgedAsset, adminAudit: { updatedByUid: "prior-actor" },
    draftCreation: { actorUid: "prior-actor", ownerUid: "owner" } });
  const initial = structuredClone(f.current());
  let normalized = false;
  await saveAdminDraftPatchHandler(request("superadmin", {
    slug: "draft", ownerUid: "owner", expectedRevision: adminDraftContentRevision(initial),
    patch: { nombre: "Administrative edit", objetos: initial.objetos },
    persistedDraft: { objetos: [{ id: "forged", src: forgedAsset }], portada: forgedAsset },
  }), f.db, async (patch, context) => {
    normalized = true;
    assert.equal(context.actorUid, "superadmin");
    assert.equal(context.ownerUid, "owner");
    assert.equal(context.slug, "draft");
    assert.deepEqual(context.persistedDraft.objetos, initial.objetos);
    assert.equal(context.persistedDraft.portada, savedAsset);
    for (const key of ["thumbnailUrl", "userId", "plantillaId", "estadoBorrador", "slugPublico", "adminAudit", "draftCreation"]) {
      assert.equal(Object.hasOwn(context.persistedDraft, key), false, key + " is not a content antecedent");
    }
    assert.equal(JSON.stringify(context.persistedDraft).includes(forgedAsset), false);
    return patch;
  });
  assert.equal(normalized, true);
  assert.equal(f.writes.length, 1);
  assert.equal(f.current().userId, "owner");
  assert.deepEqual(f.current().objetos, initial.objetos);
  assert.equal(f.current().slugPublico, "published-before");
});

test("persisted asset antecedents cannot survive an owner content change before the transaction", async () => {
  const previous = [{ id: "photo", src: "plantillas/old-template/assets/old.webp" }];
  const recent = [{ id: "photo", src: "plantillas/recent-template/assets/new.webp" }];
  const f = fixture({ objetos: previous, adminDraftRevision: "prior-admin" });
  await assert.rejects(f.save({ nombre: "Administrative edit", objetos: previous }, {
    normalize: async (patch, context) => {
      assert.deepEqual(context.persistedDraft.objetos, previous);
      f.mutate({ objetos: recent });
      return patch;
    },
  }), { code: "aborted" });
  assert.equal(f.writes.length, 0);
  assert.deepEqual(f.current().objetos, recent);
  assert.equal(f.current().userId, "owner");
  assert.equal(f.current().adminDraftRevision, "prior-admin");
});

test("admin write denies unauthenticated, owner, admin claims and mismatched owner before writes or assets", async () => {
  for (const [uid, token, code] of [[null, {}, "unauthenticated"], ["owner", {}, "permission-denied"],
    ["admin", { admin: true }, "permission-denied"], ["fake", { superadmin: true, role: "superadmin" }, "permission-denied"]]) {
    const f = fixture();
    await assert.rejects(f.save(undefined, { uid, token, normalize: () => { throw new Error("asset side effect"); } }), { code });
    assert.equal(f.writes.length, 0);
  }
  await assert.rejects(fixture().save(undefined, { ownerUid: "other", normalize: () => {
    throw new Error("An unverified owner must not reach asset antecedents");
  } }), { code: "permission-denied" });
});

test("protected fields, field paths and invalid content are denied; historical and trashed drafts remain untouched", async () => {
  for (const patch of [{ userId: "superadmin" }, { slugPublico: "changed" }, { publicationLifecycle: {} },
    { adminDraftRevision: "spoof" }, { adminAudit: {} }, { draftCreation: {} }, { persistedDraft: {} }, { "userId.fake": "changed" },
    { "templateInput.userId": "changed" }, { objetos: {} }, { secciones: null }, { nombre: 12 }, {}]) {
    const f = fixture();
    await assert.rejects(f.save(patch, { normalize: () => { throw new Error("asset side effect"); } }), { code: "invalid-argument" });
    assert.equal(f.writes.length, 0);
  }
  for (const overrides of [{ objetos: undefined }, { estadoBorrador: "borrador_papelera" }, { templateWorkspace: {} }]) {
    await assert.rejects(fixture(overrides).save(), { code: "failed-precondition" });
  }
  const removed = fixture(); const revision = adminDraftContentRevision(removed.current()); removed.remove();
  await assert.rejects(removed.save({}, { revision }), { code: "not-found" });
});

test("owner updates before saving and during asset preparation abort without overwriting recent content", async () => {
  const f = fixture(), revision = adminDraftContentRevision(f.current());
  f.mutate({ objetos: [{ texto: "Recent owner change" }] });
  await assert.rejects(f.save(undefined, { revision }), { code: "aborted" });
  assert.equal(f.writes.length, 0);
  const raced = fixture();
  raced.race(() => raced.mutate({ nombre: "Owner raced" }));
  await assert.rejects(raced.save(), { code: "aborted" });
  assert.equal(raced.current().nombre, "Owner raced");
  assert.equal(raced.writes.length, 0);
});

test("thumbnail metadata does not rotate content revision or disturb owner conflict protection", async () => {
  const f = fixture({ adminDraftRevision: "prior", draftContentMeta: { baseAdminRevision: "old" } });
  const revision = adminDraftContentRevision(f.current());
  f.mutate({ thumbnailUrl: "owner-new-thumbnail", ultimaEdicion: 10 });
  const result = await f.save({ thumbnailUrl: "admin-thumbnail", thumbnailUpdatedAt: null }, { revision });
  assert.equal(result.revision, revision);
  assert.equal(result.adminDraftRevision, "prior");
  assert.equal(f.current().adminAudit, undefined);
  assert.equal(f.current().draftContentMeta.baseAdminRevision, "old");
});

test("revision ignores only known metadata timestamps, including all user-defined dynamic values", () => {
  const content = { templateInput: { updatedAt: "one", values: { updatedAt: "User text", appliedAt: "User value" } } };
  const revision = adminDraftContentRevision(content);
  assert.equal(adminDraftContentRevision({ templateInput: { ...content.templateInput, updatedAt: "two" } }), revision);
  assert.notEqual(adminDraftContentRevision({ templateInput: { ...content.templateInput, values: { ...content.templateInput.values, updatedAt: "New text" } } }), revision);
});

test("template input partial fields preserve other dynamic state; timestamps and actor come from server", async () => {
  const f = fixture({ templateInput: { values: { title: "Old" }, defaults: { title: "Base" }, appliedAt: 12 } });
  await f.save({ "templateInput.values": { title: "New" }, "templateInput.updatedAt": "spoof",
    templateAuthoringDraft: { updatedByUid: "forged", updatedAt: "spoof", defaults: {} } });
  assert.deepEqual(f.current().templateInput.defaults, { title: "Base" });
  assert.deepEqual(f.current().templateInput.values, { title: "New" });
  assert.equal(f.current().templateInput.appliedAt, 12);
  assert.notEqual(f.current().templateInput.updatedAt, "spoof");
  assert.equal(f.current().templateAuthoringDraft.updatedByUid, "superadmin");
});

test("owner music writer rejects stale pre-admin clients and accepts owner after reloading revision", async () => {
  const f = fixture({ adminDraftRevision: "recent-admin" });
  const input = request("owner", { draftId: "draft", patch: { music: { version: 1, enabled: false, track: null, volume: 0.35, loop: true }, nombre: "Owner edit" } });
  await assert.rejects(saveDraftWithMusicHandler(input, f.db), { code: "aborted" });
  input.data.expectedAdminRevision = "recent-admin";
  await saveDraftWithMusicHandler(input, f.db);
  assert.equal(f.current().nombre, "Owner edit");
  assert.equal(f.current().userId, "owner");
  assert.equal(f.current().draftContentMeta.baseAdminRevision, "recent-admin");
});

test("administrative saves preserve absent or unchanged future music and validate catalog mutations", async () => {
  const off = { version: 1, enabled: false, track: null, volume: 0.35, loop: true };
  const legacy = fixture();
  await legacy.save({ nombre: "Name", music: off });
  assert.equal(Object.hasOwn(legacy.current(), "music"), false);
  const future = { ...off, enabled: true, track: { source: "user", id: "future-owned-track" }, preservedExtra: "legacy" };
  const f = fixture({ music: future });
  await f.save({ nombre: "Name", music: { ...off, enabled: true, track: future.track } });
  assert.deepEqual(f.current().music, future);
  await assert.rejects(f.save({ music: { ...off, enabled: true, track: { source: "catalog", id: "missing" } } }), { code: "failed-precondition" });
});
