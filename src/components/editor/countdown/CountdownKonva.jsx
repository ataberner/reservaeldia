// src/components/editor/countdown/CountdownKonva.jsx
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { Group, Rect, Text } from "react-konva";
import { getRemainingParts, fmt } from "./countdownUtils";
import { calcularOffsetY } from "@/utils/layout";

import { startDragGrupalLider, previewDragGrupal, endDragGrupal } from "@/drag/dragGrupal";
import { startDragIndividual, previewDragIndividual, endDragIndividual } from "@/drag/dragIndividual";

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
  seccionesOrdenadas,
  altoCanvas,
  onSelect,
  onChange,
  onDragMovePersonalizado,
  onDragEndPersonalizado,
  dragStartPos,
  hasDragged,
}) {
  const rootRef = useRef(null);

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
      if (node && typeof registerRef === "function") registerRef(obj.id, node);
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

  const parts = useMemo(
    () => [
      { key: "d", value: fmt(state.d, obj.padZero), label: "Días" },
      { key: "h", value: fmt(state.h, obj.padZero), label: "Horas" },
      { key: "m", value: fmt(state.m, obj.padZero), label: "Min" },
      { key: "s", value: fmt(state.s, obj.padZero), label: "Seg" },
    ],
    [state.d, state.h, state.m, state.s, obj.padZero]
  );

  // Layout
  const n = parts.length;
  const gap = obj.gap ?? 8;
  const paddingY = obj.paddingY ?? 6;
  const paddingX = obj.paddingX ?? 8;

  const valueSize = obj.fontSize ?? 16;
  const labelSize = obj.labelSize ?? 10;
  const showLabels = !!obj.showLabels;

  const chipW = (obj.chipWidth ?? 46) + paddingX * 2;
  const chipH = paddingY * 2 + valueSize + (showLabels ? labelSize : 0);

  const totalChipsW = n * chipW + gap * (n - 1);
  const containerW = Math.max(obj.width ?? 0, totalChipsW);
  const containerH = Math.max(obj.height ?? chipH, chipH);
  const contentOffsetY = (containerH - chipH) / 2;
  const startX = 0;

  // ---------------------------
  // Drag gating (la clave)
  // ---------------------------
  const THRESHOLD_PX = 10; // 10-14 suele ser ideal. Si querés 0 micro-jitter, subilo a 12/14.

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

  // Estos handlers solo corren cuando el drag fue habilitado y startDrag() se llamó
  const handleDragStart = useCallback(
    (e) => {
      // Arranque de tu lógica grupal/individual
      const esGrupal = startDragGrupalLider(e, obj);
      if (!esGrupal) startDragIndividual(e, dragStartPos);
    },
    [obj, dragStartPos]
  );

  const handleDragMove = useCallback(
    (e) => {
      if (window._grupoLider) {
        if (obj.id === window._grupoLider) previewDragGrupal(e, obj, onChange);
        return;
      }
      previewDragIndividual(e, obj, (pos) => {
        onDragMovePersonalizado?.(pos, obj.id);
      });
    },
    [obj, onChange, onDragMovePersonalizado]
  );

  const handleDragEnd = useCallback(
    (e) => {
      const node = e.currentTarget;

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
  useEffect(() => cleanupGlobal, [cleanupGlobal]);

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

      onDragStart={handleDragStart}
      onDragMove={handleDragMove}
      onDragEnd={handleDragEnd}
    >
      {/* Hitbox */}
      <Rect
        name="countdown-hitbox"
        width={containerW}
        height={containerH}
        fill={obj.background || "transparent"}
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
          {parts.map((it, i) => {
            const x = startX + i * (chipW + gap);
            const sepText = obj.separator || "";

            return (
              <Group key={it.key} x={x} y={contentOffsetY} listening={false}>
                {obj.layout !== "minimal" && (
                  <Rect
                    width={chipW}
                    height={chipH}
                    fill={obj.boxBg || "#fff"}
                    stroke={obj.boxBorder || "#e5e7eb"}
                    cornerRadius={Math.min(obj.boxRadius ?? 8, chipW / 2, chipH / 2)}
                    shadowBlur={obj.boxShadow ? 8 : 0}
                    shadowColor={obj.boxShadow ? "rgba(0,0,0,0.15)" : "transparent"}
                    listening={false}
                    perfectDrawEnabled={false}
                    shadowForStrokeEnabled={false}
                  />
                )}

                <Text
                  text={it.value}
                  fill={obj.color || "#111827"}
                  fontFamily={obj.fontFamily}
                  fontStyle="bold"
                  fontSize={valueSize}
                  width={chipW}
                  align="center"
                  y={paddingY + valueSize / 2}
                  offsetY={valueSize / 2}
                  listening={false}
                  perfectDrawEnabled={false}
                />

                {showLabels && (
                  <Text
                    text={it.label}
                    fill={obj.labelColor || "#6b7280"}
                    fontFamily={obj.fontFamily}
                    fontSize={labelSize}
                    width={chipW}
                    align="center"
                    y={paddingY + valueSize + labelSize / 2}
                    offsetY={labelSize / 2}
                    listening={false}
                    perfectDrawEnabled={false}
                  />
                )}

                {!!sepText && i < parts.length - 1 && (
                  <Text
                    x={chipW + gap * 0.25}
                    y={chipH * 0.3}
                    text={sepText}
                    fill={obj.color || "#111827"}
                    fontFamily={obj.fontFamily}
                    fontSize={valueSize}
                    listening={false}
                    perfectDrawEnabled={false}
                  />
                )}
              </Group>
            );
          })}
        </Group>
      )}
    </Group>
  );
}
