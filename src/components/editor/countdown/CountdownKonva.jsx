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

  const boxH = Math.max(40, (obj.height ?? 80) - 10);
  const gap = obj.gap ?? 12;
  const boxW = Math.max(70, ((obj.width ?? 300) - gap * 3) / 4);

  const handleDragEnd = (e) => {
    const node = e.target;
    // 🔥 Mandamos coords absolutas; CanvasEditor se encarga de convertir y decidir sección
    onChange?.(obj.id, { x: node.x(), y: node.y(), finalizoDrag: true });
  };

  return (
    <Group
      ref={groupRef}
      x={obj.x ?? 0}
      y={yAbs}
      draggable
      onDragMove={() => {
        // Preview: suave, sin historia
        onChange?.(obj.id, { isDragPreview: true, x: groupRef.current.x(), y: groupRef.current.y() });
      }}
      onDragEnd={handleDragEnd}
      onClick={(e) => { e.cancelBubble = true; onSelect?.(obj.id, e); }}
      listening
    >
      {/* Fondo del bloque (para ver selección) */}
      <Rect
        width={obj.width ?? 300}
        height={obj.height ?? 80}
        fill={obj.background || "transparent"}
        stroke={isSelected ? "#773dbe" : "transparent"}
        strokeWidth={isSelected ? 2 : 0}
        cornerRadius={8}
      />

      {/* Mensajes de estado */}
      {state.invalid && (
        <Text
          text="Fecha inválida"
          fill="#ef4444"
          fontSize={obj.fontSize}
          fontFamily={obj.fontFamily}
          width={obj.width ?? 300}
          height={obj.height ?? 80}
          align="center"
          verticalAlign="middle"
        />
      )}

      {!state.invalid && state.ended && (
        <Text
          text="¡Llegó el día!"
          fill={obj.color}
          fontSize={obj.fontSize}
          fontFamily={obj.fontFamily}
          width={obj.width ?? 300}
          height={obj.height ?? 80}
          align="center"
          verticalAlign="middle"
        />
      )}

      {/* Contenido normal */}
      {!state.invalid && !state.ended && (
        <Group>
          {parts.map((it, i) => {
            const x = i * (boxW + gap);
            const showLabels = !!obj.showLabels;
            const sepText = obj.separator || "";

            return (
              <Group key={it.key} x={x} y={5}>
                {/* Caja visual para pills/flip */}
                {obj.layout !== "minimal" && (
                  <Rect
                    width={boxW}
                    height={boxH}
                    fill={obj.boxBg || "#fff"}
                    stroke={obj.boxBorder || "#e5e7eb"}
                    cornerRadius={obj.boxRadius ?? 12}
                    shadowBlur={obj.boxShadow ? 8 : 0}
                    shadowColor={obj.boxShadow ? "rgba(0,0,0,0.15)" : "transparent"}
                  />
                )}

                {/* flip: separador central */}
                {obj.layout === "flip" && (
                  <Line
                    points={[0, boxH/2, boxW, boxH/2]}
                    stroke={obj.flipDividerColor || "#e5e7eb"}
                    strokeWidth={1}
                    dash={[4,4]}
                  />
                )}

                {/* Valor */}
                <Text
                  text={it.value}
                  fill={obj.color || "#111827"}
                  fontFamily={obj.fontFamily}
                  fontStyle="700"
                  fontSize={(obj.fontSize ?? 26) + (obj.layout === "minimal" ? 6 : 2)}
                  width={boxW}
                  height={showLabels ? boxH * 0.6 : boxH}
                  align="center"
                  verticalAlign="middle"
                />

                {/* Etiqueta */}
                {showLabels && (
                  <Text
                    y={boxH * 0.62}
                    text={it.label}
                    fill={obj.labelColor || "#6b7280"}
                    fontFamily={obj.fontFamily}
                    fontSize={Math.max(10, (obj.fontSize ?? 26) - 8)}
                    width={boxW}
                    height={boxH * 0.38}
                    align="center"
                    verticalAlign="middle"
                  />
                )}

                {/* Separador textual */}
                {!!sepText && i < parts.length - 1 && (
                  <Text
                    x={boxW + (gap * 0.25)}
                    y={boxH * 0.3}
                    text={sepText}
                    fill={obj.color || "#111827"}
                    fontFamily={obj.fontFamily}
                    fontSize={obj.fontSize ?? 26}
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
