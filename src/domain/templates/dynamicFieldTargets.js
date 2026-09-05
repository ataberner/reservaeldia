import { materializeGroupChildAsRoot } from "../editor/grouping.js";
import { applyFunctionalAssociationsToRenderState } from "../../../shared/functionalAssociations.js";
import {
  dateTextFormatPresetIncludesTime,
  isDateLikeTemplateFieldType,
  isTextualTemplateTargetPath,
  normalizeTemplateInputValueForFieldType,
  resolveEffectiveTemplateTargetTransform,
} from "./fieldValueResolver.js";
import {
  resolveEventPersonNameVisualFieldKeys,
} from "../eventDetails/personNames.js";
import {
  buildEventDateInlineControlValue,
  resolveEventDateAuthoringParts,
} from "../eventDetails/date.js";

const DETACHED_VISUALS_VERSION = 1;
const GALLERY_OBJECT_TYPES = new Set(["galeria", "gallery"]);
const DYNAMIC_INLINE_FIELD_TYPES = new Set([
  "text",
  "textarea",
  "date",
  "time",
  "datetime",
  "location",
  "url",
]);

function normalizeText(value) {
  return String(value || "").trim();
}

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function deepClone(value) {
  if (Array.isArray(value)) return value.map((entry) => deepClone(entry));
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, nested]) => [key, deepClone(nested)])
  );
}

const RECOVERED_TEXT_BOX_LAYOUT_KEYS = [
  "width",
  "__autoWidth",
  "textWrapMode",
];

export function preserveRecoveredTextBoxLayout({
  recoveredObject,
  normalizedObject,
} = {}) {
  if (!normalizedObject || typeof normalizedObject !== "object") {
    return normalizedObject;
  }
  if (normalizeRestoreKind(recoveredObject?.tipo) !== "texto") {
    return normalizedObject;
  }

  const nextObject = { ...normalizedObject };
  RECOVERED_TEXT_BOX_LAYOUT_KEYS.forEach((key) => {
    if (
      Object.prototype.hasOwnProperty.call(recoveredObject, key) &&
      recoveredObject[key] !== undefined
    ) {
      nextObject[key] = deepClone(recoveredObject[key]);
      return;
    }
    delete nextObject[key];
  });
  return nextObject;
}

function toFiniteInteger(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.round(numeric) : fallback;
}

function normalizeFieldKeys(value) {
  const source = Array.isArray(value) ? value : [value];
  const seen = new Set();
  return source.reduce((keys, entry) => {
    const key = normalizeText(entry);
    if (!key || seen.has(key)) return keys;
    seen.add(key);
    keys.push(key);
    return keys;
  }, []);
}

export function resolveNextDynamicFieldVisualRootId({
  rootObjectIds,
  previousRootObjectId,
} = {}) {
  const orderedRootIds = normalizeFieldKeys(rootObjectIds);
  if (!orderedRootIds.length) return null;

  const previousIndex = orderedRootIds.indexOf(
    normalizeText(previousRootObjectId)
  );
  return orderedRootIds[(previousIndex + 1) % orderedRootIds.length];
}

function normalizeTarget(target) {
  const safeTarget = asObject(target);
  const objectId = normalizeText(safeTarget.id);
  const path = normalizeText(safeTarget.path);
  if (!objectId) return null;
  if (!path) return null;
  if (normalizeText(safeTarget.scope).toLowerCase() !== "objeto") return null;

  return {
    ...safeTarget,
    scope: "objeto",
    id: objectId,
    path,
  };
}

function isOwnObjectHidden(object) {
  const safeObject = asObject(object);
  if (!normalizeText(safeObject.id)) return true;
  if (safeObject.hidden === true) return true;
  if (safeObject.visible === false) return true;
  if (safeObject.mostrar === false) return true;
  const type = normalizeText(safeObject.tipo).toLowerCase();
  if (type === "countdown" && safeObject.mostrarCuentaRegresiva === false) {
    return true;
  }
  if (type === "mapa-google" && safeObject.mostrarMapa === false) {
    return true;
  }
  return false;
}

function buildRenderObjectIndex(objetos, hiddenObjectIds = []) {
  const recordsById = new Map();
  const orderedRecords = [];
  const externallyHiddenIds = new Set(
    asArray(hiddenObjectIds).map(normalizeText).filter(Boolean)
  );
  let objectOrder = 0;

  const visit = ({ object, rootObject, rootIndex, parentGroup, childIndex, ancestorHidden }) => {
    if (!object || typeof object !== "object" || Array.isArray(object)) return;
    const objectId = normalizeText(object.id);
    const rootObjectId = normalizeText(rootObject?.id) || objectId;
    const hidden =
      ancestorHidden ||
      isOwnObjectHidden(object) ||
      externallyHiddenIds.has(objectId) ||
      externallyHiddenIds.has(rootObjectId);
    if (objectId && !recordsById.has(objectId)) {
      const record = {
        object,
        objectId,
        rootObject,
        rootObjectId,
        rootIndex,
        parentGroup,
        parentGroupId: normalizeText(parentGroup?.id) || null,
        childIndex: Number.isFinite(childIndex) ? childIndex : null,
        objectOrder,
        hidden,
      };
      objectOrder += 1;
      recordsById.set(objectId, record);
      orderedRecords.push(record);
    }

    asArray(object.children).forEach((child, index) => {
      visit({
        object: child,
        rootObject,
        rootIndex,
        parentGroup: object,
        childIndex: index,
        ancestorHidden: hidden,
      });
    });
  };

  asArray(objetos).forEach((object, rootIndex) => {
    visit({
      object,
      rootObject: object,
      rootIndex,
      parentGroup: null,
      childIndex: null,
      ancestorHidden: false,
    });
  });

  return { recordsById, orderedRecords };
}

