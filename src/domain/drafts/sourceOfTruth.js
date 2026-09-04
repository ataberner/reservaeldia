import { normalizeEventDetailsConfig } from "../../../shared/eventDetailsConfig.js";
import { ensureValuesForSchema } from "../../../shared/templates/contract.js";

export const DRAFT_SOURCE_OF_TRUTH_VERSION = 2;
export const DRAFT_CANONICAL_SOURCE = "draft_render_state";
// Render roots remain canonical for presentation. Structured dynamic values live
// in templateInput.values and are projected into render roots by their targets.

const DRAFT_WRITERS = new Set(["modal", "canvas", "system", "publish"]);

function asObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value;
}

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeWriter(value) {
  const normalized = normalizeText(value).toLowerCase();
  if (!DRAFT_WRITERS.has(normalized)) return "system";
  return normalized;
}

function normalizeRenderArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeRsvp(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value;
}

function normalizeGifts(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value;
}

function hasOwn(value, key) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function buildFieldValueMap(fieldsSchema, primaryValues, fallbackValues) {
  const fields = Array.isArray(fieldsSchema) ? fieldsSchema : [];
  const primary = asObject(primaryValues);
  const fallback = asObject(fallbackValues);
  const selected = { ...fallback, ...primary };

  fields.forEach((field) => {
    const key = normalizeText(field?.key);
    if (!key || hasOwn(primary, key)) return;
    selected[key] = hasOwn(fallback, key) ? fallback[key] : undefined;
  });

  return ensureValuesForSchema(fields, selected);
}

function areFieldValuesEqual(left, right) {
  if (left === right) return true;
  try {
    return JSON.stringify(left) === JSON.stringify(right);
  } catch {
    return false;
  }
}

export function normalizeDraftTemplateInput({
  templateInput,
  fieldsSchema,
  defaults,
  fallbackValues,
} = {}) {
  const source = asObject(templateInput);
  const fields = Array.isArray(fieldsSchema) ? fieldsSchema : [];
  const normalizedDefaults = buildFieldValueMap(fields, source.defaults, defaults);
  const initialFallback = {
    ...normalizedDefaults,
    ...asObject(fallbackValues),
  };
  const initialValues = buildFieldValueMap(
    fields,
    source.initialValues,
    initialFallback
  );
  const values = buildFieldValueMap(fields, source.values, initialValues);
  const changedKeys = fields
    .map((field) => normalizeText(field?.key))
    .filter(Boolean)
    .filter((key) => !areFieldValuesEqual(values[key], normalizedDefaults[key]));
  const sourceVersion = Number(source.policyVersion);

  return {
    ...source,
    initialValues,
    values,
    defaults: normalizedDefaults,
    changedKeys,
    policyVersion: Number.isFinite(sourceVersion)
      ? Math.max(DRAFT_SOURCE_OF_TRUTH_VERSION, Math.round(sourceVersion))
      : DRAFT_SOURCE_OF_TRUTH_VERSION,
  };
}

export function normalizeDraftRenderState(rawDraft) {
  const safeDraft = asObject(rawDraft);
  return {
    objetos: normalizeRenderArray(safeDraft.objetos),
    secciones: normalizeRenderArray(safeDraft.secciones),
    rsvp: normalizeRsvp(safeDraft.rsvp),
    gifts: normalizeGifts(safeDraft.gifts),
    eventDetails: normalizeEventDetailsConfig(safeDraft.eventDetails),
  };
}

export function buildDraftContentMeta({ lastWriter, reason } = {}) {
  const safeReason = normalizeText(reason);
  return {
    policyVersion: DRAFT_SOURCE_OF_TRUTH_VERSION,
    canonicalSource: DRAFT_CANONICAL_SOURCE,
    lastWriter: normalizeWriter(lastWriter),
    ...(safeReason ? { lastReason: safeReason } : {}),
  };
}
