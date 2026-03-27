import type {
  PlannedPublicationFinalizationOperations,
  PlannedLegacyPublicationCleanupOperations,
  PlannedPublicationPublishOperations,
  PlannedPublicationTransitionOperations,
  PlannedTrashedPublicationPurgeOperations,
} from "./publicationOperationPlanning";

type MergeSetRef = {
  set(data: Record<string, unknown>, options: { merge: true }): Promise<unknown>;
};

type ExistingDocRef = MergeSetRef & {
  get(): Promise<{ exists: boolean }>;
};

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error || "");
}

async function deleteStoragePrefixWithWarning(params: {
  plan: PlannedPublicationFinalizationOperations;
  deleteStoragePrefix(prefix: string): Promise<unknown>;
  warn(message: string, context: Record<string, unknown>): void;
}): Promise<void> {
  const { plan, deleteStoragePrefix, warn } = params;

  try {
    await deleteStoragePrefix(plan.storagePrefix);
  } catch (error) {
    warn("No se pudieron borrar archivos publicados durante finalizacion", {
      slug: plan.result.slug,
      reason: plan.logContext.reason,
      error: getErrorMessage(error),
    });
  }
}

async function recursiveDeleteWithWarning(params: {
  plan: PlannedPublicationFinalizationOperations;
  publicationRef: unknown;
  recursiveDelete(ref: unknown): Promise<unknown>;
  warn(message: string, context: Record<string, unknown>): void;
}): Promise<void> {
  const { plan, publicationRef, recursiveDelete, warn } = params;

  try {
    await recursiveDelete(publicationRef);
  } catch (error) {
    warn("No se pudo eliminar la publicacion activa durante finalizacion", {
      slug: plan.result.slug,
      reason: plan.logContext.reason,
      error: getErrorMessage(error),
    });
  }
}

export async function executePlannedPublicationFinalization(params: {
  plan: PlannedPublicationFinalizationOperations;
  historyRef: MergeSetRef;
  publicationRef: unknown;
  draftRef?: MergeSetRef | null;
  reservationRef: MergeSetRef;
  deleteStoragePrefix(prefix: string): Promise<unknown>;
  recursiveDelete(ref: unknown): Promise<unknown>;
  warn(message: string, context: Record<string, unknown>): void;
}): Promise<void> {
  const {
    plan,
    historyRef,
    publicationRef,
    draftRef,
    reservationRef,
    deleteStoragePrefix,
    recursiveDelete,
    warn,
  } = params;

  await historyRef.set(plan.historyWrite, { merge: true });
  await deleteStoragePrefixWithWarning({ plan, deleteStoragePrefix, warn });
  await recursiveDeleteWithWarning({ plan, publicationRef, recursiveDelete, warn });
  await reservationRef.set(plan.reservationReleaseWrite, { merge: true });

  if (draftRef && plan.draftFinalizeWrite) {
    await draftRef.set(plan.draftFinalizeWrite, { merge: true });
  }
}

export async function executePlannedPublicationWrites(params: {
  publicationRef: MergeSetRef;
  publicationWrite: Record<string, unknown>;
  draftRef: MergeSetRef;
  draftWrite: PlannedPublicationPublishOperations["linkedDraftWrite"];
}): Promise<void> {
  const { publicationRef, publicationWrite, draftRef, draftWrite } = params;

  await publicationRef.set(publicationWrite, { merge: true });
  await draftRef.set(draftWrite, { merge: true });
}

export async function executePlannedDraftWriteIfExists(params: {
  draftRef: ExistingDocRef;
  draftWrite: PlannedPublicationTransitionOperations["draftWrite"];
}): Promise<boolean> {
  const { draftRef, draftWrite } = params;
  if (!draftWrite) return false;

  const draftSnap = await draftRef.get();
  if (!draftSnap.exists) return false;

  await draftRef.set(draftWrite, { merge: true });
  return true;
}

export async function executeApprovedSessionOutcomeEffects(params: {
  sessionRef: MergeSetRef;
  sessionWrite: Record<string, unknown>;
  reservationUpdate?: {
    slug: string;
    sessionId: string;
    nextStatus: "consumed" | "released";
  } | null;
  updateReservationStatus?(update: {
    slug: string;
    sessionId: string;
    nextStatus: "consumed" | "released";
  }): Promise<void>;
}): Promise<void> {
  const { sessionRef, sessionWrite, reservationUpdate, updateReservationStatus } = params;

  await sessionRef.set(sessionWrite, { merge: true });

  if (reservationUpdate && updateReservationStatus) {
    await updateReservationStatus(reservationUpdate);
  }
}

