export type IconCatalogEnforcementMode = "safe" | "strict" | "observe";

const DEFAULT_CORS = ["https://reservaeldia.com.ar", "http://localhost:3000"];

function normalizeEnforcementMode(value: string): IconCatalogEnforcementMode {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "strict") return "strict";
  if (normalized === "observe") return "observe";
  return "safe";
}

export const ICON_CATALOG_COLLECTION = "iconos";
export const ICON_CATALOG_ARCHIVED_COLLECTION = "iconos_archived";
export const ICON_CATALOG_AUDIT_COLLECTION = "iconos_audit";
export const ICON_USAGE_SNAPSHOT_COLLECTION = "iconos_usage_snapshots";

export const ICON_CATALOG_STORAGE_PREFIX = "iconos/";
export const ICON_CATALOG_ASSET_TYPE_ICON = "icon";
export const ICON_CATALOG_ASSET_TYPE_DECORATION = "decoracion";

export const ICON_CATALOG_SCHEMA_VERSION = 2;
export const ICON_CATALOG_PROCESSOR_VERSION = "icon-catalog-v2.0.0";

export const ICON_CATALOG_MAX_SVG_BYTES_HARD = 500 * 1024;
export const ICON_CATALOG_MAX_SVG_BYTES_WARN = 200 * 1024;
export const ICON_CATALOG_MAX_KEYWORDS = 64;
export const ICON_CATALOG_MAX_CATEGORIES = 12;
export const ICON_CATALOG_MAX_SEARCH_TOKENS = 200;
export const ICON_CATALOG_MAX_LIST_LIMIT = 400;
export const ICON_CATALOG_DEFAULT_LIST_LIMIT = 100;

export const ICON_CATALOG_DAILY_USAGE_SCAN_CRON = "15 3 * * *";
export const ICON_CATALOG_DAILY_RECONCILE_CRON = "45 3 * * *";

export const ICON_CATALOG_CALLABLE_OPTIONS = {
  region: "us-central1",
  cors: DEFAULT_CORS,
};

export const ICON_CATALOG_TRIGGER_OPTIONS = {
  region: "us-central1",
};

export const ICONOS_V2_ENABLED = String(
  process.env.ICONOS_V2_ENABLED ?? "true"
).toLowerCase() !== "false";

export const ICONOS_V2_ENFORCEMENT: IconCatalogEnforcementMode =
  normalizeEnforcementMode(process.env.ICONOS_V2_ENFORCEMENT || "safe");

export const ICONOS_V2_AUTO_NORMALIZE_SAFE = String(
  process.env.ICONOS_V2_AUTO_NORMALIZE_SAFE ?? "true"
).toLowerCase() !== "false";

export const ICONOS_V2_AUTO_NORMALIZE_CURRENTCOLOR = String(
  process.env.ICONOS_V2_AUTO_NORMALIZE_CURRENTCOLOR ?? "false"
).toLowerCase() === "true";

