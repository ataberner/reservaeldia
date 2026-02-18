// LineControls.jsx - VersiÃ³n optimizada para transformaciÃ³n fluida
import { Circle, Group, Line } from "react-konva";
import { useState, useRef, useEffect, useCallback } from "react";
import { startDragGrupalLider } from "@/drag/dragGrupal";
import useIsTouchLike from "@/components/editor/mobile/useIsTouchLike";


// ðŸš€ Utilidad para forzar repintado rÃ¡pido
const batchDraw = (node) => node.getLayer() && node.getLayer().batchDraw();
const DEBUG_LINE_CONTROLS = false;
const lcLog = (...args) => {
  if (!DEBUG_LINE_CONTROLS) return;
  console.log(...args);
};
const lcError = (...args) => {
  if (!DEBUG_LINE_CONTROLS) return;
  console.error(...args);
};

export default function LineControls({
  lineElement,
  elementRefs,
  onUpdateLine,
  altoCanvas,
  isDragGrupalActive = false,  // ðŸ”¥ NUEVA PROP
  elementosSeleccionados = [],
  isMobile = false,
}) {
  const [draggingPoint, setDraggingPoint] = useState(null);
  const dragStartPos = useRef(null);
  const [lineBeingDragged, setLineBeingDragged] = useState(false);
  const [isGroupDrag, setIsGroupDrag] = useState(false);
  const isTouchLike = useIsTouchLike(isMobile);
  const pointRadius = isTouchLike ? 12 : 10;
  const pointHitStrokeWidth = isTouchLike ? 44 : 28;
  const [nodePos, setNodePos] = useState({
    x: lineElement?.x || 0,
    y: lineElement?.y || 0,
  });

  // ðŸ”¥ CACHE PARA EVITAR RECÃLCULOS INNECESARIOS
  const pointsCache = useRef(null);
  const lastUpdateTime = useRef(0);
  const isValidLine =
    !!lineElement &&
    lineElement.tipo === "forma" &&
    lineElement.figura === "line";
  const lineId = lineElement?.id ?? null;
  const nodeRef = lineId ? elementRefs.current?.[lineId] : null;

  // ðŸ”¥ SYNC OPTIMIZADO CON THROTTLE
  useEffect(() => {
    if (!isValidLine || !nodeRef) return;

    const syncPos = () => {
      // ðŸš€ THROTTLE: Solo actualizar cada 8ms (120fps mÃ¡ximo)
      const now = performance.now();
      if (now - lastUpdateTime.current < 8) return;
      lastUpdateTime.current = now;

      setNodePos({ x: nodeRef.x(), y: nodeRef.y() });
    };

    syncPos();
    nodeRef.on('dragmove', syncPos);

    return () => {
      nodeRef.off('dragmove', syncPos);
    };
  }, [isValidLine, nodeRef]);



  // ðŸ”¥ DETECTAR DRAG GRUPAL MEJORADO
  useEffect(() => {
    if (!isValidLine || !lineId) {
      setIsGroupDrag(false);
      return;
    }

    const isPartOfMultipleSelection = elementosSeleccionados.length > 1;
    const isThisLineSelected = elementosSeleccionados.includes(lineId);

    setIsGroupDrag(isDragGrupalActive && isPartOfMultipleSelection && isThisLineSelected);
  }, [isValidLine, isDragGrupalActive, elementosSeleccionados, lineId]);



  // ðŸ”¥ DETECTAR DRAG DE LÃNEA Y COORDINACIÃ“N CON DRAG GRUPAL
  useEffect(() => {
    if (!isValidLine || !nodeRef || !lineId) return;

    const handleDragStart = (e) => {
      lcLog("ðŸŽ¬ [LINE CONTROLS] Drag start para lÃ­nea:", lineId);
      setLineBeingDragged(true);

      // ðŸŽ¯ COORDINACIÃ“N CON DRAG GRUPAL
      const elementosSeleccionados = window._elementosSeleccionados || [];
      lcLog("ðŸ“‹ [LINE CONTROLS] Elementos seleccionados:", elementosSeleccionados);
      lcLog("ðŸ“ [LINE CONTROLS] Â¿Esta lÃ­nea estÃ¡ en selecciÃ³n?", elementosSeleccionados.includes(lineId));
      lcLog("ðŸ”¢ [LINE CONTROLS] Â¿MÃºltiples elementos?", elementosSeleccionados.length > 1);

      if (elementosSeleccionados.length > 1 && elementosSeleccionados.includes(lineId)) {
        lcLog("ðŸŽ¯ [LINE CONTROLS] Intentando iniciar drag grupal desde lÃ­nea...");

        try {
          const isGroupLeader = startDragGrupalLider(e, lineElement);
          lcLog("ðŸ‘‘ [LINE CONTROLS] Â¿Es lÃ­der del grupo?", isGroupLeader);

          if (!isGroupLeader) {
            lcLog("ðŸš« [LINE CONTROLS] No es lÃ­der, deshabilitando drag individual...");
            setTimeout(() => {
              if (nodeRef && nodeRef.draggable) {
                const wasDraggable = nodeRef.draggable();
                nodeRef.draggable(false);
                lcLog(`ðŸ”’ [LINE CONTROLS] Drag deshabilitado para lÃ­nea ${lineId} (era: ${wasDraggable})`);
              }
            }, 0);
          } else {
            lcLog("ðŸ‘‘ [LINE CONTROLS] LÃ­nea es lÃ­der del drag grupal");
          }
        } catch (error) {
          lcError("âŒ [LINE CONTROLS] Error en drag grupal:", error);
        }
      } else {
        lcLog("ðŸ“ [LINE CONTROLS] Drag individual normal para lÃ­nea");
      }
    };

    const handleDragEnd = () => {
      lcLog("ðŸ [LINE CONTROLS] Drag end para lÃ­nea:", lineId);
      setLineBeingDragged(false);

      // Reactivar drag despuÃ©s de un breve delay
      setTimeout(() => {
        if (nodeRef && nodeRef.draggable) {
          const wasDraggable = nodeRef.draggable();
          nodeRef.draggable(true);
          lcLog(`ðŸ”“ [LINE CONTROLS] Drag reactivado para lÃ­nea ${lineId} (era: ${wasDraggable})`);
        }
      }, 100);
    };

    nodeRef.on('dragstart', handleDragStart);
    nodeRef.on('dragend', handleDragEnd);

    return () => {
      nodeRef.off('dragstart', handleDragStart);
      nodeRef.off('dragend', handleDragEnd);
    };
  }, [isValidLine, nodeRef, lineId, lineElement]);



  // ðŸ”¥ CÃLCULOS MEMOIZADOS
  const points = (isValidLine && Array.isArray(lineElement.points))
    ? lineElement.points
    : [0, 0, 100, 0];
  const puntosValidados = points.slice(0, 4).map((p, i) => {
    const punto = parseFloat(p || 0);
    return isNaN(punto) ? (i === 2 ? 100 : 0) : punto;
  });

  const [normalizedStartX, normalizedStartY, normalizedEndX, normalizedEndY] = puntosValidados;

  const startAbsoluteX = nodePos.x + normalizedStartX;
  const startAbsoluteY = nodePos.y + normalizedStartY;
  const endAbsoluteX = nodePos.x + normalizedEndX;
  const endAbsoluteY = nodePos.y + normalizedEndY;

  // ðŸ”¥ HANDLER OPTIMIZADO PARA DRAG START
  const handlePointDragStart = useCallback((pointType, e) => {
    setDraggingPoint(pointType);
    dragStartPos.current = e.target.getStage().getPointerPosition();
    e.cancelBubble = true;

    // ðŸ”¥ LIMPIAR CACHE AL INICIAR
    pointsCache.current = null;
  }, []);

  // ðŸ”¥ HANDLER ULTRA-OPTIMIZADO PARA DRAG MOVE
  const handlePointDragMove = useCallback((pointType, e) => {
    if (!isValidLine || !nodeRef || !lineId) return;
    if (draggingPoint !== pointType) return;

    const stage = e.target.getStage();
    const pointerPos = stage.getPointerPosition();
    if (!pointerPos) return;

    // ðŸš€ THROTTLE AGRESIVO: Solo cada 4ms (250fps)
    const now = performance.now();
    if (now - lastUpdateTime.current < 4) return;
    lastUpdateTime.current = now;

    // ðŸ”¥ USAR POSICIÃ“N REAL DEL NODO EN TIEMPO REAL
    const realNodeX = nodeRef.x();
    const realNodeY = nodeRef.y();
    const newPointX = pointerPos.x - realNodeX;
    const newPointY = pointerPos.y - realNodeY;

    let newPoints;
    if (pointType === 'start') {
      newPoints = [newPointX, newPointY, normalizedEndX, normalizedEndY];
    } else {
      newPoints = [normalizedStartX, normalizedStartY, newPointX, newPointY];
    }

    // ðŸš€ ACTUALIZACIÃ“N DIRECTA SIN REACT RE-RENDER
    const lineNode = elementRefs.current?.[lineId];
    if (lineNode) {
      // ðŸ”¥ SOLO ACTUALIZAR SI LOS PUNTOS CAMBIARON SIGNIFICATIVAMENTE
      const pointsStr = newPoints.join(',');
      if (pointsCache.current !== pointsStr) {
        pointsCache.current = pointsStr;

        // ðŸš€ FEEDBACK INSTANTÃNEO
        lineNode.points(newPoints);

        // ðŸ”¥ USAR requestAnimationFrame PARA BATCH DRAW Ã“PTIMO
        if (!window._lineDrawScheduled) {
          window._lineDrawScheduled = true;
          requestAnimationFrame(() => {
            batchDraw(lineNode);
            window._lineDrawScheduled = false;
          });
        }
      }
    }
  }, [isValidLine, lineId, draggingPoint, normalizedStartX, normalizedStartY, normalizedEndX, normalizedEndY, nodeRef, elementRefs]);

  // ðŸ”¥ HANDLER OPTIMIZADO PARA DRAG END
  const handlePointDragEnd = useCallback((pointType, e) => {
    if (!isValidLine || !nodeRef || !lineId) return;
    if (draggingPoint !== pointType) return;

    const stage = e.target.getStage();
    const pointerPos = stage.getPointerPosition();
    if (!pointerPos) return;

    // ðŸ”¥ USAR POSICIÃ“N REAL DEL NODO EN TIEMPO REAL
    const realNodeX = nodeRef.x();
    const realNodeY = nodeRef.y();
    const newPointX = pointerPos.x - realNodeX;
    const newPointY = pointerPos.y - realNodeY;

    let newPoints;
    if (pointType === 'start') {
      newPoints = [newPointX, newPointY, normalizedEndX, normalizedEndY];
    } else {
      newPoints = [normalizedStartX, normalizedStartY, newPointX, newPointY];
    }

    // ðŸ”¥ ACTUALIZACIÃ“N FINAL CON DEBOUNCE
    if (onUpdateLine) {
      onUpdateLine(lineId, {
        points: newPoints,
        isFinal: true
      });
    }

    setDraggingPoint(null);
    dragStartPos.current = null;
    pointsCache.current = null; // ðŸ”¥ LIMPIAR CACHE
  }, [isValidLine, lineId, draggingPoint, normalizedStartX, normalizedStartY, normalizedEndX, normalizedEndY, nodeRef, onUpdateLine]);

  if (!isValidLine || !nodeRef) return null;

  return (
    <Group name="ui">
      {/* ðŸ”¥ OCULTAR CONTROLES DURANTE DRAG INDIVIDUAL O GRUPAL */}
      {!lineBeingDragged && !isGroupDrag && (
        <>
          {/* ðŸ”´ Punto de control - INICIO */}
          <Circle
            x={startAbsoluteX}
            y={startAbsoluteY}
            radius={pointRadius}
            fill={draggingPoint === 'start' ? "#2563eb" : "#3b82f6"}
            stroke="#ffffff"
            strokeWidth={2.5}
            draggable={true}
            onDragStart={(e) => handlePointDragStart('start', e)}
            onDragMove={(e) => handlePointDragMove('start', e)}
            onDragEnd={(e) => handlePointDragEnd('start', e)}
            onMouseEnter={(e) => {
              e.target.getStage().container().style.cursor = 'crosshair';
            }}
            onMouseLeave={(e) => {
              if (!draggingPoint) {
                e.target.getStage().container().style.cursor = 'default';
              }
            }}
            shadowColor="rgba(59, 130, 246, 0.3)"
            shadowBlur={4}
            shadowOffset={{ x: 0, y: 3 }}
            // ðŸš€ OPTIMIZACIONES DE RENDIMIENTO
            perfectDrawEnabled={false}
            shadowForStrokeEnabled={false}
            hitStrokeWidth={pointHitStrokeWidth} // Ãrea de click mÃ¡s grande
          />

          {/* ðŸ”´ Punto de control - FINAL */}
          <Circle
            x={endAbsoluteX}
            y={endAbsoluteY}
            radius={pointRadius}
            fill={draggingPoint === 'end' ? "#2563eb" : "#3b82f6"}
            stroke="#ffffff"
            strokeWidth={2.5}
            draggable={true}
            onDragStart={(e) => handlePointDragStart('end', e)}
            onDragMove={(e) => handlePointDragMove('end', e)}
            onDragEnd={(e) => handlePointDragEnd('end', e)}
            onMouseEnter={(e) => {
              e.target.getStage().container().style.cursor = 'crosshair';
            }}
            onMouseLeave={(e) => {
              if (!draggingPoint) {
                e.target.getStage().container().style.cursor = 'default';
              }
            }}
            shadowColor="rgba(59, 130, 246, 0.3)"
            shadowBlur={6}
            shadowOffset={{ x: 0, y: 3 }}
            // ðŸš€ OPTIMIZACIONES DE RENDIMIENTO
            perfectDrawEnabled={false}
            shadowForStrokeEnabled={false}
            hitStrokeWidth={pointHitStrokeWidth} // Ãrea de click mÃ¡s grande
          />

          {/* ðŸ“ LÃ­nea de guÃ­a durante drag de puntos - OPTIMIZADA */}
          {draggingPoint && (
            <Line
              name="ui"
              points={[startAbsoluteX, startAbsoluteY, endAbsoluteX, endAbsoluteY]}
              stroke="rgba(119, 61, 190, 0.4)"
              strokeWidth={1}
              dash={[4, 4]}
              listening={false}
              perfectDrawEnabled={false}
              shadowForStrokeEnabled={false}
            />
          )}
        </>
      )}
    </Group>
  );
}



