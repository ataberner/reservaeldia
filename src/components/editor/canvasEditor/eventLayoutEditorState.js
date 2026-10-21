import { normalizeEventDetailsConfig } from "../../../../shared/eventDetailsConfig.js";
import {
  applyEventLayoutObjectMutation,
  resetEventLayouts,
  transitionEventLayoutMode,
} from "../../../../shared/eventLayout.js";
import { reconcileFunctionalMutationFrame } from "./functionalRenderPose.js";

const resolveUpdate = (update, previous) =>
  typeof update === "function" ? update(previous) : update;

function reconcileExistingLayouts(state) {
  return {
    ...state,
    ...transitionEventLayoutMode({
      ...state,
      nextMode: normalizeEventDetailsConfig(state.eventDetails).mode,
      initializeMissing: false,
    }),
  };
}

// The active root coordinates, section checkpoints and mode move together.
// Hydration/history deliberately bypass initialization of legacy documents.
export function reduceEventLayoutEditorState(state, action, context = {}) {
  if (action.type === "replace") {
    return reconcileExistingLayouts({ ...state, ...action.value });
  }
  if (action.type === "replace-event-details") {
    return reconcileExistingLayouts({
      ...state,
      eventDetails: normalizeEventDetailsConfig(resolveUpdate(action.update, state.eventDetails)),
    });
  }
  if (action.type === "restore") {
    const { objetos, secciones, eventMode } = action.value;
    return reconcileExistingLayouts({
      ...state,
      objetos,
      secciones,
      eventDetails: eventMode === "single" || eventMode === "ceremony_party"
        ? { ...state.eventDetails, mode: eventMode }
        : state.eventDetails,
    });
  }
  if (action.type === "sections") {
    const secciones = resolveUpdate(action.update, state.secciones);
    return secciones === state.secciones ? state : { ...state, secciones };
  }
  if (action.type === "objects") {
    const nextObjects = reconcileFunctionalMutationFrame({
      previousObjects: state.objetos,
      nextObjects: resolveUpdate(action.update, state.objetos),
      secciones: state.secciones,
      offsets: action.options?.functionalPositionOffsets,
    });
    if (nextObjects === state.objetos) return state;
    const next = applyEventLayoutObjectMutation({
      ...context,
      ...state,
      previousObjects: state.objetos,
      nextObjects,
      reason: action.reason ?? action.options?.reason,
    });
    return { ...state, ...next };
  }
  if (action.type === "event-details") {
    const value = resolveUpdate(action.update, state.eventDetails);
    if (value === state.eventDetails) return state;
    const eventDetails = normalizeEventDetailsConfig(value);
    if (eventDetails.mode === state.eventDetails?.mode) {
      return { ...state, eventDetails };
    }
    const next = transitionEventLayoutMode({
      ...context,
      ...state,
      nextMode: eventDetails.mode,
    });
    return { ...state, ...next, eventDetails };
  }
  if (action.type === "reset") {
    return { ...state, ...resetEventLayouts({ ...context, ...state, sectionIds: action.sectionIds }) };
  }
  return state;
}
