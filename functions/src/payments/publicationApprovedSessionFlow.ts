import { HttpsError } from "firebase-functions/v2/https";
import {
  buildApprovedSessionRetryableFailureWrite,
  planApprovedSessionPublishSuccess,
  planApprovedSessionPublishingClaim,
  planApprovedSessionSlugConflict,
} from "./publicationOperationPlanning";
import { executeApprovedSessionOutcomeEffects } from "./publicationOperationExecution";

export type CheckoutOperation = "new" | "update";

export type CheckoutSessionStatus =
  | "awaiting_payment"
  | "payment_processing"
  | "payment_rejected"
  | "payment_approved"
  | "publishing"
  | "published"
  | "approved_slug_conflict"
  | "expired";

export type CheckoutPaymentResult = {
  sessionStatus: CheckoutSessionStatus;
  publicUrl?: string;
  receipt?: Record<string, unknown>;
  errorMessage?: string;
  publishingStage?: Record<string, unknown>;
  publishingStageDurationsMs?: Record<string, unknown>;
  publishingShareImageSubstage?: Record<string, unknown>;
  publishingShareImageDiagnostics?: Record<string, unknown>;
  publicationAutoRetry?: Record<string, unknown>;
  paymentId: string;
  message?: string;
};

type SessionSnapshotLike = {
  exists: boolean;
  data(): Record<string, unknown> | undefined;
};

type SessionRefLike = {
  get(): Promise<SessionSnapshotLike>;
  set(data: Record<string, unknown>, options: { merge: true }): Promise<unknown>;
};

type TransactionLike<SessionRef extends SessionRefLike> = {
  get(ref: SessionRef): Promise<SessionSnapshotLike>;
  set(ref: SessionRef, data: Record<string, unknown>, options: { merge: true }): void;
};

type PublicationAutoRetryOptions = {
  maxAttempts?: number;
  backoffMs?: number[];
  delay?(ms: number): Promise<void>;
  createTimestampValue?(date: Date): unknown;
  createLeaseExpiresAtValue?(date: Date): unknown;
  leaseMs?: number;
  getNowMs?(): number;
};

type PublicationRetryClassification = {
  retryable: boolean;
  reason: string;
  errorCode: string;
};

type ApprovedPaymentAnalyticsDeps = {
  unknownTemplateAnalyticsId: string;
  loadDraftData(draftSlug: string): Promise<Record<string, unknown> | null>;
  loadPublishedData(publicSlug: string): Promise<Record<string, unknown> | null>;
  recordEvent(input: {
    eventId: string;
    eventName: "pago_aprobado";
    timestamp: Date;
    userId: string;
    invitacionId: string | null;
    templateId: string;
    metadata: Record<string, unknown>;
  }): Promise<void>;
};

function getString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function toAmount(value: unknown, fallback: number): number {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function normalizeOperation(value: unknown): CheckoutOperation {
  return getString(value) === "update" ? "update" : "new";
}

function clampInteger(value: unknown, fallback: number, min: number, max: number): number {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(num)));
}

function getErrorCode(error: unknown): string {
  if (error instanceof HttpsError) return getString(error.code) || "https-error";
  if (error instanceof Error) return getString(error.message) || "error";
  return getString(error) || "unknown-error";
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : getString(error) || "Pago aprobado, pero la publicacion no se pudo completar en este intento.";
}

function classifyPublicationRetryError(error: unknown): PublicationRetryClassification {
  const message = getErrorMessage(error);
  const errorCode = getErrorCode(error);

  if (error instanceof HttpsError) {
    if (
      error.code === "invalid-argument" ||
      error.code === "permission-denied" ||
      error.code === "not-found"
    ) {
      return { retryable: false, reason: "non-retryable-http-error", errorCode };
    }

    if (
      error.code === "internal" ||
      error.code === "unavailable" ||
      error.code === "deadline-exceeded" ||
      error.code === "resource-exhausted" ||
      error.code === "aborted"
    ) {
      return { retryable: true, reason: "transient-http-error", errorCode };
    }

    if (error.code === "failed-precondition") {
      const details = error.details;
      const hasValidationDetails =
        Boolean(details) &&
        typeof details === "object" &&
        "validation" in (details as Record<string, unknown>);
      if (hasValidationDetails) {
        return { retryable: false, reason: "publish-validation-blocker", errorCode };
      }

      if (
        /renderer-timeout|share-upload-failed|invalid-generated-image|timeout|storage|artifact|chromium|puppeteer/i.test(
          message
        )
      ) {
        return { retryable: true, reason: "publish-transient-stage-error", errorCode };
      }

      return { retryable: false, reason: "failed-precondition", errorCode };
    }
  }

  return { retryable: true, reason: "unexpected-publish-error", errorCode };
}

