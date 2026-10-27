import { doc, getDoc, runTransaction, serverTimestamp } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { auth, db, functions } from "../../../firebase.js";
import { createDraftRevisionTransport, DRAFT_SAVE_ERROR_EVENT } from "./draftRevisionTransport.js";
import {
  getTemplateEditorDocument,
  saveTemplateEditorDocument,
} from "../../../domain/templates/adminService.js";
import { createEditorSessionPersistence } from "./editorSessionPersistenceCore.js";

const draftTransport = createDraftRevisionTransport({
  actorUid: () => auth.currentUser?.uid,
  readDraft: (draftId) => getDoc(doc(db, "borradores", draftId)),
  call: async (name, payload) => (await httpsCallable(functions, name)(payload)).data,
  transactDraft: (draftId, buildPatch) => runTransaction(db, async (transaction) => {
    const reference = doc(db, "borradores", draftId);
    const snapshot = await transaction.get(reference);
    if (!snapshot.exists()) throw new Error("El borrador ya no existe.");
    transaction.update(reference, buildPatch(snapshot.data()));
  }),
  onError: ({ draftId, error }) => {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent(DRAFT_SAVE_ERROR_EVENT, {
        detail: { draftId, message: error.message, code: error.code },
      }));
    }
  },
  onSaved: ({ draftId }) => {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent(DRAFT_SAVE_ERROR_EVENT, {
        detail: { draftId, saved: true },
      }));
    }
  },
});

const editorSessionPersistence = createEditorSessionPersistence({
  ...draftTransport,
  readTemplateEditorDocument: getTemplateEditorDocument,
  writeTemplateDocument: saveTemplateEditorDocument,
  createTimestamp: () => serverTimestamp(),
});

export const readEditorSessionDocument =
  editorSessionPersistence.readEditorSessionDocument;
export const persistEditorSessionPatch =
  editorSessionPersistence.persistEditorSessionPatch;
export const persistEditorSessionSnapshot =
  editorSessionPersistence.persistEditorSessionSnapshot;
