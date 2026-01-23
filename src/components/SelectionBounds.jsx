// SelectionBounds.jsx
import { useEffect, useRef, useState } from "react";
import { Transformer, Rect } from "react-konva";



const DEBUG_SELECTION_BOUNDS = true;

const sbLog = (...args) => {
  if (!DEBUG_SELECTION_BOUNDS) return;
  console.log("[SB]", ...args);
};
const slog = sbLog;

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
  onTransform,
}) {
  const transformerRef = useRef(null);
  const [transformTick, setTransformTick] = useState(0);

  const elementosSeleccionadosData = selectedElements
    .map((id) => objetos.find((obj) => obj.id === id))
    .filter(Boolean);

  const primerElemento = elementosSeleccionadosData[0] || null;
  const esTexto = primerElemento?.tipo === "texto";

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
    elementosTransformables.length > 0 && !hasGallery;

  // 🔥 Efecto principal del Transformer (con retry)
  useEffect(() => {
    const applyTransformer = (label = "now") => {
      slog("applyTransformer", label, {
        selectedElements,
        elementosTransformables: elementosTransformables.map((o) => ({
          id: o.id,
          tipo: o.tipo,
        })),
      });

      if (hasGallery) {
        transformerRef.current?.nodes([]);
        transformerRef.current?.getLayer()?.batchDraw();
        return 0;
      }

      const editing = window.editing || {};
      if (editing.id && selectedElements.includes(editing.id)) {
        if (transformerRef.current) {
          transformerRef.current.nodes([]);
          transformerRef.current.getLayer()?.batchDraw();
        }
        return 0;
      }

      if (!transformerRef.current || !deberiaUsarTransformer) {
        if (transformerRef.current) {
          transformerRef.current.nodes([]);
          transformerRef.current.getLayer()?.batchDraw();
        }
        return 0;
      }

      // 1) Resolver nodes desde refs (fuente de verdad)
      let nodosTransformables = elementosTransformables
        .map((obj) => elementRefs.current?.[obj.id])
        .filter(Boolean);

      // 2) ✅ Single-select: usar SIEMPRE el ref actual (evita node stale del transformer)
      if (selectedElements.length === 1) {
        const idSel = selectedElements[0];
        const refNode = elementRefs.current?.[idSel] || null;
        if (refNode && typeof refNode.getClientRect === "function") {
          nodosTransformables = [refNode];
        }
      }


      if (nodosTransformables.length === 0 && elementosTransformables.length > 0) {
        slog(
          "[SelectionBounds] ⚠️ No hay nodos transformables aún (posible imagen sin terminar de cargar)",
          { ids: elementosTransformables.map((o) => o.id) }
        );
      }

      if (nodosTransformables.length > 0) {
        transformerRef.current.nodes(nodosTransformables);

        // ✅ Fuerza recalculo interno del transformer (borde punteado)
        transformerRef.current.forceUpdate?.();
        transformerRef.current.getLayer()?.batchDraw();

        // ✅ Auto-retry si el transformer se enganchó antes de que el nodo tome el size final
        if (selectedElements.length === 1 && nodosTransformables[0]) {
          const idSel = selectedElements[0];
          const objSel = (objetos || []).find(o => o.id === idSel) || null;

          const n = nodosTransformables[0];
          const nr = n.getClientRect({ skipTransform: false, skipShadow: true, skipStroke: true });

          const expectedW = objSel?.width ?? null;
          const expectedH = objSel?.height ?? null;

          // tolerancia (px)
          const eps = 3;

          const wMismatch = expectedW != null ? Math.abs(nr.width - expectedW) > eps : false;
          const hMismatch = expectedH != null ? Math.abs(nr.height - expectedH) > eps : false;

          if (wMismatch || hMismatch) {
            // Reintento 2 frames después (cuando React-Konva ya aplicó el nuevo layout)
            requestAnimationFrame(() => {
              requestAnimationFrame(() => {
                try {
                  if (!transformerRef.current) return;
                  const freshNode = elementRefs.current?.[idSel];
                  if (!freshNode) return;

                  transformerRef.current.nodes([freshNode]);
                  transformerRef.current.forceUpdate?.();
                  transformerRef.current.getLayer()?.batchDraw();

                  const nr2 = freshNode.getClientRect({ skipTransform: false, skipShadow: true, skipStroke: true });
                  sbLog("[TR] retry-attach",
                    `expected(w=${expectedW ?? "∅"},h=${expectedH ?? "∅"})`,
                    `before(w=${nr.width.toFixed(1)},h=${nr.height.toFixed(1)})`,
                    `after(w=${nr2.width.toFixed(1)},h=${nr2.height.toFixed(1)})`
                  );
                } catch { }
              });
            });
          }
        }


        if (DEBUG_SELECTION_BOUNDS && selectedElements.length === 1) {
          const n = nodosTransformables[0];
          const nr = n.getClientRect({ skipTransform: false, skipShadow: true, skipStroke: true });
          const trRect = transformerRef.current.getClientRect({ skipTransform: false, skipShadow: true, skipStroke: true });
          sbLog("[TR] attached-check",
            `node(w=${nr.width.toFixed(1)},h=${nr.height.toFixed(1)})`,
            `trRect(w=${trRect.width.toFixed(1)},h=${trRect.height.toFixed(1)})`
          );
        }


        if (DEBUG_SELECTION_BOUNDS) {
          nodosTransformables.forEach((n) => {
            const rect = n.getClientRect({
              skipTransform: false,
              skipShadow: true,
              skipStroke: true,
            });

            sbLog("attach node", {
              id: typeof n.id === "function" ? n.id() : n.attrs?.id,
              tipo: n.attrs?.tipo,
              rect,
              scale: {
                sx: n.scaleX?.(),
                sy: n.scaleY?.(),
              },
            });
          });
        }

        // batchDraw extra en el próximo frame (por si Konva ajusta métricas después)
        const layer = transformerRef.current.getLayer();
        if (layer) {
          requestAnimationFrame(() => {
            transformerRef.current?.forceUpdate?.();
            layer.batchDraw();
          });
        }
      }

      return nodosTransformables.length;
    };

    const countNow = applyTransformer("now");

    let retryId;
    if (countNow === 0 && elementosTransformables.length > 0) {
      retryId = setTimeout(() => {
        applyTransformer("retry");
      }, 60);
    }

    return () => {
      if (retryId) clearTimeout(retryId);
    };
  }, [
    selectedElements.length,
    selectedElements.join(","),
    deberiaUsarTransformer,
    elementosTransformables.length,
    transformTick,
    hasGallery,
    elementRefs,
  ]);


  // 📡 Cuando un elemento seleccionado registra su ref Konva, reintentamos
  useEffect(() => {
    const handler = (e) => {
      const id = e?.detail?.id;
      if (!id) return;
      if (!selectedElements.includes(id)) return;

      // 1) ahora
      setTransformTick((t) => t + 1);

      // 2) 1 frame después
      requestAnimationFrame(() => {
        setTransformTick((t) => t + 1);

        // 3) 2 frames después (opcional, pero ayuda en casos raros)
        requestAnimationFrame(() => {
          setTransformTick((t) => t + 1);
        });
      });
    };

    window.addEventListener("element-ref-registrado", handler);
    return () => window.removeEventListener("element-ref-registrado", handler);
  }, [selectedElements.join(",")]);


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

  if (hasGallery) {
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
      enabledAnchors={["bottom-right"]}
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
            height: Math.min(Math.max(newHeight, minSize), maxSize),
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
      onTransformStart={() => {
        window._resizeData = { isResizing: true };
        try {
          const tr = transformerRef.current;
          const nodes = tr?.nodes?.() || [];

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
          const transformData = {
            x: node.x(),
            y: node.y(),
            rotation: node.rotation() || 0,
            isPreview: true,
          };

          if (esTexto) {
            const originalFontSize = primerElemento.fontSize || 24;
            const scaleX = typeof node.scaleX === "function" ? node.scaleX() : 1;
            const scaleY = typeof node.scaleY === "function" ? node.scaleY() : 1;

            const avgScale = (Math.abs(scaleX) + Math.abs(scaleY)) / 2;
            transformData.fontSize = Math.max(6, Math.round(originalFontSize * avgScale));
            transformData.scaleX = 1;
            transformData.scaleY = 1;
          } else {
            const scaleX = typeof node.scaleX === "function" ? node.scaleX() : 1;
            const scaleY = typeof node.scaleY === "function" ? node.scaleY() : 1;

            transformData.scaleX = scaleX;
            transformData.scaleY = scaleY;

            const originalWidth = primerElemento.width || 100;
            const originalHeight = primerElemento.height || 100;

            transformData.width = Math.abs(originalWidth * scaleX);
            transformData.height = Math.abs(originalHeight * scaleY);

            if (primerElemento?.figura === "circle") {
              const avgScale = (Math.abs(scaleX) + Math.abs(scaleY)) / 2;
              transformData.radius = (primerElemento.radius || 50) * avgScale;
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

        try {
          const finalData = {
            x: node.x(),
            y: node.y(),
            rotation: node.rotation() || 0,
            isFinal: true,
          };

          if (esTexto) {
            const originalFontSize = primerElemento.fontSize || 24;
            const scaleX = typeof node.scaleX === "function" ? node.scaleX() : 1;
            const scaleY = typeof node.scaleY === "function" ? node.scaleY() : 1;
            const avgScale = (Math.abs(scaleX) + Math.abs(scaleY)) / 2;

            finalData.fontSize = Math.max(6, Math.round(originalFontSize * avgScale));
            finalData.scaleX = 1;
            finalData.scaleY = 1;

            // ✅ Aplanado sync para texto (solo escala)
            try {
              node.scaleX(1);
              node.scaleY(1);
              node.getLayer()?.batchDraw();
            } catch (err) {
              console.warn("Error aplanando escalas de texto (sync):", err);
            }
          } else {
            const originalWidth = primerElemento.width || 100;
            const originalHeight = primerElemento.height || 100;

            const scaleX = typeof node.scaleX === "function" ? node.scaleX() : 1;
            const scaleY = typeof node.scaleY === "function" ? node.scaleY() : 1;

            finalData.width = Math.abs(originalWidth * scaleX);
            finalData.height = Math.abs(originalHeight * scaleY);
            finalData.scaleX = 1;
            finalData.scaleY = 1;

            if (primerElemento?.figura === "circle") {
              const avgScale = (Math.abs(scaleX) + Math.abs(scaleY)) / 2;
              finalData.radius = (primerElemento.radius || 50) * avgScale;
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

          onTransform(finalData);

          // ✅ Detach + Attach (borra cache interno del transformer)
          try {
            const tr2 = transformerRef.current;
            if (tr2) {
              const reattach = () => {
                tr2.nodes([]);
                tr2.forceUpdate();

                tr2.nodes([node]);
                tr2.forceUpdate();
                tr2.getLayer()?.batchDraw();
              };

              reattach();
              requestAnimationFrame(() => {
                reattach();
                requestAnimationFrame(() => reattach());
              });
            }
          } catch { }

          // ✅ Re-aplicar transformer DESPUÉS de que React/Konva re-rendericen el tamaño final
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              // 1) dispara el effect applyTransformer en el momento correcto
              setTransformTick((t) => t + 1);


            });
          });


        } catch (error) {
          console.warn("Error en onTransformEnd:", error);
          window._resizeData = null;
        }
      }}

    />
  );
}
