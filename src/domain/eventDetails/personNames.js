import {
  findRenderObjectById,
} from "../editor/renderObjectTree.js";
import {
  isTextualTemplateTargetPath,
} from "../templates/fieldValueResolver.js";

export const EVENT_PERSON_NAME_ROLES = Object.freeze({
  PRIMARY: "primary_person_name",
  SECONDARY: "secondary_person_name",
  COUPLE: "couple_names",
});

export const EVENT_COUPLE_NAME_FORMATS = Object.freeze({
  AND: "and",
  AMPERSAND: "ampersand",
  LINEBREAK: "linebreak",
});

const EVENT_PERSON_NAME_FIELD_KEYS = Object.freeze({
  [EVENT_PERSON_NAME_ROLES.PRIMARY]: "event_primary_person_name",
  [EVENT_PERSON_NAME_ROLES.SECONDARY]: "event_secondary_person_name",
  [`${EVENT_PERSON_NAME_ROLES.COUPLE}:${EVENT_COUPLE_NAME_FORMATS.AND}`]:
    "event_couple_names_and",
  [`${EVENT_PERSON_NAME_ROLES.COUPLE}:${EVENT_COUPLE_NAME_FORMATS.AMPERSAND}`]:
    "event_couple_names_ampersand",
  [`${EVENT_PERSON_NAME_ROLES.COUPLE}:${EVENT_COUPLE_NAME_FORMATS.LINEBREAK}`]:
    "event_couple_names_linebreak",
});

const EVENT_PERSON_NAME_FIELD_LABELS = Object.freeze({
  [EVENT_PERSON_NAME_ROLES.PRIMARY]: "Nombre de la primera persona",
  [EVENT_PERSON_NAME_ROLES.SECONDARY]: "Nombre de la segunda persona",
  [`${EVENT_PERSON_NAME_ROLES.COUPLE}:${EVENT_COUPLE_NAME_FORMATS.AND}`]:
    "Nombres de los casados",
  [`${EVENT_PERSON_NAME_ROLES.COUPLE}:${EVENT_COUPLE_NAME_FORMATS.AMPERSAND}`]:
    "Nombres de los casados (&)",
  [`${EVENT_PERSON_NAME_ROLES.COUPLE}:${EVENT_COUPLE_NAME_FORMATS.LINEBREAK}`]:
    "Nombres de los casados en dos lineas",
});

function normalizeText(value) {
  return String(value || "").trim();
}

function asObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value;
}

function parsePath(path) {
  const source = normalizeText(path);
  if (!source) return [];

  return source
    .replace(/\[(\d+)\]/g, ".$1")
    .split(".")
    .map((segment) => segment.trim())
    .filter(Boolean);
}

function readObjectPathValue(object, path) {
  const segments = parsePath(path);
  if (!segments.length) return "";

  let current = object;
  for (const segment of segments) {
    if (!current || typeof current !== "object") return "";
    current = current[segment];
  }

  if (typeof current === "string") return current;
  if (typeof current === "number" || typeof current === "boolean") {
    return String(current);
  }
  return "";
}

function resolveFirstLinkedTextualTargetValue(field, objetos) {
  const targets = Array.isArray(field?.applyTargets) ? field.applyTargets : [];

  for (const target of targets) {
    if (normalizeText(target?.scope).toLowerCase() !== "objeto") continue;
    if (!isTextualTemplateTargetPath(target?.path)) continue;

    const targetObject = findRenderObjectById(objetos, target?.id);
    const value = normalizeText(readObjectPathValue(targetObject, target?.path));
    if (value) return value;
  }

  return "";
}

function coupleKey(format) {
  return `${EVENT_PERSON_NAME_ROLES.COUPLE}:${normalizeEventCoupleNamesFormat(format)}`;
}

export function normalizeEventPersonNameRole(value) {
  const role = normalizeText(value).toLowerCase();
  if (role === EVENT_PERSON_NAME_ROLES.PRIMARY) return role;
  if (role === EVENT_PERSON_NAME_ROLES.SECONDARY) return role;
  if (role === EVENT_PERSON_NAME_ROLES.COUPLE) return role;
  return "";
}

export function normalizeEventCoupleNamesFormat(value) {
  const format = normalizeText(value).toLowerCase();
  if (format === EVENT_COUPLE_NAME_FORMATS.AMPERSAND) return format;
  if (format === EVENT_COUPLE_NAME_FORMATS.LINEBREAK) return format;
  return EVENT_COUPLE_NAME_FORMATS.AND;
}

