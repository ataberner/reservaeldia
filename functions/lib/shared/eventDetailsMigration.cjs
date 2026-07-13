const {
  normalizeEventDetailsConfig,
} = require("./eventDetailsConfig.cjs");

const LEGACY_EVENT_FIELD_MIGRATIONS = Object.freeze({
  event_date: {
    key: "event_ceremony_date",
    label: "Fecha de la ceremonia",
    type: "date",
    group: "Ceremonia",
    eventDetailsRole: "ceremony_date",
  },
  event_start_time: {
    key: "event_ceremony_start_time",
    label: "Hora inicio de la ceremonia",
    type: "time",
    group: "Ceremonia",
    eventDetailsRole: "ceremony_start_time",
  },
  event_end_time: {
    key: "event_ceremony_end_time",
    label: "Hora fin de la ceremonia",
    type: "time",
    group: "Ceremonia",
    eventDetailsRole: "ceremony_end_time",
  },
  event_venue_name: {
    key: "event_ceremony_venue_name",
    label: "Nombre del lugar de la ceremonia",
    type: "text",
    group: "Ceremonia",
    eventDetailsRole: "ceremony_venue_name",
  },
  event_venue_address: {
    key: "event_ceremony_venue_address",
    label: "Direccion de la ceremonia",
    type: "location",
    group: "Ceremonia",
    eventDetailsRole: "ceremony_venue_address",
  },
});

function asObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value;
}

function normalizeText(value) {
  return String(value || "").trim();
}

function deepClone(value) {
  if (Array.isArray(value)) return value.map((entry) => deepClone(entry));
  if (!value || typeof value !== "object") return value;
  const out = {};
  Object.entries(value).forEach(([key, nested]) => {
    out[key] = deepClone(nested);
  });
  return out;
}

function targetKey(target) {
  const safeTarget = asObject(target);
  return [
    normalizeText(safeTarget.scope).toLowerCase(),
    normalizeText(safeTarget.id),
    normalizeText(safeTarget.path),
  ].join("|");
}

function mergeApplyTargets(left, right) {
  const out = [];
  const seen = new Set();
  [...(Array.isArray(left) ? left : []), ...(Array.isArray(right) ? right : [])].forEach((target) => {
    const key = targetKey(target);
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push(deepClone(target));
  });
  return out;
}

function migrateLegacyValueMap(value) {
  const source = asObject(value);
  const out = { ...source };
  Object.entries(LEGACY_EVENT_FIELD_MIGRATIONS).forEach(([legacyKey, migration]) => {
    if (
      Object.prototype.hasOwnProperty.call(out, legacyKey) &&
      !Object.prototype.hasOwnProperty.call(out, migration.key)
    ) {
      out[migration.key] = out[legacyKey];
    }
    delete out[legacyKey];
  });
  return out;
}

function normalizeEventField(field) {
  const source = asObject(field);
  const migration = LEGACY_EVENT_FIELD_MIGRATIONS[normalizeText(source.key)];
  if (!migration) return { field: deepClone(source), changed: false };
  return {
    field: {
      ...deepClone(source),
      key: migration.key,
      label: migration.label,
      type: normalizeText(source.type) || migration.type,
      group: normalizeText(source.group) || migration.group,
      eventDetailsRole: migration.eventDetailsRole,
    },
    changed: true,
    fromKey: normalizeText(source.key),
    toKey: migration.key,
  };
}

function normalizeEventDetailsAuthoringContract({
  fieldsSchema,
  defaults,
  eventDetails,
} = {}) {
  const safeDefaults = { ...asObject(defaults) };
  const fields = Array.isArray(fieldsSchema) ? fieldsSchema : [];
  const byKey = new Map();
  let changed = false;

  fields.forEach((field) => {
    const normalized = normalizeEventField(field);
    changed = changed || normalized.changed;
    const nextField = normalized.field;
    const key = normalizeText(nextField.key);
    if (!key) return;

    if (normalized.changed && normalized.fromKey && normalized.toKey) {
      if (
        Object.prototype.hasOwnProperty.call(safeDefaults, normalized.fromKey) &&
        !Object.prototype.hasOwnProperty.call(safeDefaults, normalized.toKey)
      ) {
        safeDefaults[normalized.toKey] = safeDefaults[normalized.fromKey];
      }
      delete safeDefaults[normalized.fromKey];
    }

    if (!byKey.has(key)) {
      byKey.set(key, nextField);
      return;
    }

    changed = true;
    const existing = byKey.get(key);
    byKey.set(key, {
      ...existing,
      ...nextField,
      applyTargets: mergeApplyTargets(existing.applyTargets, nextField.applyTargets),
    });
  });

  const normalizedEventDetails = normalizeEventDetailsConfig(eventDetails);
  const hasMode =
    eventDetails &&
    typeof eventDetails === "object" &&
    !Array.isArray(eventDetails) &&
    Object.prototype.hasOwnProperty.call(eventDetails, "mode");

  return {
    fieldsSchema: Array.from(byKey.values()),
    defaults: safeDefaults,
    eventDetails: normalizedEventDetails,
    changed: changed || !hasMode,
  };
}

function normalizeEventDetailsDocumentContract(source) {
  const safeSource = asObject(source);
  const authoring = normalizeEventDetailsAuthoringContract({
    fieldsSchema: safeSource.fieldsSchema,
    defaults: safeSource.defaults,
    eventDetails: safeSource.eventDetails,
  });
  const templateAuthoringDraft = asObject(safeSource.templateAuthoringDraft);
  const authoringDraft = Object.keys(templateAuthoringDraft).length
    ? normalizeEventDetailsAuthoringContract({
        fieldsSchema: templateAuthoringDraft.fieldsSchema,
        defaults: templateAuthoringDraft.defaults,
        eventDetails: safeSource.eventDetails,
      })
    : null;
  const templateInput = asObject(safeSource.templateInput);
  const normalizedTemplateInput = Object.keys(templateInput).length
    ? {
        ...templateInput,
        defaults: migrateLegacyValueMap(templateInput.defaults),
        initialValues: migrateLegacyValueMap(templateInput.initialValues),
        values: migrateLegacyValueMap(templateInput.values),
      }
    : null;

  return {
    ...safeSource,
    fieldsSchema: authoring.fieldsSchema,
    defaults: authoring.defaults,
    eventDetails: authoring.eventDetails,
    ...(authoringDraft
      ? {
          templateAuthoringDraft: {
            ...templateAuthoringDraft,
            fieldsSchema: authoringDraft.fieldsSchema,
            defaults: authoringDraft.defaults,
          },
        }
      : {}),
    ...(normalizedTemplateInput ? { templateInput: normalizedTemplateInput } : {}),
  };
}

module.exports = {
  LEGACY_EVENT_FIELD_MIGRATIONS,
  migrateLegacyValueMap,
  normalizeEventDetailsAuthoringContract,
  normalizeEventDetailsDocumentContract,
};
