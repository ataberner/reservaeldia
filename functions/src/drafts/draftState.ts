export const DRAFT_STATES = {
  ACTIVE: "borrador_activo",
  TRASH: "borrador_papelera",
} as const;

type DraftState = (typeof DRAFT_STATES)[keyof typeof DRAFT_STATES];
type DraftDocData = Record<string, unknown>;

export function readMillis(value: unknown): number | null {
  if (!value) return null;

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === "string") {
    const parsed = new Date(value).getTime();
    return Number.isFinite(parsed) ? parsed : null;
  }

  if (value instanceof Date) {
    const parsed = value.getTime();
    return Number.isFinite(parsed) ? parsed : null;
  }

  if (
    typeof value === "object" &&
    value !== null &&
    "toDate" in value &&
    typeof (value as { toDate?: unknown }).toDate === "function"
  ) {
    try {
      const asDate = (value as { toDate: () => Date }).toDate();
      const parsed = asDate.getTime();
      return Number.isFinite(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }

  if (
    typeof value === "object" &&
    value !== null &&
    "seconds" in value &&
    typeof (value as { seconds?: unknown }).seconds === "number"
  ) {
    const seconds = (value as { seconds: number }).seconds;
    return Number.isFinite(seconds) ? seconds * 1000 : null;
  }

  return null;
}

function normalizeDraftStateValue(raw: unknown): DraftState {
  const value = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (!value) return DRAFT_STATES.ACTIVE;

  if (
    value === DRAFT_STATES.TRASH ||
    value === "trash" ||
    value === "papelera" ||
    value === "trashed"
  ) {
    return DRAFT_STATES.TRASH;
  }

  return DRAFT_STATES.ACTIVE;
}

export function resolveDraftStateFromData(data: DraftDocData): DraftState {
  const fromStateField = normalizeDraftStateValue(data.estadoBorrador);
  if (fromStateField === DRAFT_STATES.TRASH) return DRAFT_STATES.TRASH;

  const trashedAtMs = readMillis(data.enPapeleraAt);
  if (trashedAtMs && trashedAtMs > 0) return DRAFT_STATES.TRASH;

  return DRAFT_STATES.ACTIVE;
}
