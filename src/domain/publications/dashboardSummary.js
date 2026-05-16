import { toMs } from "./state.js";

function normalizeText(value) {
  return String(value || "").trim();
}

function isImageSrc(value) {
  const src = normalizeText(value);
  if (!src) return false;
  if (src === "/placeholder.jpg" || src.endsWith("/placeholder.jpg")) {
    return false;
  }
  return (
    /^https?:\/\//i.test(src) ||
    /^data:image\//i.test(src) ||
    /^blob:/i.test(src) ||
    src.startsWith("/")
  );
}

function uniqueStrings(values = []) {
  return Array.from(
    new Set(values.map((value) => normalizeText(value)).filter(Boolean))
  );
}

export function resolvePublicationPublishedMs(publication) {
  const raw =
    publication?.raw && typeof publication.raw === "object"
      ? publication.raw
      : {};

  return (
    toMs(raw.ultimaPublicacionEn) ||
    toMs(publication?.publishedAt) ||
    toMs(raw.publicadaAt) ||
    toMs(raw.publicadaEn) ||
    toMs(raw.publicationLifecycle?.lastPublishedAt) ||
    toMs(raw.publicationLifecycle?.firstPublishedAt) ||
    0
  );
}

export function formatDashboardPublishedDate(value) {
  const ms = toMs(value);
  if (!ms) return "";

  const date = new Date(ms);
  const day = new Intl.DateTimeFormat("es-AR", {
    day: "numeric",
  }).format(date);
  const month = new Intl.DateTimeFormat("es-AR", {
    month: "long",
  }).format(date);
  const year = new Intl.DateTimeFormat("es-AR", {
    year: "numeric",
  }).format(date);

  return `${day} de ${month}, ${year}`;
}

export function selectLatestActiveDashboardPublication(publications = []) {
  return (Array.isArray(publications) ? publications : [])
    .filter(
      (publication) =>
        publication?.source === "active" &&
        publication?.isActive === true &&
        normalizeText(publication?.publicSlug || publication?.id)
    )
    .sort((left, right) => {
      const dateDelta =
        resolvePublicationPublishedMs(right) - resolvePublicationPublishedMs(left);
      if (dateDelta !== 0) return dateDelta;
      return Number(right?.sortMs || 0) - Number(left?.sortMs || 0);
    })[0] || null;
}

export function resolveDashboardPublicationPreviewCandidates(publication) {
  const raw =
    publication?.raw && typeof publication.raw === "object"
      ? publication.raw
      : {};
  const share =
    raw.share && typeof raw.share === "object" && raw.share.status === "generated"
      ? raw.share
      : {};

  return uniqueStrings([
    publication?.portada,
    ...(Array.isArray(publication?.previewCandidates)
      ? publication.previewCandidates
      : []),
    share.imageUrl,
  ]).filter(isImageSrc);
}

export function buildDashboardPublicationSummary(publications = []) {
  const publication = selectLatestActiveDashboardPublication(publications);
  if (!publication) return null;

  const publishedMs = resolvePublicationPublishedMs(publication);
  const publishedDateLabel = formatDashboardPublishedDate(publishedMs);
  const publicSlug = normalizeText(publication.publicSlug || publication.id);
  const publicUrl = normalizeText(publication.url || publication.raw?.urlPublica);
  const previewCandidates =
    resolveDashboardPublicationPreviewCandidates(publication);

  if (!publishedDateLabel || !publicSlug || !publicUrl || !previewCandidates.length) {
    return null;
  }

  return {
    publication,
    publicSlug,
    publicUrl,
    title:
      normalizeText(publication.nombre || publication.raw?.nombre) ||
      "Invitacion",
    publishedMs,
    publishedDateLabel,
    previewCandidates,
  };
}
