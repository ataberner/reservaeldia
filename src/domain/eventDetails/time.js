import {
  EVENT_DETAIL_FEATURES,
  getEventDetailFeatureLabel,
  normalizeEventDetailFeature,
} from "./features.js";

export const EVENT_TIME_ROLES = Object.freeze({
  START_TIME: "start_time",
  END_TIME: "end_time",
});

const EVENT_TIME_FIELD_KEYS = Object.freeze({
  [EVENT_DETAIL_FEATURES.CEREMONY]: Object.freeze({
    [EVENT_TIME_ROLES.START_TIME]: "event_ceremony_start_time",
    [EVENT_TIME_ROLES.END_TIME]: "event_ceremony_end_time",
  }),
  [EVENT_DETAIL_FEATURES.PARTY]: Object.freeze({
    [EVENT_TIME_ROLES.START_TIME]: "event_party_start_time",
    [EVENT_TIME_ROLES.END_TIME]: "event_party_end_time",
  }),
});

function normalizeText(value) {
  return String(value || "").trim();
}

function asObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value;
}

function padTimeSegment(value) {
  return String(value).padStart(2, "0");
}

export function normalizeEventTimeValue(value) {
  const raw = normalizeText(value);
  if (!raw) return "";

  const withoutSuffix = raw
    .toLowerCase()
    .replace(/\s*(?:hs?|horas?)\.?\s*$/i, "")
    .replace(/(\d)\s*h\s*(\d?)/i, "$1:$2")
    .replace(/\./g, ":")
    .replace(/\s+/g, "");
  const match = withoutSuffix.match(/^(\d{1,2})(?::(\d{0,2}))?$/);
  if (!match) return raw;

  const hour = Number(match[1]);
  const minuteText = match[2];
  const minute = minuteText ? Number(minuteText) : 0;
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) return raw;
  if (!Number.isInteger(minute) || minute < 0 || minute > 59) return raw;

  return `${padTimeSegment(hour)}:${padTimeSegment(minute)}`;
}

export function normalizeEventTimeRole(value) {
  const role = normalizeText(value).toLowerCase();
  if (role === EVENT_TIME_ROLES.START_TIME) return role;
  if (role === EVENT_TIME_ROLES.END_TIME) return role;
  if (role === "ceremony_start_time" || role === "party_start_time") {
    return EVENT_TIME_ROLES.START_TIME;
  }
  if (role === "ceremony_end_time" || role === "party_end_time") {
    return EVENT_TIME_ROLES.END_TIME;
  }
  return "";
}

function isExplicitEventTimeFieldRole(value) {
  const role = normalizeText(value).toLowerCase();
  return (
    role === "ceremony_start_time" ||
    role === "ceremony_end_time" ||
    role === "party_start_time" ||
    role === "party_end_time"
  );
}

export function getEventTimeFieldKey(role, feature = EVENT_DETAIL_FEATURES.CEREMONY) {
  const safeRole = normalizeEventTimeRole(role);
  const safeFeature = normalizeEventDetailFeature(feature);
  return EVENT_TIME_FIELD_KEYS[safeFeature]?.[safeRole] || "";
}

export function getEventTimeFieldRole(role, feature = EVENT_DETAIL_FEATURES.CEREMONY) {
  const safeRole = normalizeEventTimeRole(role);
  const safeFeature = normalizeEventDetailFeature(feature);
  return safeRole ? `${safeFeature}_${safeRole}` : "";
}

export function resolveEventTimeFieldFeature(field) {
  const safeField = asObject(field);
  const key = normalizeText(safeField.key);
  const role = normalizeText(safeField.eventDetailsRole).toLowerCase();
  if (key.startsWith("event_party_") || role.startsWith("party_")) {
    return EVENT_DETAIL_FEATURES.PARTY;
  }
  return EVENT_DETAIL_FEATURES.CEREMONY;
}

export function isEventTimeField(field, feature = null) {
  const safeField = asObject(field);
  const key = normalizeText(safeField.key);
  const role = normalizeText(safeField.eventDetailsRole).toLowerCase();
  const hasRole = isExplicitEventTimeFieldRole(role);
  const hasKey = Object.values(EVENT_TIME_FIELD_KEYS).some((keysByRole) =>
    Object.values(keysByRole).includes(key)
  );
  if (!hasRole && !hasKey) return false;
  if (!feature) return true;
  return resolveEventTimeFieldFeature(safeField) === normalizeEventDetailFeature(feature);
}

