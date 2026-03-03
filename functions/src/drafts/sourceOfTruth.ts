export const DRAFT_SOURCE_OF_TRUTH_VERSION = 1;
export const DRAFT_CANONICAL_SOURCE = "draft_render_state" as const;
// Regla de precedencia de datos:
// canvas edits > modal-applied initial patch > template defaults.

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

export type DraftRenderState = {
  objetos: unknown[];
  secciones: unknown[];
  rsvp: UnknownRecord | null;
};

export function normalizeDraftRenderState(rawDraft: unknown): DraftRenderState {
  const safeDraft = asObject(rawDraft);

  return {
    objetos: normalizeRenderArray(safeDraft.objetos),
    secciones: normalizeRenderArray(safeDraft.secciones),
    rsvp: normalizeRsvp(safeDraft.rsvp),
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
