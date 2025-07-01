// LineControls.jsx - Agregar al inicio del componente
import { Circle, Group, Line } from "react-konva";
import { useState, useRef, useEffect } from "react";


// 🚀 Utilidad para forzar repintado rápido
const batchDraw = (node) => node.getLayer() && node.getLayer().batchDraw();



export default function LineControls({ 
  lineElement, 
  elementRefs, 
  onUpdateLine,
  altoCanvas
}) {
  const [draggingPoint, setDraggingPoint] = useState(null);
  const dragStartPos = useRef(null);
  const [lineBeingDragged, setLineBeingDragged] = useState(false);
  const [isGroupDrag, setIsGroupDrag] = useState(false); // 🔥 NUEVO
  const [nodePos, setNodePos] = useState({
  x: lineElement.x || 0,
  y: lineElement.y || 0,
});


  if (!lineElement || lineElement.tipo !== 'forma' || lineElement.figura !== 'line') {
    return null;
  }

  const nodeRef = elementRefs.current?.[lineElement.id];
  if (!nodeRef) return null;

useEffect(() => {
  if (!nodeRef) return;

  // Función que copia la posición real del nodo
  const syncPos = () => {
    // `x()` y `y()` dan la posición durante el drag, aunque React no lo sepa
    setNodePos({ x: nodeRef.x(), y: nodeRef.y() });
  };

  // 1- Lanzamos un primer sync por las dudas
  syncPos();

  // 2- Nos suscribimos al drag
  nodeRef.on('dragmove', syncPos);

  // 3- Limpiamos cuando el componente se desmonta
  return () => {
    nodeRef.off('dragmove', syncPos);
  };
}, [nodeRef]);



  // 🔥 DETECTAR DRAG GRUPAL
  useEffect(() => {
    const checkGroupDrag = () => {
      const elementosSeleccionados = window._elementosSeleccionados || [];
      const isDragging = window._grupoLider !== null;
      const isPartOfGroup = elementosSeleccionados.includes(lineElement.id);
      
      setIsGroupDrag(isDragging && isPartOfGroup && elementosSeleccionados.length > 1);
    };

    // Verificar estado inicial
    checkGroupDrag();

    // Escuchar cambios en el drag grupal
    const interval = setInterval(checkGroupDrag, 100);

    return () => clearInterval(interval);
  }, [lineElement.id]);

  // 🔍 DETECTAR SI LA LÍNEA ESTÁ SIENDO ARRASTRADA
  useEffect(() => {
    if (!nodeRef) return;

    const handleDragStart = () => {
      
      setLineBeingDragged(true);
    };

    const handleDragEnd = () => {
      
      setLineBeingDragged(false);
    };

    nodeRef.on('dragstart', handleDragStart);
    nodeRef.on('dragend', handleDragEnd);

    return () => {
      nodeRef.off('dragstart', handleDragStart);
      nodeRef.off('dragend', handleDragEnd);
    };
  }, [nodeRef]);

  // Resto del código sin cambios...
  const points = lineElement.points || [0, 0, 100, 0];
  const startX = points[0] || 0;
  const startY = points[1] || 0;
  const endX = points[2] || 100;
  const endY = points[3] || 0;

  const lineX = lineElement.x || 0;
  const lineY = lineElement.y || 0;

  let normalizedPoints = [...points];
  const puntosValidados = [];
  for (let i = 0; i < 4; i++) {
    const punto = parseFloat(points[i] || 0);
    puntosValidados.push(isNaN(punto) ? 0 : punto);
  }
  normalizedPoints = puntosValidados;

  const [normalizedStartX, normalizedStartY, normalizedEndX, normalizedEndY] = normalizedPoints;

 const startAbsoluteX = nodePos.x + normalizedStartX;
 const startAbsoluteY = nodePos.y + normalizedStartY;
 const endAbsoluteX   = nodePos.x + normalizedEndX;
 const endAbsoluteY   = nodePos.y + normalizedEndY;

  const handlePointDragStart = (pointType, e) => {

    setDraggingPoint(pointType);
    dragStartPos.current = e.target.getStage().getPointerPosition();
    e.cancelBubble = true;
  };

  const handlePointDragMove = (pointType, e) => {
    if (draggingPoint !== pointType) return;

    const stage = e.target.getStage();
    const pointerPos = stage.getPointerPosition();
    if (!pointerPos) {
      console.warn("⚠️ No se pudo obtener la posición del puntero");
      return;
    }
    
    const newPointX = pointerPos.x - lineX;
    const newPointY = pointerPos.y - lineY;

    let newPoints;
    if (pointType === 'start') {
      newPoints = [newPointX, newPointY, normalizedEndX, normalizedEndY];
    } else {
      newPoints = [normalizedStartX, normalizedStartY, newPointX, newPointY];
    }

 

     // 🚀 Preview directo en Konva (sin re-render)
 const lineNode = elementRefs.current?.[lineElement.id];
if (lineNode) {
   lineNode.points(newPoints);   // feedback instantáneo
   batchDraw(lineNode);
 }
  };

  const handlePointDragEnd = (pointType, e) => {
    if (draggingPoint !== pointType) return;
    
    
    
    const stage = e.target.getStage();
    const pointerPos = stage.getPointerPosition();
    if (!pointerPos) {
      console.warn("⚠️ No se pudo obtener la posición del puntero en dragEnd");
      return;
    }
    
    const newPointX = pointerPos.x - lineX;
    const newPointY = pointerPos.y - lineY;

    let newPoints;
    if (pointType === 'start') {
      newPoints = [newPointX, newPointY, normalizedEndX, normalizedEndY];
    } else {
      newPoints = [normalizedStartX, normalizedStartY, newPointX, newPointY];
    }

   

    if (onUpdateLine) {
      onUpdateLine(lineElement.id, {
        points: newPoints,
        isFinal: true
      });
    }

    setDraggingPoint(null);
    dragStartPos.current = null;
  };

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
          />

          {/* 📏 Línea de guía durante drag de puntos */}
          {draggingPoint && (
            <Line
              points={[startAbsoluteX, startAbsoluteY, endAbsoluteX, endAbsoluteY]}
              stroke="rgba(119, 61, 190, 0.4)"
              strokeWidth={1}
              dash={[4, 4]}
              listening={false}
            />
          )}
        </>
      )}
    </Group>
  );
}