export type DecorCatalogEnforcementMode = "safe" | "strict" | "observe";

const DEFAULT_CORS = ["https://reservaeldia.com.ar", "http://localhost:3000"];

function normalizeEnforcementMode(value: string): DecorCatalogEnforcementMode {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "strict") return "strict";
  if (normalized === "observe") return "observe";
  return "safe";
}

export const DECOR_CATALOG_COLLECTION = "decoraciones";
export const DECOR_CATALOG_ARCHIVED_COLLECTION = "decoraciones_archived";
export const DECOR_CATALOG_AUDIT_COLLECTION = "decoraciones_audit";

export const DECOR_CATALOG_STORAGE_ORIGINALS_PREFIX = "decoraciones/originals/";
export const DECOR_CATALOG_STORAGE_THUMBNAILS_PREFIX = "decoraciones/thumbnails/";
export const DECOR_CATALOG_ASSET_TYPE = "decoracion";

export const DECOR_CATALOG_SCHEMA_VERSION = 1;
export const DECOR_CATALOG_PROCESSOR_VERSION = "decor-catalog-v1.0.0";

export const DECOR_CATALOG_MAX_UPLOAD_BYTES_HARD = 12 * 1024 * 1024;
export const DECOR_CATALOG_MAX_UPLOAD_BYTES_WARN = 5 * 1024 * 1024;
export const DECOR_CATALOG_MAX_KEYWORDS = 64;
export const DECOR_CATALOG_MAX_CATEGORIES = 12;
export const DECOR_CATALOG_MAX_SEARCH_TOKENS = 200;
export const DECOR_CATALOG_MAX_LIST_LIMIT = 400;
export const DECOR_CATALOG_DEFAULT_LIST_LIMIT = 100;

export const DECOR_CATALOG_CALLABLE_OPTIONS = {
  region: "us-central1" as const,
  cpu: "gcf_gen1" as const,
  cors: DEFAULT_CORS,
};

export const DECOR_CATALOG_TRIGGER_OPTIONS = {
  region: "us-central1" as const,
  cpu: "gcf_gen1" as const,
};

export const DECOR_V1_ENABLED = String(
  process.env.DECOR_V1_ENABLED ?? "true"
).toLowerCase() !== "false";

export const DECOR_V1_ENFORCEMENT: DecorCatalogEnforcementMode =
  normalizeEnforcementMode(process.env.DECOR_V1_ENFORCEMENT || "safe");
