import * as admin from "firebase-admin";
import { type CallableRequest, HttpsError } from "firebase-functions/v2/https";
import type { CheckoutOperation } from "./publicationApprovedSessionFlow";

type UnknownRecord = Record<string, unknown>;

export type PublicationStateTransitionAction =
  | "pause"
  | "resume"
  | "move_to_trash"
  | "restore_from_trash";

export type RetryPaidPublicationResult = {
  sessionStatus: "published" | "awaiting_retry";
  publicUrl?: string;
  message?: string;
};

function getString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function getNumber(value: unknown, fallback = 0): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return numeric;
}

export function toAmount(value: unknown, fallback: number): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(0, Math.round(numeric));
}

export function isZeroAmount(value: unknown): boolean {
  return toAmount(value, 0) <= 0;
}

export function mapMercadoPagoConfigError(error: unknown): HttpsError {
  const message = error instanceof Error ? error.message : String(error || "");
  if (message.includes("Falta variable de entorno requerida")) {
    return new HttpsError(
      "failed-precondition",
      "Configuracion de pagos incompleta. Falta configurar Mercado Pago en backend."
    );
  }
  return new HttpsError("internal", "No se pudo inicializar Mercado Pago.");
}

export function mapMercadoPagoPaymentError(error: unknown): HttpsError {
  const message = error instanceof Error ? error.message : String(error || "");

  if (message.includes("Falta variable de entorno requerida")) {
    return mapMercadoPagoConfigError(error);
  }

  const normalized = message.toLowerCase();
  if (normalized.includes("payment type")) {
    return new HttpsError(
      "invalid-argument",
      "Selecciona un medio de pago para continuar."
    );
  }

  if (normalized.includes("token")) {
    return new HttpsError(
      "invalid-argument",
      "Completa los datos del medio de pago."
    );
  }

  return new HttpsError(
    "failed-precondition",
    "No se pudo procesar el pago. Intenta nuevamente."
  );
}

export function extractPaymentMethodId(brickData: UnknownRecord): string {
  const fromSelected = brickData.selectedPaymentMethod;
  const selectedId =
    typeof fromSelected === "string"
      ? getString(fromSelected)
      : getString((fromSelected as UnknownRecord | undefined)?.id);

  return (
    getString(brickData.payment_method_id) ||
    getString(brickData.paymentMethodId) ||
    selectedId
  );
}

export function isAccountMoneyPaymentMethod(paymentMethodId: string): boolean {
  return getString(paymentMethodId).toLowerCase() === "account_money";
}

export function normalizeSessionId(value: unknown): string {
  const sessionId = getString(value);
  if (!sessionId) {
    throw new HttpsError("invalid-argument", "Falta sessionId");
  }
  return sessionId;
}

export function normalizeDraftSlug(value: unknown): string {
  const draftSlug = getString(value);
  if (!draftSlug) {
    throw new HttpsError("invalid-argument", "Falta draftSlug");
  }
  return draftSlug;
}

export function normalizeOperation(value: unknown): CheckoutOperation {
  if (value === "new" || value === "update") return value;
  throw new HttpsError("invalid-argument", "operation invalido");
}

export function normalizePublicationStateTransitionAction(
  value: unknown
): PublicationStateTransitionAction {
  const action = getString(value).toLowerCase();
  if (
    action === "pause" ||
    action === "resume" ||
    action === "move_to_trash" ||
    action === "restore_from_trash"
  ) {
    return action;
  }
  throw new HttpsError("invalid-argument", "Accion de estado invalida.");
}

export function resolvePayerEmail(
  request: CallableRequest<unknown>,
  fallback = ""
): string {
  const emailFromToken = getString(
    (request.auth?.token as UnknownRecord | undefined)?.email
  );
  if (emailFromToken) return emailFromToken;
  return getString(fallback);
}

export function toIsoFromTimestamp(value: unknown): string | null {
  if (value && typeof (value as { toDate?: unknown }).toDate === "function") {
    return (
      ((value as admin.firestore.Timestamp).toDate() || new Date()).toISOString()
    );
  }
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string" && value.trim()) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }
  return null;
}

export function parseOptionalDateString(
  value: unknown,
  fieldName: string
): admin.firestore.Timestamp | null {
  const raw = getString(value);
  if (!raw) return null;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    throw new HttpsError("invalid-argument", `${fieldName} invalido`);
  }
  return admin.firestore.Timestamp.fromDate(parsed);
}

export function buildPublishedRetryResult(
  publicUrl?: string,
  message?: string
): RetryPaidPublicationResult {
  return {
    sessionStatus: "published",
    publicUrl,
    ...(message ? { message } : {}),
  };
}

export function buildAwaitingRetryResult(
  message?: string
): RetryPaidPublicationResult {
  return {
    sessionStatus: "awaiting_retry",
    ...(message ? { message } : {}),
  };
}
