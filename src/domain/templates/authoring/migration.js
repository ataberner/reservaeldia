import {
  ensureValuesForSchema,
  normalizeTemplateDocument,
  TEMPLATE_AUTHORING_DRAFT_VERSION,
} from "../../../../shared/templates/contract.js";
import {
  migrateLegacyValueMap,
  normalizeEventDetailsAuthoringContract,
} from "../../../../shared/eventDetailsMigration.js";
import { normalizeFunctionalAssociation } from "../../../../shared/functionalAssociations.js";
import {
  collectRenderObjectIds,
} from "../../editor/renderObjectTree.js";
import {
  buildSuggestedTemplateTargetTransform,
  normalizeTemplateInputValueForFieldType,
  resolveEffectiveTemplateTargetTransform,
  resolveTemplateTargetValue,
} from "../fieldValueResolver.js";
import {
  collectEventGoogleMapObjects,
  formatEventAddressText,
  migrateLegacyEventLocationProviderMetadata,
  normalizeEventLocationProviderMetadata,
  resolveEventAddressTextFormatPreset,
} from "../../eventDetails/location.js";
import {
  normalizeVisibleEventDateValue,
} from "../../eventDetails/date.js";
import { normalizeEventDetailsConfig } from "../../../../shared/eventDetailsConfig.js";
import {
  collectCountdownObjects,
  resolveCountdownTargetValue,
  splitCountdownTargetIso,
} from "../../eventDetails/countdownEventDetails.js";
import {
  resolveGalleryCellMediaUrl,
  resolveObjectPrimaryAssetUrl,
} from "../../../../shared/renderAssetContract.js";

const POLICY_VERSION = 2;

const EVENT_DETAILS_ROLE_BY_FIELD_KEY = Object.freeze({
  event_primary_person_name: "primary_person_name",
  event_secondary_person_name: "secondary_person_name",
  event_couple_names_and: "couple_names",
  event_couple_names_ampersand: "couple_names",
  event_couple_names_linebreak: "couple_names",
  event_ceremony_date: "ceremony_date",
  event_ceremony_start_time: "ceremony_start_time",
  event_ceremony_end_time: "ceremony_end_time",
  event_ceremony_venue_name: "ceremony_venue_name",
  event_ceremony_venue_address: "ceremony_venue_address",
  event_party_date: "party_date",
  event_party_start_time: "party_start_time",
  event_party_end_time: "party_end_time",
  event_party_venue_name: "party_venue_name",
  event_party_venue_address: "party_venue_address",
  event_dress_code: "dress_code",
});

const COUPLE_FORMAT_BY_FIELD_KEY = Object.freeze({
  event_couple_names_and: "and",
  event_couple_names_ampersand: "ampersand",
  event_couple_names_linebreak: "linebreak",
});
const EVENT_DETAILS_ROLES = new Set([
  "primary_person_name",
  "secondary_person_name",
  "couple_names",
  "ceremony_date",
  "ceremony_start_time",
  "ceremony_end_time",
  "ceremony_venue_name",
  "ceremony_venue_address",
  "party_date",
  "party_start_time",
  "party_end_time",
  "party_venue_name",
  "party_venue_address",
  "dress_code",
]);

function asObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value;
}

function hasOwn(value, key) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function normalizeText(value) {
  return String(value || "").trim();
}

function deepClone(value) {
  if (Array.isArray(value)) return value.map((entry) => deepClone(entry));
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, nested]) => [key, deepClone(nested)])
  );
}

function areValuesEqual(left, right) {
  if (left === right) return true;
  try {
    return JSON.stringify(left) === JSON.stringify(right);
  } catch {
    return false;
  }
}

function normalizeVersion(value, fallback = 1) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(1, Math.round(parsed)) : fallback;
}

