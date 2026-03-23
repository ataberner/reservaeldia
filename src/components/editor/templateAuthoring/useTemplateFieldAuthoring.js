import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ensureDefaultsForSchema } from "../../../../shared/templates/contract.js";
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
import { validateAuthoringState } from "@/domain/templates/authoring/validation.js";
import {
  AUTHORING_DRAFT_VERSION,
  loadAuthoringState,
  saveAuthoringDraft,
} from "@/domain/templates/authoring/service.js";

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
  slug,
  editorSession = null,
  userId,
  objetos,
  selectedElement,
  draftMeta,
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
  const selectedElementId = normalizeText(selectedElement?.id);
  const selectedElementType = normalizeText(selectedElement?.tipo).toLowerCase();
  const selectedIsSupportedElement = isSupportedAuthoringElementType(selectedElementType);
  const selectedTargetConfig = resolveAuthoringTargetForElement(selectedElement) || null;
  const selectedElementFieldPath = normalizeText(selectedTargetConfig?.path) || "";
  const selectedElementDefaultFieldType = normalizeText(selectedTargetConfig?.defaultType) || "text";
  const selectedElementDefaultValue = normalizeText(selectedTargetConfig?.defaultValue);
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

  const canConfigure = enabled && Boolean(sourceTemplateId);

  const createFieldFromSelection = useCallback(
    async ({ label, type, group, optional } = {}) => {
      if (!canConfigure) {
        throw new Error("Este borrador no esta vinculado a una plantilla base.");
      }
      if (!selectedIsSupportedElement || !selectedElementId) {
        throw new Error("Selecciona un texto o countdown para crear un campo dinamico.");
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
    ]
  );

  const linkSelectionToField = useCallback(
    async (fieldKey) => {
      if (!canConfigure) {
        throw new Error("Este borrador no esta vinculado a una plantilla base.");
      }
      if (!selectedIsSupportedElement || !selectedElementId) {
        throw new Error("Selecciona un texto o countdown para vincularlo.");
      }
      if (selectedElementType === "countdown") {
        const targetField = fieldsSchema.find(
          (field) => normalizeText(field?.key) === normalizeText(fieldKey)
        );
        if (!targetField || !isCountdownCompatibleFieldType(targetField.type)) {
          throw new Error("Para countdown, vincula un campo de tipo fecha o fecha y hora.");
        }
      }

      const linkResult = linkElementToField({
        fieldsSchema,
        fieldKey,
        elementId: selectedElementId,
        path: selectedElementFieldPath || "texto",
      });
      if (!linkResult.changed) return false;

      const repairedResult = sanitizeAuthoringSchema({
        fieldsSchema: linkResult.fieldsSchema,
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
      return true;
    },
    [
      canConfigure,
      commitSnapshot,
      defaults,
      fieldsSchema,
      safeObjetos,
      selectedElementId,
      selectedElementFieldPath,
      selectedElementType,
      selectedIsSupportedElement,
      snapshot,
      sourceTemplateId,
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

  return {
    loading,
    saving,
    error,
    canConfigure,
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
