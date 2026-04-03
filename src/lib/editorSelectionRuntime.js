const EDITOR_SELECTION_RUNTIME_WINDOW_KEY = "__EDITOR_SELECTION_RUNTIME__";

function resolveTargetWindow(targetWindow) {
  if (targetWindow && typeof targetWindow === "object") return targetWindow;
  return typeof window !== "undefined" ? window : null;
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeSelectionIds(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((id) => String(id ?? "").trim())
    .filter((id) => id !== "");
}

function cloneSelectionIds(value) {
  return Array.isArray(value) ? [...value] : [];
}

function normalizeGalleryCell(value) {
  if (!isRecord(value)) return null;

  const objId = String(value.objId ?? "").trim();
  const index = Number(value.index);
  if (!objId || !Number.isFinite(index)) return null;

  return {
    objId,
    index,
  };
}

function cloneGalleryCell(value) {
  return value ? { ...value } : null;
}

function normalizePoint(value) {
  if (!isRecord(value)) return null;
  const x = Number(value.x);
  const y = Number(value.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;

  return { x, y };
}

function clonePoint(value) {
  return value ? { ...value } : null;
}

function normalizeArea(value) {
  if (!isRecord(value)) return null;

  const x = Number(value.x);
  const y = Number(value.y);
  const width = Number(value.width);
  const height = Number(value.height);

  if (
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    !Number.isFinite(width) ||
    !Number.isFinite(height)
  ) {
    return null;
  }

  return {
    x,
    y,
    width,
    height,
  };
}

function cloneArea(value) {
  return value ? { ...value } : null;
}

function createEmptyMarqueeState() {
  return {
    active: false,
    start: null,
    area: null,
  };
}

function normalizeMarquee(value) {
  const safeValue = isRecord(value) ? value : {};
  return {
    active: safeValue.active === true,
    start: normalizePoint(safeValue.start),
    area: normalizeArea(safeValue.area),
  };
}

function cloneMarquee(value) {
  return {
    active: value?.active === true,
    start: clonePoint(value?.start),
    area: cloneArea(value?.area),
  };
}

function normalizePendingDragSelection(value) {
  if (!isRecord(value)) {
    return {
      id: null,
      phase: null,
    };
  }

  const id = String(value.id ?? "").trim();
  const phase = String(value.phase ?? "").trim();
  const safePhase =
    phase === "predrag" || phase === "deferred-drag" ? phase : null;

  return {
    id: id || null,
    phase: safePhase,
  };
}

function clonePendingDragSelection(value) {
  return {
    id: value?.id || null,
    phase: value?.phase || null,
  };
}

function createEmptyDragVisualSelection() {
  return {
    ids: [],
    predragActive: false,
    sessionKey: null,
    dragId: null,
  };
}

function normalizeDragVisualSelection(value) {
  const safeValue = isRecord(value) ? value : {};
  const sessionKey = String(safeValue.sessionKey ?? "").trim();
  const dragId = String(safeValue.dragId ?? "").trim();
  return {
    ids: normalizeSelectionIds(safeValue.ids),
    predragActive: safeValue.predragActive === true,
    sessionKey: sessionKey || null,
    dragId: dragId || null,
  };
}

function cloneDragVisualSelection(value) {
  return {
    ids: cloneSelectionIds(value?.ids),
    predragActive: value?.predragActive === true,
    sessionKey: value?.sessionKey || null,
    dragId: value?.dragId || null,
  };
}

export function createEmptyEditorSelectionRuntimeSnapshot() {
  return {
    selectedIds: [],
    preselectedIds: [],
    galleryCell: null,
    marquee: createEmptyMarqueeState(),
    pendingDragSelection: {
      id: null,
      phase: null,
    },
    dragVisualSelection: createEmptyDragVisualSelection(),
  };
}

function cloneSnapshot(snapshot) {
  return {
    selectedIds: cloneSelectionIds(snapshot?.selectedIds),
    preselectedIds: cloneSelectionIds(snapshot?.preselectedIds),
    galleryCell: cloneGalleryCell(snapshot?.galleryCell),
    marquee: cloneMarquee(snapshot?.marquee),
    pendingDragSelection: clonePendingDragSelection(
      snapshot?.pendingDragSelection
    ),
    dragVisualSelection: cloneDragVisualSelection(
      snapshot?.dragVisualSelection
    ),
  };
}

function readLegacySelectionSnapshotFromWindow(targetWindow) {
  return {
    selectedIds: normalizeSelectionIds(targetWindow?._elementosSeleccionados),
    preselectedIds: [],
    galleryCell: normalizeGalleryCell(targetWindow?._celdaGaleriaActiva),
    marquee: createEmptyMarqueeState(),
    pendingDragSelection: normalizePendingDragSelection({
      id: targetWindow?._pendingDragSelectionId ?? null,
      phase: targetWindow?._pendingDragSelectionPhase ?? null,
    }),
    dragVisualSelection: createEmptyDragVisualSelection(),
  };
}

function mirrorCommittedSelection(targetWindow, selectedIds, mirrorLegacy = true) {
  if (!targetWindow || mirrorLegacy !== true) return;
  targetWindow._elementosSeleccionados = cloneSelectionIds(selectedIds);
}

function mirrorGalleryCell(targetWindow, galleryCell) {
  if (!targetWindow) return;
  targetWindow._celdaGaleriaActiva = cloneGalleryCell(galleryCell);
}

function mirrorPendingDragSelection(targetWindow, pendingDragSelection) {
  if (!targetWindow) return;
  targetWindow._pendingDragSelectionId = pendingDragSelection?.id || null;
  targetWindow._pendingDragSelectionPhase =
    pendingDragSelection?.phase || null;
}

function isEditorSelectionRuntimeApi(value) {
  return Boolean(
    value &&
      typeof value === "object" &&
      typeof value.getSnapshot === "function" &&
      typeof value.hasInitialized === "function" &&
      typeof value.syncRenderState === "function" &&
      typeof value.setCommittedSelection === "function" &&
      typeof value.toggleCommittedSelection === "function" &&
      typeof value.setPendingDragSelection === "function" &&
      typeof value.setDragVisualSelection === "function" &&
      typeof value.clearTransientState === "function"
  );
}

function createEditorSelectionRuntime(targetWindow) {
  const state = {
    initialized: false,
    snapshot: createEmptyEditorSelectionRuntimeSnapshot(),
  };

  const api = Object.freeze({
    getSnapshot() {
      return cloneSnapshot(state.snapshot);
    },
    hasInitialized() {
      return state.initialized === true;
    },
    syncRenderState(nextState = {}) {
      const safeState = isRecord(nextState) ? nextState : {};
      state.initialized = true;
      state.snapshot = {
        ...state.snapshot,
        selectedIds: normalizeSelectionIds(safeState.selectedIds),
        preselectedIds: normalizeSelectionIds(safeState.preselectedIds),
        galleryCell: normalizeGalleryCell(safeState.galleryCell),
        marquee: normalizeMarquee(safeState.marquee),
      };
      mirrorCommittedSelection(targetWindow, state.snapshot.selectedIds, true);
      mirrorGalleryCell(targetWindow, state.snapshot.galleryCell);
      return cloneSnapshot(state.snapshot);
    },
    setCommittedSelection(ids, options = {}) {
      const safeOptions = isRecord(options) ? options : {};
      state.initialized = true;
      state.snapshot = {
        ...state.snapshot,
        selectedIds: normalizeSelectionIds(ids),
      };
      mirrorCommittedSelection(
        targetWindow,
        state.snapshot.selectedIds,
        safeOptions.mirrorLegacy !== false
      );
      return cloneSnapshot(state.snapshot);
    },
    toggleCommittedSelection(id, options = {}) {
      const safeId = String(id ?? "").trim();
      if (!safeId) return cloneSnapshot(state.snapshot);

      const safeOptions = isRecord(options) ? options : {};
      const selectedIds = cloneSelectionIds(state.snapshot.selectedIds);
      const nextSelectedIds = selectedIds.includes(safeId)
        ? selectedIds.filter((currentId) => currentId !== safeId)
        : [...selectedIds, safeId];

      state.initialized = true;
      state.snapshot = {
        ...state.snapshot,
        selectedIds: nextSelectedIds,
      };
      mirrorCommittedSelection(
        targetWindow,
        state.snapshot.selectedIds,
        safeOptions.mirrorLegacy !== false
      );
      return cloneSnapshot(state.snapshot);
    },
    setPendingDragSelection(value) {
      state.initialized = true;
      state.snapshot = {
        ...state.snapshot,
        pendingDragSelection: normalizePendingDragSelection(value),
      };
      mirrorPendingDragSelection(targetWindow, state.snapshot.pendingDragSelection);
      return cloneSnapshot(state.snapshot);
    },
    setDragVisualSelection(value) {
      state.initialized = true;
      state.snapshot = {
        ...state.snapshot,
        dragVisualSelection: normalizeDragVisualSelection(value),
      };
      return cloneSnapshot(state.snapshot);
    },
    clearTransientState(options = {}) {
      const safeOptions = isRecord(options) ? options : {};
      const clearPendingDrag = safeOptions.clearPendingDrag !== false;
      const clearDragVisual = safeOptions.clearDragVisual !== false;
      const clearMarquee = safeOptions.clearMarquee === true;

      state.initialized = true;
      state.snapshot = {
        ...state.snapshot,
        pendingDragSelection: clearPendingDrag
          ? normalizePendingDragSelection(null)
          : state.snapshot.pendingDragSelection,
        dragVisualSelection: clearDragVisual
          ? createEmptyDragVisualSelection()
          : state.snapshot.dragVisualSelection,
        marquee: clearMarquee
          ? createEmptyMarqueeState()
          : state.snapshot.marquee,
      };

      if (clearPendingDrag) {
        mirrorPendingDragSelection(targetWindow, state.snapshot.pendingDragSelection);
      }

      return cloneSnapshot(state.snapshot);
    },
  });

  return api;
}

function getSelectionRuntime(targetWindow) {
  const resolvedWindow = resolveTargetWindow(targetWindow);
  if (!resolvedWindow) return null;
  const runtime = resolvedWindow[EDITOR_SELECTION_RUNTIME_WINDOW_KEY];
  return isEditorSelectionRuntimeApi(runtime) ? runtime : null;
}

export function ensureEditorSelectionRuntime(targetWindow) {
  const resolvedWindow = resolveTargetWindow(targetWindow);
  if (!resolvedWindow) return null;

  const existingRuntime = getSelectionRuntime(resolvedWindow);
  if (existingRuntime) return existingRuntime;

  const runtime = createEditorSelectionRuntime(resolvedWindow);
  Object.defineProperty(resolvedWindow, EDITOR_SELECTION_RUNTIME_WINDOW_KEY, {
    value: runtime,
    configurable: true,
  });
  return runtime;
}

export function readEditorSelectionRuntimeSnapshot(targetWindow) {
  const resolvedWindow = resolveTargetWindow(targetWindow);
  if (!resolvedWindow) return createEmptyEditorSelectionRuntimeSnapshot();

  const runtime = getSelectionRuntime(resolvedWindow);
  if (runtime?.hasInitialized()) {
    return runtime.getSnapshot();
  }

  return cloneSnapshot(readLegacySelectionSnapshotFromWindow(resolvedWindow));
}

export function syncEditorSelectionRenderState(nextState = {}, targetWindow) {
  const runtime = ensureEditorSelectionRuntime(targetWindow);
  if (!runtime) return createEmptyEditorSelectionRuntimeSnapshot();
  return runtime.syncRenderState(nextState);
}

export function setEditorCommittedSelection(
  ids,
  options = {},
  targetWindow
) {
  const runtime = ensureEditorSelectionRuntime(targetWindow);
  if (!runtime) return createEmptyEditorSelectionRuntimeSnapshot();
  return runtime.setCommittedSelection(ids, options);
}

export function toggleEditorCommittedSelection(
  id,
  options = {},
  targetWindow
) {
  const runtime = ensureEditorSelectionRuntime(targetWindow);
  if (!runtime) return createEmptyEditorSelectionRuntimeSnapshot();
  return runtime.toggleCommittedSelection(id, options);
}

export function setEditorPendingDragSelection(
  value,
  options = {},
  targetWindow
) {
  void options;
  const runtime = ensureEditorSelectionRuntime(targetWindow);
  if (!runtime) return createEmptyEditorSelectionRuntimeSnapshot();
  return runtime.setPendingDragSelection(value);
}

export function setEditorDragVisualSelection(
  value,
  options = {},
  targetWindow
) {
  void options;
  const runtime = ensureEditorSelectionRuntime(targetWindow);
  if (!runtime) return createEmptyEditorSelectionRuntimeSnapshot();
  return runtime.setDragVisualSelection(value);
}

export function clearEditorSelectionTransientState(
  options = {},
  targetWindow
) {
  const runtime = ensureEditorSelectionRuntime(targetWindow);
  if (!runtime) return createEmptyEditorSelectionRuntimeSnapshot();
  return runtime.clearTransientState(options);
}