async function deleteStoragePrefixWithCustomWarning(params: {
  storagePrefix: string;
  deleteStoragePrefix(prefix: string): Promise<unknown>;
  warn(message: string, context: Record<string, unknown>): void;
  warningMessage: string;
  warningContext: Record<string, unknown>;
}): Promise<boolean> {
  const { storagePrefix, deleteStoragePrefix, warn, warningMessage, warningContext } = params;

  try {
    await deleteStoragePrefix(storagePrefix);
    return true;
  } catch (error) {
    warn(warningMessage, {
      ...warningContext,
      error: getErrorMessage(error),
    });
    return false;
  }
}

export async function executePlannedTrashedPublicationPurge(params: {
  plan: PlannedTrashedPublicationPurgeOperations;
  publicationRef: unknown;
  deleteStoragePrefix(prefix: string): Promise<unknown>;
  recursiveDelete(ref: unknown): Promise<unknown>;
  resetDraftLinks(
    request: PlannedTrashedPublicationPurgeOperations["draftResetRequests"][number]
  ): Promise<boolean>;
  deleteReservation(slug: string): Promise<void>;
  warn(message: string, context: Record<string, unknown>): void;
}): Promise<void> {
  const {
    plan,
    publicationRef,
    deleteStoragePrefix,
    recursiveDelete,
    resetDraftLinks,
    deleteReservation,
    warn,
  } = params;

  await deleteStoragePrefixWithCustomWarning({
    storagePrefix: plan.storagePrefix,
    deleteStoragePrefix,
    warn,
    warningMessage: "No se pudieron borrar archivos publicados durante purga de papelera",
    warningContext: {
      slug: plan.slug,
    },
  });

  await recursiveDelete(publicationRef);

  for (const draftResetRequest of plan.draftResetRequests) {
    await resetDraftLinks(draftResetRequest);
  }

  try {
    await deleteReservation(plan.slug);
  } catch (error) {
    warn("No se pudo borrar reserva de slug durante purga de papelera", {
      slug: plan.slug,
      error: getErrorMessage(error),
    });
  }
}

export async function executePlannedLegacyPublicationCleanup(params: {
  plan: PlannedLegacyPublicationCleanupOperations;
  publicationRef?: unknown | null;
  deleteStoragePrefix(prefix: string): Promise<unknown>;
  recursiveDelete(ref: unknown): Promise<unknown>;
  deleteHistoryDocs(): Promise<number>;
  resetDraftLinks(
    request: PlannedLegacyPublicationCleanupOperations["draftResetRequests"][number]
  ): Promise<boolean>;
  deleteReservationIfExists(slug: string): Promise<boolean>;
  warn(message: string, context: Record<string, unknown>): void;
}): Promise<{
  deletedStoragePrefix: boolean;
  deletedActivePublication: boolean;
  deletedHistoryDocs: number;
  cleanedDrafts: number;
  removedReservation: boolean;
}> {
  const {
    plan,
    publicationRef,
    deleteStoragePrefix,
    recursiveDelete,
    deleteHistoryDocs,
    resetDraftLinks,
    deleteReservationIfExists,
    warn,
  } = params;

  const deletedStoragePrefix = await deleteStoragePrefixWithCustomWarning({
    storagePrefix: plan.storagePrefix,
    deleteStoragePrefix,
    warn,
    warningMessage: "No se pudieron borrar archivos publicados en hard-delete legacy",
    warningContext: {
      slug: plan.slug,
      uid: plan.uid,
    },
  });

  let deletedActivePublication = false;
  if (plan.shouldDeleteActivePublication && publicationRef) {
    await recursiveDelete(publicationRef);
    deletedActivePublication = true;
  }

  const deletedHistoryDocs = await deleteHistoryDocs();

  let cleanedDrafts = 0;
  for (const draftResetRequest of plan.draftResetRequests) {
    const cleaned = await resetDraftLinks(draftResetRequest);
    if (cleaned) cleanedDrafts += 1;
  }

  const removedReservation = await deleteReservationIfExists(plan.slug);

  return {
    deletedStoragePrefix,
    deletedActivePublication,
    deletedHistoryDocs,
    cleanedDrafts,
    removedReservation,
  };
}
