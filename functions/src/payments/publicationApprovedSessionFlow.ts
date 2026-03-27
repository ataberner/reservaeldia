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

function toAmount(value: unknown, fallback: number): number {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function normalizeOperation(value: unknown): CheckoutOperation {
  return getString(value) === "update" ? "update" : "new";
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
  return {
    sessionStatus: (getString(data.status) as CheckoutSessionStatus) || "payment_processing",
    paymentId,
    publicUrl: getString(data.publicUrl) || undefined,
    receipt: (data.receipt as Record<string, unknown> | undefined) || undefined,
    errorMessage: getString(data.lastError) || undefined,
  };
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
  logError?(message: string, context: Record<string, unknown>): void;
}): Promise<CheckoutPaymentResult> {
  const { sessionId, fallbackPaymentId, approvedAt, sessionRef } = params;
  const { sessionPayload, shouldPublish } = await claimApprovedSessionPublishingSlot({
    sessionRef,
    runTransaction: params.runTransaction,
    createUpdatedAtValue: params.createUpdatedAtValue,
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
        sessionWrite: plannedConflict.sessionWrite,
        reservationUpdate: plannedConflict.reservationUpdate,
        updateReservationStatus: params.updateReservationStatus,
      });

      return plannedConflict.result;
    }

    params.logError?.("Error publicando sesion aprobada", {
      sessionId,
      error: error instanceof Error ? error.message : String(error || ""),
    });

    await executeApprovedSessionOutcomeEffects({
      sessionRef,
      sessionWrite: buildApprovedSessionRetryableFailureWrite({
        error,
        updatedAtValue: params.createUpdatedAtValue(),
      }),
    });

    if (error instanceof HttpsError) {
      throw error;
    }

    throw new HttpsError(
      "failed-precondition",
      error instanceof Error && error.message
        ? error.message
        : "Pago aprobado, pero la publicacion no se pudo completar en este intento."
    );
  }
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
