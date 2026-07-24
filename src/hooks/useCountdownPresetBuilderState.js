import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
} from "react";
import {
  archiveCountdownPreset,
  deleteCountdownPreset,
  duplicateCountdownPreset,
  listCountdownPresetsAdmin,
  listCountdownPresetVersionsAdmin,
  publishCountdownPresetDraft,
  saveCountdownPresetDraft,
  syncLegacyCountdownPresets,
} from "@/domain/countdownPresets/service";
import { notifyCountdownPresetCatalogChanged } from "@/domain/countdownPresets/catalogInvalidation";
import {
  buildCountdownPresetFormState,
  markCountdownPresetFormSaved,
  validateCountdownPresetFormState,
} from "@/domain/countdownPresets/builderFormModel";
import {
  buildCountdownPreviewScenario,
  countdownBuilderReducer,
  createCountdownBuilderFingerprint,
  createCountdownBuilderInitialState,
  createCountdownOperationId,
  getCountdownPresetCategoryOptions,
  resolveCountdownCatalogSelection,
  selectCountdownBuilderBusy,
  selectCountdownBuilderDirty,
  selectCountdownBuilderSelectedItem,
  selectFilteredCountdownPresetItems,
} from "@/domain/countdownPresets/builderState";
import { generateCountdownThumbnailDataUrl } from "@/domain/countdownPresets/renderModel";
import {
  normalizeCountdownFrameColorMode,
  resolveCountdownFrameAssetType,
  resolveCountdownFrameMimeType,
} from "@/domain/countdownPresets/frameAssetContract";

function getErrorMessage(error, fallback) {
  const message =
    error?.message ||
    error?.details?.message ||
    error?.details ||
    fallback;
  return typeof message === "string" ? message : fallback;
}

function dataUrlToBase64(dataUrl) {
  if (typeof dataUrl !== "string") return null;
  const parts = dataUrl.split(",");
  return parts.length < 2 ? null : parts[1] || null;
}

function createEditorSessionId() {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }
  return `countdown-editor-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 10)}`;
}

