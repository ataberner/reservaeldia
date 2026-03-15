import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";
import { HttpsError, onCall, type CallableRequest } from "firebase-functions/v2/https";
import { requireSuperAdmin } from "../auth/adminAuth";

const OPTIONS = {
  region: "us-central1" as const,
  cors: ["https://reservaeldia.com.ar", "http://localhost:3000"],
};

const SITE_SETTINGS_COLLECTION = "site_settings";
const PRICING_DOC_ID = "pricing";
const HISTORY_COLLECTION = "history";
const LEGACY_PRICING_DOC_PATH = "app_config/publicationPayments";
const PRICING_CURRENCY = "ARS" as const;
const DEFAULT_HISTORY_LIMIT = 20;
const MAX_HISTORY_LIMIT = 50;

type PricingSource = "site_settings" | "legacy_app_config";

export type PricingOperationType = "new" | "update";

export type PricingConfig = {
  publishPrice: number;
  updatePrice: number;
  currency: typeof PRICING_CURRENCY;
  updatedAt: unknown;
  updatedByUid: string | null;
  updatedByEmail: string | null;
  version: number;
  lastChangeReason: string | null;
};

export type EffectivePricingConfig = PricingConfig & {
  source: PricingSource;
};

type PricingHistoryEntry = {
  version: number;
  previousPublishPrice: number | null;
  previousUpdatePrice: number | null;
  newPublishPrice: number;
  newUpdatePrice: number;
  changedAt: unknown;
  changedByUid: string | null;
  changedByEmail: string | null;
  reason: string | null;
};

function ensureApp() {
  if (admin.apps.length > 0) return admin.app();
  return admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    storageBucket:
      process.env.FIREBASE_STORAGE_BUCKET || "reservaeldia-7a440.firebasestorage.app",
  });
}

function db() {
  ensureApp();
  return admin.firestore();
}

function pricingDocRef() {
  return db().collection(SITE_SETTINGS_COLLECTION).doc(PRICING_DOC_ID);
}

function pricingHistoryCollection() {
  return pricingDocRef().collection(HISTORY_COLLECTION);
}

function legacyPricingDocRef() {
  return db().doc(LEGACY_PRICING_DOC_PATH);
}

function normalizeText(value: unknown): string {
  return String(value || "").trim();
}

function optionalText(value: unknown, max = 500): string | null {
  const normalized = normalizeText(value).slice(0, max);
  return normalized || null;
}

function parseEnvBoolean(raw: unknown, fallback: boolean): boolean {
  if (typeof raw !== "string") return fallback;
  const normalized = raw.trim().toLowerCase();
  if (!normalized) return fallback;
  if (["false", "0", "no"].includes(normalized)) return false;
  if (["true", "1", "yes", "si"].includes(normalized)) return true;
  return fallback;
}

export function isLegacyPricingFallbackEnabled(): boolean {
  return parseEnvBoolean(process.env.PRICING_CONFIG_ALLOW_LEGACY_FALLBACK, true);
}

function serialize(value: unknown): unknown {
  if (value instanceof admin.firestore.Timestamp) {
    return value.toDate().toISOString();
  }
  if (Array.isArray(value)) {
    return value.map((entry) => serialize(entry));
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    Object.entries(value as Record<string, unknown>).forEach(([key, nested]) => {
      out[key] = serialize(nested);
    });
    return out;
  }
  return value;
}

function parseRequiredNonNegativeInteger(
  value: unknown,
  fieldName: string,
  errorCode: "invalid-argument" | "failed-precondition"
): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || !Number.isInteger(parsed)) {
    throw new HttpsError(errorCode, `${fieldName} debe ser un entero mayor o igual a 0.`);
  }
  return parsed;
}

function parseRequiredPositiveInteger(
  value: unknown,
  fieldName: string
): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0 || !Number.isInteger(parsed)) {
    throw new HttpsError("invalid-argument", `${fieldName} debe ser un entero positivo.`);
  }
  return parsed;
}

function parseOptionalPricingCurrency(
  value: unknown
): typeof PRICING_CURRENCY {
  if (value === null || value === undefined || value === "") {
    return PRICING_CURRENCY;
  }

  const normalized = normalizeText(value).toUpperCase();
  if (normalized !== PRICING_CURRENCY) {
    throw new HttpsError("invalid-argument", "currency debe ser ARS.");
  }

  return PRICING_CURRENCY;
}

function parseOptionalCursorVersion(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0 || !Number.isInteger(parsed)) {
    throw new HttpsError("invalid-argument", "cursorVersion invalido.");
  }
  return parsed;
}

function parseHistoryLimit(value: unknown): number {
  if (value === null || value === undefined || value === "") return DEFAULT_HISTORY_LIMIT;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0 || !Number.isInteger(parsed)) {
    throw new HttpsError("invalid-argument", "limit invalido.");
  }
  return Math.min(MAX_HISTORY_LIMIT, parsed);
}

