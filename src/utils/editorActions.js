// src/utils/editorActions.js

import {
  isFunctionalCtaButton,
  shouldSkipFunctionalCtaDuplicate,
} from "@/domain/functionalCtaButtons";
import {
  stripFunctionalAssociationFromClonedObject,
} from "../../shared/functionalAssociations.js";
import {
  buildProtectedSectionObjectSanitizer,
  buildProtectedSectionStateSanitizer,
  canEditObject,
  canInsertIntoSection,
  filterEditableObjectIds,
} from "@/domain/editor/protectedSections";
import { cloneRenderObjectWithFreshIdentity } from "@/domain/editor/renderObjectTree";
import {
  planRedoHistoryTransition,
  planUndoHistoryTransition,
} from "../components/editor/history/historyState.js";

export function ejecutarDeshacer({
  historial,
  futuros,
  objetos = [],
  secciones = [],
  setHistorial,
  setObjetos,
  setSecciones,
  setFuturos,
  ignoreNextUpdateRef,
  restoreDynamicVisualState,
  setElementosSeleccionados,
  setMostrarPanelZ
}) {
  const transition = planUndoHistoryTransition({
    history: historial,
    future: futuros,
  });
  if (transition) {
    setElementosSeleccionados([]);
    setMostrarPanelZ(false);

    ignoreNextUpdateRef.current = (ignoreNextUpdateRef.current || 0) + 1;
    const sanitizeObjetos = buildProtectedSectionObjectSanitizer({
      currentObjetos: objetos,
      currentSecciones: secciones,
    });
    const sanitizeSecciones = buildProtectedSectionStateSanitizer({
      currentSecciones: secciones,
    });


    const nextSecciones = sanitizeSecciones(
      transition.targetSnapshot?.secciones || []
    );
    const sanitizedObjects = sanitizeObjetos(
      transition.targetSnapshot?.objetos || []
    );
    const nextObjetos =
      typeof restoreDynamicVisualState === "function"
        ? restoreDynamicVisualState(
            transition.targetSnapshot?.dynamicVisualState,
            sanitizedObjects,
            nextSecciones
          )
        : sanitizedObjects;
    setHistorial(transition.history);
    setFuturos(transition.future);
    setObjetos(nextObjetos);
    setSecciones(nextSecciones);

    return true;
  }
  return false;
}

export function ejecutarRehacer({
  historial,
  futuros,
  objetos = [],
  secciones = [],
  setFuturos,
  setHistorial,
  setObjetos,
  setSecciones,
  ignoreNextUpdateRef,
  restoreDynamicVisualState,
  setElementosSeleccionados,
  setMostrarPanelZ
}) {
  const transition = planRedoHistoryTransition({
    history: historial,
    future: futuros,
  });
  if (transition) {
    setElementosSeleccionados([]);
    setMostrarPanelZ(false);

    ignoreNextUpdateRef.current = (ignoreNextUpdateRef.current || 0) + 1;
    const sanitizeObjetos = buildProtectedSectionObjectSanitizer({
      currentObjetos: objetos,
      currentSecciones: secciones,
    });
    const sanitizeSecciones = buildProtectedSectionStateSanitizer({
      currentSecciones: secciones,
    });

    const nextSecciones = sanitizeSecciones(
      transition.targetSnapshot?.secciones || []
    );
    const sanitizedObjects = sanitizeObjetos(
      transition.targetSnapshot?.objetos || []
    );
    const nextObjetos =
      typeof restoreDynamicVisualState === "function"
        ? restoreDynamicVisualState(
            transition.targetSnapshot?.dynamicVisualState,
            sanitizedObjects,
            nextSecciones
          )
        : sanitizedObjects;
    setObjetos(nextObjetos);
    setSecciones(nextSecciones);

    setFuturos(transition.future);
    setHistorial(transition.history);
    return true;
  }
  return false;
}


