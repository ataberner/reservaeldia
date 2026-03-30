import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  clearEditorSelectionTransientState,
  ensureEditorSelectionRuntime,
  readEditorSelectionRuntimeSnapshot,
  setEditorCommittedSelection,
  setEditorDragVisualSelection,
  setEditorPendingDragSelection,
  syncEditorSelectionRenderState,
} from "@/lib/editorSelectionRuntime";
import { createSelectionClearPolicy } from "@/components/editor/canvasEditor/selectionClearPolicy";

function resolveTargetWindow() {
  return typeof window !== "undefined" ? window : null;
}

function normalizeSelectionIds(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((id) => String(id ?? "").trim())
    .filter((id) => id !== "");
}

function areSelectionIdListsEqual(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right)) return false;
  if (left.length !== right.length) return false;
  return left.every((id, index) => id === right[index]);
}

function normalizeMarqueeState({ selectionActive, selectionStart, selectionArea }) {
  return {
    active: selectionActive === true,
    start:
      selectionStart &&
      Number.isFinite(Number(selectionStart.x)) &&
      Number.isFinite(Number(selectionStart.y))
        ? {
            x: Number(selectionStart.x),
            y: Number(selectionStart.y),
          }
        : null,
    area:
      selectionArea &&
      Number.isFinite(Number(selectionArea.x)) &&
      Number.isFinite(Number(selectionArea.y)) &&
      Number.isFinite(Number(selectionArea.width)) &&
      Number.isFinite(Number(selectionArea.height))
        ? {
            x: Number(selectionArea.x),
            y: Number(selectionArea.y),
            width: Number(selectionArea.width),
            height: Number(selectionArea.height),
          }
        : null,
  };
}

