import { randomUUID, createHmac, timingSafeEqual } from "crypto";
import type { Request, Response } from "express";
import * as admin from "firebase-admin";
import { getStorage } from "firebase-admin/storage";
import * as logger from "firebase-functions/logger";
import { type CallableRequest, HttpsError } from "firebase-functions/v2/https";
import { requireAuth, requireSuperAdmin } from "../auth/adminAuth";
import { normalizeRsvpConfig, type RSVPConfig as ModalConfig } from "../rsvp/config";
import { generarHTMLDesdeSecciones } from "../utils/generarHTMLDesdeSecciones";
import {
  type PublicSlugAvailabilityReason,
  normalizePublicSlug,
  validatePublicSlug,
} from "../utils/publicSlug";
import {
  PUBLICATION_VIGENCY_MONTHS,
  PUBLICATION_LIFECYCLE_STATES,
  PUBLICATION_PUBLIC_STATES,
  PUBLICATION_TRASH_RETENTION_DAYS,
  addMonthsPreservingDateTimeUTC,
  computeTrashPurgeAt,
  computePublicationExpirationDate,
  computePublicationExpirationTimestamp,
  normalizePublicationPublicState,
  resolvePublicationPublicStateFromData,
  isPublicationExpiredByVigenciaDate,
  toDateFromTimestampLike,
} from "./publicationLifecycle";
import {
  getMercadoPagoPaymentClient,
  getMercadoPagoPreferenceClient,
  getMercadoPagoPublicKey,
  getMercadoPagoWebhookSecret,
  getMercadoPagoWebhookUrl,
} from "./mercadoPagoClient";

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    storageBucket: "reservaeldia-7a440.firebasestorage.app",
  });
}

const db = admin.firestore();
const bucket = getStorage().bucket();

const CONFIG_DOC_PATH = "app_config/publicationPayments";
const CHECKOUT_SESSIONS_COLLECTION = "publication_checkout_sessions";
const SLUG_RESERVATIONS_COLLECTION = "public_slug_reservations";
const DISCOUNT_CODES_COLLECTION = "publication_discount_codes";
const DISCOUNT_USAGE_COLLECTION = "publication_discount_code_usage";
const PUBLICADAS_COLLECTION = "publicadas";
const PUBLICADAS_HISTORIAL_COLLECTION = "publicadas_historial";
const BORRADORES_COLLECTION = "borradores";
const HISTORY_SCAN_PAGE_SIZE = 250;

const FINALIZATION_REASON = Object.freeze({
  EXPIRED_CHECKOUT_UPDATE: "expired-before-update-checkout",
  EXPIRED_SLUG_AVAILABILITY: "expired-slug-availability-check",
  EXPIRED_RSVP_REQUEST: "expired-rsvp-request",
  SCHEDULED_EXPIRATION: "scheduled-expiration",
  EXPIRED_BEFORE_UPDATE_PUBLISH: "expired-before-update-publish",
});

const SESSION_TERMINAL_STATES = new Set<CheckoutSessionStatus>([
  "published",
  "payment_rejected",
  "approved_slug_conflict",
  "expired",
]);

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

type SlugReservationStatus = "active" | "consumed" | "released" | "expired";

type PublicationPaymentConfig = {
  enabled: boolean;
  currency: "ARS";
  publishAmountArs: number;
  updateAmountArs: number;
  slugReservationTtlMinutes: number;
  enforcePayment: boolean;
};

type CheckoutSessionDoc = {
  uid: string;
  draftSlug: string;
  operation: CheckoutOperation;
  publicSlug: string;
  amountBaseArs: number;
  amountArs: number;
  discountAmountArs: number;
  discountCode: string | null;
  discountDescription?: string | null;
  currency: "ARS";
  status: CheckoutSessionStatus;
  expiresAt: admin.firestore.Timestamp;
  mpPaymentId?: string;
  mpPreferenceId?: string;
  mpStatus?: string;
  mpStatusDetail?: string;
  publicUrl?: string;
  receipt?: Record<string, unknown>;
  lastError?: string;
  createdAt: admin.firestore.FieldValue | admin.firestore.Timestamp;
  updatedAt: admin.firestore.FieldValue | admin.firestore.Timestamp;
};

type SlugReservationDoc = {
  slug: string;
  uid: string;
  draftSlug: string;
  sessionId: string;
  status: SlugReservationStatus;
  expiresAt: admin.firestore.Timestamp;
  createdAt: admin.firestore.FieldValue | admin.firestore.Timestamp;
  updatedAt: admin.firestore.FieldValue | admin.firestore.Timestamp;
};

type PublishDraftParams = {
  draftSlug: string;
  publicSlug: string;
  uid: string;
  operation: CheckoutOperation;
  paymentSessionId: string;
};

type PublishDraftResult = {
  publicSlug: string;
  publicUrl: string;
};

type CheckoutStatusResponse = {
  sessionStatus: CheckoutSessionStatus;
  publicUrl?: string;
  receipt?: Record<string, unknown>;
  errorMessage?: string;
};

type CheckoutPaymentResult = CheckoutStatusResponse & {
  paymentId: string;
  message?: string;
};

type DiscountDoc = {
  active?: boolean;
  code?: string;
  description?: string;
  type?: "percentage" | "fixed";
  value?: number;
  appliesTo?: "new" | "update" | "both";
  startsAt?: admin.firestore.Timestamp;
  endsAt?: admin.firestore.Timestamp;
  maxRedemptions?: number;
  redemptionsCount?: number;
  createdAt?: admin.firestore.Timestamp;
  updatedAt?: admin.firestore.Timestamp;
};

type DiscountResolution = {
  amountBaseArs: number;
  amountArs: number;
  discountAmountArs: number;
  discountCode: string | null;
  discountDescription: string | null;
};

type DiscountType = "percentage" | "fixed";
type DiscountAppliesTo = "new" | "update" | "both";

type DiscountCodeAdminItem = {
  code: string;
  active: boolean;
  type: DiscountType;
  value: number;
  appliesTo: DiscountAppliesTo;
  description: string | null;
  startsAt: string | null;
  endsAt: string | null;
  maxRedemptions: number | null;
  redemptionsCount: number;
  createdAt: string | null;
  updatedAt: string | null;
};

type DiscountUsageItem = {
  sessionId: string;
  code: string;
  uid: string;
  operation: CheckoutOperation;
  draftSlug: string;
  publicSlug: string;
  amountBaseArs: number;
  discountAmountArs: number;
  amountArs: number;
  paymentId: string;
  createdAt: string | null;
  approvedAt: string | null;
};

type PublicationSummary = {
  totalResponses: number;
  confirmedResponses: number;
  declinedResponses: number;
  confirmedGuests: number;
  vegetarianCount: number;
  veganCount: number;
  childrenCount: number;
  dietaryRestrictionsCount: number;
  transportCount: number;
};

type PublicationFinalizationResult = {
  slug: string;
  historyId: string | null;
  draftSlug: string | null;
  finalized: boolean;
  alreadyMissing: boolean;
};

export type PublicationStateTransitionAction =
  | "pause"
  | "resume"
  | "move_to_trash"
  | "restore_from_trash";

type PublicationStateTransitionResult = {
  slug: string;
  estado: string;
  publicadaAt: string;
  venceAt: string;
  pausadaAt: string | null;
  enPapeleraAt: string | null;
};

const DEFAULT_PAYMENT_CONFIG: PublicationPaymentConfig = {
  enabled: true,
  currency: "ARS",
  publishAmountArs: 29900,
  updateAmountArs: 1490,
  slugReservationTtlMinutes: 20,
  enforcePayment: true,
};

function serverTimestamp() {
  return admin.firestore.FieldValue.serverTimestamp();
}

function getString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function getPublicationRef(slug: string) {
  return db.collection(PUBLICADAS_COLLECTION).doc(slug);
}

function getPublicationHistoryRef(historyId: string) {
  return db.collection(PUBLICADAS_HISTORIAL_COLLECTION).doc(historyId);
}

function normalizeAttendanceMetric(value: unknown): "yes" | "no" | "unknown" {
  const raw = getString(value).toLowerCase();
  if (!raw) return "unknown";
  if (["yes", "si", "sí", "true", "1"].includes(raw)) return "yes";
  if (["no", "false", "0"].includes(raw)) return "no";
  return "unknown";
}

function normalizeBooleanMetric(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  const raw = getString(value).toLowerCase();
  if (!raw) return false;
  return ["yes", "si", "sí", "true", "1"].includes(raw);
}

function normalizePositiveIntMetric(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.round(parsed));
}

function normalizeMenuMetricId(value: unknown): string | null {
  const raw = getString(value).toLowerCase();
  if (!raw) return null;
  if (raw.includes("vegano") || raw === "vegan") return "vegan";
  if (raw.includes("vegetar")) return "vegetarian";
  if (raw.includes("tacc") || raw.includes("celia")) return "celiac";
  if (raw === "standard" || raw === "clasico" || raw === "clásico") return "standard";
  return raw;
}

function createEmptyPublicationSummary(): PublicationSummary {
  return {
    totalResponses: 0,
    confirmedResponses: 0,
    declinedResponses: 0,
    confirmedGuests: 0,
    vegetarianCount: 0,
    veganCount: 0,
    childrenCount: 0,
    dietaryRestrictionsCount: 0,
    transportCount: 0,
  };
}

function buildPublicationSummary(rows: Record<string, unknown>[]): PublicationSummary {
  const summary = createEmptyPublicationSummary();

  rows.forEach((row) => {
    summary.totalResponses += 1;

    const answers =
      row.answers && typeof row.answers === "object"
        ? (row.answers as Record<string, unknown>)
        : {};

    const metrics =
      row.metrics && typeof row.metrics === "object"
        ? (row.metrics as Record<string, unknown>)
        : {};

    const legacyAttendance =
      typeof row.confirma === "boolean"
        ? row.confirma
          ? "yes"
          : "no"
        : row.confirmado === true
          ? "yes"
          : row.confirmado === false
            ? "no"
            : row.asistencia;

    const attendance = normalizeAttendanceMetric(
      metrics.attendance ?? answers.attendance ?? legacyAttendance
    );

    if (attendance === "yes") summary.confirmedResponses += 1;
    if (attendance === "no") summary.declinedResponses += 1;

    const partySize = normalizePositiveIntMetric(
      answers.party_size ?? row.cantidad ?? row.invitados ?? row.asistentes
    );
    const confirmedGuests =
      normalizePositiveIntMetric(metrics.confirmedGuests) ||
      (attendance === "yes" ? (partySize || 1) : 0);
    summary.confirmedGuests += confirmedGuests;

    const menuType = normalizeMenuMetricId(metrics.menuTypeId ?? answers.menu_type ?? row.menu_type);
    if (menuType === "vegetarian") summary.vegetarianCount += 1;
    if (menuType === "vegan") summary.veganCount += 1;

    const childrenCount = normalizePositiveIntMetric(
      metrics.childrenCount ?? answers.children_count ?? row.children_count ?? row.ninos
    );
    summary.childrenCount += childrenCount;

    const hasDietaryRestrictions =
      typeof metrics.hasDietaryRestrictions === "boolean"
        ? metrics.hasDietaryRestrictions
        : Boolean(getString(answers.dietary_notes ?? row.dietary_notes ?? row.alergias));
    if (hasDietaryRestrictions) summary.dietaryRestrictionsCount += 1;

    const needsTransport =
      typeof metrics.needsTransport === "boolean"
        ? metrics.needsTransport
        : normalizeBooleanMetric(answers.needs_transport ?? row.needs_transport ?? row.transporte);
    if (needsTransport) summary.transportCount += 1;
  });

  return summary;
}

function inferDraftSlugFromPublicationData(
  slug: string,
  publicationData: Record<string, unknown>
): string {
  const preferred =
    getString(publicationData.borradorSlug) ||
    getString(publicationData.borradorId) ||
    getString(publicationData.slugOriginal) ||
    slug;

  return preferred || slug;
}

function extractDraftSlugCandidatesFromPublicationData(
  publicationData: Record<string, unknown>
): string[] {
  const candidates = [
    getString(publicationData.borradorSlug),
    getString(publicationData.borradorId),
    getString(publicationData.draftSlug),
    getString(publicationData.slugOriginal),
  ].filter(Boolean);

  return Array.from(new Set(candidates));
}

function getPublicationHistoryId(params: {
  slug: string;
  firstPublishedAt: Date;
}): string {
  const publishedMs = params.firstPublishedAt.getTime();
  return `${params.slug}__${publishedMs}`;
}

