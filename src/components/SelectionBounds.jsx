// SelectionBounds.jsx
import { useEffect, useRef } from 'react';
import { Transformer } from 'react-konva';

export default function SelectionBounds({ 
  selectedElements, 
  elementRefs, 
  objetos, 
  onTransform 
}) {
  const transformerRef = useRef();


  useEffect(() => {
  console.log("🎯 SelectionBounds - elementos seleccionados:", selectedElements);
  
  if (!transformerRef.current) return;

  if (selectedElements.length === 0) {
    transformerRef.current.nodes([]);
    transformerRef.current.getLayer()?.batchDraw();
    return;
  }

  const selectedNodes = selectedElements
    .map(id => elementRefs.current?.[id])
    .filter(node => node);

  console.log("🎯 SelectionBounds - nodos encontrados:", selectedNodes.length);

 if (selectedNodes.length > 0) {
  transformerRef.current.nodes(selectedNodes);
  // 🔥 OPTIMIZACIÓN: Solo redibujar si es necesario
  const layer = transformerRef.current.getLayer();
  if (layer) {
    requestAnimationFrame(() => {
      layer.batchDraw();
    });
  }
} else {
  transformerRef.current.nodes([]);
  transformerRef.current.getLayer()?.batchDraw();
}

  // 🔥 CLEANUP: Limpiar eventos al desmontar
  return () => {
    if (transformerRef.current) {
      try {
        transformerRef.current.nodes([]);
        transformerRef.current.getLayer()?.batchDraw();
      } catch (err) {
        console.warn("Error en cleanup de SelectionBounds:", err);
      }
    }
  };
}, [selectedElements]);


  if (selectedElements.length === 0) return null;

  // Determinar el tipo de elemento
  const primerElemento = objetos.find(obj => obj.id === selectedElements[0]);
  const esTexto = primerElemento?.tipo === 'texto';

  return (
    <Transformer
      ref={transformerRef}
      
      // 🎨 Diseño ultra-moderno
      borderStroke="rgba(59, 130, 246, 0.7)" // Azul suave
      borderStrokeWidth={1} // Línea muy fina
      borderDash={[6, 3]} // Patrón elegante
      
      // 🔹 Anchor estilo iOS/macOS
      anchorFill="#3b82f6" // Azul sistema
      anchorStroke="#ffffff"
      anchorStrokeWidth={2.5}
      anchorSize={12} // Más grande para mejor usabilidad
      anchorCornerRadius={6} // Muy redondeado, casi circular
      
      // ✨ Efectos de sombra suave
      anchorShadowColor="rgba(59, 130, 246, 0.3)"
      anchorShadowBlur={6}
      anchorShadowOffset={{ x: 0, y: 3 }}
      
      // 🎯 Esquina inferior derecha para todos los elementos
      enabledAnchors={['bottom-right']}
      
      // 🔧 Configuración simple y confiable
      keepRatio={false}
      centeredScaling={false}
      rotateEnabled={true}
      flipEnabled={false}
      resizeEnabled={true}
      
      // 🎪 Rotación
      rotationSnaps={[0, 45, 90, 135, 180, 225, 270, 315]}
      rotateAnchorOffset={30}
      rotationSnapTolerance={5}
      
      // 📏 Control de dimensiones básico
      boundBoxFunc={(oldBox, newBox) => {
        // Límites mínimos
        const minSize = esTexto ? 20 : 10;
        const maxSize = 800;
        
        // Validar límites
        if (newBox.width < minSize || newBox.height < minSize) {
          return oldBox;
        }
        
        // Para círculos, mantener proporción
        if (primerElemento?.tipo === 'forma' && primerElemento?.figura === 'circle') {
          const size = Math.max(newBox.width, newBox.height);
          return {
            ...newBox,
            width: Math.min(size, maxSize),
            height: Math.min(size, maxSize)
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
  // 🔥 OPTIMIZACIÓN: Reducir updates durante transform
  if (transformerRef.current) {
    transformerRef.current.getLayer().listening(false);
  }
}}

onTransform={(e) => {
  if (!onTransform) return;
  
  // 🔥 VALIDACIÓN CRÍTICA: Verificar que transformerRef existe
  if (!transformerRef.current) {
    console.warn("⚠️ onTransform: transformerRef no existe");
    return;
  }

  const node = e.target;
  
  // 🔥 VALIDACIÓN: Verificar que el nodo existe y es válido
  if (!node || !node.getStage || !node.getStage()) {
    console.warn("⚠️ onTransform: nodo inválido");
    return;
  }

  // 🔥 VALIDACIÓN: Verificar que el nodo tiene los métodos necesarios
  if (typeof node.x !== 'function' || typeof node.y !== 'function') {
    console.warn("⚠️ onTransform: nodo no tiene métodos de posición");
    return;
  }

  try {
    // Datos básicos
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
    console.warn("⚠️ Error en onTransform:", error);
  }
}}

onTransformEnd={(e) => {
  // 🔥 CRÍTICO: Verificar que el componente aún existe
  if (!transformerRef.current || !onTransform) {
    console.warn("⚠️ onTransformEnd: componente destruido, ignorando evento");
    return;
  }

  const node = e.target;
  
  // 🔥 VALIDACIÓN: Verificar que el nodo existe y es válido
  if (!node || !node.getStage || !node.getStage()) {
    console.warn("⚠️ onTransformEnd: nodo inválido");
    return;
  }

  // 🔥 VALIDACIÓN: Verificar que el nodo tiene los métodos necesarios
  if (typeof node.x !== 'function' || typeof node.y !== 'function') {
    console.warn("⚠️ onTransformEnd: nodo no tiene métodos de posición");
    return;
  }

  try {
    // Datos finales
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
      
      // 🔥 RESETEAR CON VERIFICACIÓN
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
      
      // 🔥 RESETEAR CON VERIFICACIÓN
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

    // 🔥 ENVIAR DATOS CON VERIFICACIÓN
    if (onTransform) {
      onTransform(finalData);
    }
    
  // 🔥 RESTAURAR LISTENING
if (transformerRef.current) {
  transformerRef.current.getLayer().listening(true);
}

// Limpiar flags
window._resizeData = { isResizing: false };
setTimeout(() => {
  window._resizeData = null;
}, 100);

  } catch (error) {
    console.warn("⚠️ Error en onTransformEnd:", error);
    // Limpiar flags incluso si hay error
    window._resizeData = null;
  }
}}
    />
  );
}