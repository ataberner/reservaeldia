// src/components/editor/countdown/CountdownKonva.jsx
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { Group, Image as KonvaImage, Rect, Text } from "react-konva";
import useImage from "use-image";
import { getRemainingParts, fmt } from "./countdownUtils";
import { calcularOffsetY } from "@/utils/layout";
import {
  estimateCountdownUnitHeight,
  resolveCanvasPaint,
} from "@/domain/countdownPresets/renderModel";

import { startDragGrupalLider, previewDragGrupal, endDragGrupal } from "@/drag/dragGrupal";
import { startDragIndividual, previewDragIndividual, endDragIndividual } from "@/drag/dragIndividual";

const UNIT_LABELS = Object.freeze({
  days: "Dias",
  hours: "Horas",
  minutes: "Min",
  seconds: "Seg",
});

const DEFAULT_UNITS = Object.freeze(["days", "hours", "minutes", "seconds"]);

function normalizeUnits(value) {
  if (!Array.isArray(value)) return [...DEFAULT_UNITS];
  const out = [];
  value.forEach((unit) => {
    const safe = String(unit || "").trim();
    if (!UNIT_LABELS[safe]) return;
    if (!out.includes(safe)) out.push(safe);
  });
  return out.length > 0 ? out : [...DEFAULT_UNITS];
}

function applyLabelTransform(label, mode) {
  const safe = String(label || "");
  if (mode === "uppercase") return safe.toUpperCase();
  if (mode === "lowercase") return safe.toLowerCase();
  if (mode === "capitalize") return safe.replace(/\b\w/g, (m) => m.toUpperCase());
  return safe;
}

