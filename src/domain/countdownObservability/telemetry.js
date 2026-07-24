import { countdownFeatureFlags } from "@/config/countdownFeatureFlags";
import {
  buildCountdownTelemetryEvent,
} from "../../../shared/countdownPhase0Contract.js";

const MAX_DEDUPE_ENTRIES = 300;
const recentEventKeys = new Set();

function serializeCounter(counter) {
  if (!counter || typeof counter !== "object") return "";
  return Object.entries(counter)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, count]) => `${key}:${Number(count || 0)}`)
    .join(",");
}

function buildClientTelemetryParams(event) {
  return {
    countdown_event_type: event.eventType,
    countdown_renderer: event.renderer,
    countdown_count: event.countdownCount,
    countdown_schema_versions: serializeCounter(event.schemaVersionCounts),
    countdown_preset_versions: serializeCounter(event.presetVersionCounts),
    countdown_legacy_count: event.legacyBranchCount,
    countdown_aliases: serializeCounter(event.aliasUsageCounts),
    countdown_migration_sources: serializeCounter(event.migrationSourceCounts),
    countdown_preset_reference_count: event.presetReferenceCount,
    countdown_frame_asset_count: event.frameAssetCount,
    countdown_success: event.success,
    countdown_error_code: event.errorCode || "",
    countdown_asset_kind: event.assetKind || "",
    countdown_flag_renderer: event.featureFlags.renderer,
    countdown_flag_lifecycle: event.featureFlags.lifecycle,
    countdown_flag_catalog: event.featureFlags.catalog,
    countdown_flag_temporal: event.featureFlags.temporal,
  };
}

function buildDedupeKey(event) {
  return JSON.stringify({
    eventType: event.eventType,
    renderer: event.renderer,
    countdownCount: event.countdownCount,
    schemaVersionCounts: event.schemaVersionCounts,
    presetVersionCounts: event.presetVersionCounts,
    legacyBranchCount: event.legacyBranchCount,
    aliasUsageCounts: event.aliasUsageCounts,
    migrationSourceCounts: event.migrationSourceCounts,
    success: event.success,
    errorCode: event.errorCode,
    assetKind: event.assetKind,
  });
}

function rememberEventKey(key) {
  if (recentEventKeys.has(key)) return false;
  recentEventKeys.add(key);
  if (recentEventKeys.size > MAX_DEDUPE_ENTRIES) {
    const oldest = recentEventKeys.values().next().value;
    recentEventKeys.delete(oldest);
  }
  return true;
}

export function recordCountdownTelemetry(input = {}) {
  try {
    const event = buildCountdownTelemetryEvent({
      ...input,
      featureFlags: countdownFeatureFlags,
    });
    const dedupeKey = buildDedupeKey(event);
    if (!rememberEventKey(dedupeKey)) return event;

    if (typeof window === "undefined") return event;

    const params = buildClientTelemetryParams(event);
    if (typeof window.gtag === "function") {
      window.gtag("event", event.telemetryEvent, params);
    } else if (Array.isArray(window.dataLayer)) {
      window.dataLayer.push({
        event: event.telemetryEvent,
        ...params,
      });
    }

    if (process.env.NODE_ENV === "development") {
      const trace = Array.isArray(window.__COUNTDOWN_TELEMETRY_V1)
        ? window.__COUNTDOWN_TELEMETRY_V1
        : [];
      trace.push(event);
      window.__COUNTDOWN_TELEMETRY_V1 = trace.slice(-300);
    }

    return event;
  } catch {
    // Observability must never alter builder, editor, preview, or publish behavior.
    return null;
  }
}

export function recordCountdownRenderTelemetry({
  countdown,
  countdowns,
  renderer,
  eventType = "render_summary",
  migrationSource = null,
} = {}) {
  const renderState = {
    objetos: Array.isArray(countdowns)
      ? countdowns.map((item) => ({ tipo: "countdown", ...(item || {}) }))
      : countdown
        ? [{ tipo: "countdown", ...countdown }]
        : [],
  };

  return recordCountdownTelemetry({
    eventType,
    renderState,
    renderer,
    migrationSource,
  });
}

export function recordCountdownAssetLoadError({
  countdown,
  renderer,
  assetKind = "frame",
  errorCode = "asset-load-failed",
} = {}) {
  return recordCountdownTelemetry({
    eventType: "asset_load_error",
    renderState: {
      objetos: countdown ? [{ tipo: "countdown", ...countdown }] : [],
    },
    renderer,
    success: false,
    errorCode,
    assetKind,
  });
}

export function __resetCountdownTelemetryForTests() {
  recentEventKeys.clear();
}