function normalizeFieldValue(field, value) {
  const type = normalizeText(field?.type).toLowerCase();
  if (type === "images") {
    return (Array.isArray(value) ? value : [])
      .map((entry) => normalizeText(entry))
      .filter(Boolean);
  }
  return normalizeTemplateInputValueForFieldType(type, value);
}

function normalizeKnownEventDetailsRoles(fieldsSchema) {
  return (Array.isArray(fieldsSchema) ? fieldsSchema : []).map((field) => {
    const source = asObject(field);
    const key = normalizeText(source.key);
    const inferredRole = EVENT_DETAILS_ROLE_BY_FIELD_KEY[key] || "";
    const currentRole = normalizeText(source.eventDetailsRole).toLowerCase();
    const explicitRole = EVENT_DETAILS_ROLES.has(currentRole) ? currentRole : "";
    const coupleFormat = COUPLE_FORMAT_BY_FIELD_KEY[key] || "";
    return {
      ...source,
      ...(explicitRole || inferredRole
        ? { eventDetailsRole: explicitRole || inferredRole }
        : {}),
      ...(coupleFormat && !normalizeText(source.eventDetailsFormat)
        ? { eventDetailsFormat: coupleFormat }
        : {}),
    };
  });
}

function normalizeSchemaAndLegacyKeys({ fieldsSchema, defaults, eventDetails }) {
  const migratedAuthoring = normalizeEventDetailsAuthoringContract({
    fieldsSchema,
    defaults: migrateLegacyValueMap(defaults),
    eventDetails,
  });
  const withRoles = normalizeKnownEventDetailsRoles(
    migratedAuthoring.fieldsSchema
  );
  const normalizedTemplate = normalizeTemplateDocument({
    id: "dynamic-authoring-v2-migration",
    nombre: "Migracion",
    fieldsSchema: withRoles,
    defaults: migratedAuthoring.defaults,
  });

  return {
    fieldsSchema: normalizedTemplate.fieldsSchema,
    defaults: normalizedTemplate.defaults,
    providedDefaults: migratedAuthoring.defaults,
  };
}

function collectStableObjectRecords(objetos) {
  const records = [];
  const visit = (object, context) => {
    if (!object || typeof object !== "object" || Array.isArray(object)) return;
    const id = normalizeText(object?.id);
    const ownAssociation = normalizeFunctionalAssociation(
      object?.functionalAssociation
    );
    const functionalAssociation = ownAssociation || context.inheritedAssociation || null;
    if (id) {
      records.push({
        object,
        id,
        rootIndex: context.rootIndex,
        childIndex: context.childIndex,
        functionalAssociation,
      });
    }

    if (
      normalizeText(object?.tipo).toLowerCase() === "grupo" &&
      Array.isArray(object.children)
    ) {
      object.children.forEach((child, childIndex) => {
        visit(child, {
          rootIndex: context.rootIndex,
          childIndex,
          inheritedAssociation: functionalAssociation,
        });
      });
    }
  };

  (Array.isArray(objetos) ? objetos : []).forEach((object, rootIndex) => {
    visit(object, {
      rootIndex,
      childIndex: null,
      inheritedAssociation: null,
    });
  });
  return records;
}

function readPathValue(target, path) {
  const segments = normalizeText(path)
    .replace(/\[(\d+)\]/g, ".$1")
    .split(".")
    .map((segment) => segment.trim())
    .filter(Boolean);
  if (!segments.length) return { found: false, value: undefined };

  let current = target;
  for (const segment of segments) {
    if (!current || typeof current !== "object" || !hasOwn(current, segment)) {
      return { found: false, value: undefined };
    }
    current = current[segment];
  }
  return { found: current !== undefined, value: current };
}

function collectGalleryUrls(object) {
  return (Array.isArray(object?.cells) ? object.cells : [])
    .map((cell) => resolveGalleryCellMediaUrl(cell))
    .filter(Boolean);
}