export function buildEventTimeField(role, feature = EVENT_DETAIL_FEATURES.CEREMONY) {
  const safeRole = normalizeEventTimeRole(role);
  const safeFeature = normalizeEventDetailFeature(feature);
  const fieldKey = getEventTimeFieldKey(safeRole, safeFeature);
  if (!fieldKey) return null;
  const featureLabel = getEventDetailFeatureLabel(safeFeature).toLowerCase();
  const roleLabel = safeRole === EVENT_TIME_ROLES.END_TIME ? "Hora fin" : "Hora inicio";

  return {
    key: fieldKey,
    label: `${roleLabel} de la ${featureLabel}`,
    type: "time",
    group: getEventDetailFeatureLabel(safeFeature),
    optional: safeRole === EVENT_TIME_ROLES.END_TIME,
    eventDetailsRole: getEventTimeFieldRole(safeRole, safeFeature),
    applyTargets: [],
  };
}

export function ensureEventTimeFields({
  fieldsSchema,
  feature = EVENT_DETAIL_FEATURES.CEREMONY,
} = {}) {
  const fields = Array.isArray(fieldsSchema) ? fieldsSchema : [];
  const nextFields = fields.map((field) => ({ ...asObject(field) }));
  let changed = false;
  const safeFeature = normalizeEventDetailFeature(feature);

  Object.values(EVENT_TIME_ROLES).forEach((role) => {
    const templateField = buildEventTimeField(role, safeFeature);
    if (!templateField) return;

    const fieldIndex = nextFields.findIndex(
      (field) => normalizeText(field.key) === templateField.key
    );
    if (fieldIndex < 0) {
      nextFields.push(templateField);
      changed = true;
      return;
    }

    const current = nextFields[fieldIndex];
    const patched = {
      ...current,
      type: "time",
      group: normalizeText(current.group) || templateField.group,
      optional:
        typeof current.optional === "boolean"
          ? current.optional
          : templateField.optional,
      eventDetailsRole: templateField.eventDetailsRole,
      applyTargets: Array.isArray(current.applyTargets) ? current.applyTargets : [],
    };
    if (JSON.stringify(patched) !== JSON.stringify(current)) {
      nextFields[fieldIndex] = patched;
      changed = true;
    }
  });

  return {
    fieldsSchema: nextFields,
    changed,
  };
}

export function collectEventTimeFields(fieldsSchema) {
  return (Array.isArray(fieldsSchema) ? fieldsSchema : [])
    .map((field) => asObject(field))
    .filter((field) => isEventTimeField(field));
}

export function resolveEventTimesFromAuthoring({
  fieldsSchema,
  defaults,
  fallbackStartTime = "",
  feature = EVENT_DETAIL_FEATURES.CEREMONY,
} = {}) {
  const safeDefaults = asObject(defaults);
  const safeFeature = normalizeEventDetailFeature(feature);
  const startKey = getEventTimeFieldKey(EVENT_TIME_ROLES.START_TIME, safeFeature);
  const endKey = getEventTimeFieldKey(EVENT_TIME_ROLES.END_TIME, safeFeature);

  return {
    startTime:
      normalizeEventTimeValue(safeDefaults[startKey]) ||
      normalizeEventTimeValue(fallbackStartTime),
    endTime: normalizeEventTimeValue(safeDefaults[endKey]),
    fields: collectEventTimeFields(fieldsSchema).filter(
      (field) => resolveEventTimeFieldFeature(field) === safeFeature
    ),
  };
}

export function isValidEventTimesStateSnapshot(snapshot) {
  const source = asObject(snapshot);
  if (!Array.isArray(source.fieldsSchema)) return false;
  if (asObject(source.defaults) !== source.defaults) return false;
  return collectEventTimeFields(source.fieldsSchema).length > 0;
}

export function resolveEventTimesState(snapshot, options = {}) {
  if (!isValidEventTimesStateSnapshot(snapshot)) return null;

  const source = asObject(snapshot);
  return resolveEventTimesFromAuthoring({
    fieldsSchema: source.fieldsSchema,
    defaults: source.defaults,
    fallbackStartTime: options.fallbackStartTime,
    feature: options.feature,
  });
}

export function buildEventTimeDefaults({
  fieldsSchema,
  defaults,
  times,
  feature = EVENT_DETAIL_FEATURES.CEREMONY,
} = {}) {
  const safeDefaults = { ...asObject(defaults) };
  const safeTimes = asObject(times);
  const safeFeature = normalizeEventDetailFeature(feature);

  collectEventTimeFields(fieldsSchema).forEach((field) => {
    if (resolveEventTimeFieldFeature(field) !== safeFeature) return;
    const fieldKey = normalizeText(field.key);
    if (!fieldKey) return;
    const role = normalizeEventTimeRole(field.eventDetailsRole);
    if (role === EVENT_TIME_ROLES.START_TIME) {
      safeDefaults[fieldKey] = normalizeEventTimeValue(safeTimes.startTime);
    } else if (role === EVENT_TIME_ROLES.END_TIME) {
      safeDefaults[fieldKey] = normalizeEventTimeValue(safeTimes.endTime);
    }
  });

  return safeDefaults;
}
