import { HttpsError, type CallableRequest } from "firebase-functions/v2/https";
import { requireAuth, requireSuperAdmin } from "../auth/adminAuth";
import { requireDraftPathSegment } from "./templateDraftCreation";

/** Owner is selected explicitly; authentication always remains the real actor. */
export async function resolveTemplateDraftCreationIdentity(
  request: CallableRequest<{ ownerUid?: unknown }>,
  getUser: (uid: string) => Promise<unknown>
): Promise<{ actorUid: string; ownerUid: string; administrative: boolean }> {
  const actorUid = requireAuth(request);
  if (!Object.prototype.hasOwnProperty.call(request.data || {}, "ownerUid")) {
    return { actorUid, ownerUid: actorUid, administrative: false };
  }
  requireSuperAdmin(request);
  const ownerUid = requireDraftPathSegment(request.data.ownerUid, "ownerUid");
  if (ownerUid.length > 128) throw new HttpsError("invalid-argument", "ownerUid invalido");
  try {
    await getUser(ownerUid);
  } catch (error) {
    if ((error as { code?: unknown }).code === "auth/user-not-found") {
      throw new HttpsError("not-found", "El usuario seleccionado no existe.");
    }
    throw error;
  }
  return { actorUid, ownerUid, administrative: true };
}
