// SelectionBounds.jsx - CÓDIGO COMPLETO CORREGIDO
import { useEffect, useRef } from 'react';
import { Transformer, Rect } from 'react-konva';


// 🎨 Componente para mostrar bounds sin transformer
const BoundsIndicator = ({ selectedElements, elementRefs, objetos }) => {
  const elementosData = selectedElements.map(id => 
    objetos.find(obj => obj.id === id)
  ).filter(obj => obj);
  

  if (elementosData.length === 0) {
   
    return null;
  }
  
  // Calcular bounding box de todos los elementos
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  
  elementosData.forEach(obj => {
    const node = elementRefs.current[obj.id];
    if (!node) return;
    
    try {
  if (obj.tipo === 'forma' && obj.figura === 'line') {
    // 🔥 CÁLCULO CORRECTO PARA LÍNEAS
    const points = obj.points || [0, 0, 100, 0];
    
    // Asegurar que tenemos 4 puntos válidos
    const cleanPoints = [
      parseFloat(points[0]) || 0,
      parseFloat(points[1]) || 0,
      parseFloat(points[2]) || 100,
      parseFloat(points[3]) || 0
    ];
    
    // 🔥 USAR POSICIÓN REAL DEL NODO (incluyendo durante drag)
    const realX = node.x ? node.x() : (obj.x || 0);
    const realY = node.y ? node.y() : (obj.y || 0);
    
    // Calcular posiciones absolutas de los endpoints
    const x1 = realX + cleanPoints[0];
    const y1 = realY + cleanPoints[1];
    const x2 = realX + cleanPoints[2];
    const y2 = realY + cleanPoints[3];
        
        // 🔥 AGREGAR PADDING PARA LÍNEAS (para que sean más visibles en el bounds)
        const linePadding = 5;
        
        minX = Math.min(minX, x1 - linePadding, x2 - linePadding);
        minY = Math.min(minY, y1 - linePadding, y2 - linePadding);
        maxX = Math.max(maxX, x1 + linePadding, x2 + linePadding);
        maxY = Math.max(maxY, y1 + linePadding, y2 + linePadding);
        
        
     } else {
  // 🔄 PARA OTROS ELEMENTOS: usar getClientRect en tiempo real
  const box = node.getClientRect();
  minX = Math.min(minX, box.x);
  minY = Math.min(minY, box.y);
  maxX = Math.max(maxX, box.x + box.width);
  maxY = Math.max(maxY, box.y + box.height);
}

    } catch (error) {
     
      
      // 🔥 FALLBACK: usar posición básica del objeto
      const fallbackX = obj.x || 0;
      const fallbackY = obj.y || 0;
      const fallbackSize = 20; // Tamaño mínimo
      
      minX = Math.min(minX, fallbackX);
      minY = Math.min(minY, fallbackY);
      maxX = Math.max(maxX, fallbackX + fallbackSize);
      maxY = Math.max(maxY, fallbackY + fallbackSize);
    }
  });
  


  if (minX === Infinity || maxX === -Infinity) {
    console.warn("⚠️ Bounds inválidos calculados, usando fallback");
    
    // 🔥 FALLBACK: usar posición del primer elemento
    const primerElemento = elementosData[0];
    if (primerElemento) {
      minX = primerElemento.x || 0;
      minY = primerElemento.y || 0;
      maxX = minX + 100;
      maxY = minY + 50;
    } else {
      return null;
    }
  }

  const padding = 10;
  const finalX = minX - padding;
  const finalY = minY - padding;
  const finalWidth = maxX - minX + padding * 2;
  const finalHeight = maxY - minY + padding * 2;

  
  
  return (
    <Rect
      x={finalX}
      y={finalY}
      width={finalWidth}
      height={finalHeight}
      fill="transparent"
      stroke="rgba(59, 130, 246, 0.7)"
      strokeWidth={1}
      dash={[6, 3]}
      listening={false}
      opacity={0.7}
    />
  );
};


