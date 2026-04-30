import { type GiftsConfig } from "../gifts/config";
import { type RSVPConfig as ModalConfig } from "../rsvp/config";
import {
  buildDraftContentMeta,
  type DraftRenderState,
} from "../drafts/sourceOfTruth";
import { normalizeInvitationType } from "../utils/invitationType";
import { generateHtmlFromPreparedRenderPayload } from "../render/prepareRenderPayload";
import { planPublicationPublishOperations } from "./publicationOperationPlanning";
import { type PreparedPublicationRenderState } from "./publicationPublishValidation";

type PublishOperation = "new" | "update";

type PublicationRenderArtifacts = {
  draftRenderState: DraftRenderState;
  objetosFinales: Record<string, unknown>[];
  seccionesFinales: Record<string, unknown>[];
  rsvp: ModalConfig | null;
  gifts: GiftsConfig | null;
  functionalCtaContract: PreparedPublicationRenderState["functionalCtaContract"];
};

type ApplyPublicationIconUsageDeltaResult = {
  newUsage: Record<string, number>;
  appliedDelta: Record<string, number>;
  unresolvedRefs: string[];
  resolvedRefs: number;
};

type RecordPublishedAnalyticsEventInput = {
  eventId: string;
  eventName: "invitacion_publicada";
  timestamp: Date;
  userId: string;
  invitacionId: string;
  templateId: string;
  metadata: Record<string, unknown>;
};

export type ExecutePublicationPublishParams = {
  draftSlug: string;
  publicSlug: string;
  uid: string;
  operation: PublishOperation;
  paymentSessionId: string;
  draftData: Record<string, unknown>;
  existingData: Record<string, unknown> | null;
  artifacts: PublicationRenderArtifacts;
  unknownTemplateAnalyticsId: string;
  createUpdatedAtValue(): unknown;
  createGeneratedAtValue(date: Date): unknown;
  savePublicHtml(params: { filePath: string; html: string }): Promise<void>;
  applyIconUsageDelta(params: {
    objetos: unknown[];
    oldUsageMap: unknown;
    publicSlug: string;
    usedAt: Date;
  }): Promise<ApplyPublicationIconUsageDeltaResult>;
  executePublicationWrites(params: {
    publicationWrite: Record<string, unknown>;
    draftWrite: Record<string, unknown>;
  }): Promise<void>;
  recordPublishedAnalyticsEvent?(
    input: RecordPublishedAnalyticsEventInput
  ): Promise<void>;
  warn(message: string, context: Record<string, unknown>): void;
  logError(message: string, context: Record<string, unknown>): void;
  now?: Date;
};

export type ExecutePublicationPublishResult = {
  publicSlug: string;
  publicUrl: string;
};

function getString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

const DRAFT_PUBLICATION_PORTADA_KEYS = Object.freeze([
  "thumbnailUrl",
  "thumbnailurl",
  "thumbnail_url",
  "thumbnailURL",
  "portada",
  "previewUrl",
  "previewurl",
  "preview_url",
  "previewURL",
]);

function getFirstNonEmptyString(
  source: Record<string, unknown>,
  keys: readonly string[]
): string {
  for (const key of keys) {
    const value = getString(source?.[key]);
    if (value) return value;
  }

  return "";
}

function derivePublishedInvitationType(draftData: Record<string, unknown>): string {
  const preferredRawType =
    getString(draftData.tipoInvitacion) ||
    getString(draftData.tipo) ||
    getString(draftData.plantillaTipo);

  return preferredRawType ? normalizeInvitationType(preferredRawType) : "desconocido";
}

function derivePublishedPortada(draftData: Record<string, unknown>): string | null {
  const portada = getFirstNonEmptyString(draftData, DRAFT_PUBLICATION_PORTADA_KEYS);
  return portada || null;
}

