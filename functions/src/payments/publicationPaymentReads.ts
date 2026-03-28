import { HttpsError } from "firebase-functions/v2/https";
import { resolveExistingPublicSlugFlow } from "./publicationSlugReservationFlow";

type UnknownRecord = Record<string, unknown>;

type SnapshotLike = {
  exists: boolean;
  data(): UnknownRecord | undefined;
};

type QueryDocLike = SnapshotLike & {
  id: string;
};

type QuerySnapshotLike = {
  docs: QueryDocLike[];
};

type DocRefLike = {
  get(): Promise<SnapshotLike>;
};

type FirestoreCollectionLike<DocRef> = {
  doc(id: string): DocRef;
};

type FirestoreLike<DocRef> = {
  collection(name: string): FirestoreCollectionLike<DocRef>;
};

export const CHECKOUT_SESSIONS_COLLECTION = "publication_checkout_sessions";
export const SLUG_RESERVATIONS_COLLECTION = "public_slug_reservations";
export const DISCOUNT_CODES_COLLECTION = "publication_discount_codes";
export const DISCOUNT_USAGE_COLLECTION = "publication_discount_code_usage";
export const PUBLICADAS_COLLECTION = "publicadas";
export const PUBLICADAS_HISTORIAL_COLLECTION = "publicadas_historial";
export const BORRADORES_COLLECTION = "borradores";

function getString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function getPublicationRef<DocRef>(
  db: FirestoreLike<DocRef>,
  slug: string
): DocRef {
  return db.collection(PUBLICADAS_COLLECTION).doc(slug);
}

export function getPublicationHistoryRef<DocRef>(
  db: FirestoreLike<DocRef>,
  historyId: string
): DocRef {
  return db.collection(PUBLICADAS_HISTORIAL_COLLECTION).doc(historyId);
}

export function getReservationRef<DocRef>(
  db: FirestoreLike<DocRef>,
  slug: string
): DocRef {
  return db.collection(SLUG_RESERVATIONS_COLLECTION).doc(slug);
}

export function getSessionRef<DocRef>(
  db: FirestoreLike<DocRef>,
  sessionId: string
): DocRef {
  return db.collection(CHECKOUT_SESSIONS_COLLECTION).doc(sessionId);
}

export function getDiscountCodeRef<DocRef>(
  db: FirestoreLike<DocRef>,
  code: string
): DocRef {
  return db.collection(DISCOUNT_CODES_COLLECTION).doc(code);
}

export function getDiscountUsageRef<DocRef>(
  db: FirestoreLike<DocRef>,
  sessionId: string
): DocRef {
  return db.collection(DISCOUNT_USAGE_COLLECTION).doc(sessionId);
}

export function inferDraftSlugFromPublicationData(
  slug: string,
  publicationData: UnknownRecord
): string {
  const preferred =
    getString(publicationData.borradorSlug) ||
    getString(publicationData.borradorId) ||
    getString(publicationData.slugOriginal) ||
    slug;

  return preferred || slug;
}

export function extractDraftSlugCandidatesFromPublicationData(
  publicationData: UnknownRecord
): string[] {
  const candidates = [
    getString(publicationData.borradorSlug),
    getString(publicationData.borradorId),
    getString(publicationData.draftSlug),
    getString(publicationData.slugOriginal),
  ].filter(Boolean);

  return Array.from(new Set(candidates));
}

export async function ensureDraftOwnership<DocRef extends DocRefLike>(params: {
  db: FirestoreLike<DocRef>;
  uid: string;
  draftSlug: string;
}): Promise<{
  ref: DocRef;
  data: UnknownRecord;
}> {
  const draftRef = params.db.collection(BORRADORES_COLLECTION).doc(params.draftSlug);
  const draftSnap = await draftRef.get();

  if (!draftSnap.exists) {
    throw new HttpsError("not-found", "No se encontro el borrador");
  }

  const data = (draftSnap.data() || {}) as UnknownRecord;
  const ownerUid = getString(data.userId);
  if (!ownerUid || ownerUid !== params.uid) {
    throw new HttpsError(
      "permission-denied",
      "No tenes permisos sobre este borrador"
    );
  }

  return {
    ref: draftRef,
    data,
  };
}

export async function resolveExistingPublicSlug(params: {
  draftSlug: string;
  loadDraftData(): Promise<UnknownRecord>;
  loadPublicationBySlug(slug: string): Promise<SnapshotLike>;
  queryPublicationsByOriginalDraftSlug(): Promise<QuerySnapshotLike>;
  queryPublicationsByLinkedDraftSlug(): Promise<QuerySnapshotLike>;
  finalizeExpiredPublication(slug: string): Promise<unknown>;
  isPublicationExpiredData(data: UnknownRecord): boolean;
}): Promise<string | null> {
  return resolveExistingPublicSlugFlow({
    draftSlug: params.draftSlug,
    loadDraftData: params.loadDraftData,
    loadPublicationBySlug: params.loadPublicationBySlug,
    queryPublicationsByOriginalDraftSlug:
      params.queryPublicationsByOriginalDraftSlug,
    queryPublicationsByLinkedDraftSlug:
      params.queryPublicationsByLinkedDraftSlug,
    finalizeExpiredPublication: params.finalizeExpiredPublication,
    isPublicationExpiredData: params.isPublicationExpiredData,
  });
}
