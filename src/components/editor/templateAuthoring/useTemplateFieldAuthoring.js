import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ensureDefaultsForSchema,
  ensureValuesForSchema,
  normalizeDetachedVisuals,
} from "../../../../shared/templates/contract.js";
import { collectGalleryMediaUrls } from "../../../../shared/templates/galleryDynamicLayout.js";
import {
  buildElementFieldIndex,
  buildFieldFromElement,
  deleteFieldIfOrphan,
  linkElementToField,
  resolveAuthoringTargetForElement,
  sanitizeAuthoringSchema,
  isSupportedAuthoringElementType,
  unlinkElementFromField,
  updateFieldConfig,
} from "@/domain/templates/authoring/model.js";
import {
  EVENT_PERSON_NAME_ROLES,
  buildEventPersonNameDefaults,
  collectEventPersonNameFields,
  ensureEventPersonNameFields,
  formatEventCoupleNames,
  getEventPersonNameFieldKey,
  inferEventCoupleNamesFormat,
  normalizeEventPersonNameRole,
  resolveEventCoupleNamesInlineEdit,
  resolveEventPersonNamesFromAuthoring,
  splitEventCoupleNamesText,
} from "@/domain/eventDetails/personNames.js";
import {
  EVENT_LOCATION_ROLES,
  buildEventGoogleMapClearPatch,
  buildEventLocationDefaults,
  buildEventGoogleMapInsertObject,
  buildEventGoogleMapProjectionPatches,
  collectEventLocationFields,
  ensureEventLocationFields,
  getEventLocationFieldKey,
  mergeEventDetailsValueMetadata,
  normalizeEventLocationRole,
  resolveEventLocationFieldFeature,
  resolveEventLocationFromAuthoring,
  setEventLocationProviderMetadata,
  updateEventAddressTextFormatInSchema,
} from "@/domain/eventDetails/location.js";
import {
  EVENT_TIME_ROLES,
  buildEventTimeDefaults,
  collectEventTimeFields,
  ensureEventTimeFields,
  getEventTimeFieldKey,
  normalizeEventTimeRole,
  normalizeEventTimeValue,
  resolveEventTimeFieldFeature,
  resolveEventTimesFromAuthoring,
} from "@/domain/eventDetails/time.js";
import {
  expandEventDateProjectionFieldKeys,
  ensureEventDateField,
  getEventDateFieldKey,
  isEventDateField,
  resolveEventDateTargetProjectionValue,
  resolveEventDateFieldFeature,
  splitEventDateInlineControlValue,
} from "@/domain/eventDetails/date.js";
import { normalizeEventDetailFeature } from "@/domain/eventDetails/features.js";
import {
  ensureDressCodeField,
  ensureStoryTextField,
  getDressCodeFieldKey,
  getStoryTextFieldKey,
} from "@/domain/templates/storyText.js";
import { validateAuthoringState } from "@/domain/templates/authoring/validation.js";
import {
  resolveTemplateAuthoringCapabilities,
} from "@/domain/templates/authoring/capabilities.js";
import {
  AUTHORING_DRAFT_VERSION,
  loadAuthoringState,
  saveAuthoringDraft,
} from "@/domain/templates/authoring/service.js";
import {
  buildTemplateAuthoringTargetPatches,
  resolveFieldValueFromLinkedCountdown,
  resolveFieldValueFromLinkedDateTargets,
  updateFieldDateTextFormatInSchema,
  updateFieldTargetDateTextFormatInSchema,
} from "@/domain/templates/authoring/targetApplication.js";
import { EDITOR_BRIDGE_EVENTS } from "@/lib/editorBridgeContracts";
import {
  buildDynamicGalleryObjectPatch,
  buildFixedGalleryObjectPatch,
} from "@/domain/templates/galleryDynamicMedia.js";
import {
  preserveRecoveredTextBoxLayout,
  restoreDynamicFieldVisual,
  normalizeDynamicInlineFieldValue,
  resolveDynamicFieldVisualStatus,
} from "@/domain/templates/dynamicFieldTargets.js";
import computeInsertDefaults from "@/components/editor/events/computeInsertDefaults.js";
import { updateRenderObjectById } from "@/domain/editor/renderObjectTree.js";
import { canInsertIntoSection } from "@/domain/editor/protectedSections.js";
import {
  buildDynamicCountdownProjectionPatches,
} from "@/domain/eventDetails/countdownEventDetails.js";
import { normalizeEventDetailsConfig } from "../../../../shared/eventDetailsConfig.js";
import {
  buildDynamicVisualHistoryState,
  hasDynamicVisualHistoryChange,
  restoreDynamicVisualHistorySlice,
} from "../history/historyState.js";

function normalizeText(value) {
  return String(value || "").trim();
}

function asObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value;
}

function isCountdownCompatibleFieldType(fieldType) {
  const safeType = normalizeText(fieldType).toLowerCase();
  return safeType === "date" || safeType === "datetime";
}

function isMediaAuthoringElementType(elementType) {
  const safeType = normalizeText(elementType).toLowerCase();
  return safeType === "imagen" || safeType === "galeria";
}

function areValuesMapsEqual(left, right) {
  try {
    return JSON.stringify(left || {}) === JSON.stringify(right || {});
  } catch {
    return false;
  }
}

function normalizeSelectedElementDefaultValue(value) {
  if (Array.isArray(value)) {
    return value
      .map((entry) => normalizeText(entry))
      .filter(Boolean);
  }
  return normalizeText(value);
}

function arePatchValuesEqual(left, right) {
  if (left === right) return true;
  const leftIsObject = left && typeof left === "object";
  const rightIsObject = right && typeof right === "object";
  if (!leftIsObject || !rightIsObject) return false;

  try {
    return JSON.stringify(left) === JSON.stringify(right);
  } catch {
    return false;
  }
}

function applyObjectPatches(objetos, patches) {
  let nextObjetos = Array.isArray(objetos) ? objetos : [];
  (Array.isArray(patches) ? patches : []).forEach(({ objectId, patch }) => {
    if (!objectId || !patch || typeof patch !== "object") return;
    const result = updateRenderObjectById(nextObjetos, objectId, (object) => ({
      ...object,
      ...patch,
    }));
    if (result.changed) nextObjetos = result.objetos;
  });
  return nextObjetos;
}

function normalizeRepresentationKind(value) {
  const kind = normalizeText(value).toLowerCase();
  if (["map", "event-map", "mapa", "mapa-google"].includes(kind)) return "map";
  if (["countdown", "contador"].includes(kind)) return "countdown";
  return "text";
}

function resolveFieldFunctionalAssociation(field) {
  const role = normalizeText(field?.eventDetailsRole).toLowerCase();
  if (role.startsWith("ceremony_")) return "ceremony";
  if (role.startsWith("party_")) return "party";
  if (role === "dress_code") return "dress_code";
  return null;
}

function buildCountdownStartTimeByFieldKey(fieldsSchema, values) {
  const safeFields = Array.isArray(fieldsSchema) ? fieldsSchema : [];
  const safeValues = asObject(values);
  const result = {};
  safeFields.forEach((field) => {
    const role = normalizeText(field?.eventDetailsRole).toLowerCase();
    if (role !== "ceremony_date" && role !== "party_date") return;
    const feature = role.startsWith("party_") ? "party" : "ceremony";
    const startField = safeFields.find(
      (candidate) =>
        normalizeText(candidate?.eventDetailsRole).toLowerCase() ===
        `${feature}_start_time`
    );
    const dateFieldKey = normalizeText(field?.key);
    if (!dateFieldKey) return;
    result[dateFieldKey] = safeValues[normalizeText(startField?.key)] || "";
  });
  return result;
}

function resolveFieldTargetForObject(field, objectId) {
  const safeObjectId = normalizeText(objectId);
  if (!safeObjectId) return null;
  const targets = Array.isArray(field?.applyTargets) ? field.applyTargets : [];
  return (
    targets.find(
      (target) =>
        normalizeText(target?.scope).toLowerCase() === "objeto" &&
        normalizeText(target?.id) === safeObjectId
    ) || null
  );
}

function buildSelectedMediaFieldEnhancement(field, selectedElementType, selectedTargetConfig) {
  const safeField = field && typeof field === "object" ? { ...field } : null;
  if (!safeField || !isMediaAuthoringElementType(selectedElementType)) return field;

  const nextValidation =
    safeField.validation && typeof safeField.validation === "object"
      ? { ...safeField.validation }
      : {};
  if (selectedElementType === "imagen") {
    nextValidation.maxItems = 1;
  } else if (!Number.isFinite(Number(nextValidation.maxItems)) || Number(nextValidation.maxItems) <= 0) {
    nextValidation.maxItems = 12;
  }

  return {
    ...safeField,
    type: "images",
    validation: nextValidation,
    helperText: normalizeText(safeField.helperText) || selectedTargetConfig?.helperText || undefined,
  };
}

function buildGalleryAuthoringPatch(galleryObject, shouldUseDynamicMedia) {
  if (!galleryObject || normalizeText(galleryObject?.tipo).toLowerCase() !== "galeria") {
    return null;
  }

  const mediaUrls = collectGalleryMediaUrls(galleryObject?.cells);
  const patch = shouldUseDynamicMedia
    ? buildDynamicGalleryObjectPatch({
        galleryObject,
        mediaUrls,
      })
    : buildFixedGalleryObjectPatch(galleryObject);

  const hasChanged = Object.entries(patch).some(
    ([key, value]) => !arePatchValuesEqual(galleryObject?.[key], value)
  );
  return hasChanged ? patch : null;
}

function collectRecoverableAuthoringIssues(issues) {
  return (Array.isArray(issues) ? issues : [])
    .map((issue) => normalizeText(issue))
    .filter(
      (issue) =>
        issue.includes(": sin applyTargets.") ||
        issue.includes("' no existe en objetos actuales.")
    );
}

function emptySnapshot() {
  return {
    version: AUTHORING_DRAFT_VERSION,
    sourceTemplateId: null,
    fieldsSchema: [],
    defaults: {},
    values: {},
    detachedVisuals: { version: 1, nextSequence: 1, entries: [] },
    templateInput: null,
    status: {
      isReady: true,
      issues: [],
    },
    updatedAt: null,
    updatedByUid: null,
  };
}

