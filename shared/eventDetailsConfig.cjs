const EVENT_DETAILS_MODES = Object.freeze(["single", "ceremony_party"]);
const EVENT_DETAILS_MODE_SET = new Set(EVENT_DETAILS_MODES);
const DEFAULT_EVENT_DETAILS_MODE = "single";
const DEFAULT_DRESS_CODE_CONFIG = Object.freeze({
  enabled: false,
  value: "",
});

function asObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value;
}

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeLooseText(value) {
  if (value == null) return "";
  return String(value).replace(/\r\n/g, "\n").trim();
}

function normalizeLowerText(value) {
  return normalizeText(value).toLowerCase();
}

function parseEnabledFlag(value, fallback = false) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "si", "yes"].includes(normalized)) return true;
    if (["false", "0", "no"].includes(normalized)) return false;
  }
  return fallback;
}

function normalizeEventDetailsMode(value) {
  const normalized = normalizeLowerText(value).replace(/[-\s]+/g, "_");
  if (EVENT_DETAILS_MODE_SET.has(normalized)) return normalized;
  if (
    normalized === "both" ||
    normalized === "ceremony_and_party" ||
    normalized === "ceremonia_y_fiesta" ||
    normalized === "ceremonia_fiesta"
  ) {
    return "ceremony_party";
  }
  return DEFAULT_EVENT_DETAILS_MODE;
}

function normalizeDressCodeConfig(value) {
  const source = asObject(value);
  return {
    enabled: parseEnabledFlag(source.enabled, DEFAULT_DRESS_CODE_CONFIG.enabled),
    value: normalizeLooseText(source.value),
  };
}

function normalizeEventDetailsConfig(value) {
  const source = asObject(value);
  return {
    mode: normalizeEventDetailsMode(source.mode),
    dressCode: normalizeDressCodeConfig(source.dressCode),
  };
}

function resolveEventDetailsEnabledState(value) {
  const normalized = normalizeEventDetailsConfig(value);
  return {
    ceremony: true,
    party: normalized.mode === "ceremony_party",
    dress_code: normalized.dressCode.enabled === true,
  };
}

module.exports = {
  DEFAULT_DRESS_CODE_CONFIG,
  DEFAULT_EVENT_DETAILS_MODE,
  EVENT_DETAILS_MODES,
  normalizeDressCodeConfig,
  normalizeEventDetailsConfig,
  normalizeEventDetailsMode,
  resolveEventDetailsEnabledState,
};