export function inferEventCoupleNamesFormat(text) {
  const raw = String(text || "");
  if (/\S\s*(?:\r?\n)+\s*\S/.test(raw)) return EVENT_COUPLE_NAME_FORMATS.LINEBREAK;
  if (/\S\s*&\s*\S/.test(raw)) return EVENT_COUPLE_NAME_FORMATS.AMPERSAND;
  return EVENT_COUPLE_NAME_FORMATS.AND;
}

export function splitEventCoupleNamesText(text) {
  const raw = String(text || "").trim();
  if (!raw) {
    return {
      primaryName: "",
      secondaryName: "",
      format: EVENT_COUPLE_NAME_FORMATS.AND,
    };
  }

  const format = inferEventCoupleNamesFormat(raw);
  const patterns = [
    { format: EVENT_COUPLE_NAME_FORMATS.LINEBREAK, pattern: /^(.+?)\s*(?:\r?\n)+\s*(.+)$/ },
    { format: EVENT_COUPLE_NAME_FORMATS.AMPERSAND, pattern: /^(.+?)\s*&\s*(.+)$/ },
    { format: EVENT_COUPLE_NAME_FORMATS.AND, pattern: /^(.+?)\s+y\s+(.+)$/i },
  ];
  const orderedPatterns = [
    ...patterns.filter((entry) => entry.format === format),
    ...patterns.filter((entry) => entry.format !== format),
  ];

  for (const entry of orderedPatterns) {
    const match = raw.match(entry.pattern);
    if (!match) continue;
    return {
      primaryName: normalizeText(match[1]),
      secondaryName: normalizeText(match[2]),
      format: entry.format,
    };
  }

  return {
    primaryName: raw,
    secondaryName: "",
    format,
  };
}

export function resolveEventCoupleNamesValueFormat({ field, value } = {}) {
  const parsed = splitEventCoupleNamesText(value);
  if (parsed.primaryName && parsed.secondaryName) return parsed.format;
  return normalizeEventCoupleNamesFormat(asObject(field).eventDetailsFormat);
}

function resolveEventCoupleNamesDefaultConnector(format) {
  const safeFormat = normalizeEventCoupleNamesFormat(format);
  if (safeFormat === EVENT_COUPLE_NAME_FORMATS.AMPERSAND) return "&";
  if (safeFormat === EVENT_COUPLE_NAME_FORMATS.LINEBREAK) return "\n";
  return "y";
}

function extractEventCoupleNamesConnector(text, names) {
  const raw = String(text || "").trim();
  const primaryName = normalizeText(names?.primaryName);
  const secondaryName = normalizeText(names?.secondaryName);
  if (
    !raw ||
    !primaryName ||
    !secondaryName ||
    !raw.startsWith(primaryName) ||
    !raw.endsWith(secondaryName)
  ) {
    return "";
  }

  const connectorStart = primaryName.length;
  const connectorEnd = raw.length - secondaryName.length;
  const isConnectorBoundary = (value) => Boolean(value) && !/[\p{L}\p{N}_]/u.test(value);
  if (
    connectorStart >= connectorEnd ||
    !isConnectorBoundary(raw[connectorStart]) ||
    !isConnectorBoundary(raw[connectorEnd - 1])
  ) {
    return "";
  }

  const connector = raw
    .slice(connectorStart, connectorEnd)
    .trim();
  if (!connector) return "";
  return /\r?\n/.test(connector) ? "\n" : connector;
}

export function resolveEventCoupleNamesConnector({
  field,
  value,
  names,
  fallbackNames,
} = {}) {
  const explicitConnector =
    extractEventCoupleNamesConnector(value, names) ||
    extractEventCoupleNamesConnector(value, fallbackNames);
  if (explicitConnector) return explicitConnector;

  const parsed = splitEventCoupleNamesText(value);
  if (parsed.primaryName && parsed.secondaryName) {
    return resolveEventCoupleNamesDefaultConnector(parsed.format);
  }
  return resolveEventCoupleNamesDefaultConnector(asObject(field).eventDetailsFormat);
}

