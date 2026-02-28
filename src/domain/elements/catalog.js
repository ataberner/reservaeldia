/**
 * @typedef {Object} ElementCatalogItem
 * @property {string} id
 * @property {string} label
 * @property {string|null} src
 * @property {"shape"|"icon"|"gif"} kind
 * @property {string|null} figura
 * @property {string|null} formato
 * @property {boolean} popular
 * @property {string[]} categories
 * @property {string[]} keywords
 * @property {string} searchText
 */

const CURATED_CATEGORY_ORDER = [
  "boda",
  "romance",
  "fiesta",
  "comida",
  "flores",
  "decoracion",
  "celebracion",
  "musica",
  "viaje",
  "transporte",
  "naturaleza",
  "social",
];

export const SHAPE_LIBRARY = [
  { id: "shape-rect", label: "Rectangulo", kind: "shape", figura: "rect", formato: null, src: null, popular: true, categories: ["basicas"], keywords: ["rectangulo", "caja"], searchText: "rectangulo caja basicas", color: "#111827" },
  { id: "shape-circle", label: "Circulo", kind: "shape", figura: "circle", formato: null, src: null, popular: true, categories: ["basicas"], keywords: ["circulo", "redondo"], searchText: "circulo redondo basicas", color: "#111827" },
  { id: "shape-line", label: "Linea", kind: "shape", figura: "line", formato: null, src: null, popular: true, categories: ["basicas"], keywords: ["linea", "divisor"], searchText: "linea divisor basicas", color: "#111827" },
  { id: "shape-triangle", label: "Triangulo", kind: "shape", figura: "triangle", formato: null, src: null, popular: true, categories: ["basicas"], keywords: ["triangulo", "punta"], searchText: "triangulo punta basicas", color: "#111827" },
  { id: "shape-diamond", label: "Rombo", kind: "shape", figura: "diamond", formato: null, src: null, popular: true, categories: ["utiles"], keywords: ["rombo", "diamante"], searchText: "rombo diamante utiles", color: "#111827" },
  { id: "shape-star", label: "Estrella", kind: "shape", figura: "star", formato: null, src: null, popular: true, categories: ["utiles"], keywords: ["estrella"], searchText: "estrella utiles", color: "#111827" },
  { id: "shape-heart", label: "Corazon", kind: "shape", figura: "heart", formato: null, src: null, popular: true, categories: ["utiles"], keywords: ["corazon", "amor"], searchText: "corazon amor utiles", color: "#111827" },
  { id: "shape-arrow", label: "Flecha", kind: "shape", figura: "arrow", formato: null, src: null, popular: true, categories: ["utiles"], keywords: ["flecha", "direccion"], searchText: "flecha direccion utiles", color: "#111827" },
  { id: "shape-pentagon", label: "Pentagono", kind: "shape", figura: "pentagon", formato: null, src: null, popular: false, categories: ["utiles"], keywords: ["pentagono"], searchText: "pentagono utiles", color: "#111827" },
  { id: "shape-hexagon", label: "Hexagono", kind: "shape", figura: "hexagon", formato: null, src: null, popular: false, categories: ["utiles"], keywords: ["hexagono"], searchText: "hexagono utiles", color: "#111827" },
  { id: "shape-pill", label: "Pildora", kind: "shape", figura: "pill", formato: null, src: null, popular: true, categories: ["utiles"], keywords: ["pildora", "etiqueta", "chip"], searchText: "pildora etiqueta chip utiles", color: "#111827" },
];

