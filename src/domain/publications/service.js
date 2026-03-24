import { httpsCallable } from "firebase/functions";
import { functions as cloudFunctions } from "@/firebase";

const transitionPublicationStateCallable = httpsCallable(
  cloudFunctions,
  "transitionPublishedInvitationState"
);
const validateDraftForPublicationCallable = httpsCallable(
  cloudFunctions,
  "validateDraftForPublication"
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

export async function validateDraftForPublication({
  draftSlug,
}) {
  const safeDraftSlug = typeof draftSlug === "string" ? draftSlug.trim() : "";
  if (!safeDraftSlug) {
    throw new Error("Slug invalido para validacion de publicacion.");
  }

  const result = await validateDraftForPublicationCallable({
    draftSlug: safeDraftSlug,
  });

  return result?.data || null;
}
