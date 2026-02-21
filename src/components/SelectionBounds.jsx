// SelectionBounds.jsx
import { useEffect, useRef, useState } from "react";
import { Transformer, Rect } from "react-konva";



const DEBUG_SELECTION_BOUNDS = false;

const sbLog = (...args) => {
  if (!DEBUG_SELECTION_BOUNDS) return;
  console.log("[SB]", ...args);
};
const slog = sbLog;

const TRDBG = (...args) => {
  if (!window.__DBG_TR) return;
  console.log("[TRDBG]", ...args);
};

const TXTDBG = (...args) => {
  if (typeof window === "undefined") return;
  if (!window.__DBG_TEXT_RESIZE) return;
  console.log("[TEXT-TR]", ...args);
};


function rectFromNodes(nodes) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

  for (const n of nodes) {
    if (!n?.getClientRect) continue;
    const r = n.getClientRect({ skipTransform: false, skipShadow: true, skipStroke: true });
    minX = Math.min(minX, r.x);
    minY = Math.min(minY, r.y);
    maxX = Math.max(maxX, r.x + r.width);
    maxY = Math.max(maxY, r.y + r.height);
  }

  if (minX === Infinity) return null;
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

function getCountdownScaledSize(node) {
  try {
    const hitbox = node?.findOne?.(".countdown-hitbox");
    const baseW = typeof hitbox?.width === "function" ? hitbox.width() : NaN;
    const baseH = typeof hitbox?.height === "function" ? hitbox.height() : NaN;
    const sx = Math.abs(typeof node?.scaleX === "function" ? (node.scaleX() || 1) : 1);
    const sy = Math.abs(typeof node?.scaleY === "function" ? (node.scaleY() || 1) : 1);

    if (Number.isFinite(baseW) && Number.isFinite(baseH) && baseW > 0 && baseH > 0) {
      return {
        width: Math.abs(baseW * sx),
        height: Math.abs(baseH * sy),
      };
    }
  } catch {}

  try {
    const r = node.getClientRect({ skipTransform: false, skipShadow: true, skipStroke: true });
    return { width: Math.abs(r.width), height: Math.abs(r.height) };
  } catch {}

  return { width: 100, height: 50 };
}