export function duplicarElemento({ objetos, secciones, elementosSeleccionados, setObjetos, setElementosSeleccionados }) {
  const seleccionados = objetos.filter((o) => elementosSeleccionados.includes(o.id));
  const duplicables = seleccionados.filter(
    (o) =>
      canEditObject(o, { secciones }) &&
      o?.tipo !== "countdown" &&
      !shouldSkipFunctionalCtaDuplicate(objetos, o)
  );

  if (duplicables.length === 0) return;

  const duplicados = duplicables.map((original) => {
    const cloneSource = stripFunctionalAssociationFromClonedObject(original);
    const clonedObject = cloneRenderObjectWithFreshIdentity(cloneSource);
    return {
      ...clonedObject,
      x: original.x + 20,
      y: original.y + 20,
    };
  });

  setObjetos((prev) => [...prev, ...duplicados]);
  setElementosSeleccionados(duplicados.map((d) => d.id));
}

export function eliminarElemento({ objetos, secciones, elementosSeleccionados, setObjetos, setElementosSeleccionados, setMostrarPanelZ }) {
  if (elementosSeleccionados.length === 0) return;
  const idsAEliminar = filterEditableObjectIds(elementosSeleccionados, { objetos, secciones });
  if (idsAEliminar.length === 0) return;

  setElementosSeleccionados([]);
  setMostrarPanelZ(false);

  setTimeout(() => {
    setObjetos((prev) => prev.filter((o) => !idsAEliminar.includes(o.id)));
  }, 10);
}

export function copiarElemento({ objetos, secciones, elementosSeleccionados }) {
  const seleccionados = objetos.filter(
    (o) => elementosSeleccionados.includes(o.id) && canEditObject(o, { secciones })
  );
  if (seleccionados.length > 0) {
    window._objetosCopiados = seleccionados.map((o) => ({ ...o, id: undefined }));
  }
}

export function pegarElemento({ objetos, secciones, setObjetos, setElementosSeleccionados }) {
  const copiados = window._objetosCopiados || [];
  if (!window._objetosCopiados || window._objetosCopiados.length === 0) return;
  const offset = 30 + Math.random() * 20;
  const alreadyHasCountdown = Array.isArray(objetos)
    ? objetos.some((o) => o?.tipo === "countdown")
    : false;

  let pastedCountdown = false;
  const nuevos = [];

  copiados.forEach((c) => {
    if (!canInsertIntoSection(c?.seccionId, secciones)) {
      return;
    }

    if (c?.tipo === "countdown") {
      if (alreadyHasCountdown || pastedCountdown) return;
      pastedCountdown = true;
    }

    if (shouldSkipFunctionalCtaDuplicate(objetos, c) || nuevos.some((item) => item?.tipo === c?.tipo && isFunctionalCtaButton(c))) {
      return;
    }

    const cloneSource = stripFunctionalAssociationFromClonedObject(c);
    const clonedObject = cloneRenderObjectWithFreshIdentity(cloneSource);
    nuevos.push({
      ...clonedObject,
      x: (c.x || 100) + offset,
      y: (c.y || 100) + offset,
    });
  });

  if (nuevos.length === 0) return;

  setObjetos((prev) => [...prev, ...nuevos]);
  setElementosSeleccionados(nuevos.map((n) => n.id));
}

export function cambiarAlineacionTexto({ objetos, secciones, elementosSeleccionados, setObjetos }) {
  const alineaciones = ['left', 'center', 'right', 'justify'];

  setObjetos((prev) =>
    prev.map((o) => {
      const esTexto = o.tipo === 'texto';
      const esRectConTexto =
        o.tipo === 'forma' &&
        o.figura === 'rect' &&
        typeof o.texto === 'string';

      if (
        !elementosSeleccionados.includes(o.id) ||
        !canEditObject(o, { secciones }) ||
        (!esTexto && !esRectConTexto && !isFunctionalCtaButton(o))
      ) {
        return o;
      }

      const currentIndex = alineaciones.indexOf(o.align || 'left');
      const nextIndex = (currentIndex + 1) % alineaciones.length;
      const nuevaAlineacion = alineaciones[nextIndex];

      return { ...o, align: nuevaAlineacion };
    })
  );
}
