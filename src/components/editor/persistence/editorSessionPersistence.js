import { doc, getDoc, serverTimestamp, updateDoc } from "firebase/firestore";
import { db } from "../../../firebase.js";
import {
  getTemplateEditorDocument,
  saveTemplateEditorDocument,
} from "../../../domain/templates/adminService.js";
import { createEditorSessionPersistence } from "./editorSessionPersistenceCore.js";

const editorSessionPersistence = createEditorSessionPersistence({
  readDraftDocument: async ({ draftId }) => getDoc(doc(db, "borradores", draftId)),
  writeDraftPatch: async ({ draftId, patch }) =>
    updateDoc(doc(db, "borradores", draftId), patch),
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
