export const DRAFT_SOURCE_OF_TRUTH_VERSION = 2;
export const DRAFT_CANONICAL_SOURCE = "draft_render_state" as const;
// Render roots remain canonical for presentation. Structured dynamic values live
// in templateInput.values and are projected into render roots by their targets.

const {
  normalizeEventDetailsConfig,
} = require("../../shared/eventDetailsConfig.cjs");

const DRAFT_WRITERS = new Set(["modal", "canvas", "system", "publish"] as const);

type DraftWriter = "modal" | "canvas" | "system" | "publish";

type UnknownRecord = Record<string, unknown>;

function asObject(value: unknown): UnknownRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as UnknownRecord;
}

function normalizeText(value: unknown): string {
  return String(value || "").trim();
}

function normalizeWriter(value: unknown): DraftWriter {
  const normalized = normalizeText(value).toLowerCase() as DraftWriter;
  if (!DRAFT_WRITERS.has(normalized)) return "system";
  return normalized;
}

function normalizeRenderArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function normalizeRsvp(value: unknown): UnknownRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as UnknownRecord;
}

function normalizeGifts(value: unknown): UnknownRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as UnknownRecord;
}

function hasOwn(value: UnknownRecord, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function normalizeFieldValue(fieldType: unknown, value: unknown): unknown {
  if (normalizeText(fieldType).toLowerCase() === "images") {
    return Array.isArray(value) ? value : [];
  }
  return value === null || typeof value === "undefined" ? "" : value;
}

function buildFieldValueMap(
  fieldsSchema: unknown,
  primaryValues: unknown,
  fallbackValues: unknown
): UnknownRecord {
  const fields = Array.isArray(fieldsSchema) ? fieldsSchema : [];
  const primary = asObject(primaryValues);
  const fallback = asObject(fallbackValues);
  const selected: UnknownRecord = { ...fallback, ...primary };

  fields.forEach((rawField) => {
    const field = asObject(rawField);
    const key = normalizeText(field.key);
    if (!key) return;
    const rawValue = hasOwn(primary, key)
      ? primary[key]
      : hasOwn(fallback, key)
        ? fallback[key]
        : undefined;
    selected[key] = normalizeFieldValue(field.type, rawValue);
  });

  return selected;
}

function areFieldValuesEqual(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  try {
    return JSON.stringify(left) === JSON.stringify(right);
  } catch {
    return false;
  }
}

export type DraftTemplateInput = UnknownRecord & {
  initialValues: UnknownRecord;
  values: UnknownRecord;
  defaults: UnknownRecord;
  changedKeys: string[];
  policyVersion: number;
};

export function normalizeDraftTemplateInput(params?: {
  templateInput?: unknown;
  fieldsSchema?: unknown;
  defaults?: unknown;
  fallbackValues?: unknown;
}): DraftTemplateInput {
  const source = asObject(params?.templateInput);
  const fields = Array.isArray(params?.fieldsSchema) ? params?.fieldsSchema : [];
  const normalizedDefaults = buildFieldValueMap(fields, source.defaults, params?.defaults);
  const initialValues = buildFieldValueMap(fields, source.initialValues, {
    ...normalizedDefaults,
    ...asObject(params?.fallbackValues),
  });
  const values = buildFieldValueMap(fields, source.values, initialValues);
  const changedKeys = fields
    .map((rawField) => normalizeText(asObject(rawField).key))
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

export type DraftRenderState = {
  objetos: unknown[];
  secciones: unknown[];
  rsvp: UnknownRecord | null;
  gifts: UnknownRecord | null;
  eventDetails: UnknownRecord;
};

export function normalizeDraftRenderState(rawDraft: unknown): DraftRenderState {
  const safeDraft = asObject(rawDraft);

  return {
    objetos: normalizeRenderArray(safeDraft.objetos),
    secciones: normalizeRenderArray(safeDraft.secciones),
    rsvp: normalizeRsvp(safeDraft.rsvp),
    gifts: normalizeGifts(safeDraft.gifts),
    eventDetails: normalizeEventDetailsConfig(safeDraft.eventDetails) as UnknownRecord,
  };
}

export function buildDraftContentMeta(params?: {
  lastWriter?: unknown;
  reason?: unknown;
}): {
  policyVersion: number;
  canonicalSource: typeof DRAFT_CANONICAL_SOURCE;
  lastWriter: DraftWriter;
  lastReason?: string;
} {
  const safeReason = normalizeText(params?.reason);

  return {
    policyVersion: DRAFT_SOURCE_OF_TRUTH_VERSION,
    canonicalSource: DRAFT_CANONICAL_SOURCE,
    lastWriter: normalizeWriter(params?.lastWriter),
    ...(safeReason ? { lastReason: safeReason } : {}),
  };
}
