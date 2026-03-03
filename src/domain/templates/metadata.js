const DEFAULT_BADGES = Object.freeze(["Top"]);
const DEFAULT_FEATURES = Object.freeze(["Asistencia", "Galeria", "Countdown", "Regalos"]);
const DEFAULT_RATING = 4.8;
const DEFAULT_POPULARITY = "96% recomendada";

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeLabel(value) {
  const safe = normalizeText(value);
  if (!safe) return "";
  const normalized = safe
    .replace(/\s+/g, " ")
    .replace(/_/g, " ")
    .replace(/-/g, " ")
    .trim();
  if (normalized.toLowerCase() === "rsvp") return "Asistencia";
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function uniqueStrings(values) {
  const seen = new Set();
  const items = [];
  for (const raw of values) {
    const safe = normalizeLabel(raw);
    const key = safe.toLowerCase();
    if (!safe || seen.has(key)) continue;
    seen.add(key);
    items.push(safe);
  }
  return items;
}

function toStringList(value) {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeText(item)).filter(Boolean);
  }
  if (typeof value === "string") {
    return value
      .split(",")
      .map((item) => normalizeText(item))
      .filter(Boolean);
  }
  return [];
}

function parseRating(value) {
  if (value && typeof value === "object") {
    return parseRating(value.value);
  }

  const raw = Number(value);
  if (!Number.isFinite(raw)) return DEFAULT_RATING;
  const bounded = Math.max(0, Math.min(5, raw));
  return Math.round(bounded * 10) / 10;
}

function parsePopularity(value) {
  if (value && typeof value === "object") {
    const label = normalizeText(value.label);
    if (label) return label;
    const score = Number(value.score);
    if (Number.isFinite(score)) {
      const bounded = Math.max(0, Math.min(100, Math.round(score)));
      return `${bounded}% recomendada`;
    }
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    const bounded = Math.max(0, Math.min(100, Math.round(value)));
    return `${bounded}% recomendada`;
  }
  const safe = normalizeText(value);
  return safe || DEFAULT_POPULARITY;
}

function collectObjectTypes(template) {
  const types = new Set();
  const objetos = Array.isArray(template?.objetos) ? template.objetos : [];
  objetos.forEach((obj) => {
    const tipo = normalizeText(obj?.tipo).toLowerCase();
    if (tipo) types.add(tipo);
  });

  const secciones = Array.isArray(template?.secciones) ? template.secciones : [];
  secciones.forEach((section) => {
    const sectionObjects = Array.isArray(section?.objetos) ? section.objetos : [];
    sectionObjects.forEach((obj) => {
      const tipo = normalizeText(obj?.tipo).toLowerCase();
      if (tipo) types.add(tipo);
    });
  });

  if (template?.rsvp?.enabled !== false && template?.rsvp) {
    types.add("rsvp-boton");
  }

  return types;
}

function inferFeatures(template) {
  const explicit = uniqueStrings(toStringList(template?.features));
  if (explicit.length) return explicit.slice(0, 8);

  const types = collectObjectTypes(template);
  const inferred = [];

  if (types.has("rsvp-boton") || types.has("rsvp")) inferred.push("Asistencia");
  if (types.has("galeria") || types.has("gallery")) inferred.push("Galeria");
  if (types.has("countdown")) inferred.push("Countdown");
  if (types.has("regalos") || types.has("regalo") || types.has("gift")) inferred.push("Regalos");
  if (types.has("musica") || types.has("music") || types.has("audio")) inferred.push("Musica");
  if (types.has("dresscode") || types.has("dress-code")) inferred.push("Dress code");
  if (
    types.has("ubicacion") ||
    types.has("mapa") ||
    types.has("map") ||
    types.has("location")
  ) {
    inferred.push("Ubicacion");
  }

  return uniqueStrings(inferred.length ? inferred : [...DEFAULT_FEATURES]).slice(0, 8);
}

function inferBadges(template) {
  const base = toStringList(template?.badges);
  const hasPremiumFlag =
    template?.premium === true ||
    template?.esPremium === true ||
    template?.isPremium === true;
  const hasNewFlag = template?.nuevo === true || template?.isNew === true;

  if (hasPremiumFlag) base.push("Premium");
  if (hasNewFlag) base.push("Nuevo");
  if (!base.length) base.push(...DEFAULT_BADGES);

  return uniqueStrings(base).slice(0, 4);
}

function inferCategories(template) {
  const categories = uniqueStrings([
    ...toStringList(template?.tags),
    ...toStringList(template?.categorias),
    ...toStringList(template?.categoria),
    ...toStringList(template?.estilos),
    ...toStringList(template?.estilo),
    normalizeText(template?.tipo),
  ]);
  return categories.slice(0, 6);
}

export function normalizeTemplateMetadata(template) {
  const safeTemplate = template && typeof template === "object" ? template : {};
  const title = normalizeText(safeTemplate?.nombre) || "Plantilla";

  return {
    title,
    badges: inferBadges(safeTemplate),
    rating: parseRating(safeTemplate?.rating),
    popularity: parsePopularity(safeTemplate?.popularidad),
    features: inferFeatures(safeTemplate),
    categories: inferCategories(safeTemplate),
    type: normalizeText(safeTemplate?.tipo) || "evento",
  };
}
