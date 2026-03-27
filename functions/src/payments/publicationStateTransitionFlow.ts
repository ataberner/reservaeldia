import { HttpsError } from "firebase-functions/v2/https";
import {
  PUBLICATION_LIFECYCLE_STATES,
  PUBLICATION_PUBLIC_STATES,
  computePublicationExpirationDate,
  normalizePublicationPublicState,
  resolvePublicationBackendStateFromData,
  resolvePublicationEffectiveExpirationDateFromData,
  resolvePublicationFirstPublishedAtFromData,
} from "./publicationLifecycle";
import { planPublicationTransitionOperations } from "./publicationOperationPlanning";

type UnknownRecord = Record<string, unknown>;

type PublicationStateTransitionAction =
  | "pause"
  | "resume"
  | "move_to_trash"
  | "restore_from_trash";

type PublicationSnapshotLike = {
  createTime?: unknown;
};

type PublicationStateTransitionResult = {
  slug: string;
  estado: string;
  publicadaAt: string;
  venceAt: string;
  pausadaAt: string | null;
  enPapeleraAt: string | null;
};

type PreparedPublicationStateTransitionFlow = {
  linkedDraftSlug: string;
  activePublicationWrite: Record<string, unknown>;
  draftWrite: Record<string, unknown> | null;
  result: PublicationStateTransitionResult;
};

function asRecord(value: unknown): UnknownRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as UnknownRecord;
}

function getString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function resolveTransitionTargetState(params: {
  currentState: string;
  action: PublicationStateTransitionAction;
  now: Date;
  venceAt: Date;
}): {
  nextState: string;
  pausedAt: Date | null;
  enPapeleraAt: Date | null;
} {
  const { currentState, action, now, venceAt } = params;

  if (action === "pause") {
    if (currentState !== PUBLICATION_PUBLIC_STATES.ACTIVE) {
      throw new HttpsError(
        "failed-precondition",
        "Solo puedes pausar una invitacion activa."
      );
    }

    return {
      nextState: PUBLICATION_PUBLIC_STATES.PAUSED,
      pausedAt: now,
      enPapeleraAt: null,
    };
  }

  if (action === "resume") {
    if (currentState !== PUBLICATION_PUBLIC_STATES.PAUSED) {
      throw new HttpsError(
        "failed-precondition",
        "Solo puedes reanudar una invitacion pausada."
      );
    }
    if (venceAt.getTime() <= now.getTime()) {
      throw new HttpsError(
        "failed-precondition",
        "La invitacion ya vencio y no puede reanudarse."
      );
    }

    return {
      nextState: PUBLICATION_PUBLIC_STATES.ACTIVE,
      pausedAt: null,
      enPapeleraAt: null,
    };
  }

  if (action === "move_to_trash") {
    if (currentState !== PUBLICATION_PUBLIC_STATES.PAUSED) {
      throw new HttpsError(
        "failed-precondition",
        "Solo puedes mover a papelera una invitacion pausada."
      );
    }

    return {
      nextState: PUBLICATION_PUBLIC_STATES.TRASH,
      pausedAt: now,
      enPapeleraAt: now,
    };
  }

  if (action === "restore_from_trash") {
    if (currentState !== PUBLICATION_PUBLIC_STATES.TRASH) {
      throw new HttpsError(
        "failed-precondition",
        "Solo puedes restaurar invitaciones en papelera."
      );
    }

    return {
      nextState: PUBLICATION_PUBLIC_STATES.PAUSED,
      pausedAt: now,
      enPapeleraAt: null,
    };
  }

  throw new HttpsError("invalid-argument", "Accion de estado invalida.");
}

export function preparePublicationStateTransitionFlow(params: {
  slug: string;
  action: PublicationStateTransitionAction;
  publicationData: UnknownRecord;
  publicationSnap: PublicationSnapshotLike;
  linkedDraftSlug: string;
  now: Date;
  createActiveUpdatedAtValue(): unknown;
  createDraftUpdatedAtValue(): unknown;
}): PreparedPublicationStateTransitionFlow {
  const {
    slug,
    action,
    publicationData,
    publicationSnap,
    linkedDraftSlug,
    now,
  } = params;

  const normalizedPublicationData = asRecord(publicationData);
  const normalizedLinkedDraftSlug = getString(linkedDraftSlug);
  const firstPublishedAt =
    resolvePublicationFirstPublishedAtFromData(normalizedPublicationData, {
      fallbackPublishedAt: publicationSnap.createTime ?? now,
    }) || now;
  const effectiveExpirationDate =
    resolvePublicationEffectiveExpirationDateFromData(normalizedPublicationData, {
      fallbackPublishedAt: firstPublishedAt,
      includeLifecycleExpiration: false,
    }) || computePublicationExpirationDate(firstPublishedAt);
  const currentState = resolvePublicationBackendStateFromData(normalizedPublicationData);

  if (
    currentState === PUBLICATION_LIFECYCLE_STATES.FINALIZED ||
    currentState === "finalizada"
  ) {
    throw new HttpsError(
      "failed-precondition",
      "La invitacion ya esta finalizada."
    );
  }

  const normalizedCurrentPublicState = normalizePublicationPublicState(currentState);
  if (!normalizedCurrentPublicState) {
    throw new HttpsError(
      "failed-precondition",
      "La publicacion no tiene un estado compatible para esta accion."
    );
  }

  const transitionTarget = resolveTransitionTargetState({
    currentState: normalizedCurrentPublicState,
    action,
    now,
    venceAt: effectiveExpirationDate,
  });

  const plannedTransition = planPublicationTransitionOperations({
    slug,
    nextState: transitionTarget.nextState,
    firstPublishedAt,
    effectiveExpirationDate,
    pausedAt: transitionTarget.pausedAt,
    trashedAt: transitionTarget.enPapeleraAt,
    linkedDraftSlug: normalizedLinkedDraftSlug,
    activeUpdatedAtValue: params.createActiveUpdatedAtValue(),
    draftUpdatedAtValue: params.createDraftUpdatedAtValue(),
  });

  return {
    linkedDraftSlug: normalizedLinkedDraftSlug,
    activePublicationWrite: plannedTransition.activePublicationWrite,
    draftWrite: plannedTransition.draftWrite,
    result: plannedTransition.result,
  };
}
