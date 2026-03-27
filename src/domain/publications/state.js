export const PUBLICATION_STATES = Object.freeze({
  ACTIVE: "publicada_activa",
  PAUSED: "publicada_pausada",
  TRASH: "papelera",
  FINALIZED: "finalizada",
});

export const TRASH_RETENTION_DAYS = 30;
const PUBLICATION_VIGENCY_MONTHS = 12;

function normalizeStateText(value) {
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

function resolvePublicationLifecycleRecord(publication) {
  if (!publication || typeof publication !== "object" || Array.isArray(publication)) {
    return null;
  }

  const lifecycle = publication.publicationLifecycle;
  if (!lifecycle || typeof lifecycle !== "object" || Array.isArray(lifecycle)) {
    return null;
  }

  return lifecycle;
}

function isExplicitFinalizedState(value) {
  const normalized = normalizeStateText(value);
  return normalized === PUBLICATION_STATES.FINALIZED || normalized === "finalized";
}

function isDraftLifecycleState(value) {
  return normalizeStateText(value) === "draft";
}

function normalizePublicationPublicStateValue(value) {
  const normalized = normalizeStateText(value);
  if (!normalized) return null;

  if (
    normalized === PUBLICATION_STATES.ACTIVE ||
    normalized === "active" ||
    normalized === "activa" ||
    normalized === "published"
  ) {
    return PUBLICATION_STATES.ACTIVE;
  }

  if (
    normalized === PUBLICATION_STATES.PAUSED ||
    normalized === "paused" ||
    normalized === "pausada"
  ) {
    return PUBLICATION_STATES.PAUSED;
  }

  if (normalized === PUBLICATION_STATES.TRASH || normalized === "trash") {
    return PUBLICATION_STATES.TRASH;
  }

  return null;
}

export function normalizePublicationStateValue(value) {
  const normalized = normalizeStateText(value);
  if (!normalized) return "";

  if (
    normalized === PUBLICATION_STATES.ACTIVE ||
    normalized === "active" ||
    normalized === "activa" ||
    normalized === "published"
  ) {
    return PUBLICATION_STATES.ACTIVE;
  }

  if (
    normalized === PUBLICATION_STATES.PAUSED ||
    normalized === "paused" ||
    normalized === "pausada"
  ) {
    return PUBLICATION_STATES.PAUSED;
  }

  if (
    normalized === PUBLICATION_STATES.TRASH ||
    normalized === "trash"
  ) {
    return PUBLICATION_STATES.TRASH;
  }

  if (
    normalized === PUBLICATION_STATES.FINALIZED ||
    normalized === "finalized"
  ) {
    return PUBLICATION_STATES.FINALIZED;
  }

  return "";
}

function addMonthsPreservingDateTimeUTC(baseDate, monthsToAdd) {
  const months = Number.isFinite(monthsToAdd) ? Math.trunc(monthsToAdd) : 0;
  const year = baseDate.getUTCFullYear();
  const month = baseDate.getUTCMonth();
  const day = baseDate.getUTCDate();
  const hour = baseDate.getUTCHours();
  const minute = baseDate.getUTCMinutes();
  const second = baseDate.getUTCSeconds();
  const millisecond = baseDate.getUTCMilliseconds();

  const totalMonths = month + months;
  const targetYear = year + Math.floor(totalMonths / 12);
  const targetMonth = ((totalMonths % 12) + 12) % 12;
  const lastDayOfMonth = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  const safeDay = Math.min(day, lastDayOfMonth);

  return new Date(
    Date.UTC(targetYear, targetMonth, safeDay, hour, minute, second, millisecond)
  );
}

function computePublicationExpirationDate(publishedAt) {
  if (!(publishedAt instanceof Date)) return null;
  return addMonthsPreservingDateTimeUTC(publishedAt, PUBLICATION_VIGENCY_MONTHS);
}

export function resolvePublicationState(publication) {
  if (!publication || typeof publication !== "object") {
    return PUBLICATION_STATES.ACTIVE;
  }

  if (isExplicitFinalizedState(publication.estado)) {
    return PUBLICATION_STATES.FINALIZED;
  }
  if (isDraftLifecycleState(publication.estado)) {
    return null;
  }

  const fromEstado = normalizePublicationPublicStateValue(publication.estado);
  if (fromEstado) return fromEstado;

  const lifecycle = resolvePublicationLifecycleRecord(publication);

  if (isExplicitFinalizedState(lifecycle?.state)) {
    return PUBLICATION_STATES.FINALIZED;
  }
  if (isDraftLifecycleState(lifecycle?.state)) {
    return null;
  }

  const fromLifecycle = normalizePublicationPublicStateValue(lifecycle?.state);
  if (fromLifecycle) return fromLifecycle;

  if (publication.enPapeleraAt) return PUBLICATION_STATES.TRASH;
  if (publication.pausadaAt) return PUBLICATION_STATES.PAUSED;

  return PUBLICATION_STATES.ACTIVE;
}

export function resolvePublicationDates(publication) {
  const lifecycle = resolvePublicationLifecycleRecord(publication);
  const publishedAt =
    toDate(publication?.publicadaAt) ||
    toDate(publication?.publicadaEn) ||
    toDate(lifecycle?.firstPublishedAt) ||
    null;
  const expiresAt =
    toDate(publication?.venceAt) ||
    toDate(publication?.vigenteHasta) ||
    toDate(lifecycle?.expiresAt) ||
    computePublicationExpirationDate(publishedAt);
  const pausedAt = toDate(publication?.pausadaAt);
  const trashedAt = toDate(publication?.enPapeleraAt);

  return {
    publishedAt,
    expiresAt,
    pausedAt,
    trashedAt,
  };
}

export function isPublicationExpired(publication, nowMs = Date.now()) {
  const { expiresAt } = resolvePublicationDates(publication);
  if (!expiresAt) return false;
  return expiresAt.getTime() <= nowMs;
}

export function isPublicationFinalized(publication, nowMs = Date.now()) {
  const source = normalizeStateText(publication?.source);
  if (source === "history") return true;

  const state = resolvePublicationState(publication);
  if (state === PUBLICATION_STATES.FINALIZED) return true;
  if (state === PUBLICATION_STATES.TRASH) return false;

  return isPublicationExpired(publication, nowMs);
}

export function getPublicationStatus(publication, nowMs = Date.now()) {
  const state = resolvePublicationState(publication);
  const finalized = isPublicationFinalized(publication, nowMs);

  if (finalized) {
    return {
      state: PUBLICATION_STATES.FINALIZED,
      label: "Finalizada",
      isFinalized: true,
      isActive: false,
      isPaused: false,
      isTrashed: false,
    };
  }

  if (state === PUBLICATION_STATES.PAUSED) {
    return {
      state,
      label: "Pausada",
      isFinalized: false,
      isActive: false,
      isPaused: true,
      isTrashed: false,
    };
  }

  if (state === PUBLICATION_STATES.TRASH) {
    return {
      state,
      label: "Papelera",
      isFinalized: false,
      isActive: false,
      isPaused: false,
      isTrashed: true,
    };
  }

  if (state !== PUBLICATION_STATES.ACTIVE) {
    return {
      state: null,
      label: "No disponible",
      isFinalized: false,
      isActive: false,
      isPaused: false,
      isTrashed: false,
    };
  }

  return {
    state: PUBLICATION_STATES.ACTIVE,
    label: "Activa",
    isFinalized: false,
    isActive: true,
    isPaused: false,
    isTrashed: false,
  };
}

export function computeTrashPurgeAt(publicationOrExpiresAt) {
  const expiresAt =
    publicationOrExpiresAt instanceof Date
      ? publicationOrExpiresAt
      : resolvePublicationDates(publicationOrExpiresAt).expiresAt;

  if (!(expiresAt instanceof Date)) return null;

  return new Date(
    expiresAt.getTime() + TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000
  );
}

export function isPublicSlugAvailableForVisitors(publication, nowMs = Date.now()) {
  const status = getPublicationStatus(publication, nowMs);
  return status.isActive;
}