function getAutoRetryBackoffMs(values: number[] | undefined, completedAttempt: number): number {
  const configured = Array.isArray(values) ? values[completedAttempt - 1] : undefined;
  const fallback = completedAttempt <= 1 ? 1_500 : 3_000;
  return clampInteger(configured, fallback, 0, 10_000);
}

function buildPublicationAutoRetryState(params: {
  status: "scheduled" | "running" | "succeeded" | "exhausted" | "not_retryable";
  attempt: number;
  maxAttempts: number;
  updatedAt: unknown;
  error?: unknown;
  retryable?: boolean;
  reason?: string;
  nextAttempt?: number;
  nextRetryAt?: unknown;
  failedSession?: Record<string, unknown>;
}): Record<string, unknown> {
  const errorCode = params.error ? getErrorCode(params.error) : null;
  const state: Record<string, unknown> = {
    status: params.status,
    attempt: params.attempt,
    attempts: params.attempt,
    maxAttempts: params.maxAttempts,
    updatedAt: params.updatedAt,
  };

  if (typeof params.retryable === "boolean") state.retryable = params.retryable;
  if (params.reason) state.reason = params.reason;
  if (errorCode) state.lastErrorCode = errorCode;
  if (params.error) state.lastError = getErrorMessage(params.error);
  if (params.nextAttempt) state.nextAttempt = params.nextAttempt;
  if (typeof params.nextRetryAt !== "undefined") state.nextRetryAt = params.nextRetryAt;

  const failedStage = asRecord(params.failedSession?.publishingStage);
  if (Object.keys(failedStage).length > 0) state.lastFailedStage = failedStage;

  const failedSubstage = asRecord(params.failedSession?.publishingShareImageSubstage);
  if (Object.keys(failedSubstage).length > 0) {
    state.lastFailedShareImageSubstage = failedSubstage;
  }

  const failedDiagnostics = asRecord(params.failedSession?.publishingShareImageDiagnostics);
  if (Object.keys(failedDiagnostics).length > 0) {
    state.lastFailedShareImageDiagnostics = failedDiagnostics;
  }

  return state;
}

function toSafeIsoDate(value: unknown): string {
  const date = value instanceof Date ? value : new Date(String(value || ""));
  return Number.isFinite(date.getTime()) ? date.toISOString() : new Date().toISOString();
}

function isSlugConflictError(error: unknown): boolean {
  return error instanceof HttpsError && error.code === "already-exists";
}

export function buildPaymentResultFromSession(
  data: Record<string, unknown>,
  paymentId = ""
): CheckoutPaymentResult {
  const result: CheckoutPaymentResult = {
    sessionStatus: (getString(data.status) as CheckoutSessionStatus) || "payment_processing",
    paymentId,
    publicUrl: getString(data.publicUrl) || undefined,
    receipt: (data.receipt as Record<string, unknown> | undefined) || undefined,
    errorMessage: getString(data.lastError) || undefined,
  };

  const publishingStage = asRecord(data.publishingStage);
  if (Object.keys(publishingStage).length > 0) {
    result.publishingStage = publishingStage;
  }

  const publishingStageDurationsMs = asRecord(data.publishingStageDurationsMs);
  if (Object.keys(publishingStageDurationsMs).length > 0) {
    result.publishingStageDurationsMs = publishingStageDurationsMs;
  }

  const publishingShareImageSubstage = asRecord(data.publishingShareImageSubstage);
  if (Object.keys(publishingShareImageSubstage).length > 0) {
    result.publishingShareImageSubstage = publishingShareImageSubstage;
  }

  const publishingShareImageDiagnostics = asRecord(
    data.publishingShareImageDiagnostics
  );
  if (Object.keys(publishingShareImageDiagnostics).length > 0) {
    result.publishingShareImageDiagnostics = publishingShareImageDiagnostics;
  }

  const publicationAutoRetry = asRecord(data.publicationAutoRetry);
  if (Object.keys(publicationAutoRetry).length > 0) {
    result.publicationAutoRetry = publicationAutoRetry;
  }

  return result;
}

