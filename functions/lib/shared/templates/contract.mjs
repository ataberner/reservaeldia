const TEMPLATE_TYPES = new Set([
  "boda",
  "bautismo",
  "cumple",
  "quince",
  "empresarial",
  "general",
]);

const TEMPLATE_TYPE_ALIASES = new Map([
  ["boda", "boda"],
  ["wedding", "boda"],
  ["bautismo", "bautismo"],
  ["baptism", "bautismo"],
  ["cumple", "cumple"],
  ["cumpleanos", "cumple"],
  ["cumpleano", "cumple"],
  ["birthday", "cumple"],
  ["quince", "quince"],
  ["xv", "quince"],
  ["xv-anos", "quince"],
  ["xv-anos", "quince"],
  ["quinceanera", "quince"],
  ["empresarial", "empresarial"],
  ["corporativo", "empresarial"],
  ["empresa", "empresarial"],
  ["general", "general"],
]);

const FIELD_TYPES = new Set([
  "text",
  "textarea",
  "date",
  "time",
  "datetime",
  "location",
  "url",
  "images",
]);
const FIELD_UPDATE_MODES = new Set(["input", "blur", "confirm"]);
const APPLY_TARGET_SCOPES = new Set(["objeto", "seccion", "rsvp"]);
const APPLY_TARGET_MODES = new Set(["set", "replace"]);
const APPLY_TARGET_TRANSFORM_KINDS = new Set([
  "identity",
  "date_to_countdown_iso",
  "date_to_text",
]);
const DEFAULT_DATE_TEXT_TRANSFORM_PRESET = "event_date_long_es_ar";

const VIEWPORT_HINTS = new Set(["mobileFirst", "desktop", "responsive"]);
const ACTIVE_STATES = new Set(["active", "archived"]);
export const TEMPLATE_EDITORIAL_STATES = Object.freeze([
  "en_proceso",
  "en_revision",
  "publicada",
]);
const TEMPLATE_EDITORIAL_STATE_SET = new Set(TEMPLATE_EDITORIAL_STATES);

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeToken(value) {
  return normalizeText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeTemplateType(value) {
  const token = normalizeToken(value);
  if (!token) return "general";
  return TEMPLATE_TYPE_ALIASES.get(token) || "general";
}

function asObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value;
}

function toStringList(value) {
  if (Array.isArray(value)) {
    return value
      .map((entry) => normalizeText(entry))
      .filter(Boolean);
  }
  if (typeof value === "string") {
    return value
      .split(",")
      .map((entry) => normalizeText(entry))
      .filter(Boolean);
  }
  return [];
}

function uniqueList(values) {
  const seen = new Set();
  const out = [];
  for (const entry of values) {
    const safe = normalizeText(entry);
    const key = safe.toLowerCase();
    if (!safe || seen.has(key)) continue;
    seen.add(key);
    out.push(safe);
  }
  return out;
}

function toSlug(value, fallback = "plantilla") {
  const token = normalizeToken(value);
  return token || fallback;
}

function toFieldKey(value, fallback = "campo") {
  const key = normalizeText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
  return key || fallback;
}

function toPositiveInteger(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.round(parsed);
}

function decodeURIComponentSafe(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function isLikelyImageUrl(value) {
  const urlText = normalizeText(value);
  if (!urlText) return false;

  let candidatePath = urlText;
  let hasMediaHint = false;
  try {
    const parsed = new URL(urlText);
    candidatePath = `${parsed.pathname}${parsed.search}`;
    hasMediaHint = normalizeText(parsed.searchParams.get("alt")).toLowerCase() === "media";
  } catch {
    // Permitir paths relativos o URLs invalidas sin romper flujo.
  }

  if (hasMediaHint) return true;

  const decodedPath = decodeURIComponentSafe(candidatePath).toLowerCase();
  return /\.(avif|bmp|gif|heic|heif|ico|jpe?g|png|svg|webp)(\?|$)/.test(decodedPath);
}

function normalizePreviewUrl(rawValue, portadaValue) {
  const previewUrl = normalizeText(rawValue);
  if (!previewUrl) return null;

  const portada = normalizeText(portadaValue);
  if (portada && previewUrl === portada) return null;
  if (isLikelyImageUrl(previewUrl)) return null;

  return previewUrl;
}

function toBoolean(value, fallback = false) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const token = value.trim().toLowerCase();
    if (token === "true" || token === "1" || token === "si" || token === "yes") {
      return true;
    }
    if (token === "false" || token === "0" || token === "no") {
      return false;
    }
  }
  return fallback;
}