function isCountdownDateField(field) {
  const fieldType = normalizeText(field?.type).toLowerCase();
  if (isDateLikeTemplateFieldType(fieldType)) return true;
  return !fieldType && resolveEventDetailsRole(field)?.role === "date";
}

function isValidFieldTargetCandidate({ field, target, object }) {
  const objectType = normalizeText(object?.tipo).toLowerCase();
  const path = normalizeText(target?.path).toLowerCase();
  const transformKind = normalizeText(target?.transform?.kind).toLowerCase();
  const touchesCountdown =
    objectType === "countdown" ||
    path === "fechaobjetivo" ||
    transformKind === "date_to_countdown_iso";

  if (!touchesCountdown) return true;

  return Boolean(
    objectType === "countdown" &&
      path === "fechaobjetivo" &&
      isCountdownDateField(field) &&
      (!transformKind ||
        transformKind === "identity" ||
        transformKind === "date_to_countdown_iso")
  );
}

function isCandidateHidden(record) {
  if (record?.hidden) return true;
  const object = asObject(record?.object);
  if (normalizeText(object.tipo).toLowerCase() !== "mapa-google") return false;
  return !normalizeText(object.googlePlaceId);
}

function collectFieldCandidates({ field, fieldKey, objectIndex, visibleOnly = true }) {
  const targets = Array.isArray(field?.applyTargets) ? field.applyTargets : [];
  return targets
    .map(normalizeTarget)
    .filter(Boolean)
    .map((target, targetIndex) => {
      const record = objectIndex.recordsById.get(target.id) || null;
      if (!record || !isValidFieldTargetCandidate({ field, target, object: record.object })) {
        return null;
      }
      const hidden = isCandidateHidden(record);
      if (visibleOnly && hidden) return null;
      return {
        field,
        fieldKey,
        target,
        object: record.object,
        objectId: target.id,
        rootObject: record.rootObject,
        rootObjectId: record.rootObjectId,
        targetIndex,
        objectOrder: record.objectOrder,
        isTextualTarget: isTextualTemplateTargetPath(target.path),
        hidden,
      };
    })
    .filter(Boolean);
}

function resolveEventDetailsRole(field) {
  const role = normalizeText(field?.eventDetailsRole).toLowerCase();
  const match = role.match(
    /^(ceremony|party)_(date|start_time|venue_name|venue_address)$/
  );
  return match
    ? { feature: match[1], role: match[2] }
    : null;
}

function resolveObjectEventDetailsFeature(object, associationOwner = null) {
  const explicitFeature = normalizeText(object?.eventDetailsFeature).toLowerCase();
  if (explicitFeature === "ceremony" || explicitFeature === "party") {
    return explicitFeature;
  }
  const ownAssociation = normalizeText(object?.functionalAssociation).toLowerCase();
  if (ownAssociation === "ceremony" || ownAssociation === "party") {
    return ownAssociation;
  }
  const inheritedFeature = normalizeText(
    associationOwner?.eventDetailsFeature
  ).toLowerCase();
  if (inheritedFeature === "ceremony" || inheritedFeature === "party") {
    return inheritedFeature;
  }
  const inheritedAssociation = normalizeText(
    associationOwner?.functionalAssociation
  ).toLowerCase();
  return inheritedAssociation === "party" ? "party" : "ceremony";
}

function collectImplicitFieldCandidates({ fields, fieldKeys, objectIndex }) {
  const fieldByRole = new Map();
  asArray(fields).forEach((field) => {
    const role = resolveEventDetailsRole(field);
    if (role) fieldByRole.set(`${role.feature}:${role.role}`, field);
  });
  const countdownIdsByFeature = new Map([
    ["ceremony", new Set()],
    ["party", new Set()],
  ]);
  ["ceremony", "party"].forEach((feature) => {
    const dateField = fieldByRole.get(`${feature}:date`);
    if (!isCountdownDateField(dateField)) return;
    asArray(dateField?.applyTargets).forEach((rawTarget) => {
      const target = normalizeTarget(rawTarget);
      const record = target ? objectIndex.recordsById.get(target.id) : null;
      if (
        target &&
        normalizeText(target.path).toLowerCase() === "fechaobjetivo" &&
        normalizeText(record?.object?.tipo).toLowerCase() === "countdown"
      ) {
        countdownIdsByFeature.get(feature).add(target.id);
      }
    });
  });

  const requestedFieldKeys = new Set(fieldKeys);
  const candidates = [];
  asArray(fields).forEach((field) => {
    const fieldKey = normalizeText(field?.key);
    if (!requestedFieldKeys.has(fieldKey)) return;
    const role = resolveEventDetailsRole(field);
    if (!role) return;

    if (role.role === "venue_name" || role.role === "venue_address") {
      objectIndex.orderedRecords.forEach((record) => {
        if (normalizeText(record.object?.tipo).toLowerCase() !== "mapa-google") return;
        if (
          resolveObjectEventDetailsFeature(
            record.object,
            record.parentGroup || record.rootObject
          ) !== role.feature
        ) return;
        candidates.push({
          field,
          fieldKey,
          target: null,
          object: record.object,
          objectId: record.objectId,
          rootObject: record.rootObject,
          rootObjectId: record.rootObjectId,
          targetIndex: -1,
          objectOrder: record.objectOrder,
          isTextualTarget: false,
          hidden: isCandidateHidden(record),
          implicit: true,
          representationKind: "event-map",
        });
      });
      return;
    }

    if (role.role === "start_time") {
      countdownIdsByFeature.get(role.feature)?.forEach((countdownId) => {
        const record = objectIndex.recordsById.get(countdownId);
        if (!record) return;
        candidates.push({
          field,
          fieldKey,
          target: null,
          object: record.object,
          objectId: record.objectId,
          rootObject: record.rootObject,
          rootObjectId: record.rootObjectId,
          targetIndex: -1,
          objectOrder: record.objectOrder,
          isTextualTarget: false,
          hidden: isCandidateHidden(record),
          implicit: true,
          representationKind: "countdown",
        });
      });
    }
  });
  return candidates;
}

