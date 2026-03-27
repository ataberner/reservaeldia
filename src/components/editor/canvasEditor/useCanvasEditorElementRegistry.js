import { useCallback, useEffect, useRef } from "react";

export default function useCanvasEditorElementRegistry({
  elementRefs,
  imperativeObjects,
  mostrarPanelZ,
  setMostrarPanelZ,
  objetos,
  elementosSeleccionados,
  isMobile,
  setObjetos,
}) {
  const refEventQueuedRef = useRef(new Set());

  const registerRef = useCallback(
    (id, node) => {
      if (!node) {
        delete elementRefs.current[id];
        imperativeObjects.registerObject(id, null);
        return;
      }

      elementRefs.current[id] = node;
      imperativeObjects.registerObject(id, node);

      if (refEventQueuedRef.current.has(id)) return;
      refEventQueuedRef.current.add(id);

      requestAnimationFrame(() => {
        refEventQueuedRef.current.delete(id);
        try {
          window.dispatchEvent(
            new CustomEvent("element-ref-registrado", { detail: { id } })
          );
        } catch {}
      });
    },
    [elementRefs, imperativeObjects]
  );

  const logOptionButtonMenuDebug = useCallback(() => undefined, []);

  const togglePanelOpciones = useCallback(
    (source = "unknown", nativeEvent = null) => {
      setMostrarPanelZ((prev) => {
        const next = !prev;
        logOptionButtonMenuDebug("toggle", {
          source,
          prev,
          next,
          selectedId: elementosSeleccionados?.[0] ?? null,
          selectionCount: elementosSeleccionados.length,
          isMobile,
          nativeEventType: nativeEvent?.type ?? null,
          pointerType: nativeEvent?.pointerType ?? null,
        });
        return next;
      });
    },
    [
      elementosSeleccionados,
      isMobile,
      logOptionButtonMenuDebug,
      setMostrarPanelZ,
    ]
  );

  useEffect(() => {
    logOptionButtonMenuDebug("panel-state", {
      open: mostrarPanelZ,
      selectedId: elementosSeleccionados?.[0] ?? null,
      selectionCount: elementosSeleccionados.length,
      isMobile,
    });
  }, [
    elementosSeleccionados,
    isMobile,
    logOptionButtonMenuDebug,
    mostrarPanelZ,
  ]);

  const moverElemento = useCallback(
    (accion) => {
      const index = objetos.findIndex((o) => o.id === elementosSeleccionados[0]);
      if (index === -1) return;

      const nuevos = [...objetos];
      const [elemento] = nuevos.splice(index, 1);

      if (accion === "al-frente") {
        nuevos.push(elemento);
      } else if (accion === "al-fondo") {
        nuevos.unshift(elemento);
      } else if (accion === "subir" && index < objetos.length - 1) {
        nuevos.splice(index + 1, 0, elemento);
      } else if (accion === "bajar" && index > 0) {
        nuevos.splice(index - 1, 0, elemento);
      } else {
        nuevos.splice(index, 0, elemento);
      }

      setObjetos(nuevos);
      setMostrarPanelZ(false);
    },
    [elementosSeleccionados, objetos, setMostrarPanelZ, setObjetos]
  );

  return {
    registerRef,
    logOptionButtonMenuDebug,
    togglePanelOpciones,
    moverElemento,
  };
}
