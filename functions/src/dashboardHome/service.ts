import * as admin from "firebase-admin";
import { HttpsError, onCall, type CallableRequest } from "firebase-functions/v2/https";
import { requireAuth, requireSuperAdmin } from "../auth/adminAuth";

const OPTIONS = {
  region: "us-central1" as const,
  cors: ["https://reservaeldia.com.ar", "http://localhost:3000"],
};

const SITE_SETTINGS_COLLECTION = "site_settings";
const DASHBOARD_HOME_DOC_ID = "dashboard_home";
const TEMPLATE_TAGS_COLLECTION = "plantillas_tags";
const CURRENT_CONFIG_VERSION = 1;

type DashboardHomeFeaturedRow = {
  active: boolean;
  tagSlug: string;
};

type DashboardHomeCategoryRow = {
  id: string;
  tagSlug: string;
  active: boolean;
  order: number;
};

type DashboardHomeConfig = {
  version: number;
  featuredRow: DashboardHomeFeaturedRow;
  categoryRows: DashboardHomeCategoryRow[];
  updatedAt: unknown;
  updatedByUid: string;
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

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function normalizeText(value: unknown): string {
  return String(value || "").trim();
}

function sanitizeSlug(value: unknown): string {
  return normalizeText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function normalizeBoolean(value: unknown, fallback = false): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes", "si", "sí"].includes(normalized)) return true;
    if (["false", "0", "no"].includes(normalized)) return false;
  }
  return fallback;
}

function normalizeOrder(value: unknown, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.round(parsed));
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

function buildDefaultConfig(): DashboardHomeConfig {
  return {
    version: CURRENT_CONFIG_VERSION,
    featuredRow: {
      active: false,
      tagSlug: "",
    },
    categoryRows: [],
    updatedAt: null,
    updatedByUid: "",
  };
}

async function loadTagCatalogBySlug(): Promise<Map<string, string>> {
  const snapshot = await db().collection(TEMPLATE_TAGS_COLLECTION).get();
  const tagMap = new Map<string, string>();

  snapshot.docs.forEach((docSnapshot) => {
    const data = asObject(docSnapshot.data());
    const slug = sanitizeSlug(data.slug || docSnapshot.id);
    const label = normalizeText(data.label) || docSnapshot.id;
    if (!slug || !label) return;
    if (tagMap.has(slug)) return;
    tagMap.set(slug, label);
  });

  return tagMap;
}

function normalizeFeaturedRow(
  value: unknown,
  tagCatalogBySlug: Map<string, string>,
  options: { strict: boolean }
): DashboardHomeFeaturedRow {
  const source = asObject(value);
  const active = normalizeBoolean(source.active, false);
  const tagSlug = sanitizeSlug(source.tagSlug || source.tag);

  if (!tagSlug) {
    if (options.strict && active) {
      throw new HttpsError(
        "invalid-argument",
        "La fila destacada debe usar una etiqueta existente."
      );
    }
    return {
      active: false,
      tagSlug: "",
    };
  }

  if (!tagCatalogBySlug.has(tagSlug)) {
    if (options.strict) {
      throw new HttpsError(
        "invalid-argument",
        `La etiqueta destacada "${tagSlug}" no existe en el catalogo editorial.`
      );
    }
    return {
      active: false,
      tagSlug: "",
    };
  }

  return {
    active,
    tagSlug,
  };
}

function normalizeCategoryRows(
  value: unknown,
  tagCatalogBySlug: Map<string, string>,
  options: { strict: boolean; featuredTagSlug: string }
): DashboardHomeCategoryRow[] {
  const source = Array.isArray(value) ? value : [];
  const rows: DashboardHomeCategoryRow[] = [];
  const seenIds = new Set<string>();
  const seenTagSlugs = new Set<string>();

  source.forEach((entry, index) => {
    const item = asObject(entry);
    const tagSlug = sanitizeSlug(item.tagSlug || item.tag);
    const fallbackOrder = (index + 1) * 10;
    const active = normalizeBoolean(item.active, true);

    if (!tagSlug) {
      if (options.strict) {
        throw new HttpsError(
          "invalid-argument",
          "Cada categoria del dashboard debe usar una etiqueta existente."
        );
      }
      return;
    }

    if (!tagCatalogBySlug.has(tagSlug)) {
      if (options.strict) {
        throw new HttpsError(
          "invalid-argument",
          `La etiqueta "${tagSlug}" no existe en el catalogo editorial.`
        );
      }
      return;
    }

    if (tagSlug === options.featuredTagSlug) {
      if (options.strict) {
        throw new HttpsError(
          "invalid-argument",
          `La etiqueta "${tagSlug}" ya esta asignada a Plantillas destacadas.`
        );
      }
      return;
    }

    if (seenTagSlugs.has(tagSlug)) {
      if (options.strict) {
        throw new HttpsError(
          "invalid-argument",
          `La etiqueta "${tagSlug}" esta repetida en las categorias del dashboard.`
        );
      }
      return;
    }

    const idBase = sanitizeSlug(item.id || tagSlug) || `categoria-${index + 1}`;
    const id = seenIds.has(idBase) ? `${idBase}-${index + 1}` : idBase;
    seenIds.add(id);
    seenTagSlugs.add(tagSlug);

    rows.push({
      id,
      tagSlug,
      active,
      order: normalizeOrder(item.order, fallbackOrder),
    });
  });

  return rows.sort((left, right) => {
    const orderDelta = left.order - right.order;
    if (orderDelta !== 0) return orderDelta;
    return left.tagSlug.localeCompare(right.tagSlug);
  });
}

