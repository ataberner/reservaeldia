import { useCallback, useRef } from "react";

const TOUCH_MOVE_PX = 10;

function findRootHit(target, elementRefs) {
  if (!target || !elementRefs) return null;
  const roots = Object.values(elementRefs.current || {});
  if (!roots.length) return null;
  return target.findAncestor?.((node) => roots.includes(node), true) || null;
}

export default function useStageGestures({
  secciones,
  objetos,
  elementRefs,
  dragStartPos,
  hasDragged,
  seleccionActiva,
  inicioSeleccion,
  areaSeleccion,
  detectarInterseccionLinea,
  setElementosSeleccionados,
  setElementosPreSeleccionados,
  setSeleccionActiva,
  setInicioSeleccion,
  setAreaSeleccion,
  onSelectSeccion,
  cerrarMenusFlotantes,
}) {
  const touchGestureRef = useRef({
    startX: 0,
    startY: 0,
    moved: false,
    tappedSectionId: null,
    clickedOnStage: false,
    startedOnElement: false,
  });

  const resolveSectionIdFromTarget = useCallback(
    (target) => {
      if (!target) return null;
      if (target.attrs?.id && secciones.some((s) => s.id === target.attrs.id)) {
        return target.attrs.id;
      }
      return secciones.find((s) => s.id === target.parent?.attrs?.id)?.id || null;
    },
    [secciones]
  );

  const clearSelectionUI = useCallback(() => {
    setElementosSeleccionados([]);
    cerrarMenusFlotantes?.();
  }, [setElementosSeleccionados, cerrarMenusFlotantes]);

  const onMouseDown = useCallback(
    (e) => {
      const stage = e.target.getStage();
      if (!stage) return;

      const rootHit = findRootHit(e.target, elementRefs);
      if (rootHit) return;

      const clickedOnStage = e.target === stage;
      const tappedSectionId = resolveSectionIdFromTarget(e.target);

      if (!clickedOnStage && e.target.getClassName?.() !== "Image") {
        window.dispatchEvent(new Event("salir-modo-mover-fondo"));
      }

      dragStartPos.current = stage.getPointerPosition();
      hasDragged.current = false;

      const esTransformer =
        e.target.getClassName?.() === "Transformer" ||
        e.target.parent?.getClassName?.() === "Transformer" ||
        e.target.attrs?.name?.includes("_anchor");
      if (esTransformer) return;

      const esStage = clickedOnStage;
      const esSeccion = !!tappedSectionId;
      const esImagenFondo = e.target.getClassName?.() === "Image";

      if (esStage || esSeccion || esImagenFondo) {
        clearSelectionUI();

        if (esStage) {
          onSelectSeccion?.(null);
        } else if (tappedSectionId) {
          onSelectSeccion?.(tappedSectionId);
        }

        const pos = stage.getPointerPosition();
        if (!pos) return;
        setInicioSeleccion({ x: pos.x, y: pos.y });
        setAreaSeleccion({ x: pos.x, y: pos.y, width: 0, height: 0 });
        setSeleccionActiva(true);
      }
    },
    [
      elementRefs,
      resolveSectionIdFromTarget,
      dragStartPos,
      hasDragged,
      clearSelectionUI,
      onSelectSeccion,
      setInicioSeleccion,
      setAreaSeleccion,
      setSeleccionActiva,
    ]
  );

  const onTouchStart = useCallback(
    (e) => {
      const stage = e.target.getStage();
      if (!stage) return;

      const pos = stage.getPointerPosition();
      if (!pos) return;

      const rootHit = findRootHit(e.target, elementRefs);
      const clickedOnStage = e.target === stage;
      const tappedSectionId = resolveSectionIdFromTarget(e.target);

      touchGestureRef.current = {
        startX: pos.x,
        startY: pos.y,
        moved: false,
        tappedSectionId,
        clickedOnStage,
        startedOnElement: !!rootHit,
      };

      if (rootHit) return;

      if (!clickedOnStage && e.target.getClassName?.() !== "Image") {
        window.dispatchEvent(new Event("salir-modo-mover-fondo"));
      }
    },
    [elementRefs, resolveSectionIdFromTarget]
  );

  const onTouchMove = useCallback((e) => {
    const stage = e.target.getStage();
    if (!stage) return;

    const pos = stage.getPointerPosition();
    if (!pos) return;

    const dx = Math.abs(pos.x - touchGestureRef.current.startX);
    const dy = Math.abs(pos.y - touchGestureRef.current.startY);

    if (dx > TOUCH_MOVE_PX || dy > TOUCH_MOVE_PX) {
      touchGestureRef.current.moved = true;
    }
  }, []);

  const onTouchEnd = useCallback(() => {
    const g = touchGestureRef.current;
    if (g.moved) return;
    if (g.startedOnElement) return;

    clearSelectionUI();

    if (g.clickedOnStage) {
      onSelectSeccion?.(null);
      window.dispatchEvent(new Event("salir-modo-mover-fondo"));
      return;
    }

    if (g.tappedSectionId) {
      onSelectSeccion?.(g.tappedSectionId);
    }
  }, [clearSelectionUI, onSelectSeccion]);

  const onMouseMove = useCallback(
    (e) => {
      if (!seleccionActiva || !inicioSeleccion) return;
      if (window._mouseMoveThrottle) return;
      window._mouseMoveThrottle = true;

      requestAnimationFrame(() => {
        window._mouseMoveThrottle = false;

        const stage = e.target.getStage();
        const pos = stage.getPointerPosition();
        if (!pos) return;

        const area = {
          x: Math.min(inicioSeleccion.x, pos.x),
          y: Math.min(inicioSeleccion.y, pos.y),
          width: Math.abs(pos.x - inicioSeleccion.x),
          height: Math.abs(pos.y - inicioSeleccion.y),
        };

        setAreaSeleccion(area);

        if (Math.abs(area.width) > 5 || Math.abs(area.height) > 5) {
          if (window._selectionThrottle) return;
          window._selectionThrottle = true;

          requestAnimationFrame(() => {
            const ids = objetos
              .filter((obj) => {
                const node = elementRefs.current[obj.id];
                if (!node) return false;

                if (obj.tipo === "forma" && obj.figura === "line") {
                  return detectarInterseccionLinea(obj, area, stage);
                }

                const box = node.getClientRect({ relativeTo: stage });
                return (
                  box.x + box.width >= area.x &&
                  box.x <= area.x + area.width &&
                  box.y + box.height >= area.y &&
                  box.y <= area.y + area.height
                );
              })
              .map((obj) => obj.id);

            setElementosPreSeleccionados(ids);
            window._selectionThrottle = false;
          });
        }
      });
    },
    [
      seleccionActiva,
      inicioSeleccion,
      setAreaSeleccion,
      objetos,
      elementRefs,
      detectarInterseccionLinea,
      setElementosPreSeleccionados,
    ]
  );

  const onMouseUp = useCallback(
    (e) => {
      const stage = e.target.getStage();
      if (window._grupoLider) return;
      if (!seleccionActiva || !areaSeleccion) return;

      const nuevaSeleccion = objetos.filter((obj) => {
        const node = elementRefs.current[obj.id];
        if (!node) return false;

        if (obj.tipo === "forma" && obj.figura === "line") {
          return detectarInterseccionLinea(obj, areaSeleccion, stage);
        }

        try {
          const box = node.getClientRect();
          return (
            box.x + box.width >= areaSeleccion.x &&
            box.x <= areaSeleccion.x + areaSeleccion.width &&
            box.y + box.height >= areaSeleccion.y &&
            box.y <= areaSeleccion.y + areaSeleccion.height
          );
        } catch {
          return false;
        }
      });

      setElementosSeleccionados(nuevaSeleccion.map((obj) => obj.id));
      setElementosPreSeleccionados([]);
      setSeleccionActiva(false);
      setAreaSeleccion(null);

      if (window._selectionThrottle) window._selectionThrottle = false;
      if (window._boundsUpdateThrottle) window._boundsUpdateThrottle = false;
      window._lineIntersectionCache = {};
    },
    [
      seleccionActiva,
      areaSeleccion,
      objetos,
      elementRefs,
      detectarInterseccionLinea,
      setElementosSeleccionados,
      setElementosPreSeleccionados,
      setSeleccionActiva,
      setAreaSeleccion,
    ]
  );

  return {
    onMouseDown,
    onTouchStart,
    onTouchMove,
    onTouchEnd,
    onMouseMove,
    onMouseUp,
  };
}