function mergeHiddenObjectIds({
  objetos,
  secciones,
  hiddenObjectIds,
  rsvp,
  gifts,
  eventDetails,
}) {
  const merged = new Set(asArray(hiddenObjectIds).map(normalizeText).filter(Boolean));
  if (!asArray(secciones).length) return Array.from(merged);
  const renderState = applyFunctionalAssociationsToRenderState({
    objetos,
    secciones,
    rsvp,
    gifts,
    eventDetails,
    materializeOffsets: false,
  });
  asArray(renderState?.hiddenObjectIds).forEach((objectId) => {
    const safeId = normalizeText(objectId);
    if (safeId) merged.add(safeId);
  });
  return Array.from(merged);
}

function representationMatchesKind(representation, kind) {
  const normalizedKind = normalizeRestoreKind(kind);
  if (!normalizedKind) return true;
  return (
    normalizeRestoreKind(representation?.object?.tipo) === normalizedKind ||
    normalizeRestoreKind(representation?.representationKind) === normalizedKind
  );
}

export function resolveDynamicFieldVisualStatus({
  fieldsSchema,
  fieldKey,
  fieldKeys,
  objetos,
  secciones,
  hiddenObjectIds,
  rsvp,
  gifts,
  eventDetails,
  kind,
  detachedVisuals,
} = {}) {
  const keys = normalizeFieldKeys(
    fieldKeys === undefined ? fieldKey : fieldKeys
  );
  const fields = asArray(fieldsSchema);
  const fieldByKey = new Map(
    fields
      .map((field) => [normalizeText(field?.key), field])
      .filter(([key]) => Boolean(key))
  );
  const existingKeys = keys.filter((key) => fieldByKey.has(key));
  const resolvedFieldKey = existingKeys[0] || null;
  const objectIndex = buildRenderObjectIndex(
    objetos,
    mergeHiddenObjectIds({
      objetos,
      secciones,
      hiddenObjectIds,
      rsvp,
      gifts,
      eventDetails,
    })
  );
  const representations = [];

  existingKeys.forEach((candidateFieldKey) => {
    collectFieldCandidates({
      field: fieldByKey.get(candidateFieldKey),
      fieldKey: candidateFieldKey,
      objectIndex,
      visibleOnly: false,
    }).forEach((candidate) => representations.push(candidate));
  });
  collectImplicitFieldCandidates({
    fields,
    fieldKeys: existingKeys,
    objectIndex,
  }).forEach((candidate) => {
    const duplicate = representations.some(
      (representation) =>
        representation.fieldKey === candidate.fieldKey &&
        representation.objectId === candidate.objectId &&
        representation.representationKind === candidate.representationKind
    );
    if (!duplicate) representations.push(candidate);
  });

  const filteredRepresentations = representations
    .filter((representation) => representationMatchesKind(representation, kind))
    .sort((left, right) => {
      if (left.objectOrder !== right.objectOrder) {
        return left.objectOrder - right.objectOrder;
      }
      return left.targetIndex - right.targetIndex;
    });
  const liveObjectIds = [];
  const liveRootObjectIds = [];
  const seenObjectIds = new Set();
  const seenRootObjectIds = new Set();
  filteredRepresentations.forEach((representation) => {
    if (!seenObjectIds.has(representation.objectId)) {
      seenObjectIds.add(representation.objectId);
      liveObjectIds.push(representation.objectId);
    }
    if (!seenRootObjectIds.has(representation.rootObjectId)) {
      seenRootObjectIds.add(representation.rootObjectId);
      liveRootObjectIds.push(representation.rootObjectId);
    }
  });
  const visibleRepresentations = filteredRepresentations.filter(
    (representation) => !representation.hidden
  );
  const status = visibleRepresentations.length > 0
    ? "visible"
    : filteredRepresentations.length > 0
      ? "hidden"
      : "absent";
  const visibleObjectIds = new Set(
    visibleRepresentations.map((representation) => representation.objectId)
  );
  const recoverableEntry = cloneDetachedVisualsState(detachedVisuals).entries
    .filter((entry) => {
      const entryKeys = new Set(normalizeEntryFieldKeys(entry));
      return existingKeys.some((key) => entryKeys.has(key));
    })
    .filter((entry) => entryMatchesKind(entry, kind))
    .sort((left, right) =>
      toFiniteInteger(right?.sequence, 0) - toFiniteInteger(left?.sequence, 0)
    )[0] || null;
  const recoverableEntryKeys = normalizeEntryFieldKeys(recoverableEntry);
  const recoverableTargetFieldKey = asArray(recoverableEntry?.targets)
    .map((record) => normalizeText(record?.fieldKey))
    .find((key) => existingKeys.includes(key));
  const restoreFieldKey =
    recoverableTargetFieldKey ||
    recoverableEntryKeys.find((key) => existingKeys.includes(key)) ||
    resolvedFieldKey;

  return {
    status,
    state: status,
    fieldKey: resolvedFieldKey,
    fieldKeys: existingKeys,
    objectIds: liveObjectIds,
    rootObjectIds: liveRootObjectIds,
    firstRootObjectId: liveRootObjectIds[0] || null,
    representations: filteredRepresentations,
    visibleRepresentations,
    linkedCount: liveObjectIds.length,
    visibleCount: visibleObjectIds.size,
    canRestore: Boolean(resolvedFieldKey) && status === "absent",
    hasRecoverableVisual: Boolean(recoverableEntry),
    recoverableEntryId: normalizeText(recoverableEntry?.id) || null,
    restoreFieldKey: restoreFieldKey || null,
  };
}

