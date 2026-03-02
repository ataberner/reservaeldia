import {
  DECOR_CATALOG_ASSET_TYPE,
  DECOR_CATALOG_MAX_CATEGORIES,
  DECOR_CATALOG_MAX_KEYWORDS,
  DECOR_CATALOG_MAX_SEARCH_TOKENS,
} from "./config";

export type NormalizedDecorMetadata = {
  nombre: string;
  categoria: string;
  categorias: string[];
  keywords: string[];
  tags: string[];
  searchTokens: string[];
  searchText: string;
  priority: number;
  popular: boolean;
  assetType: "decoracion";
  format: string | null;
};

function normalizeToken(value: unknown): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\-_ ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeName(value: unknown): string {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 140);
}

function parseList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((entry) => normalizeToken(entry)).filter(Boolean);
  }

  if (typeof value === "string") {
    return value
      .split(",")
      .map((entry) => normalizeToken(entry))
      .filter(Boolean);
  }

  return [];
}

function uniqueList(values: string[], maxSize: number): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    if (!value || seen.has(value)) continue;
    seen.add(value);
    out.push(value);
    if (out.length >= maxSize) break;
  }
  return out;
}

function guessFormat(params: {
  format?: unknown;
  nombre?: unknown;
  url?: unknown;
  contentType?: unknown;
}): string | null {
  const explicit = normalizeToken(params.format);
  if (explicit) return explicit === "jpeg" ? "jpg" : explicit;

  const fromContentType = String(params.contentType || "").toLowerCase().trim();
  if (fromContentType === "image/svg+xml") return "svg";
  if (fromContentType === "image/png") return "png";
  if (fromContentType === "image/jpeg") return "jpg";
  if (fromContentType === "image/webp") return "webp";

  const raw = `${String(params.nombre || "")} ${String(params.url || "")}`.toLowerCase();
  const clean = raw.split("?")[0].split("#")[0];
  const ext = clean.split(".").pop() || "";
  if (!ext) return null;
  return ext === "jpeg" ? "jpg" : ext;
}

function derivePriority(rawPriority: unknown, rawPopular: unknown): {
  priority: number;
  popular: boolean;
} {
  const parsed = Number(rawPriority);
  if (Number.isFinite(parsed)) {
    const priority = Math.max(-9999, Math.min(9999, Math.round(parsed)));
    return { priority, popular: priority > 0 };
  }

  const popular = rawPopular === true;
  return { priority: popular ? 1 : 0, popular };
}

function buildSearchTokens(input: {
  nombre: string;
  categorias: string[];
  keywords: string[];
  tags: string[];
}): string[] {
  const baseName = normalizeToken(input.nombre);
  const slugName = baseName.replace(/\s+/g, "-");
  return uniqueList(
    [baseName, slugName, ...input.categorias, ...input.keywords, ...input.tags],
    DECOR_CATALOG_MAX_SEARCH_TOKENS
  );
}

export function normalizeDecorMetadata(raw: Record<string, unknown>): NormalizedDecorMetadata {
  const nombre = normalizeName(raw.nombre || raw.name || raw.label || "");
  const categorias = uniqueList(
    [
      ...parseList(raw.categorias),
      ...parseList(raw.categoria),
      ...parseList(raw.category),
    ],
    DECOR_CATALOG_MAX_CATEGORIES
  );
  const keywords = uniqueList(
    [
      ...parseList(raw.keywords),
      ...parseList(raw.keyword),
      ...parseList(raw.tags),
    ],
    DECOR_CATALOG_MAX_KEYWORDS
  );
  const tags = uniqueList(
    [...parseList(raw.tags), ...parseList(raw.keywords)],
    DECOR_CATALOG_MAX_KEYWORDS
  );
  const { priority, popular } = derivePriority(raw.priority, raw.popular);
  const searchTokens = buildSearchTokens({ nombre, categorias, keywords, tags });
  const searchText = searchTokens.join(" ");
  const categoria = categorias[0] || "";
  const format = guessFormat({
    format: raw.format || raw.formato || raw.ext,
    nombre,
    url: raw.url,
    contentType: raw.contentType,
  });

  return {
    nombre,
    categoria,
    categorias,
    keywords,
    tags,
    searchTokens,
    searchText,
    priority,
    popular,
    assetType: DECOR_CATALOG_ASSET_TYPE,
    format,
  };
}

export function mergeLegacyMetadata(
  raw: Record<string, unknown>,
  normalized: NormalizedDecorMetadata
): Record<string, unknown> {
  return {
    nombre: normalized.nombre || String(raw.nombre || "").trim(),
    categoria: normalized.categoria,
    categorias: normalized.categorias,
    keywords: normalized.keywords,
    tags: normalized.tags,
    priority: normalized.priority,
    popular: normalized.popular,
    assetType: normalized.assetType,
    format: normalized.format,
    searchTokens: normalized.searchTokens,
    searchText: normalized.searchText,
  };
}

export function normalizeStatus(
  value: unknown
): "active" | "archived" | "processing" | "rejected" {
  const normalized = normalizeToken(value);
  if (
    normalized === "active" ||
    normalized === "archived" ||
    normalized === "processing" ||
    normalized === "rejected"
  ) {
    return normalized;
  }
  return "active";
}