// 🎨 Componente para mostrar bounds sin transformer (líneas, etc.)
const BoundsIndicator = ({ selectedElements, elementRefs, objetos }) => {
  const [forceUpdate, setForceUpdate] = useState(0);

  useEffect(() => {
    const firstRef = elementRefs.current?.[selectedElements[0]];
    const stage = firstRef?.getStage?.();
    if (!stage) return;

    const handleDragMove = () => {
      setForceUpdate((p) => p + 1);
    };

    stage.on("dragmove", handleDragMove);
    return () => {
      stage.off("dragmove", handleDragMove);
    };
  }, [selectedElements.join(",")]);

  const elementosData = selectedElements
    .map((id) => objetos.find((obj) => obj.id === id))
    .filter(Boolean);

  if (elementosData.length === 0) {
    return null;
  }

  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;

  elementosData.forEach((obj) => {
    const node = elementRefs.current[obj.id];
    if (!node) return;

    try {
      if (obj.tipo === "forma" && obj.figura === "line") {
        const points = obj.points || [0, 0, 100, 0];

        const cleanPoints = [
          parseFloat(points[0]) || 0,
          parseFloat(points[1]) || 0,
          parseFloat(points[2]) || 100,
          parseFloat(points[3]) || 0,
        ];

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
        const box = node.getClientRect({ skipTransform: false, skipShadow: true, skipStroke: true });
        const r = box;
        const sx = (node?.scaleX?.() ?? 1);
        const sy = (node?.scaleY?.() ?? 1);
        slog(
          "[BI]",
          `id=${obj.id}`,
          `tipo=${obj.tipo}`,
          `sx=${sx.toFixed(3)}`,
          `sy=${sy.toFixed(3)}`,
          `rect(w=${r.width.toFixed(1)},h=${r.height.toFixed(1)})`
        );

        const realX = box.x;
        const realY = box.y;
        let width = box.width;
        let height = box.height;

        if (obj.tipo === "texto" && node.getTextHeight) {
          const textHeight = node.getTextHeight();
          if (textHeight) {
            height = textHeight;
          }
        }

        minX = Math.min(minX, realX);
        minY = Math.min(minY, realY);
        maxX = Math.max(maxX, realX + width);
        maxY = Math.max(maxY, realY + height);
      }
    } catch (error) {
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
    if (!primerElemento) return null;
    minX = primerElemento.x || 0;
    minY = primerElemento.y || 0;
    maxX = minX + 100;
    maxY = minY + 50;
  }

  const padding = 10;
  const finalX = minX - padding;
  const finalY = minY - padding;
  const finalWidth = maxX - minX + padding * 2;
  const finalHeight = maxY - minY + padding * 2;

  return (
    <Rect
      name="ui"
      x={finalX}
      y={finalY}
      width={finalWidth}
      height={finalHeight}
      fill="transparent"
      stroke="#9333EA"
      strokeWidth={1}
      listening={false}
      opacity={0.7}
    />
  );
};

export default function SelectionBounds({
  selectedElements,
  elementRefs,
  objetos,
  onTransform,
  onTransformInteractionStart = null,
  onTransformInteractionEnd = null,
  isDragging,
  isMobile = false,
}) {
  const transformerRef = useRef(null);
  const [transformTick, setTransformTick] = useState(0);
  const lastNodesRef = useRef([]);
  const circleAnchorRef = useRef(null);
  const textTransformAnchorRef = useRef(null);
  const transformGestureRef = useRef({
    isRotate: false,
    activeAnchor: null,
  });
  const elementosSeleccionadosData = selectedElements
    .map((id) => objetos.find((obj) => obj.id === id))
    .filter(Boolean);

  const primerElemento = elementosSeleccionadosData[0] || null;
  const esTexto = primerElemento?.tipo === "texto";
  const esCountdown = primerElemento?.tipo === "countdown";
  const esGaleria = selectedElements.length === 1 && primerElemento?.tipo === "galeria";
  const lockAspectCountdown = selectedElements.length === 1 && esCountdown;
  const lockAspectText = selectedElements.length === 1 && esTexto;
  const transformerAnchorSize = isMobile ? 24 : 14;
  const transformerRotateOffset = isMobile ? 34 : 24;
  const transformerAnchorRadius = 999;
  const transformerPadding = isMobile ? 10 : 4;
  const transformerBorderStrokeWidth = isMobile ? 1.5 : 1;
  const transformerAnchorStrokeWidth = isMobile ? 3 : 2.5;
  const transformerAnchorShadowBlur = isMobile ? 9 : 6;
  const transformerAnchorShadowOffsetY = isMobile ? 4 : 3;
  const transformerRotationSnapTolerance = isMobile ? 8 : 5;
  const esTriangulo =
    primerElemento?.tipo === "forma" &&
    primerElemento?.figura === "triangle";

  const hasGallery = elementosSeleccionadosData.some(
    (o) => o.tipo === "galeria"
  );

  const hayLineas = elementosSeleccionadosData.some(
    (obj) => obj.tipo === "forma" && obj.figura === "line"
  );

  const elementosTransformables = elementosSeleccionadosData.filter(
    (obj) => !(obj.tipo === "forma" && obj.figura === "line")
  );

  const deberiaUsarTransformer =
    elementosTransformables.length > 0;

  const selectedGeomKey = elementosSeleccionadosData
    .map((o) =>
      [
        o.id,
        o.x ?? 0,
        o.y ?? 0,
        o.width ?? "",
        o.height ?? "",
        o.scaleX ?? 1,
        o.scaleY ?? 1,
        o.rotation ?? 0,
        o.chipWidth ?? "",
        o.gap ?? "",
        o.paddingX ?? "",
        o.paddingY ?? "",
      ].join(":")
    )
    .join("|");

  const getTransformPose = (node) => {
    if (!node) return { x: 0, y: 0, rotation: 0 };

    if (esGaleria && typeof node.getParent === "function") {
      const parent = node.getParent();
      if (parent) {
        return {
          x: typeof parent.x === "function" ? parent.x() : 0,
          y: typeof parent.y === "function" ? parent.y() : 0,
          rotation: typeof parent.rotation === "function" ? parent.rotation() || 0 : 0,
        };
      }
    }

    return {
      x: typeof node.x === "function" ? node.x() : 0,
      y: typeof node.y === "function" ? node.y() : 0,
      rotation: typeof node.rotation === "function" ? node.rotation() || 0 : 0,
    };
  };


  // 🔥 Efecto principal del Transformer (SIN retry / SIN flicker)
  useEffect(() => {
    const tr = transformerRef.current;
    if (!tr) return;

    const selKey = selectedElements.join(",");
    TRDBG("EFFECT start", {
      selKey,
      isDragging,
      deberiaUsarTransformer,
      hasGallery,
      elementosTransformablesLen: elementosTransformables.length,
      transformTick,
      editingId: window.editing?.id || null,
    });

    // Si no corresponde transformer, no hagas detach agresivo (evita flicker)
    if (!deberiaUsarTransformer) {
      TRDBG("EFFECT exit: no transformer or gallery", { selKey });
      return;
    }


    // Resolver nodes desde refs (fuente de verdad)
    let nodosTransformables = elementosTransformables
      .map((o) => elementRefs.current?.[o.id])
      .filter(Boolean);

    // Single select: usar ref fresco SIEMPRE
    if (selectedElements.length === 1) {
      const idSel = selectedElements[0];
      const refNode = elementRefs.current?.[idSel] || null;
      if (refNode && typeof refNode.getClientRect === "function") {
        if (esGaleria && typeof refNode.findOne === "function") {
          const galleryFrame = refNode.findOne(".gallery-transform-frame");
          if (galleryFrame && typeof galleryFrame.getClientRect === "function") {
            nodosTransformables = [galleryFrame];
          } else {
            nodosTransformables = [refNode];
          }
        } else {
          nodosTransformables = [refNode];
        }
      }
    }

    // Si aún no hay nodos (imagen cargando, etc.), NO despegar (evita parpadeo)
    if (nodosTransformables.length === 0) {
      TRDBG("EFFECT exit: no nodes yet", {
        selKey,
        wantedIds: elementosTransformables.map(o => o.id),
        refsPresent: elementosTransformables.map(o => !!elementRefs.current?.[o.id]),
      });
      return;
    }


    // Attach estable
    TRDBG("ATTACH try", {
      selKey,
      nodesCount: nodosTransformables.length,
      nodeIds: nodosTransformables.map(n => (typeof n.id === "function" ? n.id() : n.attrs?.id)),
    });

    tr.nodes(nodosTransformables);

    TRDBG("ATTACH done", {
      selKey,
      trNodesCount: tr.nodes?.()?.length || 0,
    });

    try { tr.forceUpdate?.(); } catch { }
    tr.getLayer()?.batchDraw();

  }, [
    // Dependencias mínimas reales
    selectedElements.join(","),
    deberiaUsarTransformer,
    hasGallery,
    elementosTransformables.length,
    selectedGeomKey,
    transformTick,
    elementRefs,
  ]);



  useEffect(() => {
    const handler = (e) => {
      const id = e?.detail?.id;
      if (!id) return;

      TRDBG("REF event", {
        id,
        isSelected: selectedElements.includes(id),
        selKey: selectedElements.join(","),
      });

      if (!selectedElements.includes(id)) return;
      setTransformTick(t => t + 1);
    };

    window.addEventListener("element-ref-registrado", handler);
    return () => window.removeEventListener("element-ref-registrado", handler);
  }, [selectedElements.join(",")]);

  useEffect(() => {
    const firstId = selectedElements?.[0];
    if (!firstId) return;

    const firstNode = elementRefs.current?.[firstId];
    const stage = firstNode?.getStage?.();
    if (!stage) return;

    let rafId = null;
    const syncTransformer = () => {
      if (rafId != null) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        const tr = transformerRef.current;
        if (!tr) return;
        try { tr.forceUpdate?.(); } catch { }
        tr.getLayer?.()?.batchDraw?.();
      });
    };

    stage.on("dragmove", syncTransformer);
    stage.on("dragend", syncTransformer);

    return () => {
      stage.off("dragmove", syncTransformer);
      stage.off("dragend", syncTransformer);
      if (rafId != null) cancelAnimationFrame(rafId);
    };
  }, [selectedElements.join(","), elementRefs]);




  // 🔥 Render

  if (selectedElements.length === 0) return null;

  if (hayLineas && elementosTransformables.length === 0) {
    return (
      <BoundsIndicator
        selectedElements={selectedElements}
        elementRefs={elementRefs}
        objetos={objetos}
      />
    );
  }

  if (hayLineas && elementosTransformables.length > 0) {
    return (
      <BoundsIndicator
        selectedElements={selectedElements}
        elementRefs={elementRefs}
        objetos={objetos}
      />
    );
  }

  return (
    <Transformer
      name="ui"
      ref={transformerRef}

      // 🔵 borde siempre visible
      borderEnabled={true}

      borderStroke="#9333EA"


      borderStrokeWidth={transformerBorderStrokeWidth}
      padding={transformerPadding}

      // ❌ nodos y rotación OFF durante drag
      enabledAnchors={isDragging ? [] : ["bottom-right"]}
      rotateEnabled={!isDragging && !esGaleria}

      anchorFill="#9333EA"
      anchorStroke="#ffffff"
      anchorStrokeWidth={transformerAnchorStrokeWidth}
      anchorSize={transformerAnchorSize}
      anchorCornerRadius={transformerAnchorRadius}
      anchorShadowColor="rgba(147, 51, 234, 0.3)"
      anchorShadowBlur={transformerAnchorShadowBlur}
      anchorShadowOffset={{ x: 0, y: transformerAnchorShadowOffsetY }}
      keepRatio={lockAspectCountdown || esGaleria || lockAspectText}
      centeredScaling={selectedElements.length === 1 && esTexto}
      flipEnabled={false}
      resizeEnabled={!isDragging}
      rotationSnaps={[0, 45, 90, 135, 180, 225, 270, 315]}
      rotateAnchorOffset={transformerRotateOffset}
      rotationSnapTolerance={transformerRotationSnapTolerance}
      boundBoxFunc={(oldBox, newBox) => {
        const minSize = esTexto ? 20 : 10;
        const maxSize = 800;
        if (esGaleria) {
          const rows = Math.max(1, Number(primerElemento?.rows) || 1);
          const cols = Math.max(1, Number(primerElemento?.cols) || 1);
          const gap = Math.max(0, Number(primerElemento?.gap) || 0);
          const cellRatio =
            primerElemento?.ratio === "4:3"
              ? 3 / 4
              : primerElemento?.ratio === "16:9"
                ? 9 / 16
                : 1;

          const minGridWidth = gap * (cols - 1) + cols;
          const nextWidth = Math.min(
            maxSize,
            Math.max(minSize, minGridWidth, Math.abs(newBox.width))
          );
          const cellW = Math.max(1, (nextWidth - gap * (cols - 1)) / cols);
          const cellH = cellW * cellRatio;
          const nextHeight = rows * cellH + gap * (rows - 1);

          return {
            ...newBox,
            width: nextWidth,
            height: Math.max(minSize, nextHeight),
          };
        }

        if (newBox.width < minSize || newBox.height < minSize) {
          return oldBox;
        }

        if (lockAspectCountdown) {
          const baseW = Math.max(1, oldBox.width);
          const baseH = Math.max(1, oldBox.height);
          const ratio = baseW / baseH;

          const dw = Math.abs(newBox.width - oldBox.width) / baseW;
          const dh = Math.abs(newBox.height - oldBox.height) / baseH;

          let width = newBox.width;
          let height = newBox.height;

          if (dh > dw) {
            width = height * ratio;
          } else {
            height = width / ratio;
          }

          return {
            ...newBox,
            width: Math.min(Math.max(width, minSize), maxSize),
            height: Math.min(Math.max(height, minSize), maxSize),
          };
        }

        if (
          primerElemento?.tipo === "forma" &&
          primerElemento?.figura === "circle"
        ) {
          const size = Math.max(newBox.width, newBox.height);
          const finalSize = Math.min(size, maxSize);
          return {
            ...newBox,
            width: finalSize,
            height: finalSize,
          };
        }

        if (esTriangulo) {
          const safeOldW = Math.max(1, Math.abs(oldBox.width || minSize));
          const safeOldH = Math.max(1, Math.abs(oldBox.height || minSize));
          const scaleX = Math.abs(newBox.width) / safeOldW;
          const scaleY = Math.abs(newBox.height) / safeOldH;
          const uniformScale = Math.max(0.05, Math.min(scaleX, scaleY));

          const width = Math.min(Math.max(safeOldW * uniformScale, minSize), maxSize);
          const height = Math.min(Math.max(safeOldH * uniformScale, minSize), maxSize);

          return {
            ...newBox,
            width,
            height,
          };
        }

        if (
          primerElemento?.tipo === "imagen" ||
          primerElemento?.tipo === "icono"
        ) {
          const scaleX = newBox.width / oldBox.width;
          const scaleY = newBox.height / oldBox.height;
          const uniformScale = Math.min(scaleX, scaleY);

          const newWidth = oldBox.width * uniformScale;
          const newHeight = oldBox.height * uniformScale;

          return {
            ...newBox,
            width: Math.min(Math.max(newWidth, minSize), maxSize),
            height: Math.min(Math.max(newHeight, minSize), maxSize),
          };
        }

        return {
          ...newBox,
          width: Math.min(newBox.width, maxSize),
          height: Math.min(newBox.height, maxSize),
        };
      }}
      onTransformStart={(e) => {
        window._resizeData = { isResizing: true };
        const tr = transformerRef.current;
        const activeAnchor =
          typeof tr?.getActiveAnchor === "function" ? tr.getActiveAnchor() : null;
        const isRotateGesture =
          typeof activeAnchor === "string" &&
          activeAnchor.toLowerCase().includes("rotat");
        transformGestureRef.current = {
          isRotate: isRotateGesture,
          activeAnchor: activeAnchor ?? null,
        };
        if (typeof onTransformInteractionStart === "function") {
          onTransformInteractionStart({
            isRotate: isRotateGesture,
            activeAnchor: activeAnchor ?? null,
            pointerType: e?.evt?.pointerType ?? null,
          });
        }
        try {
          const nodes = tr?.nodes?.() || [];
          circleAnchorRef.current = null;
          textTransformAnchorRef.current = null;

          if (
            nodes.length === 1 &&
            primerElemento?.tipo === "forma" &&
            primerElemento?.figura === "circle"
          ) {
            try {
              const r0 = nodes[0].getClientRect({
                skipTransform: false,
                skipShadow: true,
                skipStroke: true,
              });
              circleAnchorRef.current = { left: r0.x, top: r0.y };
            } catch {}
          }

          if (nodes.length === 1 && esTexto) {
            const node = nodes[0];
            let centerX = null;
            let centerY = null;
            let baseWidth = null;
            let baseHeight = null;
            let baseVisualWidth = null;
            try {
              const rect = node.getClientRect({
                skipTransform: false,
                skipShadow: true,
                skipStroke: true,
              });
              if (Number.isFinite(rect?.x) && Number.isFinite(rect?.width)) {
                centerX = rect.x + (rect.width / 2);
              }
              if (Number.isFinite(rect?.y) && Number.isFinite(rect?.height)) {
                centerY = rect.y + (rect.height / 2);
              }
              if (Number.isFinite(rect?.width) && rect.width > 0) {
                baseWidth = rect.width;
                baseVisualWidth = rect.width;
              }
              if (Number.isFinite(rect?.height) && rect.height > 0) {
                baseHeight = rect.height;
              }
            } catch {}
            const safeBaseFontSize =
              Number.isFinite(primerElemento?.fontSize) && primerElemento.fontSize > 0
                ? primerElemento.fontSize
                : 24;
            textTransformAnchorRef.current = {
              y: typeof node?.y === "function" ? node.y() : 0,
              baseRotation:
                typeof node?.rotation === "function" ? (node.rotation() || 0) : 0,
              centerX,
              centerY,
              baseWidth,
              baseHeight,
              baseFontSize: safeBaseFontSize,
              lastPreviewFontSize: safeBaseFontSize,
              lastPreviewCenterX: centerX,
              lastPreviewCenterY: centerY,
              lastPreviewVisualWidth: baseVisualWidth,
              previewTick: 0,
            };
            TXTDBG("start", {
              id: primerElemento?.id ?? null,
              baseFontSize: safeBaseFontSize,
              baseWidth,
              baseHeight,
              centerX,
              centerY,
              nodeX: typeof node?.x === "function" ? node.x() : null,
              nodeY: typeof node?.y === "function" ? node.y() : null,
              nodeScaleX: typeof node?.scaleX === "function" ? node.scaleX() : null,
              nodeScaleY: typeof node?.scaleY === "function" ? node.scaleY() : null,
            });
          }

          const union = rectFromNodes(nodes);

          const pad = typeof tr?.padding === "function" ? tr.padding() : 0;
          const borderRect = union
            ? { x: union.x - pad, y: union.y - pad, width: union.width + pad * 2, height: union.height + pad * 2 }
            : null;

          const n = nodes[0];
          const id = n ? (typeof n.id === "function" ? n.id() : n.attrs?.id) : "∅";
          const trRect = tr?.getClientRect?.({ skipTransform: false, skipShadow: true, skipStroke: true });

          slog(
            "[TR] start",
            `id=${id}`,
            `nodes=${nodes.length}`,
            union ? `union(w=${union.width.toFixed(1)},h=${union.height.toFixed(1)})` : "union(null)",
            borderRect ? `border(w=${borderRect.width.toFixed(1)},h=${borderRect.height.toFixed(1)})` : "border(null)",
            trRect ? `trRect(w=${trRect.width.toFixed(1)},h=${trRect.height.toFixed(1)})` : "trRect(null)",
            `pad=${pad}`
          );
        } catch { }
      }}

      onTransform={(e) => {
        if (!onTransform || !transformerRef.current) return;

        const tr = transformerRef.current;
        const nodes = typeof tr.nodes === "function" ? tr.nodes() || [] : [];
        const node = nodes[0]; // ✅ nodo real (single select)
        if (!node) return;

        try {
          const pose = getTransformPose(node);
          const transformData = {
            x: pose.x,
            y: pose.y,
            rotation: pose.rotation,
            isPreview: true,
          };

          if (esTexto) {
            const originalFontSize = primerElemento.fontSize || 24;
            const scaleX = typeof node.scaleX === "function" ? node.scaleX() : 1;
            const scaleY = typeof node.scaleY === "function" ? node.scaleY() : 1;
            const anchorData = textTransformAnchorRef.current || null;
            const baseFontSize =
              Number.isFinite(anchorData?.baseFontSize) &&
              anchorData.baseFontSize > 0
                ? anchorData.baseFontSize
                : originalFontSize;

            const avgScale = (Math.abs(scaleX) + Math.abs(scaleY)) / 2;
            let scaleFromRect = null;
            let liveRectWidth = null;
            const currentRotation =
              typeof node.rotation === "function" ? (node.rotation() || 0) : 0;
            const baseRotation = Number(anchorData?.baseRotation);
            const rotationDelta = Number.isFinite(baseRotation)
              ? Math.abs(currentRotation - baseRotation)
              : 0;
            try {
              const rect = node.getClientRect({
                skipTransform: false,
                skipShadow: true,
                skipStroke: true,
              });
              if (Number.isFinite(rect?.width) && rect.width > 0) {
                liveRectWidth = rect.width;
              }
              const baseWidth = Number(anchorData?.baseWidth);
              if (
                Number.isFinite(baseWidth) &&
                baseWidth > 0 &&
                Number.isFinite(rect?.width) &&
                rect.width > 0
              ) {
                scaleFromRect = rect.width / baseWidth;
              }
            } catch {}
            const canUseRectScale = rotationDelta < 0.1;
            const effectiveScale =
              canUseRectScale && Number.isFinite(scaleFromRect) && scaleFromRect > 0
                ? scaleFromRect
                : avgScale;
            transformData.fontSize = Math.max(
              6,
              Number((baseFontSize * effectiveScale).toFixed(3))
            );
            if (textTransformAnchorRef.current) {
              const tick = Number(textTransformAnchorRef.current.previewTick || 0) + 1;
              textTransformAnchorRef.current.previewTick = tick;
              textTransformAnchorRef.current.lastPreviewFontSize = transformData.fontSize;
              if (Number.isFinite(liveRectWidth) && liveRectWidth > 0) {
                textTransformAnchorRef.current.lastPreviewVisualWidth = liveRectWidth;
              }
              if (tick <= 2 || tick % 5 === 0) {
                TXTDBG("preview", {
                  id: primerElemento?.id ?? null,
                  tick,
                  scaleX,
                  scaleY,
                  avgScale,
                  scaleFromRect,
                  effectiveScale,
                  baseFontSize,
                  fontSize: transformData.fontSize,
                  liveRectWidth,
                  centerXTarget: textTransformAnchorRef.current?.centerX ?? null,
                  nodeX: typeof node?.x === "function" ? node.x() : null,
                  nodeY: typeof node?.y === "function" ? node.y() : null,
                });
              }
            }
            transformData.scaleX = 1;
            transformData.scaleY = 1;
            if (canUseRectScale && Number.isFinite(textTransformAnchorRef.current?.y)) {
              transformData.y = textTransformAnchorRef.current.y;
            }
            if (Number.isFinite(textTransformAnchorRef.current?.centerX)) {
              transformData.textCenterX = textTransformAnchorRef.current.centerX;
              if (textTransformAnchorRef.current) {
                textTransformAnchorRef.current.lastPreviewCenterX =
                  textTransformAnchorRef.current.centerX;
              }
            }
            if (Number.isFinite(textTransformAnchorRef.current?.centerY)) {
              transformData.textCenterY = textTransformAnchorRef.current.centerY;
              if (textTransformAnchorRef.current) {
                textTransformAnchorRef.current.lastPreviewCenterY =
                  textTransformAnchorRef.current.centerY;
              }
            }
          } else {
            const scaleX = typeof node.scaleX === "function" ? node.scaleX() : 1;
            const scaleY = typeof node.scaleY === "function" ? node.scaleY() : 1;

            transformData.scaleX = scaleX;
            transformData.scaleY = scaleY;

            if (primerElemento?.tipo === "countdown") {
              const countdownSize = getCountdownScaledSize(node);
              transformData.width = countdownSize.width;
              transformData.height = countdownSize.height;
            } else if (esTriangulo) {
              const baseRadius = Number.isFinite(primerElemento?.radius)
                ? primerElemento.radius
                : 60;
              const avgScale = (Math.abs(scaleX) + Math.abs(scaleY)) / 2;
              transformData.radius = Math.max(1, baseRadius * avgScale);
            } else {
              const originalWidth = primerElemento.width || 100;
              const originalHeight = primerElemento.height || 100;
              transformData.width = Math.abs(originalWidth * scaleX);
              transformData.height = Math.abs(originalHeight * scaleY);
            }

            if (primerElemento?.figura === "circle") {
              try {
                const liveRect = node.getClientRect({
                  skipTransform: false,
                  skipShadow: true,
                  skipStroke: true,
                });
                const diameter = Math.max(1, Math.max(liveRect.width, liveRect.height));
                transformData.radius = diameter / 2;
                const anchor = circleAnchorRef.current;
                if (anchor) {
                  transformData.x = anchor.left + transformData.radius;
                  transformData.y = anchor.top + transformData.radius;
                } else {
                  transformData.x = liveRect.x + transformData.radius;
                  transformData.y = liveRect.y + transformData.radius;
                }
              } catch {}
            }
          }

          onTransform(transformData);

          // --- LOG COMPACTO (opcional) ---
          const id = (typeof node.id === "function" ? node.id() : node.attrs?.id) || "∅";
          const sx = node.scaleX?.() ?? 1;
          const sy = node.scaleY?.() ?? 1;
          const r = node.getClientRect({ skipTransform: false, skipShadow: true, skipStroke: true });
          slog(
            "[TR] live",
            `id=${id}`,
            `tipo=${primerElemento?.tipo || "∅"}`,
            `sx=${sx.toFixed(3)}`,
            `sy=${sy.toFixed(3)}`,
            `x=${(node.x?.() ?? 0).toFixed(1)}`,
            `y=${(node.y?.() ?? 0).toFixed(1)}`,
            `nodeRect(w=${r.width.toFixed(1)},h=${r.height.toFixed(1)})`,
            `w=${transformData.width ?? "∅"}`,
            `h=${transformData.height ?? "∅"}`
          );
        } catch (error) {
          console.warn("Error en onTransform:", error);
        }
      }}
      onTransformEnd={(e) => {
        const interactionSnapshot = {
          isRotate: Boolean(transformGestureRef.current?.isRotate),
          activeAnchor: transformGestureRef.current?.activeAnchor ?? null,
          pointerType: e?.evt?.pointerType ?? null,
        };
        const notifyTransformInteractionEnd = () => {
          if (typeof onTransformInteractionEnd === "function") {
            onTransformInteractionEnd(interactionSnapshot);
          }
          transformGestureRef.current = {
            isRotate: false,
            activeAnchor: null,
          };
        };

        try {
          if (!transformerRef.current || !onTransform) return;

          const tr = transformerRef.current;
          const nodes = typeof tr.nodes === "function" ? tr.nodes() || [] : [];

        // -------------------------
        // MULTI-SELECCIÓN
        // -------------------------
        if (nodes.length > 1) {
          try {
            const tScaleX = typeof tr.scaleX === "function" ? tr.scaleX() || 1 : 1;
            const tScaleY = typeof tr.scaleY === "function" ? tr.scaleY() || 1 : 1;
            const avg = (Math.abs(tScaleX) + Math.abs(tScaleY)) / 2;

            const updates = nodes
              .map((n) => {
                let id = null;
                try {
                  id = (typeof n.id === "function" ? n.id() : n.attrs?.id) || null;
                } catch { }
                if (!id) return null;

                const obj = (objetos || []).find((o) => o.id === id);
                if (!obj) return null;

                const upd = {
                  id,
                  x: typeof n.x === "function" ? n.x() : obj.x,
                  y: typeof n.y === "function" ? n.y() : obj.y,
                  rotation: typeof n.rotation === "function" ? n.rotation() || 0 : (obj.rotation || 0),
                };

                if (obj.tipo === "texto") {
                  const base = obj.fontSize || 24;
                  upd.fontSize = Math.max(6, Math.round(base * avg));
                  if (typeof n.scaleX === "function") {
                    n.scaleX(1);
                    n.scaleY(1);
                  }
                  return upd;
                }

                if (obj.tipo === "forma" && obj.figura === "circle") {
                  const baseR = obj.radius || 50;
                  upd.radius = baseR * avg;
                  if (typeof n.scaleX === "function") {
                    n.scaleX(1);
                    n.scaleY(1);
                  }
                  return upd;
                }

                if (obj.tipo === "forma" && obj.figura === "triangle") {
                  const baseR = obj.radius || 60;
                  upd.radius = Math.max(1, baseR * avg);
                  if (typeof n.scaleX === "function") {
                    n.scaleX(1);
                    n.scaleY(1);
                  }
                  return upd;
                }

                if (obj.tipo === "countdown") {
                  const countdownSize = getCountdownScaledSize(n);
                  upd.width = countdownSize.width;
                  upd.height = countdownSize.height;
                  return upd;
                }

                const baseW =
                  obj.width != null ? obj.width : (typeof n.width === "function" ? n.width() : 100);
                const baseH =
                  obj.height != null ? obj.height : (typeof n.height === "function" ? n.height() : 100);

                upd.width = Math.abs(baseW * tScaleX);
                upd.height = Math.abs(baseH * tScaleY);

                if (typeof n.scaleX === "function") {
                  n.scaleX(1);
                  n.scaleY(1);
                }
                return upd;
              })
              .filter(Boolean);

            onTransform({ isFinal: true, batch: updates });

            if (typeof tr.scaleX === "function") {
              tr.scaleX(1);
              tr.scaleY(1);
            }
            tr.getLayer()?.batchDraw();

            window._resizeData = { isResizing: false };
            setTimeout(() => {
              window._resizeData = null;
            }, 100);

            return;
          } catch (err) {
            console.warn("Error en onTransformEnd (multi):", err);
            window._resizeData = null;
            return;
          }
        }

        // -------------------------
        // SINGLE-SELECCIÓN
        // -------------------------
        const node = nodes[0];
        if (!node) return;

        const pose = getTransformPose(node);
        const finalData = {
            x: pose.x,
            y: pose.y,
            rotation: pose.rotation,
            isFinal: true,
          };
          let textPreviewEndSnapshot = null;

          if (esTexto) {
            const originalFontSize = primerElemento.fontSize || 24;
            const scaleX = typeof node.scaleX === "function" ? node.scaleX() : 1;
            const scaleY = typeof node.scaleY === "function" ? node.scaleY() : 1;
            const anchorData = textTransformAnchorRef.current || null;
            const baseFontSize =
              Number.isFinite(anchorData?.baseFontSize) &&
              anchorData.baseFontSize > 0
                ? anchorData.baseFontSize
                : originalFontSize;
            const avgScale = (Math.abs(scaleX) + Math.abs(scaleY)) / 2;
            let scaleFromRect = null;
            let visualWidthFromRect = null;
            const currentRotation =
              typeof node.rotation === "function" ? (node.rotation() || 0) : 0;
            const baseRotation = Number(anchorData?.baseRotation);
            const rotationDelta = Number.isFinite(baseRotation)
              ? Math.abs(currentRotation - baseRotation)
              : 0;
            try {
              const rect = node.getClientRect({
                skipTransform: false,
                skipShadow: true,
                skipStroke: true,
              });
              if (Number.isFinite(rect?.width) && rect.width > 0) {
                visualWidthFromRect = rect.width;
              }
              const baseWidth = Number(anchorData?.baseWidth);
              if (
                Number.isFinite(baseWidth) &&
                baseWidth > 0 &&
                Number.isFinite(rect?.width) &&
                rect.width > 0
              ) {
                scaleFromRect = rect.width / baseWidth;
              }
            } catch {}
            const canUseRectScale = rotationDelta < 0.1;
            const effectiveScale =
              canUseRectScale && Number.isFinite(scaleFromRect) && scaleFromRect > 0
                ? scaleFromRect
                : avgScale;

            const computedFontSize = Math.max(
              6,
              Number((baseFontSize * effectiveScale).toFixed(3))
            );
            finalData.fontSize = Math.max(
              6,
              Number(
                Number.isFinite(anchorData?.lastPreviewFontSize) &&
                  anchorData.lastPreviewFontSize > 0
                  ? anchorData.lastPreviewFontSize
                  : computedFontSize
              )
            );
            finalData.scaleX = 1;
            finalData.scaleY = 1;
            if (canUseRectScale && Number.isFinite(anchorData?.y)) {
              finalData.y = anchorData.y;
            }
            if (Number.isFinite(anchorData?.lastPreviewCenterX)) {
              finalData.textCenterX = anchorData.lastPreviewCenterX;
            } else if (Number.isFinite(anchorData?.centerX)) {
              finalData.textCenterX = anchorData.centerX;
            }
            if (Number.isFinite(anchorData?.lastPreviewCenterY)) {
              finalData.textCenterY = anchorData.lastPreviewCenterY;
            } else if (Number.isFinite(anchorData?.centerY)) {
              finalData.textCenterY = anchorData.centerY;
            }
            const visualWidth =
              Number.isFinite(anchorData?.lastPreviewVisualWidth) &&
              anchorData.lastPreviewVisualWidth > 0
                ? anchorData.lastPreviewVisualWidth
                : visualWidthFromRect;
            if (Number.isFinite(visualWidth) && visualWidth > 0) {
              finalData.textVisualWidth = visualWidth;
            }
            textPreviewEndSnapshot = {
              id: primerElemento?.id ?? null,
              x: typeof node?.x === "function" ? node.x() : null,
              y: typeof node?.y === "function" ? node.y() : null,
              scaleX,
              scaleY,
              fontSize: typeof node?.fontSize === "function" ? node.fontSize() : null,
              rectWidth: Number.isFinite(visualWidthFromRect) ? visualWidthFromRect : null,
              rectHeight: null,
            };
            try {
              const rectForSnapshot = node.getClientRect({
                skipTransform: false,
                skipShadow: true,
                skipStroke: true,
              });
              if (Number.isFinite(rectForSnapshot?.height)) {
                textPreviewEndSnapshot.rectHeight = rectForSnapshot.height;
              }
            } catch {}
            TXTDBG("end", {
              id: primerElemento?.id ?? null,
              scaleX,
              scaleY,
              avgScale,
              scaleFromRect,
              effectiveScale,
              computedFontSize,
              finalFontSize: finalData.fontSize,
              textCenterX: finalData.textCenterX ?? null,
              textCenterY: finalData.textCenterY ?? null,
              textVisualWidth: finalData.textVisualWidth ?? null,
              nodeRectWidth: visualWidthFromRect,
              nodeX: typeof node?.x === "function" ? node.x() : null,
              nodeY: typeof node?.y === "function" ? node.y() : null,
            });

            // Aplanar escala del texto en el release para evitar doble escalado
            // (escala del nodo + fontSize persistido).
            try {
              if (typeof node.scaleX === "function") node.scaleX(1);
              if (typeof node.scaleY === "function") node.scaleY(1);

              if (
                Number.isFinite(finalData.fontSize) &&
                typeof node.fontSize === "function"
              ) {
                node.fontSize(finalData.fontSize);
              }
              const targetCenterX = Number(finalData.textCenterX);
              const targetCenterY = Number(finalData.textCenterY);
              if (
                (Number.isFinite(targetCenterX) || Number.isFinite(targetCenterY)) &&
                typeof node.x === "function" &&
                typeof node.y === "function"
              ) {
                try {
                  const flattenedRect = node.getClientRect({
                    skipTransform: false,
                    skipShadow: true,
                    skipStroke: true,
                  });
                  const flattenedCenterX =
                    Number.isFinite(flattenedRect?.x) &&
                    Number.isFinite(flattenedRect?.width)
                      ? flattenedRect.x + (flattenedRect.width / 2)
                      : null;
                  const flattenedCenterY =
                    Number.isFinite(flattenedRect?.y) &&
                    Number.isFinite(flattenedRect?.height)
                      ? flattenedRect.y + (flattenedRect.height / 2)
                      : null;

                  if (Number.isFinite(flattenedCenterX) && Number.isFinite(targetCenterX)) {
                    node.x(node.x() + (targetCenterX - flattenedCenterX));
                  }
                  if (Number.isFinite(flattenedCenterY) && Number.isFinite(targetCenterY)) {
                    node.y(node.y() + (targetCenterY - flattenedCenterY));
                  }
                } catch {}
              }

              node.getLayer()?.batchDraw();
            } catch (err) {
              console.warn("Error aplanando escala de texto (sync):", err);
            }

            if (!canUseRectScale) {
              if (typeof node?.x === "function") {
                finalData.x = node.x();
              }
              if (typeof node?.y === "function") {
                finalData.y = node.y();
              }
            }

            // Para texto evitamos aplanar antes del commit en React,
            // así no aparece un frame intermedio con tamaño "saltado".
            textTransformAnchorRef.current = null;
          } else {
            const scaleX = typeof node.scaleX === "function" ? node.scaleX() : 1;
            const scaleY = typeof node.scaleY === "function" ? node.scaleY() : 1;
            if (primerElemento?.tipo === "countdown") {
              // Countdown: persistir escala real para que el resultado final
              // sea exactamente el mismo que se ve al soltar.
              finalData.scaleX = scaleX;
              finalData.scaleY = scaleY;
              const countdownSize = getCountdownScaledSize(node);
              finalData.width = countdownSize.width;
              finalData.height = countdownSize.height;
            } else if (esTriangulo) {
              const baseRadius = Number.isFinite(primerElemento?.radius)
                ? primerElemento.radius
                : 60;
              const avgScale = (Math.abs(scaleX) + Math.abs(scaleY)) / 2;
              finalData.scaleX = 1;
              finalData.scaleY = 1;
              finalData.radius = Math.max(1, baseRadius * avgScale);

              try {
                node.scaleX(1);
                node.scaleY(1);
                if (typeof node.radius === "function") node.radius(finalData.radius);
                node.getLayer()?.batchDraw();
              } catch (err) {
                console.warn("Error aplanando escala de triángulo (sync):", err);
              }
            } else {
              finalData.scaleX = 1;
              finalData.scaleY = 1;
              const originalWidth = primerElemento.width || 100;
              const originalHeight = primerElemento.height || 100;

              finalData.width = Math.abs(originalWidth * scaleX);
              finalData.height = Math.abs(originalHeight * scaleY);

              if (primerElemento?.figura === "circle") {
                try {
                  const liveRect = node.getClientRect({
                    skipTransform: false,
                    skipShadow: true,
                    skipStroke: true,
                  });
                  const diameter = Math.max(1, Math.max(liveRect.width, liveRect.height));
                  finalData.radius = diameter / 2;
                  const anchor = circleAnchorRef.current;
                  if (anchor) {
                    finalData.x = anchor.left + finalData.radius;
                    finalData.y = anchor.top + finalData.radius;
                  } else {
                    finalData.x = liveRect.x + finalData.radius;
                    finalData.y = liveRect.y + finalData.radius;
                  }
                } catch {}
              }

              // ✅ Aplanar escala INMEDIATO
              try {
                const fw = finalData.width;
                const fh = finalData.height;

                node.scaleX(1);
                node.scaleY(1);

                if (fw != null && typeof node.width === "function") node.width(fw);
                if (fh != null && typeof node.height === "function") node.height(fh);

                if (
                  primerElemento?.figura === "circle" &&
                  finalData.radius != null &&
                  typeof node.radius === "function"
                ) {
                  node.radius(finalData.radius);
                }

                node.getLayer()?.batchDraw();
              } catch (err) {
                console.warn("Error aplanando escalas (sync):", err);
              }
            }
          }

          onTransform(finalData);
          circleAnchorRef.current = null;


          // ✅ Reatachar 1 vez, con ref fresco, en el próximo frame
          try {
            const tr2 = transformerRef.current;
            if (!tr2) return;

            TRDBG("onTransformEnd -> schedule RAF reattach", {
              selKey: selectedElements.join(","),
              idSel: selectedElements?.[0] || null
            });

            requestAnimationFrame(() => {
              const idSel = selectedElements?.[0];
              const freshNode = idSel ? elementRefs.current?.[idSel] : null;

              TRDBG("onTransformEnd RAF", {
                idSel,
                hasFresh: !!freshNode,
                destroyed: !!freshNode?._destroyed,
                hasStage: !!freshNode?.getStage?.(),
              });

              // Si el nodo no está listo, despegar y salir
              if (!freshNode || freshNode._destroyed || !freshNode.getStage?.()) {
                TRDBG("onTransformEnd RAF -> DETACH nodes([])", { idSel });
                try { tr2.nodes([]); tr2.getLayer?.()?.batchDraw(); } catch { }
                return;
              }

              try {
                TRDBG("onTransformEnd RAF -> DETACH nodes([])", { idSel });
                tr2.nodes([freshNode]);
                tr2.forceUpdate();
                tr2.getLayer?.()?.batchDraw();

                if (textPreviewEndSnapshot && freshNode) {
                  try {
                    const postRect = freshNode.getClientRect({
                      skipTransform: false,
                      skipShadow: true,
                      skipStroke: true,
                    });
                    TXTDBG("post-commit:raf1", {
                      id: idSel,
                      pre: textPreviewEndSnapshot,
                      post: {
                        x: typeof freshNode?.x === "function" ? freshNode.x() : null,
                        y: typeof freshNode?.y === "function" ? freshNode.y() : null,
                        scaleX: typeof freshNode?.scaleX === "function" ? freshNode.scaleX() : null,
                        scaleY: typeof freshNode?.scaleY === "function" ? freshNode.scaleY() : null,
                        fontSize: typeof freshNode?.fontSize === "function" ? freshNode.fontSize() : null,
                        rectWidth: Number.isFinite(postRect?.width) ? postRect.width : null,
                        rectHeight: Number.isFinite(postRect?.height) ? postRect.height : null,
                      },
                      delta: {
                        width:
                          Number.isFinite(postRect?.width) &&
                          Number.isFinite(textPreviewEndSnapshot.rectWidth)
                            ? (postRect.width - textPreviewEndSnapshot.rectWidth)
                            : null,
                        height:
                          Number.isFinite(postRect?.height) &&
                          Number.isFinite(textPreviewEndSnapshot.rectHeight)
                            ? (postRect.height - textPreviewEndSnapshot.rectHeight)
                            : null,
                      },
                    });
                  } catch {}
                  requestAnimationFrame(() => {
                    const freshNode2 = idSel ? elementRefs.current?.[idSel] : null;
                    if (!freshNode2) return;
                    try {
                      const postRect2 = freshNode2.getClientRect({
                        skipTransform: false,
                        skipShadow: true,
                        skipStroke: true,
                      });
                      TXTDBG("post-commit:raf2", {
                        id: idSel,
                        post: {
                          x: typeof freshNode2?.x === "function" ? freshNode2.x() : null,
                          y: typeof freshNode2?.y === "function" ? freshNode2.y() : null,
                          scaleX: typeof freshNode2?.scaleX === "function" ? freshNode2.scaleX() : null,
                          scaleY: typeof freshNode2?.scaleY === "function" ? freshNode2.scaleY() : null,
                          fontSize: typeof freshNode2?.fontSize === "function" ? freshNode2.fontSize() : null,
                          rectWidth: Number.isFinite(postRect2?.width) ? postRect2.width : null,
                          rectHeight: Number.isFinite(postRect2?.height) ? postRect2.height : null,
                        },
                        deltaFromPre: {
                          width:
                            Number.isFinite(postRect2?.width) &&
                            Number.isFinite(textPreviewEndSnapshot.rectWidth)
                              ? (postRect2.width - textPreviewEndSnapshot.rectWidth)
                              : null,
                          height:
                            Number.isFinite(postRect2?.height) &&
                            Number.isFinite(textPreviewEndSnapshot.rectHeight)
                              ? (postRect2.height - textPreviewEndSnapshot.rectHeight)
                              : null,
                        },
                      });
                    } catch {}
                  });
                }
              } catch { }
            });
          } catch { }


        } catch (error) {
          console.warn("Error en onTransformEnd:", error);
          window._resizeData = null;
        } finally {
          notifyTransformInteractionEnd();
        }
      }}

    />
  );
}
