// Availability is independent of administrative and music-only pilot access.
import { MUSIC_FEATURE_AVAILABILITY } from "../../../shared/musicConfig.js";
import { isMusicPilotUser } from "../../../shared/musicAccess.js";

export function canAccessMusic({
  available = MUSIC_FEATURE_AVAILABILITY.editor,
  canManageSite = false,
  editorReadOnly = false,
  userUid = "",
  userEmail = "",
  userEmailVerified = false,
  editorSession = null,
} = {}) {
  const pilotAccess = editorSession?.kind === "draft" && isMusicPilotUser({
    uid: userUid, email: userEmail, emailVerified: userEmailVerified,
  });
  return available === true && editorReadOnly !== true &&
    (canManageSite === true || pilotAccess);
}
