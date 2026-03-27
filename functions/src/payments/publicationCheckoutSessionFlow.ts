import { HttpsError } from "firebase-functions/v2/https";
import type {
  CheckoutPaymentResult,
  CheckoutSessionStatus,
} from "./publicationApprovedSessionFlow";

type UnknownRecord = Record<string, unknown>;

type SessionSnapshotLike = {
  exists: boolean;
  data(): UnknownRecord | undefined;
};

type SessionRefLike = {
  get(): Promise<SessionSnapshotLike>;
  set(data: UnknownRecord, options: { merge: true }): Promise<unknown>;
};

const SESSION_TERMINAL_STATES = new Set<CheckoutSessionStatus>([
  "published",
  "payment_rejected",
  "approved_slug_conflict",
  "expired",
]);

const EXPIRED_SESSION_ERROR_MESSAGE = "La sesion de pago expiro. Inicia una nueva.";
const EXPIRED_SESSION_PAYMENT_MESSAGE = "La sesion expiro";

function getString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function toSafeIsoDate(value: unknown): string {
  const date = value instanceof Date ? value : new Date(String(value || ""));
  return Number.isFinite(date.getTime()) ? date.toISOString() : new Date().toISOString();
}

function asRecord(value: unknown): UnknownRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as UnknownRecord;
}

export async function readOwnedCheckoutSessionFlow<SessionRef extends SessionRefLike>(params: {
  uid: string;
  sessionId: string;
  sessionRef: SessionRef;
}): Promise<{
  ref: SessionRef;
  snap: SessionSnapshotLike;
  data: UnknownRecord;
}> {
  const { uid, sessionId, sessionRef } = params;
  const snap = await sessionRef.get();

  if (!snap.exists) {
    throw new HttpsError("not-found", "Sesion de checkout no encontrada");
  }

  const data = asRecord(snap.data());
  if (getString(data.uid) !== uid) {
    throw new HttpsError("permission-denied", "No tenes acceso a esta sesion");
  }

  return {
    ref: sessionRef,
    snap,
    data,
  };
}

export async function expireCheckoutSessionIfNeededFlow<SessionRef extends SessionRefLike>(params: {
  sessionId: string;
  sessionData: UnknownRecord;
  sessionRef: SessionRef;
  isExpiredAt(value: unknown): boolean;
  createUpdatedAtValue(): unknown;
  updateReservationStatus?(update: {
    slug: string;
    sessionId: string;
    nextStatus: "expired";
  }): Promise<void>;
}): Promise<boolean> {
  const {
    sessionId,
    sessionData,
    sessionRef,
    isExpiredAt,
    createUpdatedAtValue,
    updateReservationStatus,
  } = params;
  const status = getString(sessionData.status) as CheckoutSessionStatus;

  if (!isExpiredAt(sessionData.expiresAt) || SESSION_TERMINAL_STATES.has(status)) {
    return false;
  }

  await sessionRef.set(
    {
      status: "expired",
      lastError: EXPIRED_SESSION_ERROR_MESSAGE,
      updatedAt: createUpdatedAtValue(),
    },
    { merge: true }
  );

  if (getString(sessionData.operation) === "new" && updateReservationStatus) {
    await updateReservationStatus({
      slug: getString(sessionData.publicSlug),
      sessionId,
      nextStatus: "expired",
    });
  }

  return true;
}

export function buildExpiredCheckoutPaymentResult(): CheckoutPaymentResult {
  return {
    sessionStatus: "expired",
    paymentId: "",
    message: EXPIRED_SESSION_PAYMENT_MESSAGE,
    errorMessage: EXPIRED_SESSION_ERROR_MESSAGE,
  };
}

export function buildExpiredCheckoutStatusResponse(): {
  sessionStatus: "expired";
  errorMessage: string;
} {
  return {
    sessionStatus: "expired",
    errorMessage: EXPIRED_SESSION_ERROR_MESSAGE,
  };
}

export function buildCheckoutStatusResponseFromSession(data: UnknownRecord): {
  sessionStatus: CheckoutSessionStatus;
  publicUrl?: string;
  receipt?: Record<string, unknown>;
  errorMessage?: string;
} {
  return {
    sessionStatus: (getString(data.status) as CheckoutSessionStatus) || "awaiting_payment",
    publicUrl: getString(data.publicUrl) || undefined,
    receipt: (data.receipt as Record<string, unknown> | undefined) || undefined,
    errorMessage: getString(data.lastError) || undefined,
  };
}

export async function autoApproveZeroAmountCheckoutSessionFlow<SessionRef extends SessionRefLike>(
  params: {
    sessionId: string;
    sessionData: UnknownRecord;
    sessionRef: SessionRef;
    createUpdatedAtValue(): unknown;
    approvedAt?: string;
  }
): Promise<{
  paymentId: string;
  approvedAt: string;
}> {
  const { sessionId, sessionData, sessionRef, createUpdatedAtValue } = params;
  const paymentId = getString(sessionData.mpPaymentId) || `discount-full-${sessionId}`;
  const approvedAt = toSafeIsoDate(params.approvedAt || new Date());

  await sessionRef.set(
    {
      mpPaymentId: paymentId,
      mpStatus: "approved",
      mpStatusDetail: "discount_100_auto_approved",
      status: "payment_approved",
      lastError: null,
      updatedAt: createUpdatedAtValue(),
    },
    { merge: true }
  );

  return {
    paymentId,
    approvedAt,
  };
}