function buildCandidateTarget(field, object) {
  const objectId = normalizeText(object?.id);
  const objectType = normalizeText(object?.tipo).toLowerCase();
  const fieldType = normalizeText(field?.type).toLowerCase();
  if (!objectId) return null;

  let path = "";
  if (objectType === "texto" && fieldType !== "images") {
    path = "texto";
  } else if (
    objectType === "countdown" &&
    (fieldType === "date" || fieldType === "datetime")
  ) {
    path = "fechaObjetivo";
  } else if (objectType === "imagen" && fieldType === "images") {
    path = "src";
  } else if (
    (objectType === "galeria" || objectType === "gallery") &&
    fieldType === "images"
  ) {
    path = "cells";
  } else {
    return null;
  }

  const transform = buildSuggestedTemplateTargetTransform({ field, path });
  return {
    scope: "objeto",
    id: objectId,
    path,
    mode: "set",
    ...(transform ? { transform } : {}),
  };
}

function readComparableObjectValue(object, target) {
  const path = normalizeText(target?.path).toLowerCase();
  if (path === "fechaobjetivo") return resolveCountdownTargetValue(object);
  if (path === "cells") return collectGalleryUrls(object);
  if (path === "src") return resolveObjectPrimaryAssetUrl(object);
  return readPathValue(object, target?.path).value;
}

function buildFieldMatchValues(field, valueMaps) {
  const key = normalizeText(field?.key);
  const out = [];
  const seen = [];
  valueMaps.forEach((valueMap) => {
    const source = asObject(valueMap);
    if (!key || !hasOwn(source, key)) return;
    const value = normalizeFieldValue(field, source[key]);
    if (
      (value === "" || (Array.isArray(value) && value.length === 0)) ||
      seen.some((candidate) => areValuesEqual(candidate, value))
    ) {
      return;
    }
    seen.push(value);
    out.push(value);
  });
  return out;
}

function resolveAssociatedEventFeature(object, inheritedAssociation = null) {
  const explicitFeature = normalizeText(
    object?.eventDetailsFeature
  ).toLowerCase();
  if (explicitFeature === "ceremony" || explicitFeature === "party") {
    return explicitFeature;
  }

  const association =
    normalizeFunctionalAssociation(object?.functionalAssociation) ||
    normalizeFunctionalAssociation(inheritedAssociation);
  return association === "ceremony" || association === "party"
    ? association
    : null;
}

function candidateMatchesField({
  field,
  object,
  target,
  matchValues,
  functionalAssociation,
}) {
  if (normalizeText(object?.tipo).toLowerCase() === "countdown") {
    const fieldFeature = normalizeText(field?.eventDetailsRole)
      .toLowerCase()
      .match(/^(ceremony|party)_date$/)?.[1] || null;
    const associatedFeature = resolveAssociatedEventFeature(
      object,
      functionalAssociation
    );
    if (fieldFeature && associatedFeature) {
      return fieldFeature === associatedFeature;
    }
  }

  const currentValue = readComparableObjectValue(object, target);
  return matchValues.some((candidate) => {
    const projected = resolveTemplateTargetValue({ field, target, value: candidate });
    return areValuesEqual(currentValue, projected);
  });
}

