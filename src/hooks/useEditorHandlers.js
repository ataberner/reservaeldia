import { useCallback } from 'react';
import {
  ejecutarDeshacer,
  ejecutarRehacer,
  duplicarElemento,
  eliminarElemento,
  copiarElemento,
  pegarElemento,
  cambiarAlineacionTexto
} from '@/utils/editorActions';
import {
  buildGroupedSelectionState,
  buildUngroupedSelectionState,
  createEditorGroupId,
} from '@/domain/editor/grouping';
import {
  setGroupFunctionalAssociation,
} from '../../shared/functionalAssociations.js';
import {
  resolveSelectionUnionRect,
} from '@/components/editor/textSystem/render/konva/selectionBoundsGeometry';
import {
  applyKeyboardNudgeToCanvasSelection,
} from '@/domain/editor/canvasObjectPositioning';
import {
  calcularOffsetY,
  convertirAbsARel,
  determinarNuevaSeccion,
} from '@/utils/layout';
import {
  normalizarAltoModo,
} from '@/components/editor/canvasEditor/canvasEditorCoreUtils';
import { filterEditableObjectIds } from '@/domain/editor/protectedSections';

export default function useEditorHandlers({
  objetos,
  setObjetos,
  secciones,
  elementosSeleccionados,
  setElementosSeleccionados,
  selectionRuntime,
  elementRefs,
  ALTURA_PANTALLA_EDITOR,
  historial,
  setHistorial,
  futuros,
  setFuturos,
  setSecciones,
  ignoreNextUpdateRef,
  setMostrarPanelZ,
  onRequestDelete = null,
  restoreDynamicVisualState = null,
}) {
  const onDeshacer = useCallback(() => ejecutarDeshacer({
    historial,
    futuros,
    objetos,
    secciones,
    setHistorial,
    setObjetos,
    setSecciones,
    setFuturos,
    ignoreNextUpdateRef,
    restoreDynamicVisualState,
    setElementosSeleccionados,
    setMostrarPanelZ
  }), [historial, futuros, objetos, restoreDynamicVisualState, secciones]);

  const onRehacer = useCallback(() => ejecutarRehacer({
    historial,
    futuros,
    objetos,
    secciones,
    setFuturos,
    setHistorial,
    setObjetos,
    setSecciones,
    ignoreNextUpdateRef,
    restoreDynamicVisualState,
    setElementosSeleccionados,
    setMostrarPanelZ
  }), [futuros, historial, objetos, restoreDynamicVisualState, secciones]);

  const onDuplicar = useCallback(() => duplicarElemento({
    objetos,
    secciones,
    elementosSeleccionados,
    setObjetos,
    setElementosSeleccionados
  }), [objetos, elementosSeleccionados]);

const onEliminar = useCallback(() => {
  const editableSelectedIds = filterEditableObjectIds(elementosSeleccionados, {
    objetos,
    secciones,
  });
  if (
    editableSelectedIds.length > 0 &&
    typeof onRequestDelete === "function" &&
    onRequestDelete({ selectedIds: editableSelectedIds }) === true
  ) {
    return;
  }

  // 🔹 Limpiar hover inmediato
  if (typeof window !== 'undefined' && window.setHoverIdGlobal) {
    window.setHoverIdGlobal(null);
  }

  // 🔹 Limpiar referencias si existen en window
  if (window._elementRefs && elementosSeleccionados.length > 0) {
    elementosSeleccionados.forEach(id => {
      delete window._elementRefs[id];
    });
  }

  // 🔹 Ejecutar la eliminación real
  eliminarElemento({
    objetos,
    secciones,
    elementosSeleccionados,
    setObjetos,
    setElementosSeleccionados,
    setMostrarPanelZ
  });
}, [
  elementosSeleccionados,
  objetos,
  onRequestDelete,
  secciones,
  setElementosSeleccionados,
  setMostrarPanelZ,
  setObjetos,
]);


  const onCopiar = useCallback(() => copiarElemento({
    objetos,
    secciones,
    elementosSeleccionados
  }), [objetos, secciones, elementosSeleccionados]);

  const onPegar = useCallback(() => pegarElemento({
    objetos,
    secciones,
    setObjetos,
    setElementosSeleccionados
  }), [objetos, secciones, setObjetos, setElementosSeleccionados]);

  const onCambiarAlineacion = useCallback(() => cambiarAlineacionTexto({
    objetos,
    secciones,
    elementosSeleccionados,
    setObjetos
  }), [objetos, secciones, elementosSeleccionados]);

  const onMoverSeleccion = useCallback(({ deltaX = 0, deltaY = 0 } = {}) => {
    const seccionesOrdenadas = [...secciones].sort(
      (left, right) => Number(left?.orden ?? 0) - Number(right?.orden ?? 0)
    );
    const esSeccionPantallaById = (seccionId) => {
      const seccion = seccionesOrdenadas.find((item) => item?.id === seccionId);
      return normalizarAltoModo(seccion?.altoModo) === "pantalla";
    };

    setObjetos((prev) => {
      const result = applyKeyboardNudgeToCanvasSelection({
        objetos: prev,
        selectedIds: elementosSeleccionados,
        seccionesOrdenadas,
        deltaX,
        deltaY,
        calcularOffsetY,
        determinarNuevaSeccion,
        convertirAbsARel,
        esSeccionPantallaById,
        ALTURA_PANTALLA_EDITOR,
      });
      return result.changed ? result.objetos : prev;
    });
  }, [
    ALTURA_PANTALLA_EDITOR,
    elementosSeleccionados,
    secciones,
    setObjetos,
  ]);

  const onAgrupar = useCallback((options = {}) => {
    const selectionFrame = resolveSelectionUnionRect({
      selectedElements: elementosSeleccionados,
      elementRefs,
      objetos,
      requireLiveNodes: true,
    });
    if (!selectionFrame) return false;

    const result = buildGroupedSelectionState({
      objetos,
      secciones,
      selectedIds: elementosSeleccionados,
      selectionFrame,
      alturaPantalla: ALTURA_PANTALLA_EDITOR,
      groupId: createEditorGroupId(),
    });
    if (!result?.ok) return false;

    setMostrarPanelZ(false);
    selectionRuntime?.clearTransientState?.({
      clearPreselection: true,
      clearMarquee: true,
    });
    let nextObjetos = result.nextObjetos;
    let nextSecciones = secciones;
    const functionalAssociation =
      options && typeof options === "object" ? options.functionalAssociation : null;
    if (functionalAssociation) {
      const functionalResult = setGroupFunctionalAssociation({
        secciones,
        objetos: nextObjetos,
        groupId: result.group?.id,
        association: functionalAssociation,
      });
      if (functionalResult?.changed) {
        nextObjetos = functionalResult.objetos;
        nextSecciones = functionalResult.secciones;
      }
    }

    if (nextSecciones !== secciones) {
      setSecciones(nextSecciones);
    }
    setObjetos(nextObjetos);

    if (typeof selectionRuntime?.setCommittedSelection === "function") {
      selectionRuntime.setCommittedSelection(result.selectedIds, {
        source: "grouping-action",
      });
    } else {
      setElementosSeleccionados(result.selectedIds);
    }

    return {
      ok: true,
      groupId: result.group?.id || null,
      selectedIds: result.selectedIds,
    };
  }, [
    ALTURA_PANTALLA_EDITOR,
    elementRefs,
    elementosSeleccionados,
    objetos,
    secciones,
    selectionRuntime,
    setElementosSeleccionados,
    setMostrarPanelZ,
    setObjetos,
    setSecciones,
  ]);

  const onDesagrupar = useCallback(() => {
    const result = buildUngroupedSelectionState({
      objetos,
      secciones,
      selectedIds: elementosSeleccionados,
      alturaPantalla: ALTURA_PANTALLA_EDITOR,
    });
    if (!result?.ok) return false;

    setMostrarPanelZ(false);
    selectionRuntime?.clearTransientState?.({
      clearPreselection: true,
      clearMarquee: true,
    });
    setObjetos(result.nextObjetos);

    if (typeof selectionRuntime?.setCommittedSelection === "function") {
      selectionRuntime.setCommittedSelection(result.selectedIds, {
        source: "ungrouping-action",
      });
    } else {
      setElementosSeleccionados(result.selectedIds);
    }

    return true;
  }, [
    ALTURA_PANTALLA_EDITOR,
    elementosSeleccionados,
    objetos,
    secciones,
    selectionRuntime,
    setElementosSeleccionados,
    setMostrarPanelZ,
    setObjetos,
  ]);

  return {
    onDeshacer,
    onRehacer,
    onDuplicar,
    onEliminar,
    onCopiar,
    onPegar,
    onCambiarAlineacion,
    onMoverSeleccion,
    onAgrupar,
    onDesagrupar,
  };
}
