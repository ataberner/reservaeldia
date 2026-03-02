import { httpsCallable } from "firebase/functions";
import { functions } from "@/firebase";

const listAdminCallable = httpsCallable(functions, "adminListTextPresetsV1");
const upsertCallable = httpsCallable(functions, "adminUpsertTextPresetV1");
const duplicateCallable = httpsCallable(functions, "adminDuplicateTextPresetV1");
const setActivationCallable = httpsCallable(functions, "adminSetTextPresetActivationV1");
const setVisibilityCallable = httpsCallable(functions, "adminSetTextPresetVisibilityV1");
const deleteCallable = httpsCallable(functions, "adminDeleteTextPresetV1");
const syncLegacyCallable = httpsCallable(functions, "adminSyncLegacyTextPresetsV1");
const listPublicCallable = httpsCallable(functions, "listTextPresetsPublicV1");

function unwrap(result) {
  return result?.data || {};
}

export async function listTextPresetsAdmin() {
  const result = await listAdminCallable({});
  return unwrap(result);
}

export async function upsertTextPreset(payload) {
  const result = await upsertCallable(payload || {});
  return unwrap(result);
}

export async function duplicateTextPreset(payload) {
  const result = await duplicateCallable(payload || {});
  return unwrap(result);
}

export async function setTextPresetActivation(payload) {
  const result = await setActivationCallable(payload || {});
  return unwrap(result);
}

export async function setTextPresetVisibility(payload) {
  const result = await setVisibilityCallable(payload || {});
  return unwrap(result);
}

export async function deleteTextPreset(payload) {
  const result = await deleteCallable(payload || {});
  return unwrap(result);
}

export async function syncLegacyTextPresets(payload) {
  const result = await syncLegacyCallable(payload || {});
  return unwrap(result);
}

export async function listTextPresetsPublic(payload) {
  const result = await listPublicCallable(payload || {});
  return unwrap(result);
}
