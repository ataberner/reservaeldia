// components/LineControls.jsx
import { Circle, Group, Line } from "react-konva";
import { useState, useRef, useEffect } from "react";


export default function LineControls({ 
  lineElement, 
  elementRefs, 
  onUpdateLine,
  altoCanvas
}) {
  const [draggingPoint, setDraggingPoint] = useState(null); // 'start' | 'end' | null
  const dragStartPos = useRef(null);
  const [lineBeingDragged, setLineBeingDragged] = useState(false);

  if (!lineElement || lineElement.tipo !== 'forma' || lineElement.figura !== 'line') {
    return null;
  }

  const nodeRef = elementRefs.current?.[lineElement.id];
  if (!nodeRef) return null;


  // 🔍 DETECTAR SI LA LÍNEA ESTÁ SIENDO ARRASTRADA
useEffect(() => {
  if (!nodeRef) return;

  const handleDragStart = () => {
    console.log("🚀 Línea iniciando drag - ocultando controles");
    setLineBeingDragged(true);
  };

  const handleDragEnd = () => {
    console.log("🏁 Línea finalizó drag - mostrando controles");
    setLineBeingDragged(false);
  };

  // Escuchar eventos de drag en el nodo de la línea
  nodeRef.on('dragstart', handleDragStart);
  nodeRef.on('dragend', handleDragEnd);

  // Cleanup
  return () => {
    nodeRef.off('dragstart', handleDragStart);
    nodeRef.off('dragend', handleDragEnd);
  };
}, [nodeRef]);


  // 🔧 Obtener puntos actuales de la línea
  const points = lineElement.points || [0, 0, 100, 0];
  const startX = points[0] || 0;
  const startY = points[1] || 0;
  const endX = points[2] || 100;
  const endY = points[3] || 0;

  // 🎯 Calcular posición absoluta de la línea
  const lineX = lineElement.x || 0;
  const lineY = lineElement.y || 0;

// 🔧 NORMALIZACIÓN SEGURA: Solo usar puntos como están, sin auto-corrección
let normalizedPoints = [...points];

// 🔥 IMPORTANTE: NO hacer auto-corrección automática para evitar loops
// Solo validar que tenemos 4 puntos numéricos válidos
const puntosValidados = [];
for (let i = 0; i < 4; i++) {
  const punto = parseFloat(points[i] || 0);
  puntosValidados.push(isNaN(punto) ? 0 : punto);
}

// Usar los puntos validados sin auto-corrección
normalizedPoints = puntosValidados;


// Usar los puntos normalizados para el resto de la lógica
const [normalizedStartX, normalizedStartY, normalizedEndX, normalizedEndY] = normalizedPoints;

// 📍 AHORA SÍ: Posiciones absolutas de los puntos de control
const startAbsoluteX = lineX + normalizedStartX;
const startAbsoluteY = lineY + normalizedStartY;  
const endAbsoluteX = lineX + normalizedEndX;
const endAbsoluteY = lineY + normalizedEndY;


  const handlePointDragStart = (pointType, e) => {
    console.log(`🚀 Iniciando drag del punto ${pointType}`);
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
  
  // 🎯 Calcular nuevos puntos RELATIVOS a la posición de la línea
  const newPointX = pointerPos.x - lineX; // Relativo a la línea
  const newPointY = pointerPos.y - lineY; // Relativo a la línea

 let newPoints;
  if (pointType === 'start') {
    // Mover punto inicial, mantener punto final
    newPoints = [newPointX, newPointY, normalizedEndX, normalizedEndY];
  } else {
    // Mover punto final, mantener punto inicial  
    newPoints = [normalizedStartX, normalizedStartY, newPointX, newPointY];
  }

  console.log("🔄 Nuevos puntos relativos:", newPoints);

  // 🔄 Actualizar en tiempo real (preview)
  if (onUpdateLine) {
    onUpdateLine(lineElement.id, {
      points: newPoints,
      isPreview: true
    });
  }
};

const handlePointDragEnd = (pointType, e) => {
  if (draggingPoint !== pointType) return;
  
  console.log(`🏁 Finalizando drag del punto ${pointType}`);
  
  const stage = e.target.getStage();
 const pointerPos = stage.getPointerPosition();
if (!pointerPos) {
  console.warn("⚠️ No se pudo obtener la posición del puntero en dragEnd");
  return;
}
  
  // 🎯 Calcular puntos finales RELATIVOS a la posición de la línea
  const newPointX = pointerPos.x - lineX; // Relativo a la línea
  const newPointY = pointerPos.y - lineY; // Relativo a la línea

let newPoints;
  if (pointType === 'start') {
    newPoints = [newPointX, newPointY, normalizedEndX, normalizedEndY];
  } else {
    newPoints = [normalizedStartX, normalizedStartY, newPointX, newPointY];
  }

  console.log("💾 Puntos finales relativos:", newPoints);

  // 💾 Guardar cambios finales
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
    {/* 🔍 SOLO MOSTRAR CONTROLES SI NO ESTÁ SIENDO ARRASTRADA LA LÍNEA */}
    {!lineBeingDragged && (
      <>
        {/* 🔴 Punto de control - INICIO */}
        <Circle
            x={startAbsoluteX}
            y={startAbsoluteY}
            radius={6}  // ✅ MÁS PEQUEÑO (igual que otros elementos)
            fill={draggingPoint === 'start' ? "#2563eb" : "#3b82f6"}  // ✅ AZUL CELESTE
            stroke="#ffffff"
            strokeWidth={2.5}  // ✅ MISMO GROSOR QUE OTROS ELEMENTOS
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
  radius={6}  // ✅ MÁS PEQUEÑO
  fill={draggingPoint === 'end' ? "#2563eb" : "#3b82f6"}  // ✅ AZUL CELESTE
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
          
          shadowColor="rgba(59, 130, 246, 0.3)"  // ✅ SOMBRA AZUL
  shadowBlur={6}
  shadowOffset={{ x: 0, y: 3 }}
        />

        {/* 📏 Línea de guía (solo durante drag de puntos, no de línea) */}
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

    {/* 🚫 NO MOSTRAR NADA DURANTE EL DRAG DE LA LÍNEA */}
  </Group>
);
}