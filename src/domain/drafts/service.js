import { httpsCallable } from "firebase/functions";
import { functions as cloudFunctions } from "@/firebase";

const moveDraftToTrashCallable = httpsCallable(cloudFunctions, "moveDraftToTrash");
const restoreDraftFromTrashCallable = httpsCallable(
  cloudFunctions,
  "restoreDraftFromTrash"
);

function normalizeSlug(slug) {
  return typeof slug === "string" ? slug.trim() : "";
}

export async function moveDraftToTrash({ slug }) {
  const safeSlug = normalizeSlug(slug);
  if (!safeSlug) {
    throw new Error("Slug invalido para mover borrador a papelera.");
  }

  const result = await moveDraftToTrashCallable({ slug: safeSlug });
  return result?.data || null;
}

export async function restoreDraftFromTrash({ slug }) {
  const safeSlug = normalizeSlug(slug);
  if (!safeSlug) {
    throw new Error("Slug invalido para restaurar borrador.");
  }

  const result = await restoreDraftFromTrashCallable({ slug: safeSlug });
  return result?.data || null;
}

