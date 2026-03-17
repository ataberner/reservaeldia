function normalizeString(value) {
  return String(value || "").trim();
}

function normalizeSearchToken(value) {
  return normalizeString(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function normalizeSearchLooseToken(value) {
  return normalizeSearchToken(value)
    .replace(/[-_./]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildSearchVariants(value) {
  const strict = normalizeSearchToken(value);
  const loose = normalizeSearchLooseToken(value);
  if (!strict && !loose) return [];

  const slug = loose ? loose.replace(/\s+/g, "-") : "";
  const compact = loose ? loose.replace(/\s+/g, "") : "";
  return unique([strict, loose, slug, compact]);
}

export function normalizeCategoryLabel(value) {
  const compact = normalizeString(value).replace(/\s+/g, " ").toLowerCase();
  if (!compact) return "";
  return compact.charAt(0).toUpperCase() + compact.slice(1);
}

function toList(value) {
  if (Array.isArray(value)) {
    return value
      .map((entry) => normalizeString(entry))
      .filter(Boolean);
  }
  if (typeof value === "string") {
    return value
      .split(",")
      .map((entry) => normalizeString(entry))
      .filter(Boolean);
  }
  return [];
}

function unique(values) {
  const out = [];
  const seen = new Set();
  for (const value of values) {
    const normalized = normalizeString(value);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }
  return out;
}

function toMillis(dateValue) {
  if (!(dateValue instanceof Date)) return 0;
  return Number(dateValue.getTime() || 0);
}

export function parseTimestamp(value) {
  if (!value) return null;

  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value : null;
  }

  if (typeof value?.toDate === "function") {
    const next = value.toDate();
    return next instanceof Date && Number.isFinite(next.getTime()) ? next : null;
  }

  if (typeof value === "number") {
    const next = new Date(value);
    return Number.isFinite(next.getTime()) ? next : null;
  }

  if (typeof value === "string") {
    const next = new Date(value);
    return Number.isFinite(next.getTime()) ? next : null;
  }

  if (typeof value === "object") {
    const maybeSeconds = Number(value.seconds ?? value._seconds ?? value.sec ?? value.s);
    const maybeNanos = Number(value.nanoseconds ?? value._nanoseconds ?? value.nanos ?? value.ns ?? 0);
    if (Number.isFinite(maybeSeconds)) {
      const millis = maybeSeconds * 1000 + Math.floor((maybeNanos || 0) / 1000000);
      const next = new Date(millis);
      return Number.isFinite(next.getTime()) ? next : null;
    }
  }

  return null;
}

export function parseKeywordsInput(value) {
  return unique(
    normalizeString(value)
      .split(",")
      .map((entry) => normalizeString(entry).toLowerCase())
      .filter(Boolean)
  );
}

export function parseCategoriesInput(value) {
  const source = Array.isArray(value)
    ? value
    : normalizeString(value).split(",");
  const out = [];
  const seen = new Set();

  for (const entry of source) {
    const normalized = normalizeCategoryLabel(entry);
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(normalized);
  }

  return out;
}

function normalizeValidationStatus(value) {
  const normalized = normalizeString(value).toLowerCase();
  if (normalized === "passed" || normalized === "warning" || normalized === "rejected") {
    return normalized;
  }
  return null;
}

function normalizeStatus(value) {
  const normalized = normalizeString(value).toLowerCase();
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

function parsePriority(rawPriority, rawPopular) {
  const parsed = Number(rawPriority);
  if (Number.isFinite(parsed)) return Math.max(-9999, Math.min(9999, Math.round(parsed)));
  return rawPopular === true ? 1 : 0;
}

function parseUsesCount(doc) {
  const direct = Number(doc?.usesCount);
  if (Number.isFinite(direct)) return Math.max(0, Math.round(direct));
  const nested = Number(doc?.stats?.usesCount);
  if (Number.isFinite(nested)) return Math.max(0, Math.round(nested));
  return 0;
}

function parseBytes(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed) : 0;
}

function parseNullableNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseSectionDecorationHints(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const slots = Array.isArray(raw.slots)
    ? raw.slots
        .map((entry) => normalizeString(entry).toLowerCase())
        .filter((entry) => entry === "superior" || entry === "inferior")
    : [];

  return {
    enabled: raw.enabled !== false,
    slots: slots.length ? [...new Set(slots)] : ["superior", "inferior"],
    defaultWidth: parseNullableNumber(raw.defaultWidth),
    defaultHeight: parseNullableNumber(raw.defaultHeight),
  };
}

export function mapDecorDocToViewModel(doc, source = "active") {
  const categories = parseCategoriesInput([
    ...toList(doc?.categorias),
    ...toList(doc?.categoria),
  ]);
  const keywords = unique([
    ...toList(doc?.keywords),
    ...toList(doc?.tags),
  ]);
  const status = normalizeStatus(doc?.status);
  const validationStatus = normalizeValidationStatus(doc?.validation?.status);
  const createdAt = parseTimestamp(doc?.creadoEn || doc?.creado || doc?.audit?.createdAt);
  const updatedAt = parseTimestamp(
    doc?.actualizadoEn ||
      doc?.audit?.updatedAt ||
      doc?.audit?.lastValidatedAt ||
      doc?.creadoEn ||
      doc?.creado
  );
  const priority = parsePriority(doc?.priority, doc?.popular);
  const categoria = categories[0] || "";

  const thumb = doc?.thumbnails?.card?.url || doc?.thumbnails?.thumb?.url || "";
  const url = normalizeString(doc?.url);

  return {
    id: normalizeString(doc?.id),
    source: source === "archived" ? "archived" : "active",
    isActive: source !== "archived" && status !== "archived",
    status,
    nombre: normalizeString(doc?.nombre || doc?.name || "Sin nombre"),
    categoria,
    categorias: categories,
    keywords,
    license: normalizeString(doc?.license || doc?.licencia || ""),
    priority,
    popular: doc?.popular === true || priority > 0,
    usesCount: parseUsesCount(doc),
    updatedAt,
    createdAt,
    validation: doc?.validation || null,
    validationStatus,
    quality: doc?.quality || null,
    url,
    thumbnailUrl: normalizeString(thumb) || url,
    storagePath: normalizeString(doc?.storagePath),
    assetType: normalizeString(doc?.assetType || "decoracion") || "decoracion",
    format: normalizeString(doc?.format || ""),
    width: parseNullableNumber(doc?.width),
    height: parseNullableNumber(doc?.height),
    hasAlpha: typeof doc?.hasAlpha === "boolean" ? doc.hasAlpha : null,
    bytes: parseBytes(doc?.bytes),
    thumbnails: doc?.thumbnails || null,
    sectionDecorationHints: parseSectionDecorationHints(doc?.sectionDecorationHints),
    searchTokens: Array.isArray(doc?.searchTokens) ? doc.searchTokens : [],
    raw: doc || {},
  };
}

export function buildSearchHaystack(item) {
  const values = [
    item?.id,
    item?.nombre,
    item?.categoria,
    ...(item?.categorias || []),
    ...(item?.keywords || []),
    ...(item?.searchTokens || []),
    item?.license,
    item?.assetType,
    item?.format,
  ];
  const tokens = values.flatMap((entry) => buildSearchVariants(entry));
  return unique(tokens).join(" ");
}

export function filterDecorItems(items, filters) {
  const list = Array.isArray(items) ? items : [];
  const search = normalizeSearchLooseToken(filters?.search || "");
  const searchVariants = buildSearchVariants(search);
  const category = normalizeSearchToken(filters?.category || "all");
  const status = normalizeSearchToken(filters?.status || "all");
  const health = normalizeSearchToken(filters?.health || "all");

  return list.filter((item) => {
    if (search) {
      const haystack = buildSearchHaystack(item);
      const matched = searchVariants.some((variant) => haystack.includes(variant));
      if (!matched) return false;
    }

    if (category && category !== "all") {
      const itemCategories = [
        normalizeSearchToken(item?.categoria),
        ...(item?.categorias || []).map((entry) => normalizeSearchToken(entry)),
      ].filter(Boolean);
      if (!itemCategories.includes(category)) return false;
    }

    if (status === "active" && !item?.isActive) return false;
    if (status === "inactive" && item?.isActive) return false;

    if (health === "warning" && item?.validationStatus !== "warning") return false;
    if (health === "rejected" && item?.validationStatus !== "rejected" && item?.status !== "rejected") {
      return false;
    }
    if (health === "processing" && item?.status !== "processing") return false;

    return true;
  });
}

export function sortDecorItems(items, sortBy = "manual") {
  const list = Array.isArray(items) ? items.slice() : [];
  const normalizedSort = normalizeString(sortBy).toLowerCase();

  const compareByName = (left, right) =>
    normalizeString(left?.nombre).localeCompare(normalizeString(right?.nombre));
  const compareByUpdated = (left, right) => toMillis(right?.updatedAt) - toMillis(left?.updatedAt);
  const compareByCreated = (left, right) => toMillis(right?.createdAt) - toMillis(left?.createdAt);

  list.sort((left, right) => {
    if (normalizedSort === "most_used") {
      const usageDiff = Number(right?.usesCount || 0) - Number(left?.usesCount || 0);
      if (usageDiff !== 0) return usageDiff;
      const priorityDiff = Number(right?.priority || 0) - Number(left?.priority || 0);
      if (priorityDiff !== 0) return priorityDiff;
      const updatedDiff = compareByUpdated(left, right);
      if (updatedDiff !== 0) return updatedDiff;
      return compareByName(left, right);
    }

    if (normalizedSort === "recent") {
      const updatedDiff = compareByUpdated(left, right);
      if (updatedDiff !== 0) return updatedDiff;
      const createdDiff = compareByCreated(left, right);
      if (createdDiff !== 0) return createdDiff;
      return compareByName(left, right);
    }

    const priorityDiff = Number(right?.priority || 0) - Number(left?.priority || 0);
    if (priorityDiff !== 0) return priorityDiff;
    const usageDiff = Number(right?.usesCount || 0) - Number(left?.usesCount || 0);
    if (usageDiff !== 0) return usageDiff;
    const updatedDiff = compareByUpdated(left, right);
    if (updatedDiff !== 0) return updatedDiff;
    return compareByName(left, right);
  });

  return list;
}

export function formatDateTime(dateValue) {
  if (!(dateValue instanceof Date)) return "-";
  return new Intl.DateTimeFormat("es-AR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(dateValue);
}

// aliases de compatibilidad con el hook espejo
export const mapIconDocToViewModel = mapDecorDocToViewModel;
export const filterIcons = filterDecorItems;
export const sortIcons = sortDecorItems;