function getPublicationState(publicationData: Record<string, unknown>): string {
  const normalizedPublicState = resolvePublicationPublicStateFromData(publicationData);
  if (normalizedPublicState) return normalizedPublicState;

  const estado = getString(publicationData.estado).toLowerCase();
  if (
    estado === PUBLICATION_LIFECYCLE_STATES.FINALIZED ||
    estado === "finalizada"
  ) {
    return PUBLICATION_LIFECYCLE_STATES.FINALIZED;
  }
  if (estado) return estado;

  const lifecycle =
    publicationData.publicationLifecycle &&
    typeof publicationData.publicationLifecycle === "object"
      ? (publicationData.publicationLifecycle as Record<string, unknown>)
      : null;

  const lifecycleState = lifecycle ? getString(lifecycle.state).toLowerCase() : "";
  if (
    lifecycleState === PUBLICATION_LIFECYCLE_STATES.FINALIZED ||
    lifecycleState === "finalizada"
  ) {
    return PUBLICATION_LIFECYCLE_STATES.FINALIZED;
  }

  return lifecycleState;
}

export function isPublicationExpiredData(
  publicationData: Record<string, unknown>,
  now: Date = new Date()
): boolean {
  if (!publicationData || typeof publicationData !== "object") return false;

  const state = getPublicationState(publicationData);
  if (
    state === PUBLICATION_LIFECYCLE_STATES.FINALIZED ||
    state === "finalizada"
  ) {
    return true;
  }
  if (state === PUBLICATION_PUBLIC_STATES.TRASH) return false;

  const venceAtRaw = publicationData.venceAt ?? publicationData.vigenteHasta;
  if (isPublicationExpiredByVigenciaDate(venceAtRaw, now)) {
    return true;
  }

  const lifecycle =
    publicationData.publicationLifecycle &&
    typeof publicationData.publicationLifecycle === "object"
      ? (publicationData.publicationLifecycle as Record<string, unknown>)
      : null;

  if (isPublicationExpiredByVigenciaDate(lifecycle?.expiresAt, now)) {
    return true;
  }

  const publishedAt =
    toDateFromTimestampLike(publicationData.publicadaAt) ||
    toDateFromTimestampLike(publicationData.publicadaEn);
  if (!publishedAt) return false;

  const computedExpiration = computePublicationExpirationDate(publishedAt);
  return computedExpiration.getTime() <= now.getTime();
}

function normalizeDiscountCode(value: unknown): string {
  const raw = getString(value).toUpperCase();
  if (!raw) return "";
  return raw.replace(/[^A-Z0-9_-]/g, "");
}

function mapMercadoPagoConfigError(error: unknown): HttpsError {
  const message = error instanceof Error ? error.message : String(error || "");
  if (message.includes("Falta variable de entorno requerida")) {
    return new HttpsError(
      "failed-precondition",
      "Configuracion de pagos incompleta. Falta configurar Mercado Pago en backend."
    );
  }
  return new HttpsError("internal", "No se pudo inicializar Mercado Pago.");
}

function mapMercadoPagoPaymentError(error: unknown): HttpsError {
  const message = error instanceof Error ? error.message : String(error || "");

  if (message.includes("Falta variable de entorno requerida")) {
    return mapMercadoPagoConfigError(error);
  }

  const normalized = message.toLowerCase();
  if (normalized.includes("payment type")) {
    return new HttpsError("invalid-argument", "Selecciona un medio de pago para continuar.");
  }

  if (normalized.includes("token")) {
    return new HttpsError("invalid-argument", "Completa los datos del medio de pago.");
  }

  return new HttpsError("failed-precondition", "No se pudo procesar el pago. Intenta nuevamente.");
}

function extractPaymentMethodId(brickData: Record<string, unknown>): string {
  const fromSelected = brickData.selectedPaymentMethod;
  const selectedId =
    typeof fromSelected === "string"
      ? getString(fromSelected)
      : getString((fromSelected as Record<string, unknown> | undefined)?.id);

  return (
    getString(brickData.payment_method_id) ||
    getString(brickData.paymentMethodId) ||
    selectedId
  );
}

function isAccountMoneyPaymentMethod(paymentMethodId: string): boolean {
  return getString(paymentMethodId).toLowerCase() === "account_money";
}

function normalizeSessionId(value: unknown): string {
  const sessionId = getString(value);
  if (!sessionId) {
    throw new HttpsError("invalid-argument", "Falta sessionId");
  }
  return sessionId;
}

function normalizeDraftSlug(value: unknown): string {
  const draftSlug = getString(value);
  if (!draftSlug) {
    throw new HttpsError("invalid-argument", "Falta draftSlug");
  }
  return draftSlug;
}

function normalizeOperation(value: unknown): CheckoutOperation {
  if (value === "new" || value === "update") return value;
  throw new HttpsError("invalid-argument", "operation invalido");
}

function normalizePublicationStateTransitionAction(
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

function toSafeIsoDate(value: unknown): string {
  const date = value instanceof Date ? value : new Date();
  return date.toISOString();
}

function isExpiredAt(expiresAt: unknown): boolean {
  const now = Date.now();

  if (expiresAt && typeof (expiresAt as any).toMillis === "function") {
    return (expiresAt as admin.firestore.Timestamp).toMillis() <= now;
  }

  if (expiresAt instanceof Date) {
    return expiresAt.getTime() <= now;
  }

  return false;
}

function resolvePayerEmail(request: CallableRequest<unknown>, fallback = ""): string {
  const emailFromToken = getString((request.auth?.token as Record<string, unknown> | undefined)?.email);
  if (emailFromToken) return emailFromToken;
  return getString(fallback);
}

function getNumber(value: unknown, fallback = 0): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return numeric;
}

function getPublicationConfigFromData(data: Record<string, unknown>): PublicationPaymentConfig {
  const enabled = typeof data.enabled === "boolean" ? data.enabled : DEFAULT_PAYMENT_CONFIG.enabled;
  const currency = data.currency === "ARS" ? "ARS" : DEFAULT_PAYMENT_CONFIG.currency;
  const publishAmountArs = Number.isFinite(Number(data.publishAmountArs))
    ? Math.max(0, Math.round(Number(data.publishAmountArs)))
    : DEFAULT_PAYMENT_CONFIG.publishAmountArs;
  const updateAmountArs = Number.isFinite(Number(data.updateAmountArs))
    ? Math.max(0, Math.round(Number(data.updateAmountArs)))
    : DEFAULT_PAYMENT_CONFIG.updateAmountArs;
  const slugReservationTtlMinutes = Number.isFinite(Number(data.slugReservationTtlMinutes))
    ? Math.max(5, Math.round(Number(data.slugReservationTtlMinutes)))
    : DEFAULT_PAYMENT_CONFIG.slugReservationTtlMinutes;
  const enforcePayment = typeof data.enforcePayment === "boolean"
    ? data.enforcePayment
    : DEFAULT_PAYMENT_CONFIG.enforcePayment;

  return {
    enabled,
    currency,
    publishAmountArs,
    updateAmountArs,
    slugReservationTtlMinutes,
    enforcePayment,
  };
}

async function getPublicationPaymentConfig(): Promise<PublicationPaymentConfig> {
  const snap = await db.doc(CONFIG_DOC_PATH).get();
  if (!snap.exists) return DEFAULT_PAYMENT_CONFIG;

  const data = (snap.data() || {}) as Record<string, unknown>;
  return getPublicationConfigFromData(data);
}

function getReservationRef(slug: string) {
  return db.collection(SLUG_RESERVATIONS_COLLECTION).doc(slug);
}

function getSessionRef(sessionId: string) {
  return db.collection(CHECKOUT_SESSIONS_COLLECTION).doc(sessionId);
}

function getDiscountCodeRef(code: string) {
  return db.collection(DISCOUNT_CODES_COLLECTION).doc(code);
}

function getDiscountUsageRef(sessionId: string) {
  return db.collection(DISCOUNT_USAGE_COLLECTION).doc(sessionId);
}

function toIsoFromTimestamp(value: unknown): string | null {
  if (value && typeof (value as any).toDate === "function") {
    return ((value as admin.firestore.Timestamp).toDate() || new Date()).toISOString();
  }
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string" && value.trim()) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }
  return null;
}

function parseOptionalDateString(value: unknown, fieldName: string): admin.firestore.Timestamp | null {
  const raw = getString(value);
  if (!raw) return null;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    throw new HttpsError("invalid-argument", `${fieldName} invalido`);
  }
  return admin.firestore.Timestamp.fromDate(parsed);
}

function normalizeDiscountType(value: unknown): DiscountType {
  return value === "fixed" ? "fixed" : "percentage";
}

function normalizeDiscountAppliesTo(value: unknown): DiscountAppliesTo {
  if (value === "new" || value === "update" || value === "both") return value;
  return "both";
}

async function resolveDiscountForCheckout(params: {
  operation: CheckoutOperation;
  amountBaseArs: number;
  rawDiscountCode?: unknown;
}): Promise<DiscountResolution> {
  const { operation, amountBaseArs, rawDiscountCode } = params;
  const discountCode = normalizeDiscountCode(rawDiscountCode);

  if (!discountCode) {
    return {
      amountBaseArs,
      amountArs: amountBaseArs,
      discountAmountArs: 0,
      discountCode: null,
      discountDescription: null,
    };
  }

  const discountRef = db.collection(DISCOUNT_CODES_COLLECTION).doc(discountCode);
  const discountSnap = await discountRef.get();
  if (!discountSnap.exists) {
    throw new HttpsError("invalid-argument", "El codigo de descuento no es valido.");
  }

  const data = (discountSnap.data() || {}) as DiscountDoc;
  const active = data.active !== false;
  if (!active) {
    throw new HttpsError("failed-precondition", "Ese codigo de descuento no esta activo.");
  }

  const appliesTo = data.appliesTo || "both";
  if (appliesTo !== "both" && appliesTo !== operation) {
    throw new HttpsError(
      "failed-precondition",
      "Ese codigo no aplica para esta operacion."
    );
  }

  const nowMs = Date.now();
  if (data.startsAt && data.startsAt.toMillis() > nowMs) {
    throw new HttpsError("failed-precondition", "Ese codigo todavia no esta disponible.");
  }

  if (data.endsAt && data.endsAt.toMillis() < nowMs) {
    throw new HttpsError("failed-precondition", "Ese codigo de descuento ya expiro.");
  }

  const maxRedemptions = Math.max(0, Math.floor(getNumber(data.maxRedemptions, 0)));
  const redemptionsCount = Math.max(0, Math.floor(getNumber(data.redemptionsCount, 0)));
  if (maxRedemptions > 0 && redemptionsCount >= maxRedemptions) {
    throw new HttpsError("failed-precondition", "Ese codigo alcanzo su limite de usos.");
  }

  const discountType = data.type === "fixed" ? "fixed" : "percentage";
  const discountValue = getNumber(data.value, 0);
  if (discountValue <= 0) {
    throw new HttpsError(
      "failed-precondition",
      "El codigo de descuento no esta configurado correctamente."
    );
  }

  const rawDiscountAmount =
    discountType === "percentage"
      ? Math.round((amountBaseArs * discountValue) / 100)
      : Math.round(discountValue);

  const discountAmountArs = Math.max(0, Math.min(amountBaseArs, rawDiscountAmount));
  if (discountAmountArs <= 0) {
    throw new HttpsError(
      "failed-precondition",
      "El codigo no aplica descuento para este monto."
    );
  }

  return {
    amountBaseArs,
    amountArs: amountBaseArs - discountAmountArs,
    discountAmountArs,
    discountCode,
    discountDescription: getString(data.description) || null,
  };
}

