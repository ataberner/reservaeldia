import { httpsCallable } from "firebase/functions";
import { functions as cloudFunctions } from "@/firebase";

const transitionPublicationStateCallable = httpsCallable(
  cloudFunctions,
  "transitionPublishedInvitationState"
);
const validateDraftForPublicationCallable = httpsCallable(
  cloudFunctions,
  "validateDraftForPublication"
);
const prepareDraftPreviewRenderCallable = httpsCallable(
  cloudFunctions,
  "prepareDraftPreviewRender"
);
const getMyPublicationVisitMetricsCallable = httpsCallable(
  cloudFunctions,
  "getMyPublicationVisitMetrics"
);

const PUBLICATION_METRICS_BATCH_SIZE = 25;

function toNonNegativeInteger(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.round(parsed));
}

export async function transitionPublishedInvitationState({
  slug,
  action,
}) {
  const safeSlug = typeof slug === "string" ? slug.trim() : "";
  const safeAction = typeof action === "string" ? action.trim() : "";
  if (!safeSlug) {
    throw new Error("Slug invalido para transicion de estado.");
  }
  if (!safeAction) {
    throw new Error("Accion invalida para transicion de estado.");
  }

  const result = await transitionPublicationStateCallable({
    slug: safeSlug,
    action: safeAction,
  });

  return result?.data || null;
}

export async function validateDraftForPublication({
  draftSlug,
}) {
  const safeDraftSlug = typeof draftSlug === "string" ? draftSlug.trim() : "";
  if (!safeDraftSlug) {
    throw new Error("Slug invalido para validacion de publicacion.");
  }

  const result = await validateDraftForPublicationCallable({
    draftSlug: safeDraftSlug,
  });

  return result?.data || null;
}

export async function prepareDraftPreviewRender({
  draftSlug,
  slugPreview = "",
  administrativeOwnerUid = "",
  previewTimingSessionId = "",
}) {
  const safeDraftSlug = typeof draftSlug === "string" ? draftSlug.trim() : "";
  const safeSlugPreview =
    typeof slugPreview === "string" ? slugPreview.trim() : "";
  const safeAdministrativeOwnerUid =
    typeof administrativeOwnerUid === "string"
      ? administrativeOwnerUid.trim()
      : "";
  const safePreviewTimingSessionId =
    typeof previewTimingSessionId === "string"
      ? previewTimingSessionId.trim().slice(0, 96)
      : "";
  if (!safeDraftSlug) {
    throw new Error("Slug invalido para preview preparado.");
  }

  const result = await prepareDraftPreviewRenderCallable({
    draftSlug: safeDraftSlug,
    slugPreview: safeSlugPreview,
    ...(safeAdministrativeOwnerUid
      ? { administrativeOwnerUid: safeAdministrativeOwnerUid }
      : {}),
    ...(safePreviewTimingSessionId
      ? {
          previewTiming: {
            sessionId: safePreviewTimingSessionId,
          },
        }
      : {}),
  });

  return result?.data || null;
}

export async function getMyPublicationVisitMetrics({ slugs = [] } = {}) {
  const normalizedSlugs = Array.from(
    new Set(
      (Array.isArray(slugs) ? slugs : [])
        .map((slug) => (typeof slug === "string" ? slug.trim() : ""))
        .filter(Boolean)
    )
  );

  if (!normalizedSlugs.length) return {};

  const batches = [];
  for (
    let index = 0;
    index < normalizedSlugs.length;
    index += PUBLICATION_METRICS_BATCH_SIZE
  ) {
    batches.push(normalizedSlugs.slice(index, index + PUBLICATION_METRICS_BATCH_SIZE));
  }

  const results = await Promise.all(
    batches.map((batch) => getMyPublicationVisitMetricsCallable({ slugs: batch }))
  );

  const metrics = results.reduce((allMetrics, result) => {
    const rawMetrics =
      result?.data?.metrics && typeof result.data.metrics === "object"
        ? result.data.metrics
        : null;
    if (!rawMetrics) {
      throw new Error("La respuesta de metricas de visitas es invalida.");
    }

    Object.entries(rawMetrics).forEach(([slug, rawMetric]) => {
      allMetrics[slug] = {
        totalVisits: toNonNegativeInteger(rawMetric?.totalVisits),
        uniqueVisits: toNonNegativeInteger(rawMetric?.uniqueVisits),
      };
    });

    return allMetrics;
  }, {});

  if (normalizedSlugs.some((slug) => !Object.hasOwn(metrics, slug))) {
    throw new Error("Faltan metricas de una publicacion solicitada.");
  }

  return metrics;
}
