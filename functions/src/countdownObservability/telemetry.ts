import * as logger from "firebase-functions/logger";

// Shared CJS keeps browser, scripts, Functions source and built runtime on one contract.
const {
  buildCountdownTelemetryEvent,
  resolveCountdownFeatureFlags,
} = require("../../shared/countdownPhase0Contract.cjs"); // eslint-disable-line @typescript-eslint/no-var-requires

type UnknownRecord = Record<string, unknown>;

function getFeatureFlags() {
  return resolveCountdownFeatureFlags(process.env);
}

function errorCodeFromUnknown(error: unknown): string {
  if (error && typeof error === "object" && "name" in error) {
    return String((error as { name?: unknown }).name || "render-error");
  }
  return "render-error";
}

export function recordBackendCountdownTelemetry(params: {
  eventType: string;
  renderState?: UnknownRecord | UnknownRecord[] | null;
  renderer: string;
  migrationSource?: string | null;
  success?: boolean;
  errorCode?: string | null;
  assetKind?: string | null;
  durationMs?: number | null;
}) {
  try {
    const event = buildCountdownTelemetryEvent({
      ...params,
      featureFlags: getFeatureFlags(),
    });

    if (Number(event.countdownCount || 0) > 0) {
      logger.info("countdown_observability_v1", event);
    }
    return event;
  } catch {
    // Telemetry is fail-open and must not block catalog, preview, or publish.
    return null;
  }
}

export function recordBackendCountdownError(params: {
  eventType: string;
  renderState?: UnknownRecord | UnknownRecord[] | null;
  renderer: string;
  error: unknown;
  assetKind?: string | null;
  durationMs?: number | null;
}) {
  return recordBackendCountdownTelemetry({
    eventType: params.eventType,
    renderState: params.renderState,
    renderer: params.renderer,
    success: false,
    errorCode: errorCodeFromUnknown(params.error),
    assetKind: params.assetKind || null,
    durationMs: params.durationMs,
  });
}
