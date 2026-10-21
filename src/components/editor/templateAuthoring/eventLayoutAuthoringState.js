import { normalizeEventDetailsConfig } from "../../../../shared/eventDetailsConfig.js";
import { transitionEventLayoutMode, reconcileEventLayoutMembership } from "../../../../shared/eventLayout.js";

// Authoring writes render state directly as well as publishing it to React.
// Plan once so both consumers receive the same positions, checkpoints and mode.
export function planEventLayoutAuthoringRenderState({
  previousState, nextObjects, nextSections, nextEventDetails, rsvp, gifts,
}) {
  const objetos = Array.isArray(nextObjects) ? nextObjects : previousState.objetos;
  const secciones = reconcileEventLayoutMembership({
    previousObjects: previousState.objetos,
    nextObjects: objetos,
    secciones: Array.isArray(nextSections) ? nextSections : previousState.secciones,
  });
  const eventDetails = normalizeEventDetailsConfig(nextEventDetails || previousState.eventDetails);
  if (eventDetails.mode === normalizeEventDetailsConfig(previousState.eventDetails).mode) {
    return { objetos, secciones, eventDetails };
  }
  return {
    ...transitionEventLayoutMode({
      objetos, secciones, eventDetails: previousState.eventDetails,
      nextMode: eventDetails.mode, rsvp, gifts,
    }),
    eventDetails,
  };
}

export function restoreEventMode(current, eventMode) {
  return eventMode === "single" || eventMode === "ceremony_party"
    ? { ...normalizeEventDetailsConfig(current), mode: eventMode }
    : current;
}
