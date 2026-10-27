import { buildDraftMusicCallableRequest } from "../../../domain/music/draftMusicTransport.js";

export const DRAFT_SAVE_ERROR_EVENT = "editor-draft-save-error";

export function draftRevisionConflict() {
  const error = new Error("El borrador cambió en otra sesión. Tus cambios no se guardaron. Recargá la versión actual antes de continuar.");
  error.code = "draft-conflict";
  return error;
}

// Revisions belong to a loaded editor session, not to later metadata reads.
export function createDraftRevisionTransport({ readDraft, transactDraft, call, actorUid, onError, onSaved }) {
  const ownerRevisions = new Map();
  const adminQueues = new WeakMap();
  const keyFor = (id) => `${actorUid() || ""}:${id}`;

  async function readDraftDocument({ draftId, session, resetDraftRevision = false }) {
    if (session?.adminEdit) {
      const result = await call("getAdminDraftSnapshot", {
        slug: draftId, ownerUid: session.adminEdit.ownerUid,
      });
      if (result.status !== "ok") throw new Error("El borrador ya no está disponible.");
      return { exists: true, data: result.draft };
    }
    const snapshot = await readDraft(draftId);
    const key = keyFor(draftId);
    if (snapshot.exists() && (resetDraftRevision || !ownerRevisions.has(key))) {
      ownerRevisions.set(key, snapshot.data().adminDraftRevision || null);
    }
    return snapshot;
  }

  async function writeDraftPatch({ draftId, patch, session }) {
    try {
      if (session?.adminEdit) {
        const context = session.adminEdit;
        const pending = adminQueues.get(context) || Promise.resolve();
        const task = pending.catch(() => {}).then(async () => {
          if (context.closed || actorUid() !== context.actorUid) {
            throw new Error("La sesión de edición administrativa terminó.");
          }
          const { patch: content } = buildDraftMusicCallableRequest(draftId, patch);
          if (Object.prototype.hasOwnProperty.call(content, "thumbnailUpdatedAt")) {
            content.thumbnailUpdatedAt = null; // Backend reconstructs the timestamp.
          }
          const result = await call("saveAdminDraftPatch", {
            slug: draftId,
            ownerUid: context.ownerUid,
            expectedRevision: context.revision,
            patch: content,
          });
          context.revision = result.revision;
          onSaved?.({ draftId });
          return { transport: "callable" };
        });
        adminQueues.set(context, task);
        return await task;
      }

      const key = keyFor(draftId);
      // A writer that never loaded the document must not acknowledge an admin edit.
      const expectedAdminRevision = ownerRevisions.get(key) || null;
      const payload = {
        ...patch,
        draftContentMeta: { ...patch.draftContentMeta, baseAdminRevision: expectedAdminRevision },
      };
      if (Object.prototype.hasOwnProperty.call(patch, "music")) {
        await call("saveDraftWithMusicV1", {
          ...buildDraftMusicCallableRequest(draftId, payload),
          expectedAdminRevision,
        });
        onSaved?.({ draftId });
        return { transport: "callable" };
      }
      await transactDraft(draftId, (data) => {
        if ((data.adminDraftRevision || null) !== expectedAdminRevision) {
          throw draftRevisionConflict();
        }
        return {
          ...payload,
          draftContentMeta: { ...data.draftContentMeta, ...payload.draftContentMeta },
        };
      });
      onSaved?.({ draftId });
      return { transport: "firestore" };
    } catch (error) {
      onError?.({ draftId, error });
      throw error;
    }
  }
  return { readDraftDocument, writeDraftPatch };
}
