import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ensureDefaultsForSchema } from "../../../../shared/templates/contract.js";
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
  getEventPersonNameFieldKey,
  inferEventCoupleNamesFormat,
  normalizeEventPersonNameRole,
  resolveEventPersonNamesFromAuthoring,
  splitEventCoupleNamesText,
} from "@/domain/eventDetails/personNames.js";
import {
  buildEventLocationDefaults,
  collectEventLocationFields,
  ensureEventLocationFields,
  getEventLocationFieldKey,
  normalizeEventLocationRole,
  resolveEventLocationFromAuthoring,
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
  resolveEventTimesFromAuthoring,
} from "@/domain/eventDetails/time.js";
import {
  ensureEventDateField,
  getEventDateFieldKey,
} from "@/domain/eventDetails/date.js";
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
  updateFieldDateTextFormatInSchema,
} from "@/domain/templates/authoring/targetApplication.js";
import { EDITOR_BRIDGE_EVENTS } from "@/lib/editorBridgeContracts";
import {
  buildDynamicGalleryObjectPatch,
  buildFixedGalleryObjectPatch,
} from "@/domain/templates/galleryDynamicMedia.js";

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
}) {
  const [snapshot, setSnapshot] = useState(() => emptySnapshot());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const lastLoadKeyRef = useRef("");
  const saveQueueRef = useRef(Promise.resolve());
  const saveCounterRef = useRef(0);
  const reloadInFlightRef = useRef(null);
  const autoRepairSignatureRef = useRef("");

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
    (incoming) => {
      const normalizedIncoming = asObject(incoming);
      const incomingFields = Array.isArray(normalizedIncoming.fieldsSchema)
        ? normalizedIncoming.fieldsSchema
        : [];
      const incomingDefaults = ensureDefaultsForSchema(incomingFields, normalizedIncoming.defaults);
      const nextStatus = validateAuthoringState({
        fieldsSchema: incomingFields,
        defaults: incomingDefaults,
        objetos: safeObjetos,
      });

      return {
        version: AUTHORING_DRAFT_VERSION,
        sourceTemplateId:
          normalizeText(normalizedIncoming.sourceTemplateId) ||
          normalizeText(sourceTemplateId) ||
          null,
        fieldsSchema: incomingFields,
        defaults: incomingDefaults,
        status: nextStatus,
        updatedAt: normalizedIncoming.updatedAt || null,
        updatedByUid: normalizeText(normalizedIncoming.updatedByUid) || null,
      };
    },
    [safeObjetos, sourceTemplateId]
  );

  const persistSnapshot = useCallback(
    (nextSnapshot) => {
      const safeSlug = normalizeText(slug);
      if (!enabled || !safeSlug) return Promise.resolve();

      saveCounterRef.current += 1;
      setSaving(true);

      const payload = hydrateSnapshot(nextSnapshot);

      saveQueueRef.current = saveQueueRef.current
        .catch(() => {})
        .then(() =>
          saveAuthoringDraft({
            slug: safeSlug,
            uid: userId,
            state: payload,
            templateId: sourceTemplateId || "",
            editorSession,
          })
        )
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

      return saveQueueRef.current;
    },
    [editorSession, enabled, hydrateSnapshot, slug, sourceTemplateId, userId]
  );

  const commitSnapshot = useCallback(
    async (nextPartial) => {
      const nextSnapshot = hydrateSnapshot(nextPartial);
      setSnapshot(nextSnapshot);
      setError("");
      await persistSnapshot(nextSnapshot);
      return nextSnapshot;
    },
    [hydrateSnapshot, persistSnapshot]
  );

  const reloadAvailableFields = useCallback(
    async ({ resetSnapshot = false, clearOnError = false } = {}) => {
      const safeSlug = normalizeText(slug);
      if (!enabled || !safeSlug) {
        const clearedSnapshot = emptySnapshot();
        setSnapshot(clearedSnapshot);
        setLoading(false);
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
      setError("");

      const reloadPromise = saveQueueRef.current
        .catch(() => {})
        .then(() =>
          loadAuthoringState({
            slug: safeSlug,
            templateId,
            editorSession,
            preloadedDraft: null,
          })
        )
        .then((loaded) => {
          const nextSnapshot = hydrateSnapshot(loaded);
          setSnapshot(nextSnapshot);
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
          throw loadError;
        })
        .finally(() => {
          setLoading(false);
          reloadInFlightRef.current = null;
        });

      reloadInFlightRef.current = reloadPromise;
      return reloadPromise;
    },
    [draftMeta, editorSession, enabled, hydrateSnapshot, safeObjetos, slug]
  );

  useEffect(() => {
    const safeSlug = normalizeText(slug);
    if (!enabled || !safeSlug) {
      setSnapshot(emptySnapshot());
      setLoading(false);
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
    setSaving(false);
    setError("");
    setSnapshot(emptySnapshot());

    void (async () => {
      try {
        const loaded = await loadAuthoringState({
          slug: safeSlug,
          templateId,
          editorSession,
          preloadedDraft: {
            plantillaId: templateId || null,
            templateAuthoringDraft: draftMeta?.templateAuthoringDraft || null,
            objetos: safeObjetos,
          },
        });
        if (cancelled) return;
        setSnapshot(hydrateSnapshot(loaded));
      } catch (loadError) {
        if (cancelled) return;
        const message =
          loadError instanceof Error
            ? loadError.message
            : "No se pudo cargar el authoring de la plantilla.";
        setError(message);
        setSnapshot(emptySnapshot());
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [draftMeta, editorSession, enabled, hydrateSnapshot, safeObjetos, slug]);

  const authoringCapabilities = resolveTemplateAuthoringCapabilities({
    enabled,
    canEditSchema,
    canUseFields,
    sourceTemplateId,
  });
  const canConfigure = authoringCapabilities.canEditSchema;
  const canUseExistingFields = authoringCapabilities.canUseFields;

  const applyFieldTargetsToObjects = useCallback(
    (field, value, { targetObjectIds = null } = {}) => {
      if (typeof onPatchObject !== "function") return false;

      const patches = buildTemplateAuthoringTargetPatches({
        field,
        value,
        objetos: safeObjetos,
        secciones: safeSecciones,
        targetObjectIds,
      });

      patches.forEach(({ objectId, patch }) => {
        onPatchObject(objectId, patch);
      });

      return patches.length > 0;
    },
    [onPatchObject, safeObjetos, safeSecciones]
  );

  const applyEventPersonNameTargetsToObjects = useCallback(
    (nextFieldsSchema, nextDefaults) => {
      let targetsApplied = false;
      collectEventPersonNameFields(nextFieldsSchema).forEach((field) => {
        const fieldKey = normalizeText(field?.key);
        if (!fieldKey) return;
        const applied = applyFieldTargetsToObjects(field, nextDefaults[fieldKey]);
        targetsApplied = targetsApplied || applied;
      });
      return targetsApplied;
    },
    [applyFieldTargetsToObjects]
  );

  const applyEventLocationTargetsToObjects = useCallback(
    (nextFieldsSchema, nextDefaults) => {
      let targetsApplied = false;
      collectEventLocationFields(nextFieldsSchema).forEach((field) => {
        const fieldKey = normalizeText(field?.key);
        if (!fieldKey) return;
        const applied = applyFieldTargetsToObjects(field, nextDefaults[fieldKey]);
        targetsApplied = targetsApplied || applied;
      });
      return targetsApplied;
    },
    [applyFieldTargetsToObjects]
  );

  const applyEventTimeTargetsToObjects = useCallback(
    (nextFieldsSchema, nextDefaults) => {
      let targetsApplied = false;
      collectEventTimeFields(nextFieldsSchema).forEach((field) => {
        const fieldKey = normalizeText(field?.key);
        if (!fieldKey) return;
        const applied = applyFieldTargetsToObjects(field, nextDefaults[fieldKey]);
        targetsApplied = targetsApplied || applied;
      });
      return targetsApplied;
    },
    [applyFieldTargetsToObjects]
  );

  const updateEventPersonNames = useCallback(
    async (patch = {}) => {
      if (!canUseExistingFields) {
        throw new Error("Este borrador no esta vinculado a una plantilla base.");
      }

      const currentNames = resolveEventPersonNamesFromAuthoring({
        fieldsSchema,
        defaults,
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
            fieldsSchema,
            includeBaseFields: true,
            coupleFormats: collectEventPersonNameFields(fieldsSchema)
              .filter(
                (field) =>
                  normalizeEventPersonNameRole(field.eventDetailsRole) ===
                  EVENT_PERSON_NAME_ROLES.COUPLE
              )
              .map((field) => field.eventDetailsFormat),
          })
        : {
            fieldsSchema,
            changed: false,
          };
      const nextFieldsSchema = ensureResult.fieldsSchema;
      const nextDefaults = ensureDefaultsForSchema(
        nextFieldsSchema,
        buildEventPersonNameDefaults({
          fieldsSchema: nextFieldsSchema,
          defaults,
          names: nextNames,
        })
      );
      const targetsApplied = applyEventPersonNameTargetsToObjects(
        nextFieldsSchema,
        nextDefaults
      );

      if (
        !ensureResult.changed &&
        areValuesMapsEqual(nextDefaults, defaults)
      ) {
        return targetsApplied;
      }

      await commitSnapshot({
        ...snapshot,
        sourceTemplateId,
        fieldsSchema: nextFieldsSchema,
        defaults: nextDefaults,
      });
      return true;
    },
    [
      applyEventPersonNameTargetsToObjects,
      canConfigure,
      canUseExistingFields,
      commitSnapshot,
      defaults,
      fieldsSchema,
      snapshot,
      sourceTemplateId,
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
        defaults,
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
      const nextDefaults = ensureDefaultsForSchema(
        nextFieldsSchema,
        buildEventPersonNameDefaults({
          fieldsSchema: nextFieldsSchema,
          defaults,
          names: nextNames,
        })
      );

      if (!ensureResult.changed && !linkResult.changed && areValuesMapsEqual(nextDefaults, defaults)) {
        return false;
      }

      await commitSnapshot({
        ...snapshot,
        sourceTemplateId,
        fieldsSchema: nextFieldsSchema,
        defaults: nextDefaults,
      });

      applyEventPersonNameTargetsToObjects(nextFieldsSchema, nextDefaults);
      return true;
    },
    [
      applyEventPersonNameTargetsToObjects,
      canConfigure,
      commitSnapshot,
      defaults,
      fieldsSchema,
      selectedElement,
      selectedElementId,
      selectedElementFieldPath,
      selectedElementType,
      snapshot,
      sourceTemplateId,
    ]
  );

  const updateEventLocation = useCallback(
    async (patch = {}) => {
      if (!canUseExistingFields) {
        throw new Error("Este borrador no esta vinculado a una plantilla base.");
      }

      const currentLocation = resolveEventLocationFromAuthoring({
        fieldsSchema,
        defaults,
        objetos: safeObjetos,
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
        addressTextFormatPreset: Object.prototype.hasOwnProperty.call(safePatch, "addressTextFormatPreset")
          ? safePatch.addressTextFormatPreset
          : currentLocation.addressTextFormatPreset,
      };
      const ensureResult = canConfigure
        ? ensureEventLocationFields({ fieldsSchema })
        : {
            fieldsSchema,
            changed: false,
          };
      const formatResult = canConfigure && Object.prototype.hasOwnProperty.call(
        safePatch,
        "addressTextFormatPreset"
      )
        ? updateEventAddressTextFormatInSchema({
            fieldsSchema: ensureResult.fieldsSchema,
            preset: safePatch.addressTextFormatPreset,
          })
        : {
            fieldsSchema: ensureResult.fieldsSchema,
            changed: false,
          };
      const nextFieldsSchema = formatResult.fieldsSchema;
      const nextDefaults = ensureDefaultsForSchema(
        nextFieldsSchema,
        buildEventLocationDefaults({
          fieldsSchema: nextFieldsSchema,
          defaults,
          location: nextLocation,
        })
      );
      const targetsApplied = applyEventLocationTargetsToObjects(
        nextFieldsSchema,
        nextDefaults
      );

      if (
        !ensureResult.changed &&
        !formatResult.changed &&
        areValuesMapsEqual(nextDefaults, defaults)
      ) {
        return targetsApplied;
      }

      await commitSnapshot({
        ...snapshot,
        sourceTemplateId,
        fieldsSchema: nextFieldsSchema,
        defaults: nextDefaults,
      });
      return true;
    },
    [
      applyEventLocationTargetsToObjects,
      canConfigure,
      canUseExistingFields,
      commitSnapshot,
      defaults,
      fieldsSchema,
      safeObjetos,
      snapshot,
      sourceTemplateId,
    ]
  );

  const linkSelectionToEventLocation = useCallback(
    async (role) => {
      if (!canConfigure) {
        throw new Error("Este borrador no esta vinculado a una plantilla base.");
      }
      if (selectedElementType !== "texto" || !selectedElementId) {
        throw new Error("Selecciona un texto para vincular ubicacion del evento.");
      }

      const safeRole = normalizeEventLocationRole(role);
      if (!safeRole) {
        throw new Error("Campo de ubicacion invalido.");
      }

      const selectedText = normalizeText(selectedElement?.texto);
      const currentLocation = resolveEventLocationFromAuthoring({
        fieldsSchema,
        defaults,
        objetos: safeObjetos,
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

      const targetFieldKey = getEventLocationFieldKey(safeRole);
      const ensureResult = ensureEventLocationFields({ fieldsSchema });
      const linkResult = linkElementToField({
        fieldsSchema: ensureResult.fieldsSchema,
        fieldKey: targetFieldKey,
        elementId: selectedElementId,
        path: selectedElementFieldPath || "texto",
      });
      const nextFieldsSchema = linkResult.fieldsSchema;
      const nextDefaults = ensureDefaultsForSchema(
        nextFieldsSchema,
        buildEventLocationDefaults({
          fieldsSchema: nextFieldsSchema,
          defaults,
          location: nextLocation,
        })
      );

      if (!ensureResult.changed && !linkResult.changed && areValuesMapsEqual(nextDefaults, defaults)) {
        return false;
      }

      await commitSnapshot({
        ...snapshot,
        sourceTemplateId,
        fieldsSchema: nextFieldsSchema,
        defaults: nextDefaults,
      });

      applyEventLocationTargetsToObjects(nextFieldsSchema, nextDefaults);
      return true;
    },
    [
      applyEventLocationTargetsToObjects,
      canConfigure,
      commitSnapshot,
      defaults,
      fieldsSchema,
      safeObjetos,
      selectedElement,
      selectedElementId,
      selectedElementFieldPath,
      selectedElementType,
      snapshot,
      sourceTemplateId,
    ]
  );

  const updateEventTimes = useCallback(
    async (patch = {}) => {
      if (!canUseExistingFields) {
        throw new Error("Este borrador no esta vinculado a una plantilla base.");
      }

      const currentTimes = resolveEventTimesFromAuthoring({
        fieldsSchema,
        defaults,
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
        ? ensureEventTimeFields({ fieldsSchema })
        : {
            fieldsSchema,
            changed: false,
          };
      const nextFieldsSchema = ensureResult.fieldsSchema;
      const nextDefaults = ensureDefaultsForSchema(
        nextFieldsSchema,
        buildEventTimeDefaults({
          fieldsSchema: nextFieldsSchema,
          defaults,
          times: nextTimes,
        })
      );
      const targetsApplied = applyEventTimeTargetsToObjects(
        nextFieldsSchema,
        nextDefaults
      );

      if (
        !ensureResult.changed &&
        areValuesMapsEqual(nextDefaults, defaults)
      ) {
        return targetsApplied;
      }

      await commitSnapshot({
        ...snapshot,
        sourceTemplateId,
        fieldsSchema: nextFieldsSchema,
        defaults: nextDefaults,
      });
      return true;
    },
    [
      applyEventTimeTargetsToObjects,
      canConfigure,
      canUseExistingFields,
      commitSnapshot,
      defaults,
      fieldsSchema,
      snapshot,
      sourceTemplateId,
    ]
  );

  const linkSelectionToEventTime = useCallback(
    async (role) => {
      if (!canConfigure) {
        throw new Error("Este borrador no esta vinculado a una plantilla base.");
      }
      if (selectedElementType !== "texto" || !selectedElementId) {
        throw new Error("Selecciona un texto para vincular horas del evento.");
      }

      const safeRole = normalizeEventTimeRole(role);
      if (!safeRole) {
        throw new Error("Campo de hora invalido.");
      }

      const selectedText = normalizeText(selectedElement?.texto);
      const currentTimes = resolveEventTimesFromAuthoring({
        fieldsSchema,
        defaults,
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

      const targetFieldKey = getEventTimeFieldKey(safeRole);
      const ensureResult = ensureEventTimeFields({ fieldsSchema });
      const linkResult = linkElementToField({
        fieldsSchema: ensureResult.fieldsSchema,
        fieldKey: targetFieldKey,
        elementId: selectedElementId,
        path: selectedElementFieldPath || "texto",
      });
      const nextFieldsSchema = linkResult.fieldsSchema;
      const nextDefaults = ensureDefaultsForSchema(
        nextFieldsSchema,
        buildEventTimeDefaults({
          fieldsSchema: nextFieldsSchema,
          defaults,
          times: nextTimes,
        })
      );

      if (!ensureResult.changed && !linkResult.changed && areValuesMapsEqual(nextDefaults, defaults)) {
        return false;
      }

      await commitSnapshot({
        ...snapshot,
        sourceTemplateId,
        fieldsSchema: nextFieldsSchema,
        defaults: nextDefaults,
      });

      applyEventTimeTargetsToObjects(nextFieldsSchema, nextDefaults);
      return true;
    },
    [
      applyEventTimeTargetsToObjects,
      canConfigure,
      commitSnapshot,
      defaults,
      fieldsSchema,
      selectedElement,
      selectedElementId,
      selectedElementFieldPath,
      selectedElementType,
      snapshot,
      sourceTemplateId,
    ]
  );

  const linkSelectionToEventDate = useCallback(
    async () => {
      if (!canConfigure) {
        throw new Error("Este borrador no esta vinculado a una plantilla base.");
      }
      if (selectedElementType !== "texto" && selectedElementType !== "countdown") {
        throw new Error("Selecciona un texto o countdown para vincular la fecha del evento.");
      }
      if (!selectedElementId) {
        throw new Error("Selecciona un elemento para vincular la fecha del evento.");
      }

      const fieldKey = getEventDateFieldKey();
      const ensureResult = ensureEventDateField({ fieldsSchema });
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
      const linkedValue =
        resolveFieldValueFromLinkedCountdown({
          field: linkedField,
          objetos: safeObjetos,
          fallbackValue:
            defaults[fieldKey] ||
            (selectedElementType === "countdown" ? selectedElementDefaultValue : ""),
        }) || "";
      const nextDefaults = ensureDefaultsForSchema(nextFieldsSchema, {
        ...defaults,
        [fieldKey]: linkedValue || defaults[fieldKey] || "",
      });

      if (
        !ensureResult.changed &&
        !linkResult.changed &&
        areValuesMapsEqual(nextDefaults, defaults)
      ) {
        return false;
      }

      await commitSnapshot({
        ...snapshot,
        sourceTemplateId,
        fieldsSchema: nextFieldsSchema,
        defaults: nextDefaults,
      });

      if (linkedValue) {
        applyFieldTargetsToObjects(linkedField, linkedValue);
      }
      return true;
    },
    [
      applyFieldTargetsToObjects,
      canConfigure,
      commitSnapshot,
      defaults,
      fieldsSchema,
      safeObjetos,
      selectedElementDefaultValue,
      selectedElementFieldPath,
      selectedElementId,
      selectedElementType,
      snapshot,
      sourceTemplateId,
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
      const nextDefaults = ensureDefaultsForSchema(nextFieldsSchema, repairedResult.defaults);

      await commitSnapshot({
        ...snapshot,
        sourceTemplateId,
        fieldsSchema: nextFieldsSchema,
        defaults: nextDefaults,
      });
      syncSelectedGalleryAuthoringState(nextFieldsSchema);

      const linkedField = nextFieldsSchema.find(
        (field) => normalizeText(field?.key) === normalizeText(fieldKey)
      );
      if (isCountdownCompatibleFieldType(linkedField?.type)) {
        const linkedValue = resolveFieldValueFromLinkedCountdown({
          field: linkedField,
          objetos: safeObjetos,
          fallbackValue: nextDefaults[normalizeText(fieldKey)],
        });
        applyFieldTargetsToObjects(linkedField, linkedValue);
      }
      return true;
    },
    [
      applyFieldTargetsToObjects,
      canConfigure,
      commitSnapshot,
      defaults,
      fieldsSchema,
      safeObjetos,
      selectedElementId,
      selectedElementFieldPath,
      selectedTargetConfig,
      selectedElementType,
      selectedIsSupportedElement,
      snapshot,
      sourceTemplateId,
      syncSelectedGalleryAuthoringState,
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
    async (fieldKey, value, options = {}) => {
      if (!canUseExistingFields) {
        throw new Error("Este borrador no esta vinculado a una plantilla base.");
      }

      const safeFieldKey = normalizeText(fieldKey);
      if (!safeFieldKey) return false;

      const targetField = fieldsSchema.find(
        (field) => normalizeText(field?.key) === safeFieldKey
      );
      if (!targetField) return false;

      const shouldApplyTargets = options?.applyTargets === true;
      const targetsApplied = shouldApplyTargets
        ? applyFieldTargetsToObjects(targetField, value)
        : false;
      if (arePatchValuesEqual(defaults[safeFieldKey], value)) {
        return targetsApplied;
      }

      await commitSnapshot({
        ...snapshot,
        sourceTemplateId,
        fieldsSchema,
        defaults: ensureDefaultsForSchema(fieldsSchema, {
          ...defaults,
          [safeFieldKey]: value,
        }),
      });
      return true;
    },
    [
      applyFieldTargetsToObjects,
      canUseExistingFields,
      commitSnapshot,
      defaults,
      fieldsSchema,
      snapshot,
      sourceTemplateId,
    ]
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

      const linkedValue = resolveFieldValueFromLinkedCountdown({
        field: updateResult.field,
        objetos: safeObjetos,
        fallbackValue: defaults[safeFieldKey],
      });
      const targetsApplied = applyFieldTargetsToObjects(updateResult.field, linkedValue, {
        targetObjectIds: updateResult.targetObjectIds,
      });

      if (!updateResult.changed) return targetsApplied;

      await commitSnapshot({
        ...snapshot,
        sourceTemplateId,
        fieldsSchema: updateResult.fieldsSchema,
        defaults: ensureDefaultsForSchema(updateResult.fieldsSchema, defaults),
      });
      return true;
    },
    [
      applyFieldTargetsToObjects,
      canConfigure,
      commitSnapshot,
      defaults,
      fieldsSchema,
      safeObjetos,
      snapshot,
      sourceTemplateId,
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
          status,
        },
      })
    );
  }, [defaults, fieldsSchema, sourceTemplateId, status]);

  return {
    loading,
    saving,
    error,
    canConfigure,
    canEditSchema: canConfigure,
    canUseFields: canUseExistingFields,
    sourceTemplateId,
    fieldsSchema,
    defaults,
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
    updateFieldDateTextFormat,
    updateEventPersonNames,
    linkSelectionToEventPersonName,
    updateEventLocation,
    linkSelectionToEventLocation,
    updateEventTimes,
    linkSelectionToEventTime,
    linkSelectionToEventDate,
    getFieldUsage,
    repairSnapshot,
    reloadAvailableFields,
    getSnapshot: () => ({
      version: AUTHORING_DRAFT_VERSION,
      sourceTemplateId,
      fieldsSchema,
      defaults,
      status,
    }),
    getStatus: () => ({
      isReady: status.isReady,
      issues: Array.isArray(status.issues) ? status.issues : [],
    }),
  };
}