function normalizeFieldType(value) {
  const token = normalizeToken(value);
  if (!token) return "text";
  if (!FIELD_TYPES.has(token)) return "text";
  return token;
}

function normalizeFieldUpdateMode(value) {
  const token = normalizeToken(value);
  if (!token || !FIELD_UPDATE_MODES.has(token)) return undefined;
  return token;
}

function normalizeApplyTargetScope(value) {
  const token = normalizeToken(value);
  if (!token || !APPLY_TARGET_SCOPES.has(token)) return null;
  return token;
}

function normalizeApplyTargetMode(value) {
  const token = normalizeToken(value);
  if (!token || !APPLY_TARGET_MODES.has(token)) return "set";
  return token;
}

function normalizeApplyTargetTransform(raw) {
  const source = asObject(raw);
  const kind = normalizeText(source.kind).toLowerCase();
  if (!kind || !APPLY_TARGET_TRANSFORM_KINDS.has(kind)) return undefined;

  if (kind === "date_to_text") {
    return {
      kind,
      preset: normalizeText(source.preset) || DEFAULT_DATE_TEXT_TRANSFORM_PRESET,
    };
  }

  return { kind };
}

function normalizeFieldApplyTarget(raw) {
  const source = asObject(raw);
  const scope = normalizeApplyTargetScope(source.scope);
  if (!scope) return null;

  const path = normalizeText(source.path);
  if (!path) return null;

  const id = normalizeText(source.id) || undefined;
  if ((scope === "objeto" || scope === "seccion") && !id) return null;

  const mode = normalizeApplyTargetMode(source.mode);
  const transform = normalizeApplyTargetTransform(source.transform);

  return {
    scope,
    ...(id ? { id } : {}),
    path,
    mode,
    ...(transform ? { transform } : {}),
  };
}

