export const EVENT_TIME_ROLES = Object.freeze({
  START_TIME: "event_start_time",
  END_TIME: "event_end_time",
});

export const EVENT_TIME_FIELD_KEYS = Object.freeze({
  [EVENT_TIME_ROLES.START_TIME]: "event_start_time",
  [EVENT_TIME_ROLES.END_TIME]: "event_end_time",
});

const EVENT_TIME_FIELD_LABELS = Object.freeze({
  [EVENT_TIME_ROLES.START_TIME]: "Hora inicio",
  [EVENT_TIME_ROLES.END_TIME]: "Hora fin",
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
  return "";
}

export function getEventTimeFieldKey(role) {
  const safeRole = normalizeEventTimeRole(role);
  return EVENT_TIME_FIELD_KEYS[safeRole] || "";
}

export function isEventTimeField(field) {
  return Boolean(normalizeEventTimeRole(asObject(field).eventDetailsRole));
}

export function buildEventTimeField(role) {
  const safeRole = normalizeEventTimeRole(role);
  const fieldKey = getEventTimeFieldKey(safeRole);
  if (!fieldKey) return null;

  return {
    key: fieldKey,
    label: EVENT_TIME_FIELD_LABELS[safeRole] || "Hora",
    type: "time",
    group: "Datos principales",
    optional: safeRole === EVENT_TIME_ROLES.END_TIME,
    eventDetailsRole: safeRole,
    applyTargets: [],
  };
}

export function ensureEventTimeFields({ fieldsSchema } = {}) {
  const fields = Array.isArray(fieldsSchema) ? fieldsSchema : [];
  const nextFields = fields.map((field) => ({ ...asObject(field) }));
  let changed = false;

  Object.values(EVENT_TIME_ROLES).forEach((role) => {
    const templateField = buildEventTimeField(role);
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
} = {}) {
  const safeDefaults = asObject(defaults);
  const startKey = getEventTimeFieldKey(EVENT_TIME_ROLES.START_TIME);
  const endKey = getEventTimeFieldKey(EVENT_TIME_ROLES.END_TIME);

  return {
    startTime:
      normalizeEventTimeValue(safeDefaults[startKey]) ||
      normalizeEventTimeValue(fallbackStartTime),
    endTime: normalizeEventTimeValue(safeDefaults[endKey]),
    fields: collectEventTimeFields(fieldsSchema),
  };
}

export function buildEventTimeDefaults({
  fieldsSchema,
  defaults,
  times,
} = {}) {
  const safeDefaults = { ...asObject(defaults) };
  const safeTimes = asObject(times);

  collectEventTimeFields(fieldsSchema).forEach((field) => {
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