function createMissingPricingConfigError(): HttpsError {
  return new HttpsError(
    "failed-precondition",
    "La configuracion de precios no esta inicializada. Contacta a un superadmin."
  );
}

function normalizeStoredPricingConfig(value: unknown): PricingConfig {
  const source =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};

  return {
    publishPrice: parseRequiredNonNegativeInteger(
      source.publishPrice,
      "publishPrice",
      "failed-precondition"
    ),
    updatePrice: parseRequiredNonNegativeInteger(
      source.updatePrice,
      "updatePrice",
      "failed-precondition"
    ),
    currency: PRICING_CURRENCY,
    updatedAt: source.updatedAt || null,
    updatedByUid: optionalText(source.updatedByUid, 128),
    updatedByEmail: optionalText(source.updatedByEmail, 320),
    version: parseRequiredPositiveInteger(source.version, "version"),
    lastChangeReason: optionalText(source.lastChangeReason, 500),
  };
}

function normalizeLegacyPricingConfig(value: unknown): EffectivePricingConfig {
  const source =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};

  return {
    publishPrice: parseRequiredNonNegativeInteger(
      source.publishAmountArs,
      "publishAmountArs",
      "failed-precondition"
    ),
    updatePrice: parseRequiredNonNegativeInteger(
      source.updateAmountArs,
      "updateAmountArs",
      "failed-precondition"
    ),
    currency: PRICING_CURRENCY,
    updatedAt: source.updatedAt || null,
    updatedByUid: optionalText(source.updatedByUid, 128),
    updatedByEmail: optionalText(source.updatedByEmail, 320),
    version: 0,
    lastChangeReason: null,
    source: "legacy_app_config",
  };
}

function buildConfigResponse(config: PricingConfig) {
  return serialize(config);
}

function normalizeHistoryEntry(value: unknown): PricingHistoryEntry {
  const source =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};

  return {
    version: parseRequiredPositiveInteger(source.version, "version"),
    previousPublishPrice:
      source.previousPublishPrice === null || source.previousPublishPrice === undefined
        ? null
        : parseRequiredNonNegativeInteger(
            source.previousPublishPrice,
            "previousPublishPrice",
            "failed-precondition"
          ),
    previousUpdatePrice:
      source.previousUpdatePrice === null || source.previousUpdatePrice === undefined
        ? null
        : parseRequiredNonNegativeInteger(
            source.previousUpdatePrice,
            "previousUpdatePrice",
            "failed-precondition"
          ),
    newPublishPrice: parseRequiredNonNegativeInteger(
      source.newPublishPrice,
      "newPublishPrice",
      "failed-precondition"
    ),
    newUpdatePrice: parseRequiredNonNegativeInteger(
      source.newUpdatePrice,
      "newUpdatePrice",
      "failed-precondition"
    ),
    changedAt: source.changedAt || null,
    changedByUid: optionalText(source.changedByUid, 128),
    changedByEmail: optionalText(source.changedByEmail, 320),
    reason: optionalText(source.reason, 500),
  };
}

function buildHistoryResponse(entry: PricingHistoryEntry) {
  return serialize(entry);
}

async function resolveActorEmail(request: CallableRequest<unknown>, uid: string) {
  const fromToken = optionalText(
    (request.auth?.token as Record<string, unknown> | undefined)?.email,
    320
  );
  if (fromToken) return fromToken;

  try {
    ensureApp();
    const userRecord = await admin.auth().getUser(uid);
    return optionalText(userRecord.email, 320);
  } catch (error) {
    logger.warn("[pricing-config] no se pudo resolver email del actor", {
      uid,
      error: error instanceof Error ? error.message : String(error || ""),
    });
    return null;
  }
}

export async function getStoredPricingConfigOrThrow(): Promise<PricingConfig> {
  const snap = await pricingDocRef().get();
  if (!snap.exists) {
    throw createMissingPricingConfigError();
  }
  return normalizeStoredPricingConfig(snap.data());
}

export async function loadCheckoutPricingConfig(params: {
  context: string;
  operation?: PricingOperationType;
  uid?: string;
  draftSlug?: string;
}): Promise<EffectivePricingConfig> {
  const snap = await pricingDocRef().get();
  if (snap.exists) {
    return {
      ...normalizeStoredPricingConfig(snap.data()),
      source: "site_settings",
    };
  }

  if (!isLegacyPricingFallbackEnabled()) {
    throw createMissingPricingConfigError();
  }

  const legacySnap = await legacyPricingDocRef().get();
  if (!legacySnap.exists) {
    throw createMissingPricingConfigError();
  }

  logger.warn("[pricing-config] usando fallback legado para checkout", {
    context: params.context,
    missingPath: `${SITE_SETTINGS_COLLECTION}/${PRICING_DOC_ID}`,
    fallbackPath: LEGACY_PRICING_DOC_PATH,
    operation: params.operation || null,
    uid: params.uid || null,
    draftSlug: params.draftSlug || null,
  });

  return normalizeLegacyPricingConfig(legacySnap.data());
}