function materializeLegacyMappings({ fieldsSchema, objetos, valueMaps }) {
  const records = collectStableObjectRecords(objetos);
  const missingFields = fieldsSchema.filter(
    (field) => !hasOwn(asObject(field), "applyTargets")
  );
  const candidatesByFieldKey = new Map();
  const ownersByTargetKey = new Map();

  missingFields.forEach((field) => {
    const fieldKey = normalizeText(field?.key);
    const matchValues = buildFieldMatchValues(field, valueMaps);
    const candidates = [];
    records.forEach(({ object, functionalAssociation }) => {
      const target = buildCandidateTarget(field, object);
      if (!target) return;
      if (
        !candidateMatchesField({
          field,
          object,
          target,
          matchValues,
          functionalAssociation,
        })
      ) {
        return;
      }
      const targetKey = `${target.id}|${normalizeText(target.path).toLowerCase()}`;
      candidates.push({ target, targetKey });
      const owners = ownersByTargetKey.get(targetKey) || new Set();
      owners.add(fieldKey);
      ownersByTargetKey.set(targetKey, owners);
    });
    candidatesByFieldKey.set(fieldKey, candidates);
  });

  const materializedTargets = [];
  const nextFieldsSchema = fieldsSchema.map((field) => {
    const safeField = asObject(field);
    if (hasOwn(safeField, "applyTargets")) {
      return {
        ...safeField,
        applyTargets: Array.isArray(safeField.applyTargets)
          ? safeField.applyTargets
          : [],
      };
    }

    const fieldKey = normalizeText(safeField.key);
    const targets = (candidatesByFieldKey.get(fieldKey) || [])
      .filter(({ targetKey }) => ownersByTargetKey.get(targetKey)?.size === 1)
      .map(({ target }) => target);
    targets.forEach((target) => {
      materializedTargets.push({ fieldKey, target });
    });
    return { ...safeField, applyTargets: targets };
  });

  return { fieldsSchema: nextFieldsSchema, materializedTargets };
}

function normalizeRecoveredTargetValue(field, target, object) {
  const path = normalizeText(target?.path).toLowerCase();
  const transform = resolveEffectiveTemplateTargetTransform({ field, target });

  if (transform.kind === "images_to_first_url") {
    // This transform deliberately discards all but one item, so it is never
    // inverted during migration.
    return { found: false, value: undefined };
  }

  if (path === "fechaobjetivo" || transform.kind === "date_to_countdown_iso") {
    const rawValue = resolveCountdownTargetValue(object);
    if (!rawValue) {
      const pathValue = readPathValue(object, target?.path);
      return pathValue.found && pathValue.value === ""
        ? { found: true, value: "" }
        : { found: false, value: undefined };
    }
    const parts = splitCountdownTargetIso(rawValue);
    const type = normalizeText(field?.type).toLowerCase();
    const resolved = type === "datetime" ? rawValue : parts.date;
    return resolved
      ? { found: true, value: normalizeFieldValue(field, resolved) }
      : { found: false, value: undefined };
  }

  if (transform.kind === "date_to_text") {
    const pathValue = readPathValue(object, target?.path);
    if (!pathValue.found) return { found: false, value: undefined };
    if (pathValue.value === "") return { found: true, value: "" };
    const resolved = normalizeVisibleEventDateValue(pathValue.value);
    return resolved
      ? { found: true, value: normalizeFieldValue(field, resolved) }
      : { found: false, value: undefined };
  }

  if (normalizeText(target?.mode).toLowerCase() === "replace") {
    return { found: false, value: undefined };
  }

  if (path === "cells" && normalizeText(field?.type).toLowerCase() === "images") {
    return { found: true, value: collectGalleryUrls(object) };
  }

  const pathValue = readPathValue(object, target?.path);
  if (!pathValue.found) return { found: false, value: undefined };
  return {
    found: true,
    value: normalizeFieldValue(field, pathValue.value),
  };
}

function resolveFromLiveTargets(field, objetos) {
  const targets = (Array.isArray(field?.applyTargets) ? field.applyTargets : [])
    .map((target, index) => ({ target: asObject(target), index }))
    .filter(({ target }) => normalizeText(target.scope).toLowerCase() === "objeto");
  if (!targets.length) return { found: false, value: undefined };

  const targetsByObjectId = new Map();
  targets.forEach((record) => {
    const id = normalizeText(record.target.id);
    if (!id) return;
    const records = targetsByObjectId.get(id) || [];
    records.push(record);
    targetsByObjectId.set(id, records);
  });

  const objectRecords = collectStableObjectRecords(objetos);
  for (const { object, id } of objectRecords) {
    const objectTargets = targetsByObjectId.get(id) || [];
    for (const { target } of objectTargets) {
      const resolved = normalizeRecoveredTargetValue(field, target, object);
      if (resolved.found) return resolved;
    }
  }
  return { found: false, value: undefined };
}