export function resolveEventCoupleNamesInlineEdit({
  text,
  currentNames,
  currentValue,
  field,
} = {}) {
  const parsed = splitEventCoupleNamesText(text);
  const currentConnector = resolveEventCoupleNamesConnector({
    field,
    value: currentValue,
    names: currentNames,
  });
  if (!parsed.primaryName) {
    return {
      ...parsed,
      connector: currentConnector,
    };
  }

  if (parsed.secondaryName) {
    return {
      ...parsed,
      connector: resolveEventCoupleNamesDefaultConnector(parsed.format),
    };
  }

  const primaryName = normalizeText(currentNames?.primaryName);
  const secondaryName = normalizeText(currentNames?.secondaryName);
  const explicitConnector = extractEventCoupleNamesConnector(text, currentNames);
  if (explicitConnector) {
    return {
      primaryName,
      secondaryName,
      format: inferEventCoupleNamesFormat(text),
      connector: explicitConnector,
    };
  }

  const comparable = (value) => String(value || "").replace(/\s+/g, "").toLowerCase();
  if (
    primaryName &&
    secondaryName &&
    comparable(parsed.primaryName) === comparable(`${primaryName}${secondaryName}`)
  ) {
    return {
      primaryName,
      secondaryName,
      format: resolveEventCoupleNamesValueFormat({ field, value: currentValue }),
      connector: currentConnector,
    };
  }

  if (currentConnector && currentConnector !== "\n") {
    const escapedConnector = currentConnector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const connectorBoundary = /^[\p{L}\p{N}_]+$/u.test(currentConnector)
      ? `\\s+${escapedConnector}\\s+`
      : `\\s*${escapedConnector}\\s*`;
    const connectorMatch = String(text || "").trim().match(
      new RegExp(`^(.+?)${connectorBoundary}(.+)$`, "u")
    );
    if (connectorMatch) {
      return {
        primaryName: normalizeText(connectorMatch[1]),
        secondaryName: normalizeText(connectorMatch[2]),
        format: resolveEventCoupleNamesValueFormat({ field, value: currentValue }),
        connector: currentConnector,
      };
    }
  }

  return {
    ...parsed,
    connector: currentConnector,
  };
}

export function formatEventCoupleNames({
  primaryName = "",
  secondaryName = "",
  format = EVENT_COUPLE_NAME_FORMATS.AND,
  connector,
} = {}) {
  const first = normalizeText(primaryName);
  const second = normalizeText(secondaryName);
  if (!first) return second;
  if (!second) return first;

  const rawConnector = String(connector ?? "");
  if (/\r?\n/.test(rawConnector)) return `${first}\n${second}`;
  const explicitConnector = rawConnector.trim();
  if (explicitConnector) {
    return `${first} ${explicitConnector} ${second}`;
  }

  const safeFormat = normalizeEventCoupleNamesFormat(format);
  if (safeFormat === EVENT_COUPLE_NAME_FORMATS.AMPERSAND) {
    return `${first} & ${second}`;
  }
  if (safeFormat === EVENT_COUPLE_NAME_FORMATS.LINEBREAK) {
    return `${first}\n${second}`;
  }
  return `${first} y ${second}`;
}

export function getEventPersonNameFieldKey(role, format = EVENT_COUPLE_NAME_FORMATS.AND) {
  const safeRole = normalizeEventPersonNameRole(role);
  if (safeRole === EVENT_PERSON_NAME_ROLES.COUPLE) {
    return EVENT_PERSON_NAME_FIELD_KEYS[coupleKey(format)];
  }
  return EVENT_PERSON_NAME_FIELD_KEYS[safeRole] || "";
}

export function isEventPersonNameField(field) {
  return Boolean(normalizeEventPersonNameRole(asObject(field).eventDetailsRole));
}

export function resolveEventPersonNameValueForField(field, names = {}, options = {}) {
  const safeField = asObject(field);
  const role = normalizeEventPersonNameRole(safeField.eventDetailsRole);
  if (role === EVENT_PERSON_NAME_ROLES.PRIMARY) return normalizeText(names.primaryName);
  if (role === EVENT_PERSON_NAME_ROLES.SECONDARY) return normalizeText(names.secondaryName);
  if (role === EVENT_PERSON_NAME_ROLES.COUPLE) {
    return formatEventCoupleNames({
      primaryName: names.primaryName,
      secondaryName: names.secondaryName,
      format: resolveEventCoupleNamesValueFormat({
        field: safeField,
        value: asObject(options).currentValue,
      }),
      connector: resolveEventCoupleNamesConnector({
        field: safeField,
        value: asObject(options).currentValue,
        names,
        fallbackNames: asObject(options).fallbackNames,
      }),
    });
  }
  return "";
}

