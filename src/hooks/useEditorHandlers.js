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
  resolveSelectionUnionRect,
} from '@/components/editor/textSystem/render/konva/selectionBoundsGeometry';

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
  setMostrarPanelZ
}) {
  const onDeshacer = useCallback(() => ejecutarDeshacer({
    historial,
    setHistorial,
    setObjetos,
    setSecciones,
    setFuturos,
    ignoreNextUpdateRef,
    setElementosSeleccionados,
    setMostrarPanelZ
  }), [historial, futuros]);

  const onRehacer = useCallback(() => ejecutarRehacer({
    futuros,
    setFuturos,
    setHistorial,
    setObjetos,
    setSecciones,
    ignoreNextUpdateRef,
    setElementosSeleccionados,
    setMostrarPanelZ
  }), [futuros]);

  const onDuplicar = useCallback(() => duplicarElemento({
    objetos,
    elementosSeleccionados,
    setObjetos,
    setElementosSeleccionados
  }), [objetos, elementosSeleccionados]);

const onEliminar = useCallback(() => {
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
    elementosSeleccionados,
    setObjetos,
    setElementosSeleccionados,
    setMostrarPanelZ
  });
}, [objetos, elementosSeleccionados]);


  const onCopiar = useCallback(() => copiarElemento({
    objetos,
    elementosSeleccionados
  }), [objetos, elementosSeleccionados]);

  const onPegar = useCallback(() => pegarElemento({
    objetos,
    setObjetos,
    setElementosSeleccionados
  }), [objetos, setObjetos, setElementosSeleccionados]);

  const onCambiarAlineacion = useCallback(() => cambiarAlineacionTexto({
    objetos,
    elementosSeleccionados,
    setObjetos
  }), [objetos, elementosSeleccionados]);

  const onAgrupar = useCallback(() => {
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
    setObjetos(result.nextObjetos);

    if (typeof selectionRuntime?.setCommittedSelection === "function") {
      selectionRuntime.setCommittedSelection(result.selectedIds, {
        source: "grouping-action",
      });
    } else {
      setElementosSeleccionados(result.selectedIds);
    }

    return true;
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
    onAgrupar,
    onDesagrupar,
  };
}
