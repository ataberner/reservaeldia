// src/components/editor/countdown/CountdownKonva.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { Group, Rect, Text, Line } from "react-konva";
import { getRemainingParts, fmt } from "./countdownUtils";
import { calcularOffsetY } from "@/utils/layout";

export default function CountdownKonva({
  obj,
  registerRef,                 // (id, node) => void  → para SelectionBounds
  isSelected,
  seccionesOrdenadas,
  altoCanvas,
  onSelect,                     // (id, e) => void
  onChange,                     // (id, cambios) => void
}) {
  // ⏱️ Estado interno para forzar re-render cada segundo (sin tocar Firestore)
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((n) => (n + 1) % 60), 1000);
    return () => clearInterval(t);
  }, []);

  // Nodo raíz (Group) para registrar en elementRefs
  const groupRef = useRef(null);
  useEffect(() => {
    if (groupRef.current && typeof registerRef === "function") {
      registerRef(obj.id, groupRef.current);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupRef.current, obj.id]);

  // Posición absoluta (aplicar offset de su sección)
  const yAbs = useMemo(() => {
    const idx = seccionesOrdenadas.findIndex(s => s.id === obj.seccionId);
    const off = calcularOffsetY(seccionesOrdenadas, idx, altoCanvas);
    return (obj.y ?? 0) + off;
  }, [obj.y, obj.seccionId, seccionesOrdenadas, altoCanvas]);

  // Datos de tiempo (recalcula en cada tick)
  const state = getRemainingParts(obj.fechaObjetivo);
  const parts = [
    { key: "d", value: fmt(state.d, obj.padZero), label: "Días" },
    { key: "h", value: fmt(state.h, obj.padZero), label: "Horas" },
    { key: "m", value: fmt(state.m, obj.padZero), label: "Min" },
    { key: "s", value: fmt(state.s, obj.padZero), label: "Seg" },
  ];

  
  const handleDragEnd = (e) => {
    const node = e.target;
    // 🔥 Mandamos coords absolutas; CanvasEditor se encarga de convertir y decidir sección
    onChange?.(obj.id, { x: node.x(), y: node.y(), finalizoDrag: true });
  };


// --- cálculos comunes ---
const n = parts.length;
const gap = obj.gap ?? 8;
const paddingY = obj.paddingY ?? 6;
const paddingX = obj.paddingX ?? 8;

const valueSize = obj.fontSize ?? 16;
const labelSize = obj.labelSize ?? 10;
const showLabels = !!obj.showLabels;

// ancho y alto de cada chip como en CSS
const chipW = (obj.chipWidth ?? 46) + paddingX * 2;
const chipH = paddingY * 2 + valueSize + (showLabels ? labelSize : 0);

// ancho total del conjunto
const totalChipsW = n * chipW + gap * (n - 1);
const containerW = obj.width ?? totalChipsW;
const containerH = chipH; // el alto del contenedor es el de un chip

// centrar el conjunto dentro del ancho disponible
const startX = (containerW - totalChipsW) / 2;


  return (
    <Group
  ref={groupRef}
  x={obj.x ?? 0}
  y={yAbs}
  draggable
  onDragMove={() => {
    onChange?.(obj.id, { isDragPreview: true, x: groupRef.current.x(), y: groupRef.current.y() });
  }}
  onDragEnd={handleDragEnd}
  onClick={(e) => { e.cancelBubble = true; onSelect?.(obj.id, e); }}
  listening
>
  {/* Fondo del bloque */}
  <Rect
    width={containerW}
    height={containerH}
    fill={obj.background || "transparent"}
    stroke={isSelected ? "#773dbe" : "transparent"}
    strokeWidth={isSelected ? 2 : 0}
    cornerRadius={8}
  />

  {/* Contenido normal */}
  {!state.invalid && !state.ended && (
    <Group>
      {parts.map((it, i) => {
        const x = startX + i * (chipW + gap);
        const sepText = obj.separator || "";

        return (
          <Group key={it.key} x={x} y={0}>
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
