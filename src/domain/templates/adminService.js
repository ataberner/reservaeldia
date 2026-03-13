import { httpsCallable } from "firebase/functions";
import { functions } from "@/firebase";

const listTemplatesCallable = httpsCallable(functions, "adminListTemplatesV1");
const listTemplateTrashCallable = httpsCallable(functions, "adminListTemplateTrashV1");
const listTagsCallable = httpsCallable(functions, "adminListTemplateTagsV1");
const upsertTagCallable = httpsCallable(functions, "adminUpsertTemplateTagV1");
const upsertEditorialCallable = httpsCallable(functions, "adminUpsertTemplateEditorialV1");
const moveTemplateToTrashCallable = httpsCallable(
  functions,
  "adminMoveTemplateToTrashV1"
);
const restoreTemplateFromTrashCallable = httpsCallable(
  functions,
  "adminRestoreTemplateFromTrashV1"
);
const hardDeleteTemplateFromTrashCallable = httpsCallable(
  functions,
  "adminHardDeleteTemplateFromTrashV1"
);
const getTemplateEditorDocumentCallable = httpsCallable(
  functions,
  "adminGetTemplateEditorDocumentV1"
);
const saveTemplateEditorDocumentCallable = httpsCallable(
  functions,
  "adminSaveTemplateEditorDocumentV1"
);
const convertDraftToTemplateCallable = httpsCallable(
  functions,
  "adminConvertDraftToTemplateV1"
);
const openWorkspaceCallable = httpsCallable(functions, "adminOpenTemplateWorkspaceV1");
const commitWorkspaceCallable = httpsCallable(functions, "adminCommitTemplateWorkspaceV1");
const createFromDraftCallable = httpsCallable(functions, "adminCreateTemplateFromDraftV1");

function unwrap(result) {
  return result?.data || {};
}

export async function listTemplatesAdmin(payload) {
  return unwrap(await listTemplatesCallable(payload || {}));
}

export async function listTemplateTrashAdmin(payload) {
  return unwrap(await listTemplateTrashCallable(payload || {}));
}

export async function listTemplateTagsAdmin(payload) {
  return unwrap(await listTagsCallable(payload || {}));
}

export async function upsertTemplateTag(payload) {
  return unwrap(await upsertTagCallable(payload || {}));
}

export async function upsertTemplateEditorial(payload) {
  return unwrap(await upsertEditorialCallable(payload || {}));
}

export async function moveTemplateToTrash(payload) {
  return unwrap(await moveTemplateToTrashCallable(payload || {}));
}

export async function restoreTemplateFromTrash(payload) {
  return unwrap(await restoreTemplateFromTrashCallable(payload || {}));
}

export async function hardDeleteTemplateFromTrash(payload) {
  return unwrap(await hardDeleteTemplateFromTrashCallable(payload || {}));
}

export async function getTemplateEditorDocument(payload) {
  return unwrap(await getTemplateEditorDocumentCallable(payload || {}));
}

export async function saveTemplateEditorDocument(payload) {
  return unwrap(await saveTemplateEditorDocumentCallable(payload || {}));
}

export async function convertDraftToTemplate(payload) {
  return unwrap(await convertDraftToTemplateCallable(payload || {}));
}

export async function openTemplateWorkspace(payload) {
  return unwrap(await openWorkspaceCallable(payload || {}));
}

export async function commitTemplateWorkspace(payload) {
  return unwrap(await commitWorkspaceCallable(payload || {}));
}

export async function createTemplateFromDraft(payload) {
  return unwrap(await createFromDraftCallable(payload || {}));
}