function resolveLocationLegacyValue(field, objetos) {
  const role = normalizeText(field?.eventDetailsRole).toLowerCase();
  const match = role.match(/^(ceremony|party)_(venue_name|venue_address)$/);
  if (!match) return { found: false, value: undefined };
  const [, feature, locationRole] = match;

  for (const mapObject of collectEventGoogleMapObjects(objetos, feature)) {
    const metadata = normalizeEventLocationProviderMetadata(mapObject);
    if (!metadata) continue;
    if (locationRole === "venue_name" && metadata.displayName) {
      return { found: true, value: metadata.displayName };
    }
    if (locationRole === "venue_address" && metadata.formattedAddress) {
      return {
        found: true,
        value: formatEventAddressText({
          address: metadata.formattedAddress,
          googleFormattedAddress: metadata.formattedAddress,
          googleAddressComponents: metadata.addressComponents,
          preset: resolveEventAddressTextFormatPreset(field),
        }),
      };
    }
  }
  return { found: false, value: undefined };
}

function resolveStartTimeFromLinkedCountdown(field, fieldsSchema, objetos) {
  const role = normalizeText(field?.eventDetailsRole).toLowerCase();
  const match = role.match(/^(ceremony|party)_start_time$/);
  if (!match) return { found: false, value: undefined };
  const feature = match[1];
  const dateField = fieldsSchema.find(
    (candidate) =>
      normalizeText(candidate?.eventDetailsRole).toLowerCase() === `${feature}_date`
  );
  const countdownIds = new Set(
    (Array.isArray(dateField?.applyTargets) ? dateField.applyTargets : [])
      .filter(
        (target) =>
          normalizeText(target?.scope).toLowerCase() === "objeto" &&
          normalizeText(target?.path).toLowerCase() === "fechaobjetivo"
      )
      .map((target) => normalizeText(target?.id))
      .filter(Boolean)
  );
  if (!countdownIds.size) return { found: false, value: undefined };

  for (const countdown of collectCountdownObjects(objetos)) {
    if (!countdownIds.has(normalizeText(countdown?.id))) continue;
    const time = splitCountdownTargetIso(resolveCountdownTargetValue(countdown)).time;
    if (time) return { found: true, value: time };
  }
  return { found: false, value: undefined };
}

function resolveLegacySpecificValue({
  field,
  fieldsSchema,
  objetos,
  eventDetails,
}) {
  const role = normalizeText(field?.eventDetailsRole).toLowerCase();
  if (role === "dress_code") {
    const dressCode = asObject(asObject(eventDetails).dressCode);
    if (hasOwn(dressCode, "value")) {
      return { found: true, value: normalizeFieldValue(field, dressCode.value) };
    }
  }

  const location = resolveLocationLegacyValue(field, objetos);
  if (location.found) {
    return { found: true, value: normalizeFieldValue(field, location.value) };
  }

  const countdownTime = resolveStartTimeFromLinkedCountdown(
    field,
    fieldsSchema,
    objetos
  );
  if (countdownTime.found) {
    return {
      found: true,
      value: normalizeFieldValue(field, countdownTime.value),
    };
  }

  return resolveFromLiveTargets(field, objetos);
}