export function resolveDynamicTextFieldForObject({ fieldsSchema, objectId } = {}) {
  const safeObjectId = normalizeText(objectId);
  if (!safeObjectId) return null;

  for (const field of asArray(fieldsSchema)) {
    const fieldKey = normalizeText(field?.key);
    if (!fieldKey) continue;
    for (const rawTarget of asArray(field?.applyTargets)) {
      const target = normalizeTarget(rawTarget);
      if (!target || target.id !== safeObjectId) continue;
      if (!isTextualTemplateTargetPath(target.path)) continue;
      return { fieldKey, target: deepClone(rawTarget) };
    }
  }
  return null;
}

function toPositiveInteger(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  return Math.max(1, Math.round(numeric));
}

function resolveDynamicInlineCanonicalValue({ fieldKey, values, defaults }) {
  const safeValues = asObject(values);
  const safeDefaults = asObject(defaults);
  return Object.prototype.hasOwnProperty.call(safeValues, fieldKey)
    ? safeValues[fieldKey]
    : safeDefaults[fieldKey];
}

export function normalizeDynamicInlineFieldValue({ descriptor, field, value } = {}) {
  const source = asObject(descriptor);
  const safeField = Object.keys(asObject(field)).length ? asObject(field) : source;
  const fieldType = normalizeText(
    source.fieldType || safeField.type || "text"
  ).toLowerCase();
  const eventDetailsRole = normalizeText(
    source.eventDetailsRole || safeField.eventDetailsRole
  ).toLowerCase();
  const eventDetailsFormat = normalizeText(
    source.eventDetailsFormat || safeField.eventDetailsFormat
  ).toLowerCase();
  const maxLength = toPositiveInteger(
    source.maxLength || asObject(safeField.validation).maxLength
  );

  if (source.controlKind === "datetime-local") {
    return normalizeTemplateInputValueForFieldType("datetime", value);
  }
  if (source.controlKind === "date") {
    return normalizeTemplateInputValueForFieldType("date", value);
  }
  if (fieldType === "date" || fieldType === "datetime") {
    return normalizeTemplateInputValueForFieldType(fieldType, value);
  }
  if (fieldType === "time") return normalizeText(value);

  let nextValue = String(value ?? "").replace(/\r\n?/g, "\n");
  const allowsCoupleLinebreak =
    eventDetailsRole === "couple_names" && eventDetailsFormat === "linebreak";
  const multiline = fieldType === "textarea" || allowsCoupleLinebreak;

  if (allowsCoupleLinebreak) {
    const lines = nextValue.split(/\n+/);
    if (lines.length > 1) {
      nextValue = `${lines.shift()}\n${lines.join(" ").replace(/\s+/g, " ")}`;
    }
  } else if (!multiline) {
    nextValue = nextValue.replace(/\s*\n+\s*/g, " ");
  }

  return maxLength ? nextValue.slice(0, maxLength) : nextValue;
}

export function resolveDynamicTextInlineEditDescriptor({
  fieldsSchema,
  values,
  defaults,
  objectId,
} = {}) {
  const binding = resolveDynamicTextFieldForObject({ fieldsSchema, objectId });
  if (!binding?.fieldKey) return null;

  const field = asArray(fieldsSchema).find(
    (candidate) => normalizeText(candidate?.key) === binding.fieldKey
  );
  if (!field) return null;

  const fieldType = normalizeText(field.type || "text").toLowerCase();
  if (!DYNAMIC_INLINE_FIELD_TYPES.has(fieldType)) return null;

  const eventDetailsRole = normalizeText(field.eventDetailsRole).toLowerCase();
  const eventDetailsFormat = normalizeText(field.eventDetailsFormat).toLowerCase();
  const multiline =
    fieldType === "textarea" ||
    (eventDetailsRole === "couple_names" && eventDetailsFormat === "linebreak");
  const maxLength = toPositiveInteger(asObject(field.validation).maxLength);
  const targetTransform = isDateLikeTemplateFieldType(fieldType)
    ? resolveEffectiveTemplateTargetTransform({ field, target: binding.target })
    : null;
  const dateTextFormatPreset =
    targetTransform?.kind === "date_to_text" ? targetTransform.preset : null;
  const includesTime = Boolean(
    dateTextFormatPreset &&
      dateTextFormatPresetIncludesTime(dateTextFormatPreset)
  );
  const eventDateParts = isDateLikeTemplateFieldType(fieldType)
    ? resolveEventDateAuthoringParts({
        field,
        fieldsSchema,
        values,
        defaults,
      })
    : null;
  const controlKind = isDateLikeTemplateFieldType(fieldType)
    ? (includesTime ? "datetime-local" : "date")
    : (fieldType === "time" ? "time" : "text");
  const descriptor = {
    fieldKey: binding.fieldKey,
    fieldType,
    label: normalizeText(field.label || field.key),
    eventDetailsRole: eventDetailsRole || null,
    eventDetailsFormat: eventDetailsFormat || null,
    target: binding.target,
    controlKind,
    dateTextFormatPreset,
    includesTime,
    openOnSelect: controlKind === "date" || controlKind === "datetime-local",
    eventDetailsFeature: eventDateParts?.feature || null,
    eventStartTimeFieldKey: eventDateParts?.startTimeFieldKey || null,
    multiline,
    maxLength,
  };

  const canonicalValue = eventDateParts
    ? buildEventDateInlineControlValue({
        date: eventDateParts.date,
        time: eventDateParts.time,
        includeTime: includesTime,
      })
    : resolveDynamicInlineCanonicalValue({
        fieldKey: binding.fieldKey,
        values,
        defaults,
      });

  return {
    ...descriptor,
    value: normalizeDynamicInlineFieldValue({
      descriptor,
      value: canonicalValue,
    }),
  };
}

