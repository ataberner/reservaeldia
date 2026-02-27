import { httpsCallable } from "firebase/functions";
import { functions } from "@/firebase";

const saveDraftCallable = httpsCallable(functions, "saveCountdownPresetDraft");
const publishDraftCallable = httpsCallable(functions, "publishCountdownPresetDraft");
const archivePresetCallable = httpsCallable(functions, "archiveCountdownPreset");
const deletePresetCallable = httpsCallable(functions, "deleteCountdownPreset");
const listAdminCallable = httpsCallable(functions, "listCountdownPresetsAdmin");
const listPublicCallable = httpsCallable(functions, "listCountdownPresetsPublic");
const syncLegacyCallable = httpsCallable(functions, "syncLegacyCountdownPresets");

function unwrapCallableResult(result) {
  return result?.data || {};
}

export async function saveCountdownPresetDraft(payload) {
  const result = await saveDraftCallable(payload || {});
  return unwrapCallableResult(result);
}

export async function publishCountdownPresetDraft(payload) {
  const result = await publishDraftCallable(payload || {});
  return unwrapCallableResult(result);
}

export async function archiveCountdownPreset(payload) {
  const result = await archivePresetCallable(payload || {});
  return unwrapCallableResult(result);
}

export async function deleteCountdownPreset(payload) {
  const result = await deletePresetCallable(payload || {});
  return unwrapCallableResult(result);
}

export async function listCountdownPresetsAdmin() {
  const result = await listAdminCallable({});
  return unwrapCallableResult(result);
}

export async function listCountdownPresetsPublic() {
  const result = await listPublicCallable({});
  return unwrapCallableResult(result);
}

export async function syncLegacyCountdownPresets(payload) {
  const result = await syncLegacyCallable(payload || {});
  return unwrapCallableResult(result);
}