function selectMigratedFieldValue({
  field,
  fieldsSchema,
  objetos,
  eventDetails,
  authoringDefaults,
  baselineDefaults,
  existingValues,
  initialValues,
  templateDefaults,
}) {
  const key = normalizeText(field?.key);
  const live = resolveLegacySpecificValue({
    field,
    fieldsSchema,
    objetos,
    eventDetails,
  });
  if (live.found) return { value: live.value, source: "legacy-or-live-target" };

  if (
    hasOwn(authoringDefaults, key) &&
    (!hasOwn(baselineDefaults, key) ||
      !areValuesEqual(authoringDefaults[key], baselineDefaults[key]))
  ) {
    return {
      value: normalizeFieldValue(field, authoringDefaults[key]),
      source: "authoring-default-changed",
    };
  }

  if (hasOwn(existingValues, key)) {
    return {
      value: normalizeFieldValue(field, existingValues[key]),
      source: "template-input-value",
    };
  }

  const fallbacks = [
    [authoringDefaults, "authoring-default"],
    [initialValues, "template-input-initial"],
    [templateDefaults, "template-default"],
    [baselineDefaults, "template-input-default"],
  ];
  for (const [source, sourceName] of fallbacks) {
    if (!hasOwn(source, key)) continue;
    return {
      value: normalizeFieldValue(field, source[key]),
      source: sourceName,
    };
  }

  return {
    value: normalizeFieldValue(field, undefined),
    source: "type-default",
  };
}

function calculateChangedKeys(fieldsSchema, defaults, values) {
  return fieldsSchema
    .map((field) => normalizeText(field?.key))
    .filter(Boolean)
    .filter((key) => !areValuesEqual(defaults[key], values[key]));
}

/**
 * Lazy, pure v1 -> v2 migration for dynamic template values and mappings.
 * It does not write or mutate its inputs. Callers decide whether their editor
 * session is writable before persisting the returned state.
 */
