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
import {
  buildPublicationOgDescription,
  injectOpenGraphMetadata,
  isPublishedShareImageEnabled,
  resolveRequiredGeneratedPublishedShareImageMetadata,
  type GeneratedShareImageResult,
  type PublishedShareMetadata,
} from "./publishedShareImage";
import { type CaptureFirstSectionShareImageParams } from "./publishedShareImageRenderer";

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

type PublicArtifactSnapshot = {
  content: Buffer;
  contentType?: string | null;
  cacheControl?: string | null;
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
  generateShareImage?(
    params: CaptureFirstSectionShareImageParams
  ): Promise<Buffer | GeneratedShareImageResult>;
  savePublicShareImage(params: {
    storagePath: string;
    image: Buffer;
    contentType: "image/jpeg";
    cacheControl: string;
  }): Promise<void>;
  confirmPublicShareImage(params: { storagePath: string }): Promise<boolean>;
  readPublicArtifact?(params: {
    filePath: string;
  }): Promise<PublicArtifactSnapshot | null>;
  restorePublicArtifact?(params: {
    filePath: string;
    artifact: PublicArtifactSnapshot;
  }): Promise<void>;
  deletePublicArtifact?(params: { filePath: string }): Promise<void>;
  shareImageEnabled?: boolean;
  renderTimeoutMs?: number;
  jpegQuality?: number;
  defaultShareImageUrl?: string;
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

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error || "");
}

async function readExistingArtifact(params: {
  filePath: string;
  readPublicArtifact?: ExecutePublicationPublishParams["readPublicArtifact"];
}): Promise<PublicArtifactSnapshot | null> {
  if (!params.readPublicArtifact) return null;
  return params.readPublicArtifact({ filePath: params.filePath });
}

async function restoreOrDeleteArtifact(params: {
  filePath: string;
  backup: PublicArtifactSnapshot | null;
  deleteWhenMissing: boolean;
  restorePublicArtifact?: ExecutePublicationPublishParams["restorePublicArtifact"];
  deletePublicArtifact?: ExecutePublicationPublishParams["deletePublicArtifact"];
  warn(message: string, context: Record<string, unknown>): void;
  context: Record<string, unknown>;
}): Promise<void> {
  const {
    filePath,
    backup,
    deleteWhenMissing,
    restorePublicArtifact,
    deletePublicArtifact,
    warn,
    context,
  } = params;

  try {
    if (backup) {
      if (!restorePublicArtifact) {
        warn("No hay restaurador de artefactos publicados configurado", {
          ...context,
          filePath,
        });
        return;
      }
      await restorePublicArtifact({ filePath, artifact: backup });
      return;
    }

    if (deleteWhenMissing && deletePublicArtifact) {
      await deletePublicArtifact({ filePath });
    }
  } catch (rollbackError) {
    warn("No se pudo restaurar artefacto publicado tras fallo de publish", {
      ...context,
      filePath,
      error: getErrorMessage(rollbackError),
    });
  }
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
    generateShareImage,
    savePublicShareImage,
    confirmPublicShareImage,
    readPublicArtifact,
    restorePublicArtifact,
    deletePublicArtifact,
    applyIconUsageDelta,
    executePublicationWrites,
    recordPublishedAnalyticsEvent,
    warn,
    logError,
  } = params;
  const now = params.now || new Date();
  const nowGeneratedAtValue = createGeneratedAtValue(now);

  const baseHtml = generateHtmlFromPreparedRenderPayload(artifacts, {
    slug: publicSlug,
  });

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

  const publicationTitle = getString(draftData.nombre) || publicSlug;
  const htmlPath = `publicadas/${publicSlug}/index.html`;
  const sharePath = `publicadas/${publicSlug}/share.jpg`;
  const shouldProtectExistingArtifacts = operation === "update" && Boolean(existingData);
  const existingHtmlBackup = shouldProtectExistingArtifacts
    ? await readExistingArtifact({ filePath: htmlPath, readPublicArtifact })
    : null;
  const existingShareBackup = shouldProtectExistingArtifacts
    ? await readExistingArtifact({ filePath: sharePath, readPublicArtifact })
    : null;
  let shareWriteAttempted = false;
  let htmlWriteAttempted = false;
  let share: PublishedShareMetadata;

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

  try {
    share = await resolveRequiredGeneratedPublishedShareImageMetadata({
      publicSlug,
      publicUrl: plannedPublish.publicUrl,
      baseHtml,
      generatedAt: nowGeneratedAtValue,
      shareImageEnabled:
        typeof params.shareImageEnabled === "boolean"
          ? params.shareImageEnabled
          : isPublishedShareImageEnabled(),
      renderTimeoutMs: params.renderTimeoutMs,
      jpegQuality: params.jpegQuality,
      generatedSource: "renderer",
      generateShareImage,
      saveGeneratedShareImage: async (input) => {
        shareWriteAttempted = true;
        return savePublicShareImage(input);
      },
      confirmGeneratedShareImage: confirmPublicShareImage,
      warn,
    });

    const finalHtml = injectOpenGraphMetadata(baseHtml, {
      title: publicationTitle,
      description: buildPublicationOgDescription(),
      imageUrl: share.imageUrl,
      url: plannedPublish.publicUrl,
      imageWidth: share.width,
      imageHeight: share.height,
    });

    htmlWriteAttempted = true;
    await savePublicHtml({
      filePath: htmlPath,
      html: finalHtml,
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
      share,
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
  } catch (publishError) {
    const rollbackContext = {
      draftSlug,
      publicSlug,
      operation,
      error: getErrorMessage(publishError),
    };

    if (shareWriteAttempted || shouldProtectExistingArtifacts) {
      await restoreOrDeleteArtifact({
        filePath: sharePath,
        backup: existingShareBackup,
        deleteWhenMissing: !shouldProtectExistingArtifacts,
        restorePublicArtifact,
        deletePublicArtifact,
        warn,
        context: rollbackContext,
      });
    }

    if (htmlWriteAttempted || shouldProtectExistingArtifacts) {
      await restoreOrDeleteArtifact({
        filePath: htmlPath,
        backup: existingHtmlBackup,
        deleteWhenMissing: !shouldProtectExistingArtifacts,
        restorePublicArtifact,
        deletePublicArtifact,
        warn,
        context: rollbackContext,
      });
    }

    throw publishError;
  }

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