export function useCountdownPresetBuilderState() {
  const [state, dispatch] = useReducer(
    countdownBuilderReducer,
    null,
    () =>
      createCountdownBuilderInitialState(
        buildCountdownPresetFormState(null)
      )
  );
  const stateRef = useRef(state);
  const listRequestRef = useRef(0);
  const historyRequestRef = useRef(0);
  const inFlightRef = useRef(false);
  const operationIdsRef = useRef(new Map());
  const confirmationActionRef = useRef(null);
  const editorSessionIdRef = useRef(createEditorSessionId());

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const replaceSelection = useCallback((item) => {
    const formState = buildCountdownPresetFormState(item || null);
    dispatch({
      type: "selection/replaced",
      presetId: item?.id || null,
      draftVersion: item?.draftVersion ?? null,
      formState,
      validation: validateCountdownPresetFormState(formState),
    });
  }, []);

  const reload = useCallback(
    async ({
      preferredSelectedId = null,
      selectPreferred = false,
    } = {}) => {
      const requestId = ++listRequestRef.current;
      dispatch({ type: "catalog/load-started", requestId });
      try {
        const response = await listCountdownPresetsAdmin();
        if (requestId !== listRequestRef.current) return [];
        const nextItems = Array.isArray(response?.items)
          ? response.items
          : [];
        dispatch({
          type: "catalog/load-succeeded",
          requestId,
          items: nextItems,
        });

        const current = stateRef.current;
        const selectionPlan = resolveCountdownCatalogSelection({
          currentSelectionId: current?.selection?.id,
          selectionEpoch: current?.selection?.epoch,
          dirty: selectCountdownBuilderDirty(current),
          nextItems,
          preferredId: preferredSelectedId,
          selectPreferred,
        });
        if (selectionPlan.shouldReplace) {
          replaceSelection(selectionPlan.item);
        }
        return nextItems;
      } catch (error) {
        if (requestId !== listRequestRef.current) return [];
        dispatch({
          type: "catalog/load-failed",
          requestId,
          error: getErrorMessage(
            error,
            "No se pudo cargar la lista de presets."
          ),
        });
        return [];
      }
    },
    [replaceSelection]
  );

  useEffect(() => {
    void reload();
  }, [reload]);

  const changeForm = useCallback((updater, fieldId = null) => {
    const currentForm = stateRef.current.editor.form;
    const nextForm =
      typeof updater === "function" ? updater(currentForm) : updater;
    if (!nextForm || nextForm === currentForm) return;
    dispatch({
      type: "editor/changed",
      formState: nextForm,
      fieldId,
      validation: validateCountdownPresetFormState(nextForm),
    });
  }, []);

  useEffect(() => {
    const svgAsset = state.editor.form?.svgAsset;
    const frameAssetType = resolveCountdownFrameAssetType(
      svgAsset,
      svgAsset ? "svg" : null
    );
    const sourceUrl = svgAsset?.downloadUrl || svgAsset?.previewUrl;
    const hasSvgText = Boolean(String(svgAsset?.svgText || "").trim());
    if (
      frameAssetType !== "svg" ||
      !sourceUrl ||
      hasSvgText ||
      svgAsset?.isDirty
    ) {
      return undefined;
    }

    const selectionEpoch = state.selection.epoch;
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch(sourceUrl, {
          signal: controller.signal,
        });
        if (!response.ok) return;
        const svgText = await response.text();
        if (
          controller.signal.aborted ||
          !svgText.trim() ||
          stateRef.current.selection.epoch !== selectionEpoch
        ) {
          return;
        }
        changeForm(
          (current) => {
            const currentAsset = current?.svgAsset;
            const currentUrl =
              currentAsset?.downloadUrl || currentAsset?.previewUrl;
            if (
              !currentAsset ||
              currentUrl !== sourceUrl ||
              String(currentAsset.svgText || "").trim()
            ) {
              return current;
            }
            return {
              ...current,
              svgAsset: { ...currentAsset, svgText },
            };
          },
          null
        );
      } catch (error) {
        if (error?.name !== "AbortError") {
          // The persisted URL remains usable by the preview. Text hydration is optional.
        }
      }
    })();
    return () => controller.abort();
  }, [
    changeForm,
    state.editor.form?.svgAsset?.downloadUrl,
    state.editor.form?.svgAsset?.isDirty,
    state.editor.form?.svgAsset?.previewUrl,
    state.editor.form?.svgAsset?.svgText,
    state.editor.form?.svgAsset?.type,
    state.editor.form?.svgAsset?.mimeType,
    state.selection.epoch,
  ]);

  const getRetryableOperationId = useCallback((key, fingerprint) => {
    const previous = operationIdsRef.current.get(key);
    if (previous?.fingerprint === fingerprint) return previous.operationId;
    const operationId = createCountdownOperationId(key);
    operationIdsRef.current.set(key, { fingerprint, operationId });
    return operationId;
  }, []);

  const clearRetryableOperationId = useCallback((key) => {
    operationIdsRef.current.delete(key);
  }, []);

  const buildSaveRequest = useCallback(async (snapshot, operationId) => {
    const validation = validateCountdownPresetFormState(snapshot.form);
    dispatch({
      type: "editor/validation-attempted",
      validation,
    });
    if (!validation.valid) return { validation, response: null };

    const svgAsset = snapshot.form.svgAsset;
    const frameAssetType = resolveCountdownFrameAssetType(
      svgAsset,
      svgAsset ? "svg" : null
    );
    const frameMimeType = resolveCountdownFrameMimeType(
      svgAsset,
      frameAssetType
    );
    const frameColorMode = normalizeCountdownFrameColorMode(
      frameAssetType,
      svgAsset?.colorMode
    );
    const selectedPreset = selectCountdownBuilderSelectedItem(snapshot.state);
    const targetISO =
      snapshot.state.preview.targetISO ||
      new Date(Date.now() + 15 * 86400000).toISOString();
    const thumbnailDataUrl = await generateCountdownThumbnailDataUrl({
      config: validation.normalized.config,
      svgText:
        frameAssetType === "svg"
          ? (svgAsset?.svgText ||
              selectedPreset?.draft?.svgRef?.svgText ||
              selectedPreset?.svgRef?.svgText ||
              "")
          : "",
      frameImageUrl:
        frameAssetType === "png"
          ? svgAsset?.previewUrl || svgAsset?.downloadUrl || ""
          : "",
      frameAssetType,
      svgColorMode: frameColorMode,
      frameColor: validation.normalized.config.colores.frameColor,
      size: 320,
      targetISO,
    });
    const removeFrame =
      !svgAsset &&
      Boolean(
        selectedPreset?.draft?.svgRef?.storagePath ||
          selectedPreset?.svgRef?.storagePath
      );
    const response = await saveCountdownPresetDraft({
      presetId: snapshot.state.editor.presetId,
      nombre: validation.normalized.nombre,
      categoria: validation.normalized.categoria,
      expectedDraftVersion: snapshot.state.editor.draftVersion,
      editorSessionId: editorSessionIdRef.current,
      operationId,
      config: {
        ...validation.normalized.config,
        svgRef: {
          type: frameAssetType,
          mimeType: frameMimeType,
          colorMode: frameColorMode,
        },
      },
      assets: {
        removeFrame,
        frameFileName: svgAsset?.isDirty ? svgAsset.fileName : null,
        frameMimeType: svgAsset?.isDirty ? frameMimeType : null,
        frameBase64: svgAsset?.isDirty
          ? svgAsset.assetBase64 || svgAsset.svgBase64
          : null,
        thumbnailPngBase64: dataUrlToBase64(thumbnailDataUrl),
      },
    });
    return { validation, response };
  }, []);

  const saveDraft = useCallback(async () => {
    if (inFlightRef.current) return null;
    inFlightRef.current = true;
    const current = stateRef.current;
    const selectionEpoch = current.selection.epoch;
    const form = current.editor.form;
    const requestFingerprint = createCountdownBuilderFingerprint(form);
    const operationId = getRetryableOperationId("save", requestFingerprint);
    dispatch({ type: "operation/started", kind: "save" });
    try {
      const { validation, response } = await buildSaveRequest(
        { state: current, form },
        operationId
      );
      if (!response) {
        dispatch({
          type: "operation/failed",
          error: "Revisá los campos marcados antes de guardar.",
        });
        return null;
      }
      const savedForm = markCountdownPresetFormSaved(form);
      dispatch({
        type: "editor/mark-saved",
        selectionEpoch,
        requestFingerprint,
        savedForm,
        presetId: response.presetId,
        draftVersion: response.draftVersion,
        validation,
      });
      clearRetryableOperationId("save");
      await reload({
        preferredSelectedId: response.presetId,
        selectPreferred: !current.editor.presetId,
      });
      notifyCountdownPresetCatalogChanged();
      dispatch({
        type: "operation/completed",
        kind: "save",
        message: "Borrador guardado.",
      });
      return response;
    } catch (error) {
      dispatch({
        type: "operation/failed",
        error: getErrorMessage(error, "No se pudo guardar el borrador."),
      });
      return null;
    } finally {
      inFlightRef.current = false;
    }
  }, [
    buildSaveRequest,
    clearRetryableOperationId,
    getRetryableOperationId,
    reload,
  ]);

  const publishSavedDraft = useCallback(async () => {
    if (inFlightRef.current) return null;
    const current = stateRef.current;
    const dirty = selectCountdownBuilderDirty(current);
    if (
      dirty ||
      !current.editor.presetId ||
      !Number(current.editor.draftVersion)
    ) {
      dispatch({
        type: "notice/set",
        notice: {
          type: "error",
          text: dirty
            ? "Guardá o descartá los cambios antes de publicar."
            : "No hay un borrador guardado para publicar.",
        },
      });
      return null;
    }

    inFlightRef.current = true;
    const selectionEpoch = current.selection.epoch;
    const operationKey = "publish";
    const fingerprint = `${current.editor.presetId}:${current.editor.draftVersion}`;
    const operationId = getRetryableOperationId(operationKey, fingerprint);
    dispatch({ type: "operation/started", kind: "publish" });
    try {
      const response = await publishCountdownPresetDraft({
        presetId: current.editor.presetId,
        expectedDraftVersion: current.editor.draftVersion,
        operationId,
      });
      clearRetryableOperationId(operationKey);
      dispatch({ type: "editor/published", selectionEpoch });
      await reload();
      notifyCountdownPresetCatalogChanged();
      dispatch({
        type: "operation/completed",
        kind: "publish",
        message: `Versión ${Number(response?.activeVersion || 0)} publicada.`,
      });
      return response;
    } catch (error) {
      dispatch({
        type: "operation/failed",
        error: getErrorMessage(error, "No se pudo publicar el preset."),
      });
      return null;
    } finally {
      inFlightRef.current = false;
    }
  }, [
    clearRetryableOperationId,
    getRetryableOperationId,
    reload,
  ]);

  const saveAndPublish = useCallback(async () => {
    if (inFlightRef.current) return null;
    inFlightRef.current = true;
    const current = stateRef.current;
    const selectionEpoch = current.selection.epoch;
    const form = current.editor.form;
    const requestFingerprint = createCountdownBuilderFingerprint(form);
    const saveKey = "save_and_publish_save";
    const saveOperationId = getRetryableOperationId(
      saveKey,
      requestFingerprint
    );
    dispatch({ type: "operation/started", kind: "save-and-publish" });
    try {
      const { validation, response: saveResponse } = await buildSaveRequest(
        { state: current, form },
        saveOperationId
      );
      if (!saveResponse) {
        dispatch({
          type: "operation/failed",
          error: "Revisá los campos marcados antes de guardar y publicar.",
        });
        return null;
      }
      const savedForm = markCountdownPresetFormSaved(form);
      dispatch({
        type: "editor/mark-saved",
        selectionEpoch,
        requestFingerprint,
        savedForm,
        presetId: saveResponse.presetId,
        draftVersion: saveResponse.draftVersion,
        validation,
      });
      clearRetryableOperationId(saveKey);

      const publishKey = "save_and_publish_publish";
      const publishFingerprint = `${saveResponse.presetId}:${saveResponse.draftVersion}`;
      const publishOperationId = getRetryableOperationId(
        publishKey,
        publishFingerprint
      );
      const publishResponse = await publishCountdownPresetDraft({
        presetId: saveResponse.presetId,
        expectedDraftVersion: saveResponse.draftVersion,
        operationId: publishOperationId,
      });
      clearRetryableOperationId(publishKey);
      dispatch({ type: "editor/published", selectionEpoch });
      await reload({
        preferredSelectedId: saveResponse.presetId,
      });
      notifyCountdownPresetCatalogChanged();
      dispatch({
        type: "operation/completed",
        kind: "save-and-publish",
        message: `Borrador guardado y versión ${Number(
          publishResponse?.activeVersion || 0
        )} publicada.`,
      });
      return publishResponse;
    } catch (error) {
      dispatch({
        type: "operation/failed",
        error: getErrorMessage(
          error,
          "No se pudo guardar y publicar el preset."
        ),
      });
      return null;
    } finally {
      inFlightRef.current = false;
    }
  }, [
    buildSaveRequest,
    clearRetryableOperationId,
    getRetryableOperationId,
    reload,
  ]);

  const toggleArchive = useCallback(async () => {
    if (inFlightRef.current) return null;
    const current = stateRef.current;
    const selected = selectCountdownBuilderSelectedItem(current);
    if (!selected?.id || selectCountdownBuilderDirty(current)) return null;
    inFlightRef.current = true;
    const archived = selected.estado !== "archived";
    dispatch({ type: "operation/started", kind: "archive" });
    try {
      const response = await archiveCountdownPreset({
        presetId: selected.id,
        archived,
      });
      await reload();
      notifyCountdownPresetCatalogChanged();
      dispatch({
        type: "operation/completed",
        kind: "archive",
        message: archived ? "Preset archivado." : "Preset desarchivado.",
      });
      return response;
    } catch (error) {
      dispatch({
        type: "operation/failed",
        error: getErrorMessage(
          error,
          "No se pudo actualizar el estado del preset."
        ),
      });
      return null;
    } finally {
      inFlightRef.current = false;
    }
  }, [reload]);

  const removePreset = useCallback(async () => {
    if (inFlightRef.current) return null;
    const current = stateRef.current;
    const selected = selectCountdownBuilderSelectedItem(current);
    if (!selected?.id || selectCountdownBuilderDirty(current)) return null;
    inFlightRef.current = true;
    dispatch({ type: "operation/started", kind: "delete" });
    try {
      const response = await deleteCountdownPreset({
        presetId: selected.id,
      });
      await reload();
      notifyCountdownPresetCatalogChanged();
      dispatch({
        type: "operation/completed",
        kind: "delete",
        message: response?.tombstoned
          ? "Preset archivado: sus versiones y assets siguen protegidos."
          : "Borrador eliminado.",
      });
      return response;
    } catch (error) {
      dispatch({
        type: "operation/failed",
        error: getErrorMessage(error, "No se pudo eliminar el preset."),
      });
      return null;
    } finally {
      inFlightRef.current = false;
    }
  }, [reload]);

  const duplicatePreset = useCallback(async () => {
    if (inFlightRef.current) return null;
    const current = stateRef.current;
    const selected = selectCountdownBuilderSelectedItem(current);
    if (!selected?.id || selectCountdownBuilderDirty(current)) {
      dispatch({
        type: "notice/set",
        notice: {
          type: "error",
          text: "Guardá o descartá los cambios antes de duplicar.",
        },
      });
      return null;
    }
    inFlightRef.current = true;
    const operationKey = `duplicate:${selected.id}`;
    const operationId = getRetryableOperationId(
      operationKey,
      `${selected.id}:${selected.draftVersion || selected.activeVersion || 0}`
    );
    dispatch({ type: "operation/started", kind: "duplicate" });
    try {
      const response = await duplicateCountdownPreset({
        presetId: selected.id,
        operationId,
      });
      clearRetryableOperationId(operationKey);
      await reload({
        preferredSelectedId: response?.presetId,
        selectPreferred: true,
      });
      notifyCountdownPresetCatalogChanged();
      dispatch({
        type: "operation/completed",
        kind: "duplicate",
        message: "Preset duplicado como borrador independiente.",
      });
      return response;
    } catch (error) {
      dispatch({
        type: "operation/failed",
        error: getErrorMessage(error, "No se pudo duplicar el preset."),
      });
      return null;
    } finally {
      inFlightRef.current = false;
    }
  }, [
    clearRetryableOperationId,
    getRetryableOperationId,
    reload,
  ]);

  const syncLegacy = useCallback(
    async ({ presets }) => {
      if (inFlightRef.current) return null;
      if (selectCountdownBuilderDirty(stateRef.current)) {
        dispatch({
          type: "notice/set",
          notice: {
            type: "error",
            text: "Guardá o descartá los cambios antes de sincronizar compatibilidad.",
          },
        });
        return null;
      }
      inFlightRef.current = true;
      dispatch({ type: "operation/started", kind: "sync-legacy" });
      try {
        const response = await syncLegacyCountdownPresets({ presets });
        await reload();
        notifyCountdownPresetCatalogChanged();
        dispatch({
          type: "operation/completed",
          kind: "sync-legacy",
          message: `Compatibilidad sincronizada: ${Number(
            response?.created || 0
          )} creados, ${Number(response?.skipped || 0)} existentes.`,
        });
        return response;
      } catch (error) {
        dispatch({
          type: "operation/failed",
          error: getErrorMessage(
            error,
            "No se pudieron sincronizar los presets legacy."
          ),
        });
        return null;
      } finally {
        inFlightRef.current = false;
      }
    },
    [reload]
  );

  const openHistory = useCallback(async () => {
    const presetId = stateRef.current.selection.id;
    if (!presetId) return;
    const requestId = ++historyRequestRef.current;
    dispatch({ type: "history/opened", presetId });
    dispatch({
      type: "history/load-started",
      presetId,
      requestId,
    });
    try {
      const response = await listCountdownPresetVersionsAdmin({ presetId });
      dispatch({
        type: "history/load-succeeded",
        presetId,
        requestId,
        items: response?.items || [],
        activeVersion: response?.activeVersion || 0,
      });
    } catch (error) {
      dispatch({
        type: "history/load-failed",
        presetId,
        requestId,
        error: getErrorMessage(
          error,
          "No se pudo cargar el historial de versiones."
        ),
      });
    }
  }, []);

  const closeHistory = useCallback(() => {
    dispatch({ type: "history/closed" });
  }, []);

  const selectHistoryVersion = useCallback((version) => {
    dispatch({ type: "history/version-selected", version });
  }, []);

  const openConfirmation = useCallback((confirmation, action) => {
    confirmationActionRef.current = action;
    dispatch({
      type: "confirmation/opened",
      confirmation,
    });
  }, []);

  const cancelConfirmation = useCallback(() => {
    confirmationActionRef.current = null;
    dispatch({ type: "confirmation/closed" });
  }, []);

  const confirmPendingAction = useCallback(async () => {
    const action = confirmationActionRef.current;
    confirmationActionRef.current = null;
    dispatch({ type: "confirmation/closed" });
    if (typeof action === "function") await action();
  }, []);

  const selectPreset = useCallback(
    (presetId) => {
      const current = stateRef.current;
      if (presetId === current.selection.id) return;
      const target = current.catalog.items.find(
        (item) => item?.id === presetId
      );
      if (!target || selectCountdownBuilderBusy(current)) return;
      const applySelection = () => replaceSelection(target);
      if (selectCountdownBuilderDirty(current)) {
        openConfirmation(
          {
            title: "Descartar cambios locales",
            description:
              "Los cambios sin guardar se perderán al abrir otro preset.",
            confirmLabel: "Descartar y continuar",
            tone: "danger",
          },
          applySelection
        );
        return;
      }
      applySelection();
    },
    [openConfirmation, replaceSelection]
  );

  const createPreset = useCallback(() => {
    const current = stateRef.current;
    if (selectCountdownBuilderBusy(current)) return;
    const applyCreate = () => replaceSelection(null);
    if (selectCountdownBuilderDirty(current)) {
      openConfirmation(
        {
          title: "Descartar cambios locales",
          description:
            "Los cambios sin guardar se perderán al crear un preset nuevo.",
          confirmLabel: "Descartar y crear",
          tone: "danger",
        },
        applyCreate
      );
      return;
    }
    applyCreate();
  }, [openConfirmation, replaceSelection]);

  const requestDiscardChanges = useCallback(() => {
    if (!selectCountdownBuilderDirty(stateRef.current)) return;
    openConfirmation(
      {
        title: "Descartar cambios locales",
        description:
          "El formulario volverá al último borrador guardado. Esta acción no modifica Firestore.",
        confirmLabel: "Descartar cambios",
        tone: "danger",
      },
      () => dispatch({ type: "editor/discarded" })
    );
  }, [openConfirmation]);

  const requestArchiveToggle = useCallback(() => {
    const selected = selectCountdownBuilderSelectedItem(stateRef.current);
    if (!selected?.id) return;
    const restoring = selected.estado === "archived";
    openConfirmation(
      {
        title: restoring ? "Desarchivar preset" : "Archivar preset",
        description: restoring
          ? "El preset volverá al estado que corresponda según su versión activa."
          : "El preset dejará de estar disponible en el catálogo público. Sus versiones y assets no se modificarán.",
        confirmLabel: restoring ? "Desarchivar" : "Archivar",
        tone: restoring ? "primary" : "danger",
      },
      toggleArchive
    );
  }, [openConfirmation, toggleArchive]);

  const requestDeletePreset = useCallback(() => {
    const selected = selectCountdownBuilderSelectedItem(stateRef.current);
    if (!selected?.id) return;
    openConfirmation(
      {
        title: "Eliminar borrador seguro",
        description:
          "Sólo se eliminará físicamente un preset sin versiones ni referencias. Si está protegido, el backend lo convertirá en tombstone.",
        confirmLabel: "Continuar",
        tone: "danger",
      },
      removePreset
    );
  }, [openConfirmation, removePreset]);

  const requestRouteChange = useCallback(
    (navigate) => {
      if (!selectCountdownBuilderDirty(stateRef.current)) {
        navigate?.();
        return true;
      }
      openConfirmation(
        {
          title: "Salir con cambios sin guardar",
          description:
            "Los cambios locales se perderán si abandonás el constructor.",
          confirmLabel: "Salir y descartar",
          tone: "danger",
        },
        () => {
          dispatch({ type: "editor/discarded" });
          navigate?.();
        }
      );
      return false;
    },
    [openConfirmation]
  );

  const setFilter = useCallback((key, value) => {
    dispatch({ type: "filters/changed", key, value });
  }, []);

  const setPreview = useCallback((patch) => {
    dispatch({ type: "preview/changed", patch });
  }, []);

  const setPreviewScenario = useCallback((scenarioId) => {
    const currentPreview = stateRef.current.preview;
    const scenario = buildCountdownPreviewScenario(scenarioId, {
      customTargetISO: currentPreview.customTargetISO,
    });
    dispatch({
      type: "preview/changed",
      patch: scenario,
    });
  }, []);

  const setCustomPreviewTarget = useCallback((localDateTimeValue) => {
    const parsed = new Date(localDateTimeValue).getTime();
    const scenario = buildCountdownPreviewScenario("custom", {
      customTargetISO: Number.isFinite(parsed)
        ? new Date(parsed).toISOString()
        : "",
    });
    dispatch({
      type: "preview/changed",
      patch: {
        ...scenario,
        customTargetISO: String(localDateTimeValue || ""),
      },
    });
  }, []);

  const dirty = selectCountdownBuilderDirty(state);
  const selectedItem = selectCountdownBuilderSelectedItem(state);
  const filteredItems = useMemo(
    () => selectFilteredCountdownPresetItems(state),
    [state.catalog.items, state.filters]
  );
  const categoryOptions = useMemo(
    () => getCountdownPresetCategoryOptions(state.catalog.items),
    [state.catalog.items]
  );
  const busy = selectCountdownBuilderBusy(state);

  return {
    state,
    items: state.catalog.items,
    filteredItems,
    categoryOptions,
    selectedId: state.selection.id,
    selectedItem,
    formState: state.editor.form,
    dirty,
    busy,
    activeOperation: state.operation.active?.kind || null,
    loadingList: state.catalog.loading,
    listError: state.catalog.error,
    validation: state.validation,
    notice: state.notice,
    filters: state.filters,
    preview: state.preview,
    history: state.history,
    confirmation: state.confirmation,
    effectivePresetId: state.editor.presetId,
    effectiveDraftVersion: state.editor.draftVersion,
    changeForm,
    reload,
    selectPreset,
    createPreset,
    saveDraft,
    publishSavedDraft,
    saveAndPublish,
    duplicatePreset,
    syncLegacy,
    requestDiscardChanges,
    requestArchiveToggle,
    requestDeletePreset,
    requestRouteChange,
    openHistory,
    closeHistory,
    selectHistoryVersion,
    setFilter,
    setPreview,
    setPreviewScenario,
    setCustomPreviewTarget,
    clearNotice: () => dispatch({ type: "notice/clear" }),
    cancelConfirmation,
    confirmPendingAction,
  };
}