function normalizeTextToken(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function sanitizeListFromUnknown(value) {
  if (Array.isArray(value)) {
    return value
      .map((entry) => normalizeTextToken(entry))
      .filter(Boolean);
  }

  if (typeof value === "string") {
    return value
      .split(",")
      .map((entry) => normalizeTextToken(entry))
      .filter(Boolean);
  }

  return [];
}

function titleFromSlug(value) {
  const safe = String(value || "")
    .replace(/[-_]+/g, " ")
    .trim();
  if (!safe) return "";
  return safe
    .split(/\s+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function guessFormat(raw) {
  const maybeFormat = normalizeTextToken(raw?.formato || raw?.format || raw?.ext || "");
  if (maybeFormat) return maybeFormat === "jpeg" ? "jpg" : maybeFormat;

  const source = String(raw?.src || raw?.url || raw?.downloadURL || "").toLowerCase();
  const stripped = source.split("?")[0].split("#")[0];
  const extension = stripped.split(".").pop() || "";
  if (!extension) return "";
  return extension === "jpeg" ? "jpg" : extension;
}

function resolveKind(raw, format) {
  if (normalizeTextToken(raw?.tipo) === "gif" || format === "gif") return "gif";
  return "icon";
}

function resolveLabel(raw, fallbackId) {
  const explicit = String(raw?.label || raw?.nombre || raw?.name || "").trim();
  if (explicit) return explicit;
  const safeId = String(fallbackId || "").trim();
  if (!safeId) return "Elemento";
  const base = safeId.replace(/\.[a-z0-9]+$/i, "");
  return titleFromSlug(base) || "Elemento";
}

function safeArrayUnique(values) {
  return [...new Set((Array.isArray(values) ? values : []).filter(Boolean))];
}

export function normalizeCatalogIconItem(raw, fallbackId = "") {
  const src = String(raw?.src || raw?.url || raw?.downloadURL || "").trim();
  if (!src) return null;

  const id = String(raw?.id || fallbackId || src).trim();
  if (!id) return null;

  const format = guessFormat(raw);
  const kind = resolveKind(raw, format);

  const categoryList = safeArrayUnique([
    ...sanitizeListFromUnknown(raw?.categorias),
    ...sanitizeListFromUnknown(raw?.categoria),
  ]);
  const keywordList = safeArrayUnique([
    ...sanitizeListFromUnknown(raw?.keywords),
    ...sanitizeListFromUnknown(raw?.tags),
  ]);
  const label = resolveLabel(raw, id);
  const labelToken = normalizeTextToken(label);
  const searchText = safeArrayUnique([
    labelToken,
    normalizeTextToken(id),
    ...categoryList,
    ...keywordList,
  ]).join(" ");

  /** @type {ElementCatalogItem} */
  const normalized = {
    id,
    label,
    src,
    kind,
    figura: null,
    formato: format || null,
    popular: Boolean(raw?.popular),
    categories: categoryList,
    keywords: keywordList,
    searchText,
  };

  return normalized;
}

export function dedupeCatalogItems(items = []) {
  const seen = new Set();
  const merged = [];

  for (const item of items) {
    if (!item) continue;
    const srcKey = String(item.src || "").trim();
    const fallbackId = String(item.id || "").trim();
    const key = item.kind === "shape"
      ? `shape:${item.figura || fallbackId}`
      : `${item.kind}:${srcKey || fallbackId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(item);
  }

  return merged;
}

export function mergeCatalogItems(baseItems = [], nextItems = []) {
  return dedupeCatalogItems([...(Array.isArray(baseItems) ? baseItems : []), ...(Array.isArray(nextItems) ? nextItems : [])]);
}

export function filterByCategory(items = [], category = "all") {
  const normalizedCategory = normalizeTextToken(category);
  if (!normalizedCategory || normalizedCategory === "all") {
    return Array.isArray(items) ? items : [];
  }

  return (Array.isArray(items) ? items : []).filter((item) =>
    Array.isArray(item?.categories) && item.categories.includes(normalizedCategory)
  );
}

export function buildOrderedCategories(items = []) {
  const categoriesSet = new Set();
  for (const item of Array.isArray(items) ? items : []) {
    if (!item || item.kind === "shape") continue;
    for (const category of Array.isArray(item.categories) ? item.categories : []) {
      categoriesSet.add(category);
    }
  }

  const categories = [...categoriesSet];
  categories.sort((left, right) => {
    const leftIndex = CURATED_CATEGORY_ORDER.indexOf(left);
    const rightIndex = CURATED_CATEGORY_ORDER.indexOf(right);
    const leftRank = leftIndex === -1 ? Number.MAX_SAFE_INTEGER : leftIndex;
    const rightRank = rightIndex === -1 ? Number.MAX_SAFE_INTEGER : rightIndex;
    if (leftRank !== rightRank) return leftRank - rightRank;
    return left.localeCompare(right);
  });

  return categories.map((value) => ({
    value,
    label: titleFromSlug(value),
    curated: CURATED_CATEGORY_ORDER.includes(value),
  }));
}

function queryScore(item, normalizedQuery) {
  if (!normalizedQuery) return 0;

  const label = normalizeTextToken(item?.label);
  const id = normalizeTextToken(item?.id);
  const categories = Array.isArray(item?.categories) ? item.categories : [];
  const keywords = Array.isArray(item?.keywords) ? item.keywords : [];
  const haystack = `${label} ${id} ${item?.searchText || ""}`.trim();

  let score = 0;
  if (!haystack.includes(normalizedQuery)) return 0;

  if (label === normalizedQuery || id === normalizedQuery) score += 800;
  if (label.startsWith(normalizedQuery)) score += 560;
  if (id.startsWith(normalizedQuery)) score += 500;
  if (label.includes(normalizedQuery)) score += 360;
  if (categories.some((value) => value.includes(normalizedQuery))) score += 250;
  if (keywords.some((value) => value.includes(normalizedQuery))) score += 220;
  if (item?.popular) score += 35;

  return score;
}

export function rankItemsByQuery(items = [], query = "") {
  const normalizedQuery = normalizeTextToken(query);
  if (!normalizedQuery) return Array.isArray(items) ? items : [];

  return (Array.isArray(items) ? items : [])
    .map((item) => ({
      item,
      score: queryScore(item, normalizedQuery),
    }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      return String(left.item?.label || "").localeCompare(String(right.item?.label || ""));
    })
    .map((entry) => entry.item);
}

export function sortLibraryItemsDefault(items = []) {
  return (Array.isArray(items) ? items : [])
    .slice()
    .sort((left, right) => {
      const leftPopular = left?.popular ? 1 : 0;
      const rightPopular = right?.popular ? 1 : 0;
      if (leftPopular !== rightPopular) return rightPopular - leftPopular;

      const leftCategory = Array.isArray(left?.categories) ? left.categories[0] || "" : "";
      const rightCategory = Array.isArray(right?.categories) ? right.categories[0] || "" : "";
      if (leftCategory !== rightCategory) {
        const leftIndex = CURATED_CATEGORY_ORDER.indexOf(leftCategory);
        const rightIndex = CURATED_CATEGORY_ORDER.indexOf(rightCategory);
        const leftRank = leftIndex === -1 ? Number.MAX_SAFE_INTEGER : leftIndex;
        const rightRank = rightIndex === -1 ? Number.MAX_SAFE_INTEGER : rightIndex;
        if (leftRank !== rightRank) return leftRank - rightRank;
      }

      return String(left?.label || "").localeCompare(String(right?.label || ""));
    });
}

export function groupResultsByKind(items = []) {
  const grouped = {
    shape: [],
    icon: [],
    gif: [],
  };

  for (const item of Array.isArray(items) ? items : []) {
    if (!item || !grouped[item.kind]) continue;
    grouped[item.kind].push(item);
  }

  return grouped;
}

export function normalizeRecentEntry(entry) {
  if (!entry || typeof entry !== "object") return null;
  const kind = entry.kind === "shape" || entry.kind === "gif" ? entry.kind : "icon";
  const id = String(entry.id || "").trim();
  if (!id) return null;

  return {
    id,
    label: String(entry.label || "Elemento").trim() || "Elemento",
    src: typeof entry.src === "string" ? entry.src : null,
    kind,
    figura: entry.figura ? String(entry.figura) : null,
    formato: entry.formato ? String(entry.formato) : null,
    popular: Boolean(entry.popular),
    categories: safeArrayUnique(sanitizeListFromUnknown(entry.categories)),
    keywords: safeArrayUnique(sanitizeListFromUnknown(entry.keywords)),
    searchText: String(entry.searchText || ""),
    insertedAt: Number(entry.insertedAt || Date.now()),
  };
}

export function normalizeQueryText(value) {
  return normalizeTextToken(value);
}
