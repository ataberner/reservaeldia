export type PublishingStageKey =
  | "preparing_invitation"
  | "validating_content"
  | "generating_public_html"
  | "generating_share_image"
  | "saving_publication"
  | "finalizing_publication";

type PublishingStageStatus = "running" | "completed" | "failed";
type PublishingSubstageStatus = "running" | "completed" | "failed";

type SessionRefLike = {
  set(data: Record<string, unknown>, options: { merge: true }): Promise<unknown>;
};

type PublishingStageDefinition = {
  key: PublishingStageKey;
  order: number;
  label: string;
};

export type PublishingSubstageDefinition = {
  key: string;
  label: string;
};

export type PublishingProgressReporter = {
  start(stage: PublishingStageKey, context?: Record<string, unknown>): Promise<void>;
  complete(stage: PublishingStageKey, context?: Record<string, unknown>): Promise<void>;
  fail(error: unknown, context?: Record<string, unknown>): Promise<void>;
  startSubstage?(
    substage: PublishingSubstageDefinition,
    context?: Record<string, unknown>
  ): Promise<void>;
  completeSubstage?(
    substage: PublishingSubstageDefinition,
    context?: Record<string, unknown>
  ): Promise<void>;
  failSubstage?(error: unknown, context?: Record<string, unknown>): Promise<void>;
  recordDiagnostics?(context?: Record<string, unknown>): Promise<void>;
};

export const PUBLISHING_STAGE_DEFINITIONS: readonly PublishingStageDefinition[] =
  Object.freeze([
    {
      key: "preparing_invitation",
      order: 1,
      label: "Preparando invitacion",
    },
    {
      key: "validating_content",
      order: 2,
      label: "Validando contenido",
    },
    {
      key: "generating_public_html",
      order: 3,
      label: "Generando HTML publico",
    },
    {
      key: "generating_share_image",
      order: 4,
      label: "Generando imagen para compartir",
    },
    {
      key: "saving_publication",
      order: 5,
      label: "Guardando publicacion",
    },
    {
      key: "finalizing_publication",
      order: 6,
      label: "Finalizando publicacion",
    },
  ]);

const PUBLISHING_STAGE_BY_KEY = new Map(
  PUBLISHING_STAGE_DEFINITIONS.map((stage) => [stage.key, stage])
);

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error || "");
}

function getErrorCode(error: unknown): string {
  const message = getErrorMessage(error);
  if (!message) return "publish-error";
  if (message === "renderer-timeout" || /renderer-timeout/i.test(message)) {
    return "renderer-timeout";
  }
  if (/timeout/i.test(message)) {
    return "timeout";
  }
  return message.slice(0, 80);
}

function getStageDefinition(stage: PublishingStageKey): PublishingStageDefinition {
  return PUBLISHING_STAGE_BY_KEY.get(stage) || PUBLISHING_STAGE_DEFINITIONS[0];
}

function getSubstageFromContext(
  context: Record<string, unknown>
): PublishingSubstageDefinition | null {
  const key = typeof context.substage === "string" ? context.substage.trim() : "";
  const label =
    typeof context.substageLabel === "string" ? context.substageLabel.trim() : "";
  if (!key) return null;
  return {
    key,
    label: label || key,
  };
}

function sanitizeDiagnosticValue(value: unknown): unknown {
  if (typeof value === "undefined" || typeof value === "function") return undefined;
  if (value === null) return null;
  if (typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (value instanceof Error) return value.message;
  if (Array.isArray(value)) {
    const sanitized = value
      .slice(0, 25)
      .map((item) => sanitizeDiagnosticValue(item))
      .filter((item) => typeof item !== "undefined");
    return sanitized;
  }
  if (value && typeof value === "object") {
    const output: Record<string, unknown> = {};
    for (const [key, nestedValue] of Object.entries(value as Record<string, unknown>)) {
      const sanitized = sanitizeDiagnosticValue(nestedValue);
      if (typeof sanitized !== "undefined") {
        output[key] = sanitized;
      }
    }
    return output;
  }
  return String(value || "");
}

function sanitizeDiagnosticContext(
  context: Record<string, unknown> = {}
): Record<string, unknown> {
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(context)) {
    const sanitized = sanitizeDiagnosticValue(value);
    if (typeof sanitized !== "undefined") {
      output[key] = sanitized;
    }
  }
  return output;
}

