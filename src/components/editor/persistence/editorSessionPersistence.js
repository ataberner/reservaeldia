import { doc, getDoc, serverTimestamp, updateDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "../../../firebase.js";
import { buildDraftMusicCallableRequest } from "../../../domain/music/draftMusicTransport.js";
import {
  getTemplateEditorDocument,
  saveTemplateEditorDocument,
} from "../../../domain/templates/adminService.js";
import { createEditorSessionPersistence } from "./editorSessionPersistenceCore.js";

const editorSessionPersistence = createEditorSessionPersistence({
  readDraftDocument: async ({ draftId }) => getDoc(doc(db, "borradores", draftId)),
  writeDraftPatch: async ({ draftId, patch }) => {
    if (Object.prototype.hasOwnProperty.call(patch, "music")) {
      await httpsCallable(functions, "saveDraftWithMusicV1")(
        buildDraftMusicCallableRequest(draftId, patch)
      );
      return { transport: "callable" };
    }
    await updateDoc(doc(db, "borradores", draftId), patch);
  },
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