export function resolveDynamicFieldScrollTarget({
  fieldsSchema,
  fieldKeys,
  objetos,
  hiddenObjectIds,
} = {}) {
  const keys = normalizeFieldKeys(fieldKeys);
  if (!keys.length) return null;

  const fields = asArray(fieldsSchema);
  const fieldByKey = new Map(
    fields
      .map((field) => [normalizeText(field?.key), field])
      .filter(([key]) => Boolean(key))
  );
  const objectIndex = buildRenderObjectIndex(objetos, hiddenObjectIds);

  for (const candidateFieldKey of keys) {
    const field = fieldByKey.get(candidateFieldKey);
    if (!field) continue;
    const candidates = collectFieldCandidates({
      field,
      fieldKey: candidateFieldKey,
      objectIndex,
    });
    if (!candidates.length) continue;

    candidates.sort((left, right) => {
      if (left.isTextualTarget !== right.isTextualTarget) {
        return left.isTextualTarget ? -1 : 1;
      }
      if (left.objectOrder !== right.objectOrder) {
        return left.objectOrder - right.objectOrder;
      }
      return left.targetIndex - right.targetIndex;
    });
    return candidates[0];
  }
  return null;
}

function cloneDetachedVisualsState(value) {
  const source = asObject(value);
  const entries = asArray(source.entries)
    .filter((entry) => entry && typeof entry === "object" && !Array.isArray(entry))
    .map((entry) => deepClone(entry));
  const maxSequence = entries.reduce(
    (max, entry) => Math.max(max, toFiniteInteger(entry?.sequence, 0)),
    0
  );
  return {
    version: DETACHED_VISUALS_VERSION,
    nextSequence: Math.max(
      1,
      maxSequence + 1,
      toFiniteInteger(source.nextSequence, 1)
    ),
    entries,
  };
}