async function recordDiscountUsageIfNeeded(params: {
  sessionId: string;
  sessionPayload: Record<string, unknown>;
  paymentId: string;
  approvedAt?: string;
}) {
  const { sessionId, sessionPayload, paymentId, approvedAt } = params;
  const discountCode = normalizeDiscountCode(sessionPayload.discountCode);
  if (!discountCode) return;

  const usageRef = getDiscountUsageRef(sessionId);
  const codeRef = getDiscountCodeRef(discountCode);

  const usagePayload = {
    sessionId,
    code: discountCode,
    uid: getString(sessionPayload.uid),
    operation: normalizeOperation(sessionPayload.operation),
    draftSlug: getString(sessionPayload.draftSlug),
    publicSlug: getString(sessionPayload.publicSlug),
    amountBaseArs: toAmount(sessionPayload.amountBaseArs, toAmount(sessionPayload.amountArs, 0)),
    discountAmountArs: toAmount(sessionPayload.discountAmountArs, 0),
    amountArs: toAmount(sessionPayload.amountArs, 0),
    paymentId: getString(paymentId),
    approvedAt: approvedAt || null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  await db.runTransaction(async (tx) => {
    const [usageSnap, codeSnap] = await Promise.all([tx.get(usageRef), tx.get(codeRef)]);
    if (usageSnap.exists) return;

    tx.set(usageRef, usagePayload, { merge: true });

    if (codeSnap.exists) {
      tx.set(
        codeRef,
        {
          redemptionsCount: admin.firestore.FieldValue.increment(1),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    }
  });
}

function mapDiscountCodeDocToItem(code: string, data: Record<string, unknown>): DiscountCodeAdminItem {
  return {
    code,
    active: data.active !== false,
    type: normalizeDiscountType(data.type),
    value: Math.max(0, Math.round(getNumber(data.value, 0))),
    appliesTo: normalizeDiscountAppliesTo(data.appliesTo),
    description: getString(data.description) || null,
    startsAt: toIsoFromTimestamp(data.startsAt),
    endsAt: toIsoFromTimestamp(data.endsAt),
    maxRedemptions: Number.isFinite(getNumber(data.maxRedemptions, Number.NaN))
      ? Math.max(0, Math.round(getNumber(data.maxRedemptions, 0)))
      : null,
    redemptionsCount: Math.max(0, Math.round(getNumber(data.redemptionsCount, 0))),
    createdAt: toIsoFromTimestamp(data.createdAt),
    updatedAt: toIsoFromTimestamp(data.updatedAt),
  };
}

function mapDiscountUsageDocToItem(data: Record<string, unknown>): DiscountUsageItem {
  const operationRaw = data.operation;
  const operation: CheckoutOperation =
    operationRaw === "new" || operationRaw === "update" ? operationRaw : "new";

  return {
    sessionId: getString(data.sessionId),
    code: normalizeDiscountCode(data.code),
    uid: getString(data.uid),
    operation,
    draftSlug: getString(data.draftSlug),
    publicSlug: getString(data.publicSlug),
    amountBaseArs: toAmount(data.amountBaseArs, toAmount(data.amountArs, 0)),
    discountAmountArs: toAmount(data.discountAmountArs, 0),
    amountArs: toAmount(data.amountArs, 0),
    paymentId: getString(data.paymentId),
    createdAt: toIsoFromTimestamp(data.createdAt),
    approvedAt: toIsoFromTimestamp(data.approvedAt),
  };
}

async function createMercadoPagoPreferenceForCheckout(params: {
  sessionId: string;
  operation: CheckoutOperation;
  publicSlug: string;
  amountArs: number;
  payerEmail: string;
}): Promise<string> {
  const { sessionId, operation, publicSlug, amountArs, payerEmail } = params;
  const preferenceClient = getMercadoPagoPreferenceClient();
  const safeAmount = Math.max(0, Math.round(amountArs));

  const preferenceBody = {
    external_reference: sessionId,
    notification_url: getMercadoPagoWebhookUrl(),
    metadata: {
      publication_session_id: sessionId,
      operation,
      public_slug: publicSlug,
    },
    items: [
      {
        id: `publication-${sessionId}`,
        title:
          operation === "new"
            ? `Publicacion de invitacion (${publicSlug})`
            : `Actualizacion de invitacion (${publicSlug})`,
        quantity: 1,
        currency_id: "ARS",
        unit_price: safeAmount,
      },
    ],
    payer: payerEmail ? { email: payerEmail } : undefined,
  };

  const preference = await preferenceClient.create({
    body: preferenceBody as any,
    requestOptions: {
      idempotencyKey: `publication-preference-${sessionId}`,
    },
  });

  const preferenceId = getString(preference?.id);
  if (!preferenceId) {
    throw new Error("Mercado Pago no devolvio preferenceId");
  }

  return preferenceId;
}

async function ensureDraftOwnership(uid: string, draftSlug: string) {
  const draftRef = db.collection(BORRADORES_COLLECTION).doc(draftSlug);
  const draftSnap = await draftRef.get();

  if (!draftSnap.exists) {
    throw new HttpsError("not-found", "No se encontro el borrador");
  }

  const data = draftSnap.data() as Record<string, unknown>;
  const ownerUid = getString(data?.userId);
  if (!ownerUid || ownerUid !== uid) {
    throw new HttpsError("permission-denied", "No tenes permisos sobre este borrador");
  }

  return {
    ref: draftRef,
    data,
  };
}

async function releaseReservationIfExpired(
  slug: string,
  reservationData: Record<string, unknown>
): Promise<void> {
  const status = getString(reservationData.status);
  if (status !== "active") return;
  const expiresAt = reservationData.expiresAt as admin.firestore.Timestamp;
  if (!isExpiredAt(expiresAt)) return;

  await getReservationRef(slug).set(
    {
      status: "expired",
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

type SlugAvailabilityResult = {
  isAvailable: boolean;
  reason: PublicSlugAvailabilityReason;
};

async function checkSlugAvailability(
  slug: string,
  uid: string,
  draftSlug: string
): Promise<SlugAvailabilityResult> {
  const publishedSnap = await getPublicationRef(slug).get();
  if (publishedSnap.exists) {
    const publishedData = (publishedSnap.data() || {}) as Record<string, unknown>;
    if (isPublicationExpiredData(publishedData)) {
      await finalizePublicationBySlug({
        slug,
        reason: FINALIZATION_REASON.EXPIRED_SLUG_AVAILABILITY,
      });
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

  const reservationRef = getReservationRef(slug);
  const reservationSnap = await reservationRef.get();
  if (!reservationSnap.exists) {
    return {
      isAvailable: true,
      reason: "ok",
    };
  }

  const reservationData = (reservationSnap.data() || {}) as Record<string, unknown>;
  const status = getString(reservationData.status);
  const reservationExpiresAt = reservationData.expiresAt as admin.firestore.Timestamp;
  const reservationExpired = status === "active" && isExpiredAt(reservationExpiresAt);

  if (reservationExpired) {
    await releaseReservationIfExpired(slug, reservationData);
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

  if (reservationUid === uid && reservationDraftSlug === draftSlug) {
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

async function reserveSlugForSession(params: {
  slug: string;
  uid: string;
  draftSlug: string;
  sessionId: string;
  expiresAt: admin.firestore.Timestamp;
}): Promise<void> {
  const { slug, uid, draftSlug, sessionId, expiresAt } = params;
  const reservationRef = getReservationRef(slug);
  const publicRef = getPublicationRef(slug);

  await db.runTransaction(async (tx) => {
    const [publishedSnap, reservationSnap] = await Promise.all([
      tx.get(publicRef),
      tx.get(reservationRef),
    ]);

    if (publishedSnap.exists) {
      throw new HttpsError("already-exists", "El enlace elegido ya esta publicado.");
    }

    if (reservationSnap.exists) {
      const data = (reservationSnap.data() || {}) as Record<string, unknown>;
      const status = getString(data.status);
      const reservationUid = getString(data.uid);
      const reservationDraftSlug = getString(data.draftSlug);
      const reservationExpiresAt = data.expiresAt as admin.firestore.Timestamp;
      const expired = isExpiredAt(reservationExpiresAt);

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

    const reservationPayload: SlugReservationDoc = {
      slug,
      uid,
      draftSlug,
      sessionId,
      status: "active",
      expiresAt,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    tx.set(reservationRef, reservationPayload, { merge: true });
  });
}

async function markReservationStatus(params: {
  slug: string;
  sessionId: string;
  nextStatus: SlugReservationStatus;
}): Promise<void> {
  const { slug, sessionId, nextStatus } = params;
  if (!slug) return;

  const reservationRef = getReservationRef(slug);
  const reservationSnap = await reservationRef.get();
  if (!reservationSnap.exists) return;

  const reservationData = (reservationSnap.data() || {}) as Record<string, unknown>;
  if (getString(reservationData.sessionId) !== sessionId) return;

  await reservationRef.set(
    {
      status: nextStatus,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

function safeTimestampFromDate(dateValue: Date): admin.firestore.Timestamp {
  return admin.firestore.Timestamp.fromDate(dateValue);
}

function computePublicationDates(params: {
  publicationData: Record<string, unknown>;
  publicationSnap: FirebaseFirestore.DocumentSnapshot;
  now: Date;
}) {
  const { publicationData, publicationSnap, now } = params;
  const lifecycle =
    publicationData.publicationLifecycle &&
    typeof publicationData.publicationLifecycle === "object"
      ? (publicationData.publicationLifecycle as Record<string, unknown>)
      : null;

  const firstPublishedAt =
    toDateFromTimestampLike(publicationData.publicadaAt) ||
    toDateFromTimestampLike(publicationData.publicadaEn) ||
    toDateFromTimestampLike(lifecycle?.firstPublishedAt) ||
    toDateFromTimestampLike(publicationSnap.createTime) ||
    now;

  const vigenteHasta =
    toDateFromTimestampLike(publicationData.venceAt) ||
    toDateFromTimestampLike(publicationData.vigenteHasta) ||
    toDateFromTimestampLike(lifecycle?.expiresAt) ||
    computePublicationExpirationDate(firstPublishedAt);

  const lastPublishedAt =
    toDateFromTimestampLike(publicationData.ultimaPublicacionEn) ||
    toDateFromTimestampLike(lifecycle?.lastPublishedAt) ||
    toDateFromTimestampLike(publicationData.publicadaEn) ||
    firstPublishedAt;

  return {
    firstPublishedAt,
    vigenteHasta,
    lastPublishedAt,
  };
}

function buildHistoryPayload(params: {
  slug: string;
  publicationData: Record<string, unknown>;
  draftSlug: string;
  summary: PublicationSummary;
  firstPublishedAt: Date;
  vigenteHasta: Date;
  lastPublishedAt: Date;
  finalizedAt: Date;
  reason: string;
}): Record<string, unknown> {
  const {
    slug,
    publicationData,
    draftSlug,
    summary,
    firstPublishedAt,
    vigenteHasta,
    lastPublishedAt,
    finalizedAt,
    reason,
  } = params;

  return {
    slug,
    userId: getString(publicationData.userId) || null,
    nombre: publicationData.nombre || slug,
    tipo: publicationData.tipo || null,
    portada: publicationData.portada || null,
    plantillaId: publicationData.plantillaId || null,
    borradorSlug: draftSlug,
    slugOriginal: getString(publicationData.slugOriginal) || draftSlug,
    estado: PUBLICATION_LIFECYCLE_STATES.FINALIZED,
    publicadaAt: safeTimestampFromDate(firstPublishedAt),
    publicadaEn: safeTimestampFromDate(firstPublishedAt),
    venceAt: safeTimestampFromDate(vigenteHasta),
    vigenteHasta: safeTimestampFromDate(vigenteHasta),
    ultimaPublicacionEn: safeTimestampFromDate(lastPublishedAt),
    finalizadaEn: safeTimestampFromDate(finalizedAt),
    motivoFinalizacion: reason,
    urlPublica: null,
    rsvp: publicationData.rsvp || null,
    rsvpSummary: summary,
    totalRsvpsHistorico: summary.totalResponses,
    htmlPublicadoEliminado: true,
    sourceCollection: PUBLICADAS_COLLECTION,
    sourceSlug: slug,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
}

async function clearDraftActivePublicationState(params: {
  draftSlug: string;
  firstPublishedAt: Date;
  vigenteHasta: Date;
  lastPublishedAt: Date;
  finalizedAt: Date;
  reason: string;
}): Promise<void> {
  const {
    draftSlug,
    firstPublishedAt,
    vigenteHasta,
    lastPublishedAt,
    finalizedAt,
    reason,
  } = params;

  await db.collection(BORRADORES_COLLECTION).doc(draftSlug).set(
    {
      slugPublico: null,
      publicationLifecycle: {
        state: PUBLICATION_LIFECYCLE_STATES.FINALIZED,
        activePublicSlug: null,
        firstPublishedAt: safeTimestampFromDate(firstPublishedAt),
        expiresAt: safeTimestampFromDate(vigenteHasta),
        lastPublishedAt: safeTimestampFromDate(lastPublishedAt),
        finalizedAt: safeTimestampFromDate(finalizedAt),
      },
      publicationFinalizedAt: safeTimestampFromDate(finalizedAt),
      publicationFinalizationReason: reason,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

async function releaseSlugReservationAfterFinalization(
  slug: string,
  reason: string
): Promise<void> {
  await getReservationRef(slug).set(
    {
      status: "released",
      updatedAt: serverTimestamp(),
      releaseReason: reason,
    },
    { merge: true }
  );
}

async function finalizePublicationSnapshot(params: {
  slug: string;
  publicationSnap: FirebaseFirestore.DocumentSnapshot;
  reason: string;
}): Promise<PublicationFinalizationResult> {
  const { slug, publicationSnap, reason } = params;
  if (!publicationSnap.exists) {
    return {
      slug,
      historyId: null,
      draftSlug: null,
      finalized: false,
      alreadyMissing: true,
    };
  }

  const publicationData = (publicationSnap.data() || {}) as Record<string, unknown>;
  const publicationRef = publicationSnap.ref;
  const now = new Date();
  const dates = computePublicationDates({
    publicationData,
    publicationSnap,
    now,
  });
  const draftSlug = inferDraftSlugFromPublicationData(slug, publicationData);
  const historyId = getPublicationHistoryId({
    slug,
    firstPublishedAt: dates.firstPublishedAt,
  });

  const rsvpSnap = await publicationRef.collection("rsvps").get();
  const summary = buildPublicationSummary(
    rsvpSnap.docs.map((item) => (item.data() || {}) as Record<string, unknown>)
  );

  await getPublicationHistoryRef(historyId).set(
    buildHistoryPayload({
      slug,
      publicationData,
      draftSlug,
      summary,
      firstPublishedAt: dates.firstPublishedAt,
      vigenteHasta: dates.vigenteHasta,
      lastPublishedAt: dates.lastPublishedAt,
      finalizedAt: now,
      reason,
    }),
    { merge: true }
  );

  try {
    await bucket.deleteFiles({ prefix: `publicadas/${slug}/` });
  } catch (error) {
    logger.warn("No se pudieron borrar archivos publicados durante finalizacion", {
      slug,
      reason,
      error: error instanceof Error ? error.message : String(error || ""),
    });
  }

  try {
    await db.recursiveDelete(publicationRef);
  } catch (error) {
    logger.warn("No se pudo eliminar la publicacion activa durante finalizacion", {
      slug,
      reason,
      error: error instanceof Error ? error.message : String(error || ""),
    });
  }

  await releaseSlugReservationAfterFinalization(slug, reason);

  if (draftSlug) {
    await clearDraftActivePublicationState({
      draftSlug,
      firstPublishedAt: dates.firstPublishedAt,
      vigenteHasta: dates.vigenteHasta,
      lastPublishedAt: dates.lastPublishedAt,
      finalizedAt: now,
      reason,
    });
  }

  logger.info("Publicacion finalizada", {
    slug,
    draftSlug,
    historyId,
    reason,
    totalResponses: summary.totalResponses,
  });

  return {
    slug,
    historyId,
    draftSlug,
    finalized: true,
    alreadyMissing: false,
  };
}

export async function finalizePublicationBySlug(params: {
  slug: string;
  reason: string;
}): Promise<PublicationFinalizationResult> {
  const normalizedSlug = normalizePublicSlug(params.slug);
  if (!normalizedSlug) {
    throw new HttpsError("invalid-argument", "Slug de publicacion invalido");
  }

  const publicationSnap = await getPublicationRef(normalizedSlug).get();
  return finalizePublicationSnapshot({
    slug: normalizedSlug,
    publicationSnap,
    reason: getString(params.reason) || FINALIZATION_REASON.SCHEDULED_EXPIRATION,
  });
}

export async function finalizeExpiredPublicationsHandler(params?: {
  batchSize?: number;
  reason?: string;
}): Promise<{
  scanned: number;
  finalized: number;
  missing: number;
  failed: number;
  reason: string;
}> {
  const batchSizeRaw = Number(params?.batchSize);
  const batchSize = Number.isFinite(batchSizeRaw)
    ? Math.max(1, Math.min(300, Math.round(batchSizeRaw)))
    : 100;

  const reason = getString(params?.reason) || FINALIZATION_REASON.SCHEDULED_EXPIRATION;
  const now = new Date();
  const nowTimestamp = admin.firestore.Timestamp.fromDate(now);
  const legacyPublishedAtCutoff = addMonthsPreservingDateTimeUTC(
    now,
    -PUBLICATION_VIGENCY_MONTHS
  );
  const legacyPublishedAtCutoffTimestamp = admin.firestore.Timestamp.fromDate(
    legacyPublishedAtCutoff
  );

  const [expiredByVigenciaSnap, expiredByLegacyPublishedAtSnap] = await Promise.all([
    db
      .collection(PUBLICADAS_COLLECTION)
      .where("vigenteHasta", "<=", nowTimestamp)
      .limit(batchSize)
      .get(),
    db
      .collection(PUBLICADAS_COLLECTION)
      .where("publicadaEn", "<=", legacyPublishedAtCutoffTimestamp)
      .limit(batchSize)
      .get(),
  ]);

  const candidateMap = new Map<string, FirebaseFirestore.QueryDocumentSnapshot>();
  for (const docItem of expiredByVigenciaSnap.docs) {
    candidateMap.set(docItem.id, docItem);
  }
  for (const docItem of expiredByLegacyPublishedAtSnap.docs) {
    if (!candidateMap.has(docItem.id)) {
      candidateMap.set(docItem.id, docItem);
    }
  }

  const candidateDocs = Array.from(candidateMap.values()).slice(0, batchSize);

  let finalized = 0;
  let missing = 0;
  let failed = 0;

  for (const docItem of candidateDocs) {
    try {
      const publicationData = (docItem.data() || {}) as Record<string, unknown>;
      if (!isPublicationExpiredData(publicationData, now)) {
        continue;
      }

      const result = await finalizePublicationSnapshot({
        slug: docItem.id,
        publicationSnap: docItem,
        reason,
      });

      if (result.finalized) {
        finalized += 1;
      } else if (result.alreadyMissing) {
        missing += 1;
      }
    } catch (error) {
      failed += 1;
      logger.error("Error finalizando publicacion vencida", {
        slug: docItem.id,
        reason,
        error: error instanceof Error ? error.message : String(error || ""),
      });
    }
  }

  return {
    scanned: candidateDocs.length,
    finalized,
    missing,
    failed,
    reason,
  };
}

function toIsoOrNull(dateValue: Date | null): string | null {
  return dateValue ? dateValue.toISOString() : null;
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

export async function transitionPublishedInvitationStateHandler(
  request: CallableRequest<{
    slug: string;
    action: PublicationStateTransitionAction;
  }>
): Promise<PublicationStateTransitionResult> {
  const uid = requireAuth(request);
  const slug = normalizePublicSlug(request.data?.slug);
  if (!slug) {
    throw new HttpsError("invalid-argument", "Slug invalido.");
  }

  const action = normalizePublicationStateTransitionAction(request.data?.action);
  const publicationRef = getPublicationRef(slug);

  let transitionResult: PublicationStateTransitionResult | null = null;
  let linkedDraftSlug = "";
  let firstPublishedAtForDraft: Date | null = null;
  let venceAtForDraft: Date | null = null;

  await db.runTransaction(async (tx) => {
    const publicationSnap = await tx.get(publicationRef);
    if (!publicationSnap.exists) {
      throw new HttpsError("not-found", "Invitacion publicada no encontrada.");
    }

    const publicationData = (publicationSnap.data() || {}) as Record<string, unknown>;
    const ownerUid = getString(publicationData.userId);
    if (!ownerUid || ownerUid !== uid) {
      throw new HttpsError("permission-denied", "No tienes permisos sobre esta publicacion.");
    }

    const now = new Date();
    const firstPublishedAt =
      toDateFromTimestampLike(publicationData.publicadaAt) ||
      toDateFromTimestampLike(publicationData.publicadaEn) ||
      toDateFromTimestampLike(publicationSnap.createTime) ||
      now;
    const venceAt =
      toDateFromTimestampLike(publicationData.venceAt) ||
      toDateFromTimestampLike(publicationData.vigenteHasta) ||
      computePublicationExpirationDate(firstPublishedAt);
    const currentState = getPublicationState(publicationData);

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
      venceAt,
    });

    const publishedTimestamp = safeTimestampFromDate(firstPublishedAt);
    const expiresTimestamp = safeTimestampFromDate(venceAt);
    const pausedTimestamp = transitionTarget.pausedAt
      ? safeTimestampFromDate(transitionTarget.pausedAt)
      : null;
    const trashedTimestamp = transitionTarget.enPapeleraAt
      ? safeTimestampFromDate(transitionTarget.enPapeleraAt)
      : null;

    tx.set(
      publicationRef,
      {
        estado: transitionTarget.nextState,
        publicadaAt: publishedTimestamp,
        publicadaEn: publishedTimestamp,
        venceAt: expiresTimestamp,
        vigenteHasta: expiresTimestamp,
        pausadaAt: pausedTimestamp,
        enPapeleraAt: trashedTimestamp,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    linkedDraftSlug = inferDraftSlugFromPublicationData(slug, publicationData);
    firstPublishedAtForDraft = firstPublishedAt;
    venceAtForDraft = venceAt;

    transitionResult = {
      slug,
      estado: transitionTarget.nextState,
      publicadaAt: firstPublishedAt.toISOString(),
      venceAt: venceAt.toISOString(),
      pausadaAt: toIsoOrNull(transitionTarget.pausedAt),
      enPapeleraAt: toIsoOrNull(transitionTarget.enPapeleraAt),
    };
  });

  if (linkedDraftSlug && firstPublishedAtForDraft && venceAtForDraft) {
    const draftRef = db.collection(BORRADORES_COLLECTION).doc(linkedDraftSlug);
    const draftSnap = await draftRef.get();
    if (draftSnap.exists) {
      await draftRef.set(
        {
          slugPublico: slug,
          publicationLifecycle: {
            state: PUBLICATION_LIFECYCLE_STATES.PUBLISHED,
            activePublicSlug: slug,
            firstPublishedAt: safeTimestampFromDate(firstPublishedAtForDraft),
            expiresAt: safeTimestampFromDate(venceAtForDraft),
            finalizedAt: null,
          },
          publicationFinalizedAt: null,
          publicationFinalizationReason: null,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    }
  }

  if (!transitionResult) {
    throw new HttpsError("internal", "No se pudo actualizar el estado de la invitacion.");
  }

  return transitionResult;
}

function isTrashedPublicationDueForPurge(params: {
  publicationData: Record<string, unknown>;
  publicationSnap: FirebaseFirestore.DocumentSnapshot;
  now: Date;
}): boolean {
  const { publicationData, publicationSnap, now } = params;
  const state = getPublicationState(publicationData);
  if (state !== PUBLICATION_PUBLIC_STATES.TRASH) return false;

  const publishedAt =
    toDateFromTimestampLike(publicationData.publicadaAt) ||
    toDateFromTimestampLike(publicationData.publicadaEn) ||
    toDateFromTimestampLike(publicationSnap.createTime) ||
    now;
  const venceAt =
    toDateFromTimestampLike(publicationData.venceAt) ||
    toDateFromTimestampLike(publicationData.vigenteHasta) ||
    computePublicationExpirationDate(publishedAt);
  const purgeAt = computeTrashPurgeAt(venceAt);

  return purgeAt.getTime() <= now.getTime();
}

async function collectDraftCandidatesForPublicationPurge(params: {
  slug: string;
  publicationData: Record<string, unknown>;
}): Promise<Set<string>> {
  const { slug, publicationData } = params;
  const draftCandidates = new Set<string>();

  extractDraftSlugCandidatesFromPublicationData(publicationData).forEach((candidate) => {
    draftCandidates.add(candidate);
  });

  const linkedDraftsSnap = await db
    .collection(BORRADORES_COLLECTION)
    .where("slugPublico", "==", slug)
    .limit(60)
    .get();

  linkedDraftsSnap.docs.forEach((draftDoc) => {
    draftCandidates.add(draftDoc.id);
  });

  return draftCandidates;
}

async function purgeSingleTrashedPublication(params: {
  slug: string;
  publicationSnap: FirebaseFirestore.QueryDocumentSnapshot;
}): Promise<void> {
  const { slug, publicationSnap } = params;
  const publicationData = (publicationSnap.data() || {}) as Record<string, unknown>;
  const draftCandidates = await collectDraftCandidatesForPublicationPurge({
    slug,
    publicationData,
  });

  try {
    await bucket.deleteFiles({ prefix: `publicadas/${slug}/` });
  } catch (error) {
    logger.warn("No se pudieron borrar archivos publicados durante purga de papelera", {
      slug,
      error: error instanceof Error ? error.message : String(error || ""),
    });
  }

  await db.recursiveDelete(publicationSnap.ref);

  for (const draftSlugCandidate of draftCandidates) {
    await clearDraftPublicationLinksAsDraft({
      draftSlug: draftSlugCandidate,
    });
  }

  try {
    await getReservationRef(slug).delete();
  } catch (error) {
    logger.warn("No se pudo borrar reserva de slug durante purga de papelera", {
      slug,
      error: error instanceof Error ? error.message : String(error || ""),
    });
  }
}

export async function purgeTrashedPublicationsHandler(params?: {
  batchSize?: number;
}): Promise<{
  scanned: number;
  purged: number;
  skippedNotDue: number;
  failed: number;
  retentionDays: number;
}> {
  const batchSizeRaw = Number(params?.batchSize);
  const batchSize = Number.isFinite(batchSizeRaw)
    ? Math.max(1, Math.min(400, Math.round(batchSizeRaw)))
    : 150;
  const now = new Date();

  const trashedSnap = await db
    .collection(PUBLICADAS_COLLECTION)
    .where("estado", "==", PUBLICATION_PUBLIC_STATES.TRASH)
    .limit(batchSize)
    .get();

  let purged = 0;
  let skippedNotDue = 0;
  let failed = 0;

  for (const docItem of trashedSnap.docs) {
    try {
      const data = (docItem.data() || {}) as Record<string, unknown>;
      const isDue = isTrashedPublicationDueForPurge({
        publicationData: data,
        publicationSnap: docItem,
        now,
      });

      if (!isDue) {
        skippedNotDue += 1;
        continue;
      }

      await purgeSingleTrashedPublication({
        slug: docItem.id,
        publicationSnap: docItem,
      });
      purged += 1;
    } catch (error) {
      failed += 1;
      logger.error("Error purgando invitacion en papelera", {
        slug: docItem.id,
        error: error instanceof Error ? error.message : String(error || ""),
      });
    }
  }

  return {
    scanned: trashedSnap.size,
    purged,
    skippedNotDue,
    failed,
    retentionDays: PUBLICATION_TRASH_RETENTION_DAYS,
  };
}

type HardDeleteLegacyPublicationResult = {
  slug: string;
  deletedActivePublication: boolean;
  deletedHistoryDocs: number;
  cleanedDrafts: number;
  removedReservation: boolean;
  deletedStoragePrefix: boolean;
};

async function collectUserHistoryDocsForSlug(params: {
  uid: string;
  slug: string;
}): Promise<FirebaseFirestore.QueryDocumentSnapshot[]> {
  const { uid, slug } = params;
  const historyIdPrefix = `${slug}__`;
  const matchedDocs: FirebaseFirestore.QueryDocumentSnapshot[] = [];
  const seenPaths = new Set<string>();
  let cursor: FirebaseFirestore.QueryDocumentSnapshot | null = null;

  while (true) {
    let historyQuery = db
      .collection(PUBLICADAS_HISTORIAL_COLLECTION)
      .where("userId", "==", uid)
      .limit(HISTORY_SCAN_PAGE_SIZE);

    if (cursor) {
      historyQuery = historyQuery.startAfter(cursor);
    }

    const historySnap = await historyQuery.get();
    if (historySnap.empty) break;

    for (const historyDoc of historySnap.docs) {
      const historyData = (historyDoc.data() || {}) as Record<string, unknown>;
      const historySlug = getString(historyData.slug);
      const sourceSlug = getString(historyData.sourceSlug);
      const matches =
        historyDoc.id.startsWith(historyIdPrefix) ||
        historySlug === slug ||
        sourceSlug === slug;

      if (!matches) continue;
      if (seenPaths.has(historyDoc.ref.path)) continue;

      seenPaths.add(historyDoc.ref.path);
      matchedDocs.push(historyDoc);
    }

    cursor = historySnap.docs[historySnap.docs.length - 1] || null;
    if (historySnap.size < HISTORY_SCAN_PAGE_SIZE) break;
  }

  return matchedDocs;
}

async function deleteDocsInBatches(
  docs: FirebaseFirestore.QueryDocumentSnapshot[]
): Promise<number> {
  if (!docs.length) return 0;

  let deleted = 0;
  for (let offset = 0; offset < docs.length; offset += 400) {
    const chunk = docs.slice(offset, offset + 400);
    const batch = db.batch();
    chunk.forEach((docItem) => {
      batch.delete(docItem.ref);
    });
    await batch.commit();
    deleted += chunk.length;
  }

  return deleted;
}

async function clearDraftPublicationLinksAsDraft(params: {
  draftSlug: string;
  uid?: string | null;
}): Promise<boolean> {
  const draftSlug = getString(params.draftSlug);
  const uid = getString(params.uid);
  if (!draftSlug) return false;

  const draftRef = db.collection(BORRADORES_COLLECTION).doc(draftSlug);
  const draftSnap = await draftRef.get();
  if (!draftSnap.exists) return false;

  const draftData = (draftSnap.data() || {}) as Record<string, unknown>;
  const ownerUid = getString(draftData.userId);
  if (uid && (!ownerUid || ownerUid !== uid)) return false;

  await draftRef.set(
    {
      slugPublico: null,
      publicationLifecycle: {
        state: PUBLICATION_LIFECYCLE_STATES.DRAFT,
        activePublicSlug: null,
        firstPublishedAt: null,
        expiresAt: null,
        lastPublishedAt: null,
        finalizedAt: null,
      },
      ultimaPublicacion: null,
      ultimaOperacionPublicacion: null,
      publicationFinalizedAt: null,
      publicationFinalizationReason: null,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );

  return true;
}

export async function hardDeleteLegacyPublicationHandler(
  request: CallableRequest<{
    slug: string;
  }>
): Promise<HardDeleteLegacyPublicationResult> {
  const uid = requireAuth(request);
  const slug = normalizePublicSlug(request.data?.slug);
  if (!slug) {
    throw new HttpsError("invalid-argument", "Slug invalido.");
  }

  const publicationRef = getPublicationRef(slug);
  const publicationSnap = await publicationRef.get();
  const publicationData = publicationSnap.exists
    ? ((publicationSnap.data() || {}) as Record<string, unknown>)
    : null;

  const draftCandidates = new Set<string>();
  let hasOwnership = false;

  if (publicationData) {
    const publicationOwnerUid = getString(publicationData.userId);
    if (!publicationOwnerUid || publicationOwnerUid !== uid) {
      throw new HttpsError("permission-denied", "No tienes permisos sobre esta publicacion.");
    }

    hasOwnership = true;
    extractDraftSlugCandidatesFromPublicationData(publicationData).forEach((candidate) =>
      draftCandidates.add(candidate)
    );
  }

  const historyDocs = await collectUserHistoryDocsForSlug({ uid, slug });
  if (historyDocs.length > 0) {
    hasOwnership = true;
    historyDocs.forEach((historyDoc) => {
      const historyData = (historyDoc.data() || {}) as Record<string, unknown>;
      extractDraftSlugCandidatesFromPublicationData(historyData).forEach((candidate) =>
        draftCandidates.add(candidate)
      );
    });
  }

  const linkedDraftsSnap = await db
    .collection(BORRADORES_COLLECTION)
    .where("userId", "==", uid)
    .where("slugPublico", "==", slug)
    .limit(25)
    .get();

  if (!linkedDraftsSnap.empty) {
    hasOwnership = true;
    linkedDraftsSnap.docs.forEach((draftDoc) => {
      draftCandidates.add(draftDoc.id);
    });
  }

  if (!hasOwnership) {
    throw new HttpsError("not-found", "No se encontro una publicacion legacy para eliminar.");
  }

  let deletedStoragePrefix = true;
  try {
    await bucket.deleteFiles({ prefix: `publicadas/${slug}/` });
  } catch (error) {
    deletedStoragePrefix = false;
    logger.warn("No se pudieron borrar archivos publicados en hard-delete legacy", {
      slug,
      uid,
      error: error instanceof Error ? error.message : String(error || ""),
    });
  }

  let deletedActivePublication = false;
  if (publicationSnap.exists) {
    await db.recursiveDelete(publicationRef);
    deletedActivePublication = true;
  }

  const deletedHistoryDocs = await deleteDocsInBatches(historyDocs);

  let cleanedDrafts = 0;
  for (const draftSlugCandidate of draftCandidates) {
    const cleaned = await clearDraftPublicationLinksAsDraft({
      draftSlug: draftSlugCandidate,
      uid,
    });
    if (cleaned) cleanedDrafts += 1;
  }

  const reservationRef = getReservationRef(slug);
  const reservationSnap = await reservationRef.get();
  let removedReservation = false;
  if (reservationSnap.exists) {
    await reservationRef.delete();
    removedReservation = true;
  }

  logger.info("Hard-delete legacy publication completado", {
    slug,
    uid,
    deletedActivePublication,
    deletedHistoryDocs,
    cleanedDrafts,
    removedReservation,
    deletedStoragePrefix,
  });

  return {
    slug,
    deletedActivePublication,
    deletedHistoryDocs,
    cleanedDrafts,
    removedReservation,
    deletedStoragePrefix,
  };
}

async function resolveExistingPublicSlug(draftSlug: string): Promise<string | null> {
  const draftSnap = await db.collection(BORRADORES_COLLECTION).doc(draftSlug).get();
  const draftData = (draftSnap.data() || {}) as Record<string, unknown>;
  const fromDraft = normalizePublicSlug(draftData.slugPublico);

  const candidateSlugs = new Set<string>();
  if (fromDraft) candidateSlugs.add(fromDraft);
  if (draftSlug) candidateSlugs.add(draftSlug);

  const slugsToInspect = Array.from(candidateSlugs);
  for (const candidate of slugsToInspect) {
    const candidateSnap = await getPublicationRef(candidate).get();
    if (!candidateSnap.exists) continue;

    const data = (candidateSnap.data() || {}) as Record<string, unknown>;
    const state = getPublicationState(data);
    if (state === PUBLICATION_PUBLIC_STATES.TRASH) {
      continue;
    }
    if (isPublicationExpiredData(data)) {
      await finalizePublicationBySlug({
        slug: candidate,
        reason: FINALIZATION_REASON.EXPIRED_CHECKOUT_UPDATE,
      });
      continue;
    }

    return candidate;
  }

  const [byOriginalSnap, byDraftSlugSnap] = await Promise.all([
    db
      .collection(PUBLICADAS_COLLECTION)
      .where("slugOriginal", "==", draftSlug)
      .limit(5)
      .get(),
    db
      .collection(PUBLICADAS_COLLECTION)
      .where("borradorSlug", "==", draftSlug)
      .limit(5)
      .get(),
  ]);

  const queryCandidates = [...byOriginalSnap.docs, ...byDraftSlugSnap.docs];
  for (const docItem of queryCandidates) {
    const candidateSlug = normalizePublicSlug(docItem.id);
    if (!candidateSlug) continue;

    const data = (docItem.data() || {}) as Record<string, unknown>;
    const state = getPublicationState(data);
    if (state === PUBLICATION_PUBLIC_STATES.TRASH) {
      continue;
    }
    if (isPublicationExpiredData(data)) {
      await finalizePublicationBySlug({
        slug: candidateSlug,
        reason: FINALIZATION_REASON.EXPIRED_CHECKOUT_UPDATE,
      });
      continue;
    }

    return candidateSlug;
  }

  return null;
}

async function resolveUrlsInObjects(objetos: unknown[]): Promise<unknown[]> {
  const list = Array.isArray(objetos) ? objetos : [];

  return Promise.all(
    list.map(async (obj: any) => {
      if (!obj || typeof obj !== "object") return obj;

      if (
        (obj.tipo === "imagen" || obj.tipo === "icono") &&
        typeof obj.src === "string" &&
        obj.src &&
        !obj.src.startsWith("http")
      ) {
        try {
          const [url] = await bucket.file(obj.src).getSignedUrl({
            action: "read",
            expires: Date.now() + 1000 * 60 * 60 * 24 * 365,
          });
          return {
            ...obj,
            src: url,
          };
        } catch (error) {
          logger.warn("No se pudo resolver URL de objeto en publicacion", {
            src: obj.src,
            error: error instanceof Error ? error.message : String(error || ""),
          });
          return obj;
        }
      }

      return obj;
    })
  );
}

function createRsvpConfig(data: Record<string, any>): ModalConfig {
  const rawRsvp = data?.rsvp && typeof data.rsvp === "object"
    ? data.rsvp as Record<string, unknown>
    : {};

  const normalized = normalizeRsvpConfig({
    ...rawRsvp,
    enabled: rawRsvp?.enabled !== false,
    title: rawRsvp?.title,
    subtitle: rawRsvp?.subtitle,
    buttonText: rawRsvp?.buttonText,
    primaryColor: rawRsvp?.primaryColor,
    sheetUrl: rawRsvp?.sheetUrl,
  });

  // Firestore rechaza campos `undefined` en objetos anidados.
  // JSON stringify/parse elimina esos valores de forma segura para este snapshot.
  return JSON.parse(JSON.stringify(normalized)) as ModalConfig;
}

function createSlugConflictError(message: string): HttpsError {
  return new HttpsError("already-exists", message);
}

function isSlugConflictError(error: unknown): boolean {
  return error instanceof HttpsError && error.code === "already-exists";
}

export async function publishDraftToPublic(params: PublishDraftParams): Promise<PublishDraftResult> {
  const { draftSlug, publicSlug, uid, operation, paymentSessionId } = params;

  const draft = await ensureDraftOwnership(uid, draftSlug);
  const draftData = draft.data;

  const normalizedPublicSlug = normalizePublicSlug(publicSlug);
  if (!normalizedPublicSlug) {
    throw new HttpsError("invalid-argument", "enlace publico invalido");
  }

  let existingPublicSnap = await getPublicationRef(normalizedPublicSlug).get();
  let existingData = existingPublicSnap.exists
    ? ((existingPublicSnap.data() || {}) as Record<string, unknown>)
    : null;

  if (existingData && isPublicationExpiredData(existingData)) {
    await finalizePublicationBySlug({
      slug: normalizedPublicSlug,
      reason: FINALIZATION_REASON.EXPIRED_BEFORE_UPDATE_PUBLISH,
    });

    existingPublicSnap = await getPublicationRef(normalizedPublicSlug).get();
    existingData = existingPublicSnap.exists
      ? ((existingPublicSnap.data() || {}) as Record<string, unknown>)
      : null;

    if (existingData && isPublicationExpiredData(existingData)) {
      throw new HttpsError(
        "failed-precondition",
        "No se pudo limpiar la publicacion vencida. Intenta nuevamente."
      );
    }
  }

  if (existingPublicSnap.exists) {
    const existingUid = getString(existingData?.userId);
    const sameOwner = existingUid && existingUid === uid;
    if (!sameOwner) {
      throw createSlugConflictError("El enlace elegido ya pertenece a otro usuario.");
    }
  }

  if (operation === "new" && existingPublicSnap.exists) {
    throw createSlugConflictError("El enlace elegido ya esta publicado.");
  }

  if (operation === "update" && !existingPublicSnap.exists) {
    throw new HttpsError(
      "failed-precondition",
      "La publicacion ya no esta activa. Publica nuevamente como nueva."
    );
  }

  if (operation === "update" && existingData) {
    const existingState = getPublicationState(existingData);
    if (existingState === PUBLICATION_PUBLIC_STATES.TRASH) {
      throw new HttpsError(
        "failed-precondition",
        "La invitacion esta en papelera. Restaurala para volver a publicarla."
      );
    }

    const activeDraftSlug = inferDraftSlugFromPublicationData(
      normalizedPublicSlug,
      existingData
    );

    if (activeDraftSlug !== draftSlug) {
      throw new HttpsError(
        "failed-precondition",
        "La publicacion activa pertenece a otro borrador."
      );
    }
  }

  const now = new Date();
  const nowTimestamp = admin.firestore.Timestamp.fromDate(now);
  const firstPublishedAt =
    (existingData
      ? toDateFromTimestampLike(existingData.publicadaAt) ||
        toDateFromTimestampLike(existingData.publicadaEn)
      : null) || now;
  const firstPublishedAtTimestamp = safeTimestampFromDate(firstPublishedAt);
  const existingVigenciaDate = existingData
    ? toDateFromTimestampLike(existingData.venceAt) ||
      toDateFromTimestampLike(existingData.vigenteHasta)
    : null;
  const vigenteHastaTimestamp = existingVigenciaDate
    ? safeTimestampFromDate(existingVigenciaDate)
    : computePublicationExpirationTimestamp(firstPublishedAt);
  const existingState = existingData ? getPublicationState(existingData) : "";
  const shouldKeepPausedState =
    operation === "update" && existingState === PUBLICATION_PUBLIC_STATES.PAUSED;
  const normalizedEstado = shouldKeepPausedState
    ? PUBLICATION_PUBLIC_STATES.PAUSED
    : PUBLICATION_PUBLIC_STATES.ACTIVE;
  const existingPausedAtDate = existingData
    ? toDateFromTimestampLike(existingData.pausadaAt)
    : null;
  const pausedAtTimestamp =
    normalizedEstado === PUBLICATION_PUBLIC_STATES.PAUSED
      ? safeTimestampFromDate(existingPausedAtDate || now)
      : null;

  const objetos = Array.isArray(draftData.objetos) ? draftData.objetos : [];
  const secciones = Array.isArray(draftData.secciones) ? draftData.secciones : [];
  const objetosFinales = await resolveUrlsInObjects(objetos);
  const rsvp = createRsvpConfig(draftData as Record<string, any>);

  const htmlFinal = generarHTMLDesdeSecciones(secciones as any[], objetosFinales as any[], rsvp, {
    slug: normalizedPublicSlug,
  });

  const filePath = `publicadas/${normalizedPublicSlug}/index.html`;
  await bucket.file(filePath).save(htmlFinal, {
    contentType: "text/html",
    public: true,
    metadata: {
      cacheControl: "public,max-age=3600",
    },
  });

  const publicUrl = `https://reservaeldia.com.ar/i/${normalizedPublicSlug}`;
  const publicationData: Record<string, unknown> = {
    slug: normalizedPublicSlug,
    userId: uid,
    plantillaId: draftData.plantillaId || null,
    urlPublica: publicUrl,
    nombre: draftData.nombre || normalizedPublicSlug,
    tipo: draftData.tipo || draftData.plantillaTipo || "desconocido",
    portada: draftData.thumbnailUrl || null,
    invitadosCount: draftData.invitadosCount || 0,
    rsvp,
    estado: normalizedEstado,
    publicadaAt: firstPublishedAtTimestamp,
    publicadaEn: firstPublishedAtTimestamp,
    venceAt: vigenteHastaTimestamp,
    vigenteHasta: vigenteHastaTimestamp,
    ultimaPublicacionEn: nowTimestamp,
    pausadaAt: pausedAtTimestamp,
    enPapeleraAt: null,
    borradorSlug: draftSlug,
    ultimaOperacion: operation,
    lastPaymentSessionId: paymentSessionId,
  };

  if (draftSlug !== normalizedPublicSlug) {
    publicationData.slugOriginal = draftSlug;
  }

  await getPublicationRef(normalizedPublicSlug).set(publicationData, { merge: true });

  await db.collection(BORRADORES_COLLECTION).doc(draftSlug).set(
    {
      slugPublico: normalizedPublicSlug,
      publicationLifecycle: {
        state: PUBLICATION_LIFECYCLE_STATES.PUBLISHED,
        activePublicSlug: normalizedPublicSlug,
        firstPublishedAt: firstPublishedAtTimestamp,
        expiresAt: vigenteHastaTimestamp,
        lastPublishedAt: nowTimestamp,
        finalizedAt: null,
      },
      ultimaPublicacion: nowTimestamp,
      ultimaOperacionPublicacion: operation,
      publicationFinalizedAt: null,
      publicationFinalizationReason: null,
      lastPaymentSessionId: paymentSessionId,
    },
    { merge: true }
  );

  return {
    publicSlug: normalizedPublicSlug,
    publicUrl,
  };
}

async function readSessionOwnedByUser(uid: string, sessionId: string) {
  const ref = getSessionRef(sessionId);
  const snap = await ref.get();

  if (!snap.exists) {
    throw new HttpsError("not-found", "Sesion de checkout no encontrada");
  }

  const data = (snap.data() || {}) as Record<string, unknown>;
  if (getString(data.uid) !== uid) {
    throw new HttpsError("permission-denied", "No tenes acceso a esta sesion");
  }

  return {
    ref,
    snap,
    data,
  };
}

function toAmount(value: unknown, fallback: number): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(0, Math.round(numeric));
}

function isZeroAmount(value: unknown): boolean {
  return toAmount(value, 0) <= 0;
}

function buildReceipt(params: {
  operation: CheckoutOperation;
  amountBaseArs: number;
  amountArs: number;
  discountAmountArs: number;
  discountCode?: string | null;
  discountDescription?: string | null;
  paymentId: string;
  publicSlug: string;
  publicUrl?: string;
  approvedAt?: string;
}) {
  return {
    operation: params.operation,
    amountBaseArs: params.amountBaseArs,
    amountArs: params.amountArs,
    discountAmountArs: params.discountAmountArs,
    discountCode: params.discountCode || null,
    discountDescription: params.discountDescription || null,
    currency: "ARS",
    approvedAt: params.approvedAt || toSafeIsoDate(new Date()),
    paymentId: params.paymentId,
    publicSlug: params.publicSlug,
    publicUrl: params.publicUrl || null,
  };
}

function buildPaymentResultFromSession(data: Record<string, unknown>, paymentId = ""): CheckoutPaymentResult {
  return {
    sessionStatus: (getString(data.status) as CheckoutSessionStatus) || "payment_processing",
    paymentId,
    publicUrl: getString(data.publicUrl) || undefined,
    receipt: (data.receipt as Record<string, unknown> | undefined) || undefined,
    errorMessage: getString(data.lastError) || undefined,
  };
}

async function finalizeApprovedSession(params: {
  sessionId: string;
  fallbackPaymentId: string;
  approvedAt?: string;
}): Promise<CheckoutPaymentResult> {
  const { sessionId, fallbackPaymentId, approvedAt } = params;
  const sessionRef = getSessionRef(sessionId);

  let sessionData: Record<string, unknown> | null = null;
  let shouldPublish = false;

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(sessionRef);
    if (!snap.exists) {
      throw new HttpsError("not-found", "Sesion no encontrada");
    }

    const data = (snap.data() || {}) as Record<string, unknown>;
    const status = getString(data.status) as CheckoutSessionStatus;

    sessionData = data;

    if (status === "published") {
      return;
    }

    if (status === "publishing") {
      return;
    }

    if (status === "expired") {
      return;
    }

    tx.set(
      sessionRef,
      {
        status: "publishing",
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    shouldPublish = true;
  });

  if (!sessionData) {
    throw new HttpsError("not-found", "Sesion invalida");
  }

  const sessionPayload = sessionData as Record<string, unknown>;

  if (!shouldPublish) {
    const snap = await sessionRef.get();
    return buildPaymentResultFromSession((snap.data() || {}) as Record<string, unknown>, fallbackPaymentId);
  }

  const draftSlug = getString(sessionPayload.draftSlug);
  const publicSlug = getString(sessionPayload.publicSlug);
  const uid = getString(sessionPayload.uid);
  const operation = normalizeOperation(sessionPayload.operation);
  const amountArs = toAmount(sessionPayload.amountArs, operation === "new" ? 29900 : 1490);
  const amountBaseArs = toAmount(sessionPayload.amountBaseArs, amountArs);
  const discountAmountArs = toAmount(sessionPayload.discountAmountArs, 0);
  const discountCode = getString(sessionPayload.discountCode) || null;
  const discountDescription = getString(sessionPayload.discountDescription) || null;

  try {
    const publication = await publishDraftToPublic({
      draftSlug,
      publicSlug,
      uid,
      operation,
      paymentSessionId: sessionId,
    });

    const receipt = buildReceipt({
      operation,
      amountBaseArs,
      amountArs,
      discountAmountArs,
      discountCode,
      discountDescription,
      paymentId: fallbackPaymentId,
      publicSlug: publication.publicSlug,
      publicUrl: publication.publicUrl,
      approvedAt,
    });

    await sessionRef.set(
      {
        status: "published",
        publicUrl: publication.publicUrl,
        receipt,
        lastError: null,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    if (operation === "new") {
      await markReservationStatus({
        slug: publication.publicSlug,
        sessionId,
        nextStatus: "consumed",
      });
    }

    try {
      await recordDiscountUsageIfNeeded({
        sessionId,
        sessionPayload: {
          ...sessionPayload,
          publicSlug: publication.publicSlug,
        },
        paymentId: fallbackPaymentId,
        approvedAt,
      });
    } catch (usageError) {
      logger.error("No se pudo registrar uso de codigo de descuento", {
        sessionId,
        error:
          usageError instanceof Error ? usageError.message : String(usageError || ""),
      });
    }

    return {
      sessionStatus: "published",
      paymentId: fallbackPaymentId,
      publicUrl: publication.publicUrl,
      receipt,
    };
  } catch (error) {
    if (isSlugConflictError(error)) {
      await sessionRef.set(
        {
          status: "approved_slug_conflict",
          lastError: "El enlace ya no esta disponible. Elegi uno nuevo para completar la publicacion.",
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      await markReservationStatus({
        slug: publicSlug,
        sessionId,
        nextStatus: "released",
      });

      return {
        sessionStatus: "approved_slug_conflict",
        paymentId: fallbackPaymentId,
        message: "Pago aprobado. El enlace entro en conflicto, elegi otro para finalizar.",
      };
    }

    logger.error("Error publicando sesion aprobada", {
      sessionId,
      error: error instanceof Error ? error.message : String(error || ""),
    });

    await sessionRef.set(
      {
        status: "payment_approved",
        lastError:
          error instanceof Error
            ? error.message
            : "Pago aprobado, pero la publicacion no se pudo completar en este intento.",
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

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

function statusFromMercadoPago(status: string): CheckoutSessionStatus {
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

async function processMercadoPagoPayment(params: {
  sessionId: string;
  paymentId: string;
  paymentStatus: string;
  paymentStatusDetail?: string;
  approvedAt?: string;
}): Promise<CheckoutPaymentResult> {
  const { sessionId, paymentId, paymentStatus, paymentStatusDetail, approvedAt } = params;
  const sessionRef = getSessionRef(sessionId);

  const mappedStatus = statusFromMercadoPago(paymentStatus);

  if (mappedStatus === "payment_approved") {
    await sessionRef.set(
      {
        mpPaymentId: paymentId,
        mpStatus: paymentStatus,
        mpStatusDetail: paymentStatusDetail || null,
        status: "payment_approved",
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    return finalizeApprovedSession({
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
        updatedAt: serverTimestamp(),
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
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );

  return {
    sessionStatus: "payment_processing",
    paymentId,
    message: "El pago esta siendo procesado.",
  };
}

export async function checkPublicSlugAvailabilityHandler(
  request: CallableRequest<{
    draftSlug: string;
    candidateSlug: string;
  }>
) {
  const uid = requireAuth(request);
  const draftSlug = normalizeDraftSlug(request.data?.draftSlug);
  await ensureDraftOwnership(uid, draftSlug);

  const validation = validatePublicSlug(request.data?.candidateSlug);
  if (!validation.isValid) {
    return {
      normalizedSlug: validation.normalizedSlug,
      isValid: false,
      isAvailable: false,
      reason: validation.reason,
    };
  }

  const availability = await checkSlugAvailability(validation.normalizedSlug, uid, draftSlug);

  return {
    normalizedSlug: validation.normalizedSlug,
    isValid: true,
    isAvailable: availability.isAvailable,
    reason: availability.reason,
  };
}

export async function upsertPublicationDiscountCodeHandler(
  request: CallableRequest<{
    code: string;
    active?: boolean;
    type?: DiscountType;
    value: number;
    appliesTo?: DiscountAppliesTo;
    description?: string;
    startsAt?: string | null;
    endsAt?: string | null;
    maxRedemptions?: number | null;
  }>
) {
  requireSuperAdmin(request);

  const code = normalizeDiscountCode(request.data?.code);
  if (!code) {
    throw new HttpsError("invalid-argument", "Falta codigo de descuento.");
  }

  const type = normalizeDiscountType(request.data?.type);
  const value = getNumber(request.data?.value, 0);
  if (!Number.isFinite(value) || value <= 0) {
    throw new HttpsError("invalid-argument", "El valor del descuento debe ser mayor a 0.");
  }

  if (type === "percentage" && value > 100) {
    throw new HttpsError(
      "invalid-argument",
      "El descuento porcentual no puede superar 100."
    );
  }

  const appliesTo = normalizeDiscountAppliesTo(request.data?.appliesTo);
  const startsAt = parseOptionalDateString(request.data?.startsAt, "startsAt");
  const endsAt = parseOptionalDateString(request.data?.endsAt, "endsAt");
  if (startsAt && endsAt && startsAt.toMillis() > endsAt.toMillis()) {
    throw new HttpsError("invalid-argument", "El rango de fechas del codigo es invalido.");
  }

  const maxRedemptionsRaw = request.data?.maxRedemptions;
  let maxRedemptions: number | null = null;
  if (maxRedemptionsRaw !== null && typeof maxRedemptionsRaw !== "undefined") {
    const parsed = Math.round(getNumber(maxRedemptionsRaw, Number.NaN));
    if (!Number.isFinite(parsed) || parsed < 0) {
      throw new HttpsError(
        "invalid-argument",
        "maxRedemptions debe ser un numero entero mayor o igual a 0."
      );
    }
    maxRedemptions = parsed;
  }

  const ref = getDiscountCodeRef(code);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const prev = (snap.data() || {}) as Record<string, unknown>;
    const redemptionsCount = toAmount(prev.redemptionsCount, 0);

    tx.set(
      ref,
      {
        code,
        active: request.data?.active !== false,
        type,
        value: Math.round(value),
        appliesTo,
        description: getString(request.data?.description) || null,
        startsAt: startsAt || null,
        endsAt: endsAt || null,
        maxRedemptions,
        redemptionsCount,
        createdAt: snap.exists ? prev.createdAt || serverTimestamp() : serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  });

  const created = await ref.get();
  return {
    code,
    item: mapDiscountCodeDocToItem(code, (created.data() || {}) as Record<string, unknown>),
  };
}

export async function listPublicationDiscountCodesHandler(
  request: CallableRequest<Record<string, never>>
): Promise<{
  items: DiscountCodeAdminItem[];
  summary: {
    totalCodes: number;
    activeCodes: number;
    totalRedemptions: number;
  };
}> {
  requireSuperAdmin(request);

  const snap = await db.collection(DISCOUNT_CODES_COLLECTION).limit(300).get();
  const items = snap.docs
    .map((doc) => mapDiscountCodeDocToItem(doc.id, (doc.data() || {}) as Record<string, unknown>))
    .sort((a, b) => {
      const aTime = a.updatedAt ? Date.parse(a.updatedAt) : 0;
      const bTime = b.updatedAt ? Date.parse(b.updatedAt) : 0;
      return bTime - aTime;
    });

  const totalCodes = items.length;
  const activeCodes = items.filter((item) => item.active).length;
  const totalRedemptions = items.reduce(
    (acc, item) => acc + Math.max(0, item.redemptionsCount || 0),
    0
  );

  return {
    items,
    summary: {
      totalCodes,
      activeCodes,
      totalRedemptions,
    },
  };
}

export async function listPublicationDiscountCodeUsageHandler(
  request: CallableRequest<{ code: string; limit?: number }>
): Promise<{
  code: string;
  totalUsed: number;
  items: DiscountUsageItem[];
}> {
  requireSuperAdmin(request);

  const code = normalizeDiscountCode(request.data?.code);
  if (!code) {
    throw new HttpsError("invalid-argument", "Falta codigo de descuento.");
  }

  const requestedLimit = Math.round(getNumber(request.data?.limit, 50));
  const limit = Math.max(10, Math.min(200, requestedLimit));

  const [codeSnap, usageSnap] = await Promise.all([
    getDiscountCodeRef(code).get(),
    db.collection(DISCOUNT_USAGE_COLLECTION).where("code", "==", code).get(),
  ]);

  const allItems = usageSnap.docs
    .map((doc) => mapDiscountUsageDocToItem((doc.data() || {}) as Record<string, unknown>))
    .sort((a, b) => {
      const aTime = a.createdAt ? Date.parse(a.createdAt) : 0;
      const bTime = b.createdAt ? Date.parse(b.createdAt) : 0;
      return bTime - aTime;
    });
  const items = allItems.slice(0, limit);

  const usageCount = allItems.length;
  const storedCount = codeSnap.exists
    ? toAmount((codeSnap.data() || {}).redemptionsCount, usageCount)
    : usageCount;
  const totalUsed = usageCount;

  if (codeSnap.exists && storedCount !== usageCount) {
    await getDiscountCodeRef(code).set(
      {
        redemptionsCount: usageCount,
      },
      { merge: true }
    );
  }

  return {
    code,
    totalUsed,
    items,
  };
}

export async function createPublicationCheckoutSessionHandler(
  request: CallableRequest<{
    draftSlug: string;
    operation: CheckoutOperation;
    requestedPublicSlug?: string;
    discountCode?: string;
  }>
) {
  const uid = requireAuth(request);
  const draftSlug = normalizeDraftSlug(request.data?.draftSlug);
  const operation = normalizeOperation(request.data?.operation);

  await ensureDraftOwnership(uid, draftSlug);

  const config = await getPublicationPaymentConfig();
  if (!config.enabled) {
    throw new HttpsError("failed-precondition", "La publicacion con pago esta deshabilitada");
  }

  const sessionId = randomUUID();
  const expiresAtMs = Date.now() + config.slugReservationTtlMinutes * 60_000;
  const expiresAt = admin.firestore.Timestamp.fromMillis(expiresAtMs);

  let publicSlug = "";

  if (operation === "new") {
    const validation = validatePublicSlug(request.data?.requestedPublicSlug);
    if (!validation.isValid) {
      throw new HttpsError("invalid-argument", "El enlace no es valido.");
    }

    const availability = await checkSlugAvailability(validation.normalizedSlug, uid, draftSlug);
    if (!availability.isAvailable) {
      throw new HttpsError("already-exists", "El enlace no esta disponible.");
    }

    await reserveSlugForSession({
      slug: validation.normalizedSlug,
      uid,
      draftSlug,
      sessionId,
      expiresAt,
    });

    publicSlug = validation.normalizedSlug;
  } else {
    const existingSlug = await resolveExistingPublicSlug(draftSlug);
    if (!existingSlug) {
      throw new HttpsError(
        "failed-precondition",
        "La publicacion previa no esta activa o ya vencio. Debes crear una publicacion nueva."
      );
    }
    publicSlug = existingSlug;
  }

  const amountBaseArs = operation === "new" ? config.publishAmountArs : config.updateAmountArs;
  const discount = await resolveDiscountForCheckout({
    operation,
    amountBaseArs,
    rawDiscountCode: request.data?.discountCode,
  });

  const amountArs = discount.amountArs;
  const payerEmail = resolvePayerEmail(request);
  let mpPublicKey = "";
  let mpPreferenceId = "";

  if (!isZeroAmount(amountArs)) {
    try {
      mpPublicKey = getMercadoPagoPublicKey();
      mpPreferenceId = await createMercadoPagoPreferenceForCheckout({
        sessionId,
        operation,
        publicSlug,
        amountArs,
        payerEmail,
      });
    } catch (error) {
      if (operation === "new") {
        await markReservationStatus({
          slug: publicSlug,
          sessionId,
          nextStatus: "released",
        });
      }
      throw mapMercadoPagoConfigError(error);
    }
  }

  const payload: CheckoutSessionDoc = {
    uid,
    draftSlug,
    operation,
    publicSlug,
    amountBaseArs: discount.amountBaseArs,
    amountArs,
    discountAmountArs: discount.discountAmountArs,
    discountCode: discount.discountCode,
    discountDescription: discount.discountDescription,
    currency: "ARS",
    status: "awaiting_payment",
    expiresAt,
    mpPreferenceId,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  await getSessionRef(sessionId).set(payload);

  return {
    sessionId,
    operation,
    publicSlug,
    amountBaseArs: discount.amountBaseArs,
    amountArs,
    discountAmountArs: discount.discountAmountArs,
    discountCode: discount.discountCode,
    discountDescription: discount.discountDescription,
    currency: "ARS",
    expiresAt: new Date(expiresAtMs).toISOString(),
    mpPublicKey,
    mpPreferenceId,
    payerEmail,
  };
}

export async function createPublicationPaymentHandler(
  request: CallableRequest<{
    sessionId: string;
    brickData: {
      token?: string;
      payment_method_id?: string;
      paymentMethodId?: string;
      selectedPaymentMethod?: { id?: string } | string;
      issuer_id?: string;
      installments?: number;
      payer: {
        email: string;
        identification?: { type: string; number: string };
      };
    };
  }>
): Promise<CheckoutPaymentResult> {
  const uid = requireAuth(request);
  const sessionId = normalizeSessionId(request.data?.sessionId);
  const { ref: sessionRef, data: sessionData } = await readSessionOwnedByUser(uid, sessionId);

  const sessionStatus = getString(sessionData.status) as CheckoutSessionStatus;
  const expiresAt = sessionData.expiresAt as admin.firestore.Timestamp;

  if (isExpiredAt(expiresAt) && !SESSION_TERMINAL_STATES.has(sessionStatus)) {
    await sessionRef.set(
      {
        status: "expired",
        lastError: "La sesion de pago expiro. Inicia una nueva.",
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    if (getString(sessionData.operation) === "new") {
      await markReservationStatus({
        slug: getString(sessionData.publicSlug),
        sessionId,
        nextStatus: "expired",
      });
    }

    return {
      sessionStatus: "expired",
      paymentId: "",
      message: "La sesion expiro",
      errorMessage: "La sesion de pago expiro. Inicia una nueva.",
    };
  }

  if (sessionStatus === "published") {
    return buildPaymentResultFromSession(sessionData, getString(sessionData.mpPaymentId));
  }

  const amountArs = toAmount(sessionData.amountArs, 0);
  const operation = normalizeOperation(sessionData.operation);

  if (isZeroAmount(amountArs)) {
    const syntheticPaymentId =
      getString(sessionData.mpPaymentId) || `discount-full-${sessionId}`;

    await sessionRef.set(
      {
        mpPaymentId: syntheticPaymentId,
        mpStatus: "approved",
        mpStatusDetail: "discount_100_auto_approved",
        status: "payment_approved",
        lastError: null,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    return finalizeApprovedSession({
      sessionId,
      fallbackPaymentId: syntheticPaymentId,
      approvedAt: toSafeIsoDate(new Date()),
    });
  }

  const brickData = (request.data?.brickData || {}) as Record<string, unknown>;
  const token = getString(brickData.token);
  const paymentMethodId = extractPaymentMethodId(brickData);
  const installments = Math.max(1, Number(brickData.installments) || 1);
  const isAccountMoney = isAccountMoneyPaymentMethod(paymentMethodId);

  if (!paymentMethodId) {
    throw new HttpsError("invalid-argument", "Selecciona un medio de pago para continuar.");
  }

  if (!token && !isAccountMoney) {
    throw new HttpsError("invalid-argument", "Completa los datos del medio de pago.");
  }

  const payer = (brickData.payer || {}) as Record<string, unknown>;
  const payerIdentification = (payer.identification || {}) as Record<string, unknown>;

  const paymentBody: Record<string, unknown> = {
    transaction_amount: amountArs,
    description:
      operation === "new"
        ? `Publicacion nueva de invitacion (${getString(sessionData.publicSlug)})`
        : `Actualizacion de invitacion (${getString(sessionData.publicSlug)})`,
    payment_method_id: paymentMethodId,
    payer: {
      email: getString(payer.email) || resolvePayerEmail(request),
    },
    notification_url: getMercadoPagoWebhookUrl(),
    external_reference: sessionId,
    metadata: {
      publication_session_id: sessionId,
      uid,
      draft_slug: getString(sessionData.draftSlug),
      public_slug: getString(sessionData.publicSlug),
      operation,
      discount_code: getString(sessionData.discountCode) || null,
    },
  };

  if (!isAccountMoney) {
    paymentBody.token = token;
    paymentBody.installments = installments;
  }

  const issuerId = getString(brickData.issuer_id);
  if (issuerId && !isAccountMoney) {
    paymentBody.issuer_id = issuerId;
  }

  const identificationType = getString(payerIdentification.type);
  const identificationNumber = getString(payerIdentification.number);
  if (identificationType && identificationNumber) {
    (paymentBody.payer as Record<string, unknown>).identification = {
      type: identificationType,
      number: identificationNumber,
    };
  }

  let paymentResponse: any;
  try {
    const paymentClient = getMercadoPagoPaymentClient();
    paymentResponse = (await paymentClient.create({
      body: paymentBody,
      requestOptions: {
        idempotencyKey: `publication-${sessionId}`,
      },
    })) as any;
  } catch (error) {
    throw mapMercadoPagoPaymentError(error);
  }

  const paymentId = String(paymentResponse?.id || "");
  if (!paymentId) {
    throw new HttpsError("internal", "Mercado Pago no devolvio paymentId");
  }

  const paymentStatus = getString(paymentResponse?.status) || "in_process";
  const paymentStatusDetail = getString(paymentResponse?.status_detail);

  return processMercadoPagoPayment({
    sessionId,
    paymentId,
    paymentStatus,
    paymentStatusDetail,
    approvedAt: getString(paymentResponse?.date_approved) || undefined,
  });
}

export async function getPublicationCheckoutStatusHandler(
  request: CallableRequest<{ sessionId: string }>
): Promise<CheckoutStatusResponse> {
  const uid = requireAuth(request);
  const sessionId = normalizeSessionId(request.data?.sessionId);

  const { ref: sessionRef, data } = await readSessionOwnedByUser(uid, sessionId);
  const status = getString(data.status) as CheckoutSessionStatus;
  const expiresAt = data.expiresAt as admin.firestore.Timestamp;

  if (isExpiredAt(expiresAt) && !SESSION_TERMINAL_STATES.has(status)) {
    await sessionRef.set(
      {
        status: "expired",
        lastError: "La sesion de pago expiro. Inicia una nueva.",
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    if (getString(data.operation) === "new") {
      await markReservationStatus({
        slug: getString(data.publicSlug),
        sessionId,
        nextStatus: "expired",
      });
    }

    return {
      sessionStatus: "expired",
      errorMessage: "La sesion de pago expiro. Inicia una nueva.",
    };
  }

  return {
    sessionStatus: status || "awaiting_payment",
    publicUrl: getString(data.publicUrl) || undefined,
    receipt: (data.receipt as Record<string, unknown> | undefined) || undefined,
    errorMessage: getString(data.lastError) || undefined,
  };
}

export async function retryPaidPublicationWithNewSlugHandler(
  request: CallableRequest<{ sessionId: string; newPublicSlug: string }>
): Promise<{ sessionStatus: "published" | "awaiting_retry"; publicUrl?: string; message?: string }> {
  const uid = requireAuth(request);
  const sessionId = normalizeSessionId(request.data?.sessionId);

  const { ref: sessionRef, data } = await readSessionOwnedByUser(uid, sessionId);
  const status = getString(data.status) as CheckoutSessionStatus;

  if (status === "published") {
    return {
      sessionStatus: "published",
      publicUrl: getString(data.publicUrl) || undefined,
    };
  }

  if (status !== "approved_slug_conflict") {
    throw new HttpsError(
      "failed-precondition",
      "La sesion no esta en estado de conflicto de enlace"
    );
  }

  const validation = validatePublicSlug(request.data?.newPublicSlug);
  if (!validation.isValid) {
    throw new HttpsError("invalid-argument", "El enlace no es valido.");
  }

  const draftSlug = getString(data.draftSlug);
  const availability = await checkSlugAvailability(validation.normalizedSlug, uid, draftSlug);
  if (!availability.isAvailable) {
    return {
      sessionStatus: "awaiting_retry",
      message: "El enlace elegido no esta disponible.",
    };
  }

  const config = await getPublicationPaymentConfig();
  const expiresAt = admin.firestore.Timestamp.fromMillis(
    Date.now() + config.slugReservationTtlMinutes * 60_000
  );

  await reserveSlugForSession({
    slug: validation.normalizedSlug,
    uid,
    draftSlug,
    sessionId,
    expiresAt,
  });

  await markReservationStatus({
    slug: getString(data.publicSlug),
    sessionId,
    nextStatus: "released",
  });

  await sessionRef.set(
    {
      publicSlug: validation.normalizedSlug,
      status: "payment_approved",
      lastError: null,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );

  const result = await finalizeApprovedSession({
    sessionId,
    fallbackPaymentId: getString(data.mpPaymentId) || "paid-session",
  });

  if (result.sessionStatus === "published") {
    return {
      sessionStatus: "published",
      publicUrl: result.publicUrl,
      message: "Invitacion publicada correctamente.",
    };
  }

  return {
    sessionStatus: "awaiting_retry",
    message: result.message || "No se pudo publicar con ese enlace. Intenta con otro.",
  };
}

export async function publishWithApprovedPaymentSession(params: {
  uid: string;
  draftSlug: string;
  slugPublico?: string;
  paymentSessionId: string;
}): Promise<{ success: true; url: string }> {
  const { uid, draftSlug, slugPublico, paymentSessionId } = params;

  await ensureDraftOwnership(uid, draftSlug);

  const session = await readSessionOwnedByUser(uid, paymentSessionId);
  const data = session.data;

  const sessionPublicSlug = getString(data.publicSlug);
  const requestedSlug = normalizePublicSlug(slugPublico || sessionPublicSlug);

  if (!requestedSlug) {
    throw new HttpsError("invalid-argument", "enlace publico invalido");
  }

  if (requestedSlug !== sessionPublicSlug) {
    throw new HttpsError(
      "failed-precondition",
      "El enlace solicitado no coincide con el enlace aprobado en la sesion"
    );
  }

  const status = getString(data.status) as CheckoutSessionStatus;

  if (status === "published") {
    const existingUrl = getString(data.publicUrl);
    if (!existingUrl) {
      throw new HttpsError("internal", "La sesion publicada no tiene URL guardada");
    }
    return { success: true, url: existingUrl };
  }

  if (status !== "payment_approved") {
    throw new HttpsError(
      "failed-precondition",
      "El pago aun no fue aprobado para esta sesion"
    );
  }

  const result = await finalizeApprovedSession({
    sessionId: paymentSessionId,
    fallbackPaymentId: getString(data.mpPaymentId) || "approved-session",
    approvedAt: undefined,
  });

  if (result.sessionStatus !== "published" || !result.publicUrl) {
    throw new HttpsError(
      "failed-precondition",
      "No se pudo completar la publicacion con esta sesion"
    );
  }

  return {
    success: true,
    url: result.publicUrl,
  };
}

function parseSignatureHeader(rawHeader: string): { ts: string; v1: string } | null {
  const parts = rawHeader
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => part.split("="));

  const signatureMap = new Map<string, string>();
  parts.forEach(([key, value]) => {
    if (!key || !value) return;
    signatureMap.set(key, value);
  });

  const ts = signatureMap.get("ts") || "";
  const v1 = signatureMap.get("v1") || "";
  if (!ts || !v1) return null;

  return { ts, v1 };
}

function toQueryValue(value: unknown): string {
  if (Array.isArray(value)) {
    return getString(value[0]);
  }
  return getString(value);
}

function validateMercadoPagoSignature(params: {
  signatureHeader: string;
  requestId: string;
  dataId: string;
}): boolean {
  let secret = "";
  try {
    secret = getMercadoPagoWebhookSecret();
  } catch {
    return false;
  }
  const parsed = parseSignatureHeader(params.signatureHeader);
  if (!parsed) return false;

  const manifest = `id:${params.dataId};request-id:${params.requestId};ts:${parsed.ts};`;
  const digest = createHmac("sha256", secret).update(manifest).digest("hex");

  try {
    return timingSafeEqual(Buffer.from(digest), Buffer.from(parsed.v1));
  } catch {
    return false;
  }
}

async function resolvePaymentById(paymentId: string): Promise<any> {
  const numericId = Number(paymentId);
  if (!Number.isFinite(numericId) || numericId <= 0) {
    throw new HttpsError("invalid-argument", "paymentId invalido");
  }

  const paymentClient = getMercadoPagoPaymentClient();
  const payment = (await paymentClient.get({ id: numericId })) as any;
  return payment;
}

export async function processMercadoPagoWebhookRequest(req: Request, res: Response): Promise<void> {
  try {
    const signatureHeader = getString(req.headers["x-signature"]);
    const requestId = getString(req.headers["x-request-id"]);
    const action =
      toQueryValue((req.query as Record<string, unknown>).action) ||
      getString((req.body as Record<string, unknown>)?.action);

    const dataIdFromQuery = toQueryValue((req.query as Record<string, unknown>)["data.id"]);
    const dataIdFromBody = getString((req.body as Record<string, any>)?.data?.id);
    const dataId = dataIdFromQuery || dataIdFromBody;

    logger.info("Mercado Pago webhook recibido", {
      action: action || "unknown",
      requestId: requestId || null,
      dataId: dataId || null,
      hasSignature: Boolean(signatureHeader),
    });

    if (!signatureHeader || !requestId || !dataId) {
      res.status(400).json({ ok: false, message: "Headers de firma incompletos" });
      return;
    }

    const signatureValid = validateMercadoPagoSignature({
      signatureHeader,
      requestId,
      dataId,
    });

    if (!signatureValid) {
      res.status(401).json({ ok: false, message: "Firma invalida" });
      return;
    }

    const topic =
      toQueryValue((req.query as Record<string, unknown>).type) ||
      getString((req.body as Record<string, unknown>)?.type) ||
      toQueryValue((req.query as Record<string, unknown>).topic);

    if (topic && topic !== "payment") {
      logger.info("Mercado Pago webhook ignorado por topic", {
        action: action || "unknown",
        requestId,
        dataId,
        topic,
      });
      res.status(200).json({ ok: true, ignored: true, reason: `topic=${topic}` });
      return;
    }

    const payment = await resolvePaymentById(dataId);
    const paymentId = getString(payment?.id || dataId);
    const paymentStatus = getString(payment?.status) || "in_process";
    const paymentStatusDetail = getString(payment?.status_detail);

    const metadata = (payment?.metadata || {}) as Record<string, unknown>;
    const sessionId =
      getString(metadata.publication_session_id) ||
      getString(payment?.external_reference);

    logger.info("Mercado Pago webhook pago resuelto por API", {
      action: action || "unknown",
      requestId,
      dataId,
      paymentId,
      paymentStatus,
      paymentStatusDetail: paymentStatusDetail || null,
      sessionId: sessionId || null,
    });

    if (!sessionId) {
      logger.warn("Mercado Pago webhook sin sessionId", {
        action: action || "unknown",
        requestId,
        dataId,
        paymentId,
        paymentStatus,
      });
      res.status(200).json({ ok: true, ignored: true, reason: "sin-session-id" });
      return;
    }

    const result = await processMercadoPagoPayment({
      sessionId,
      paymentId,
      paymentStatus,
      paymentStatusDetail,
      approvedAt: getString(payment?.date_approved) || undefined,
    });

    res.status(200).json({
      ok: true,
      sessionId,
      sessionStatus: result.sessionStatus,
    });

    logger.info("Mercado Pago webhook procesado", {
      action: action || "unknown",
      requestId,
      dataId,
      paymentId,
      paymentStatus,
      sessionId,
      sessionStatus: result.sessionStatus,
    });
  } catch (error) {
    logger.error("Error en webhook de Mercado Pago", {
      error: error instanceof Error ? error.message : String(error || ""),
    });
    res.status(500).json({ ok: false, message: "Error procesando webhook" });
  }
}
