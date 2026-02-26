export const DRAFT_STATES = Object.freeze({
  ACTIVE: "borrador_activo",
  TRASH: "borrador_papelera",
});

export const DRAFT_TRASH_RETENTION_DAYS = 30;

function normalizeText(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export function toMs(value) {
  if (!value) return 0;
  if (typeof value === "number") return value;
  if (value instanceof Date) {
    const parsed = value.getTime();
    return Number.isFinite(parsed) ? parsed : 0;
  }
  if (typeof value === "string") {
    const parsed = new Date(value).getTime();
    return Number.isFinite(parsed) ? parsed : 0;
  }
  if (typeof value === "object" && typeof value.toDate === "function") {
    const parsed = value.toDate();
    return parsed instanceof Date ? parsed.getTime() : 0;
  }
  if (typeof value === "object" && typeof value.seconds === "number") {
    return value.seconds * 1000;
  }
  return 0;
}

export function toDate(value) {
  const ms = toMs(value);
  return ms > 0 ? new Date(ms) : null;
}

export function normalizeDraftStateValue(value) {
  const normalized = normalizeText(value);
  if (!normalized) return DRAFT_STATES.ACTIVE;

  if (
    normalized === DRAFT_STATES.TRASH ||
    normalized === "trash" ||
    normalized === "papelera" ||
    normalized === "trashed"
  ) {
    return DRAFT_STATES.TRASH;
  }

  return DRAFT_STATES.ACTIVE;
}

export function resolveDraftState(draft) {
  if (!draft || typeof draft !== "object") return DRAFT_STATES.ACTIVE;

  const fromState = normalizeDraftStateValue(draft.estadoBorrador);
  if (fromState === DRAFT_STATES.TRASH) return DRAFT_STATES.TRASH;

  if (toMs(draft.enPapeleraAt) > 0) return DRAFT_STATES.TRASH;

  return DRAFT_STATES.ACTIVE;
}

export function isDraftTrashed(draft) {
  return resolveDraftState(draft) === DRAFT_STATES.TRASH;
}

export function resolveDraftTrashDates(draft) {
  const trashedAt = toDate(draft?.enPapeleraAt);
  const purgeAt = toDate(draft?.eliminacionDefinitivaAt);
  return { trashedAt, purgeAt };
}

export function computeDraftTrashPurgeAt(draft) {
  const { trashedAt, purgeAt } = resolveDraftTrashDates(draft);
  if (purgeAt instanceof Date) return purgeAt;
  if (!(trashedAt instanceof Date)) return null;

  return new Date(
    trashedAt.getTime() + DRAFT_TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000
  );
}