function splitObjectPath(path) {
  return normalizeText(path)
    .match(/[^.[\]]+/g)
    ?.map((part) => part.replace(/^['"]|['"]$/g, ""))
    .filter(Boolean) || [];
}

function emptyValueFor(currentValue) {
  if (Array.isArray(currentValue)) return [];
  if (typeof currentValue === "boolean") return false;
  if (typeof currentValue === "number") return null;
  if (currentValue && typeof currentValue === "object") return {};
  return "";
}

function clearObjectPath(object, path) {
  const parts = splitObjectPath(path);
  if (!parts.length) return;
  let cursor = object;
  for (let index = 0; index < parts.length - 1; index += 1) {
    const part = parts[index];
    if (!cursor?.[part] || typeof cursor[part] !== "object") return;
    cursor = cursor[part];
  }
  const leaf = parts[parts.length - 1];
  cursor[leaf] = emptyValueFor(cursor[leaf]);
}

function stripGalleryValues(object) {
  if (!Array.isArray(object?.cells)) return;
  object.cells = object.cells.map((rawCell) => {
    const nextCell = { ...asObject(rawCell), mediaUrl: null };
    ["url", "src", "storagePath", "assetId", "downloadUrl", "imageUrl"].forEach(
      (key) => {
        if (Object.prototype.hasOwnProperty.call(nextCell, key)) delete nextCell[key];
      }
    );
    if (Object.prototype.hasOwnProperty.call(nextCell, "occupied")) {
      nextCell.occupied = false;
    }
    return nextCell;
  });
}

function stripMapProjection(object) {
  object.googlePlaceId = "";
  object.googleDisplayName = "";
  object.googleFormattedAddress = "";
  object.googleAddressComponents = [];
  object.googleLat = null;
  object.googleLng = null;
  if (Object.prototype.hasOwnProperty.call(object, "googlePlace")) {
    object.googlePlace = null;
  }
}

function stripCountdownTarget(object) {
  object.fechaObjetivo = "";
  object.targetISO = "";
  object.fechaISO = "";
}

function stripTargetValues(object, targets) {
  const nextObject = deepClone(object);
  const objectType = normalizeText(nextObject?.tipo).toLowerCase();
  if (GALLERY_OBJECT_TYPES.has(objectType)) {
    stripGalleryValues(nextObject);
  } else {
    asArray(targets).forEach(({ target }) => clearObjectPath(nextObject, target?.path));
  }
  if (objectType === "mapa-google") stripMapProjection(nextObject);
  if (objectType === "countdown") stripCountdownTarget(nextObject);
  return nextObject;
}

function buildTargetIdentity(target) {
  const safeTarget = asObject(target);
  return [
    normalizeText(safeTarget.scope).toLowerCase(),
    normalizeText(safeTarget.id),
    normalizeText(safeTarget.path),
    normalizeText(safeTarget.mode).toLowerCase() || "set",
    JSON.stringify(asObject(safeTarget.transform)),
  ].join("|");
}

function normalizeEntryFieldKeys(entry) {
  return normalizeFieldKeys([
    ...asArray(entry?.fieldKeys),
    ...asArray(entry?.targets).map((record) => record?.fieldKey),
  ]);
}

function removeFieldsFromDetachedEntries(entries, fieldKeys) {
  const removedKeys = new Set(fieldKeys);
  return asArray(entries).reduce((nextEntries, entry) => {
    const nextTargets = asArray(entry?.targets).filter(
      (record) => !removedKeys.has(normalizeText(record?.fieldKey))
    );
    const nextFieldKeys = normalizeEntryFieldKeys(entry).filter(
      (key) => !removedKeys.has(key)
    );
    if (!nextFieldKeys.length) return nextEntries;
    nextEntries.push({ ...entry, fieldKeys: nextFieldKeys, targets: nextTargets });
    return nextEntries;
  }, []);
}

function createDetachedEntryId(sequence, objectId, existingIds) {
  const base = `detached-${sequence}-${normalizeText(objectId) || "visual"}`;
  if (!existingIds.has(base)) return base;
  let suffix = 2;
  while (existingIds.has(`${base}-${suffix}`)) suffix += 1;
  return `${base}-${suffix}`;
}

export function planDynamicFieldVisualDeletion({
  fieldsSchema,
  objetos,
  secciones,
  selectedRootIds,
  detachedVisuals,
  alturaPantalla = 500,
} = {}) {
  const safeObjetos = asArray(objetos);
  const requestedIds = new Set(normalizeFieldKeys(selectedRootIds));
  const selectedRoots = safeObjetos
    .map((object, rootIndex) => ({ object, rootIndex }))
    .filter(({ object }) => requestedIds.has(normalizeText(object?.id)));
  const selectedRootIdsInOrder = selectedRoots
    .map(({ object }) => normalizeText(object?.id))
    .filter(Boolean);
  const selectedRootIdSet = new Set(selectedRootIdsInOrder);
  const selectedObjectRecords = new Map();

  selectedRoots.forEach(({ object: rootObject, rootIndex }) => {
    const rootId = normalizeText(rootObject?.id);
    const visit = (object, parentGroup = null, childIndex = null) => {
      const objectId = normalizeText(object?.id);
      if (objectId && !selectedObjectRecords.has(objectId)) {
        selectedObjectRecords.set(objectId, {
          object,
          objectId,
          rootObject,
          rootId,
          rootIndex,
          parentGroup,
          childIndex,
        });
      }
      asArray(object?.children).forEach((child, index) => visit(child, object, index));
    };
    visit(rootObject);
  });

  const targetsByObjectId = new Map();
  const implicitFieldKeysByObjectId = new Map();
  const affectedFieldKeys = [];
  const affectedFieldKeySet = new Set();
  const linkedVisualObjectIds = new Set();
  const addAffectedFieldKey = (fieldKey) => {
    const safeFieldKey = normalizeText(fieldKey);
    if (!safeFieldKey || affectedFieldKeySet.has(safeFieldKey)) return;
    affectedFieldKeySet.add(safeFieldKey);
    affectedFieldKeys.push(safeFieldKey);
  };
  let targetCount = 0;
  let fieldsChanged = false;
  const visualFieldKeysByFieldKey = new Map(
    asArray(fieldsSchema)
      .map((field) => {
        const fieldKey = normalizeText(field?.key);
        if (!fieldKey) return null;
        return [
          fieldKey,
          resolveEventPersonNameVisualFieldKeys({ field, fieldsSchema }),
        ];
      })
      .filter(Boolean)
  );
  const nextFieldsSchema = asArray(fieldsSchema).map((field) => {
    const fieldKey = normalizeText(field?.key);
    const targets = asArray(field?.applyTargets);
    const nextTargets = targets.filter((rawTarget) => {
      const target = normalizeTarget(rawTarget);
      if (!target || !selectedObjectRecords.has(target.id)) return true;
      targetCount += 1;
      addAffectedFieldKey(fieldKey);
      linkedVisualObjectIds.add(target.id);
      if (!targetsByObjectId.has(target.id)) targetsByObjectId.set(target.id, []);
      targetsByObjectId.get(target.id).push({ fieldKey, target: deepClone(rawTarget) });
      return false;
    });
    if (nextTargets.length === targets.length) return field;
    fieldsChanged = true;
    return { ...field, applyTargets: nextTargets };
  });
  const fullObjectIndex = buildRenderObjectIndex(safeObjetos);
  collectImplicitFieldCandidates({
    fields: asArray(fieldsSchema),
    fieldKeys: asArray(fieldsSchema).map((field) => normalizeText(field?.key)),
    objectIndex: fullObjectIndex,
  }).forEach((candidate) => {
    if (!selectedObjectRecords.has(candidate.objectId)) return;
    addAffectedFieldKey(candidate.fieldKey);
    linkedVisualObjectIds.add(candidate.objectId);
    if (!implicitFieldKeysByObjectId.has(candidate.objectId)) {
      implicitFieldKeysByObjectId.set(candidate.objectId, []);
    }
    const fieldKeys = implicitFieldKeysByObjectId.get(candidate.objectId);
    if (!fieldKeys.includes(candidate.fieldKey)) fieldKeys.push(candidate.fieldKey);
  });

  const nextObjetos = selectedRootIdSet.size
    ? safeObjetos.filter(
        (object) => !selectedRootIdSet.has(normalizeText(object?.id))
      )
    : safeObjetos;
  const nextDetachedVisuals = cloneDetachedVisualsState(detachedVisuals);
  const existingEntryIds = new Set(
    nextDetachedVisuals.entries.map((entry) => normalizeText(entry?.id)).filter(Boolean)
  );
  const addedEntryIds = [];
  let visualCount = 0;

  selectedObjectRecords.forEach((record, objectId) => {
    const targetRecords = targetsByObjectId.get(objectId) || [];
    const implicitFieldKeys = implicitFieldKeysByObjectId.get(objectId) || [];
    if (!targetRecords.length && !implicitFieldKeys.length) return;
    const archivedObject = record.parentGroup
      ? materializeGroupChildAsRoot({
          group: record.parentGroup,
          child: record.object,
          secciones,
          alturaPantalla,
        })
      : deepClone(record.object);
    if (!archivedObject) return;

    const fieldKeys = normalizeFieldKeys(
      [
        ...targetRecords.flatMap(
          (targetRecord) =>
            visualFieldKeysByFieldKey.get(targetRecord.fieldKey) || [targetRecord.fieldKey]
        ),
        ...implicitFieldKeys,
      ]
    );
    nextDetachedVisuals.entries = removeFieldsFromDetachedEntries(
      nextDetachedVisuals.entries,
      fieldKeys
    );
    const sequence = nextDetachedVisuals.nextSequence;
    nextDetachedVisuals.nextSequence += 1;
    const entryId = createDetachedEntryId(sequence, objectId, existingEntryIds);
    existingEntryIds.add(entryId);
    addedEntryIds.push(entryId);
    visualCount += 1;
    nextDetachedVisuals.entries.push({
      id: entryId,
      sequence,
      fieldKeys,
      object: stripTargetValues(archivedObject, targetRecords),
      targets: targetRecords,
      source: {
        kind:
          normalizeText(archivedObject?.tipo).toLowerCase() === "mapa-google"
            ? "event-map"
            : record.parentGroup
              ? "group-child"
              : "root",
        rootId: record.rootId,
        rootIndex: record.rootIndex,
        ...(record.parentGroup && Number.isFinite(record.childIndex)
          ? { childIndex: record.childIndex }
          : {}),
        sectionId:
          normalizeText(archivedObject?.seccionId) ||
          normalizeText(record.rootObject?.seccionId) ||
          null,
      },
    });
  });

  return {
    nextObjetos,
    nextFieldsSchema: fieldsChanged ? nextFieldsSchema : asArray(fieldsSchema),
    nextDetachedVisuals,
    affected: {
      selectedRootIds: selectedRootIdsInOrder,
      fieldKeys: affectedFieldKeys,
      targetCount,
      visualCount,
      linkedVisualCount: linkedVisualObjectIds.size,
      entryIds: addedEntryIds,
      hasLinkedTargets: targetCount > 0,
      hasLinkedVisuals: linkedVisualObjectIds.size > 0,
    },
  };
}

function normalizeRestoreKind(value) {
  const normalized = normalizeText(value).toLowerCase();
  if (["text", "texto", "textual"].includes(normalized)) return "texto";
  if (["map", "event-map", "mapa", "mapa-google"].includes(normalized)) {
    return "mapa-google";
  }
  if (["gallery", "galeria"].includes(normalized)) return "galeria";
  return normalized;
}

function entryMatchesKind(entry, kind) {
  const normalizedKind = normalizeRestoreKind(kind);
  if (!normalizedKind) return true;
  return (
    normalizeRestoreKind(entry?.object?.tipo) === normalizedKind ||
    normalizeRestoreKind(entry?.source?.kind) === normalizedKind
  );
}

function resolveSectionId({ object, source, secciones, activeSection }) {
  const sectionIds = new Set(
    asArray(secciones).map((section) => normalizeText(section?.id)).filter(Boolean)
  );
  const originalSectionId =
    normalizeText(object?.seccionId) || normalizeText(source?.sectionId);
  if (originalSectionId && sectionIds.has(originalSectionId)) return originalSectionId;
  const activeSectionId = normalizeText(
    typeof activeSection === "string" ? activeSection : activeSection?.id
  );
  if (activeSectionId && sectionIds.has(activeSectionId)) return activeSectionId;
  return asArray(secciones)
    .map((section) => normalizeText(section?.id))
    .find(Boolean) || originalSectionId || activeSectionId || "";
}

function collectObjectIds(object, output = []) {
  if (!object || typeof object !== "object" || Array.isArray(object)) return output;
  const objectId = normalizeText(object.id);
  if (objectId) output.push(objectId);
  asArray(object.children).forEach((child) => collectObjectIds(child, output));
  return output;
}

function createAvailableObjectId({ originalId, existingIds, createObjectId, object, context }) {
  if (originalId && !existingIds.has(originalId)) return originalId;
  const requestedId = normalizeText(
    typeof createObjectId === "function"
      ? createObjectId(originalId, object, context)
      : ""
  );
  if (requestedId && !existingIds.has(requestedId)) return requestedId;
  const base = `${originalId || normalizeText(object?.tipo) || "obj"}-restored`;
  if (!existingIds.has(base)) return base;
  let suffix = 2;
  while (existingIds.has(`${base}-${suffix}`)) suffix += 1;
  return `${base}-${suffix}`;
}

function cloneObjectWithAvailableIds(object, existingIds, createObjectId) {
  const idRemap = {};
  const clone = (current, context) => {
    const nextObject = deepClone(current);
    const originalId = normalizeText(current?.id);
    const nextId = createAvailableObjectId({
      originalId,
      existingIds,
      createObjectId,
      object: current,
      context,
    });
    if (nextId) {
      nextObject.id = nextId;
      existingIds.add(nextId);
      if (originalId) idRemap[originalId] = nextId;
    }
    if (Array.isArray(current?.children)) {
      nextObject.children = current.children.map((child, childIndex) =>
        clone(child, { parentObjectId: nextId, childIndex })
      );
    }
    return nextObject;
  };
  return {
    object: clone(object, { parentObjectId: null, childIndex: null }),
    idRemap,
  };
}

function appendExactTargets(fieldsSchema, targetRecords, idRemap) {
  const recordsByFieldKey = new Map();
  asArray(targetRecords).forEach((record) => {
    const fieldKey = normalizeText(record?.fieldKey);
    const target = asObject(record?.target);
    if (!fieldKey || !normalizeText(target.id)) return;
    if (!recordsByFieldKey.has(fieldKey)) recordsByFieldKey.set(fieldKey, []);
    recordsByFieldKey.get(fieldKey).push({
      ...deepClone(target),
      id: idRemap[normalizeText(target.id)] || normalizeText(target.id),
    });
  });

  return asArray(fieldsSchema).map((field) => {
    const additions = recordsByFieldKey.get(normalizeText(field?.key)) || [];
    if (!additions.length) return field;
    const existingTargets = asArray(field?.applyTargets);
    const identities = new Set(existingTargets.map(buildTargetIdentity));
    const nextTargets = [...existingTargets];
    additions.forEach((target) => {
      const identity = buildTargetIdentity(target);
      if (identities.has(identity)) return;
      identities.add(identity);
      nextTargets.push(target);
    });
    return { ...field, applyTargets: nextTargets };
  });
}

export function restoreDynamicFieldVisual({
  fieldKey,
  kind,
  representationKind,
  fieldsSchema,
  objetos,
  secciones,
  detachedVisuals,
  activeSection,
  defaultObject,
  defaultTarget,
  createObjectId,
} = {}) {
  const safeFieldKey = normalizeText(fieldKey);
  const requestedRestoreKind =
    normalizeText(representationKind).toLowerCase() === "auto"
      ? kind || ""
      : representationKind || kind;
  const safeFieldsSchema = asArray(fieldsSchema);
  const safeObjetos = asArray(objetos);
  const normalizedDetached = cloneDetachedVisualsState(detachedVisuals);
  const field = safeFieldsSchema.find(
    (candidate) => normalizeText(candidate?.key) === safeFieldKey
  );
  if (!field) {
    return {
      nextObjetos: safeObjetos,
      nextFieldsSchema: safeFieldsSchema,
      nextDetachedVisuals: normalizedDetached,
      restoredRootId: null,
      reason: "field-missing",
    };
  }

  const status = resolveDynamicFieldVisualStatus({
    fieldsSchema: safeFieldsSchema,
    fieldKey: safeFieldKey,
    objetos: safeObjetos,
    kind: requestedRestoreKind,
  });
  if (status.status !== "absent") {
    return {
      nextObjetos: safeObjetos,
      nextFieldsSchema: safeFieldsSchema,
      nextDetachedVisuals: normalizedDetached,
      restoredRootId: null,
      reason: "field-already-linked",
    };
  }

  const recoveryEntry = [...normalizedDetached.entries]
    .filter(
      (entry) =>
        normalizeEntryFieldKeys(entry).includes(safeFieldKey) &&
        entryMatchesKind(entry, requestedRestoreKind)
    )
    .sort((left, right) =>
      toFiniteInteger(right?.sequence, 0) - toFiniteInteger(left?.sequence, 0)
    )[0] || null;
  const fallbackTargetRecords = defaultTarget
    ? [{ fieldKey: safeFieldKey, target: deepClone(defaultTarget) }]
    : [];
  const sourceObject = recoveryEntry?.object || defaultObject || null;
  const targetRecords = recoveryEntry?.targets || fallbackTargetRecords;
  const restoresImplicitMap =
    normalizeRestoreKind(requestedRestoreKind) === "mapa-google" ||
    normalizeRestoreKind(recoveryEntry?.source?.kind) === "mapa-google" ||
    normalizeRestoreKind(sourceObject?.tipo) === "mapa-google";
  if (!sourceObject || (!asArray(targetRecords).length && !restoresImplicitMap)) {
    return {
      nextObjetos: safeObjetos,
      nextFieldsSchema: safeFieldsSchema,
      nextDetachedVisuals: normalizedDetached,
      restoredRootId: null,
      reason: "recovery-missing",
    };
  }

  const existingIds = new Set();
  safeObjetos.forEach((object) => {
    collectObjectIds(object).forEach((id) => existingIds.add(id));
  });
  const cloned = cloneObjectWithAvailableIds(sourceObject, existingIds, createObjectId);
  const sectionId = resolveSectionId({
    object: cloned.object,
    source: recoveryEntry?.source,
    secciones,
    activeSection,
  });
  if (sectionId) cloned.object.seccionId = sectionId;
  const requestedIndex = recoveryEntry
    ? toFiniteInteger(recoveryEntry?.source?.rootIndex, safeObjetos.length)
    : safeObjetos.length;
  const insertionIndex = Math.max(0, Math.min(requestedIndex, safeObjetos.length));
  const nextObjetos = [
    ...safeObjetos.slice(0, insertionIndex),
    cloned.object,
    ...safeObjetos.slice(insertionIndex),
  ];
  const nextFieldsSchema = appendExactTargets(
    safeFieldsSchema,
    targetRecords,
    cloned.idRemap
  );
  const nextDetachedVisuals = recoveryEntry
    ? {
        ...normalizedDetached,
        entries: normalizedDetached.entries.filter(
          (entry) => normalizeText(entry?.id) !== normalizeText(recoveryEntry.id)
        ),
      }
    : normalizedDetached;

  return {
    nextObjetos,
    nextFieldsSchema,
    nextDetachedVisuals,
    restoredRootId: normalizeText(cloned.object?.id) || null,
    restoredEntryId: normalizeText(recoveryEntry?.id) || null,
    idRemap: cloned.idRemap,
    reason: recoveryEntry ? "restored" : "default-inserted",
  };
}