export default function SelectionBounds({ 
  selectedElements, 
  elementRefs, 
  objetos, 
  onTransform 
}) {
  const transformerRef = useRef();

// 🔥 ANÁLISIS MEJORADO DE ELEMENTOS SELECCIONADOS
const elementosSeleccionadosData = selectedElements.map(id => 
  objetos.find(obj => obj.id === id)
).filter(obj => obj);

const primerElemento = elementosSeleccionadosData[0] || null; 
const esTexto        = primerElemento?.tipo === 'texto';  

const hayLineas = elementosSeleccionadosData.some(obj => {
  const esLinea = obj.tipo === 'forma' && obj.figura === 'line';
 
  return esLinea;
});



const soloLineas = elementosSeleccionadosData.length > 0 && elementosSeleccionadosData.every(obj => {
  const esLinea = obj.tipo === 'forma' && obj.figura === 'line';
  return esLinea;
});


// 🔥 LÓGICA SIMPLIFICADA PARA DEBUGGING
const elementosTransformables = elementosSeleccionadosData.filter(obj => 
  !(obj.tipo === 'forma' && obj.figura === 'line')
);

const deberiaUsarTransformer = elementosTransformables.length > 0;
const deberiaUsarBounds = selectedElements.length > 0;



// 🔥 useEffect SIMPLIFICADO solo para transformer
useEffect(() => {
  if (!transformerRef.current || !deberiaUsarTransformer) {
    if (transformerRef.current) {
      transformerRef.current.nodes([]);
      transformerRef.current.getLayer()?.batchDraw();
    }
    return;
  }

  const nodosTransformables = elementosTransformables
    .map(obj => elementRefs.current?.[obj.id])
    .filter(node => node);

  if (nodosTransformables.length > 0) {
    transformerRef.current.nodes(nodosTransformables);
    const layer = transformerRef.current.getLayer();
    if (layer) {
      requestAnimationFrame(() => {
        layer.batchDraw();
      });
    }
  }
}, [selectedElements.length, selectedElements.join(','), deberiaUsarTransformer]);

// 🔥 RENDERIZADO SIMPLIFICADO
if (selectedElements.length === 0) {

  return null;
}

if (hayLineas && elementosTransformables.length === 0) {
  // Solo líneas - usar BoundsIndicator
  
  return <BoundsIndicator 
    selectedElements={selectedElements}
    elementRefs={elementRefs}
    objetos={objetos}
  />;
}

if (hayLineas && elementosTransformables.length > 0) {
  // Selección mixta - usar BoundsIndicator
  
  return <BoundsIndicator 
    selectedElements={selectedElements}
    elementRefs={elementRefs}
    objetos={objetos}
  />;
}



// 🎨 TRANSFORMER COMPONENT (mantener todo el código existente del transformer)
return (
  <Transformer
    ref={transformerRef}
    borderStroke="rgba(59, 130, 246, 0.7)"
    borderStrokeWidth={1}
    borderDash={[6, 3]}
    anchorFill="#3b82f6"
    anchorStroke="#ffffff"
    anchorStrokeWidth={2.5}
    anchorSize={12}
    anchorCornerRadius={6}
    anchorShadowColor="rgba(59, 130, 246, 0.3)"
    anchorShadowBlur={6}
    anchorShadowOffset={{ x: 0, y: 3 }}
    enabledAnchors={['bottom-right']}
    keepRatio={false}
    centeredScaling={false}
    rotateEnabled={true}
    flipEnabled={false}
    resizeEnabled={true}
    rotationSnaps={[0, 45, 90, 135, 180, 225, 270, 315]}
    rotateAnchorOffset={30}
    rotationSnapTolerance={5}
    boundBoxFunc={(oldBox, newBox) => {
      const minSize = esTexto ? 20 : 10;
      const maxSize = 800;
      
      if (newBox.width < minSize || newBox.height < minSize) {
        return oldBox;
      }
      
      if (esTexto) {
        const scaleX = newBox.width / oldBox.width;
        const scaleY = newBox.height / oldBox.height;
        const uniformScale = Math.min(scaleX, scaleY);
        
        const newWidth = oldBox.width * uniformScale;
        const newHeight = oldBox.height * uniformScale;
        
        return {
          ...newBox,
          width: Math.min(Math.max(newWidth, minSize), maxSize),
          height: Math.min(Math.max(newHeight, minSize), maxSize)
        };
      }
      
      if (primerElemento?.tipo === 'forma' && primerElemento?.figura === 'circle') {
        const size = Math.max(newBox.width, newBox.height);
        const finalSize = Math.min(size, maxSize);
        return {
          ...newBox,
          width: finalSize,
          height: finalSize
        };
      }
      
      if (primerElemento?.tipo === 'imagen' || primerElemento?.tipo === 'icono') {
        const scaleX = newBox.width / oldBox.width;
        const scaleY = newBox.height / oldBox.height;
        const uniformScale = Math.min(scaleX, scaleY);
        
        const newWidth = oldBox.width * uniformScale;
        const newHeight = oldBox.height * uniformScale;
        
        return {
          ...newBox,
          width: Math.min(Math.max(newWidth, minSize), maxSize),
          height: Math.min(Math.max(newHeight, minSize), maxSize)
        };
      }

      return {
        ...newBox,
        width: Math.min(newBox.width, maxSize),
        height: Math.min(newBox.height, maxSize)
      };
    }}
    
    onTransformStart={() => {
      window._resizeData = { isResizing: true };
      if (transformerRef.current) {
        transformerRef.current.getLayer().listening(false);
      }
    }}

    onTransform={(e) => {
      if (!onTransform || !transformerRef.current) return;

      const node = e.target;
      if (!node || !node.getStage || !node.getStage()) return;
      if (typeof node.x !== 'function' || typeof node.y !== 'function') return;

      try {
        const transformData = {
          x: node.x(),
          y: node.y(),
          rotation: node.rotation() || 0,
          isPreview: true
        };

        if (esTexto) {
          const originalFontSize = primerElemento.fontSize || 24;
          const scaleX = typeof node.scaleX === 'function' ? node.scaleX() : 1;
          const scaleY = typeof node.scaleY === 'function' ? node.scaleY() : 1;
          
          const avgScale = (Math.abs(scaleX) + Math.abs(scaleY)) / 2;
          transformData.fontSize = Math.max(6, Math.round(originalFontSize * avgScale));
          transformData.scaleX = 1;
          transformData.scaleY = 1;
        } else {
          const scaleX = typeof node.scaleX === 'function' ? node.scaleX() : 1;
          const scaleY = typeof node.scaleY === 'function' ? node.scaleY() : 1;
          
          transformData.scaleX = scaleX;
          transformData.scaleY = scaleY;
          
          const originalWidth = primerElemento.width || 100;
          const originalHeight = primerElemento.height || 100;
          
          transformData.width = Math.abs(originalWidth * scaleX);
          transformData.height = Math.abs(originalHeight * scaleY);
          
          if (primerElemento?.figura === 'circle') {
            const avgScale = (Math.abs(scaleX) + Math.abs(scaleY)) / 2;
            transformData.radius = (primerElemento.radius || 50) * avgScale;
          }
        }

        onTransform(transformData);
      } catch (error) {
        console.warn("Error en onTransform:", error);
      }
    }}

    onTransformEnd={(e) => {
      if (!transformerRef.current || !onTransform) return;

      const node = e.target;
      if (!node || !node.getStage || !node.getStage()) return;
      if (typeof node.x !== 'function' || typeof node.y !== 'function') return;

      try {
        const finalData = {
          x: node.x(),
          y: node.y(),
          rotation: node.rotation() || 0,
          isFinal: true
        };

        if (esTexto) {
          const originalFontSize = primerElemento.fontSize || 24;
          const scaleX = typeof node.scaleX === 'function' ? node.scaleX() : 1;
          const scaleY = typeof node.scaleY === 'function' ? node.scaleY() : 1;
          const avgScale = (Math.abs(scaleX) + Math.abs(scaleY)) / 2;
          
          finalData.fontSize = Math.max(6, Math.round(originalFontSize * avgScale));
          finalData.scaleX = 1;
          finalData.scaleY = 1;
          
          setTimeout(() => {
            if (node && node.getStage && node.getStage() && typeof node.scaleX === 'function') {
              try {
                node.scaleX(1);
                node.scaleY(1);
                node.getLayer()?.batchDraw();
              } catch (err) {
                console.warn("Error reseteando escalas de texto:", err);
              }
            }
          }, 0);
          
        } else {
          const originalWidth = primerElemento.width || 100;
          const originalHeight = primerElemento.height || 100;
          
          const scaleX = typeof node.scaleX === 'function' ? node.scaleX() : 1;
          const scaleY = typeof node.scaleY === 'function' ? node.scaleY() : 1;
          
          finalData.width = Math.abs(originalWidth * scaleX);
          finalData.height = Math.abs(originalHeight * scaleY);
          finalData.scaleX = 1;
          finalData.scaleY = 1;
          
          if (primerElemento?.figura === 'circle') {
            const avgScale = (Math.abs(scaleX) + Math.abs(scaleY)) / 2;
            finalData.radius = (primerElemento.radius || 50) * avgScale;
          }
          
          setTimeout(() => {
            if (node && node.getStage && node.getStage() && typeof node.scaleX === 'function') {
              try {
                node.scaleX(1);
                node.scaleY(1);
                
                if (typeof node.width === 'function') node.width(finalData.width);
                if (typeof node.height === 'function') node.height(finalData.height);
                if (typeof node.radius === 'function' && primerElemento?.figura === 'circle') {
                  node.radius(finalData.radius);
                }
                
                node.getLayer()?.batchDraw();
              } catch (err) {
                console.warn("Error reseteando escalas:", err);
              }
            }
          }, 0);
        }

        if (onTransform) {
          onTransform(finalData);
        }
        
        if (transformerRef.current) {
          transformerRef.current.getLayer().listening(true);
        }

        window._resizeData = { isResizing: false };
        setTimeout(() => {
          window._resizeData = null;
        }, 100);

      } catch (error) {
        console.warn("Error en onTransformEnd:", error);
        window._resizeData = null;
      }
    }}
  />
);
}