export default function useTemplateFieldAuthoring({
  enabled = false,
  canEditSchema = enabled,
  canUseFields = enabled,
  slug,
  editorSession = null,
  userId,
  objetos,
  secciones = [],
  selectedElement,
  draftMeta,
  onPatchObject = null,
  onReplaceObjects = null,
  eventDetailsConfig = null,
  onReplaceEventDetails = null,
  onSnapshotChange = null,
  enqueueDraftWrite = null,
  activeSectionId = null,
  hiddenObjectIds = [],
  normalizarAltoModo = null,
  ALTURA_PANTALLA_EDITOR = 500,
  suppressNextHistoryCapture = null,
  writable = true,
}) {
  const [snapshot, setSnapshot] = useState(() => emptySnapshot());
  const [loading, setLoading] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const lastLoadKeyRef = useRef("");
  const lastWriteRef = useRef(Promise.resolve());
  const saveCounterRef = useRef(0);
  const reloadInFlightRef = useRef(null);
  const autoRepairSignatureRef = useRef("");
  const latestAuthoringStateRef = useRef({
    snapshot: emptySnapshot(),
    objetos: [],
    secciones: [],
    eventDetails: normalizeEventDetailsConfig(null),
  });

  const safeObjetos = Array.isArray(objetos) ? objetos : [];
  const safeSecciones = Array.isArray(secciones) ? secciones : [];
  const selectedElementId = normalizeText(selectedElement?.id);
  const selectedElementType = normalizeText(selectedElement?.tipo).toLowerCase();
  const selectedIsSupportedElement = isSupportedAuthoringElementType(selectedElementType);
  const selectedTargetConfig = resolveAuthoringTargetForElement(selectedElement) || null;
  const selectedElementFieldPath = normalizeText(selectedTargetConfig?.path) || "";
  const selectedElementDefaultFieldType = normalizeText(selectedTargetConfig?.defaultType) || "text";
  const selectedElementDefaultValue = normalizeSelectedElementDefaultValue(
    selectedTargetConfig?.defaultValue
  );
  const sourceTemplateId =
    normalizeText(snapshot.sourceTemplateId) ||
    normalizeText(draftMeta?.plantillaId) ||
    null;

  const status = useMemo(
    () =>
      validateAuthoringState({
        fieldsSchema: snapshot.fieldsSchema,
        defaults: snapshot.defaults,
        objetos: safeObjetos,
      }),
    [snapshot.defaults, snapshot.fieldsSchema, safeObjetos]
  );

  const fieldsSchema = useMemo(
    () => (Array.isArray(snapshot.fieldsSchema) ? snapshot.fieldsSchema : []),
    [snapshot.fieldsSchema]
  );
  const defaults = useMemo(
    () => ensureDefaultsForSchema(fieldsSchema, snapshot.defaults),
    [fieldsSchema, snapshot.defaults]
  );
  const values = useMemo(
    () => ensureValuesForSchema(fieldsSchema, snapshot.values, defaults),
    [defaults, fieldsSchema, snapshot.values]
  );
  const detachedVisuals = useMemo(
    () => normalizeDetachedVisuals(snapshot.detachedVisuals, fieldsSchema),
    [fieldsSchema, snapshot.detachedVisuals]
  );

  useEffect(() => {
    latestAuthoringStateRef.current = {
      snapshot: {
        ...snapshot,
        fieldsSchema,
        defaults,
        values,
        detachedVisuals,
      },
      objetos: safeObjetos,
      secciones: safeSecciones,
      eventDetails: eventDetailsConfig,
    };
  }, [
    defaults,
    detachedVisuals,
    eventDetailsConfig,
    fieldsSchema,
    safeObjetos,
    safeSecciones,
    snapshot,
    values,
  ]);

  const fieldIndexByElementId = useMemo(
    () => buildElementFieldIndex(fieldsSchema),
    [fieldsSchema]
  );
  const selectedFieldKey = selectedElementId ? fieldIndexByElementId[selectedElementId] || "" : "";
  const selectedField =
    selectedFieldKey && Array.isArray(fieldsSchema)
      ? fieldsSchema.find((field) => normalizeText(field?.key) === selectedFieldKey) || null
      : null;

  const syncSelectedGalleryAuthoringState = useCallback(
    (nextFieldsSchema) => {
      if (typeof onPatchObject !== "function") return;
      if (selectedElementType !== "galeria" || !selectedElementId) return;

      const currentGallery =
        safeObjetos.find((objeto) => normalizeText(objeto?.id) === selectedElementId) || null;
      if (!currentGallery) return;

      const shouldUseDynamicMedia = (Array.isArray(nextFieldsSchema) ? nextFieldsSchema : []).some(
        (field) =>
          normalizeText(field?.type).toLowerCase() === "images" &&
          normalizeText(resolveFieldTargetForObject(field, selectedElementId)?.path).toLowerCase() ===
            "cells"
      );

      const patch = buildGalleryAuthoringPatch(currentGallery, shouldUseDynamicMedia);
      if (!patch) return;
      onPatchObject(selectedElementId, patch);
    },
    [onPatchObject, safeObjetos, selectedElementId, selectedElementType]
  );

  const hydrateSnapshot = useCallback(
    (incoming, objetosForValidation = latestAuthoringStateRef.current.objetos) => {
      const normalizedIncoming = asObject(incoming);
      const incomingFields = Array.isArray(normalizedIncoming.fieldsSchema)
        ? normalizedIncoming.fieldsSchema
        : [];
      const incomingDefaults = ensureDefaultsForSchema(incomingFields, normalizedIncoming.defaults);
      const incomingValues = ensureValuesForSchema(
        incomingFields,
        Object.prototype.hasOwnProperty.call(normalizedIncoming, "values")
          ? normalizedIncoming.values
          : normalizedIncoming?.templateInput?.values,
        incomingDefaults
      );
      const incomingDetachedVisuals = normalizeDetachedVisuals(
        normalizedIncoming.detachedVisuals,
        incomingFields
      );
      const nextStatus = validateAuthoringState({
        fieldsSchema: incomingFields,
        defaults: incomingDefaults,
        values: incomingValues,
        detachedVisuals: incomingDetachedVisuals,
        templateInput:
          normalizedIncoming.templateInput &&
          typeof normalizedIncoming.templateInput === "object"
            ? normalizedIncoming.templateInput
            : draftMeta?.templateInput || null,
        objetos: Array.isArray(objetosForValidation)
          ? objetosForValidation
          : [],
      });

      return {
        version: AUTHORING_DRAFT_VERSION,
        sourceTemplateId:
          normalizeText(normalizedIncoming.sourceTemplateId) ||
          normalizeText(sourceTemplateId) ||
          null,
        fieldsSchema: incomingFields,
        defaults: incomingDefaults,
        values: incomingValues,
        detachedVisuals: incomingDetachedVisuals,
        templateInput:
          normalizedIncoming.templateInput &&
          typeof normalizedIncoming.templateInput === "object"
            ? {
                ...normalizedIncoming.templateInput,
                values: incomingValues,
              }
            : draftMeta?.templateInput && typeof draftMeta.templateInput === "object"
              ? {
                  ...draftMeta.templateInput,
                  values: incomingValues,
                }
              : null,
        status: nextStatus,
        updatedAt: normalizedIncoming.updatedAt || null,
        updatedByUid: normalizeText(normalizedIncoming.updatedByUid) || null,
      };
    },
    [draftMeta?.templateInput, sourceTemplateId]
  );

  const persistSnapshot = useCallback(
    (nextSnapshot, options = {}) => {
      const safeSlug = normalizeText(slug);
      if (!enabled || !safeSlug) return Promise.resolve();

      saveCounterRef.current += 1;
      setSaving(true);

      const liveState = latestAuthoringStateRef.current;
      const renderObjects = Array.isArray(options.nextObjects)
        ? options.nextObjects
        : Array.isArray(liveState.objetos)
          ? liveState.objetos
          : [];
      const renderSections = Array.isArray(options.nextSections)
        ? options.nextSections
        : Array.isArray(liveState.secciones)
          ? liveState.secciones
          : [];
      const renderEventDetails =
        options.nextEventDetails && typeof options.nextEventDetails === "object"
          ? options.nextEventDetails
          : liveState.eventDetails && typeof liveState.eventDetails === "object"
            ? liveState.eventDetails
            : normalizeEventDetailsConfig(null);
      const payload = hydrateSnapshot(nextSnapshot, renderObjects);
      const renderPatch = {
        objetos: renderObjects,
        secciones: renderSections,
        eventDetails: renderEventDetails,
      };

      const write = () =>
        saveAuthoringDraft({
            slug: safeSlug,
            uid: userId,
            state: payload,
            templateId: sourceTemplateId || "",
            editorSession,
            renderPatch,
            reason: options.reason || "template-authoring",
          });
      const writePromise =
        typeof enqueueDraftWrite === "function"
          ? enqueueDraftWrite(write)
          : Promise.resolve().then(write);

      lastWriteRef.current = writePromise
        .catch((saveError) => {
          const message =
            saveError instanceof Error
              ? saveError.message
              : "No se pudo guardar la configuracion de campos dinamicos.";
          setError(message);
          throw saveError;
        })
        .finally(() => {
          saveCounterRef.current = Math.max(0, saveCounterRef.current - 1);
          if (saveCounterRef.current === 0) {
            setSaving(false);
          }
        });

      return lastWriteRef.current;
    },
    [
      editorSession,
      enabled,
      enqueueDraftWrite,
      hydrateSnapshot,
      slug,
      sourceTemplateId,
      userId,
    ]
  );

  const commitSnapshot = useCallback(
    async (nextPartial, options = {}) => {
      const nextObjects = Array.isArray(options.nextObjects)
        ? options.nextObjects
        : latestAuthoringStateRef.current.objetos;
      const nextSections = Array.isArray(options.nextSections)
        ? options.nextSections
        : latestAuthoringStateRef.current.secciones;
      const nextEventDetails = options.nextEventDetails ||
        latestAuthoringStateRef.current.eventDetails;
      const nextSnapshot = hydrateSnapshot(nextPartial, nextObjects);
      setError("");
      if (options.pessimistic !== true) {
        latestAuthoringStateRef.current = {
          snapshot: nextSnapshot,
          objetos: nextObjects,
          secciones: nextSections,
          eventDetails: nextEventDetails,
        };
        onSnapshotChange?.(nextSnapshot);
        setSnapshot(nextSnapshot);
        if (Array.isArray(options.nextObjects)) {
          if (options.excludeFromHistory === true) suppressNextHistoryCapture?.();
          onReplaceObjects?.(options.nextObjects);
        }
        if (options.nextEventDetails) onReplaceEventDetails?.(options.nextEventDetails);
      }
      await persistSnapshot(nextSnapshot, options);
      if (options.pessimistic === true) {
        latestAuthoringStateRef.current = {
          snapshot: nextSnapshot,
          objetos: nextObjects,
          secciones: nextSections,
          eventDetails: nextEventDetails,
        };
        onSnapshotChange?.(nextSnapshot);
        setSnapshot(nextSnapshot);
        if (Array.isArray(options.nextObjects)) {
          if (options.excludeFromHistory === true) suppressNextHistoryCapture?.();
          onReplaceObjects?.(options.nextObjects);
        }
        if (options.nextEventDetails) onReplaceEventDetails?.(options.nextEventDetails);
      }
      return nextSnapshot;
    },
    [
      hydrateSnapshot,
      onReplaceEventDetails,
      onReplaceObjects,
      onSnapshotChange,
      persistSnapshot,
      suppressNextHistoryCapture,
    ]
  );

  const reloadAvailableFields = useCallback(
    async ({ resetSnapshot = false, clearOnError = false } = {}) => {
      const safeSlug = normalizeText(slug);
      if (!enabled || !safeSlug) {
        const clearedSnapshot = emptySnapshot();
        latestAuthoringStateRef.current = {
          snapshot: clearedSnapshot,
          objetos: safeObjetos,
          secciones: safeSecciones,
          eventDetails: eventDetailsConfig,
        };
        setSnapshot(clearedSnapshot);
        setLoading(false);
        setHydrated(false);
        setSaving(false);
        setError("");
        return clearedSnapshot;
      }

      if (reloadInFlightRef.current) {
        return reloadInFlightRef.current;
      }

      const templateId = normalizeText(draftMeta?.plantillaId || "");
      if (resetSnapshot) {
        setSnapshot(emptySnapshot());
      }
      setLoading(true);
      setHydrated(false);
      setError("");

      const reloadPromise = lastWriteRef.current
        .catch(() => {})
        .then(() =>
          loadAuthoringState({
            slug: safeSlug,
            templateId,
            editorSession,
            preloadedDraft: null,
            persistMigration: writable,
            enqueueDraftWrite,
            uid: userId,
          })
        )
        .then((loaded) => {
          const nextSnapshot = hydrateSnapshot(loaded);
          latestAuthoringStateRef.current = {
            snapshot: nextSnapshot,
            objetos: safeObjetos,
            secciones: safeSecciones,
            eventDetails: loaded?.eventDetails || eventDetailsConfig,
          };
          setSnapshot(nextSnapshot);
          setHydrated(true);
          if (loaded?.migration?.applied && loaded?.eventDetails) {
            onReplaceEventDetails?.(loaded.eventDetails);
          }
          return nextSnapshot;
        })
        .catch((loadError) => {
          const message =
            loadError instanceof Error
              ? loadError.message
              : "No se pudo cargar el authoring de la plantilla.";
          setError(message);
          if (clearOnError) {
            setSnapshot(emptySnapshot());
          }
          setHydrated(false);
          throw loadError;
        })
        .finally(() => {
          setLoading(false);
          reloadInFlightRef.current = null;
        });

      reloadInFlightRef.current = reloadPromise;
      return reloadPromise;
    },
    [
      draftMeta,
      editorSession,
      enabled,
      enqueueDraftWrite,
      hydrateSnapshot,
      eventDetailsConfig,
      onReplaceEventDetails,
      safeObjetos,
      safeSecciones,
      slug,
      userId,
      writable,
    ]
  );

  useEffect(() => {
    const safeSlug = normalizeText(slug);
    if (!enabled || !safeSlug) {
      const clearedSnapshot = emptySnapshot();
      latestAuthoringStateRef.current = {
        snapshot: clearedSnapshot,
        objetos: safeObjetos,
        secciones: safeSecciones,
        eventDetails: eventDetailsConfig,
      };
      setSnapshot(clearedSnapshot);
      setLoading(false);
      setHydrated(false);
      setSaving(false);
      setError("");
      lastLoadKeyRef.current = "";
      return;
    }

    const metaVersion = normalizeText(draftMeta?.version || draftMeta?.loadedAt || "0");
    const templateId = normalizeText(draftMeta?.plantillaId || "");
    const loadKey = `${safeSlug}|${templateId}|${metaVersion}`;
    if (lastLoadKeyRef.current === loadKey) return;
    lastLoadKeyRef.current = loadKey;

    let cancelled = false;
    setLoading(true);
    setHydrated(false);
    setSaving(false);
    setError("");
    const loadingSnapshot = emptySnapshot();
    latestAuthoringStateRef.current = {
      snapshot: loadingSnapshot,
      objetos: safeObjetos,
      secciones: safeSecciones,
      eventDetails: eventDetailsConfig,
    };
    setSnapshot(loadingSnapshot);

    void (async () => {
      try {
        const loaded = await loadAuthoringState({
          slug: safeSlug,
          templateId,
          editorSession,
          preloadedDraft: {
            plantillaId: templateId || null,
            templateAuthoringDraft: draftMeta?.templateAuthoringDraft || null,
            templateInput: draftMeta?.templateInput || null,
            objetos: safeObjetos,
            eventDetails: eventDetailsConfig,
          },
          persistMigration: writable,
          enqueueDraftWrite,
          uid: userId,
        });
        if (cancelled) return;
        const nextSnapshot = hydrateSnapshot(loaded);
        latestAuthoringStateRef.current = {
          snapshot: nextSnapshot,
          objetos: safeObjetos,
          secciones: safeSecciones,
          eventDetails: loaded?.eventDetails || eventDetailsConfig,
        };
        setSnapshot(nextSnapshot);
        setHydrated(true);
        if (loaded?.migration?.applied && loaded?.eventDetails) {
          onReplaceEventDetails?.(loaded.eventDetails);
        }
      } catch (loadError) {
        if (cancelled) return;
        const message =
          loadError instanceof Error
            ? loadError.message
            : "No se pudo cargar el authoring de la plantilla.";
        setError(message);
        setSnapshot(emptySnapshot());
        setHydrated(false);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    draftMeta,
    editorSession,
    enabled,
    enqueueDraftWrite,
    hydrateSnapshot,
    onReplaceEventDetails,
    slug,
    userId,
    writable,
  ]);

  const authoringCapabilities = resolveTemplateAuthoringCapabilities({
    enabled,
    canEditSchema,
    canUseFields,
    sourceTemplateId,
  });
  const canConfigure = authoringCapabilities.canEditSchema;
  const canUseExistingFields = authoringCapabilities.canUseFields;

  const buildSnapshotWithValues = useCallback(
    (nextFieldsSchema, nextValues, overrides = {}, baseSnapshot = snapshot) => {
      const sourceSnapshot = asObject(baseSnapshot);
      const sourceDefaults = ensureDefaultsForSchema(
        nextFieldsSchema,
        sourceSnapshot.defaults || defaults
      );
      const normalizedValues = ensureValuesForSchema(
        nextFieldsSchema,
        nextValues,
        sourceDefaults
      );
      const templateSession = normalizeText(editorSession?.kind).toLowerCase() === "template";
      return {
        ...sourceSnapshot,
        ...overrides,
        sourceTemplateId,
        fieldsSchema: nextFieldsSchema,
        defaults: templateSession
          ? ensureDefaultsForSchema(nextFieldsSchema, normalizedValues)
          : sourceDefaults,
        values: normalizedValues,
        detachedVisuals:
          overrides.detachedVisuals ||
          sourceSnapshot.detachedVisuals ||
          detachedVisuals,
        templateInput: templateSession
          ? null
          : {
              ...asObject(sourceSnapshot.templateInput || draftMeta?.templateInput),
              values: normalizedValues,
            },
      };
    },
    [
      defaults,
      detachedVisuals,
      draftMeta?.templateInput,
      editorSession?.kind,
      snapshot,
      sourceTemplateId,
    ]
  );

  const updateTemplateFieldValues = useCallback(
    async (valuesPatch = {}, options = {}) => {
      if (!canUseExistingFields) {
        throw new Error("Este borrador no esta vinculado a una plantilla base.");
      }

      const rawPatch = asObject(valuesPatch);
      const liveState = latestAuthoringStateRef.current;
      const baseSnapshot = asObject(liveState.snapshot);
      const baseFieldsSchema = Array.isArray(baseSnapshot.fieldsSchema)
        ? baseSnapshot.fieldsSchema
        : fieldsSchema;
      const baseDefaults = ensureDefaultsForSchema(
        baseFieldsSchema,
        baseSnapshot.defaults || defaults
      );
      const baseValues = ensureValuesForSchema(
        baseFieldsSchema,
        baseSnapshot.values,
        baseDefaults
      );
      const baseObjects = Array.isArray(liveState.objetos)
        ? liveState.objetos
        : safeObjetos;
      const baseSections = Array.isArray(liveState.secciones)
        ? liveState.secciones
        : safeSecciones;
      const baseEventDetails = liveState.eventDetails || eventDetailsConfig;
      const effectiveFieldsSchema = Array.isArray(options.fieldsSchema)
        ? options.fieldsSchema
        : baseFieldsSchema;
      const declaredKeys = new Set(
        effectiveFieldsSchema.map((field) => normalizeText(field?.key)).filter(Boolean)
      );
      const filteredPatch = mergeEventDetailsValueMetadata(
        baseValues,
        Object.fromEntries(
        Object.entries(rawPatch).filter(
          ([key]) => declaredKeys.has(key) || key === "__eventDetails"
        )
        )
      );
      const nextValues = ensureValuesForSchema(effectiveFieldsSchema, {
        ...baseValues,
        ...filteredPatch,
      }, baseDefaults);

      let nextObjects = baseObjects;
      if (options.applyTargets !== false) {
        const projectionFieldKeys = new Set(
          expandEventDateProjectionFieldKeys({
            fieldsSchema: effectiveFieldsSchema,
            fieldKeys: Object.keys(filteredPatch),
          })
        );
        effectiveFieldsSchema.forEach((field) => {
          const fieldKey = normalizeText(field?.key);
          if (!fieldKey || !projectionFieldKeys.has(fieldKey)) return;
          const patches = buildTemplateAuthoringTargetPatches({
            field,
            value: resolveEventDateTargetProjectionValue({
              field,
              fieldsSchema: effectiveFieldsSchema,
              values: nextValues,
              defaults: baseDefaults,
            }),
            objetos: nextObjects,
            secciones: baseSections,
          });
          nextObjects = applyObjectPatches(nextObjects, patches);
        });

        ["ceremony", "party"].forEach((feature) => {
          const location = resolveEventLocationFromAuthoring({
            fieldsSchema: effectiveFieldsSchema,
            defaults: baseDefaults,
            values: nextValues,
            objetos: nextObjects,
            feature,
          });
          nextObjects = applyObjectPatches(
            nextObjects,
            buildEventGoogleMapProjectionPatches({
              objetos: nextObjects,
              location,
              feature,
              ...(Object.prototype.hasOwnProperty.call(options, "showMap")
                ? { showMap: options.showMap === true }
                : {}),
            })
          );
        });

        nextObjects = applyObjectPatches(
          nextObjects,
          buildDynamicCountdownProjectionPatches({
            fieldsSchema: effectiveFieldsSchema,
            objetos: nextObjects,
            values: nextValues,
            startTimeByFieldKey: buildCountdownStartTimeByFieldKey(
              effectiveFieldsSchema,
              nextValues
            ),
          })
        );

        if (typeof options.representationVisibility === "boolean") {
          const visibilityStatus = resolveDynamicFieldVisualStatus({
            fieldsSchema: effectiveFieldsSchema,
            fieldKeys: Object.keys(filteredPatch).filter((key) => declaredKeys.has(key)),
            objetos: nextObjects,
            secciones: baseSections,
            eventDetails: baseEventDetails,
            kind: options.representationKind,
          });
          visibilityStatus.objectIds.forEach((objectId) => {
            const visibilityResult = updateRenderObjectById(
              nextObjects,
              objectId,
              (object) => {
                const next = { ...object };
                const objectType = normalizeText(object?.tipo).toLowerCase();
                if (objectType === "countdown") {
                  next.mostrarCuentaRegresiva = options.representationVisibility;
                } else if (objectType === "mapa-google") {
                  next.mostrarMapa =
                    options.representationVisibility &&
                    Boolean(normalizeText(next.googlePlaceId));
                } else {
                  next.hidden = !options.representationVisibility;
                  next.visible = options.representationVisibility;
                }
                return next;
              }
            );
            if (visibilityResult.changed) nextObjects = visibilityResult.objetos;
          });
        }
      }

      const dressField = effectiveFieldsSchema.find(
        (field) => normalizeText(field?.eventDetailsRole).toLowerCase() === "dress_code"
      );
      const dressFieldKey = normalizeText(dressField?.key);
      const eventDetailsPatch = asObject(options.eventDetailsPatch);
      const hasDressValuePatch =
        dressFieldKey && Object.prototype.hasOwnProperty.call(filteredPatch, dressFieldKey);
      const hasEventDetailsPatch = Object.keys(eventDetailsPatch).length > 0;
      const nextEventDetails = hasDressValuePatch || hasEventDetailsPatch
        ? normalizeEventDetailsConfig({
            ...asObject(baseEventDetails),
            ...eventDetailsPatch,
            dressCode: {
              ...asObject(baseEventDetails?.dressCode),
              ...asObject(eventDetailsPatch.dressCode),
              ...(hasDressValuePatch
                ? { value: String(nextValues[dressFieldKey] ?? "") }
                : {}),
            },
          })
        : baseEventDetails;

      const valuesChanged = !areValuesMapsEqual(baseValues, nextValues);
      const schemaChanged = !areValuesMapsEqual(baseFieldsSchema, effectiveFieldsSchema);
      const objectsChanged = nextObjects !== baseObjects;
      const eventDetailsChanged = nextEventDetails !== baseEventDetails;
      if (!valuesChanged && !schemaChanged && !objectsChanged && !eventDetailsChanged) {
        return false;
      }

      const nextSnapshot = buildSnapshotWithValues(
        effectiveFieldsSchema,
        nextValues,
        {},
        baseSnapshot
      );
      const beforeDynamicVisualState = buildDynamicVisualHistoryState({
        fieldsSchema: baseFieldsSchema,
        detachedVisuals: normalizeDetachedVisuals(
          baseSnapshot.detachedVisuals || detachedVisuals,
          baseFieldsSchema
        ),
      });
      const afterDynamicVisualState = buildDynamicVisualHistoryState({
        fieldsSchema: effectiveFieldsSchema,
        detachedVisuals: normalizeDetachedVisuals(
          nextSnapshot.detachedVisuals,
          effectiveFieldsSchema
        ),
      });
      const recordsCanvasHistory =
        options.includeInHistory === true ||
        typeof options.representationVisibility === "boolean" ||
        hasDynamicVisualHistoryChange(
          beforeDynamicVisualState,
          afterDynamicVisualState
        );
      await commitSnapshot(nextSnapshot, {
        nextObjects,
        nextSections: baseSections,
        nextEventDetails,
        reason: options.reason || "dynamic-field-value-update",
        excludeFromHistory: !recordsCanvasHistory,
      });
      return true;
    },
    [
      buildSnapshotWithValues,
      canUseExistingFields,
      commitSnapshot,
      defaults,
      detachedVisuals,
      eventDetailsConfig,
      fieldsSchema,
      safeObjetos,
      safeSecciones,
      values,
    ]
  );

  const updateTemplateFieldValue = useCallback(
    (fieldKey, value, options = {}) => {
      const safeFieldKey = normalizeText(fieldKey);
      if (!safeFieldKey) return Promise.resolve(false);
      return updateTemplateFieldValues({ [safeFieldKey]: value }, options);
    },
    [updateTemplateFieldValues]
  );

  const updateEventPersonNames = useCallback(
    async (patch = {}, options = {}) => {
      if (!canUseExistingFields) {
        throw new Error("Este borrador no esta vinculado a una plantilla base.");
      }

      const liveState = latestAuthoringStateRef.current;
      const liveSnapshot = asObject(liveState.snapshot);
      const liveFieldsSchema = Array.isArray(liveSnapshot.fieldsSchema)
        ? liveSnapshot.fieldsSchema
        : fieldsSchema;
      const liveDefaults = ensureDefaultsForSchema(
        liveFieldsSchema,
        liveSnapshot.defaults || defaults
      );
      const liveValues = ensureValuesForSchema(
        liveFieldsSchema,
        liveSnapshot.values,
        liveDefaults
      );
      const liveObjects = Array.isArray(liveState.objetos)
        ? liveState.objetos
        : safeObjetos;
      const currentNames = resolveEventPersonNamesFromAuthoring({
        fieldsSchema: liveFieldsSchema,
        defaults: liveValues,
        objetos: liveObjects,
      });
      const safePatch = asObject(patch);
      const nextNames = {
        primaryName: Object.prototype.hasOwnProperty.call(safePatch, "primaryName")
          ? normalizeText(safePatch.primaryName)
          : currentNames.primaryName,
        secondaryName: Object.prototype.hasOwnProperty.call(safePatch, "secondaryName")
          ? normalizeText(safePatch.secondaryName)
          : currentNames.secondaryName,
      };
      const ensureResult = canConfigure
        ? ensureEventPersonNameFields({
            fieldsSchema: liveFieldsSchema,
            includeBaseFields: true,
            coupleFormats: collectEventPersonNameFields(liveFieldsSchema)
              .filter(
                (field) =>
                  normalizeEventPersonNameRole(field.eventDetailsRole) ===
                  EVENT_PERSON_NAME_ROLES.COUPLE
              )
              .map((field) => field.eventDetailsFormat),
          })
        : {
            fieldsSchema: liveFieldsSchema,
            changed: false,
          };
      const nextFieldsSchema = ensureResult.fieldsSchema;
      const coupleValueByFieldKey = asObject(options.coupleValueByFieldKey);
      const nextValues = ensureValuesForSchema(
        nextFieldsSchema,
        buildEventPersonNameDefaults({
          fieldsSchema: nextFieldsSchema,
          defaults: liveValues,
          names: nextNames,
          coupleValueByFieldKey,
        })
      );
      const valuesPatch = Object.fromEntries(
        collectEventPersonNameFields(nextFieldsSchema)
          .map((field) => normalizeText(field?.key))
          .filter(Boolean)
          .map((fieldKey) => [fieldKey, nextValues[fieldKey]])
      );
      return updateTemplateFieldValues(valuesPatch, {
        fieldsSchema: nextFieldsSchema,
        applyTargets: true,
        reason: "event-person-names-update",
      });
    },
    [
      canConfigure,
      canUseExistingFields,
      defaults,
      fieldsSchema,
      safeObjetos,
      updateTemplateFieldValues,
    ]
  );

  const linkSelectionToEventPersonName = useCallback(
    async (role) => {
      if (!canConfigure) {
        throw new Error("Este borrador no esta vinculado a una plantilla base.");
      }
      if (selectedElementType !== "texto" || !selectedElementId) {
        throw new Error("Selecciona un texto para vincular nombres del evento.");
      }

      const safeRole = normalizeEventPersonNameRole(role);
      if (!safeRole) {
        throw new Error("Tipo de nombre de evento invalido.");
      }

      const selectedText = normalizeText(selectedElement?.texto);
      const currentNames = resolveEventPersonNamesFromAuthoring({
        fieldsSchema,
        defaults: values,
        objetos: safeObjetos,
      });
      let nextNames = { ...currentNames };
      let targetFieldKey = "";
      let coupleFormat = "";

      if (safeRole === EVENT_PERSON_NAME_ROLES.PRIMARY) {
        if (!nextNames.primaryName && selectedText) {
          nextNames.primaryName = selectedText;
        }
        targetFieldKey = getEventPersonNameFieldKey(EVENT_PERSON_NAME_ROLES.PRIMARY);
      } else if (safeRole === EVENT_PERSON_NAME_ROLES.SECONDARY) {
        if (!nextNames.secondaryName && selectedText) {
          nextNames.secondaryName = selectedText;
        }
        targetFieldKey = getEventPersonNameFieldKey(EVENT_PERSON_NAME_ROLES.SECONDARY);
      } else {
        const parsedNames = splitEventCoupleNamesText(selectedText);
        coupleFormat = inferEventCoupleNamesFormat(selectedText);
        if (!nextNames.primaryName && parsedNames.primaryName) {
          nextNames.primaryName = parsedNames.primaryName;
        }
        if (!nextNames.secondaryName && parsedNames.secondaryName) {
          nextNames.secondaryName = parsedNames.secondaryName;
        }
        targetFieldKey = getEventPersonNameFieldKey(
          EVENT_PERSON_NAME_ROLES.COUPLE,
          coupleFormat
        );
      }

      const ensureResult = ensureEventPersonNameFields({
        fieldsSchema,
        includeBaseFields: true,
        coupleFormats: coupleFormat ? [coupleFormat] : [],
      });
      const linkResult = linkElementToField({
        fieldsSchema: ensureResult.fieldsSchema,
        fieldKey: targetFieldKey,
        elementId: selectedElementId,
        path: selectedElementFieldPath || "texto",
      });
      const nextFieldsSchema = linkResult.fieldsSchema;
      const nextValues = ensureValuesForSchema(
        nextFieldsSchema,
        buildEventPersonNameDefaults({
          fieldsSchema: nextFieldsSchema,
          defaults: values,
          names: nextNames,
        })
      );

      if (!ensureResult.changed && !linkResult.changed && areValuesMapsEqual(nextValues, values)) {
        return false;
      }
      const valuesPatch = Object.fromEntries(
        collectEventPersonNameFields(nextFieldsSchema)
          .map((field) => normalizeText(field?.key))
          .filter(Boolean)
          .map((key) => [key, nextValues[key]])
      );
      return updateTemplateFieldValues(valuesPatch, {
        fieldsSchema: nextFieldsSchema,
        applyTargets: true,
        reason: "event-person-name-link",
      });
    },
    [
      canConfigure,
      fieldsSchema,
      selectedElement,
      selectedElementId,
      selectedElementFieldPath,
      selectedElementType,
      safeObjetos,
      updateTemplateFieldValues,
      values,
    ]
  );

  const updateEventLocation = useCallback(
    async (patch = {}, options = {}) => {
      if (!canUseExistingFields) {
        throw new Error("Este borrador no esta vinculado a una plantilla base.");
      }
      const feature = normalizeEventDetailFeature(options.feature || patch.eventDetailsFeature);
      const liveState = latestAuthoringStateRef.current;
      const liveSnapshot = asObject(liveState.snapshot);
      const liveFieldsSchema = Array.isArray(liveSnapshot.fieldsSchema)
        ? liveSnapshot.fieldsSchema
        : [];
      const liveDefaults = ensureDefaultsForSchema(
        liveFieldsSchema,
        liveSnapshot.defaults
      );
      const liveValues = ensureValuesForSchema(
        liveFieldsSchema,
        liveSnapshot.values,
        liveDefaults
      );
      const liveObjects = Array.isArray(liveState.objetos)
        ? liveState.objetos
        : [];

      const currentLocation = resolveEventLocationFromAuthoring({
        fieldsSchema: liveFieldsSchema,
        defaults: liveDefaults,
        values: liveValues,
        objetos: liveObjects,
        feature,
      });
      const safePatch = asObject(patch);
      const nextLocation = {
        ...currentLocation,
        venueName: Object.prototype.hasOwnProperty.call(safePatch, "venueName")
          ? normalizeText(safePatch.venueName)
          : currentLocation.venueName,
        address: Object.prototype.hasOwnProperty.call(safePatch, "address")
          ? normalizeText(safePatch.address)
          : currentLocation.address,
        googlePlaceId: Object.prototype.hasOwnProperty.call(safePatch, "googlePlaceId")
          ? normalizeText(safePatch.googlePlaceId)
          : currentLocation.googlePlaceId,
        googleDisplayName: Object.prototype.hasOwnProperty.call(safePatch, "googleDisplayName")
          ? normalizeText(safePatch.googleDisplayName)
          : currentLocation.googleDisplayName,
        googleFormattedAddress: Object.prototype.hasOwnProperty.call(safePatch, "googleFormattedAddress")
          ? normalizeText(safePatch.googleFormattedAddress)
          : currentLocation.googleFormattedAddress,
        googleAddressComponents: Object.prototype.hasOwnProperty.call(safePatch, "googleAddressComponents")
          ? safePatch.googleAddressComponents
          : currentLocation.googleAddressComponents,
        googleLat: Object.prototype.hasOwnProperty.call(safePatch, "googleLat")
          ? safePatch.googleLat
          : currentLocation.googleLat,
        googleLng: Object.prototype.hasOwnProperty.call(safePatch, "googleLng")
          ? safePatch.googleLng
          : currentLocation.googleLng,
        showMap: Object.prototype.hasOwnProperty.call(safePatch, "showMap")
          ? safePatch.showMap === true
          : currentLocation.showMap === true,
        addressTextFormatPreset: Object.prototype.hasOwnProperty.call(safePatch, "addressTextFormatPreset")
          ? safePatch.addressTextFormatPreset
          : currentLocation.addressTextFormatPreset,
      };
      const ensureResult = canConfigure
        ? ensureEventLocationFields({ fieldsSchema: liveFieldsSchema, feature })
        : {
            fieldsSchema: liveFieldsSchema,
            changed: false,
          };
      const formatResult = canConfigure && Object.prototype.hasOwnProperty.call(
        safePatch,
        "addressTextFormatPreset"
      )
        ? updateEventAddressTextFormatInSchema({
            fieldsSchema: ensureResult.fieldsSchema,
            preset: safePatch.addressTextFormatPreset,
            feature,
          })
        : {
            fieldsSchema: ensureResult.fieldsSchema,
            changed: false,
          };
      const nextFieldsSchema = formatResult.fieldsSchema;
      let nextValues = ensureValuesForSchema(
        nextFieldsSchema,
        buildEventLocationDefaults({
          fieldsSchema: nextFieldsSchema,
          defaults: liveValues,
          location: nextLocation,
          feature,
        })
      );
      nextValues = setEventLocationProviderMetadata(
        nextValues,
        feature,
        nextLocation
      );
      const nextLocations = asObject(
        asObject(nextValues.__eventDetails).locations
      );
      const valuesPatch = {
        __eventDetails: {
          locations: {
            [feature]: Object.prototype.hasOwnProperty.call(
              nextLocations,
              feature
            )
              ? nextLocations[feature]
              : null,
          },
        },
      };
      collectEventLocationFields(nextFieldsSchema).forEach((field) => {
        if (resolveEventLocationFieldFeature(field) !== feature) return;
        const fieldKey = normalizeText(field?.key);
        if (fieldKey) valuesPatch[fieldKey] = nextValues[fieldKey];
      });
      return updateTemplateFieldValues(valuesPatch, {
        fieldsSchema: nextFieldsSchema,
        applyTargets: true,
        ...(Object.prototype.hasOwnProperty.call(nextLocation, "showMap")
          ? { showMap: nextLocation.showMap === true }
          : {}),
        reason: "event-location-update",
      });
    },
    [
      canConfigure,
      canUseExistingFields,
      updateTemplateFieldValues,
    ]
  );

  const linkSelectionToEventLocation = useCallback(
    async (role, options = {}) => {
      if (!canConfigure) {
        throw new Error("Este borrador no esta vinculado a una plantilla base.");
      }
      if (selectedElementType !== "texto" || !selectedElementId) {
        throw new Error("Selecciona un texto para vincular ubicacion del evento.");
      }

      const safeRole = normalizeEventLocationRole(role);
      const feature = normalizeEventDetailFeature(options.feature);
      if (!safeRole) {
        throw new Error("Campo de ubicacion invalido.");
      }

      const selectedText = normalizeText(selectedElement?.texto);
      const currentLocation = resolveEventLocationFromAuthoring({
        fieldsSchema,
        defaults: values,
        values,
        objetos: safeObjetos,
        feature,
      });
      const nextLocation = { ...currentLocation };
      if (
        safeRole === "venue_name" &&
        !nextLocation.venueName &&
        selectedText
      ) {
        nextLocation.venueName = selectedText;
      }
      if (
        safeRole === "venue_address" &&
        !nextLocation.address &&
        selectedText
      ) {
        nextLocation.address = selectedText;
      }

      const targetFieldKey = getEventLocationFieldKey(safeRole, feature);
      const ensureResult = ensureEventLocationFields({ fieldsSchema, feature });
      const linkResult = linkElementToField({
        fieldsSchema: ensureResult.fieldsSchema,
        fieldKey: targetFieldKey,
        elementId: selectedElementId,
        path: selectedElementFieldPath || "texto",
      });
      const nextFieldsSchema = linkResult.fieldsSchema;
      const nextValues = ensureValuesForSchema(
        nextFieldsSchema,
        buildEventLocationDefaults({
          fieldsSchema: nextFieldsSchema,
          defaults: values,
          location: nextLocation,
          feature,
        })
      );

      if (!ensureResult.changed && !linkResult.changed && areValuesMapsEqual(nextValues, values)) {
        return false;
      }
      const valuesPatch = {};
      collectEventLocationFields(nextFieldsSchema).forEach((field) => {
        if (resolveEventLocationFieldFeature(field) !== feature) return;
        const key = normalizeText(field?.key);
        if (key) valuesPatch[key] = nextValues[key];
      });
      return updateTemplateFieldValues(valuesPatch, {
        fieldsSchema: nextFieldsSchema,
        applyTargets: true,
        reason: "event-location-link",
      });
    },
    [
      canConfigure,
      fieldsSchema,
      safeObjetos,
      selectedElement,
      selectedElementId,
      selectedElementFieldPath,
      selectedElementType,
      updateTemplateFieldValues,
      values,
    ]
  );

  const updateEventTimes = useCallback(
    async (patch = {}, options = {}) => {
      if (!canUseExistingFields) {
        throw new Error("Este borrador no esta vinculado a una plantilla base.");
      }
      const feature = normalizeEventDetailFeature(options.feature);

      const currentTimes = resolveEventTimesFromAuthoring({
        fieldsSchema,
        defaults: values,
        feature,
      });
      const safePatch = asObject(patch);
      const nextTimes = {
        startTime: Object.prototype.hasOwnProperty.call(safePatch, "startTime")
          ? normalizeEventTimeValue(safePatch.startTime)
          : currentTimes.startTime,
        endTime: Object.prototype.hasOwnProperty.call(safePatch, "endTime")
          ? normalizeEventTimeValue(safePatch.endTime)
          : currentTimes.endTime,
      };
      const ensureResult = canConfigure
        ? ensureEventTimeFields({ fieldsSchema, feature })
        : {
            fieldsSchema,
            changed: false,
          };
      const nextFieldsSchema = ensureResult.fieldsSchema;
      const nextValues = ensureValuesForSchema(
        nextFieldsSchema,
        buildEventTimeDefaults({
          fieldsSchema: nextFieldsSchema,
          defaults: values,
          times: nextTimes,
          feature,
        })
      );
      const valuesPatch = {};
      collectEventTimeFields(nextFieldsSchema).forEach((field) => {
        if (resolveEventTimeFieldFeature(field) !== feature) return;
        const fieldKey = normalizeText(field?.key);
        if (fieldKey) valuesPatch[fieldKey] = nextValues[fieldKey];
      });
      return updateTemplateFieldValues(valuesPatch, {
        fieldsSchema: nextFieldsSchema,
        applyTargets: true,
        reason: "event-times-update",
      });
    },
    [
      canConfigure,
      canUseExistingFields,
      fieldsSchema,
      updateTemplateFieldValues,
      values,
    ]
  );

  const updateLinkedTextFromCanvas = useCallback(
    async ({ fieldKey, value, descriptor } = {}) => {
      const safeFieldKey = normalizeText(fieldKey);
      if (!safeFieldKey) return false;

      const liveSnapshot = asObject(latestAuthoringStateRef.current.snapshot);
      const liveFieldsSchema = Array.isArray(liveSnapshot.fieldsSchema)
        ? liveSnapshot.fieldsSchema
        : fieldsSchema;
      const field = liveFieldsSchema.find(
        (candidate) => normalizeText(candidate?.key) === safeFieldKey
      );
      if (!field) return false;

      const inlineDescriptor = {
        ...asObject(descriptor),
        fieldType: normalizeText(descriptor?.fieldType || field.type || "text"),
        eventDetailsRole: normalizeText(
          descriptor?.eventDetailsRole || field.eventDetailsRole
        ),
      };
      const nextValue = normalizeDynamicInlineFieldValue({
        descriptor: inlineDescriptor,
        field,
        value,
      });
      if (isEventDateField(field)) {
        const feature = resolveEventDateFieldFeature(field);
        const parts = splitEventDateInlineControlValue(nextValue);
        if (inlineDescriptor.includesTime === true) {
          const ensureResult = ensureEventTimeFields({
            fieldsSchema: liveFieldsSchema,
            feature,
          });
          const startTimeFieldKey =
            normalizeText(inlineDescriptor.eventStartTimeFieldKey) ||
            getEventTimeFieldKey(EVENT_TIME_ROLES.START_TIME, feature);
          return updateTemplateFieldValues(
            {
              [safeFieldKey]: parts.date,
              [startTimeFieldKey]: parts.time,
            },
            {
              fieldsSchema: ensureResult.fieldsSchema,
              applyTargets: true,
              reason: "event-date-time-inline-update",
            }
          );
        }
        return updateTemplateFieldValue(safeFieldKey, parts.date, {
          reason: "event-date-inline-update",
        });
      }
      const personNameRole = normalizeEventPersonNameRole(field.eventDetailsRole);
      if (personNameRole === EVENT_PERSON_NAME_ROLES.PRIMARY) {
        return updateEventPersonNames({ primaryName: nextValue });
      }
      if (personNameRole === EVENT_PERSON_NAME_ROLES.SECONDARY) {
        return updateEventPersonNames({ secondaryName: nextValue });
      }
      if (personNameRole === EVENT_PERSON_NAME_ROLES.COUPLE) {
        const liveDefaults = ensureDefaultsForSchema(
          liveFieldsSchema,
          liveSnapshot.defaults
        );
        const liveValues = ensureValuesForSchema(
          liveFieldsSchema,
          liveSnapshot.values,
          liveDefaults
        );
        const currentNames = resolveEventPersonNamesFromAuthoring({
          fieldsSchema: liveFieldsSchema,
          defaults: liveValues,
          objetos: latestAuthoringStateRef.current.objetos,
        });
        const names = resolveEventCoupleNamesInlineEdit({
          text: nextValue,
          currentNames,
          currentValue: liveValues[safeFieldKey],
          field,
        });
        return updateEventPersonNames(
          {
            primaryName: names.primaryName,
            secondaryName: names.secondaryName,
          },
          {
            coupleValueByFieldKey: {
              [safeFieldKey]: formatEventCoupleNames(names),
            },
          }
        );
      }

      const locationRole = normalizeEventLocationRole(field.eventDetailsRole);
      if (locationRole) {
        const feature = resolveEventLocationFieldFeature(field);
        if (locationRole === EVENT_LOCATION_ROLES.VENUE_ADDRESS) {
          return updateEventLocation(
            {
              ...buildEventGoogleMapClearPatch(),
              address: nextValue,
              showMap: false,
            },
            { feature }
          );
        }
        return updateEventLocation({ venueName: nextValue }, { feature });
      }

      const timeRole = normalizeEventTimeRole(field.eventDetailsRole);
      if (timeRole) {
        const feature = resolveEventTimeFieldFeature(field);
        return updateEventTimes(
          timeRole === EVENT_TIME_ROLES.END_TIME
            ? { endTime: nextValue }
            : { startTime: nextValue },
          { feature }
        );
      }

      return updateTemplateFieldValue(safeFieldKey, nextValue, {
        reason: "dynamic-field-inline-update",
      });
    },
    [
      fieldsSchema,
      updateEventLocation,
      updateEventPersonNames,
      updateEventTimes,
      updateTemplateFieldValue,
      updateTemplateFieldValues,
    ]
  );

  const linkSelectionToEventTime = useCallback(
    async (role, options = {}) => {
      if (!canConfigure) {
        throw new Error("Este borrador no esta vinculado a una plantilla base.");
      }
      if (selectedElementType !== "texto" || !selectedElementId) {
        throw new Error("Selecciona un texto para vincular horas del evento.");
      }

      const safeRole = normalizeEventTimeRole(role);
      const feature = normalizeEventDetailFeature(options.feature);
      if (!safeRole) {
        throw new Error("Campo de hora invalido.");
      }

      const selectedText = normalizeText(selectedElement?.texto);
      const currentTimes = resolveEventTimesFromAuthoring({
        fieldsSchema,
        defaults: values,
        feature,
      });
      const nextTimes = { ...currentTimes };
      if (
        safeRole === EVENT_TIME_ROLES.START_TIME &&
        !nextTimes.startTime &&
        selectedText
      ) {
        nextTimes.startTime = normalizeEventTimeValue(selectedText);
      }
      if (
        safeRole === EVENT_TIME_ROLES.END_TIME &&
        !nextTimes.endTime &&
        selectedText
      ) {
        nextTimes.endTime = normalizeEventTimeValue(selectedText);
      }

      const targetFieldKey = getEventTimeFieldKey(safeRole, feature);
      const ensureResult = ensureEventTimeFields({ fieldsSchema, feature });
      const linkResult = linkElementToField({
        fieldsSchema: ensureResult.fieldsSchema,
        fieldKey: targetFieldKey,
        elementId: selectedElementId,
        path: selectedElementFieldPath || "texto",
      });
      const nextFieldsSchema = linkResult.fieldsSchema;
      const nextValues = ensureValuesForSchema(
        nextFieldsSchema,
        buildEventTimeDefaults({
          fieldsSchema: nextFieldsSchema,
          defaults: values,
          times: nextTimes,
          feature,
        })
      );

      if (!ensureResult.changed && !linkResult.changed && areValuesMapsEqual(nextValues, values)) {
        return false;
      }
      const valuesPatch = {};
      collectEventTimeFields(nextFieldsSchema).forEach((field) => {
        if (resolveEventTimeFieldFeature(field) !== feature) return;
        const key = normalizeText(field?.key);
        if (key) valuesPatch[key] = nextValues[key];
      });
      return updateTemplateFieldValues(valuesPatch, {
        fieldsSchema: nextFieldsSchema,
        applyTargets: true,
        reason: "event-time-link",
      });
    },
    [
      canConfigure,
      fieldsSchema,
      selectedElement,
      selectedElementId,
      selectedElementFieldPath,
      selectedElementType,
      updateTemplateFieldValues,
      values,
    ]
  );

  const linkSelectionToEventDate = useCallback(
    async (options = {}) => {
      if (!canConfigure) {
        throw new Error("Este borrador no esta vinculado a una plantilla base.");
      }
      if (selectedElementType !== "texto" && selectedElementType !== "countdown") {
        throw new Error("Selecciona un texto o countdown para vincular la fecha del evento.");
      }
      if (!selectedElementId) {
        throw new Error("Selecciona un elemento para vincular la fecha del evento.");
      }

      const feature = normalizeEventDetailFeature(options.feature);
      const fieldKey = getEventDateFieldKey(feature);
      const fieldAlreadyExists = fieldsSchema.some(
        (field) => normalizeText(field?.key) === fieldKey
      );
      const ensureResult = ensureEventDateField({ fieldsSchema, feature });
      const linkResult = linkElementToField({
        fieldsSchema: ensureResult.fieldsSchema,
        fieldKey,
        elementId: selectedElementId,
        path: selectedElementFieldPath || (selectedElementType === "countdown" ? "fechaObjetivo" : "texto"),
      });
      const nextFieldsSchema = linkResult.fieldsSchema;
      const linkedField =
        nextFieldsSchema.find((field) => normalizeText(field?.key) === fieldKey) ||
        ensureResult.field;
      const linkedValue = fieldAlreadyExists
        ? values[fieldKey]
        : resolveFieldValueFromLinkedDateTargets({
            field: linkedField,
            objetos: safeObjetos,
            fallbackValue:
              selectedElementType === "countdown" ? selectedElementDefaultValue : "",
          });
      const nextValues = ensureValuesForSchema(nextFieldsSchema, {
        ...values,
        [fieldKey]: linkedValue ?? "",
      });

      if (
        !ensureResult.changed &&
        !linkResult.changed &&
        areValuesMapsEqual(nextValues, values)
      ) {
        return false;
      }
      return updateTemplateFieldValue(fieldKey, nextValues[fieldKey], {
        fieldsSchema: nextFieldsSchema,
        applyTargets: true,
        reason: "event-date-link",
      });
    },
    [
      canConfigure,
      fieldsSchema,
      safeObjetos,
      selectedElementDefaultValue,
      selectedElementFieldPath,
      selectedElementId,
      selectedElementType,
      updateTemplateFieldValue,
      values,
    ]
  );

  const linkSelectionToStoryText = useCallback(
    async () => {
      if (!canConfigure) {
        throw new Error("Este borrador no esta vinculado a una plantilla base.");
      }
      if (selectedElementType !== "texto" || !selectedElementId) {
        throw new Error("Selecciona un texto para vincular Texto historia.");
      }

      const fieldKey = getStoryTextFieldKey();
      const ensureResult = ensureStoryTextField({ fieldsSchema });
      const linkResult = linkElementToField({
        fieldsSchema: ensureResult.fieldsSchema,
        fieldKey,
        elementId: selectedElementId,
        path: selectedElementFieldPath || "texto",
      });
      const nextFieldsSchema = linkResult.fieldsSchema;
      const fieldAlreadyExists = fieldsSchema.some(
        (field) => normalizeText(field?.key) === fieldKey
      );
      const selectedText = fieldAlreadyExists
        ? values[fieldKey]
        : typeof selectedElement?.texto === "string"
          ? selectedElement.texto
          : selectedElementDefaultValue;
      const nextValues = ensureValuesForSchema(nextFieldsSchema, {
        ...values,
        [fieldKey]: selectedText,
      });

      if (
        !ensureResult.changed &&
        !linkResult.changed &&
        areValuesMapsEqual(nextValues, values)
      ) {
        return false;
      }

      return updateTemplateFieldValue(fieldKey, nextValues[fieldKey], {
        fieldsSchema: nextFieldsSchema,
        applyTargets: true,
        reason: "story-text-link",
      });
    },
    [
      canConfigure,
      fieldsSchema,
      selectedElement,
      selectedElementDefaultValue,
      selectedElementFieldPath,
      selectedElementId,
      selectedElementType,
      updateTemplateFieldValue,
      values,
    ]
  );

  const linkSelectionToDressCode = useCallback(
    async () => {
      if (!canConfigure) {
        throw new Error("Este borrador no esta vinculado a una plantilla base.");
      }
      if (selectedElementType !== "texto" || !selectedElementId) {
        throw new Error("Selecciona un texto para vincular Dress Code.");
      }

      const fieldKey = getDressCodeFieldKey();
      const ensureResult = ensureDressCodeField({ fieldsSchema });
      const linkResult = linkElementToField({
        fieldsSchema: ensureResult.fieldsSchema,
        fieldKey,
        elementId: selectedElementId,
        path: selectedElementFieldPath || "texto",
      });
      const nextFieldsSchema = linkResult.fieldsSchema;
      const fieldAlreadyExists = fieldsSchema.some(
        (field) => normalizeText(field?.key) === fieldKey
      );
      const selectedText = fieldAlreadyExists
        ? values[fieldKey]
        : typeof selectedElement?.texto === "string"
          ? selectedElement.texto
          : selectedElementDefaultValue;
      const nextValues = ensureValuesForSchema(nextFieldsSchema, {
        ...values,
        [fieldKey]: selectedText,
      });

      if (
        !ensureResult.changed &&
        !linkResult.changed &&
        areValuesMapsEqual(nextValues, values)
      ) {
        return false;
      }

      return updateTemplateFieldValue(fieldKey, nextValues[fieldKey], {
        fieldsSchema: nextFieldsSchema,
        applyTargets: true,
        reason: "dress-code-link",
      });
    },
    [
      canConfigure,
      fieldsSchema,
      selectedElement,
      selectedElementDefaultValue,
      selectedElementFieldPath,
      selectedElementId,
      selectedElementType,
      updateTemplateFieldValue,
      values,
    ]
  );

  const createFieldFromSelection = useCallback(
    async ({ label, type, group, optional } = {}) => {
      if (!canConfigure) {
        throw new Error("Este borrador no esta vinculado a una plantilla base.");
      }
      if (!selectedIsSupportedElement || !selectedElementId) {
        throw new Error("Selecciona un texto, countdown, imagen o galeria para crear un campo dinamico.");
      }

      const newField = buildFieldFromElement({
        element: selectedElement,
        label,
        type: type || selectedElementDefaultFieldType,
        group,
        optional,
        existingFields: fieldsSchema,
      });

      const linkedResult = linkElementToField({
        fieldsSchema: [...fieldsSchema, newField],
        fieldKey: newField.key,
        elementId: selectedElementId,
        path: selectedElementFieldPath || "texto",
      });

      const nextDefaults = {
        ...defaults,
        [newField.key]: selectedElementDefaultValue,
      };

      await commitSnapshot({
        ...snapshot,
        sourceTemplateId,
        fieldsSchema: linkedResult.fieldsSchema,
        defaults: ensureDefaultsForSchema(linkedResult.fieldsSchema, nextDefaults),
      });
      syncSelectedGalleryAuthoringState(linkedResult.fieldsSchema);

      return newField.key;
    },
    [
      canConfigure,
      commitSnapshot,
      defaults,
      fieldsSchema,
      selectedElement,
      selectedElementId,
      selectedElementDefaultFieldType,
      selectedElementDefaultValue,
      selectedElementFieldPath,
      selectedIsSupportedElement,
      snapshot,
      sourceTemplateId,
      syncSelectedGalleryAuthoringState,
    ]
  );

  const linkSelectionToField = useCallback(
    async (fieldKey) => {
      if (!canConfigure) {
        throw new Error("Este borrador no esta vinculado a una plantilla base.");
      }
      if (!selectedIsSupportedElement || !selectedElementId) {
        throw new Error("Selecciona un texto, countdown, imagen o galeria para vincularlo.");
      }
      const targetField = fieldsSchema.find(
        (field) => normalizeText(field?.key) === normalizeText(fieldKey)
      );
      if (selectedElementType === "countdown") {
        if (!targetField || !isCountdownCompatibleFieldType(targetField.type)) {
          throw new Error("Para countdown, vincula un campo de tipo fecha o fecha y hora.");
        }
      }
      if (isMediaAuthoringElementType(selectedElementType)) {
        if (!targetField || normalizeText(targetField.type).toLowerCase() !== "images") {
          throw new Error("Las imagenes y galerias solo se pueden vincular a campos de fotos.");
        }
      }
      if (selectedElementType === "texto" && normalizeText(targetField?.type).toLowerCase() === "images") {
        throw new Error("Un texto no se puede vincular a un campo de fotos.");
      }

      const linkResult = linkElementToField({
        fieldsSchema,
        fieldKey,
        elementId: selectedElementId,
        path: selectedElementFieldPath || "texto",
      });
      if (!linkResult.changed) return false;

      const enhancedFields = isMediaAuthoringElementType(selectedElementType)
        ? linkResult.fieldsSchema.map((field) =>
            normalizeText(field?.key) === normalizeText(fieldKey)
              ? buildSelectedMediaFieldEnhancement(field, selectedElementType, selectedTargetConfig)
              : field
          )
        : linkResult.fieldsSchema;

      const repairedResult = sanitizeAuthoringSchema({
        fieldsSchema: enhancedFields,
        defaults,
        objetos: safeObjetos,
        dropOrphans: true,
      });
      const nextFieldsSchema = repairedResult.fieldsSchema;
      const safeFieldKey = normalizeText(fieldKey);
      await updateTemplateFieldValue(safeFieldKey, values[safeFieldKey], {
        fieldsSchema: nextFieldsSchema,
        applyTargets: true,
        reason: "template-field-link",
      });
      syncSelectedGalleryAuthoringState(nextFieldsSchema);
      return true;
    },
    [
      canConfigure,
      defaults,
      fieldsSchema,
      safeObjetos,
      selectedElementId,
      selectedElementFieldPath,
      selectedTargetConfig,
      selectedElementType,
      selectedIsSupportedElement,
      syncSelectedGalleryAuthoringState,
      updateTemplateFieldValue,
      values,
    ]
  );

  const editField = useCallback(
    async (fieldKey, patch) => {
      if (!canConfigure) {
        throw new Error("Este borrador no esta vinculado a una plantilla base.");
      }

      const updateResult = updateFieldConfig({
        fieldsSchema,
        fieldKey,
        patch,
      });
      if (!updateResult.changed) return false;

      await commitSnapshot({
        ...snapshot,
        sourceTemplateId,
        fieldsSchema: updateResult.fieldsSchema,
        defaults: ensureDefaultsForSchema(updateResult.fieldsSchema, defaults),
      });
      return true;
    },
    [canConfigure, commitSnapshot, defaults, fieldsSchema, snapshot, sourceTemplateId]
  );

  const unlinkSelection = useCallback(async () => {
    if (!canConfigure) {
      throw new Error("Este borrador no esta vinculado a una plantilla base.");
    }
    if (!selectedElementId) return false;

    const unlinkResult = unlinkElementFromField({
      fieldsSchema,
      fieldKey: selectedFieldKey || undefined,
      elementId: selectedElementId,
    });
    if (!unlinkResult.changed) return false;

    const repairedResult = sanitizeAuthoringSchema({
      fieldsSchema: unlinkResult.fieldsSchema,
      defaults,
      objetos: safeObjetos,
      dropOrphans: true,
    });
    const nextFieldsSchema = repairedResult.fieldsSchema;
    const nextDefaults = ensureDefaultsForSchema(nextFieldsSchema, repairedResult.defaults);

    await commitSnapshot({
      ...snapshot,
      sourceTemplateId,
      fieldsSchema: nextFieldsSchema,
      defaults: nextDefaults,
    });
    syncSelectedGalleryAuthoringState(nextFieldsSchema);
    return true;
  }, [
    canConfigure,
    commitSnapshot,
    defaults,
    fieldsSchema,
    safeObjetos,
    selectedElementId,
    selectedFieldKey,
    snapshot,
    sourceTemplateId,
    syncSelectedGalleryAuthoringState,
  ]);

  const deleteField = useCallback(
    async (fieldKey) => {
      if (!canConfigure) {
        throw new Error("Este borrador no esta vinculado a una plantilla base.");
      }
      const deleteResult = deleteFieldIfOrphan({
        fieldsSchema,
        defaults,
        fieldKey,
      });
      if (!deleteResult.removed) {
        throw new Error("Primero desvincula todos los elementos de este campo.");
      }

      await commitSnapshot({
        ...snapshot,
        sourceTemplateId,
        fieldsSchema: deleteResult.fieldsSchema,
        defaults: ensureDefaultsForSchema(deleteResult.fieldsSchema, deleteResult.defaults),
      });
      return true;
    },
    [canConfigure, commitSnapshot, defaults, fieldsSchema, snapshot, sourceTemplateId]
  );

  const updateFieldDefaultValue = useCallback(
    (fieldKey, value, options = {}) =>
      updateTemplateFieldValue(fieldKey, value, {
        ...options,
        applyTargets: options?.applyTargets === true,
        reason: options?.reason || "template-authoring-default-adapter",
      }),
    [updateTemplateFieldValue]
  );

  const updateFieldDateTextFormat = useCallback(
    async (fieldKey, preset) => {
      if (!canConfigure) {
        throw new Error("Este borrador no esta vinculado a una plantilla base.");
      }

      const safeFieldKey = normalizeText(fieldKey);
      if (!safeFieldKey) return false;

      const updateResult = updateFieldDateTextFormatInSchema({
        fieldsSchema,
        fieldKey: safeFieldKey,
        preset,
      });
      if (!updateResult.field) return false;
      if (!updateResult.changed) return false;
      return updateTemplateFieldValue(safeFieldKey, values[safeFieldKey], {
        fieldsSchema: updateResult.fieldsSchema,
        applyTargets: true,
        reason: "date-text-format-update",
      });
    },
    [
      canConfigure,
      fieldsSchema,
      updateTemplateFieldValue,
      values,
    ]
  );

  const updateSelectedFieldDateTextFormat = useCallback(
    async (fieldKey, preset) => {
      if (!canConfigure) {
        throw new Error("Este borrador no esta vinculado a una plantilla base.");
      }

      const safeFieldKey = normalizeText(fieldKey);
      if (!safeFieldKey || !selectedElementId) return false;

      const updateResult = updateFieldTargetDateTextFormatInSchema({
        fieldsSchema,
        fieldKey: safeFieldKey,
        targetObjectId: selectedElementId,
        path: selectedElementFieldPath || "texto",
        preset,
      });
      if (!updateResult.field || updateResult.targetObjectIds.length === 0) {
        return false;
      }
      if (!updateResult.changed) return false;
      return updateTemplateFieldValue(safeFieldKey, values[safeFieldKey], {
        fieldsSchema: updateResult.fieldsSchema,
        applyTargets: true,
        reason: "selected-date-text-format-update",
      });
    },
    [
      canConfigure,
      fieldsSchema,
      selectedElementFieldPath,
      selectedElementId,
      updateTemplateFieldValue,
      values,
    ]
  );

  const getDynamicFieldRepresentationStatus = useCallback(
    (fieldKeyOrKeys, options = {}) => {
      const result = resolveDynamicFieldVisualStatus({
        fieldsSchema,
        ...(Array.isArray(fieldKeyOrKeys)
          ? { fieldKeys: fieldKeyOrKeys }
          : { fieldKey: fieldKeyOrKeys }),
        objetos: safeObjetos,
        secciones: safeSecciones,
        eventDetails: eventDetailsConfig,
        hiddenObjectIds,
        kind: options?.kind,
        detachedVisuals,
      });
      return {
        ...result,
        firstRootObjectId: result.firstRootObjectId || result.rootObjectIds?.[0] || null,
      };
    },
    [
      detachedVisuals,
      eventDetailsConfig,
      fieldsSchema,
      hiddenObjectIds,
      safeObjetos,
      safeSecciones,
    ]
  );

  const getDynamicVisualHistoryState = useCallback(
    () => buildDynamicVisualHistoryState({
      fieldsSchema,
      detachedVisuals,
    }),
    [detachedVisuals, fieldsSchema]
  );

  const restoreDynamicVisualHistoryState = useCallback(
    (dynamicVisualState, nextObjects, nextSections = safeSecciones) => {
      const liveState = latestAuthoringStateRef.current;
      const baseSnapshot = asObject(liveState.snapshot);
      const baseFieldsSchema = Array.isArray(baseSnapshot.fieldsSchema)
        ? baseSnapshot.fieldsSchema
        : fieldsSchema;
      const baseDefaults = ensureDefaultsForSchema(
        baseFieldsSchema,
        baseSnapshot.defaults || defaults
      );
      const currentValues = ensureValuesForSchema(
        baseFieldsSchema,
        baseSnapshot.values,
        baseDefaults
      );
      const currentDetachedVisuals = normalizeDetachedVisuals(
        baseSnapshot.detachedVisuals || detachedVisuals,
        baseFieldsSchema
      );
      const restoredSlice = restoreDynamicVisualHistorySlice({
        historyState: dynamicVisualState,
        fieldsSchema: baseFieldsSchema,
        detachedVisuals: currentDetachedVisuals,
      });
      if (!restoredSlice.applied) {
        return Array.isArray(nextObjects) ? nextObjects : [];
      }
      const nextFieldsSchema = restoredSlice.fieldsSchema;
      const nextDetachedVisuals = normalizeDetachedVisuals(
        restoredSlice.detachedVisuals,
        nextFieldsSchema
      );
      let projectedObjects = Array.isArray(nextObjects) ? nextObjects : [];
      nextFieldsSchema.forEach((field) => {
        const fieldKey = normalizeText(field?.key);
        if (!fieldKey) return;
        projectedObjects = applyObjectPatches(
          projectedObjects,
          buildTemplateAuthoringTargetPatches({
            field,
            value: resolveEventDateTargetProjectionValue({
              field,
              fieldsSchema: nextFieldsSchema,
              values: currentValues,
              defaults: baseDefaults,
            }),
            objetos: projectedObjects,
            secciones: nextSections,
          })
        );
      });
      ["ceremony", "party"].forEach((feature) => {
        const location = resolveEventLocationFromAuthoring({
          fieldsSchema: nextFieldsSchema,
          defaults: baseDefaults,
          values: currentValues,
          objetos: projectedObjects,
          feature,
        });
        projectedObjects = applyObjectPatches(
          projectedObjects,
          buildEventGoogleMapProjectionPatches({
            objetos: projectedObjects,
            location,
            feature,
          })
        );
      });
      projectedObjects = applyObjectPatches(
        projectedObjects,
        buildDynamicCountdownProjectionPatches({
          fieldsSchema: nextFieldsSchema,
          objetos: projectedObjects,
          values: currentValues,
          startTimeByFieldKey: buildCountdownStartTimeByFieldKey(
            nextFieldsSchema,
            currentValues
          ),
        })
      );
      const nextSnapshot = buildSnapshotWithValues(
        nextFieldsSchema,
        currentValues,
        { detachedVisuals: nextDetachedVisuals },
        baseSnapshot
      );
      latestAuthoringStateRef.current = {
        snapshot: nextSnapshot,
        objetos: projectedObjects,
        secciones: nextSections,
        eventDetails: liveState.eventDetails,
      };
      onSnapshotChange?.(nextSnapshot);
      setSnapshot(nextSnapshot);
      void persistSnapshot(nextSnapshot, {
        nextObjects: projectedObjects,
        nextSections,
        reason: "dynamic-visual-history-restore",
      }).catch(() => {});
      return projectedObjects;
    },
    [
      buildSnapshotWithValues,
      defaults,
      detachedVisuals,
      fieldsSchema,
      onSnapshotChange,
      persistSnapshot,
      safeSecciones,
    ]
  );

  const commitDynamicVisualMutation = useCallback(
    async ({
      nextObjects,
      nextFieldsSchema,
      nextDetachedVisuals,
      nextSections,
      nextEventDetails,
      reason = "dynamic-visual-mutation",
      pessimistic = true,
    } = {}) => {
      const liveState = latestAuthoringStateRef.current;
      const liveSnapshot = asObject(liveState.snapshot);
      const liveFields = Array.isArray(liveSnapshot.fieldsSchema)
        ? liveSnapshot.fieldsSchema
        : fieldsSchema;
      const liveDefaults = ensureDefaultsForSchema(
        liveFields,
        liveSnapshot.defaults || defaults
      );
      const liveValues = ensureValuesForSchema(
        liveFields,
        liveSnapshot.values,
        liveDefaults
      );
      const targetFields = Array.isArray(nextFieldsSchema)
        ? nextFieldsSchema
        : liveFields;
      const targetDetached = normalizeDetachedVisuals(
        nextDetachedVisuals === undefined
          ? liveSnapshot.detachedVisuals || detachedVisuals
          : nextDetachedVisuals,
        targetFields
      );
      const targetObjects = Array.isArray(nextObjects)
        ? nextObjects
        : Array.isArray(liveState.objetos)
          ? liveState.objetos
          : [];
      const targetSections = Array.isArray(nextSections)
        ? nextSections
        : Array.isArray(liveState.secciones)
          ? liveState.secciones
          : [];
      const targetEventDetails =
        nextEventDetails && typeof nextEventDetails === "object"
          ? nextEventDetails
          : liveState.eventDetails;
      const nextSnapshot = buildSnapshotWithValues(
        targetFields,
        liveValues,
        { detachedVisuals: targetDetached },
        liveSnapshot
      );
      await commitSnapshot(nextSnapshot, {
        nextObjects: targetObjects,
        nextSections: targetSections,
        nextEventDetails: targetEventDetails,
        reason,
        pessimistic,
      });
      return nextSnapshot;
    },
    [
      buildSnapshotWithValues,
      commitSnapshot,
      defaults,
      detachedVisuals,
      fieldsSchema,
    ]
  );

  const restoreDynamicFieldRepresentation = useCallback(
    async ({ fieldKey, representationKind = "auto" } = {}) => {
      const safeFieldKey = normalizeText(fieldKey);
      const liveState = latestAuthoringStateRef.current;
      const liveSnapshot = asObject(liveState.snapshot);
      const liveFieldsSchema = Array.isArray(liveSnapshot.fieldsSchema)
        ? liveSnapshot.fieldsSchema
        : [];
      const liveDefaults = ensureDefaultsForSchema(
        liveFieldsSchema,
        liveSnapshot.defaults
      );
      const liveValues = ensureValuesForSchema(
        liveFieldsSchema,
        liveSnapshot.values,
        liveDefaults
      );
      const liveObjects = Array.isArray(liveState.objetos)
        ? liveState.objetos
        : [];
      const liveSections = Array.isArray(liveState.secciones)
        ? liveState.secciones
        : [];
      const liveDetachedVisuals = normalizeDetachedVisuals(
        liveSnapshot.detachedVisuals,
        liveFieldsSchema
      );
      const liveEventDetails = liveState.eventDetails;
      const field = liveFieldsSchema.find(
        (candidate) => normalizeText(candidate?.key) === safeFieldKey
      );
      if (!field) return { ok: false, reason: "field-missing" };

      const requestedKind = normalizeRepresentationKind(
        representationKind === "auto" ? "text" : representationKind
      );
      const editableSections = liveSections.filter((section) =>
        canInsertIntoSection(section?.id, liveSections)
      );
      const sectionId = canInsertIntoSection(activeSectionId, liveSections)
        ? normalizeText(activeSectionId)
        : normalizeText(editableSections[0]?.id);
      if (!sectionId) return { ok: false, reason: "editable-section-missing" };

      const association = resolveFieldFunctionalAssociation(field);
      const baseId = `dynamic-${safeFieldKey}-${Date.now().toString(36)}`;
      let defaultObject = null;
      let defaultTarget = null;
      if (requestedKind === "map") {
        const feature = association === "party" ? "party" : "ceremony";
        const location = resolveEventLocationFromAuthoring({
          fieldsSchema: liveFieldsSchema,
          defaults: liveDefaults,
          values: liveValues,
          objetos: liveObjects,
          feature,
        });
        defaultObject = computeInsertDefaults({
          payload: {
            ...buildEventGoogleMapInsertObject(location, {
              id: baseId,
              feature,
            }),
            ...(association ? { functionalAssociation: association } : {}),
          },
          targetSeccionId: sectionId,
          secciones: liveSections,
          normalizarAltoModo,
          ALTURA_PANTALLA_EDITOR,
        });
      } else if (requestedKind === "countdown") {
        defaultObject = computeInsertDefaults({
          payload: {
            id: baseId,
            tipo: "countdown",
            targetISO: liveValues[safeFieldKey],
            mostrarCuentaRegresiva: true,
            ...(association ? { functionalAssociation: association } : {}),
          },
          targetSeccionId: sectionId,
          secciones: liveSections,
          normalizarAltoModo,
          ALTURA_PANTALLA_EDITOR,
        });
        defaultTarget = {
          scope: "objeto",
          id: baseId,
          path: "fechaObjetivo",
          mode: "set",
          transform: { kind: "date_to_countdown_iso" },
        };
      } else {
        const fieldType = normalizeText(field?.type).toLowerCase();
        const dateLike = fieldType === "date" || fieldType === "datetime";
        defaultObject = computeInsertDefaults({
          payload: {
            id: baseId,
            tipo: "texto",
            texto: "",
            variant: fieldType === "textarea" ? "parrafo" : "texto",
            ...(association ? { functionalAssociation: association } : {}),
          },
          targetSeccionId: sectionId,
          secciones: liveSections,
          normalizarAltoModo,
          ALTURA_PANTALLA_EDITOR,
        });
        defaultTarget = {
          scope: "objeto",
          id: baseId,
          path: "texto",
          mode: "set",
          ...(dateLike
            ? {
                transform: {
                  kind: "date_to_text",
                  preset: field.dateTextFormatPreset,
                },
              }
            : {}),
        };
      }

      const restored = restoreDynamicFieldVisual({
        fieldKey: safeFieldKey,
        representationKind,
        fieldsSchema: liveFieldsSchema,
        objetos: liveObjects,
        secciones: editableSections,
        detachedVisuals: liveDetachedVisuals,
        activeSection: sectionId,
        defaultObject,
        defaultTarget,
      });
      if (!restored.restoredRootId) {
        return { ok: false, reason: restored.reason || "restore-failed" };
      }

      let nextObjects = restored.nextObjetos;
      const restoredObject = nextObjects.find(
        (object) => normalizeText(object?.id) === restored.restoredRootId
      );
      if (restoredObject) {
        const insertNormalizedObject = computeInsertDefaults({
          payload: restoredObject,
          targetSeccionId: normalizeText(restoredObject?.seccionId) || sectionId,
          secciones: liveSections,
          normalizarAltoModo,
          ALTURA_PANTALLA_EDITOR,
        });
        const normalizedRestoredObject =
          restored.reason === "restored"
            ? preserveRecoveredTextBoxLayout({
                recoveredObject: restoredObject,
                normalizedObject: insertNormalizedObject,
              })
            : insertNormalizedObject;
        const normalizedResult = updateRenderObjectById(
          nextObjects,
          restored.restoredRootId,
          () => normalizedRestoredObject
        );
        if (normalizedResult.changed) nextObjects = normalizedResult.objetos;
      }
      restored.nextFieldsSchema.forEach((candidate) => {
        const candidateKey = normalizeText(candidate?.key);
        if (!candidateKey) return;
        nextObjects = applyObjectPatches(
          nextObjects,
          buildTemplateAuthoringTargetPatches({
            field: candidate,
            value: resolveEventDateTargetProjectionValue({
              field: candidate,
              fieldsSchema: restored.nextFieldsSchema,
              values: liveValues,
              defaults: liveDefaults,
            }),
            objetos: nextObjects,
            secciones: liveSections,
          })
        );
      });
      nextObjects = applyObjectPatches(
        nextObjects,
        buildDynamicCountdownProjectionPatches({
          fieldsSchema: restored.nextFieldsSchema,
          objetos: nextObjects,
          values: liveValues,
          startTimeByFieldKey: buildCountdownStartTimeByFieldKey(
            restored.nextFieldsSchema,
            liveValues
          ),
        })
      );
      ["ceremony", "party"].forEach((feature) => {
        const location = resolveEventLocationFromAuthoring({
          fieldsSchema: restored.nextFieldsSchema,
          defaults: liveDefaults,
          values: liveValues,
          objetos: nextObjects,
          feature,
        });
        const locationProjection = { ...location };
        delete locationProjection.showMap;
        nextObjects = applyObjectPatches(
          nextObjects,
          buildEventGoogleMapProjectionPatches({
            objetos: nextObjects,
            location: locationProjection,
            feature,
          })
        );
      });
      const visibilityResult = updateRenderObjectById(
        nextObjects,
        restored.restoredRootId,
        (object) => {
          const next = { ...object, hidden: false, visible: true, mostrar: true };
          if (normalizeText(object?.tipo).toLowerCase() === "countdown") {
            next.mostrarCuentaRegresiva = true;
          }
          if (normalizeText(object?.tipo).toLowerCase() === "mapa-google") {
            next.mostrarMapa = Boolean(normalizeText(next.googlePlaceId));
          }
          return next;
        }
      );
      if (visibilityResult.changed) nextObjects = visibilityResult.objetos;

      await commitDynamicVisualMutation({
        nextObjects,
        nextFieldsSchema: restored.nextFieldsSchema,
        nextDetachedVisuals: restored.nextDetachedVisuals,
        nextSections: liveSections,
        nextEventDetails: liveEventDetails,
        reason: "dynamic-visual-restore",
        pessimistic: true,
      });
      return {
        ok: true,
        ...restored,
        nextObjetos: nextObjects,
      };
    },
    [
      ALTURA_PANTALLA_EDITOR,
      activeSectionId,
      commitDynamicVisualMutation,
      normalizarAltoModo,
    ]
  );

  const getFieldUsage = useCallback(
    (fieldKey) => {
      const safeFieldKey = normalizeText(fieldKey);
      if (!safeFieldKey) return [];
      const field = fieldsSchema.find(
        (entry) => normalizeText(entry?.key) === safeFieldKey
      );
      const targets = Array.isArray(field?.applyTargets) ? field.applyTargets : [];
      return targets
        .filter((target) => normalizeText(target?.scope).toLowerCase() === "objeto")
        .map((target) => normalizeText(target?.id))
        .filter(Boolean);
    },
    [fieldsSchema]
  );

  const repairSnapshot = useCallback(
    async ({ dropOrphans = true } = {}) => {
      const repaired = sanitizeAuthoringSchema({
        fieldsSchema,
        defaults,
        objetos: safeObjetos,
        dropOrphans,
      });
      const nextDefaults = ensureDefaultsForSchema(
        repaired.fieldsSchema,
        repaired.defaults
      );
      const nextStatus = validateAuthoringState({
        fieldsSchema: repaired.fieldsSchema,
        defaults: nextDefaults,
        objetos: safeObjetos,
      });

      if (!repaired.changed) {
        return {
          changed: false,
          removedFieldKeys: [],
          removedTargets: [],
          status: nextStatus,
          snapshot: {
            version: AUTHORING_DRAFT_VERSION,
            sourceTemplateId,
            fieldsSchema,
            defaults,
            status,
          },
        };
      }

      const nextSnapshot = await commitSnapshot({
        ...snapshot,
        sourceTemplateId,
        fieldsSchema: repaired.fieldsSchema,
        defaults: nextDefaults,
      });

      return {
        changed: true,
        removedFieldKeys: repaired.removedFieldKeys,
        removedTargets: repaired.removedTargets,
        status: nextSnapshot.status,
        snapshot: nextSnapshot,
      };
    },
    [
      commitSnapshot,
      defaults,
      fieldsSchema,
      safeObjetos,
      snapshot,
      sourceTemplateId,
      status,
    ]
  );

  const autoRepairSignature = useMemo(() => {
    const recoverableIssues = collectRecoverableAuthoringIssues(status?.issues);
    if (!recoverableIssues.length) return "";

    return JSON.stringify({
      sourceTemplateId: normalizeText(sourceTemplateId),
      issueCount: recoverableIssues.length,
      issues: recoverableIssues.sort(),
      fieldKeys: fieldsSchema
        .map((field) => normalizeText(field?.key))
        .filter(Boolean)
        .sort(),
      objectCount: safeObjetos.length,
    });
  }, [fieldsSchema, safeObjetos.length, sourceTemplateId, status?.issues]);

  useEffect(() => {
    if (!enabled || !canConfigure || loading || saving) return;

    if (!autoRepairSignature) {
      autoRepairSignatureRef.current = "";
      return;
    }

    if (autoRepairSignatureRef.current === autoRepairSignature) return;
    autoRepairSignatureRef.current = autoRepairSignature;

    // El authoring puede quedar stale cuando se eliminan objetos/secciones fuera del menu.
    void repairSnapshot({ dropOrphans: true }).catch((repairError) => {
      autoRepairSignatureRef.current = "";
      setError(
        repairError instanceof Error
          ? repairError.message
          : "No se pudo reparar el schema dinamico."
      );
    });
  }, [autoRepairSignature, canConfigure, enabled, loading, repairSnapshot, saving]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.dispatchEvent(
      new CustomEvent(EDITOR_BRIDGE_EVENTS.TEMPLATE_AUTHORING_CHANGE, {
        detail: {
          sourceTemplateId,
          fieldsSchema,
          defaults,
          values,
          detachedVisuals,
          templateInput: snapshot.templateInput || null,
          objetos: safeObjetos,
          status,
        },
      })
    );
  }, [defaults, detachedVisuals, fieldsSchema, safeObjetos, snapshot.templateInput, sourceTemplateId, status, values]);

  const getSnapshot = useCallback(() => {
    const current = asObject(latestAuthoringStateRef.current.snapshot);
    const currentFields = Array.isArray(current.fieldsSchema)
      ? current.fieldsSchema
      : fieldsSchema;
    const currentDefaults = ensureDefaultsForSchema(
      currentFields,
      current.defaults || defaults
    );
    const currentValues = ensureValuesForSchema(
      currentFields,
      current.values,
      currentDefaults
    );
    const currentDetachedVisuals = normalizeDetachedVisuals(
      current.detachedVisuals,
      currentFields
    );
    const currentStatus = asObject(current.status);
    return {
      version: AUTHORING_DRAFT_VERSION,
      sourceTemplateId:
        normalizeText(current.sourceTemplateId) || sourceTemplateId,
      fieldsSchema: currentFields,
      defaults: currentDefaults,
      values: currentValues,
      detachedVisuals: currentDetachedVisuals,
      templateInput: current.templateInput || null,
      metadata: currentValues.__eventDetails || null,
      status: {
        isReady: currentStatus.isReady !== false,
        issues: Array.isArray(currentStatus.issues) ? currentStatus.issues : [],
      },
    };
  }, [defaults, fieldsSchema, sourceTemplateId]);

  return {
    loading,
    hydrated,
    saving,
    error,
    canConfigure,
    canEditSchema: canConfigure,
    canUseFields: canUseExistingFields,
    sourceTemplateId,
    fieldsSchema,
    defaults,
    values,
    detachedVisuals,
    status,
    fieldIndexByElementId,
    selectedFieldKey,
    selectedField,
    selectedElementType,
    selectedIsSupportedElement,
    selectedElementDefaultFieldType,
    createFieldFromSelection,
    linkSelectionToField,
    editField,
    unlinkSelection,
    deleteField,
    updateFieldDefaultValue,
    updateTemplateFieldValue,
    updateTemplateFieldValues,
    getDynamicFieldRepresentationStatus,
    getDynamicVisualHistoryState,
    restoreDynamicVisualHistoryState,
    restoreDynamicFieldRepresentation,
    commitDynamicVisualMutation,
    updateFieldDateTextFormat,
    updateSelectedFieldDateTextFormat,
    updateEventPersonNames,
    linkSelectionToEventPersonName,
    updateEventLocation,
    linkSelectionToEventLocation,
    updateEventTimes,
    updateLinkedTextFromCanvas,
    linkSelectionToEventTime,
    linkSelectionToEventDate,
    linkSelectionToStoryText,
    linkSelectionToDressCode,
    getFieldUsage,
    repairSnapshot,
    reloadAvailableFields,
    getSnapshot,
    getStatus: () => ({
      isReady: status.isReady,
      issues: Array.isArray(status.issues) ? status.issues : [],
    }),
  };
}