function buildStageSnapshot(params: {
  stage: PublishingStageKey;
  status: PublishingStageStatus;
  timestampValue: unknown;
  durationMs?: number;
  errorCode?: string;
  substage?: Record<string, unknown> | null;
}): Record<string, unknown> {
  const definition = getStageDefinition(params.stage);
  const snapshot: Record<string, unknown> = {
    key: definition.key,
    label: definition.label,
    order: definition.order,
    status: params.status,
    updatedAt: params.timestampValue,
  };

  if (params.status === "running") {
    snapshot.startedAt = params.timestampValue;
  }

  if (params.status === "completed") {
    snapshot.completedAt = params.timestampValue;
  }

  if (params.status === "failed") {
    snapshot.failedAt = params.timestampValue;
    snapshot.errorCode = params.errorCode || "publish-error";
  }

  if (typeof params.durationMs === "number" && Number.isFinite(params.durationMs)) {
    snapshot.durationMs = Math.max(0, Math.round(params.durationMs));
  }

  if (params.substage) {
    snapshot.substage = params.substage;
  }

  return snapshot;
}

function buildSubstageSnapshot(params: {
  substage: PublishingSubstageDefinition;
  status: PublishingSubstageStatus;
  timestampValue: unknown;
  durationMs?: number;
  errorCode?: string;
}): Record<string, unknown> {
  const snapshot: Record<string, unknown> = {
    key: params.substage.key,
    label: params.substage.label,
    status: params.status,
    updatedAt: params.timestampValue,
  };

  if (params.status === "running") {
    snapshot.startedAt = params.timestampValue;
  }

  if (params.status === "completed") {
    snapshot.completedAt = params.timestampValue;
  }

  if (params.status === "failed") {
    snapshot.failedAt = params.timestampValue;
    snapshot.errorCode = params.errorCode || "publish-error";
  }

  if (typeof params.durationMs === "number" && Number.isFinite(params.durationMs)) {
    snapshot.durationMs = Math.max(0, Math.round(params.durationMs));
  }

  return snapshot;
}