export function buildApprovedSessionReceipt(params: {
  operation: CheckoutOperation;
  amountBaseArs: number;
  amountArs: number;
  discountAmountArs: number;
  discountCode?: string | null;
  discountDescription?: string | null;
  currency: "ARS";
  paymentId: string;
  publicSlug: string;
  publicUrl?: string;
  approvedAt?: string;
}): Record<string, unknown> {
  return {
    operation: params.operation,
    amountBaseArs: params.amountBaseArs,
    amountArs: params.amountArs,
    discountAmountArs: params.discountAmountArs,
    discountCode: params.discountCode || null,
    discountDescription: params.discountDescription || null,
    currency: params.currency,
    approvedAt: params.approvedAt || toSafeIsoDate(new Date()),
    paymentId: params.paymentId,
    publicSlug: params.publicSlug,
    publicUrl: params.publicUrl || null,
  };
}

export async function recordApprovedPaymentAnalytics(params: {
  sessionId: string;
  paymentId: string;
  approvedAt?: string;
  sessionPayload: Record<string, unknown>;
  deps: ApprovedPaymentAnalyticsDeps;
}): Promise<void> {
  const { sessionId, paymentId, approvedAt, sessionPayload, deps } = params;
  const userId = getString(sessionPayload.uid);
  const draftSlug = getString(sessionPayload.draftSlug);
  const publicSlug = getString(sessionPayload.publicSlug);
  if (!userId || !paymentId) return;

  let templateId = deps.unknownTemplateAnalyticsId;
  let templateName = "";

  if (draftSlug) {
    const draftData = await deps.loadDraftData(draftSlug);
    if (draftData) {
      templateId = getString(draftData.plantillaId) || templateId;
      templateName = getString(draftData.nombre) || templateName;
    }
  }

  if (publicSlug) {
    const publishedData = await deps.loadPublishedData(publicSlug);
    if (publishedData) {
      templateId = getString(publishedData.plantillaId) || templateId;
      templateName = getString(publishedData.nombre) || templateName;
    }
  }

  const timestamp = approvedAt ? new Date(approvedAt) : new Date();
  const safeTimestamp = Number.isFinite(timestamp.getTime()) ? timestamp : new Date();

  await deps.recordEvent({
    eventId: `pago_aprobado:${paymentId}`,
    eventName: "pago_aprobado",
    timestamp: safeTimestamp,
    userId,
    invitacionId: draftSlug || null,
    templateId,
    metadata: {
      paymentId,
      paymentSessionId: sessionId,
      publicSlug: publicSlug || null,
      operation: normalizeOperation(sessionPayload.operation),
      amountArs: toAmount(sessionPayload.amountArs, 0),
      amountBaseArs: toAmount(
        sessionPayload.amountBaseArs,
        toAmount(sessionPayload.amountArs, 0)
      ),
      discountAmountArs: toAmount(sessionPayload.discountAmountArs, 0),
      templateName,
    },
  });
}

export async function claimApprovedSessionPublishingSlot<SessionRef extends SessionRefLike>(params: {
  sessionRef: SessionRef;
  runTransaction<T>(
    updateFn: (tx: TransactionLike<SessionRef>) => Promise<T>
  ): Promise<T>;
  createUpdatedAtValue(): unknown;
  createLeaseExpiresAtValue?: () => unknown;
  getNowMs?: () => number;
}): Promise<{
  sessionPayload: Record<string, unknown>;
  shouldPublish: boolean;
}> {
  let sessionPayload: Record<string, unknown> | null = null;
  let shouldPublish = false;

  await params.runTransaction(async (tx) => {
    const snap = await tx.get(params.sessionRef);
    if (!snap.exists) {
      throw new HttpsError("not-found", "Sesion no encontrada");
    }

    const data = (snap.data() || {}) as Record<string, unknown>;
    const status = getString(data.status) as CheckoutSessionStatus;

    sessionPayload = data;
    const plannedClaim = planApprovedSessionPublishingClaim({
      status,
      updatedAtValue: params.createUpdatedAtValue(),
      publishingLeaseExpiresAtValue: params.createLeaseExpiresAtValue?.(),
      existingPublishingLeaseExpiresAt: data.publishingLeaseExpiresAt,
      nowMs: params.getNowMs?.(),
    });

    if (!plannedClaim.shouldPublish || !plannedClaim.sessionWrite) {
      return;
    }

    tx.set(params.sessionRef, plannedClaim.sessionWrite, { merge: true });
    shouldPublish = true;
  });

  if (!sessionPayload) {
    throw new HttpsError("not-found", "Sesion invalida");
  }

  return {
    sessionPayload,
    shouldPublish,
  };
}

