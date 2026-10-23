import { HttpsError } from "firebase-functions/v2/https";
import type { CallableRequest } from "firebase-functions/v2/https";
import type { Firestore } from "firebase-admin/firestore";
import { requireAuth } from "../auth/adminAuth";
import { assertExternalEffectAllowed } from "../firebaseAdmin";
import { parsePublicGiftMetadataUrl } from "./linkMetadataFetch";
import { resolveGiftLinkMetadata } from "./linkMetadata";
import type { GiftLinkMetadata } from "./linkMetadata";
import { createGiftMetadataUsageStore } from "./linkMetadataUsage";

type Dependencies = {
  consume: (uid: string) => Promise<void>;
  resolve?: (url: string) => Promise<GiftLinkMetadata>;
  assertExternalAllowed?: () => void;
};

export async function getGiftLinkMetadataWithDependencies(request: CallableRequest<unknown>, dependencies: Dependencies): Promise<GiftLinkMetadata> {
  const uid = requireAuth(request);
  // The callable SDK enforces App Check too; keep the handler boundary explicit
  // so alternate callers cannot bypass admission when reusing this function.
  if (!request.app) throw new HttpsError("failed-precondition", "No pudimos verificar esta sesión. Volvé a cargar la página.");
  const input = request.data;
  if (!input || typeof input !== "object" || Array.isArray(input) ||
      Object.keys(input).some((key) => key !== "url")) throw new HttpsError("invalid-argument", "El enlace no es válido.");
  let url: URL;
  try { url = parsePublicGiftMetadataUrl((input as Record<string, unknown>).url); }
  catch { throw new HttpsError("invalid-argument", "Ingresá un enlace público de una tienda o producto."); }
  await dependencies.consume(uid);
  (dependencies.assertExternalAllowed || (() => assertExternalEffectAllowed("gift-link-metadata")))();
  return (dependencies.resolve || resolveGiftLinkMetadata)(url.href);
}

export function getGiftLinkMetadataHandler(request: CallableRequest<unknown>, db: Pick<Firestore, "doc" | "runTransaction">): Promise<GiftLinkMetadata> {
  return getGiftLinkMetadataWithDependencies(request, { consume: createGiftMetadataUsageStore(db).consume });
}
