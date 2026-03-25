export const EDITOR_SNAPSHOT_ADAPTER_VERSION = 1;

const EDITOR_SNAPSHOT_WINDOW_KEY = "editorSnapshot";
const EDITOR_SNAPSHOT_CONTROLLER_KEY = "__EDITOR_SNAPSHOT_CONTROLLER__";

function resolveTargetWindow(targetWindow) {
  if (targetWindow && typeof targetWindow === "object") return targetWindow;
  return typeof window !== "undefined" ? window : null;
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function sortSections(secciones) {
  if (!Array.isArray(secciones)) return null;
  return [...secciones].sort(
    (left, right) => Number(left?.orden ?? 0) - Number(right?.orden ?? 0)
  );
}

function cloneSnapshotValue(value) {
  if (value === null || typeof value === "undefined") return value ?? null;

  if (typeof globalThis.structuredClone === "function") {
    try {
      return globalThis.structuredClone(value);
    } catch {
      // Fallback below keeps the adapter resilient for plain render payloads.
    }
  }

  return JSON.parse(JSON.stringify(value));
}

function computeSectionInfo(secciones, id) {
  const safeId = String(id || "").trim();
  if (!safeId || !Array.isArray(secciones)) return null;

  const idx = secciones.findIndex((item) => item?.id === safeId);
  if (idx < 0) return null;

  const top = secciones
    .slice(0, idx)
    .reduce(
      (total, section) => total + Number(section?.altura ?? section?.height ?? 400),
      0
    );
  const height = Number(secciones[idx]?.altura ?? secciones[idx]?.height ?? 400);

  return {
    idx,
    top,
    height,
  };
}

function readLegacyRenderSnapshotFromWindow(targetWindow) {
  if (!targetWindow) return null;

  const objetos = Array.isArray(targetWindow._objetosActuales)
    ? targetWindow._objetosActuales
    : null;
  const secciones = Array.isArray(targetWindow._seccionesOrdenadas)
    ? targetWindow._seccionesOrdenadas
    : null;
  const rsvp =
    targetWindow._rsvpConfigActual && typeof targetWindow._rsvpConfigActual === "object"
      ? targetWindow._rsvpConfigActual
      : null;
  const gifts =
    targetWindow._giftsConfigActual && typeof targetWindow._giftsConfigActual === "object"
      ? targetWindow._giftsConfigActual
      : targetWindow._giftConfigActual && typeof targetWindow._giftConfigActual === "object"
        ? targetWindow._giftConfigActual
        : null;

  if (!objetos || !secciones) return null;

  return cloneSnapshotValue({
    objetos,
    secciones,
    rsvp,
    gifts,
  });
}

function readLegacyObjectSnapshotFromWindow(targetWindow, id) {
  const safeId = String(id || "").trim();
  if (!targetWindow || !safeId) return null;

  const objetos = Array.isArray(targetWindow._objetosActuales)
    ? targetWindow._objetosActuales
    : [];
  const objectMatch = objetos.find((item) => item?.id === safeId) || null;
  return objectMatch ? cloneSnapshotValue(objectMatch) : null;
}

function readLegacySectionInfoFromWindow(targetWindow, id) {
  if (!targetWindow) return null;
  return computeSectionInfo(targetWindow._seccionesOrdenadas, id);
}

function isSnapshotAdapterApi(value) {
  return Boolean(
    value &&
      typeof value === "object" &&
      typeof value.getRenderSnapshot === "function" &&
      typeof value.getSectionInfo === "function" &&
      typeof value.getObjectById === "function"
  );
}

function createEditorSnapshotController() {
  const state = {
    renderState: {
      objetos: null,
      secciones: null,
      rsvp: null,
      gifts: null,
    },
    resolvers: {
      getSectionInfo: null,
      getObjectById: null,
    },
  };

  const api = Object.freeze({
    version: EDITOR_SNAPSHOT_ADAPTER_VERSION,
    getRenderSnapshot() {
      const { objetos, secciones, rsvp, gifts } = state.renderState;
      if (!Array.isArray(objetos) || !Array.isArray(secciones)) return null;

      return cloneSnapshotValue({
        objetos,
        secciones,
        rsvp: isRecord(rsvp) ? rsvp : null,
        gifts: isRecord(gifts) ? gifts : null,
      });
    },
    getSectionInfo(id) {
      const sectionInfo =
        typeof state.resolvers.getSectionInfo === "function"
          ? state.resolvers.getSectionInfo(id)
          : computeSectionInfo(state.renderState.secciones, id);
      return sectionInfo ? cloneSnapshotValue(sectionInfo) : null;
    },
    getObjectById(id) {
      const safeId = String(id || "").trim();
      if (!safeId) return null;

      const objectMatch =
        typeof state.resolvers.getObjectById === "function"
          ? state.resolvers.getObjectById(safeId)
          : Array.isArray(state.renderState.objetos)
            ? state.renderState.objetos.find((item) => item?.id === safeId) || null
            : null;
      return objectMatch ? cloneSnapshotValue(objectMatch) : null;
    },
  });

  return {
    api,
    setRenderState(nextState = {}) {
      state.renderState = {
        objetos: Array.isArray(nextState.objetos) ? nextState.objetos : null,
        secciones: Array.isArray(nextState.secciones)
          ? sortSections(nextState.secciones)
          : null,
        rsvp: isRecord(nextState.rsvp) ? nextState.rsvp : null,
        gifts: isRecord(nextState.gifts) ? nextState.gifts : null,
      };
    },
    clearRenderState() {
      state.renderState = {
        objetos: null,
        secciones: null,
        rsvp: null,
        gifts: null,
      };
    },
    setResolvers(nextResolvers = {}) {
      if (Object.prototype.hasOwnProperty.call(nextResolvers, "getSectionInfo")) {
        state.resolvers.getSectionInfo =
          typeof nextResolvers.getSectionInfo === "function"
            ? nextResolvers.getSectionInfo
            : null;
      }

      if (Object.prototype.hasOwnProperty.call(nextResolvers, "getObjectById")) {
        state.resolvers.getObjectById =
          typeof nextResolvers.getObjectById === "function"
            ? nextResolvers.getObjectById
            : null;
      }
    },
    clearResolvers() {
      state.resolvers = {
        getSectionInfo: null,
        getObjectById: null,
      };
    },
  };
}

function getOrCreateController(targetWindow) {
  const resolvedWindow = resolveTargetWindow(targetWindow);
  if (!resolvedWindow) return null;

  let controller = resolvedWindow[EDITOR_SNAPSHOT_CONTROLLER_KEY] || null;

  if (!controller || !isSnapshotAdapterApi(controller.api)) {
    controller = createEditorSnapshotController();
    Object.defineProperty(resolvedWindow, EDITOR_SNAPSHOT_CONTROLLER_KEY, {
      value: controller,
      configurable: true,
    });
  }

  if (resolvedWindow[EDITOR_SNAPSHOT_WINDOW_KEY] !== controller.api) {
    Object.defineProperty(resolvedWindow, EDITOR_SNAPSHOT_WINDOW_KEY, {
      value: controller.api,
      configurable: true,
    });
  }

  return controller;
}

export function ensureEditorSnapshotAdapter(targetWindow) {
  return getOrCreateController(targetWindow)?.api || null;
}

export function syncEditorSnapshotRenderState(nextState = {}, targetWindow) {
  const controller = getOrCreateController(targetWindow);
  if (!controller) return null;
  controller.setRenderState(nextState);
  return controller.api;
}

export function clearEditorSnapshotRenderState(targetWindow) {
  const controller = getOrCreateController(targetWindow);
  if (!controller) return;
  controller.clearRenderState();
}

export function syncEditorSnapshotResolvers(nextResolvers = {}, targetWindow) {
  const controller = getOrCreateController(targetWindow);
  if (!controller) return null;
  controller.setResolvers(nextResolvers);
  return controller.api;
}

export function clearEditorSnapshotResolvers(targetWindow) {
  const controller = getOrCreateController(targetWindow);
  if (!controller) return;
  controller.clearResolvers();
}

export function getEditorSnapshotAdapter(targetWindow) {
  const resolvedWindow = resolveTargetWindow(targetWindow);
  if (!resolvedWindow) return null;

  const adapter = resolvedWindow[EDITOR_SNAPSHOT_WINDOW_KEY];
  return isSnapshotAdapterApi(adapter) ? adapter : ensureEditorSnapshotAdapter(resolvedWindow);
}

export function readEditorRenderSnapshot(targetWindow) {
  const resolvedWindow = resolveTargetWindow(targetWindow);
  if (!resolvedWindow) return null;

  const adapter = getEditorSnapshotAdapter(resolvedWindow);
  const nextSnapshot =
    adapter && typeof adapter.getRenderSnapshot === "function"
      ? adapter.getRenderSnapshot()
      : null;

  return nextSnapshot || readLegacyRenderSnapshotFromWindow(resolvedWindow);
}

export function readEditorSectionInfo(targetWindow, id) {
  const resolvedWindow = resolveTargetWindow(targetWindow);
  if (!resolvedWindow) return null;

  const adapter = getEditorSnapshotAdapter(resolvedWindow);
  const nextInfo =
    adapter && typeof adapter.getSectionInfo === "function"
      ? adapter.getSectionInfo(id)
      : null;

  return nextInfo || readLegacySectionInfoFromWindow(resolvedWindow, id);
}

export function readEditorObjectSnapshot(targetWindow, id) {
  const resolvedWindow = resolveTargetWindow(targetWindow);
  if (!resolvedWindow) return null;

  const adapter = getEditorSnapshotAdapter(resolvedWindow);
  const nextObject =
    adapter && typeof adapter.getObjectById === "function"
      ? adapter.getObjectById(id)
      : null;

  return nextObject || readLegacyObjectSnapshotFromWindow(resolvedWindow, id);
}
