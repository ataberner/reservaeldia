// Availability is a rollout decision; canManageSite is the existing authorization authority.
import { MUSIC_FEATURE_AVAILABILITY } from "../../../shared/musicConfig.js";

export function canAccessMusic({
  available = MUSIC_FEATURE_AVAILABILITY.editor,
  canManageSite = false,
  editorReadOnly = false,
} = {}) {
  return available === true && canManageSite === true && editorReadOnly !== true;
}
