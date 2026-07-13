export const EVENT_DETAIL_FEATURES = Object.freeze({
  CEREMONY: "ceremony",
  PARTY: "party",
});

export const EVENT_DETAIL_FEATURE_LABELS = Object.freeze({
  [EVENT_DETAIL_FEATURES.CEREMONY]: "Ceremonia",
  [EVENT_DETAIL_FEATURES.PARTY]: "Fiesta",
});

const FEATURE_SET = new Set(Object.values(EVENT_DETAIL_FEATURES));

export function normalizeEventDetailFeature(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (FEATURE_SET.has(normalized)) return normalized;
  if (normalized === "ceremonia") return EVENT_DETAIL_FEATURES.CEREMONY;
  if (normalized === "fiesta") return EVENT_DETAIL_FEATURES.PARTY;
  return EVENT_DETAIL_FEATURES.CEREMONY;
}

export function getEventDetailFeatureLabel(feature) {
  const safeFeature = normalizeEventDetailFeature(feature);
  return EVENT_DETAIL_FEATURE_LABELS[safeFeature] || EVENT_DETAIL_FEATURE_LABELS.ceremony;
}
