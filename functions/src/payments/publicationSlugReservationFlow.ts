import { HttpsError } from "firebase-functions/v2/https";
import { type PublicSlugAvailabilityReason, normalizePublicSlug } from "../utils/publicSlug";
import {
  PUBLICATION_PUBLIC_STATES,
  resolvePublicationBackendStateFromData,
} from "./publicationLifecycle";

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

type MergeSetRefLike = {
  set(data: UnknownRecord, options: { merge: true }): Promise<unknown>;
};

type ReadableRefLike = MergeSetRefLike & {
  get(): Promise<SnapshotLike>;
};

type TransactionLike = {
  get(ref: unknown): Promise<SnapshotLike>;
  set(ref: unknown, data: UnknownRecord, options: { merge: true }): void;
};

type SlugReservationStatus = "active" | "consumed" | "released" | "expired";

export type SlugAvailabilityResult = {
  isAvailable: boolean;
  reason: PublicSlugAvailabilityReason;
};

function asRecord(value: unknown): UnknownRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as UnknownRecord;
}

function getString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

async function releaseReservationIfExpiredFlow(params: {
  reservationRef: MergeSetRefLike;
  reservationData: UnknownRecord;
  isExpiredAt(value: unknown): boolean;
  createUpdatedAtValue(): unknown;
}): Promise<void> {
  const { reservationRef, reservationData, isExpiredAt, createUpdatedAtValue } = params;
  const status = getString(reservationData.status);
  if (status !== "active") return;
  if (!isExpiredAt(reservationData.expiresAt)) return;

  await reservationRef.set(
    {
      status: "expired",
      updatedAt: createUpdatedAtValue(),
    },
    { merge: true }
  );
}

export async function checkSlugAvailabilityFlow(params: {
  slug: string;
  uid: string;
  draftSlug: string;
  loadPublication(): Promise<SnapshotLike>;
  loadReservation(): Promise<{
    ref: MergeSetRefLike;
    snap: SnapshotLike;
  }>;
  finalizeExpiredPublication(): Promise<unknown>;
  isPublicationExpiredData(data: UnknownRecord): boolean;
  isExpiredAt(value: unknown): boolean;
  createUpdatedAtValue(): unknown;
}): Promise<SlugAvailabilityResult> {
  const publishedSnap = await params.loadPublication();
  if (publishedSnap.exists) {
    const publishedData = asRecord(publishedSnap.data());
    if (params.isPublicationExpiredData(publishedData)) {
      await params.finalizeExpiredPublication();
      return {
        isAvailable: true,
        reason: "ok",
      };
    }

    return {
      isAvailable: false,
      reason: "already-published",
    };
  }

  const reservation = await params.loadReservation();
  if (!reservation.snap.exists) {
    return {
      isAvailable: true,
      reason: "ok",
    };
  }

  const reservationData = asRecord(reservation.snap.data());
  const status = getString(reservationData.status);
  const reservationExpired =
    status === "active" && params.isExpiredAt(reservationData.expiresAt);

  if (reservationExpired) {
    await releaseReservationIfExpiredFlow({
      reservationRef: reservation.ref,
      reservationData,
      isExpiredAt: params.isExpiredAt,
      createUpdatedAtValue: params.createUpdatedAtValue,
    });
    return {
      isAvailable: true,
      reason: "ok",
    };
  }

  if (status !== "active") {
    return {
      isAvailable: true,
      reason: "ok",
    };
  }

  const reservationUid = getString(reservationData.uid);
  const reservationDraftSlug = getString(reservationData.draftSlug);

  if (reservationUid === params.uid && reservationDraftSlug === params.draftSlug) {
    return {
      isAvailable: true,
      reason: "ok",
    };
  }

  return {
    isAvailable: false,
    reason: "temporarily-reserved",
  };
}

