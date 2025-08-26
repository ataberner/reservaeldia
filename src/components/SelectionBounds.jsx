// SelectionBounds.jsx
import { useEffect, useRef, useState } from 'react';
import { Transformer, Rect } from 'react-konva';

// 🎨 Componente para mostrar bounds sin transformer
const BoundsIndicator = ({ selectedElements, elementRefs, objetos }) => {
  const [forceUpdate, setForceUpdate] = useState(0);

  useEffect(() => {
    const stage = elementRefs.current?.[selectedElements[0]]?.getStage?.();
    if (!stage) return;

    const handleDragMove = () => {
      setForceUpdate(p => p + 1);
    };

    stage.on("dragmove", handleDragMove);
    return () => {
      stage.off("dragmove", handleDragMove);
    };
  }, [selectedElements.join(",")]);


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

        const cleanPoints = [
          parseFloat(points[0]) || 0,
          parseFloat(points[1]) || 0,
          parseFloat(points[2]) || 100,
          parseFloat(points[3]) || 0
        ];

        // 🔥 USAR POSICIÓN REAL DEL NODO EN TIEMPO REAL (clave para drag grupal)
        const realX = node.x();
        const realY = node.y();

        const x1 = realX + cleanPoints[0];
        const y1 = realY + cleanPoints[1];
        const x2 = realX + cleanPoints[2];
        const y2 = realY + cleanPoints[3];

        const linePadding = 5;

        minX = Math.min(minX, x1 - linePadding, x2 - linePadding);
        minY = Math.min(minY, y1 - linePadding, y2 - linePadding);
        maxX = Math.max(maxX, x1 + linePadding, x2 + linePadding);
        maxY = Math.max(maxY, y1 + linePadding, y2 + linePadding);

      } else {
        // 🔥 PARA OTROS ELEMENTOS: usar posición real del nodo
        const realX = node.x();
        const realY = node.y();
        const width = node.width() || obj.width || 50;
        const height = node.height() || obj.height || 20;

        minX = Math.min(minX, realX);
        minY = Math.min(minY, realY);
        maxX = Math.max(maxX, realX + width);
        maxY = Math.max(maxY, realY + height);
      }

    } catch (error) {
      // Fallback usando datos del objeto
      const fallbackX = obj.x || 0;
      const fallbackY = obj.y || 0;
      const fallbackSize = 20;

      minX = Math.min(minX, fallbackX);
      minY = Math.min(minY, fallbackY);
      maxX = Math.max(maxX, fallbackX + fallbackSize);
      maxY = Math.max(maxY, fallbackY + fallbackSize);
    }
  });

  if (minX === Infinity || maxX === -Infinity) {
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
  const esTexto = primerElemento?.tipo === 'texto';

  // ¿La selección contiene alguna galería?
  const hasGallery = elementosSeleccionadosData.some(o => o.tipo === 'galeria');


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

  const deberiaUsarTransformer = elementosTransformables.length > 0 && !hasGallery;
  const deberiaUsarBounds = selectedElements.length > 0;



  // 🔥 useEffect SIMPLIFICADO solo para transformer
  useEffect(() => {
    if (hasGallery) {
      // Si hay galería en la selección, vaciamos el transformer
      transformerRef.current?.nodes([]);
      transformerRef.current?.getLayer()?.batchDraw();
      return;
    }
    const editing = window.editing || {};
    if (editing.id && selectedElements.includes(editing.id)) {
      // Durante edición inline, limpiar transformer
      if (transformerRef.current) {
        transformerRef.current.nodes([]);
        transformerRef.current.getLayer()?.batchDraw();
      }
      return;
    }

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


  // 🚫 Si hay galería seleccionada: solo bounds (sin anchors)
  if (hasGallery) {
    return (
      <BoundsIndicator
        selectedElements={selectedElements}
        elementRefs={elementRefs}
        objetos={objetos}
      />
    );
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

  const tr = transformerRef.current;
  const nodes = typeof tr.nodes === 'function' ? (tr.nodes() || []) : [];

  // 🔥 Caso SELECCIÓN MÚLTIPLE: commit por lote y reset del transformer
  if (nodes.length > 1) {
    try {
      // El Transformer aplica una escala común al “bounding box” de la selección
      const tScaleX = typeof tr.scaleX === 'function' ? (tr.scaleX() || 1) : 1;
      const tScaleY = typeof tr.scaleY === 'function' ? (tr.scaleY() || 1) : 1;
      const avg = (Math.abs(tScaleX) + Math.abs(tScaleY)) / 2;

      // Armamos updates por cada nodo seleccionado
      const updates = nodes.map((n) => {
        // id del objeto (asegurate que cada nodo Konva tenga id={obj.id})
        let id = null;
        try {
          id = (typeof n.id === 'function' ? n.id() : n.attrs?.id) || null;
        } catch { /* noop */ }
        if (!id) return null;

        const obj = (objetos || []).find(o => o.id === id);
        if (!obj) return null;

        // Posición y rotación finales ya están “en vista” gracias al preview de Konva
        const upd = {
          id,
          x: typeof n.x === 'function' ? n.x() : obj.x,
          y: typeof n.y === 'function' ? n.y() : obj.y,
          rotation: typeof n.rotation === 'function' ? (n.rotation() || 0) : (obj.rotation || 0),
        };

        // Tamaño final por tipo
        if (obj.tipo === 'texto') {
          const base = obj.fontSize || 24;
          upd.fontSize = Math.max(6, Math.round(base * avg));
          // Reseteo de escalas para evitar rebote
          if (typeof n.scaleX === 'function') { n.scaleX(1); n.scaleY(1); }
          return upd;
        }

        if (obj.tipo === 'forma' && obj.figura === 'circle') {
          const baseR = obj.radius || 50;
          upd.radius = baseR * avg;
          if (typeof n.scaleX === 'function') { n.scaleX(1); n.scaleY(1); }
          return upd;
        }

        // rect / imagen / icono / otros con width/height
        const baseW = (obj.width != null ? obj.width : (typeof n.width === 'function' ? n.width() : 100)) || 100;
        const baseH = (obj.height != null ? obj.height : (typeof n.height === 'function' ? n.height() : 100)) || 100;

        upd.width = Math.abs(baseW * tScaleX);
        upd.height = Math.abs(baseH * tScaleY);

        if (typeof n.scaleX === 'function') { n.scaleX(1); n.scaleY(1); }
        return upd;
      }).filter(Boolean);

      // Enviamos batch al padre (CanvasEditor) para que actualice estado de TODOS
      onTransform({ isFinal: true, batch: updates });

      // Reseteamos el transformer para que no “arrastre” la escala al siguiente gesto
      if (typeof tr.scaleX === 'function') {
        tr.scaleX(1);
        tr.scaleY(1);
      }
      tr.getLayer()?.batchDraw();

      // Flags internos (si los usás)
      window._resizeData = { isResizing: false };
      setTimeout(() => { window._resizeData = null; }, 100);

      return; // 👈 importante: no seguir con la lógica de selección simple
    } catch (err) {
      console.warn("Error en onTransformEnd (multi):", err);
      window._resizeData = null;
      return;
    }
  }

  // ✅ Caso SELECCIÓN SIMPLE: tu código original sin cambios
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