export function getPricingForOperation(
  config: Pick<PricingConfig, "publishPrice" | "updatePrice">,
  operation: PricingOperationType
): number {
  return operation === "update" ? config.updatePrice : config.publishPrice;
}

export const adminGetPricingConfigV1 = onCall(
  OPTIONS,
  async (request: CallableRequest<Record<string, never>>) => {
    requireSuperAdmin(request);
    const config = await getStoredPricingConfigOrThrow();

    return {
      config: buildConfigResponse(config),
    };
  }
);

export const adminListPricingHistoryV1 = onCall(
  OPTIONS,
  async (request: CallableRequest<{ limit?: number; cursorVersion?: number }>) => {
    requireSuperAdmin(request);
    const limit = parseHistoryLimit(request.data?.limit);
    const cursorVersion = parseOptionalCursorVersion(request.data?.cursorVersion);

    let historyQuery: FirebaseFirestore.Query = pricingHistoryCollection()
      .orderBy("version", "desc")
      .limit(limit);

    if (cursorVersion !== null) {
      historyQuery = historyQuery.startAfter(cursorVersion);
    }

    const snapshot = await historyQuery.get();
    const items = snapshot.docs.map((docSnap) =>
      buildHistoryResponse(normalizeHistoryEntry(docSnap.data()))
    );
    const nextCursorVersion =
      snapshot.size === limit
        ? Number(snapshot.docs[snapshot.docs.length - 1]?.data()?.version || 0) || null
        : null;

    return {
      items,
      nextCursorVersion,
    };
  }
);

export const adminUpdatePricingConfigV1 = onCall(
  OPTIONS,
  async (
    request: CallableRequest<{
      publishPrice: number;
      updatePrice: number;
      currency?: string;
      expectedVersion: number;
      reason?: string | null;
    }>
  ) => {
    const uid = requireSuperAdmin(request);
    const actorEmail = await resolveActorEmail(request, uid);
    const publishPrice = parseRequiredNonNegativeInteger(
      request.data?.publishPrice,
      "publishPrice",
      "invalid-argument"
    );
    const updatePrice = parseRequiredNonNegativeInteger(
      request.data?.updatePrice,
      "updatePrice",
      "invalid-argument"
    );
    const expectedVersion = parseRequiredPositiveInteger(
      request.data?.expectedVersion,
      "expectedVersion"
    );
    const currency = parseOptionalPricingCurrency(request.data?.currency);
    const reason = optionalText(request.data?.reason, 500);

    const docRef = pricingDocRef();
    let nextVersion = 0;

    await db().runTransaction(async (tx) => {
      const snap = await tx.get(docRef);
      if (!snap.exists) {
        throw createMissingPricingConfigError();
      }

      const currentConfig = normalizeStoredPricingConfig(snap.data());
      if (currentConfig.version !== expectedVersion) {
        throw new HttpsError(
          "aborted",
          "La configuracion cambio mientras editabas. Recarga la seccion y vuelve a intentarlo."
        );
      }

      if (
        currentConfig.publishPrice === publishPrice &&
        currentConfig.updatePrice === updatePrice
      ) {
        throw new HttpsError(
          "invalid-argument",
          "Debes modificar al menos uno de los precios antes de guardar."
        );
      }

      nextVersion = currentConfig.version + 1;
      const historyRef = pricingHistoryCollection().doc(String(nextVersion));

      tx.set(historyRef, {
        previousPublishPrice: currentConfig.publishPrice,
        previousUpdatePrice: currentConfig.updatePrice,
        newPublishPrice: publishPrice,
        newUpdatePrice: updatePrice,
        changedAt: admin.firestore.FieldValue.serverTimestamp(),
        changedByUid: uid,
        changedByEmail: actorEmail || null,
        reason,
        version: nextVersion,
      });

      tx.set(
        docRef,
        {
          publishPrice,
          updatePrice,
          currency,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedByUid: uid,
          updatedByEmail: actorEmail || null,
          version: nextVersion,
          lastChangeReason: reason,
        },
        { merge: false }
      );
    });

    const [savedConfigSnap, savedHistorySnap] = await Promise.all([
      docRef.get(),
      pricingHistoryCollection().doc(String(nextVersion)).get(),
    ]);

    if (!savedConfigSnap.exists || !savedHistorySnap.exists) {
      throw new HttpsError("internal", "No se pudo confirmar la actualizacion de precios.");
    }

    return {
      config: buildConfigResponse(normalizeStoredPricingConfig(savedConfigSnap.data())),
      change: buildHistoryResponse(normalizeHistoryEntry(savedHistorySnap.data())),
    };
  }
);