export async function reserveSlugForSessionFlow(params: {
  slug: string;
  uid: string;
  draftSlug: string;
  sessionId: string;
  expiresAt: unknown;
  publicationRef: unknown;
  reservationRef: unknown;
  runTransaction<T>(updateFn: (tx: TransactionLike) => Promise<T>): Promise<T>;
  isExpiredAt(value: unknown): boolean;
  createCreatedAtValue(): unknown;
  createUpdatedAtValue(): unknown;
}): Promise<void> {
  const {
    slug,
    uid,
    draftSlug,
    sessionId,
    expiresAt,
    publicationRef,
    reservationRef,
    runTransaction,
    isExpiredAt,
    createCreatedAtValue,
    createUpdatedAtValue,
  } = params;

  await runTransaction(async (tx) => {
    const [publishedSnap, reservationSnap] = await Promise.all([
      tx.get(publicationRef),
      tx.get(reservationRef),
    ]);

    if (publishedSnap.exists) {
      throw new HttpsError("already-exists", "El enlace elegido ya esta publicado.");
    }

    if (reservationSnap.exists) {
      const reservationData = asRecord(reservationSnap.data());
      const status = getString(reservationData.status);
      const reservationUid = getString(reservationData.uid);
      const reservationDraftSlug = getString(reservationData.draftSlug);
      const expired = isExpiredAt(reservationData.expiresAt);

      if (
        status === "active" &&
        !expired &&
        (reservationUid !== uid || reservationDraftSlug !== draftSlug)
      ) {
        throw new HttpsError(
          "already-exists",
          "El enlace elegido esta reservado temporalmente."
        );
      }
    }

    tx.set(
      reservationRef,
      {
        slug,
        uid,
        draftSlug,
        sessionId,
        status: "active",
        expiresAt,
        createdAt: createCreatedAtValue(),
        updatedAt: createUpdatedAtValue(),
      },
      { merge: true }
    );
  });
}

export async function markReservationStatusFlow(params: {
  sessionId: string;
  nextStatus: SlugReservationStatus;
  reservationRef: ReadableRefLike;
  createUpdatedAtValue(): unknown;
}): Promise<void> {
  const reservationSnap = await params.reservationRef.get();
  if (!reservationSnap.exists) return;

  const reservationData = asRecord(reservationSnap.data());
  if (getString(reservationData.sessionId) !== params.sessionId) return;

  await params.reservationRef.set(
    {
      status: params.nextStatus,
      updatedAt: params.createUpdatedAtValue(),
    },
    { merge: true }
  );
}

async function findActiveSlugCandidate(params: {
  candidates: string[];
  loadPublicationBySlug(slug: string): Promise<SnapshotLike>;
  finalizeExpiredPublication(slug: string): Promise<unknown>;
  isPublicationExpiredData(data: UnknownRecord): boolean;
}): Promise<string | null> {
  for (const candidate of params.candidates) {
    const snap = await params.loadPublicationBySlug(candidate);
    if (!snap.exists) continue;

    const data = asRecord(snap.data());
    const state = resolvePublicationBackendStateFromData(data);
    if (state === PUBLICATION_PUBLIC_STATES.TRASH) {
      continue;
    }
    if (params.isPublicationExpiredData(data)) {
      await params.finalizeExpiredPublication(candidate);
      continue;
    }

    return candidate;
  }

  return null;
}

export async function resolveExistingPublicSlugFlow(params: {
  draftSlug: string;
  loadDraftData(): Promise<UnknownRecord>;
  loadPublicationBySlug(slug: string): Promise<SnapshotLike>;
  queryPublicationsByOriginalDraftSlug(): Promise<QuerySnapshotLike>;
  queryPublicationsByLinkedDraftSlug(): Promise<QuerySnapshotLike>;
  finalizeExpiredPublication(slug: string): Promise<unknown>;
  isPublicationExpiredData(data: UnknownRecord): boolean;
}): Promise<string | null> {
  const draftData = asRecord(await params.loadDraftData());
  const fromDraft = normalizePublicSlug(draftData.slugPublico);
  const candidateSlugs = new Set<string>();

  if (fromDraft) candidateSlugs.add(fromDraft);
  if (params.draftSlug) candidateSlugs.add(params.draftSlug);

  const directCandidate = await findActiveSlugCandidate({
    candidates: Array.from(candidateSlugs),
    loadPublicationBySlug: params.loadPublicationBySlug,
    finalizeExpiredPublication: params.finalizeExpiredPublication,
    isPublicationExpiredData: params.isPublicationExpiredData,
  });
  if (directCandidate) {
    return directCandidate;
  }

  const [byOriginalSnap, byDraftSlugSnap] = await Promise.all([
    params.queryPublicationsByOriginalDraftSlug(),
    params.queryPublicationsByLinkedDraftSlug(),
  ]);
  const queryCandidates = [...byOriginalSnap.docs, ...byDraftSlugSnap.docs]
    .map((docItem) => normalizePublicSlug(docItem.id))
    .filter(Boolean) as string[];

  return findActiveSlugCandidate({
    candidates: queryCandidates,
    loadPublicationBySlug: params.loadPublicationBySlug,
    finalizeExpiredPublication: params.finalizeExpiredPublication,
    isPublicationExpiredData: params.isPublicationExpiredData,
  });
}