function normalizeFieldApplyTargets(value) {
  if (!Array.isArray(value)) return [];
  const out = [];
  const seen = new Set();

  for (const raw of value) {
    const item = normalizeFieldApplyTarget(raw);
    if (!item) continue;
    const key = `${item.scope}|${item.id || ""}|${item.path}|${item.mode}|${
      item.transform?.kind || ""
    }|${item.transform?.preset || ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }

  return out;
}

function normalizeFieldValidation(raw, fieldType) {
  const source = asObject(raw);
  const maxLength = toPositiveInteger(source.maxLength);
  const minItems = toPositiveInteger(source.minItems);
  const maxItems = toPositiveInteger(source.maxItems);

  const validation = {};

  if (fieldType !== "images" && maxLength) {
    validation.maxLength = maxLength;
  }
  if (fieldType === "images") {
    if (minItems) validation.minItems = minItems;
    if (maxItems) validation.maxItems = maxItems;
  }

  return Object.keys(validation).length ? validation : undefined;
}

function buildFieldLabelFromKey(fieldKey) {
  const words = String(fieldKey || "")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
  if (!words.length) return "Campo";
  return words
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function normalizeFieldSchemaItem(raw, index) {
  const source = asObject(raw);
  const key = toFieldKey(source.key, `campo_${index + 1}`);
  const type = normalizeFieldType(source.type);
  const label = normalizeText(source.label) || buildFieldLabelFromKey(key);
  const group = normalizeText(source.group) || "Datos principales";
  const placeholder = normalizeText(source.placeholder) || undefined;
  const helperText = normalizeText(source.helperText) || undefined;
  const optional = toBoolean(source.optional, false);
  const validation = normalizeFieldValidation(source.validation, type);
  const updateMode = normalizeFieldUpdateMode(source.updateMode);
  const applyTargets = normalizeFieldApplyTargets(source.applyTargets);

  return {
    key,
    label,
    type,
    group,
    optional,
    ...(placeholder ? { placeholder } : {}),
    ...(helperText ? { helperText } : {}),
    ...(validation ? { validation } : {}),
    ...(updateMode ? { updateMode } : {}),
    ...(applyTargets.length ? { applyTargets } : {}),
  };
}

function normalizeFieldsSchema(value) {
  if (!Array.isArray(value)) return [];
  const seenKeys = new Set();
  const out = [];

  for (let index = 0; index < value.length; index += 1) {
    const item = normalizeFieldSchemaItem(value[index], index);
    if (seenKeys.has(item.key)) continue;
    seenKeys.add(item.key);
    out.push(item);
  }

  return out;
}

function normalizeRating(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    const bounded = Math.max(0, Math.min(5, value));
    return {
      value: Math.round(bounded * 10) / 10,
      count: 0,
    };
  }

  const source = asObject(value);
  const parsedValue = Number(source.value);
  if (!Number.isFinite(parsedValue)) return null;
  const bounded = Math.max(0, Math.min(5, parsedValue));
  const count = Number.isFinite(Number(source.count))
    ? Math.max(0, Math.round(Number(source.count)))
    : 0;

  return {
    value: Math.round(bounded * 10) / 10,
    count,
  };
}

function normalizePopularity(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    const score = Math.max(0, Math.min(100, Math.round(value)));
    return {
      label: `${score}% recomendada`,
      score,
    };
  }

  if (typeof value === "string") {
    const label = normalizeText(value);
    if (!label) return null;
    return { label };
  }

  const source = asObject(value);
  const label = normalizeText(source.label);
  const score = Number(source.score);

  if (label && Number.isFinite(score)) {
    return {
      label,
      score: Math.max(0, Math.min(100, Math.round(score))),
    };
  }
  if (label) return { label };
  if (Number.isFinite(score)) {
    const bounded = Math.max(0, Math.min(100, Math.round(score)));
    return {
      label: `${bounded}% recomendada`,
      score: bounded,
    };
  }

  return null;
}

function normalizePreview(raw) {
  const source = asObject(raw.preview);
  const previewUrl =
    normalizePreviewUrl(source.previewUrl, raw.portada) ||
    normalizePreviewUrl(raw.previewUrl, raw.portada);

  const viewportHints = normalizeText(source.viewportHints);
  const aspectRatio = normalizeText(source.aspectRatio) || undefined;
  const suggestedHeightPx = toPositiveInteger(source.suggestedHeightPx);

  return {
    previewUrl,
    ...(VIEWPORT_HINTS.has(viewportHints) ? { viewportHints } : {}),
    ...(aspectRatio ? { aspectRatio } : {}),
    ...(suggestedHeightPx ? { suggestedHeightPx } : {}),
  };
}

function normalizeGalleryRules(raw) {
  const source = asObject(raw.galleryRules);
  if (!Object.keys(source).length) return null;

  const maxImages = toPositiveInteger(source.maxImages);
  const recommendedRatio = normalizeText(source.recommendedRatio);
  const recommendedSizeText = normalizeText(source.recommendedSizeText);
  const maxFileSizeMB = toPositiveInteger(source.maxFileSizeMB);

  if (!maxImages || !recommendedRatio || !recommendedSizeText) return null;

  return {
    maxImages,
    recommendedRatio,
    recommendedSizeText,
    ...(maxFileSizeMB ? { maxFileSizeMB } : {}),
  };
}

function normalizeState(value) {
  const token = normalizeToken(value);
  if (!token) return "active";
  if (!ACTIVE_STATES.has(token)) return "active";
  return token;
}

function normalizeTemplateTrashRole(value) {
  const token = normalizeToken(value);
  if (token === "admin" || token === "superadmin") return token;
  return null;
}

function normalizeTemplateTrashMetadata(value, fallbackTemplate = {}) {
  const source = asObject(value);
  if (!Object.keys(source).length) return null;

  const fallback = asObject(fallbackTemplate);
  const active =
    source.active === true ||
    (typeof source.active === "undefined" && normalizeState(fallback.estado) === "archived");
  const deletedAt = source.deletedAt || null;
  const restoredAt = source.restoredAt || null;

  return {
    entityType: "template",
    active,
    deletedAt,
    deletedByUid: normalizeText(source.deletedByUid) || null,
    deletedByRole: normalizeTemplateTrashRole(source.deletedByRole),
    previousEditorialStatus: normalizeTemplateEditorialState(
      source.previousEditorialStatus || fallback.estadoEditorial
    ),
    restoredAt,
    restoredByUid: normalizeText(source.restoredByUid) || null,
    restoredByRole: normalizeTemplateTrashRole(source.restoredByRole),
    retentionPolicy: "manual",
  };
}

export function normalizeTemplateEditorialState(value) {
  const token = normalizeToken(value).replace(/-/g, "_");
  if (!token) return "publicada";
  if (!TEMPLATE_EDITORIAL_STATE_SET.has(token)) return "publicada";
  return token;
}

export function isTemplateTrashed(template) {
  const source = asObject(template);
  if (normalizeState(source.estado) === "archived") return true;
  return normalizeTemplateTrashMetadata(source.trash, source)?.active === true;
}

function normalizeDefaultsValueByType(type, value) {
  if (type === "images") {
    return Array.isArray(value) ? value : [];
  }
  if (value === null || typeof value === "undefined") {
    return "";
  }
  return value;
}

function normalizeTemplateAuthoringDraft(value, fallbackTemplateId = null) {
  const source = asObject(value);
  if (!Object.keys(source).length) return null;

  const fieldsSchema = normalizeFieldsSchema(source.fieldsSchema);
  const defaults = ensureDefaultsForSchema(fieldsSchema, source.defaults);
  const rawStatus = asObject(source.status);
  const issues = uniqueList(toStringList(rawStatus.issues));

  return {
    version: Number.isFinite(Number(source.version))
      ? Math.max(1, Math.round(Number(source.version)))
      : 1,
    sourceTemplateId:
      normalizeText(source.sourceTemplateId) ||
      normalizeText(fallbackTemplateId) ||
      null,
    fieldsSchema,
    defaults,
    status: {
      isReady: rawStatus.isReady !== false && issues.length === 0,
      issues,
    },
    updatedAt: source.updatedAt || null,
    updatedByUid: normalizeText(source.updatedByUid) || null,
  };
}

export function ensureDefaultsForSchema(fieldsSchema, defaults) {
  const schema = Array.isArray(fieldsSchema) ? fieldsSchema : [];
  const sourceDefaults = asObject(defaults);
  const normalizedDefaults = { ...sourceDefaults };

  for (const field of schema) {
    const key = normalizeText(field?.key);
    if (!key) continue;
    const fieldType = normalizeFieldType(field?.type);
    normalizedDefaults[key] = normalizeDefaultsValueByType(
      fieldType,
      normalizedDefaults[key]
    );
  }

  return normalizedDefaults;
}

export function normalizeTemplateDocument(raw, idOverride = "") {
  const source = asObject(raw);
  const id = normalizeText(idOverride || source.id) || "plantilla";
  const slug = toSlug(source.slug || source.nombre || id);
  const nombre = normalizeText(source.nombre) || "Plantilla";
  const tipo = normalizeTemplateType(source.tipo);
  const tags = uniqueList(toStringList(source.tags));
  const badges = uniqueList(toStringList(source.badges));
  const features = uniqueList(toStringList(source.features));
  const fieldsSchema = normalizeFieldsSchema(source.fieldsSchema);
  const defaults = ensureDefaultsForSchema(fieldsSchema, source.defaults);
  const rating = normalizeRating(source.rating);
  const popularidad = normalizePopularity(source.popularidad);
  const preview = normalizePreview(source);
  const galleryRules = normalizeGalleryRules(source);
  const portada = normalizeText(source.portada) || null;
  const editor = normalizeText(source.editor) || null;
  const objetos = Array.isArray(source.objetos) ? source.objetos : [];
  const secciones = Array.isArray(source.secciones) ? source.secciones : [];
  const estado = normalizeState(source.estado);
  const estadoEditorial = normalizeTemplateEditorialState(source.estadoEditorial);
  const updatedAt = source.updatedAt || source.actualizadoEn || null;
  const trash = normalizeTemplateTrashMetadata(source.trash, source);
  const rsvp = source.rsvp && typeof source.rsvp === "object" ? source.rsvp : null;
  const gifts = source.gifts && typeof source.gifts === "object" ? source.gifts : null;
  const templateAuthoringDraft = normalizeTemplateAuthoringDraft(
    source.templateAuthoringDraft,
    id
  );

  return {
    id,
    slug,
    nombre,
    tipo: TEMPLATE_TYPES.has(tipo) ? tipo : "general",
    tags,
    badges,
    features,
    rating,
    popularidad,
    preview,
    fieldsSchema,
    defaults,
    galleryRules,
    portada,
    editor,
    objetos,
    secciones,
    estado,
    estadoEditorial,
    updatedAt,
    ...(trash ? { trash } : {}),
    ...(templateAuthoringDraft ? { templateAuthoringDraft } : {}),
    ...(rsvp ? { rsvp } : {}),
    ...(gifts ? { gifts } : {}),
  };
}

export function buildCatalogFromTemplate(fullTemplate) {
  const safeTemplate = normalizeTemplateDocument(fullTemplate, fullTemplate?.id);
  return normalizeTemplateCatalogDocument(safeTemplate, safeTemplate.id);
}

export function normalizeTemplateCatalogDocument(raw, idOverride = "") {
  const source = asObject(raw);
  const id = normalizeText(idOverride || source.id) || "plantilla";
  const slug = toSlug(source.slug || source.nombre || id);
  const nombre = normalizeText(source.nombre) || "Plantilla";
  const tipo = normalizeTemplateType(source.tipo);
  const tags = uniqueList(toStringList(source.tags));
  const badges = uniqueList(toStringList(source.badges));
  const features = uniqueList(toStringList(source.features));
  const rating = normalizeRating(source.rating);
  const popularidad = normalizePopularity(source.popularidad);
  const preview = normalizePreview(source);
  const portada = normalizeText(source.portada) || null;
  const estado = normalizeState(source.estado);
  const estadoEditorial = normalizeTemplateEditorialState(source.estadoEditorial);
  const updatedAt = source.updatedAt || source.actualizadoEn || null;
  const trash = normalizeTemplateTrashMetadata(source.trash, source);

  return {
    id,
    slug,
    nombre,
    tipo: TEMPLATE_TYPES.has(tipo) ? tipo : "general",
    tags,
    badges,
    features,
    rating,
    popularidad,
    preview,
    portada,
    estado,
    estadoEditorial,
    updatedAt,
    ...(trash ? { trash } : {}),
  };
}

export function resolveTemplatePreviewSource(template) {
  const normalized = normalizeTemplateDocument(template, template?.id);
  const previewUrl = normalizeText(normalized?.preview?.previewUrl) || null;
  if (previewUrl) {
    return {
      mode: "url",
      previewUrl,
    };
  }
  return {
    mode: "generated",
    previewUrl: null,
  };
}