export function migrateDynamicAuthoringStateV2({
  authoringDraft,
  templateInput,
  templateFieldsSchema,
  templateDefaults,
  objetos,
  eventDetails,
  sessionKind = "draft",
  sourceTemplateId = null,
} = {}) {
  const rawAuthoring = asObject(authoringDraft);
  const rawTemplateInput = asObject(templateInput);
  const isDraftSession = normalizeText(sessionKind).toLowerCase() !== "template";
  const rawFields = Array.isArray(rawAuthoring.fieldsSchema)
    ? rawAuthoring.fieldsSchema
    : Array.isArray(templateFieldsSchema)
      ? templateFieldsSchema
      : [];
  const authoringVersion = normalizeVersion(rawAuthoring.version);
  const inputVersion = normalizeVersion(rawTemplateInput.policyVersion);
  const hasPendingLegacyMappings = rawFields.some(
    (field) => !hasOwn(asObject(field), "applyTargets")
  );
  const shouldMigrate =
    rawFields.length > 0 &&
    (authoringVersion < TEMPLATE_AUTHORING_DRAFT_VERSION ||
      (isDraftSession && inputVersion < POLICY_VERSION) ||
      hasPendingLegacyMappings);

  if (!shouldMigrate) {
    return {
      migrated: false,
      authoringDraft,
      templateInput,
      report: {
        materializedTargets: [],
        sourcesByField: {},
        locationMetadataSources: {},
      },
    };
  }

  const migratedTemplateDefaults = migrateLegacyValueMap(templateDefaults);
  const migratedInputDefaults = migrateLegacyValueMap(rawTemplateInput.defaults);
  const migratedInitialValues = migrateLegacyValueMap(rawTemplateInput.initialValues);
  const migratedExistingValues = migrateLegacyValueMap(rawTemplateInput.values);
  const normalizedAuthoring = normalizeSchemaAndLegacyKeys({
    fieldsSchema: rawFields,
    defaults: rawAuthoring.defaults,
    eventDetails,
  });
  const normalizedFields = normalizedAuthoring.fieldsSchema;
  const providedAuthoringDefaults = asObject(
    normalizedAuthoring.providedDefaults
  );
  const normalizedAuthoringDefaults = ensureValuesForSchema(
    normalizedFields,
    normalizedAuthoring.defaults
  );
  const normalizedTemplateDefaults = ensureValuesForSchema(
    normalizedFields,
    migratedTemplateDefaults
  );
  const normalizedBaselineDefaults = ensureValuesForSchema(
    normalizedFields,
    migratedInputDefaults,
    {
      ...normalizedAuthoringDefaults,
      ...normalizedTemplateDefaults,
    }
  );
  const normalizedInitialValues = ensureValuesForSchema(
    normalizedFields,
    migratedInitialValues,
    normalizedBaselineDefaults
  );

  const mappingResult = materializeLegacyMappings({
    fieldsSchema: normalizedFields,
    objetos,
    valueMaps: [
      providedAuthoringDefaults,
      normalizedBaselineDefaults,
      migratedExistingValues,
      migratedInitialValues,
      migratedTemplateDefaults,
    ],
  });
  const fieldsSchema = mappingResult.fieldsSchema;
  const values = {
    ...migratedExistingValues,
  };
  const sourcesByField = {};
  fieldsSchema.forEach((field) => {
    const key = normalizeText(field?.key);
    if (!key) return;
    const selection = selectMigratedFieldValue({
      field,
      fieldsSchema,
      objetos,
      eventDetails,
      authoringDefaults: providedAuthoringDefaults,
      baselineDefaults: migratedInputDefaults,
      existingValues: migratedExistingValues,
      initialValues: migratedInitialValues,
      templateDefaults: migratedTemplateDefaults,
    });
    values[key] = selection.value;
    sourcesByField[key] = selection.source;
  });

  let valuesWithMetadata = ensureValuesForSchema(
    fieldsSchema,
    values,
    normalizedInitialValues
  );
  const locationMetadataSources = {};
  ["ceremony", "party"].forEach((feature) => {
    const metadataMigration = migrateLegacyEventLocationProviderMetadata({
      values: valuesWithMetadata,
      objetos,
      feature,
    });
    valuesWithMetadata = metadataMigration.values;
    locationMetadataSources[feature] = metadataMigration.sourceObjectId || null;
  });

  const defaultsForAuthoring = isDraftSession
    ? normalizedBaselineDefaults
    : valuesWithMetadata;
  const normalizedEventDetails = normalizeEventDetailsConfig(eventDetails);
  const dressCodeField = fieldsSchema.find(
    (field) => normalizeText(field?.eventDetailsRole).toLowerCase() === "dress_code"
  );
  const dressCodeFieldKey = normalizeText(dressCodeField?.key);
  const nextEventDetails = dressCodeFieldKey
    ? {
        ...normalizedEventDetails,
        dressCode: {
          ...normalizedEventDetails.dressCode,
          value: String(valuesWithMetadata[dressCodeFieldKey] ?? ""),
        },
      }
    : normalizedEventDetails;
  const nextAuthoringDraft = {
    ...deepClone(rawAuthoring),
    version: TEMPLATE_AUTHORING_DRAFT_VERSION,
    sourceTemplateId:
      normalizeText(rawAuthoring.sourceTemplateId) ||
      normalizeText(sourceTemplateId) ||
      null,
    fieldsSchema,
    defaults: defaultsForAuthoring,
  };
  const nextTemplateInput = isDraftSession
    ? {
        ...deepClone(rawTemplateInput),
        policyVersion: POLICY_VERSION,
        defaults: normalizedBaselineDefaults,
        initialValues: normalizedInitialValues,
        values: valuesWithMetadata,
        changedKeys: calculateChangedKeys(
          fieldsSchema,
          normalizedBaselineDefaults,
          valuesWithMetadata
        ),
      }
    : templateInput;

  return {
    migrated: true,
    authoringDraft: nextAuthoringDraft,
    templateInput: nextTemplateInput,
    eventDetails: nextEventDetails,
    values: valuesWithMetadata,
    report: {
      materializedTargets: mappingResult.materializedTargets,
      sourcesByField,
      locationMetadataSources,
      liveObjectIds: Array.from(collectRenderObjectIds(objetos)),
    },
  };
}
