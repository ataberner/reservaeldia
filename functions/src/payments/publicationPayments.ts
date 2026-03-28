import { randomUUID } from "crypto";
import type { Request, Response } from "express";
import * as admin from "firebase-admin";
import { getStorage } from "firebase-admin/storage";
import * as logger from "firebase-functions/logger";
import { type CallableRequest, HttpsError } from "firebase-functions/v2/https";
import { requireAuth, requireSuperAdmin } from "../auth/adminAuth";
import { type GiftsConfig } from "../gifts/config";
import { type RSVPConfig as ModalConfig } from "../rsvp/config";
import {
  normalizePublicSlug,
  validatePublicSlug,
} from "../utils/publicSlug";
import {
  PUBLICATION_VIGENCY_MONTHS,
  PUBLICATION_LIFECYCLE_STATES,
  PUBLICATION_PUBLIC_STATES,
  PUBLICATION_TRASH_RETENTION_DAYS,
  addMonthsPreservingDateTimeUTC,
  resolvePublicationBackendStateFromData,
  resolvePublicationLifecycleSnapshotFromData,
} from "./publicationLifecycle";
import {
  buildLinkedDraftResetWrite,
} from "./publicationWritePreparation";
import {
  executePlannedLegacyPublicationCleanup,
  executePlannedDraftWriteIfExists,
  executePlannedPublicationWrites,
} from "./publicationOperationExecution";
import {
  buildPaymentResultFromSession,
  finalizeApprovedSessionFlow,
  processMercadoPagoPaymentFlow,
  type CheckoutOperation,
  type CheckoutPaymentResult,
  type CheckoutSessionStatus,
} from "./publicationApprovedSessionFlow";
import {
  getMercadoPagoPaymentClient,
  getMercadoPagoPreferenceClient,
  getMercadoPagoPublicKey,
  getMercadoPagoWebhookSecret,
  getMercadoPagoWebhookUrl,
} from "./mercadoPagoClient";
import { applyPublicationIconUsageDelta } from "../iconCatalog/usage";
import {
  normalizeDraftRenderState,
} from "../drafts/sourceOfTruth";
import { recordBusinessAnalyticsEvent } from "../analytics/service";
import {
  getPricingForOperation,
  loadCheckoutPricingConfig,
} from "../siteSettings/pricing";
import {
  buildPublicationValidationBlockingMessage,
  preparePublicationRenderState,
  validatePreparedPublicationRenderState,
} from "./publicationPublishValidation";
import { executePublicationPublish } from "./publicationPublishExecution";
import {
  checkSlugAvailabilityFlow,
  markReservationStatusFlow,
  reserveSlugForSessionFlow,
  type SlugAvailabilityResult,
} from "./publicationSlugReservationFlow";
import {
  autoApproveZeroAmountCheckoutSessionFlow,
  buildCheckoutStatusResponseFromSession,
  buildExpiredCheckoutPaymentResult,
  buildExpiredCheckoutStatusResponse,
  expireCheckoutSessionIfNeededFlow,
  readOwnedCheckoutSessionFlow,
} from "./publicationCheckoutSessionFlow";
import { finalizePublicationSnapshotFlow } from "./publicationFinalizationFlow";
import {
  isPublicationDueForTrashPurgeFlow,
  purgeTrashedPublicationFlow,
} from "./publicationTrashPurgeFlow";
import { preparePublicationStateTransitionFlow } from "./publicationStateTransitionFlow";
import { prepareLegacyPublicationCleanupFlow } from "./publicationLegacyCleanupFlow";
import {
  CHECKOUT_CONFIG_DOC_PATH,
  getPublicationPaymentConfig as loadPublicationPaymentConfig,
  type PublicationCheckoutConfig,
} from "./publicationCheckoutConfig";
import {
  buildAwaitingRetryResult,
  buildPublishedRetryResult,
  extractPaymentMethodId,
  getNumber,
  isAccountMoneyPaymentMethod,
  isZeroAmount,
  mapMercadoPagoConfigError,
  mapMercadoPagoPaymentError,
  normalizeDraftSlug,
  normalizeOperation,
  normalizePublicationStateTransitionAction,
  normalizeSessionId,
  parseOptionalDateString,
  resolvePayerEmail,
  toAmount,
  toIsoFromTimestamp,
  type PublicationStateTransitionAction,
  type RetryPaidPublicationResult,
} from "./publicationPaymentEdge";
import {
  BORRADORES_COLLECTION,
  DISCOUNT_CODES_COLLECTION,
  DISCOUNT_USAGE_COLLECTION,
  PUBLICADAS_COLLECTION,
  PUBLICADAS_HISTORIAL_COLLECTION,
  ensureDraftOwnership as ensureDraftOwnershipRead,
  extractDraftSlugCandidatesFromPublicationData,
  getDiscountCodeRef as buildDiscountCodeRef,
  getDiscountUsageRef as buildDiscountUsageRef,
  getPublicationHistoryRef as buildPublicationHistoryRef,
  getPublicationRef as buildPublicationRef,
  getReservationRef as buildReservationRef,
  getSessionRef as buildSessionRef,
  inferDraftSlugFromPublicationData,
  resolveExistingPublicSlug as resolveExistingPublicSlugRead,
} from "./publicationPaymentReads";
import {
  readMercadoPagoWebhookEnvelope,
  resolvePaymentById,
  validateMercadoPagoSignature,
} from "./mercadoPagoWebhookEdge";

