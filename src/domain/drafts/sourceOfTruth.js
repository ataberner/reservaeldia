export const DRAFT_SOURCE_OF_TRUTH_VERSION = 1;
export const DRAFT_CANONICAL_SOURCE = "draft_render_state";
// Regla de precedencia de datos:
// canvas edits > modal-applied initial patch > template defaults.

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

export function normalizeDraftRenderState(rawDraft) {
  const safeDraft = asObject(rawDraft);
  return {
    objetos: normalizeRenderArray(safeDraft.objetos),
    secciones: normalizeRenderArray(safeDraft.secciones),
    rsvp: normalizeRsvp(safeDraft.rsvp),
    gifts: normalizeGifts(safeDraft.gifts),
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