function toFinite(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * ✅ Comportamiento correcto:
 * - Click simple: SOLO selecciona (0 movimiento)
 * - Drag: SOLO si mantiene apretado + mueve más de THRESHOLD_PX
 *
 * ✅ Implementación pro:
 * - El nodo está draggable=false siempre.
 * - En mousedown/touchstart: empezamos un "press".
 * - En mousemove/touchmove global: si supera umbral => habilitamos draggable y llamamos startDrag()
 * - En mouseup/touchend global: si no llegó a umbral => no hubo drag; si hubo => cerramos y deshabilitamos.
 */
export default function CountdownKonva({
  obj,
  registerRef,
  onHover,
  seccionesOrdenadas,
  altoCanvas,
  onSelect,
  onChange,
  onDragStartPersonalizado,
  onDragMovePersonalizado,
  onDragEndPersonalizado,
  dragStartPos,
  hasDragged,
}) {
  const rootRef = useRef(null);
  const dragMoveRafRef = useRef(null);
  const lastDragMovePosRef = useRef(null);

  // Tick cada 1s (no re-render si estamos arrastrando)
  const [tick, setTick] = useState(0);
  const draggingRef = useRef(false);

  useEffect(() => {
    const t = setInterval(() => {
      if (!draggingRef.current) setTick((n) => (n + 1) % 60);
    }, 1000);
    return () => clearInterval(t);
  }, []);

  // Registrar nodo raíz
  const setRefs = useCallback(
    (node) => {
      rootRef.current = node;
      if (typeof registerRef === "function") registerRef(obj.id, node || null);
    },
    [obj.id, registerRef]
  );

  // y absoluta = y relativa + offset de sección
  const yAbs = useMemo(() => {
    const idx = seccionesOrdenadas.findIndex((s) => s.id === obj.seccionId);
    const safe = idx >= 0 ? idx : 0;
    const off = calcularOffsetY(seccionesOrdenadas, safe, altoCanvas) || 0;
    return (obj.y ?? 0) + off;
  }, [obj.y, obj.seccionId, seccionesOrdenadas, altoCanvas]);

  // Tiempo restante
  const state = useMemo(() => getRemainingParts(obj.fechaObjetivo), [obj.fechaObjetivo, tick]);

  const visibleUnits = useMemo(
    () => normalizeUnits(obj.visibleUnits),
    [obj.visibleUnits]
  );

  const parts = useMemo(() => {
    const values = {
      days: fmt(state.d, obj.padZero),
      hours: fmt(state.h, obj.padZero),
      minutes: fmt(state.m, obj.padZero),
      seconds: fmt(state.s, obj.padZero),
    };

    return visibleUnits.map((unit) => ({
      key: unit,
      value: values[unit],
      label: UNIT_LABELS[unit],
    }));
  }, [state.d, state.h, state.m, state.s, obj.padZero, visibleUnits]);

  // Layout (countdown v2 + fallback legacy)
  const n = Math.max(1, parts.length);
  const gap = Math.max(0, toFinite(obj.gap, 8));
  const framePadding = Math.max(0, toFinite(obj.framePadding, 10));
  const paddingY = Math.max(2, toFinite(obj.paddingY, 6));
  const paddingX = Math.max(2, toFinite(obj.paddingX, 8));
  const valueSize = Math.max(10, toFinite(obj.fontSize, 16));
  const labelSize = Math.max(8, toFinite(obj.labelSize, 10));
  const showLabels = obj.showLabels !== false;
  const distribution = String(obj.distribution || obj.layoutType || 'centered');
  const layoutType = String(obj.layoutType || 'singleFrame');
  const labelTransform = String(obj.labelTransform || 'uppercase');
  const lineHeight = Math.max(0.8, toFinite(obj.lineHeight, 1.05));
  const letterSpacing = toFinite(obj.letterSpacing, 0);
  const frameStrokeColor = resolveCanvasPaint(obj.frameColor, "#773dbe");
  const unitFillColor = resolveCanvasPaint(obj.boxBg, "transparent");
  const unitStrokeColor = resolveCanvasPaint(obj.boxBorder, "transparent");
  const valueTextColor = resolveCanvasPaint(obj.color, "#111827");
  const labelTextColor = resolveCanvasPaint(obj.labelColor, "#6b7280");
  const backgroundColor = resolveCanvasPaint(obj.background, "transparent");

  const baseChipW = Math.max(36, toFinite(obj.chipWidth, 46) + paddingX * 2);
  const textDrivenChipH = Math.max(
    44,
    paddingY * 2 + valueSize + (showLabels ? labelSize + 6 : 0)
  );
  const layoutDrivenChipH = estimateCountdownUnitHeight({
    tamanoBase: toFinite(obj.tamanoBase, 320),
    distribution,
    unitsCount: n,
  });
  const chipH = Math.max(textDrivenChipH, layoutDrivenChipH);

  const cols =
    distribution === 'vertical'
      ? 1
      : distribution === 'grid'
      ? Math.min(2, n)
      : n;
  const rows = distribution === 'vertical' ? n : distribution === 'grid' ? Math.ceil(n / cols) : 1;

  const editorialWidths =
    distribution === 'editorial'
      ? Array.from({ length: n }, (_, index) =>
          Math.max(34, Math.round(baseChipW * (index === 0 && n > 1 ? 1.25 : 0.88)))
        )
      : [];

  const naturalW =
    distribution === 'vertical'
      ? baseChipW
      : distribution === 'grid'
      ? cols * baseChipW + gap * (cols - 1)
      : distribution === 'editorial'
      ? editorialWidths.reduce((acc, width) => acc + width, 0) + gap * Math.max(0, n - 1)
      : n * baseChipW + gap * (n - 1);

  const naturalH =
    distribution === 'vertical' || distribution === 'grid'
      ? rows * chipH + gap * Math.max(0, rows - 1)
      : chipH;

  const containerW = Math.max(
    toFinite(obj.width, 0),
    naturalW + (layoutType === 'singleFrame' ? framePadding * 2 : 0)
  );
  const containerH = Math.max(
    toFinite(obj.height, 0),
    naturalH + (layoutType === 'singleFrame' ? framePadding * 2 : 0)
  );

  const contentBounds = {
    x: layoutType === 'singleFrame' ? framePadding : 0,
    y: layoutType === 'singleFrame' ? framePadding : 0,
    width: Math.max(1, containerW - (layoutType === 'singleFrame' ? framePadding * 2 : 0)),
    height: Math.max(1, containerH - (layoutType === 'singleFrame' ? framePadding * 2 : 0)),
  };

  const distributionW =
    distribution === 'grid'
      ? cols * baseChipW + gap * (cols - 1)
      : distribution === 'vertical'
      ? baseChipW
      : naturalW;
  const distributionH =
    distribution === 'vertical' || distribution === 'grid'
      ? rows * chipH + gap * Math.max(0, rows - 1)
      : chipH;

  const startX = contentBounds.x + (contentBounds.width - distributionW) / 2;
  const startY = contentBounds.y + (contentBounds.height - distributionH) / 2;

  const unitLayouts = useMemo(() => {
    if (distribution === 'vertical') {
      return parts.map((part, index) => ({
        ...part,
        x: contentBounds.x + (contentBounds.width - baseChipW) / 2,
        y: startY + index * (chipH + gap),
        width: baseChipW,
        height: chipH,
      }));
    }

    if (distribution === 'grid') {
      return parts.map((part, index) => {
        const row = Math.floor(index / cols);
        const col = index % cols;
        return {
          ...part,
          x: startX + col * (baseChipW + gap),
          y: startY + row * (chipH + gap),
          width: baseChipW,
          height: chipH,
        };
      });
    }

    if (distribution === 'editorial') {
      let cursorX = startX;
      return parts.map((part, index) => {
        const width = editorialWidths[index] || baseChipW;
        const item = {
          ...part,
          x: cursorX,
          y: startY,
          width,
          height: chipH,
        };
        cursorX += width + gap;
        return item;
      });
    }

    return parts.map((part, index) => ({
      ...part,
      x: startX + index * (baseChipW + gap),
      y: startY,
      width: baseChipW,
      height: chipH,
    }));
  }, [
    distribution,
    parts,
    contentBounds.x,
    contentBounds.width,
    startY,
    gap,
    chipH,
    cols,
    baseChipW,
    startX,
    editorialWidths,
  ]);
  const separatorText = String(obj.separator || "");
  const separatorFontSize = Math.max(10, Math.round(valueSize * 0.64));
  const canRenderSeparators = Boolean(
    separatorText && distribution !== "vertical" && distribution !== "grid" && unitLayouts.length > 1
  );
  const separatorLayouts = useMemo(() => {
    if (!canRenderSeparators) return [];
    return unitLayouts.slice(0, -1).map((item, index) => {
      const next = unitLayouts[index + 1];
      const itemRight = item.x + item.width;
      const midpointX = itemRight + (next.x - itemRight) / 2;
      const width = Math.max(12, Math.round(separatorFontSize * 1.4));
      return {
        key: `${item.key}-${next.key}-${index}`,
        x: midpointX - width / 2,
        y: item.y + Math.max(4, item.height * 0.3),
        width,
      };
    });
  }, [canRenderSeparators, unitLayouts, separatorFontSize]);

  const frameSvgUrl = obj.frameSvgUrl || null;
  const [frameImageWithCors] = useImage(frameSvgUrl, "anonymous");
  const [frameImageDirect] = useImage(frameSvgUrl);
  const frameImage = frameImageWithCors || frameImageDirect;

  // ---------------------------
  // Drag gating (la clave)
  // ---------------------------
  const THRESHOLD_PX = 4; // más responsivo para que el elemento no se sienta "atrasado" al iniciar drag.

  const pressRef = useRef({
    active: false,
    movedEnough: false,
    startedDrag: false,
    startClientX: 0,
    startClientY: 0,
    startNodeX: 0,
    startNodeY: 0,
    // para ignorar click si se convirtió en drag
    suppressClick: false,
  });

  const cleanupGlobalRef = useRef(null);

  const cleanupGlobal = useCallback(() => {
    if (cleanupGlobalRef.current) {
      try { cleanupGlobalRef.current(); } catch {}
      cleanupGlobalRef.current = null;
    }
  }, []);

  const attachGlobalListeners = useCallback(() => {
    cleanupGlobal();

    const onMove = (ev) => {
      if (!pressRef.current.active) return;
      if (pressRef.current.startedDrag) return;

      const cx = ev.clientX ?? (ev.touches && ev.touches[0]?.clientX) ?? null;
      const cy = ev.clientY ?? (ev.touches && ev.touches[0]?.clientY) ?? null;
      if (cx == null || cy == null) return;

      const dx = cx - pressRef.current.startClientX;
      const dy = cy - pressRef.current.startClientY;
      const dist = Math.hypot(dx, dy);

      if (dist < THRESHOLD_PX) return;

      // ✅ Se convirtió en drag intencional
      pressRef.current.movedEnough = true;
      pressRef.current.startedDrag = true;
      pressRef.current.suppressClick = true;

      const node = rootRef.current;
      if (!node) return;

      // Asegurar que empiece desde la posición exacta del press (evita saltitos)
      try {
        node.position({ x: pressRef.current.startNodeX, y: pressRef.current.startNodeY });
        node.getLayer()?.batchDraw();
      } catch {}

      // Habilitar drag solo ahora
      try { node.draggable(true); } catch {}

      // Bloquear re-render por tick durante drag
      draggingRef.current = true;
      window._isDragging = true;
      if (hasDragged?.current != null) hasDragged.current = true;

      // Necesario para que tu motor individual tenga un startPos coherente incluso si CanvasEditor no lo setea
      try {
        const stage = node.getStage();
        const p = stage?.getPointerPosition?.();
        if (dragStartPos && p) dragStartPos.current = { x: p.x, y: p.y };
      } catch {}

      // Iniciar drag nativo de Konva (esto dispara dragstart/dragmove/dragend)
      try { node.startDrag(); } catch {}
    };

    const onUp = () => {
      // Siempre cerramos el press
      pressRef.current.active = false;

      const node = rootRef.current;
      if (!node) {
        cleanupGlobal();
        return;
      }

      // Si NO se convirtió en drag, garantizamos 0 movimiento
      if (!pressRef.current.movedEnough) {
        try {
          node.position({ x: pressRef.current.startNodeX, y: pressRef.current.startNodeY });
          node.getLayer()?.batchDraw();
        } catch {}
        // click permitido
      } else {
        // Si fue drag, aseguramos que termine
        try {
          if (node.isDragging?.()) node.stopDrag();
        } catch {}
      }

      // Reset flags
      pressRef.current.movedEnough = false;
      pressRef.current.startedDrag = false;

      // Volver a modo "no draggable" siempre (clave para que el click nunca dispare drag)
      try { node.draggable(false); } catch {}

      draggingRef.current = false;
      window._isDragging = false;

      // Permitimos clicks futuros
      setTimeout(() => {
        pressRef.current.suppressClick = false;
        if (hasDragged?.current != null) hasDragged.current = false;
      }, 0);

      cleanupGlobal();
    };

    window.addEventListener("mousemove", onMove, true);
    window.addEventListener("touchmove", onMove, { capture: true, passive: true });
    window.addEventListener("mouseup", onUp, true);
    window.addEventListener("touchend", onUp, true);
    window.addEventListener("pointercancel", onUp, true);
    window.addEventListener("blur", onUp, true);

    cleanupGlobalRef.current = () => {
      window.removeEventListener("mousemove", onMove, true);
      window.removeEventListener("touchmove", onMove, true);
      window.removeEventListener("mouseup", onUp, true);
      window.removeEventListener("touchend", onUp, true);
      window.removeEventListener("pointercancel", onUp, true);
      window.removeEventListener("blur", onUp, true);
    };
  }, [THRESHOLD_PX, cleanupGlobal, dragStartPos, hasDragged]);

  // ---------------------------
  // Handlers del nodo
  // ---------------------------
  const handleDown = useCallback(
    (e) => {
      e.cancelBubble = true;

      const node = e.currentTarget;
      const ev = e.evt;

      // Iniciar press
      pressRef.current.active = true;
      pressRef.current.movedEnough = false;
      pressRef.current.startedDrag = false;
      pressRef.current.suppressClick = false;

      // Guardar posición inicial del nodo
      pressRef.current.startNodeX = node.x();
      pressRef.current.startNodeY = node.y();

      // Guardar punto inicial del puntero (en px reales)
      const cx = ev?.clientX ?? (ev?.touches && ev.touches[0]?.clientX) ?? 0;
      const cy = ev?.clientY ?? (ev?.touches && ev.touches[0]?.clientY) ?? 0;
      pressRef.current.startClientX = cx;
      pressRef.current.startClientY = cy;

      // Por defecto NO draggable en press (clave)
      try { node.draggable(false); } catch {}

      if (hasDragged?.current != null) hasDragged.current = false;

      attachGlobalListeners();
    },
    [attachGlobalListeners, hasDragged]
  );

  const handleClick = useCallback(
    (e) => {
      e.cancelBubble = true;

      // Si este click se convirtió en drag, no seleccionar “de vuelta”
      if (pressRef.current.suppressClick) return;

      onSelect?.(obj.id, e);
    },
    [obj.id, onSelect]
  );

  const handleMouseEnter = useCallback(() => {
    if (window._isDragging) return;
    onHover?.(obj.id);
  }, [onHover, obj.id]);

  const handleMouseLeave = useCallback(() => {
    onHover?.(null);
  }, [onHover]);

  // Estos handlers solo corren cuando el drag fue habilitado y startDrag() se llamó
  const handleDragStart = useCallback(
    (e) => {
      if (dragMoveRafRef.current != null) {
        cancelAnimationFrame(dragMoveRafRef.current);
        dragMoveRafRef.current = null;
      }
      lastDragMovePosRef.current = null;
      onDragStartPersonalizado?.(obj.id, e);
      // Arranque de tu lógica grupal/individual
      const esGrupal = startDragGrupalLider(e, obj);
      if (!esGrupal) startDragIndividual(e, dragStartPos);
    },
    [obj, dragStartPos, onDragStartPersonalizado]
  );

  const handleDragMove = useCallback(
    (e) => {
      if (window._grupoLider) {
        if (obj.id === window._grupoLider) {
          previewDragGrupal(e, obj, onChange);
          if (onDragMovePersonalizado) {
            lastDragMovePosRef.current = { x: e.target.x(), y: e.target.y() };
            if (dragMoveRafRef.current == null) {
              dragMoveRafRef.current = requestAnimationFrame(() => {
                dragMoveRafRef.current = null;
                const latestPos = lastDragMovePosRef.current;
                if (!latestPos) return;
                onDragMovePersonalizado(latestPos, obj.id);
              });
            }
          }
        }
        return;
      }
      previewDragIndividual(e, obj, (pos) => {
        if (!onDragMovePersonalizado) return;
        lastDragMovePosRef.current = pos;

        // Evita saturar React/UI en dragmove; máximo 1 actualización por frame.
        if (dragMoveRafRef.current != null) return;
        dragMoveRafRef.current = requestAnimationFrame(() => {
          dragMoveRafRef.current = null;
          const latestPos = lastDragMovePosRef.current;
          if (!latestPos) return;
          onDragMovePersonalizado(latestPos, obj.id);
        });
      });
    },
    [obj, onChange, onDragMovePersonalizado]
  );

  const handleDragEnd = useCallback(
    (e) => {
      const node = e.currentTarget;

      if (dragMoveRafRef.current != null) {
        cancelAnimationFrame(dragMoveRafRef.current);
        dragMoveRafRef.current = null;
      }
      lastDragMovePosRef.current = null;

      // Commit final
      const fueGrupal = endDragGrupal(e, obj, onChange, hasDragged, () => {});
      if (fueGrupal) {
        onDragEndPersonalizado?.();
      } else {
        endDragIndividual(obj, node, onChange, onDragEndPersonalizado, hasDragged);
      }

      // Volver a no-draggable (clave)
      try { node.draggable(false); } catch {}

      draggingRef.current = false;
      window._isDragging = false;

      // Limpieza del press
      pressRef.current.active = false;
      pressRef.current.movedEnough = false;
      pressRef.current.startedDrag = false;

      // permitir click futuro
      setTimeout(() => {
        pressRef.current.suppressClick = false;
        if (hasDragged?.current != null) hasDragged.current = false;
      }, 0);

      cleanupGlobal();
    },
    [obj, onChange, hasDragged, onDragEndPersonalizado, cleanupGlobal]
  );

  // Cleanup global por si el componente se desmonta en pleno press
  useEffect(() => {
    return () => {
      cleanupGlobal();
      if (dragMoveRafRef.current != null) {
        cancelAnimationFrame(dragMoveRafRef.current);
        dragMoveRafRef.current = null;
      }
      lastDragMovePosRef.current = null;
    };
  }, [cleanupGlobal]);

  return (
    <Group
      ref={setRefs}
      id={obj.id}
      x={obj.x ?? 0}
      y={yAbs}
      rotation={obj.rotation || 0}
      scaleX={obj.scaleX || 1}
      scaleY={obj.scaleY || 1}

      // ✅ SIEMPRE false: el drag se habilita imperativamente solo si hubo intención
      draggable={false}
      listening={true}

      onMouseDown={handleDown}
      onTouchStart={handleDown}

      onClick={handleClick}
      onTap={handleClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}

      onDragStart={handleDragStart}
      onDragMove={handleDragMove}
      onDragEnd={handleDragEnd}
    >
      {/* Hitbox */}
      <Rect
        name="countdown-hitbox"
        width={containerW}
        height={containerH}
        fill={backgroundColor}
        // El borde de selección lo dibuja SelectionBounds (Transformer).
        // Evita doble recuadro (violeta + celeste punteado) en countdown.
        stroke="transparent"
        strokeWidth={0}
        cornerRadius={8}
        listening={true}
        perfectDrawEnabled={false}
      />

      {!state.invalid && !state.ended && (
        <Group listening={false}>
          {layoutType === "singleFrame" && frameImage && (
            <KonvaImage
              image={frameImage}
              x={0}
              y={0}
              width={containerW}
              height={containerH}
              listening={false}
              perfectDrawEnabled={false}
            />
          )}

          {layoutType === "singleFrame" && !frameImage && obj.frameColor && (
            <Rect
              x={0}
              y={0}
              width={containerW}
              height={containerH}
              stroke={frameStrokeColor}
              strokeWidth={Math.max(1, Math.round(framePadding * 0.14))}
              cornerRadius={Math.min(18, Math.round(framePadding * 1.4))}
              fill="transparent"
              listening={false}
              perfectDrawEnabled={false}
            />
          )}

          {unitLayouts.map((it) => {
            const itemLabel = applyLabelTransform(it.label, labelTransform);
            const cornerRadius = Math.min(obj.boxRadius ?? 8, it.width / 2, it.height / 2);
            const valueBlockHeight = Math.max(1, valueSize * lineHeight);
            const labelBlockHeight = Math.max(1, labelSize);
            const textStackGap = showLabels ? 4 : 0;
            const contentHeight = showLabels
              ? valueBlockHeight + textStackGap + labelBlockHeight
              : valueBlockHeight;
            const contentTop = Math.max(0, (it.height - contentHeight) / 2);
            const valueY = contentTop;
            const labelY = contentTop + valueBlockHeight + textStackGap;

            return (
              <Group key={it.key} x={it.x} y={it.y} listening={false}>
                {layoutType === "multiUnit" && frameImage && (
                  <KonvaImage
                    image={frameImage}
                    width={it.width}
                    height={it.height}
                    listening={false}
                    perfectDrawEnabled={false}
                  />
                )}

                {layoutType === "multiUnit" && !frameImage && obj.frameColor && (
                  <Rect
                    width={it.width}
                    height={it.height}
                    stroke={frameStrokeColor}
                    strokeWidth={1.2}
                    cornerRadius={cornerRadius}
                    fill="transparent"
                    listening={false}
                    perfectDrawEnabled={false}
                  />
                )}

                {obj.layout !== "minimal" && (
                  <Rect
                    width={it.width}
                    height={it.height}
                    fill={unitFillColor}
                    stroke={unitStrokeColor}
                    cornerRadius={cornerRadius}
                    shadowBlur={obj.boxShadow ? 8 : 0}
                    shadowColor={obj.boxShadow ? "rgba(0,0,0,0.15)" : "transparent"}
                    listening={false}
                    perfectDrawEnabled={false}
                    shadowForStrokeEnabled={false}
                  />
                )}

                <Text
                  text={it.value}
                  fill={valueTextColor}
                  fontFamily={obj.fontFamily}
                  fontStyle="bold"
                  fontSize={valueSize}
                  width={it.width}
                  align="center"
                  y={valueY}
                  lineHeight={lineHeight}
                  letterSpacing={letterSpacing}
                  listening={false}
                  perfectDrawEnabled={false}
                />

                {showLabels && (
                  <Text
                    text={itemLabel}
                    fill={labelTextColor}
                    fontFamily={obj.fontFamily}
                    fontSize={labelSize}
                    width={it.width}
                    align="center"
                    y={labelY}
                    lineHeight={1}
                    letterSpacing={letterSpacing}
                    listening={false}
                    perfectDrawEnabled={false}
                  />
                )}

              </Group>
            );
          })}

          {separatorLayouts.map((item) => (
            <Text
              key={item.key}
              x={item.x}
              y={item.y}
              width={item.width}
              align="center"
              text={separatorText}
              fill={valueTextColor}
              fontFamily={obj.fontFamily}
              fontSize={separatorFontSize}
              listening={false}
              perfectDrawEnabled={false}
            />
          ))}
        </Group>
      )}
    </Group>
  );
}
