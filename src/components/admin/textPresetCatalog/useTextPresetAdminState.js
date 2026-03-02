import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { buildLegacyTextPresetSeed } from "@/domain/textPresets/legacyAdapter";
import {
  deleteTextPreset,
  duplicateTextPreset,
  listTextPresetsAdmin,
  setTextPresetActivation,
  setTextPresetVisibility,
  syncLegacyTextPresets,
  upsertTextPreset,
} from "./textPresetAdminApi";
import {
  createDefaultTextPreset,
  filterTextPresetCollection,
  mapTextPresetCollection,
  mapTextPresetItem,
  toPresetSavePayload,
} from "./textPresetMappers";

function getErrorMessage(error, fallback) {
  const message =
    error?.message ||
    error?.details?.message ||
    error?.details ||
    fallback;

  return typeof message === "string" ? message : fallback;
}

export function useTextPresetAdminState() {
  const hasAutoSyncedRef = useRef(false);

  const [loadingList, setLoadingList] = useState(false);
  const [listError, setListError] = useState("");
  const [items, setItems] = useState([]);
  const [flashMessage, setFlashMessage] = useState(null);

  const [searchInput, setSearchInput] = useState("");
  const [selectedTipo, setSelectedTipo] = useState("all");
  const [selectedCategoria, setSelectedCategoria] = useState("all");
  const [selectedActivo, setSelectedActivo] = useState("all");
  const [selectedVisible, setSelectedVisible] = useState("all");

  const [selectedEditPreset, setSelectedEditPreset] = useState(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [syncingLegacy, setSyncingLegacy] = useState(false);
  const [busyById, setBusyById] = useState({});

  const setBusy = useCallback((id, key, value) => {
    if (!id || !key) return;
    setBusyById((prev) => ({
      ...prev,
      [id]: {
        ...(prev[id] || {}),
        [key]: value,
      },
    }));
  }, []);

  const clearFlashMessage = useCallback(() => {
    setFlashMessage(null);
  }, []);

  const pushFlashMessage = useCallback((type, text) => {
    setFlashMessage({ type, text, createdAt: Date.now() });
  }, []);

  const reload = useCallback(async ({ trySyncLegacy = true } = {}) => {
    setLoadingList(true);
    setListError("");

    try {
      const response = await listTextPresetsAdmin();
      const mapped = mapTextPresetCollection(response?.items);

      if (
        trySyncLegacy &&
        !hasAutoSyncedRef.current &&
        Array.isArray(mapped) &&
        mapped.length === 0
      ) {
        hasAutoSyncedRef.current = true;
        try {
          setSyncingLegacy(true);
          const seed = buildLegacyTextPresetSeed();
          await syncLegacyTextPresets({ presets: seed });
          const secondResponse = await listTextPresetsAdmin();
          const secondMapped = mapTextPresetCollection(secondResponse?.items);
          setItems(secondMapped);
          if (secondMapped.length > 0) {
            pushFlashMessage("success", `Se migraron ${secondMapped.length} presets legacy de texto.`);
          }
          return;
        } catch (syncError) {
          setItems(mapped);
          pushFlashMessage(
            "warning",
            getErrorMessage(syncError, "No se pudo sincronizar presets legacy automaticamente.")
          );
          return;
        } finally {
          setSyncingLegacy(false);
        }
      }

      setItems(mapped);
    } catch (error) {
      setItems([]);
      setListError(getErrorMessage(error, "No se pudo cargar la lista de presets de texto."));
    } finally {
      setLoadingList(false);
    }
  }, [pushFlashMessage]);

  useEffect(() => {
    reload({ trySyncLegacy: true });
  }, [reload]);

  const categoryOptions = useMemo(() => {
    const set = new Set();
    for (const item of items) {
      if (item?.categoria) set.add(item.categoria);
    }
    return ["boda", "quince", "cumple", "empresarial", "general"]
      .filter((value) => set.has(value) || value === "general");
  }, [items]);

  const filteredItems = useMemo(
    () =>
      filterTextPresetCollection(items, {
        query: searchInput,
        tipo: selectedTipo,
        categoria: selectedCategoria,
        activo: selectedActivo,
        mostrarEnEditor: selectedVisible,
      }),
    [items, searchInput, selectedActivo, selectedCategoria, selectedTipo, selectedVisible]
  );

  const summaryStats = useMemo(() => {
    const total = items.length;
    const active = items.filter((item) => item.activo).length;
    const visible = items.filter((item) => item.mostrarEnEditor).length;
    const simple = items.filter((item) => item.tipo === "simple").length;
    const compuesto = total - simple;

    return {
      total,
      active,
      inactive: total - active,
      visible,
      hidden: total - visible,
      simple,
      compuesto,
    };
  }, [items]);

  const openEditPreset = useCallback((presetId) => {
    if (!presetId) return;
    const target = items.find((item) => item.id === presetId);
    if (!target) return;

    setSelectedEditPreset({
      ...target,
      tags: Array.isArray(target.tags) ? target.tags : [],
      items: Array.isArray(target.items) ? target.items : [],
    });
  }, [items]);

  const openCreatePreset = useCallback(() => {
    const defaults = createDefaultTextPreset();
    const maxOrder = items.reduce((acc, item) => Math.max(acc, Number(item?.orden || 0)), 0);
    setSelectedEditPreset({
      ...defaults,
      orden: maxOrder + 1,
    });
  }, [items]);

  const closeEditPreset = useCallback(() => {
    setSelectedEditPreset(null);
  }, []);

  const savePreset = useCallback(async (draftPreset) => {
    setSavingEdit(true);
    try {
      const payload = toPresetSavePayload(draftPreset);
      const response = await upsertTextPreset(payload);
      const saved = mapTextPresetItem(response?.item || draftPreset);

      setItems((prev) => {
        const existingIndex = prev.findIndex((entry) => entry.id === saved.id);
        if (existingIndex === -1) {
          return [...prev, saved].sort((left, right) => {
            const orderDiff = Number(left.orden || 0) - Number(right.orden || 0);
            if (orderDiff !== 0) return orderDiff;
            return String(left.nombre || "").localeCompare(String(right.nombre || ""));
          });
        }

        const next = [...prev];
        next[existingIndex] = saved;
        return next.sort((left, right) => {
          const orderDiff = Number(left.orden || 0) - Number(right.orden || 0);
          if (orderDiff !== 0) return orderDiff;
          return String(left.nombre || "").localeCompare(String(right.nombre || ""));
        });
      });

      setSelectedEditPreset(saved);
      pushFlashMessage("success", "Preset guardado correctamente.");
      return saved;
    } catch (error) {
      const message = getErrorMessage(error, "No se pudo guardar el preset.");
      pushFlashMessage("error", message);
      throw error;
    } finally {
      setSavingEdit(false);
    }
  }, [pushFlashMessage]);

  const duplicatePresetById = useCallback(async (presetId) => {
    if (!presetId) return;
    setBusy(presetId, "duplicate", true);
    try {
      const response = await duplicateTextPreset({ presetId });
      const duplicated = mapTextPresetItem(response?.item || {});
      setItems((prev) => [...prev, duplicated].sort((left, right) => Number(left.orden || 0) - Number(right.orden || 0)));
      pushFlashMessage("success", "Preset duplicado en modo inactivo y oculto.");
    } catch (error) {
      pushFlashMessage("error", getErrorMessage(error, "No se pudo duplicar el preset."));
    } finally {
      setBusy(presetId, "duplicate", false);
    }
  }, [pushFlashMessage, setBusy]);

  const toggleActivation = useCallback(async (preset) => {
    if (!preset?.id) return;
    const next = !(preset.activo === true);

    setBusy(preset.id, "activation", true);
    try {
      await setTextPresetActivation({ presetId: preset.id, activo: next });
      setItems((prev) => prev.map((item) => (item.id === preset.id ? { ...item, activo: next } : item)));
      if (selectedEditPreset?.id === preset.id) {
        setSelectedEditPreset((prev) => (prev ? { ...prev, activo: next } : prev));
      }
      pushFlashMessage("success", next ? "Preset activado." : "Preset desactivado.");
    } catch (error) {
      pushFlashMessage("error", getErrorMessage(error, "No se pudo cambiar el estado activo."));
    } finally {
      setBusy(preset.id, "activation", false);
    }
  }, [pushFlashMessage, selectedEditPreset?.id, setBusy]);

  const toggleVisibility = useCallback(async (preset) => {
    if (!preset?.id) return;
    const next = !(preset.mostrarEnEditor === true);

    setBusy(preset.id, "visibility", true);
    try {
      await setTextPresetVisibility({ presetId: preset.id, mostrarEnEditor: next });
      setItems((prev) =>
        prev.map((item) => (item.id === preset.id ? { ...item, mostrarEnEditor: next } : item))
      );
      if (selectedEditPreset?.id === preset.id) {
        setSelectedEditPreset((prev) => (prev ? { ...prev, mostrarEnEditor: next } : prev));
      }
      pushFlashMessage("success", next ? "Preset visible en editor." : "Preset oculto en editor.");
    } catch (error) {
      pushFlashMessage("error", getErrorMessage(error, "No se pudo cambiar visibilidad."));
    } finally {
      setBusy(preset.id, "visibility", false);
    }
  }, [pushFlashMessage, selectedEditPreset?.id, setBusy]);

  const removePresetById = useCallback(async (presetId) => {
    if (!presetId) return;
    setBusy(presetId, "delete", true);
    try {
      await deleteTextPreset({ presetId });
      setItems((prev) => prev.filter((item) => item.id !== presetId));
      if (selectedEditPreset?.id === presetId) {
        setSelectedEditPreset(null);
      }
      pushFlashMessage("success", "Preset eliminado.");
    } catch (error) {
      pushFlashMessage("error", getErrorMessage(error, "No se pudo eliminar el preset."));
    } finally {
      setBusy(presetId, "delete", false);
    }
  }, [pushFlashMessage, selectedEditPreset?.id, setBusy]);

  const syncLegacyNow = useCallback(async () => {
    setSyncingLegacy(true);
    try {
      const presets = buildLegacyTextPresetSeed();
      const response = await syncLegacyTextPresets({ presets });
      const created = Number(response?.created || 0);
      const skipped = Number(response?.skipped || 0);
      await reload({ trySyncLegacy: false });
      pushFlashMessage("success", `Legacy sync completada: ${created} creados, ${skipped} omitidos.`);
    } catch (error) {
      pushFlashMessage("error", getErrorMessage(error, "No se pudo sincronizar legacy."));
    } finally {
      setSyncingLegacy(false);
    }
  }, [pushFlashMessage, reload]);

  return {
    loadingList,
    listError,
    items,
    filteredItems,
    summaryStats,
    categoryOptions,

    searchInput,
    selectedTipo,
    selectedCategoria,
    selectedActivo,
    selectedVisible,

    selectedEditPreset,
    savingEdit,
    syncingLegacy,
    busyById,
    flashMessage,

    setSearchInput,
    setSelectedTipo,
    setSelectedCategoria,
    setSelectedActivo,
    setSelectedVisible,

    clearFlashMessage,
    reload,
    openEditPreset,
    openCreatePreset,
    closeEditPreset,
    savePreset,
    duplicatePresetById,
    toggleActivation,
    toggleVisibility,
    removePresetById,
    syncLegacyNow,
  };
}
