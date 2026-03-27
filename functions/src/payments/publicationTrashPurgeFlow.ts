import {
  PUBLICATION_PUBLIC_STATES,
  resolvePublicationLifecycleSnapshotFromData,
} from "./publicationLifecycle";
import { planTrashedPublicationPurgeOperations } from "./publicationOperationPlanning";
import { executePlannedTrashedPublicationPurge } from "./publicationOperationExecution";

type UnknownRecord = Record<string, unknown>;

type LinkedDraftDocLike = {
  id: string;
};

type LinkedDraftQueryLike = {
  docs: LinkedDraftDocLike[];
};

type PublicationSnapshotLike = {
  createTime?: unknown;
  ref: unknown;
  data(): UnknownRecord | undefined;
};

function asRecord(value: unknown): UnknownRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as UnknownRecord;
}

function getString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function isPublicationDueForTrashPurgeFlow(params: {
  publicationData: UnknownRecord;
  publicationSnap: PublicationSnapshotLike;
  now: Date;
}): boolean {
  const { publicationData, publicationSnap, now } = params;
  const snapshot = resolvePublicationLifecycleSnapshotFromData(publicationData, {
    now,
    fallbackPublishedAt: publicationSnap.createTime ?? now,
  });
  if (snapshot.backendState !== PUBLICATION_PUBLIC_STATES.TRASH) return false;

  const purgeAt = snapshot.trashPurgeAt;
  if (!(purgeAt instanceof Date)) return false;

  return purgeAt.getTime() <= now.getTime();
}

export async function purgeTrashedPublicationFlow(params: {
  slug: string;
  publicationSnap: PublicationSnapshotLike;
  extractInitialDraftSlugs(publicationData: UnknownRecord): Iterable<string>;
  queryLinkedDraftsByPublicSlug(slug: string): Promise<LinkedDraftQueryLike>;
  resetDraftLinks(request: { draftSlug: string }): Promise<boolean>;
  deleteStoragePrefix(prefix: string): Promise<unknown>;
  recursiveDelete(ref: unknown): Promise<unknown>;
  deleteReservation(slug: string): Promise<void>;
  warn(message: string, context: Record<string, unknown>): void;
}): Promise<void> {
  const { slug, publicationSnap } = params;
  const publicationData = asRecord(publicationSnap.data());
  const draftCandidates = new Set<string>();

  for (const candidate of params.extractInitialDraftSlugs(publicationData)) {
    const normalized = getString(candidate);
    if (normalized) {
      draftCandidates.add(normalized);
    }
  }

  const linkedDraftsSnap = await params.queryLinkedDraftsByPublicSlug(slug);
  for (const draftDoc of linkedDraftsSnap.docs) {
    const draftSlug = getString(draftDoc.id);
    if (draftSlug) {
      draftCandidates.add(draftSlug);
    }
  }

  const plannedPurge = planTrashedPublicationPurgeOperations({
    slug,
    draftSlugs: draftCandidates,
  });

  await executePlannedTrashedPublicationPurge({
    plan: plannedPurge,
    publicationRef: publicationSnap.ref,
    deleteStoragePrefix: params.deleteStoragePrefix,
    recursiveDelete: params.recursiveDelete,
    resetDraftLinks: params.resetDraftLinks,
    deleteReservation: params.deleteReservation,
    warn: params.warn,
  });
}