function normalizeDashboardHomeConfig(
  value: unknown,
  tagCatalogBySlug: Map<string, string>,
  options: { strict: boolean }
): DashboardHomeConfig {
  const source = asObject(value);
  const featuredRow = normalizeFeaturedRow(source.featuredRow, tagCatalogBySlug, options);
  const categoryRows = normalizeCategoryRows(source.categoryRows, tagCatalogBySlug, {
    strict: options.strict,
    featuredTagSlug: featuredRow.tagSlug,
  });

  return {
    version: CURRENT_CONFIG_VERSION,
    featuredRow,
    categoryRows,
    updatedAt: source.updatedAt || null,
    updatedByUid: normalizeText(source.updatedByUid),
  };
}

async function loadDashboardHomeConfig(
  tagCatalogBySlug: Map<string, string>
): Promise<DashboardHomeConfig> {
  const snapshot = await db()
    .collection(SITE_SETTINGS_COLLECTION)
    .doc(DASHBOARD_HOME_DOC_ID)
    .get();

  if (!snapshot.exists) {
    return buildDefaultConfig();
  }

  return normalizeDashboardHomeConfig(snapshot.data(), tagCatalogBySlug, {
    strict: false,
  });
}

function buildConfigResponse(
  config: DashboardHomeConfig,
  tagCatalogBySlug: Map<string, string>
) {
  return {
    version: CURRENT_CONFIG_VERSION,
    featuredRow: {
      active: config.featuredRow.active === true,
      tagSlug: config.featuredRow.tagSlug,
      tagLabel:
        config.featuredRow.tagSlug && tagCatalogBySlug.has(config.featuredRow.tagSlug)
          ? tagCatalogBySlug.get(config.featuredRow.tagSlug)
          : "",
    },
    categoryRows: config.categoryRows.map((row) => ({
      id: row.id,
      tagSlug: row.tagSlug,
      tagLabel: tagCatalogBySlug.get(row.tagSlug) || "",
      active: row.active === true,
      order: row.order,
    })),
    updatedAt: serialize(config.updatedAt),
    updatedByUid: config.updatedByUid || "",
  };
}

export const getDashboardHomeConfigV1 = onCall(
  OPTIONS,
  async (request: CallableRequest<Record<string, never>>) => {
    requireAuth(request);

    const tagCatalogBySlug = await loadTagCatalogBySlug();
    const config = await loadDashboardHomeConfig(tagCatalogBySlug);

    return {
      config: buildConfigResponse(config, tagCatalogBySlug),
    };
  }
);

export const adminUpsertDashboardHomeConfigV1 = onCall(
  OPTIONS,
  async (request: CallableRequest<Record<string, unknown>>) => {
    const uid = requireSuperAdmin(request);
    const source =
      request.data?.config && typeof request.data.config === "object"
        ? request.data.config
        : request.data;

    const tagCatalogBySlug = await loadTagCatalogBySlug();
    const config = normalizeDashboardHomeConfig(source, tagCatalogBySlug, {
      strict: true,
    });

    const payload = {
      version: CURRENT_CONFIG_VERSION,
      featuredRow: {
        active: config.featuredRow.active === true,
        tagSlug: config.featuredRow.tagSlug,
      },
      categoryRows: config.categoryRows.map((row) => ({
        id: row.id,
        tagSlug: row.tagSlug,
        active: row.active === true,
        order: row.order,
      })),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedByUid: uid,
    };

    const docRef = db().collection(SITE_SETTINGS_COLLECTION).doc(DASHBOARD_HOME_DOC_ID);
    await docRef.set(payload, { merge: false });

    const savedSnapshot = await docRef.get();
    const savedConfig = normalizeDashboardHomeConfig(savedSnapshot.data(), tagCatalogBySlug, {
      strict: false,
    });

    return {
      config: buildConfigResponse(savedConfig, tagCatalogBySlug),
    };
  }
);
