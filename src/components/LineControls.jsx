// LineControls.jsx - Versión optimizada para transformación fluida
import { Circle, Group, Line } from "react-konva";
import { useState, useRef, useEffect, useCallback } from "react";
import { startDragGrupalLider } from "@/drag/dragGrupal";


// 🚀 Utilidad para forzar repintado rápido
const batchDraw = (node) => node.getLayer() && node.getLayer().batchDraw();

export default function LineControls({
  lineElement,
  elementRefs,
  onUpdateLine,
  altoCanvas,
  isDragGrupalActive = false,  // 🔥 NUEVA PROP
  elementosSeleccionados = []
}) {
  const [draggingPoint, setDraggingPoint] = useState(null);
  const dragStartPos = useRef(null);
  const [lineBeingDragged, setLineBeingDragged] = useState(false);
  const [isGroupDrag, setIsGroupDrag] = useState(false);
  const [nodePos, setNodePos] = useState({
    x: lineElement.x || 0,
    y: lineElement.y || 0,
  });

  // 🔥 CACHE PARA EVITAR RECÁLCULOS INNECESARIOS
  const pointsCache = useRef(null);
  const lastUpdateTime = useRef(0);

  if (!lineElement || lineElement.tipo !== 'forma' || lineElement.figura !== 'line') {
    return null;
  }

  const nodeRef = elementRefs.current?.[lineElement.id];
  if (!nodeRef) return null;

  // 🔥 SYNC OPTIMIZADO CON THROTTLE
  useEffect(() => {
    if (!nodeRef) return;

    const syncPos = () => {
      // 🚀 THROTTLE: Solo actualizar cada 8ms (120fps máximo)
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
  }, [nodeRef]);



  // 🔥 DETECTAR DRAG GRUPAL MEJORADO
  useEffect(() => {
    const isPartOfMultipleSelection = elementosSeleccionados.length > 1;
    const isThisLineSelected = elementosSeleccionados.includes(lineElement.id);

    setIsGroupDrag(isDragGrupalActive && isPartOfMultipleSelection && isThisLineSelected);
  }, [isDragGrupalActive, elementosSeleccionados, lineElement.id]);



  // 🔥 DETECTAR DRAG DE LÍNEA Y COORDINACIÓN CON DRAG GRUPAL
  useEffect(() => {
    if (!nodeRef) return;

    const handleDragStart = (e) => {
      console.log("🎬 [LINE CONTROLS] Drag start para línea:", lineElement.id);
      setLineBeingDragged(true);

      // 🎯 COORDINACIÓN CON DRAG GRUPAL
      const elementosSeleccionados = window._elementosSeleccionados || [];
      console.log("📋 [LINE CONTROLS] Elementos seleccionados:", elementosSeleccionados);
      console.log("📏 [LINE CONTROLS] ¿Esta línea está en selección?", elementosSeleccionados.includes(lineElement.id));
      console.log("🔢 [LINE CONTROLS] ¿Múltiples elementos?", elementosSeleccionados.length > 1);

      if (elementosSeleccionados.length > 1 && elementosSeleccionados.includes(lineElement.id)) {
        console.log("🎯 [LINE CONTROLS] Intentando iniciar drag grupal desde línea...");

        try {
          const isGroupLeader = startDragGrupalLider(e, lineElement);
          console.log("👑 [LINE CONTROLS] ¿Es líder del grupo?", isGroupLeader);

          if (!isGroupLeader) {
            console.log("🚫 [LINE CONTROLS] No es líder, deshabilitando drag individual...");
            setTimeout(() => {
              if (nodeRef && nodeRef.draggable) {
                const wasDraggable = nodeRef.draggable();
                nodeRef.draggable(false);
                console.log(`🔒 [LINE CONTROLS] Drag deshabilitado para línea ${lineElement.id} (era: ${wasDraggable})`);
              }
            }, 0);
          } else {
            console.log("👑 [LINE CONTROLS] Línea es líder del drag grupal");
          }
        } catch (error) {
          console.error("❌ [LINE CONTROLS] Error en drag grupal:", error);
        }
      } else {
        console.log("📏 [LINE CONTROLS] Drag individual normal para línea");
      }
    };

    const handleDragEnd = () => {
      console.log("🏁 [LINE CONTROLS] Drag end para línea:", lineElement.id);
      setLineBeingDragged(false);

      // Reactivar drag después de un breve delay
      setTimeout(() => {
        if (nodeRef && nodeRef.draggable) {
          const wasDraggable = nodeRef.draggable();
          nodeRef.draggable(true);
          console.log(`🔓 [LINE CONTROLS] Drag reactivado para línea ${lineElement.id} (era: ${wasDraggable})`);
        }
      }, 100);
    };

    nodeRef.on('dragstart', handleDragStart);
    nodeRef.on('dragend', handleDragEnd);

    return () => {
      nodeRef.off('dragstart', handleDragStart);
      nodeRef.off('dragend', handleDragEnd);
    };
  }, [nodeRef, lineElement.id, lineElement]);



  // 🔥 CÁLCULOS MEMOIZADOS
  const points = lineElement.points || [0, 0, 100, 0];
  const puntosValidados = points.slice(0, 4).map((p, i) => {
    const punto = parseFloat(p || 0);
    return isNaN(punto) ? (i === 2 ? 100 : 0) : punto;
  });

  const [normalizedStartX, normalizedStartY, normalizedEndX, normalizedEndY] = puntosValidados;

  const startAbsoluteX = nodePos.x + normalizedStartX;
  const startAbsoluteY = nodePos.y + normalizedStartY;
  const endAbsoluteX = nodePos.x + normalizedEndX;
  const endAbsoluteY = nodePos.y + normalizedEndY;

  // 🔥 HANDLER OPTIMIZADO PARA DRAG START
  const handlePointDragStart = useCallback((pointType, e) => {
    setDraggingPoint(pointType);
    dragStartPos.current = e.target.getStage().getPointerPosition();
    e.cancelBubble = true;

    // 🔥 LIMPIAR CACHE AL INICIAR
    pointsCache.current = null;
  }, []);

  // 🔥 HANDLER ULTRA-OPTIMIZADO PARA DRAG MOVE
  const handlePointDragMove = useCallback((pointType, e) => {
    if (draggingPoint !== pointType) return;

    const stage = e.target.getStage();
    const pointerPos = stage.getPointerPosition();
    if (!pointerPos) return;

    // 🚀 THROTTLE AGRESIVO: Solo cada 4ms (250fps)
    const now = performance.now();
    if (now - lastUpdateTime.current < 4) return;
    lastUpdateTime.current = now;

    // 🔥 USAR POSICIÓN REAL DEL NODO EN TIEMPO REAL
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

    // 🚀 ACTUALIZACIÓN DIRECTA SIN REACT RE-RENDER
    const lineNode = elementRefs.current?.[lineElement.id];
    if (lineNode) {
      // 🔥 SOLO ACTUALIZAR SI LOS PUNTOS CAMBIARON SIGNIFICATIVAMENTE
      const pointsStr = newPoints.join(',');
      if (pointsCache.current !== pointsStr) {
        pointsCache.current = pointsStr;

        // 🚀 FEEDBACK INSTANTÁNEO
        lineNode.points(newPoints);

        // 🔥 USAR requestAnimationFrame PARA BATCH DRAW ÓPTIMO
        if (!window._lineDrawScheduled) {
          window._lineDrawScheduled = true;
          requestAnimationFrame(() => {
            batchDraw(lineNode);
            window._lineDrawScheduled = false;
          });
        }
      }
    }
  }, [draggingPoint, normalizedStartX, normalizedStartY, normalizedEndX, normalizedEndY, nodeRef, elementRefs, lineElement.id]);

  // 🔥 HANDLER OPTIMIZADO PARA DRAG END
  const handlePointDragEnd = useCallback((pointType, e) => {
    if (draggingPoint !== pointType) return;

    const stage = e.target.getStage();
    const pointerPos = stage.getPointerPosition();
    if (!pointerPos) return;

    // 🔥 USAR POSICIÓN REAL DEL NODO EN TIEMPO REAL
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

    // 🔥 ACTUALIZACIÓN FINAL CON DEBOUNCE
    if (onUpdateLine) {
      onUpdateLine(lineElement.id, {
        points: newPoints,
        isFinal: true
      });
    }

    setDraggingPoint(null);
    dragStartPos.current = null;
    pointsCache.current = null; // 🔥 LIMPIAR CACHE
  }, [draggingPoint, normalizedStartX, normalizedStartY, normalizedEndX, normalizedEndY, nodeRef, onUpdateLine, lineElement.id]);

  return (
    <Group>
      {/* 🔥 OCULTAR CONTROLES DURANTE DRAG INDIVIDUAL O GRUPAL */}
      {!lineBeingDragged && !isGroupDrag && (
        <>
          {/* 🔴 Punto de control - INICIO */}
          <Circle
            x={startAbsoluteX}
            y={startAbsoluteY}
            radius={6}
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
            // 🚀 OPTIMIZACIONES DE RENDIMIENTO
            perfectDrawEnabled={false}
            shadowForStrokeEnabled={false}
            hitStrokeWidth={12} // Área de click más grande
          />

          {/* 🔴 Punto de control - FINAL */}
          <Circle
            x={endAbsoluteX}
            y={endAbsoluteY}
            radius={6}
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
            // 🚀 OPTIMIZACIONES DE RENDIMIENTO
            perfectDrawEnabled={false}
            shadowForStrokeEnabled={false}
            hitStrokeWidth={12} // Área de click más grande
          />

          {/* 📏 Línea de guía durante drag de puntos - OPTIMIZADA */}
          {draggingPoint && (
            <Line
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