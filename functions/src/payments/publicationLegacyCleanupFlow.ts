import { HttpsError } from "firebase-functions/v2/https";

import {
  planLegacyPublicationCleanupOperations,
  type PlannedLegacyPublicationCleanupOperations,
} from "./publicationOperationPlanning";

type UnknownRecord = Record<string, unknown>;

type PublicationSnapshotLike = {
  exists: boolean;
  data(): UnknownRecord | undefined;
};

type HistoryDocLike = {
  data(): UnknownRecord | undefined;
};

type LinkedDraftQueryLike = {
  docs: Array<{
    id: string;
  }>;
};

function asRecord(value: unknown): UnknownRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as UnknownRecord;
}

function getString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export async function prepareLegacyPublicationCleanupFlow<
  THistoryDoc extends HistoryDocLike,
>(params: {
  slug: string;
  uid: string;
  publicationSnap: PublicationSnapshotLike;
  extractDraftSlugsFromPublicationData(publicationData: UnknownRecord): Iterable<string>;
  loadHistoryDocsForSlug(uid: string, slug: string): Promise<THistoryDoc[]>;
  queryLinkedDraftsByPublicSlug(
    uid: string,
    slug: string
  ): Promise<LinkedDraftQueryLike>;
}): Promise<{
  plan: PlannedLegacyPublicationCleanupOperations;
  historyDocs: THistoryDoc[];
}> {
  const { slug, uid, publicationSnap } = params;
  const publicationData = publicationSnap.exists
    ? asRecord(publicationSnap.data())
    : null;

  const draftCandidates = new Set<string>();
  let hasOwnership = false;

  if (publicationData) {
    const publicationOwnerUid = getString(publicationData.userId);
    if (!publicationOwnerUid || publicationOwnerUid !== uid) {
      throw new HttpsError(
        "permission-denied",
        "No tienes permisos sobre esta publicacion."
      );
    }

    hasOwnership = true;
    for (const candidate of params.extractDraftSlugsFromPublicationData(publicationData)) {
      const normalizedCandidate = getString(candidate);
      if (normalizedCandidate) {
        draftCandidates.add(normalizedCandidate);
      }
    }
  }

  const historyDocs = await params.loadHistoryDocsForSlug(uid, slug);
  if (historyDocs.length > 0) {
    hasOwnership = true;
    for (const historyDoc of historyDocs) {
      const historyData = asRecord(historyDoc.data());
      for (const candidate of params.extractDraftSlugsFromPublicationData(historyData)) {
        const normalizedCandidate = getString(candidate);
        if (normalizedCandidate) {
          draftCandidates.add(normalizedCandidate);
        }
      }
    }
  }

  const linkedDraftsSnap = await params.queryLinkedDraftsByPublicSlug(uid, slug);
  if (linkedDraftsSnap.docs.length > 0) {
    hasOwnership = true;
    for (const draftDoc of linkedDraftsSnap.docs) {
      const draftSlug = getString(draftDoc.id);
      if (draftSlug) {
        draftCandidates.add(draftSlug);
      }
    }
  }

  if (!hasOwnership) {
    throw new HttpsError(
      "not-found",
      "No se encontro una publicacion legacy para eliminar."
    );
  }

  return {
    plan: planLegacyPublicationCleanupOperations({
      slug,
      uid,
      draftSlugs: draftCandidates,
      shouldDeleteActivePublication: publicationSnap.exists,
    }),
    historyDocs,
  };
}