export async function finalizeApprovedSessionFlow<SessionRef extends SessionRefLike>(params: {
  sessionId: string;
  fallbackPaymentId: string;
  approvedAt?: string;
  sessionRef: SessionRef;
  runTransaction<T>(
    updateFn: (tx: TransactionLike<SessionRef>) => Promise<T>
  ): Promise<T>;
  createUpdatedAtValue(): unknown;
  publishDraftToPublic(input: {
    draftSlug: string;
    publicSlug: string;
    uid: string;
    operation: CheckoutOperation;
    paymentSessionId: string;
  }): Promise<{ publicSlug: string; publicUrl: string }>;
  updateReservationStatus?(update: {
    slug: string;
    sessionId: string;
    nextStatus: "consumed" | "released";
  }): Promise<void>;
  recordDiscountUsageIfNeeded?(params: {
    sessionId: string;
    sessionPayload: Record<string, unknown>;
    paymentId: string;
    approvedAt?: string;
  }): Promise<void>;
  approvedPaymentAnalytics?: ApprovedPaymentAnalyticsDeps | null;
  autoRetry?: PublicationAutoRetryOptions | null;
  logError?(message: string, context: Record<string, unknown>): void;
}): Promise<CheckoutPaymentResult> {
  const { sessionId, fallbackPaymentId, approvedAt, sessionRef } = params;
  const autoRetry = params.autoRetry || null;
  const maxAttempts = clampInteger(autoRetry?.maxAttempts, 1, 1, 3);
  const delay =
    autoRetry?.delay ||
    (async (ms: number) => {
      await new Promise((resolve) => setTimeout(resolve, ms));
    });
  const getNowMs = autoRetry?.getNowMs || (() => Date.now());
  const createTimestampValue =
    autoRetry?.createTimestampValue || ((date: Date) => date.toISOString());
  const createLeaseExpiresAtValue =
    autoRetry?.createLeaseExpiresAtValue ||
    ((date: Date) => createTimestampValue(date));
  const leaseMs = clampInteger(autoRetry?.leaseMs, 90_000, 30_000, 180_000);
  const { sessionPayload, shouldPublish } = await claimApprovedSessionPublishingSlot({
    sessionRef,
    runTransaction: params.runTransaction,
    createUpdatedAtValue: params.createUpdatedAtValue,
    createLeaseExpiresAtValue: () =>
      createLeaseExpiresAtValue(new Date(getNowMs() + leaseMs)),
    getNowMs,
  });

  if (params.approvedPaymentAnalytics) {
    try {
      await recordApprovedPaymentAnalytics({
        sessionId,
        paymentId: fallbackPaymentId,
        approvedAt,
        sessionPayload,
        deps: params.approvedPaymentAnalytics,
      });
    } catch (analyticsError) {
      params.logError?.("No se pudo registrar analytics de pago aprobado", {
        sessionId,
        paymentId: fallbackPaymentId,
        error:
          analyticsError instanceof Error
            ? analyticsError.message
            : String(analyticsError || ""),
      });
    }
  }

  if (!shouldPublish) {
    const snap = await sessionRef.get();
    return buildPaymentResultFromSession(
      (snap.data() || {}) as Record<string, unknown>,
      fallbackPaymentId
    );
  }

  const draftSlug = getString(sessionPayload.draftSlug);
  const publicSlug = getString(sessionPayload.publicSlug);
  const uid = getString(sessionPayload.uid);
  const operation = normalizeOperation(sessionPayload.operation);
  const pricingSnapshot =
    sessionPayload.pricingSnapshot && typeof sessionPayload.pricingSnapshot === "object"
      ? (sessionPayload.pricingSnapshot as Record<string, unknown>)
      : {};
  const amountArs = toAmount(sessionPayload.amountArs, 0);
  const amountBaseArs = toAmount(
    sessionPayload.amountBaseArs,
    toAmount(pricingSnapshot.appliedPrice, amountArs)
  );
  const discountAmountArs = toAmount(sessionPayload.discountAmountArs, 0);
  const discountCode = getString(sessionPayload.discountCode) || null;
  const discountDescription = getString(sessionPayload.discountDescription) || null;
  const currency =
    getString(sessionPayload.currency) === "ARS"
      ? "ARS"
      : getString(pricingSnapshot.currency) === "ARS"
        ? "ARS"
        : "ARS";

  let attempt = 0;

  while (attempt < maxAttempts) {
    attempt += 1;

    if (attempt > 1) {
      await sessionRef.set(
        {
          status: "publishing",
          lastError: null,
          publicationAutoRetry: buildPublicationAutoRetryState({
            status: "running",
            attempt,
            maxAttempts,
            updatedAt: createTimestampValue(new Date(getNowMs())),
          }),
          publishingLeaseExpiresAt: createLeaseExpiresAtValue(
            new Date(getNowMs() + leaseMs)
          ),
          updatedAt: params.createUpdatedAtValue(),
        },
        { merge: true }
      );
    }

    try {
      const publication = await params.publishDraftToPublic({
        draftSlug,
        publicSlug,
        uid,
        operation,
        paymentSessionId: sessionId,
      });

      const receipt = buildApprovedSessionReceipt({
        operation,
        amountBaseArs,
        amountArs,
        discountAmountArs,
        discountCode,
        discountDescription,
        currency,
        paymentId: fallbackPaymentId,
        publicSlug: publication.publicSlug,
        publicUrl: publication.publicUrl,
        approvedAt,
      });
      const plannedSuccess = planApprovedSessionPublishSuccess({
        operation,
        sessionId,
        fallbackPaymentId,
        publicSlug: publication.publicSlug,
        publicUrl: publication.publicUrl,
        receipt,
        updatedAtValue: params.createUpdatedAtValue(),
        publicationAutoRetry:
          attempt > 1
            ? buildPublicationAutoRetryState({
                status: "succeeded",
                attempt,
                maxAttempts,
                updatedAt: createTimestampValue(new Date(getNowMs())),
              })
            : null,
      });

      await executeApprovedSessionOutcomeEffects({
        sessionRef,
        sessionWrite: plannedSuccess.sessionWrite,
        reservationUpdate: plannedSuccess.reservationUpdate,
        updateReservationStatus: params.updateReservationStatus,
      });

      if (params.recordDiscountUsageIfNeeded) {
        try {
          await params.recordDiscountUsageIfNeeded({
            sessionId,
            sessionPayload: {
              ...sessionPayload,
              publicSlug: publication.publicSlug,
            },
            paymentId: fallbackPaymentId,
            approvedAt,
          });
        } catch (usageError) {
          params.logError?.("No se pudo registrar uso de codigo de descuento", {
            sessionId,
            error: usageError instanceof Error ? usageError.message : String(usageError || ""),
          });
        }
      }

      return plannedSuccess.result;
    } catch (error) {
      if (isSlugConflictError(error)) {
        const plannedConflict = planApprovedSessionSlugConflict({
          sessionId,
          fallbackPaymentId,
          publicSlug,
          updatedAtValue: params.createUpdatedAtValue(),
        });

        await executeApprovedSessionOutcomeEffects({
          sessionRef,
          sessionWrite: {
            ...plannedConflict.sessionWrite,
            publishingLeaseExpiresAt: null,
            publicationAutoRetry: buildPublicationAutoRetryState({
              status: "not_retryable",
              attempt,
              maxAttempts,
              error,
              retryable: false,
              reason: "slug-conflict",
              updatedAt: createTimestampValue(new Date(getNowMs())),
            }),
          },
          reservationUpdate: plannedConflict.reservationUpdate,
          updateReservationStatus: params.updateReservationStatus,
        });

        return plannedConflict.result;
      }

      const classification = classifyPublicationRetryError(error);
      const shouldRetry = classification.retryable && attempt < maxAttempts;
      params.logError?.("Error publicando sesion aprobada", {
        sessionId,
        attempt,
        maxAttempts,
        retryable: classification.retryable,
        retryReason: classification.reason,
        error: getErrorMessage(error),
      });

      if (shouldRetry) {
        const failedSnapshot = await sessionRef.get();
        const failedSession = (failedSnapshot.data() || {}) as Record<string, unknown>;
        const backoff = getAutoRetryBackoffMs(autoRetry?.backoffMs, attempt);
        const nowMs = getNowMs();
        await sessionRef.set(
          {
            status: "publishing",
            lastError: getErrorMessage(error),
            publishingStage: null,
            publishingShareImageSubstage: null,
            publicationAutoRetry: buildPublicationAutoRetryState({
              status: "scheduled",
              attempt,
              maxAttempts,
              error,
              retryable: true,
              reason: classification.reason,
              nextAttempt: attempt + 1,
              nextRetryAt: createTimestampValue(new Date(nowMs + backoff)),
              updatedAt: createTimestampValue(new Date(nowMs)),
              failedSession,
            }),
            publishingLeaseExpiresAt: createLeaseExpiresAtValue(
              new Date(nowMs + leaseMs)
            ),
            updatedAt: params.createUpdatedAtValue(),
          },
          { merge: true }
        );
        await delay(backoff);
        continue;
      }

      await executeApprovedSessionOutcomeEffects({
        sessionRef,
        sessionWrite: buildApprovedSessionRetryableFailureWrite({
          error,
          updatedAtValue: params.createUpdatedAtValue(),
          publicationAutoRetry: buildPublicationAutoRetryState({
            status: classification.retryable ? "exhausted" : "not_retryable",
            attempt,
            maxAttempts,
            error,
            retryable: classification.retryable,
            reason: classification.reason,
            updatedAt: createTimestampValue(new Date(getNowMs())),
          }),
        }),
      });

      if (error instanceof HttpsError) {
        throw error;
      }

      throw new HttpsError(
        "failed-precondition",
        getErrorMessage(error)
      );
    }
  }

  throw new HttpsError(
    "failed-precondition",
    "Pago aprobado, pero la publicacion no se pudo completar en este intento."
  );
}