export async function executePublicationPublish(
  params: ExecutePublicationPublishParams
): Promise<ExecutePublicationPublishResult> {
  const {
    draftSlug,
    publicSlug,
    uid,
    operation,
    paymentSessionId,
    draftData,
    existingData,
    artifacts,
    unknownTemplateAnalyticsId,
    createUpdatedAtValue,
    createGeneratedAtValue,
    savePublicHtml,
    applyIconUsageDelta,
    executePublicationWrites,
    recordPublishedAnalyticsEvent,
    warn,
    logError,
  } = params;
  const now = params.now || new Date();
  const nowGeneratedAtValue = createGeneratedAtValue(now);

  const htmlFinal = generateHtmlFromPreparedRenderPayload(artifacts, {
    slug: publicSlug,
  });

  await savePublicHtml({
    filePath: `publicadas/${publicSlug}/index.html`,
    html: htmlFinal,
  });

  let iconUsage: Record<string, number> = {};
  let iconUsageMeta: Record<string, unknown> = {
    source: "publish-delta",
    resolvedRefs: 0,
    unresolvedRefs: 0,
    generatedAt: nowGeneratedAtValue,
  };

  try {
    const usageResult = await applyIconUsageDelta({
      objetos: artifacts.draftRenderState.objetos,
      oldUsageMap: existingData?.iconUsage,
      publicSlug,
      usedAt: now,
    });
    iconUsage = usageResult.newUsage;
    iconUsageMeta = {
      source: "publish-delta",
      resolvedRefs: usageResult.resolvedRefs,
      unresolvedRefs: usageResult.unresolvedRefs.length,
      generatedAt: nowGeneratedAtValue,
      appliedDelta: usageResult.appliedDelta,
    };
  } catch (iconUsageError) {
    warn("No se pudo actualizar estadisticas de iconos al publicar", {
      publicSlug,
      draftSlug,
      error:
        iconUsageError instanceof Error
          ? iconUsageError.message
          : String(iconUsageError || ""),
    });
  }

  const draftContentMeta = {
    ...buildDraftContentMeta({
      lastWriter: "publish",
      reason: "publication-snapshot-read",
    }),
    updatedAt: createUpdatedAtValue(),
  };

  const plannedPublish = planPublicationPublishOperations({
    draftSlug,
    publicSlug,
    operation,
    existingData,
    now,
    paymentSessionId,
    draftContentMeta,
  });

  const publicationWrite: Record<string, unknown> = {
    slug: publicSlug,
    userId: uid,
    plantillaId: draftData.plantillaId || null,
    urlPublica: plannedPublish.publicUrl,
    nombre: draftData.nombre || publicSlug,
    tipo: derivePublishedInvitationType(draftData),
    portada: derivePublishedPortada(draftData),
    invitadosCount: draftData.invitadosCount || 0,
    rsvp: artifacts.rsvp,
    gifts: artifacts.gifts,
    ...plannedPublish.activeLifecyclePatch,
    borradorSlug: draftSlug,
    ultimaOperacion: operation,
    lastPaymentSessionId: paymentSessionId,
    iconUsage,
    iconUsageMeta,
  };

  if (draftSlug !== publicSlug) {
    publicationWrite.slugOriginal = draftSlug;
  }

  await executePublicationWrites({
    publicationWrite,
    draftWrite: plannedPublish.linkedDraftWrite,
  });

  if (plannedPublish.isFirstPublication && recordPublishedAnalyticsEvent) {
    try {
      await recordPublishedAnalyticsEvent({
        eventId: `invitacion_publicada:${draftSlug}`,
        eventName: "invitacion_publicada",
        timestamp: plannedPublish.firstPublishedAt,
        userId: uid,
        invitacionId: draftSlug,
        templateId: getString(draftData.plantillaId) || unknownTemplateAnalyticsId,
        metadata: {
          publicSlug,
          firstPublishedAt: plannedPublish.firstPublishedAt.toISOString(),
          templateName: getString(draftData.nombre) || publicSlug,
          operation,
        },
      });
    } catch (analyticsError) {
      logError("No se pudo registrar analytics de invitacion publicada", {
        uid,
        draftSlug,
        publicSlug,
        error:
          analyticsError instanceof Error
            ? analyticsError.message
            : String(analyticsError || ""),
      });
    }
  }

  return {
    publicSlug,
    publicUrl: plannedPublish.publicUrl,
  };
}