export function buildEventPersonNameField({
  role,
  format = EVENT_COUPLE_NAME_FORMATS.AND,
} = {}) {
  const safeRole = normalizeEventPersonNameRole(role);
  const safeFormat = normalizeEventCoupleNamesFormat(format);
  const fieldKey = getEventPersonNameFieldKey(safeRole, safeFormat);
  if (!fieldKey) return null;

  const labelKey =
    safeRole === EVENT_PERSON_NAME_ROLES.COUPLE
      ? coupleKey(safeFormat)
      : safeRole;

  return {
    key: fieldKey,
    label: EVENT_PERSON_NAME_FIELD_LABELS[labelKey] || "Nombre",
    type: "text",
    group: "Datos principales",
    optional: false,
    eventDetailsRole: safeRole,
    ...(safeRole === EVENT_PERSON_NAME_ROLES.COUPLE
      ? { eventDetailsFormat: safeFormat }
      : {}),
    applyTargets: [],
  };
}

export function ensureEventPersonNameFields({
  fieldsSchema,
  includeBaseFields = true,
  coupleFormats = [],
} = {}) {
  const fields = Array.isArray(fieldsSchema) ? fieldsSchema : [];
  const nextFields = fields.map((field) => ({ ...asObject(field) }));
  const requiredFields = [];

  if (includeBaseFields) {
    requiredFields.push({ role: EVENT_PERSON_NAME_ROLES.PRIMARY });
    requiredFields.push({ role: EVENT_PERSON_NAME_ROLES.SECONDARY });
  }
  (Array.isArray(coupleFormats) ? coupleFormats : []).forEach((format) => {
    requiredFields.push({
      role: EVENT_PERSON_NAME_ROLES.COUPLE,
      format,
    });
  });

  let changed = false;
  requiredFields.forEach((config) => {
    const templateField = buildEventPersonNameField(config);
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
      type: "text",
      eventDetailsRole: templateField.eventDetailsRole,
      ...(templateField.eventDetailsFormat
        ? { eventDetailsFormat: templateField.eventDetailsFormat }
        : {}),
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

export function collectEventPersonNameFields(fieldsSchema) {
  return (Array.isArray(fieldsSchema) ? fieldsSchema : [])
    .map((field) => asObject(field))
    .filter((field) => isEventPersonNameField(field));
}

export function resolveEventPersonNameVisualFieldKeys({
  field,
  fieldsSchema,
} = {}) {
  const safeField = asObject(field);
  const fieldKey = normalizeText(safeField.key);
  if (!fieldKey) return [];
  if (
    normalizeEventPersonNameRole(safeField.eventDetailsRole) !==
    EVENT_PERSON_NAME_ROLES.COUPLE
  ) {
    return [fieldKey];
  }

  const declaredKeys = new Set(
    (Array.isArray(fieldsSchema) ? fieldsSchema : [])
      .map((candidate) => normalizeText(candidate?.key))
      .filter(Boolean)
  );
  return [
    fieldKey,
    getEventPersonNameFieldKey(EVENT_PERSON_NAME_ROLES.PRIMARY),
    getEventPersonNameFieldKey(EVENT_PERSON_NAME_ROLES.SECONDARY),
  ].filter((key, index, keys) => {
    if (!key || keys.indexOf(key) !== index) return false;
    return key === fieldKey || declaredKeys.has(key);
  });
}

export function resolveEventPersonNamesFromAuthoring({
  fieldsSchema,
  defaults,
  objetos,
} = {}) {
  const safeDefaults = asObject(defaults);
  const fields = collectEventPersonNameFields(fieldsSchema);
  const primaryKey = getEventPersonNameFieldKey(EVENT_PERSON_NAME_ROLES.PRIMARY);
  const secondaryKey = getEventPersonNameFieldKey(EVENT_PERSON_NAME_ROLES.SECONDARY);
  const primaryField =
    fields.find(
      (field) =>
        normalizeEventPersonNameRole(field.eventDetailsRole) ===
        EVENT_PERSON_NAME_ROLES.PRIMARY
    ) || null;
  const secondaryField =
    fields.find(
      (field) =>
        normalizeEventPersonNameRole(field.eventDetailsRole) ===
        EVENT_PERSON_NAME_ROLES.SECONDARY
    ) || null;
  const coupleFields = fields.filter(
    (field) =>
      normalizeEventPersonNameRole(field.eventDetailsRole) ===
      EVENT_PERSON_NAME_ROLES.COUPLE
  );
  const hasPrimaryValue = Object.prototype.hasOwnProperty.call(
    safeDefaults,
    primaryKey
  );
  const hasSecondaryValue = Object.prototype.hasOwnProperty.call(
    safeDefaults,
    secondaryKey
  );
  let primaryName = hasPrimaryValue
    ? normalizeText(safeDefaults[primaryKey])
    : resolveFirstLinkedTextualTargetValue(primaryField, objetos);
  let secondaryName = hasSecondaryValue
    ? normalizeText(safeDefaults[secondaryKey])
    : resolveFirstLinkedTextualTargetValue(secondaryField, objetos);

  if ((!hasPrimaryValue && !primaryName) || (!hasSecondaryValue && !secondaryName)) {
    const defaultCoupleText = coupleFields.reduce((value, field) => {
      const fieldKey = normalizeText(field?.key);
      if (!fieldKey || !Object.prototype.hasOwnProperty.call(safeDefaults, fieldKey)) {
        return value;
      }
      return value || normalizeText(safeDefaults[fieldKey]);
    }, "");
    const visibleCoupleText = coupleFields.reduce((value, field) => {
      const fieldKey = normalizeText(field?.key);
      if (fieldKey && Object.prototype.hasOwnProperty.call(safeDefaults, fieldKey)) {
        return value;
      }
      return value || resolveFirstLinkedTextualTargetValue(field, objetos);
    }, "");
    const parsed = splitEventCoupleNamesText(
      visibleCoupleText || defaultCoupleText
    );
    if (!hasPrimaryValue) primaryName = primaryName || parsed.primaryName;
    if (!hasSecondaryValue) secondaryName = secondaryName || parsed.secondaryName;
  }

  return {
    primaryName,
    secondaryName,
  };
}

export function isValidEventPersonNamesStateSnapshot(snapshot) {
  const source = asObject(snapshot);
  if (!Array.isArray(source.fieldsSchema)) return false;
  if (
    !Array.isArray(source.objetos) &&
    asObject(source.defaults) !== source.defaults
  ) {
    return false;
  }
  return collectEventPersonNameFields(source.fieldsSchema).length > 0;
}

export function resolveEventPersonNamesState(snapshot) {
  if (!isValidEventPersonNamesStateSnapshot(snapshot)) return null;

  const source = asObject(snapshot);
  return resolveEventPersonNamesFromAuthoring({
    fieldsSchema: source.fieldsSchema,
    defaults: source.defaults,
    objetos: source.objetos,
  });
}

export function buildEventPersonNameDefaults({
  fieldsSchema,
  defaults,
  names,
  coupleValueByFieldKey,
} = {}) {
  const safeDefaults = { ...asObject(defaults) };
  const safeCoupleValueByFieldKey = asObject(coupleValueByFieldKey);
  const previousNames = {
    primaryName: normalizeText(
      safeDefaults[getEventPersonNameFieldKey(EVENT_PERSON_NAME_ROLES.PRIMARY)]
    ),
    secondaryName: normalizeText(
      safeDefaults[getEventPersonNameFieldKey(EVENT_PERSON_NAME_ROLES.SECONDARY)]
    ),
  };
  const safeNames = {
    primaryName: normalizeText(names?.primaryName),
    secondaryName: normalizeText(names?.secondaryName),
  };

  collectEventPersonNameFields(fieldsSchema).forEach((field) => {
    const fieldKey = normalizeText(field.key);
    if (!fieldKey) return;
    const currentValue = Object.prototype.hasOwnProperty.call(
      safeCoupleValueByFieldKey,
      fieldKey
    )
      ? safeCoupleValueByFieldKey[fieldKey]
      : safeDefaults[fieldKey];
    safeDefaults[fieldKey] = resolveEventPersonNameValueForField(field, safeNames, {
      currentValue,
      fallbackNames: previousNames,
    });
  });

  return safeDefaults;
}