export function statusFromMercadoPago(status: string): CheckoutSessionStatus {
  switch (status) {
    case "approved":
      return "payment_approved";
    case "rejected":
    case "cancelled":
      return "payment_rejected";
    default:
      return "payment_processing";
  }
}

export async function processMercadoPagoPaymentFlow<SessionRef extends SessionRefLike>(params: {
  sessionId: string;
  paymentId: string;
  paymentStatus: string;
  paymentStatusDetail?: string;
  approvedAt?: string;
  sessionRef: SessionRef;
  createUpdatedAtValue(): unknown;
  finalizeApprovedSession(input: {
    sessionId: string;
    fallbackPaymentId: string;
    approvedAt?: string;
  }): Promise<CheckoutPaymentResult>;
}): Promise<CheckoutPaymentResult> {
  const { sessionId, paymentId, paymentStatus, paymentStatusDetail, approvedAt, sessionRef } =
    params;
  const mappedStatus = statusFromMercadoPago(paymentStatus);

  if (mappedStatus === "payment_approved") {
    await sessionRef.set(
      {
        mpPaymentId: paymentId,
        mpStatus: paymentStatus,
        mpStatusDetail: paymentStatusDetail || null,
        status: "payment_approved",
        updatedAt: params.createUpdatedAtValue(),
      },
      { merge: true }
    );

    return params.finalizeApprovedSession({
      sessionId,
      fallbackPaymentId: paymentId,
      approvedAt,
    });
  }

  if (mappedStatus === "payment_rejected") {
    await sessionRef.set(
      {
        mpPaymentId: paymentId,
        mpStatus: paymentStatus,
        mpStatusDetail: paymentStatusDetail || null,
        status: "payment_rejected",
        lastError: "El pago fue rechazado. Intenta con otro medio de pago.",
        updatedAt: params.createUpdatedAtValue(),
      },
      { merge: true }
    );

    const snap = await sessionRef.get();
    return {
      ...buildPaymentResultFromSession((snap.data() || {}) as Record<string, unknown>, paymentId),
      sessionStatus: "payment_rejected",
      paymentId,
    };
  }

  await sessionRef.set(
    {
      mpPaymentId: paymentId,
      mpStatus: paymentStatus,
      mpStatusDetail: paymentStatusDetail || null,
      status: "payment_processing",
      lastError: null,
      updatedAt: params.createUpdatedAtValue(),
    },
    { merge: true }
  );

  return {
    sessionStatus: "payment_processing",
    paymentId,
    message: "El pago esta siendo procesado.",
  };
}
