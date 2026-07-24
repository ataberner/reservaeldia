import runtime from "./countdownPhase0Contract.cjs";

export const COUNTDOWN_FEATURE_FLAG_DEFINITIONS =
  runtime.COUNTDOWN_FEATURE_FLAG_DEFINITIONS;
export const COUNTDOWN_PHASE0_CONTRACT_VERSION =
  runtime.COUNTDOWN_PHASE0_CONTRACT_VERSION;
export const COUNTDOWN_TARGET_ALIAS_FIELDS =
  runtime.COUNTDOWN_TARGET_ALIAS_FIELDS;
export const COUNTDOWN_TELEMETRY_EVENT_NAME =
  runtime.COUNTDOWN_TELEMETRY_EVENT_NAME;
export const buildCountdownTelemetryEvent =
  runtime.buildCountdownTelemetryEvent;
export const buildCountdownTelemetrySummary =
  runtime.buildCountdownTelemetrySummary;
export const collectCountdownObjects = runtime.collectCountdownObjects;
export const getCountdownAliasFields = runtime.getCountdownAliasFields;
export const normalizeBooleanFlag = runtime.normalizeBooleanFlag;
export const normalizeTelemetryErrorCode =
  runtime.normalizeTelemetryErrorCode;
export const resolveCountdownFeatureFlags =
  runtime.resolveCountdownFeatureFlags;
export const resolveCountdownMigrationSource =
  runtime.resolveCountdownMigrationSource;
export const summarizeCountdownObject = runtime.summarizeCountdownObject;
export const walkRenderObjects = runtime.walkRenderObjects;

export default runtime;
