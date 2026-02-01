import { useEffect, useState } from 'react';
import { Group, Rect, Circle, Line } from 'react-konva';

export default function TextBoxControls({ textElement, elementRefs, onUpdateTextBox }) {
  const [box, setBox] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  
  useEffect(() => {
    const node = elementRefs.current?.[textElement.id];
    if (node) {
      const clientRect = node.getClientRect();
      setBox(clientRect);
    }
  }, [textElement.width, textElement.height, textElement.x, textElement.y]); // Actualizar cuando cambien las propiedades
  
  if (!box || !textElement.width) return null;

  const controlWidth = 8;
  const controlHeight = 60;
  
  // Posición del control
  const rightControlX = box.x + box.width + 8;
  const rightControlY = box.y + (box.height - controlHeight) / 2;
  
  return (
    <Group>
      {/* Borde de la caja de texto */}
      <Rect
        x={box.x - 2}
        y={box.y - 2}
        width={box.width + 4}
        height={box.height + 4}
        stroke="#773dbe"
        strokeWidth={1}
        dash={[4, 4]}
        fill="transparent"
        listening={false}
        opacity={0.7}
      />

      {/* Línea guía */}
      <Line
        name="ui"
        points={[box.x + box.width, box.y, box.x + box.width, box.y + box.height]}
        stroke="#773dbe"
        strokeWidth={1}
        dash={[3, 3]}
        listening={false}
        opacity={0.3}
      />
      
      {/* Control de arrastre */}
      <Rect
        x={rightControlX}
        y={rightControlY}
        width={controlWidth}
        height={controlHeight}
        fill={isDragging ? "#773dbe" : "rgba(119, 61, 190, 0.6)"}
        stroke="#773dbe"
        strokeWidth={2}
        cornerRadius={4}
        shadowColor="rgba(0,0,0,0.3)"
        shadowBlur={4}
        shadowOffset={{ x: 2, y: 2 }}
        draggable={true}
        
        onMouseEnter={(e) => {
          e.target.getStage().container().style.cursor = 'ew-resize';
        }}
        
        onMouseLeave={(e) => {
          if (!isDragging) {
            e.target.getStage().container().style.cursor = 'default';
          }
        }}
        
        onDragStart={(e) => {
          setIsDragging(true);
          e.target._dragStartWidth = textElement.width;
          e.target._dragStartX = e.target.getStage().getPointerPosition().x;
        }}
        
        onDragMove={(e) => {
          const currentX = e.target.getStage().getPointerPosition().x;
          const deltaX = currentX - e.target._dragStartX;
          const newWidth = Math.max(50, e.target._dragStartWidth + deltaX);
          
          // Solo llamar onUpdateTextBox para preview, sin actualizar el estado local
          onUpdateTextBox(textElement.id, {
            width: newWidth,
            isPreview: true
          });
        }}
        
        onDragEnd={(e) => {
          const currentX = e.target.getStage().getPointerPosition().x;
          const deltaX = currentX - e.target._dragStartX;
          const finalWidth = Math.max(50, e.target._dragStartWidth + deltaX);
          
          // Aplicar cambio final
          onUpdateTextBox(textElement.id, {
            width: finalWidth,
            isFinal: true
          });
          
          setIsDragging(false);
          e.target.getStage().container().style.cursor = 'default';
          
          // Resetear posición del control
          e.target.position({ x: rightControlX, y: rightControlY });
          
          // Limpiar propiedades temporales
          delete e.target._dragStartWidth;
          delete e.target._dragStartX;
        }}
      />
      
      {/* Indicadores visuales */}
      <Group listening={false}>
        <Circle x={rightControlX + 4} y={rightControlY + 20} radius={1.5} fill="white" />
        <Circle x={rightControlX + 4} y={rightControlY + 30} radius={1.5} fill="white" />
        <Circle x={rightControlX + 4} y={rightControlY + 40} radius={1.5} fill="white" />
      </Group>
    </Group>
  );
}