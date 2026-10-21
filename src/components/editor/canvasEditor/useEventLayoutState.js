import { useCallback, useRef, useState } from "react";
import { normalizeEventDetailsConfig } from "../../../../shared/eventDetailsConfig.js";
import { reduceEventLayoutEditorState } from "./eventLayoutEditorState.js";

export default function useEventLayoutState({ rsvp, gifts }) {
  const [state, setState] = useState(() => ({
    objetos: [],
    secciones: [],
    eventDetails: normalizeEventDetailsConfig(null),
  }));
  const contextRef = useRef({ rsvp, gifts });
  contextRef.current = { rsvp, gifts };
  const dispatch = useCallback((action) => {
    const context = contextRef.current;
    setState(previous => reduceEventLayoutEditorState(previous, action, context));
  }, []);
  const setObjetos = useCallback((update, options) =>
    dispatch({ type: "objects", update, reason: options?.reason, options }), [dispatch]);
  const setSecciones = useCallback(update => dispatch({ type: "sections", update }), [dispatch]);
  const setEventDetails = useCallback(update => dispatch({ type: "event-details", update }), [dispatch]);
  const replaceCanvasState = useCallback(value => dispatch({ type: "replace", value }), [dispatch]);
  const restoreCanvasState = useCallback(value => dispatch({ type: "restore", value }), [dispatch]);
  const resetEventLayout = useCallback(sectionIds => dispatch({ type: "reset", sectionIds }), [dispatch]);
  const replaceObjects = useCallback(update => setState(previous => ({
    ...previous,
    objetos: typeof update === "function" ? update(previous.objetos) : update,
  })), []);
  const replaceEventDetails = useCallback(update =>
    dispatch({ type: "replace-event-details", update }), [dispatch]);
  return {
    ...state,
    setObjetos,
    setSecciones,
    setEventDetails,
    replaceCanvasState,
    restoreCanvasState,
    replaceObjects,
    replaceEventDetails,
    resetEventLayout,
  };
}
