// src/components/editor/countdown/CountdownKonva.jsx
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { Group, Rect, Text } from "react-konva";
import { getRemainingParts, fmt } from "./countdownUtils";
import { calcularOffsetY } from "@/utils/layout";

import {
  startDragGrupalLider,
  previewDragGrupal,
  endDragGrupal,
} from "@/drag/dragGrupal";
import {
  startDragIndividual,
  previewDragIndividual,
  endDragIndividual,
} from "@/drag/dragIndividual";

export default function CountdownKonva({
  obj,
  registerRef,                 // (id, node) => void
  isSelected,
  seccionesOrdenadas,
  altoCanvas,
  onSelect,                     // (id, e) => void
  onChange,                     // (id, cambios) => void

  // opcionales
  onDragMovePersonalizado,      // (pos, id) => void
  onDragEndPersonalizado,       // () => void
  dragStartPos,                 // ref
  hasDragged,                   // ref
}) {

  const rootRef = useRef(null);
  const DEBUG_COUNTDOWN = true; // ⬅️ ponelo en false cuando termines

  const dlog = (...args) => {
    if (!DEBUG_COUNTDOWN) return;
    // agrupamos para que no ensucie tanto
    console.log("[CD]", ...args);
  };


  // 1) Tick cada 1s (no re-render si estamos arrastrando)
  const [tick, setTick] = useState(0);
  const draggingRef = useRef(false);
  useEffect(() => {
    const t = setInterval(() => {
      if (!draggingRef.current) setTick((n) => (n + 1) % 60);
    }, 1000);
    return () => clearInterval(t);
  }, []);

  // 2) Registrar nodo raíz para SelectionBounds/guías
  const handleRef = useCallback(
    (node) => {
      if (node && typeof registerRef === "function") registerRef(obj.id, node);
    },
    [obj.id, registerRef]
  );

  // Combinar ref interno + registerRef para SelectionBounds/guías
  const setRefs = useCallback(
    (node) => {
      rootRef.current = node;
      handleRef(node);
    },
    [handleRef]
  );

  // 3) y absoluta = y relativa + offset de sección
  const yAbs = useMemo(() => {
    const idx = seccionesOrdenadas.findIndex((s) => s.id === obj.seccionId);
    const safe = idx >= 0 ? idx : 0;
    const off = calcularOffsetY(seccionesOrdenadas, safe, altoCanvas) || 0;
    return (obj.y ?? 0) + off;
  }, [obj.y, obj.seccionId, seccionesOrdenadas, altoCanvas]);

  // 4) Partes del tiempo
  const state = useMemo(() => getRemainingParts(obj.fechaObjetivo), [obj.fechaObjetivo, tick]);
  const parts = [
    { key: "d", value: fmt(state.d, obj.padZero), label: "Días" },
    { key: "h", value: fmt(state.h, obj.padZero), label: "Horas" },
    { key: "m", value: fmt(state.m, obj.padZero), label: "Min" },
    { key: "s", value: fmt(state.s, obj.padZero), label: "Seg" },
  ];

  // 5) Layout
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
  const containerW = obj.width ?? totalChipsW;

  // ✅ Si el usuario redimensiona, el alto tiene que reflejarse visualmente
  const containerH = Math.max(obj.height ?? chipH, chipH);

  // ✅ centrado vertical: si el contenedor es más alto que el contenido real
  const contentOffsetY = (containerH - chipH) / 2;


  const startX = (containerW - totalChipsW) / 2;

  useEffect(() => {
    if (!DEBUG_COUNTDOWN) return;

    // Medida real del nodo en Konva (incluye lo dibujado)
    const node = rootRef.current;
    const clientRect = node ? node.getClientRect({ skipShadow: true, skipStroke: false }) : null;

    dlog("render", {
      id: obj.id,
      pos: { x: obj.x, y: obj.y, r: obj.rotation },
      model: {
        w: obj.width,
        h: obj.height,
        scaleX: obj.scaleX,
        scaleY: obj.scaleY,
      },
      computed: {
        chipW,
        chipH,
        totalChipsW,
        containerW,
        containerH,
        contentOffsetY,
        gap,
        paddingX,
        paddingY,
        valueSize,
        labelSize,
        showLabels,
      },
      clientRect, // 👈 el dato clave
    });
  }, [
    obj.id,
    obj.x, obj.y, obj.rotation,
    obj.width, obj.height, obj.scaleX, obj.scaleY,
    chipW, chipH, totalChipsW, containerW, containerH, contentOffsetY,
    gap, paddingX, paddingY, valueSize, labelSize, showLabels
  ]);


  // 6) Handlers de drag
  const commonProps = useMemo(
    () => ({
      x: obj.x ?? 0,
      y: yAbs,
      draggable: true,
      listening: true,
      ref: handleRef,

      onMouseDown: (e) => {
        e.cancelBubble = true;
        if (hasDragged?.current != null) hasDragged.current = false;
      },

      onClick: (e) => {
        e.cancelBubble = true;
        onSelect?.(obj.id, e);
      },

      onDragStart: (e) => {
        draggingRef.current = true;
        window._isDragging = true;
        if (hasDragged?.current != null) hasDragged.current = true;

        // Cachear el grupo para acelerar drag
        try {
          const node = e.target;         // ← será el Group (nodo draggable)
          node.cache({ pixelRatio: 1 });
          node.drawHitFromCache();
          node.getLayer()?.batchDraw();
        } catch { }

        const esGrupal = startDragGrupalLider(e, obj);
        if (!esGrupal) startDragIndividual(e, dragStartPos);
      },

      onDragMove: (e) => {
        if (window._grupoLider) {
          if (obj.id === window._grupoLider) previewDragGrupal(e, obj, onChange);
          return;
        }
        // Individual: no tocar estado, preview liviano
        previewDragIndividual(e, obj, (pos) => {
          onDragMovePersonalizado?.(pos, obj.id);
        });
      },

      onDragEnd: (e) => {
        draggingRef.current = false;
        window._isDragging = false;

        // Limpiar cache
        try {
          const node = e.target;
          node.clearCache();
          node.getLayer()?.batchDraw();
        } catch { }

        // Cerrar drag grupal primero
        const fueGrupal = endDragGrupal(e, obj, onChange, hasDragged, () => { });
        if (fueGrupal) {
          onDragEndPersonalizado?.();
          return;
        }
        // Cerrar drag individual
        const node = e.target;
        endDragIndividual(obj, node, onChange, onDragEndPersonalizado, hasDragged);
      },
    }),
    [
      obj.id,
      obj.x,
      yAbs,
      handleRef,
      onSelect,
      onChange,
      onDragMovePersonalizado,
      onDragEndPersonalizado,
      dragStartPos,
      hasDragged,
    ]
  );


  // 7) Render (dejamos UN hijo con listening=true para hit)
  return (

    <Group
      {...commonProps}
      ref={setRefs}
      rotation={obj.rotation || 0}
      scaleX={obj.scaleX || 1}
      scaleY={obj.scaleY || 1}
    >
      {/* Fondo del bloque: DEBE participar del hit */}
      <Rect
        width={containerW}
        height={containerH}
        fill={obj.background || "transparent"}
        stroke={isSelected ? "#773dbe" : "transparent"}
        strokeWidth={isSelected ? 2 : 0}
        cornerRadius={8}
        // 👇 importante: dejarlo en true (o quitar la prop) para que haya hit
        listening={true}
        perfectDrawEnabled={false}
      />

      {/* Contenido */}
      {!state.invalid && !state.ended && (
        <Group listening={false}>
          {parts.map((it, i) => {
            const x = startX + i * (chipW + gap);
            const sepText = obj.separator || "";

            return (
              <Group key={it.key} x={x} y={contentOffsetY} listening={false}>
                {/* Chip */}
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

                {/* Valor */}
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

                {/* Etiqueta */}
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

                {/* Separador textual */}
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
