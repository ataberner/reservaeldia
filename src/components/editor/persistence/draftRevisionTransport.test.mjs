import test from "node:test";
import assert from "node:assert/strict";
import { createDraftRevisionTransport } from "./draftRevisionTransport.js";
import { normalizeEditorSession } from "../../../domain/drafts/session.js";

function fixture(initial = {}) {
  let data = { userId: "owner", objetos: [], ...initial };
  let uid = "owner";
  const calls = [], errors = [], writes = [];
  const api = createDraftRevisionTransport({
    actorUid: () => uid,
    readDraft: async () => ({ exists: () => true, data: () => structuredClone(data) }),
    transactDraft: async (_id, buildPatch) => {
      const patch = buildPatch(data);
      writes.push(patch);
      data = { ...data, ...patch };
    },
    call: async (name, payload) => {
      calls.push({ name, payload });
      if (name === "getAdminDraftSnapshot") return { status: "ok", draft: data };
      if (name === "saveAdminDraftPatch") return { revision: `revision-${calls.length}` };
      return {};
    },
    onError: (entry) => errors.push(entry),
  });
  return { api, calls, errors, writes, data: () => data, set: (patch) => { data = { ...data, ...patch }; }, actor: (value) => { uid = value; } };
}

test("ordinary owner saves preserve ownership and acknowledge only the loaded admin revision", async () => {
  const f = fixture({ adminDraftRevision: "admin-1", adminAudit: { createdBy: "staff" } });
  await f.api.readDraftDocument({ draftId: "one", resetDraftRevision: true });
  await f.api.writeDraftPatch({ draftId: "one", patch: { objetos: [{ id: "a" }] } });
  assert.equal(f.data().userId, "owner");
  assert.equal(f.data().adminDraftRevision, "admin-1");
  assert.equal(f.data().draftContentMeta.baseAdminRevision, "admin-1");
  assert.deepEqual(f.data().adminAudit, { createdBy: "staff" });
});

test("an intervening administrator edit rejects stale owner saves without overwriting either content or owner", async () => {
  const f = fixture();
  await f.api.readDraftDocument({ draftId: "one", resetDraftRevision: true });
  f.set({ adminDraftRevision: "admin-1", objetos: [{ id: "admin" }] });
  await assert.rejects(f.api.writeDraftPatch({ draftId: "one", patch: { objetos: [{ id: "stale" }] } }), { code: "draft-conflict" });
  assert.deepEqual(f.data().objetos, [{ id: "admin" }]);
  assert.equal(f.writes.length, 0);
  assert.equal(f.errors.length, 1);
});

test("metadata rereads cannot advance a stale session; a deliberate reload can", async () => {
  const f = fixture();
  await f.api.readDraftDocument({ draftId: "one", resetDraftRevision: true });
  f.set({ adminDraftRevision: "admin-1" });
  await f.api.readDraftDocument({ draftId: "one" });
  await assert.rejects(f.api.writeDraftPatch({ draftId: "one", patch: { nombre: "stale" } }), { code: "draft-conflict" });
  await f.api.readDraftDocument({ draftId: "one", resetDraftRevision: true });
  await f.api.writeDraftPatch({ draftId: "one", patch: { nombre: "fresh" } });
  assert.equal(f.data().nombre, "fresh");
});

test("owner music writes carry the loaded revision to backend atomic validation", async () => {
  const f = fixture({ adminDraftRevision: "music-revision" });
  await f.api.readDraftDocument({ draftId: "one" });
  await f.api.writeDraftPatch({ draftId: "one", patch: { music: { enabled: false } } });
  assert.equal(f.calls[0].name, "saveDraftWithMusicV1");
  assert.equal(f.calls[0].payload.expectedAdminRevision, "music-revision");
  assert.equal(f.writes.length, 0);
});

test("administrative writes serialize and advance only their transport revision", async () => {
  const f = fixture();
  f.actor("staff");
  const context = { ownerUid: "owner", actorUid: "staff", revision: "initial" };
  const session = normalizeEditorSession({ kind: "draft", id: "one", adminEdit: context });
  await Promise.all([
    f.api.writeDraftPatch({ draftId: "one", session, patch: { nombre: "first", ultimaEdicion: "sentinel" } }),
    f.api.writeDraftPatch({ draftId: "one", session, patch: { nombre: "second" } }),
  ]);
  assert.equal(f.calls[0].payload.expectedRevision, "initial");
  assert.equal(f.calls[1].payload.expectedRevision, "revision-1");
  assert.equal(f.calls[1].payload.ownerUid, "owner");
  assert.equal(context.revision, "revision-2");
  assert.equal("ultimaEdicion" in f.calls[0].payload.patch, false);
  assert.equal(f.writes.length, 0);
});

test("closed or changed-account administrative sessions cannot write", async () => {
  const f = fixture();
  const session = { adminEdit: { ownerUid: "owner", actorUid: "staff", revision: "r" } };
  await assert.rejects(f.api.writeDraftPatch({ draftId: "one", session, patch: { nombre: "blocked" } }));
  f.actor("staff");
  session.adminEdit.closed = true;
  await assert.rejects(f.api.writeDraftPatch({ draftId: "one", session, patch: { nombre: "blocked" } }));
  assert.equal(f.calls.length, 0);
});

test("administrative metadata reads use the authorized snapshot without changing its write baseline", async () => {
  const f = fixture();
  const session = { adminEdit: { ownerUid: "owner", revision: "r" } };
  const read = await f.api.readDraftDocument({ draftId: "one", session });
  assert.equal(read.exists, true);
  assert.equal(f.calls[0].name, "getAdminDraftSnapshot");
  assert.equal(session.adminEdit.revision, "r");
});

test("administrative thumbnails use the same authorized writer and server timestamp reconstruction", async () => {
  const f = fixture();
  f.actor("staff");
  const session = { adminEdit: { ownerUid: "owner", actorUid: "staff", revision: "r" } };
  await f.api.writeDraftPatch({ draftId: "one", session, patch: {
    thumbnailUrl: "https://example.test/image.webp", thumbnailUpdatedAt: { transform: "server-timestamp" },
  } });
  assert.equal(f.calls[0].name, "saveAdminDraftPatch");
  assert.equal(f.calls[0].payload.patch.thumbnailUpdatedAt, null);
  assert.equal(f.writes.length, 0);
});
