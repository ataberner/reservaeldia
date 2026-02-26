import { httpsCallable } from "firebase/functions";
import { functions as cloudFunctions } from "@/firebase";

const transitionPublicationStateCallable = httpsCallable(
  cloudFunctions,
  "transitionPublishedInvitationState"
);

export async function transitionPublishedInvitationState({
  slug,
  action,
}) {
  const safeSlug = typeof slug === "string" ? slug.trim() : "";
  const safeAction = typeof action === "string" ? action.trim() : "";
  if (!safeSlug) {
    throw new Error("Slug invalido para transicion de estado.");
  }
  if (!safeAction) {
    throw new Error("Accion invalida para transicion de estado.");
  }

  const result = await transitionPublicationStateCallable({
    slug: safeSlug,
    action: safeAction,
  });

  return result?.data || null;
}
