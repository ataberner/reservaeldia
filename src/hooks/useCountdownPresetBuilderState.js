import { useCallback, useEffect, useMemo, useState } from "react";
import {
  archiveCountdownPreset,
  deleteCountdownPreset,
  listCountdownPresetsAdmin,
  publishCountdownPresetDraft,
  saveCountdownPresetDraft,
  syncLegacyCountdownPresets,
} from "@/domain/countdownPresets/service";

function getErrorMessage(error, fallback) {
  const message =
    error?.message ||
    error?.details?.message ||
    error?.details ||
    fallback;
  return typeof message === "string" ? message : fallback;
}

export function useCountdownPresetBuilderState() {
  const [items, setItems] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [loadingList, setLoadingList] = useState(false);
  const [listError, setListError] = useState("");
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [syncingLegacy, setSyncingLegacy] = useState(false);
  const [lastMessage, setLastMessage] = useState("");

  const reload = useCallback(
    async ({ keepSelected = true } = {}) => {
      setLoadingList(true);
      setListError("");
      try {
        const response = await listCountdownPresetsAdmin();
        const nextItems = Array.isArray(response?.items) ? response.items : [];
        setItems(nextItems);
        setSelectedId((prev) => {
          if (!keepSelected) return nextItems[0]?.id || null;
          if (prev && nextItems.some((item) => item.id === prev)) return prev;
          return nextItems[0]?.id || null;
        });
      } catch (error) {
        setItems([]);
        setListError(getErrorMessage(error, "No se pudo cargar la lista de presets."));
      } finally {
        setLoadingList(false);
      }
    },
    []
  );

  useEffect(() => {
    reload({ keepSelected: true });
  }, [reload]);

  const selectedItem = useMemo(
    () => items.find((item) => item.id === selectedId) || null,
    [items, selectedId]
  );

  const saveDraft = useCallback(
    async (payload) => {
      setSaving(true);
      setLastMessage("");
      try {
        const response = await saveCountdownPresetDraft(payload);
        const presetId = response?.presetId || payload?.presetId || null;
        await reload({ keepSelected: true });
        if (presetId) setSelectedId(presetId);
        setLastMessage("Borrador guardado.");
        return response;
      } finally {
        setSaving(false);
      }
    },
    [reload]
  );

  const publishDraft = useCallback(
    async ({ presetId, expectedDraftVersion }) => {
      setPublishing(true);
      setLastMessage("");
      try {
        const response = await publishCountdownPresetDraft({
          presetId,
          expectedDraftVersion,
        });
        await reload({ keepSelected: true });
        setLastMessage("Preset publicado.");
        return response;
      } finally {
        setPublishing(false);
      }
    },
    [reload]
  );

  const toggleArchive = useCallback(
    async ({ presetId, archived }) => {
      setArchiving(true);
      setLastMessage("");
      try {
        const response = await archiveCountdownPreset({ presetId, archived });
        await reload({ keepSelected: true });
        setLastMessage(archived ? "Preset archivado." : "Preset restaurado.");
        return response;
      } finally {
        setArchiving(false);
      }
    },
    [reload]
  );

  const syncLegacy = useCallback(
    async ({ presets }) => {
      setSyncingLegacy(true);
      setLastMessage("");
      setListError("");
      try {
        const response = await syncLegacyCountdownPresets({ presets });
        await reload({ keepSelected: true });
        const created = Number(response?.created || 0);
        const skipped = Number(response?.skipped || 0);
        setLastMessage(
          `Legacy sincronizados: ${created} creados, ${skipped} ya existentes.`
        );
        return response;
      } catch (error) {
        setListError(getErrorMessage(error, "No se pudieron sincronizar los presets legacy."));
        return null;
      } finally {
        setSyncingLegacy(false);
      }
    },
    [reload]
  );

  const removePreset = useCallback(
    async ({ presetId }) => {
      setDeleting(true);
      setLastMessage("");
      try {
        const response = await deleteCountdownPreset({ presetId });
        await reload({ keepSelected: true });
        setLastMessage("Preset eliminado.");
        return response;
      } finally {
        setDeleting(false);
      }
    },
    [reload]
  );

  return {
    items,
    selectedId,
    selectedItem,
    loadingList,
    listError,
    saving,
    publishing,
    archiving,
    deleting,
    syncingLegacy,
    lastMessage,
    setSelectedId,
    reload,
    saveDraft,
    publishDraft,
    toggleArchive,
    syncLegacy,
    removePreset,
  };
}