export default function useCanvasEditorSelectionRuntime({
  elementosSeleccionados,
  elementosPreSeleccionados,
  seleccionActiva,
  inicioSeleccion,
  areaSeleccion,
  celdaGaleriaActiva,
  setElementosSeleccionados,
  setElementosPreSeleccionados,
  setSeleccionActiva,
  setInicioSeleccion,
  setAreaSeleccion,
  setBackgroundEditSectionId,
  setIsBackgroundEditInteracting,
}) {
  const latestStateRef = useRef({
    selectedIds: normalizeSelectionIds(elementosSeleccionados),
    preselectedIds: normalizeSelectionIds(elementosPreSeleccionados),
    selectionActive: seleccionActiva === true,
    selectionStart: inicioSeleccion ?? null,
    selectionArea: areaSeleccion ?? null,
    galleryCell: celdaGaleriaActiva ?? null,
  });

  const syncSelectionRenderState = useCallback((overrides = {}) => {
    const targetWindow = resolveTargetWindow();
    const currentState = latestStateRef.current;
    return syncEditorSelectionRenderState(
      {
        selectedIds:
          Object.prototype.hasOwnProperty.call(overrides, "selectedIds")
            ? overrides.selectedIds
            : currentState.selectedIds,
        preselectedIds:
          Object.prototype.hasOwnProperty.call(overrides, "preselectedIds")
            ? overrides.preselectedIds
            : currentState.preselectedIds,
        galleryCell:
          Object.prototype.hasOwnProperty.call(overrides, "galleryCell")
            ? overrides.galleryCell
            : currentState.galleryCell,
        marquee: normalizeMarqueeState({
          selectionActive:
            Object.prototype.hasOwnProperty.call(overrides, "selectionActive")
              ? overrides.selectionActive
              : currentState.selectionActive,
          selectionStart:
            Object.prototype.hasOwnProperty.call(overrides, "selectionStart")
              ? overrides.selectionStart
              : currentState.selectionStart,
          selectionArea:
            Object.prototype.hasOwnProperty.call(overrides, "selectionArea")
              ? overrides.selectionArea
              : currentState.selectionArea,
        }),
      },
      targetWindow
    );
  }, []);

  useEffect(() => {
    latestStateRef.current = {
      selectedIds: normalizeSelectionIds(elementosSeleccionados),
      preselectedIds: normalizeSelectionIds(elementosPreSeleccionados),
      selectionActive: seleccionActiva === true,
      selectionStart: inicioSeleccion ?? null,
      selectionArea: areaSeleccion ?? null,
      galleryCell: celdaGaleriaActiva ?? null,
    };
    ensureEditorSelectionRuntime(resolveTargetWindow());
    syncSelectionRenderState();
  }, [
    areaSeleccion,
    celdaGaleriaActiva,
    elementosPreSeleccionados,
    elementosSeleccionados,
    inicioSeleccion,
    seleccionActiva,
    syncSelectionRenderState,
  ]);

  useEffect(() => {
    return () => {
      const targetWindow = resolveTargetWindow();
      syncEditorSelectionRenderState(
        {
          selectedIds: [],
          preselectedIds: [],
          galleryCell: null,
          marquee: {
            active: false,
            start: null,
            area: null,
          },
        },
        targetWindow
      );
      clearEditorSelectionTransientState(
        {
          clearPendingDrag: true,
          clearDragVisual: true,
          clearMarquee: true,
        },
        targetWindow
      );
    };
  }, []);

  const readSnapshot = useCallback(
    () => readEditorSelectionRuntimeSnapshot(resolveTargetWindow()),
    []
  );

  const setCommittedSelection = useCallback(
    (ids, options = {}) => {
      const normalizedIds = normalizeSelectionIds(ids);
      setElementosSeleccionados((current) =>
        areSelectionIdListsEqual(current, normalizedIds) ? current : normalizedIds
      );
      latestStateRef.current = {
        ...latestStateRef.current,
        selectedIds: normalizedIds,
      };
      return setEditorCommittedSelection(
        normalizedIds,
        options,
        resolveTargetWindow()
      );
    },
    [setElementosSeleccionados]
  );

  const toggleCommittedSelection = useCallback(
    (id, options = {}) => {
      const safeId = String(id ?? "").trim();
      if (!safeId) return readSnapshot();

      const currentSelectedIds = normalizeSelectionIds(
        latestStateRef.current.selectedIds
      );
      const nextSelectedIds = currentSelectedIds.includes(safeId)
        ? currentSelectedIds.filter((currentId) => currentId !== safeId)
        : [...currentSelectedIds, safeId];

      setElementosSeleccionados((current) =>
        areSelectionIdListsEqual(current, nextSelectedIds)
          ? current
          : nextSelectedIds
      );
      latestStateRef.current = {
        ...latestStateRef.current,
        selectedIds: nextSelectedIds,
      };
      return setEditorCommittedSelection(
        nextSelectedIds,
        options,
        resolveTargetWindow()
      );
    },
    [readSnapshot, setElementosSeleccionados]
  );

  const setPendingDragSelection = useCallback(
    (value, options = {}) =>
      setEditorPendingDragSelection(value, options, resolveTargetWindow()),
    []
  );

  const setDragVisualSelection = useCallback(
    (value, options = {}) =>
      setEditorDragVisualSelection(value, options, resolveTargetWindow()),
    []
  );

  const clearTransientState = useCallback(
    (options = {}) => {
      const safeOptions =
        options && typeof options === "object" ? options : {};
      const clearMarquee = safeOptions.clearMarquee === true;
      const clearPreselection = safeOptions.clearPreselection === true;

      if (clearPreselection) {
        setElementosPreSeleccionados((current) =>
          Array.isArray(current) && current.length === 0 ? current : []
        );
      }

      if (clearMarquee) {
        setSeleccionActiva(false);
        setInicioSeleccion(null);
        setAreaSeleccion(null);
        if (!clearPreselection) {
          setElementosPreSeleccionados((current) =>
            Array.isArray(current) && current.length === 0 ? current : []
          );
        }
      }

      latestStateRef.current = {
        ...latestStateRef.current,
        preselectedIds: clearPreselection || clearMarquee
          ? []
          : latestStateRef.current.preselectedIds,
        selectionActive: clearMarquee ? false : latestStateRef.current.selectionActive,
        selectionStart: clearMarquee ? null : latestStateRef.current.selectionStart,
        selectionArea: clearMarquee ? null : latestStateRef.current.selectionArea,
      };

      const runtimeSnapshot = clearEditorSelectionTransientState(
        {
          ...safeOptions,
          clearMarquee,
        },
        resolveTargetWindow()
      );

      if (clearPreselection || clearMarquee) {
        syncSelectionRenderState({
          preselectedIds: [],
          selectionActive: clearMarquee
            ? false
            : latestStateRef.current.selectionActive,
          selectionStart: clearMarquee
            ? null
            : latestStateRef.current.selectionStart,
          selectionArea: clearMarquee
            ? null
            : latestStateRef.current.selectionArea,
        });
      }

      return runtimeSnapshot;
    },
    [
      setAreaSeleccion,
      setElementosPreSeleccionados,
      setInicioSeleccion,
      setSeleccionActiva,
      syncSelectionRenderState,
    ]
  );

  const clearSelectionState = useCallback(
    (options = {}) => {
      const safeOptions =
        options && typeof options === "object" ? options : {};
      const clearCommittedSelection = safeOptions.clearCommittedSelection !== false;
      const clearPreselection = safeOptions.clearPreselection !== false;
      const clearMarquee = safeOptions.clearMarquee !== false;
      const clearBackgroundEdit = safeOptions.clearBackgroundEdit === true;
      const clearBackgroundInteraction =
        safeOptions.clearBackgroundInteraction === true;

      if (clearCommittedSelection) {
        setElementosSeleccionados((current) =>
          Array.isArray(current) && current.length === 0 ? current : []
        );
      }

      if (clearPreselection) {
        setElementosPreSeleccionados((current) =>
          Array.isArray(current) && current.length === 0 ? current : []
        );
      }

      if (clearMarquee) {
        setSeleccionActiva(false);
        setInicioSeleccion(null);
        setAreaSeleccion(null);
      }

      if (clearBackgroundEdit) {
        setBackgroundEditSectionId?.(null);
      }

      if (clearBackgroundInteraction) {
        setIsBackgroundEditInteracting?.(false);
      }

      latestStateRef.current = {
        ...latestStateRef.current,
        selectedIds: clearCommittedSelection ? [] : latestStateRef.current.selectedIds,
        preselectedIds:
          clearPreselection || clearMarquee
            ? []
            : latestStateRef.current.preselectedIds,
        selectionActive: clearMarquee ? false : latestStateRef.current.selectionActive,
        selectionStart: clearMarquee ? null : latestStateRef.current.selectionStart,
        selectionArea: clearMarquee ? null : latestStateRef.current.selectionArea,
      };

      if (clearCommittedSelection) {
        setEditorCommittedSelection([], safeOptions, resolveTargetWindow());
      }

      const runtimeSnapshot = clearEditorSelectionTransientState(
        {
          clearPendingDrag: safeOptions.clearPendingDrag !== false,
          clearDragVisual: safeOptions.clearDragVisual !== false,
          clearMarquee,
        },
        resolveTargetWindow()
      );

      syncSelectionRenderState({
        selectedIds: clearCommittedSelection
          ? []
          : latestStateRef.current.selectedIds,
        preselectedIds:
          clearPreselection || clearMarquee
            ? []
            : latestStateRef.current.preselectedIds,
        selectionActive: clearMarquee ? false : latestStateRef.current.selectionActive,
        selectionStart: clearMarquee ? null : latestStateRef.current.selectionStart,
        selectionArea: clearMarquee ? null : latestStateRef.current.selectionArea,
      });

      return runtimeSnapshot;
    },
    [
      setAreaSeleccion,
      setBackgroundEditSectionId,
      setElementosPreSeleccionados,
      setElementosSeleccionados,
      setInicioSeleccion,
      setIsBackgroundEditInteracting,
      setSeleccionActiva,
      syncSelectionRenderState,
    ]
  );

  const clearPolicy = useMemo(
    () => createSelectionClearPolicy({ clearSelectionState }),
    [clearSelectionState]
  );

  return useMemo(
    () => ({
      readSnapshot,
      setCommittedSelection,
      toggleCommittedSelection,
      setPendingDragSelection,
      setDragVisualSelection,
      clearTransientState,
      clearSelectionState,
      clearPolicy,
    }),
    [
      clearPolicy,
      clearSelectionState,
      clearTransientState,
      readSnapshot,
      setCommittedSelection,
      setDragVisualSelection,
      setPendingDragSelection,
      toggleCommittedSelection,
    ]
  );
}