export function createPublishingProgressReporter(params: {
  sessionRef: SessionRefLike;
  createUpdatedAtValue(): unknown;
  logInfo?(message: string, context: Record<string, unknown>): void;
  logError?(message: string, context: Record<string, unknown>): void;
  baseContext?: Record<string, unknown>;
}): PublishingProgressReporter {
  const startedAtMsByStage = new Map<PublishingStageKey, number>();
  const startedAtMsBySubstage = new Map<string, number>();
  let currentStage: PublishingStageKey | null = null;
  let currentStageSnapshot: Record<string, unknown> | null = null;
  let currentSubstage: PublishingSubstageDefinition | null = null;
  let currentSubstageSnapshot: Record<string, unknown> | null = null;

  async function writeStage(
    stage: PublishingStageKey,
    status: PublishingStageStatus,
    context: Record<string, unknown> = {},
    error?: unknown
  ): Promise<void> {
    const timestampValue = params.createUpdatedAtValue();
    const startedAtMs = startedAtMsByStage.get(stage);
    const durationMs =
      status === "running" || typeof startedAtMs !== "number"
        ? undefined
        : Date.now() - startedAtMs;
    const errorCode = status === "failed" ? getErrorCode(error) : undefined;
    const snapshot = buildStageSnapshot({
      stage,
      status,
      timestampValue,
      durationMs,
      errorCode,
      substage:
        status === "failed" && currentSubstageSnapshot
          ? currentSubstageSnapshot
          : null,
    });
    currentStageSnapshot = snapshot;
    const write: Record<string, unknown> = {
      publishingStage: snapshot,
      publishingStageUpdatedAt: timestampValue,
      updatedAt: timestampValue,
    };

    if (typeof durationMs === "number" && Number.isFinite(durationMs)) {
      write.publishingStageDurationsMs = {
        [stage]: Math.max(0, Math.round(durationMs)),
      };
    }

    const logContext = {
      ...(params.baseContext || {}),
      ...context,
      stage,
      stageLabel: snapshot.label,
      stageStatus: status,
      durationMs: snapshot.durationMs || null,
      errorCode: errorCode || null,
    };

    try {
      await params.sessionRef.set(write, { merge: true });
    } catch (writeError) {
      params.logError?.("No se pudo persistir progreso de publicacion", {
        ...logContext,
        error: getErrorMessage(writeError),
      });
      return;
    }

    try {
      if (status === "failed") {
        params.logError?.("Fallo etapa de publicacion", {
          ...logContext,
          error: getErrorMessage(error),
        });
      } else {
        params.logInfo?.("Etapa de publicacion actualizada", logContext);
      }
    } catch (_logError) {
      // Progress logging must not affect the publish lifecycle.
    }
  }

  async function writeSubstage(
    substage: PublishingSubstageDefinition,
    status: PublishingSubstageStatus,
    context: Record<string, unknown> = {},
    error?: unknown
  ): Promise<void> {
    const timestampValue = params.createUpdatedAtValue();
    const startedAtMs = startedAtMsBySubstage.get(substage.key);
    const durationMs =
      status === "running" || typeof startedAtMs !== "number"
        ? undefined
        : Date.now() - startedAtMs;
    const errorCode = status === "failed" ? getErrorCode(error) : undefined;
    const sanitizedContext = sanitizeDiagnosticContext(context);
    const snapshot = buildSubstageSnapshot({
      substage,
      status,
      timestampValue,
      durationMs,
      errorCode,
    });

    currentSubstage = substage;
    currentSubstageSnapshot = snapshot;

    const stageSnapshot = currentStageSnapshot
      ? {
          ...currentStageSnapshot,
          updatedAt: timestampValue,
          substage: snapshot,
        }
      : null;
    if (stageSnapshot) {
      currentStageSnapshot = stageSnapshot;
    }

    const diagnostics: Record<string, unknown> = {
      ...sanitizedContext,
      updatedAt: timestampValue,
      stage: currentStage,
      substage: substage.key,
      substageLabel: substage.label,
      substageStatus: status,
      errorCode: errorCode || null,
      durationMs:
        typeof durationMs === "number" && Number.isFinite(durationMs)
          ? Math.max(0, Math.round(durationMs))
          : null,
    };

    const write: Record<string, unknown> = {
      publishingShareImageSubstage: snapshot,
      publishingShareImageDiagnostics: diagnostics,
      publishingShareImageDiagnosticsUpdatedAt: timestampValue,
      updatedAt: timestampValue,
    };

    if (stageSnapshot) {
      write.publishingStage = stageSnapshot;
      write.publishingStageUpdatedAt = timestampValue;
    }

    const logContext = {
      ...(params.baseContext || {}),
      ...sanitizedContext,
      stage: currentStage,
      substage: substage.key,
      substageLabel: substage.label,
      substageStatus: status,
      durationMs: diagnostics.durationMs,
      errorCode: errorCode || null,
    };

    try {
      await params.sessionRef.set(write, { merge: true });
    } catch (writeError) {
      params.logError?.("No se pudo persistir diagnostico de imagen share", {
        ...logContext,
        error: getErrorMessage(writeError),
      });
      return;
    }

    try {
      if (status === "failed") {
        params.logError?.("Fallo subetapa de imagen share", {
          ...logContext,
          error: getErrorMessage(error),
        });
      } else {
        params.logInfo?.("Subetapa de imagen share actualizada", logContext);
      }
    } catch (_logError) {
      // Progress logging must not affect the publish lifecycle.
    }
  }

  async function writeDiagnostics(context: Record<string, unknown> = {}): Promise<void> {
    const timestampValue = params.createUpdatedAtValue();
    const sanitizedContext = sanitizeDiagnosticContext(context);
    const write: Record<string, unknown> = {
      publishingShareImageDiagnostics: {
        ...sanitizedContext,
        updatedAt: timestampValue,
        stage: currentStage,
        substage: currentSubstage?.key || null,
        substageLabel: currentSubstage?.label || null,
        substageStatus: currentSubstageSnapshot?.status || null,
      },
      publishingShareImageDiagnosticsUpdatedAt: timestampValue,
      updatedAt: timestampValue,
    };

    try {
      await params.sessionRef.set(write, { merge: true });
    } catch (writeError) {
      params.logError?.("No se pudo persistir diagnostico de publicacion", {
        ...(params.baseContext || {}),
        ...sanitizedContext,
        stage: currentStage,
        substage: currentSubstage?.key || null,
        error: getErrorMessage(writeError),
      });
    }
  }

  return {
    async start(stage, context = {}) {
      currentStage = stage;
      currentSubstage = null;
      currentSubstageSnapshot = null;
      startedAtMsByStage.set(stage, Date.now());
      await writeStage(stage, "running", context);
    },
    async complete(stage, context = {}) {
      await writeStage(stage, "completed", context);
    },
    async fail(error, context = {}) {
      if (!currentStage) return;
      await writeStage(currentStage, "failed", context, error);
    },
    async startSubstage(substage, context = {}) {
      currentSubstage = substage;
      startedAtMsBySubstage.set(substage.key, Date.now());
      await writeSubstage(substage, "running", context);
    },
    async completeSubstage(substage, context = {}) {
      await writeSubstage(substage, "completed", context);
    },
    async failSubstage(error, context = {}) {
      const substage = getSubstageFromContext(context) || currentSubstage;
      if (!substage) return;
      await writeSubstage(substage, "failed", context, error);
    },
    async recordDiagnostics(context = {}) {
      await writeDiagnostics(context);
    },
  };
}
