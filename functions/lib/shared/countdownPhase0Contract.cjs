const {
  resolveCountdownContract,
} = require("./renderContractPolicy.cjs");

const COUNTDOWN_PHASE0_CONTRACT_VERSION = 1;
const COUNTDOWN_TELEMETRY_EVENT_NAME = "countdown_observability_v1";

const COUNTDOWN_FEATURE_FLAG_DEFINITIONS = Object.freeze({
  renderer: Object.freeze({
    key: "renderer",
    serverEnv: "COUNTDOWN_NEW_RENDERER_ENABLED",
    publicEnv: "NEXT_PUBLIC_COUNTDOWN_NEW_RENDERER_ENABLED",
    defaultValue: false,
  }),
  lifecycle: Object.freeze({
    key: "lifecycle",
    serverEnv: "COUNTDOWN_NEW_LIFECYCLE_ENABLED",
    publicEnv: "NEXT_PUBLIC_COUNTDOWN_NEW_LIFECYCLE_ENABLED",
    defaultValue: false,
  }),
  catalog: Object.freeze({
    key: "catalog",
    serverEnv: "COUNTDOWN_NEW_CATALOG_ENABLED",
    publicEnv: "NEXT_PUBLIC_COUNTDOWN_NEW_CATALOG_ENABLED",
    defaultValue: false,
  }),
  temporal: Object.freeze({
    key: "temporal",
    serverEnv: "COUNTDOWN_NEW_TEMPORAL_SYSTEM_ENABLED",
    publicEnv: "NEXT_PUBLIC_COUNTDOWN_NEW_TEMPORAL_SYSTEM_ENABLED",
    defaultValue: false,
  }),
});

const COUNTDOWN_TARGET_ALIAS_FIELDS = Object.freeze([
  "targetISO",
  "fechaISO",
]);

function asObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value;
}

function normalizeText(value, maxLength = 120) {
  return typeof value === "string"
    ? value.trim().slice(0, maxLength)
    : "";
}

function normalizeInteger(value) {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) return null;
  return Math.trunc(numberValue);
}

function normalizeBooleanFlag(value, fallback = false) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;

  const normalized = normalizeText(value, 20).toLowerCase();
  if (["1", "true", "on", "yes", "enabled"].includes(normalized)) return true;
  if (["0", "false", "off", "no", "disabled"].includes(normalized)) return false;
  return fallback === true;
}

function resolveCountdownFeatureFlags(environment = {}, overrides = {}) {
  const safeEnvironment = asObject(environment);
  const safeOverrides = asObject(overrides);

  return Object.freeze(
    Object.fromEntries(
      Object.values(COUNTDOWN_FEATURE_FLAG_DEFINITIONS).map((definition) => {
        const overrideValue = safeOverrides[definition.key];
        if (typeof overrideValue !== "undefined") {
          return [
            definition.key,
            normalizeBooleanFlag(overrideValue, definition.defaultValue),
          ];
        }

        const serverValue = safeEnvironment[definition.serverEnv];
        const publicValue = safeEnvironment[definition.publicEnv];
        const configuredValue =
          typeof serverValue !== "undefined" ? serverValue : publicValue;

        return [
          definition.key,
          normalizeBooleanFlag(configuredValue, definition.defaultValue),
        ];
      })
    )
  );
}

function walkRenderObjects(value, visitor, path = "objetos") {
  const values = Array.isArray(value)
    ? value
    : Array.isArray(asObject(value).objetos)
      ? asObject(value).objetos
      : [];

  values.forEach((entry, index) => {
    const objectValue = asObject(entry);
    if (!Object.keys(objectValue).length) return;

    const objectPath = `${path}[${index}]`;
    visitor(objectValue, objectPath);

    if (Array.isArray(objectValue.children)) {
      walkRenderObjects(objectValue.children, visitor, `${objectPath}.children`);
    }
  });
}

function collectCountdownObjects(value) {
  const countdowns = [];
  walkRenderObjects(value, (objectValue, objectPath) => {
    if (normalizeText(objectValue.tipo, 40).toLowerCase() !== "countdown") return;
    countdowns.push({
      countdown: objectValue,
      path: objectPath,
    });
  });
  return countdowns;
}

function resolveCountdownMigrationSource(countdown, fallback = "") {
  const safeCountdown = asObject(countdown);
  const metadata = asObject(safeCountdown.metadata);
  return (
    normalizeText(safeCountdown.migrationSource, 80) ||
    normalizeText(metadata.migrationSource, 80) ||
    normalizeText(fallback, 80) ||
    null
  );
}

function getCountdownAliasFields(countdown) {
  const safeCountdown = asObject(countdown);
  return COUNTDOWN_TARGET_ALIAS_FIELDS.filter(
    (field) => normalizeText(safeCountdown[field], 300).length > 0
  );
}

