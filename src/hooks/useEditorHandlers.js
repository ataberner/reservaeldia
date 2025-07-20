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

export default function useEditorHandlers({
  objetos,
  setObjetos,
  elementosSeleccionados,
  setElementosSeleccionados,
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

  const onEliminar = useCallback(() => eliminarElemento({
    objetos,
    elementosSeleccionados,
    setObjetos,
    setElementosSeleccionados,
    setMostrarPanelZ
  }), [objetos, elementosSeleccionados]);

  const onCopiar = useCallback(() => copiarElemento({
    objetos,
    elementosSeleccionados
  }), [objetos, elementosSeleccionados]);

  const onPegar = useCallback(() => pegarElemento({
    setObjetos,
    setElementosSeleccionados
  }), []);

  const onCambiarAlineacion = useCallback(() => cambiarAlineacionTexto({
    objetos,
    elementosSeleccionados,
    setObjetos
  }), [objetos, elementosSeleccionados]);

  return {
    onDeshacer,
    onRehacer,
    onDuplicar,
    onEliminar,
    onCopiar,
    onPegar,
    onCambiarAlineacion
  };
}