export type {
  CheckoutOperation,
  CheckoutSessionStatus,
} from "./publicationApprovedSessionFlow";
export type { PublicationStateTransitionAction } from "./publicationPaymentEdge";

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    storageBucket: "reservaeldia-7a440.firebasestorage.app",
  });
}

const db = admin.firestore();
const bucket = getStorage().bucket();

const UNKNOWN_TEMPLATE_ANALYTICS_ID = "unknown-template";
const HISTORY_SCAN_PAGE_SIZE = 250;

const FINALIZATION_REASON = Object.freeze({
  EXPIRED_CHECKOUT_UPDATE: "expired-before-update-checkout",
  EXPIRED_SLUG_AVAILABILITY: "expired-slug-availability-check",
  EXPIRED_RSVP_REQUEST: "expired-rsvp-request",
  SCHEDULED_EXPIRATION: "scheduled-expiration",
  EXPIRED_BEFORE_UPDATE_PUBLISH: "expired-before-update-publish",
});

type SlugReservationStatus = "active" | "consumed" | "released" | "expired";

type CheckoutPricingSnapshot = {
  pricingVersion: number;
  operationType: CheckoutOperation;
  appliedPrice: number;
  currency: "ARS";
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
  pricingSnapshot: CheckoutPricingSnapshot;
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

type PublicationFinalizationResult = {
  slug: string;
  historyId: string | null;
  draftSlug: string | null;
  finalized: boolean;
  alreadyMissing: boolean;
};

type PublicationStateTransitionResult = {
  slug: string;
  estado: string;
  publicadaAt: string;
  venceAt: string;
  pausadaAt: string | null;
  enPapeleraAt: string | null;
};

function serverTimestamp() {
  return admin.firestore.FieldValue.serverTimestamp();
}

function getString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

// Keep the public callable shell on this module while edge contracts live in
// focused helpers. These local adapters preserve the current handler surface.
function getPublicationRef(slug: string) {
  return buildPublicationRef(db, slug);
}

function getPublicationHistoryRef(historyId: string) {
  return buildPublicationHistoryRef(db, historyId);
}

function getReservationRef(slug: string) {
  return buildReservationRef(db, slug);
}

function getSessionRef(sessionId: string) {
  return buildSessionRef(db, sessionId);
}

function getDiscountCodeRef(code: string) {
  return buildDiscountCodeRef(db, code);
}

function getDiscountUsageRef(sessionId: string) {
  return buildDiscountUsageRef(db, sessionId);
}

async function getPublicationPaymentConfig(): Promise<PublicationCheckoutConfig> {
  return loadPublicationPaymentConfig({
    loadConfigDoc: () => db.doc(CHECKOUT_CONFIG_DOC_PATH).get(),
  });
}

async function ensureDraftOwnership(uid: string, draftSlug: string) {
  return ensureDraftOwnershipRead({
    db,
    uid,
    draftSlug,
  });
}

async function resolveExistingPublicSlug(draftSlug: string): Promise<string | null> {
  return resolveExistingPublicSlugRead({
    draftSlug,
    loadDraftData: async () => {
      const draftSnap = await db.collection(BORRADORES_COLLECTION).doc(draftSlug).get();
      return (draftSnap.data() || {}) as Record<string, unknown>;
    },
    loadPublicationBySlug: async (slug) => getPublicationRef(slug).get(),
    queryPublicationsByOriginalDraftSlug: async () =>
      db
        .collection(PUBLICADAS_COLLECTION)
        .where("slugOriginal", "==", draftSlug)
        .limit(5)
        .get(),
    queryPublicationsByLinkedDraftSlug: async () =>
      db
        .collection(PUBLICADAS_COLLECTION)
        .where("borradorSlug", "==", draftSlug)
        .limit(5)
        .get(),
    finalizeExpiredPublication: async (slug) =>
      finalizePublicationBySlug({
        slug,
        reason: FINALIZATION_REASON.EXPIRED_CHECKOUT_UPDATE,
      }),
    isPublicationExpiredData,
  });
}

export function isPublicationExpiredData(
  publicationData: Record<string, unknown>,
  now: Date = new Date()
): boolean {
  if (!publicationData || typeof publicationData !== "object") return false;

  return resolvePublicationLifecycleSnapshotFromData(publicationData, { now }).isExpired;
}

function normalizeDiscountCode(value: unknown): string {
  const raw = getString(value).toUpperCase();
  if (!raw) return "";
  return raw.replace(/[^A-Z0-9_-]/g, "");
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
  currency: "ARS";
  payerEmail: string;
}): Promise<string> {
  const { sessionId, operation, publicSlug, amountArs, currency, payerEmail } = params;
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
        currency_id: currency,
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

async function checkSlugAvailability(
  slug: string,
  uid: string,
  draftSlug: string
): Promise<SlugAvailabilityResult> {
  return checkSlugAvailabilityFlow({
    slug,
    uid,
    draftSlug,
    loadPublication: async () => getPublicationRef(slug).get(),
    loadReservation: async () => {
      const ref = getReservationRef(slug);
      const snap = await ref.get();
      return { ref, snap };
    },
    finalizeExpiredPublication: async () =>
      finalizePublicationBySlug({
        slug,
        reason: FINALIZATION_REASON.EXPIRED_SLUG_AVAILABILITY,
      }),
    isPublicationExpiredData,
    isExpiredAt,
    createUpdatedAtValue: () => serverTimestamp(),
  });
}

async function reserveSlugForSession(params: {
  slug: string;
  uid: string;
  draftSlug: string;
  sessionId: string;
  expiresAt: admin.firestore.Timestamp;
}): Promise<void> {
  const reservationRef = getReservationRef(params.slug);
  const publicRef = getPublicationRef(params.slug);

  await reserveSlugForSessionFlow({
    ...params,
    publicationRef: publicRef,
    reservationRef,
    runTransaction: (updateFn) => db.runTransaction((tx) => updateFn(tx as any)),
    isExpiredAt,
    createCreatedAtValue: () => serverTimestamp(),
    createUpdatedAtValue: () => serverTimestamp(),
  });
}

async function markReservationStatus(params: {
  slug: string;
  sessionId: string;
  nextStatus: SlugReservationStatus;
}): Promise<void> {
  const { slug, sessionId, nextStatus } = params;
  if (!slug) return;

  await markReservationStatusFlow({
    sessionId,
    nextStatus,
    reservationRef: getReservationRef(slug),
    createUpdatedAtValue: () => serverTimestamp(),
  });
}

async function finalizePublicationSnapshot(params: {
  slug: string;
  publicationSnap: FirebaseFirestore.DocumentSnapshot;
  reason: string;
}): Promise<PublicationFinalizationResult> {
  const { slug, publicationSnap, reason } = params;
  const publicationData = publicationSnap.exists
    ? ((publicationSnap.data() || {}) as Record<string, unknown>)
    : {};

  return finalizePublicationSnapshotFlow({
    slug,
    publicationSnap,
    reason,
    draftSlug: publicationSnap.exists
      ? inferDraftSlugFromPublicationData(slug, publicationData)
      : "",
    getHistoryRef: getPublicationHistoryRef,
    getDraftRef: (draftSlug) => db.collection(BORRADORES_COLLECTION).doc(draftSlug),
    reservationRef: getReservationRef(slug),
    createHistoryCreatedAtValue: () => serverTimestamp(),
    createHistoryUpdatedAtValue: () => serverTimestamp(),
    createDraftUpdatedAtValue: () => serverTimestamp(),
    createReservationUpdatedAtValue: () => serverTimestamp(),
    deleteStoragePrefix: (prefix) => bucket.deleteFiles({ prefix }),
    recursiveDelete: (ref) => db.recursiveDelete(ref as FirebaseFirestore.DocumentReference),
    warn: (message, context) => logger.warn(message, context),
    info: (message, context) => logger.info(message, context),
  });
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
  let plannedDraftWrite: Record<string, unknown> | null = null;

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
    linkedDraftSlug = inferDraftSlugFromPublicationData(slug, publicationData);
    const preparedTransition = preparePublicationStateTransitionFlow({
      slug,
      action,
      publicationData,
      publicationSnap,
      linkedDraftSlug,
      now,
      createActiveUpdatedAtValue: () => serverTimestamp(),
      createDraftUpdatedAtValue: () => serverTimestamp(),
    });
    linkedDraftSlug = preparedTransition.linkedDraftSlug;

    tx.set(
      publicationRef,
      preparedTransition.activePublicationWrite,
      { merge: true }
    );

    plannedDraftWrite = preparedTransition.draftWrite;
    transitionResult = preparedTransition.result;
  });

  if (linkedDraftSlug && plannedDraftWrite) {
    const draftRef = db.collection(BORRADORES_COLLECTION).doc(linkedDraftSlug);
    await executePlannedDraftWriteIfExists({
      draftRef,
      draftWrite: plannedDraftWrite,
    });
  }

  if (!transitionResult) {
    throw new HttpsError("internal", "No se pudo actualizar el estado de la invitacion.");
  }

  return transitionResult;
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
      const isDue = isPublicationDueForTrashPurgeFlow({
        publicationData: data,
        publicationSnap: docItem,
        now,
      });

      if (!isDue) {
        skippedNotDue += 1;
        continue;
      }

      await purgeTrashedPublicationFlow({
        slug: docItem.id,
        publicationSnap: docItem,
        extractInitialDraftSlugs: (publicationData) =>
          extractDraftSlugCandidatesFromPublicationData(publicationData),
        queryLinkedDraftsByPublicSlug: (slug) =>
          db
            .collection(BORRADORES_COLLECTION)
            .where("slugPublico", "==", slug)
            .limit(60)
            .get(),
        resetDraftLinks: (request) =>
          clearDraftPublicationLinksAsDraft({
            draftSlug: request.draftSlug,
          }),
        deleteStoragePrefix: (prefix) => bucket.deleteFiles({ prefix }),
        recursiveDelete: (ref) =>
          db.recursiveDelete(ref as FirebaseFirestore.DocumentReference),
        deleteReservation: async (reservationSlug) => {
          await getReservationRef(reservationSlug).delete();
        },
        warn: (message, context) => logger.warn(message, context),
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
    buildLinkedDraftResetWrite({
      updatedAtValue: serverTimestamp(),
    }),
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
  const { plan: plannedLegacyCleanup, historyDocs } =
    await prepareLegacyPublicationCleanupFlow({
      slug,
      uid,
      publicationSnap,
      extractDraftSlugsFromPublicationData: (publicationData) =>
        extractDraftSlugCandidatesFromPublicationData(publicationData),
      loadHistoryDocsForSlug: (uid, slug) => collectUserHistoryDocsForSlug({ uid, slug }),
      queryLinkedDraftsByPublicSlug: (uid, slug) =>
        db
          .collection(BORRADORES_COLLECTION)
          .where("userId", "==", uid)
          .where("slugPublico", "==", slug)
          .limit(25)
          .get(),
    });

  const {
    deletedStoragePrefix,
    deletedActivePublication,
    deletedHistoryDocs,
    cleanedDrafts,
    removedReservation,
  } = await executePlannedLegacyPublicationCleanup({
    plan: plannedLegacyCleanup,
    publicationRef: publicationSnap.exists ? publicationRef : null,
    deleteStoragePrefix: (prefix) => bucket.deleteFiles({ prefix }),
    recursiveDelete: (ref) => db.recursiveDelete(ref as FirebaseFirestore.DocumentReference),
    deleteHistoryDocs: () => deleteDocsInBatches(historyDocs),
    resetDraftLinks: (request) =>
      clearDraftPublicationLinksAsDraft({
        draftSlug: request.draftSlug,
        uid: request.uid,
      }),
    deleteReservationIfExists: async (reservationSlug) => {
      const reservationRef = getReservationRef(reservationSlug);
      const reservationSnap = await reservationRef.get();
      if (!reservationSnap.exists) return false;
      await reservationRef.delete();
      return true;
    },
    warn: (message, context) => logger.warn(message, context),
  });

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

function cloneFirestoreSafe<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

async function buildPublicationRenderArtifacts(
  draftData: Record<string, unknown>
): Promise<{
  draftRenderState: ReturnType<typeof normalizeDraftRenderState>;
  objetosFinales: Record<string, unknown>[];
  seccionesFinales: Record<string, unknown>[];
  rsvp: ModalConfig | null;
  gifts: GiftsConfig | null;
  functionalCtaContract: Awaited<
    ReturnType<typeof preparePublicationRenderState>
  >["functionalCtaContract"];
  validation: ReturnType<typeof validatePreparedPublicationRenderState>;
}> {
  const prepared = await preparePublicationRenderState(draftData);
  const validation = validatePreparedPublicationRenderState({
    rawObjetos: prepared.draftRenderState.objetos,
    rawSecciones: prepared.draftRenderState.secciones,
    objetosFinales: prepared.objetosFinales,
    seccionesFinales: prepared.seccionesFinales,
    rawRsvp: prepared.draftRenderState.rsvp,
    rawGifts: prepared.draftRenderState.gifts,
    functionalCtaContract: prepared.functionalCtaContract,
  });

  return {
    draftRenderState: prepared.draftRenderState,
    objetosFinales: prepared.objetosFinales,
    seccionesFinales: prepared.seccionesFinales,
    rsvp: prepared.functionalCtaContract.rsvp.config
      ? cloneFirestoreSafe(prepared.functionalCtaContract.rsvp.config)
      : null,
    gifts: prepared.functionalCtaContract.gifts.config
      ? cloneFirestoreSafe(prepared.functionalCtaContract.gifts.config)
      : null,
    functionalCtaContract: prepared.functionalCtaContract,
    validation,
  };
}

function assertPublicationValidationCanPublish(
  validation: ReturnType<typeof validatePreparedPublicationRenderState>
): void {
  if (validation.canPublish) return;

  throw new HttpsError(
    "failed-precondition",
    buildPublicationValidationBlockingMessage(validation),
    { validation }
  );
}

function createSlugConflictError(message: string): HttpsError {
  return new HttpsError("already-exists", message);
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
    const existingState = resolvePublicationBackendStateFromData(existingData);
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
  const artifacts = await buildPublicationRenderArtifacts(
    draftData as Record<string, unknown>
  );
  assertPublicationValidationCanPublish(artifacts.validation);

  return executePublicationPublish({
    draftSlug,
    publicSlug: normalizedPublicSlug,
    uid,
    operation,
    paymentSessionId,
    draftData: draftData as Record<string, unknown>,
    existingData,
    artifacts: {
      draftRenderState: artifacts.draftRenderState,
      objetosFinales: artifacts.objetosFinales,
      seccionesFinales: artifacts.seccionesFinales,
      rsvp: artifacts.rsvp,
      gifts: artifacts.gifts,
      functionalCtaContract: artifacts.functionalCtaContract,
    },
    unknownTemplateAnalyticsId: UNKNOWN_TEMPLATE_ANALYTICS_ID,
    createUpdatedAtValue: () => serverTimestamp(),
    createGeneratedAtValue: (date) => admin.firestore.Timestamp.fromDate(date),
    savePublicHtml: async ({ filePath, html }) =>
      bucket.file(filePath).save(html, {
        contentType: "text/html",
        public: true,
        metadata: {
          cacheControl: "public,max-age=3600",
        },
      }),
    applyIconUsageDelta: (input) => applyPublicationIconUsageDelta(input),
    executePublicationWrites: async ({ publicationWrite, draftWrite }) =>
      executePlannedPublicationWrites({
        publicationRef: getPublicationRef(normalizedPublicSlug),
        publicationWrite,
        draftRef: db.collection(BORRADORES_COLLECTION).doc(draftSlug),
        draftWrite,
      }),
    recordPublishedAnalyticsEvent: async (input) =>
      recordBusinessAnalyticsEvent(input),
    warn: (message, context) => logger.warn(message, context),
    logError: (message, context) => logger.error(message, context),
  });
}

async function finalizeApprovedSession(params: {
  sessionId: string;
  fallbackPaymentId: string;
  approvedAt?: string;
}): Promise<CheckoutPaymentResult> {
  const { sessionId, fallbackPaymentId, approvedAt } = params;
  const sessionRef = getSessionRef(sessionId);

  return finalizeApprovedSessionFlow({
    sessionId,
    fallbackPaymentId,
    approvedAt,
    sessionRef,
    runTransaction: (updateFn) => db.runTransaction((tx) => updateFn(tx as any)),
    createUpdatedAtValue: () => serverTimestamp(),
    publishDraftToPublic: (input) => publishDraftToPublic(input),
    updateReservationStatus: (update) => markReservationStatus(update),
    recordDiscountUsageIfNeeded,
    approvedPaymentAnalytics: {
      unknownTemplateAnalyticsId: UNKNOWN_TEMPLATE_ANALYTICS_ID,
      loadDraftData: async (draftSlug) => {
        const draftSnap = await db.collection(BORRADORES_COLLECTION).doc(draftSlug).get();
        return draftSnap.exists
          ? ((draftSnap.data() || {}) as Record<string, unknown>)
          : null;
      },
      loadPublishedData: async (publicSlug) => {
        const publishedSnap = await getPublicationRef(publicSlug).get();
        return publishedSnap.exists
          ? ((publishedSnap.data() || {}) as Record<string, unknown>)
          : null;
      },
      recordEvent: async (input) => recordBusinessAnalyticsEvent(input),
    },
    logError: (message, context) => logger.error(message, context),
  });
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

  return processMercadoPagoPaymentFlow({
    sessionId,
    paymentId,
    paymentStatus,
    paymentStatusDetail,
    approvedAt,
    sessionRef,
    createUpdatedAtValue: () => serverTimestamp(),
    finalizeApprovedSession: (input) => finalizeApprovedSession(input),
  });
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

export async function validateDraftForPublicationHandler(
  request: CallableRequest<{ draftSlug: string }>
) {
  const uid = requireAuth(request);
  const draftSlug = normalizeDraftSlug(request.data?.draftSlug);
  const draft = await ensureDraftOwnership(uid, draftSlug);
  const artifacts = await buildPublicationRenderArtifacts(
    draft.data as Record<string, unknown>
  );

  return {
    draftSlug,
    ...artifacts.validation,
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

  const draft = await ensureDraftOwnership(uid, draftSlug);
  const config = await getPublicationPaymentConfig();
  if (!config.enabled) {
    throw new HttpsError("failed-precondition", "La publicacion con pago esta deshabilitada");
  }
  const checkoutArtifacts = await buildPublicationRenderArtifacts(
    draft.data as Record<string, unknown>
  );
  assertPublicationValidationCanPublish(checkoutArtifacts.validation);
  const pricingConfig = await loadCheckoutPricingConfig({
    context: "createPublicationCheckoutSession",
    operation,
    uid,
    draftSlug,
  });

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

  const amountBaseArs = getPricingForOperation(pricingConfig, operation);
  const discount = await resolveDiscountForCheckout({
    operation,
    amountBaseArs,
    rawDiscountCode: request.data?.discountCode,
  });
  const pricingSnapshot: CheckoutPricingSnapshot = {
    pricingVersion: pricingConfig.version,
    operationType: operation,
    appliedPrice: amountBaseArs,
    currency: pricingConfig.currency,
  };

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
        currency: pricingConfig.currency,
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
    currency: pricingConfig.currency,
    pricingSnapshot,
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
    currency: pricingConfig.currency,
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
  const { ref: sessionRef, data: sessionData } = await readOwnedCheckoutSessionFlow({
    uid,
    sessionId,
    sessionRef: getSessionRef(sessionId),
  });

  if (
    await expireCheckoutSessionIfNeededFlow({
      sessionId,
      sessionData,
      sessionRef,
      isExpiredAt,
      createUpdatedAtValue: () => serverTimestamp(),
      updateReservationStatus: (update) => markReservationStatus(update),
    })
  ) {
    return buildExpiredCheckoutPaymentResult();
  }

  const sessionStatus = getString(sessionData.status) as CheckoutSessionStatus;

  if (sessionStatus === "published") {
    return buildPaymentResultFromSession(sessionData, getString(sessionData.mpPaymentId));
  }

  const amountArs = toAmount(sessionData.amountArs, 0);
  const operation = normalizeOperation(sessionData.operation);

  if (isZeroAmount(amountArs)) {
    const zeroAmountApproval = await autoApproveZeroAmountCheckoutSessionFlow({
      sessionId,
      sessionData,
      sessionRef,
      createUpdatedAtValue: () => serverTimestamp(),
    });

    return finalizeApprovedSession({
      sessionId,
      fallbackPaymentId: zeroAmountApproval.paymentId,
      approvedAt: zeroAmountApproval.approvedAt,
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

  const { ref: sessionRef, data } = await readOwnedCheckoutSessionFlow({
    uid,
    sessionId,
    sessionRef: getSessionRef(sessionId),
  });

  if (
    await expireCheckoutSessionIfNeededFlow({
      sessionId,
      sessionData: data,
      sessionRef,
      isExpiredAt,
      createUpdatedAtValue: () => serverTimestamp(),
      updateReservationStatus: (update) => markReservationStatus(update),
    })
  ) {
    return buildExpiredCheckoutStatusResponse();
  }

  return buildCheckoutStatusResponseFromSession(data);
}

export async function retryPaidPublicationWithNewSlugHandler(
  request: CallableRequest<{ sessionId: string; newPublicSlug: string }>
): Promise<RetryPaidPublicationResult> {
  const uid = requireAuth(request);
  const sessionId = normalizeSessionId(request.data?.sessionId);

  const { ref: sessionRef, data } = await readOwnedCheckoutSessionFlow({
    uid,
    sessionId,
    sessionRef: getSessionRef(sessionId),
  });
  const status = getString(data.status) as CheckoutSessionStatus;

  if (status === "published") {
    return buildPublishedRetryResult(getString(data.publicUrl) || undefined);
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
    return buildAwaitingRetryResult("El enlace elegido no esta disponible.");
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
    return buildPublishedRetryResult(
      result.publicUrl,
      "Invitacion publicada correctamente."
    );
  }

  return buildAwaitingRetryResult(
    result.message || "No se pudo publicar con ese enlace. Intenta con otro."
  );
}

export async function publishWithApprovedPaymentSession(params: {
  uid: string;
  draftSlug: string;
  slugPublico?: string;
  paymentSessionId: string;
}): Promise<{ success: true; url: string }> {
  const { uid, draftSlug, slugPublico, paymentSessionId } = params;

  await ensureDraftOwnership(uid, draftSlug);

  const session = await readOwnedCheckoutSessionFlow({
    uid,
    sessionId: paymentSessionId,
    sessionRef: getSessionRef(paymentSessionId),
  });
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

export async function processMercadoPagoWebhookRequest(req: Request, res: Response): Promise<void> {
  try {
    const { signatureHeader, requestId, action, dataId, topic } =
      readMercadoPagoWebhookEnvelope({
        headers: req.headers as Record<string, unknown>,
        query: req.query as Record<string, unknown>,
        body: req.body,
      });

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
      getWebhookSecret: () => getMercadoPagoWebhookSecret(),
    });

    if (!signatureValid) {
      res.status(401).json({ ok: false, message: "Firma invalida" });
      return;
    }

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

    const payment = await resolvePaymentById({
      paymentId: dataId,
      loadPayment: async (id) => {
        const paymentClient = getMercadoPagoPaymentClient();
        return (await paymentClient.get({ id })) as any;
      },
    });
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