function summarizeCountdownObject(countdown, options = {}) {
  const safeCountdown = asObject(countdown);
  const contract = resolveCountdownContract(safeCountdown);
  const countdownSchemaVersion =
    normalizeInteger(contract && contract.schemaVersion) || 1;
  const presetVersion = normalizeInteger(safeCountdown.presetVersion);
  const aliases = getCountdownAliasFields(safeCountdown);
  const migrationSource = resolveCountdownMigrationSource(
    safeCountdown,
    options.migrationSource
  );

  return {
    countdownSchemaVersion,
    presetVersion,
    legacyBranchUsed:
      contract && typeof contract.isLegacyFrozenCompat === "boolean"
        ? contract.isLegacyFrozenCompat
        : countdownSchemaVersion < 2,
    aliases,
    migrationSource,
    hasPresetReference: normalizeText(safeCountdown.presetId, 160).length > 0,
    hasFrameAsset: normalizeText(safeCountdown.frameSvgUrl, 1200).length > 0,
  };
}

function incrementCounter(counter, key, amount = 1) {
  const normalizedKey = normalizeText(key, 100) || "missing";
  counter[normalizedKey] = Number(counter[normalizedKey] || 0) + amount;
}

function sortCounter(counter) {
  return Object.fromEntries(
    Object.entries(counter).sort(([left], [right]) =>
      left.localeCompare(right)
    )
  );
}

function buildCountdownTelemetrySummary(value, options = {}) {
  const entries = collectCountdownObjects(value);
  const schemaVersionCounts = {};
  const presetVersionCounts = {};
  const aliasUsageCounts = {};
  const migrationSourceCounts = {};
  let legacyBranchCount = 0;
  let presetReferenceCount = 0;
  let frameAssetCount = 0;

  entries.forEach(({ countdown }) => {
    const summary = summarizeCountdownObject(countdown, options);
    incrementCounter(
      schemaVersionCounts,
      String(summary.countdownSchemaVersion)
    );
    incrementCounter(
      presetVersionCounts,
      summary.presetVersion === null ? "missing" : String(summary.presetVersion)
    );
    summary.aliases.forEach((field) => incrementCounter(aliasUsageCounts, field));
    if (summary.migrationSource) {
      incrementCounter(migrationSourceCounts, summary.migrationSource);
    }
    if (summary.legacyBranchUsed) legacyBranchCount += 1;
    if (summary.hasPresetReference) presetReferenceCount += 1;
    if (summary.hasFrameAsset) frameAssetCount += 1;
  });

  return {
    contractVersion: COUNTDOWN_PHASE0_CONTRACT_VERSION,
    renderer: normalizeText(options.renderer, 80) || "unknown",
    countdownCount: entries.length,
    schemaVersionCounts: sortCounter(schemaVersionCounts),
    presetVersionCounts: sortCounter(presetVersionCounts),
    legacyBranchCount,
    aliasUsageCounts: sortCounter(aliasUsageCounts),
    migrationSourceCounts: sortCounter(migrationSourceCounts),
    presetReferenceCount,
    frameAssetCount,
  };
}

function normalizeTelemetryErrorCode(value) {
  const normalized = normalizeText(value, 100)
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || "unknown";
}

function buildCountdownTelemetryEvent({
  eventType,
  renderState,
  renderer,
  migrationSource,
  featureFlags,
  success = true,
  errorCode = null,
  assetKind = null,
  durationMs = null,
} = {}) {
  const summary = buildCountdownTelemetrySummary(renderState, {
    renderer,
    migrationSource,
  });
  const safeDuration = Number(durationMs);

  return {
    telemetryEvent: COUNTDOWN_TELEMETRY_EVENT_NAME,
    eventType: normalizeText(eventType, 80) || "render_summary",
    ...summary,
    featureFlags: resolveCountdownFeatureFlags({}, featureFlags),
    success: success !== false,
    errorCode: errorCode ? normalizeTelemetryErrorCode(errorCode) : null,
    assetKind: assetKind ? normalizeTelemetryErrorCode(assetKind) : null,
    durationMs:
      Number.isFinite(safeDuration) && safeDuration >= 0
        ? Math.round(safeDuration)
        : null,
  };
}

module.exports = {
  COUNTDOWN_FEATURE_FLAG_DEFINITIONS,
  COUNTDOWN_PHASE0_CONTRACT_VERSION,
  COUNTDOWN_TARGET_ALIAS_FIELDS,
  COUNTDOWN_TELEMETRY_EVENT_NAME,
  buildCountdownTelemetryEvent,
  buildCountdownTelemetrySummary,
  collectCountdownObjects,
  getCountdownAliasFields,
  normalizeBooleanFlag,
  normalizeTelemetryErrorCode,
  resolveCountdownFeatureFlags,
  resolveCountdownMigrationSource,
  summarizeCountdownObject,
  walkRenderObjects,
};
