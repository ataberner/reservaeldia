import { useEffect, useState, useMemo, useRef, useLayoutEffect } from "react";
import { getRemainingParts, fmt } from "./countdownUtils";

/**
 * Preview liviano (DOM) del countdown para el sidebar.
 * - Soporta layouts: "pills" | "flip" | "minimal"
 * - size: "sm" (compacto) | "md"
 */
export default function CountdownPreview({ targetISO, preset, size = "sm" }) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((n) => (n + 1) % 60), 1000);
    return () => clearInterval(t);
  }, []);

  const SZ = useMemo(() => {
    const S = {
      sm: { valueFs: 15, labelFs: 10, chipMinW: 46, chipPx: 8, chipPy: 6, gap: 8, height: 44 },
      md: { valueFs: 16, labelFs: 11, chipMinW: 50, chipPx: 10, chipPy: 8, gap: 10, height: 48 },
    };
    return S[size] || S.sm;
  }, [size]);

  // ✅ Calcular estado SIEMPRE (no es un hook)
  const state = getRemainingParts(targetISO);

  // ✅ Declarar TODOS los hooks ANTES de cualquier return condicional
  const wrapperRef = useRef(null);
  const innerRef = useRef(null);
  const [scale, setScale] = useState(1);

  // Construimos parts siempre; si es inválido/ended no se renderizan, pero evita depender de ramas
  const parts = [
    { key: "d", value: fmt(state.d, preset.padZero), label: "Días" },
    { key: "h", value: fmt(state.h, preset.padZero), label: "Horas" },
    { key: "m", value: fmt(state.m, preset.padZero), label: "Min" },
    { key: "s", value: fmt(state.s, preset.padZero), label: "Seg" },
  ];

  useLayoutEffect(() => {
    if (wrapperRef.current && innerRef.current) {
      const containerWidth = wrapperRef.current.offsetWidth;
      const contentWidth = innerRef.current.scrollWidth;
      const marginFactor = 0.95; // 95% del ancho disponible
      const newScale =
        contentWidth > containerWidth
          ? (containerWidth / contentWidth) * marginFactor
          : 1 * marginFactor;
      setScale(newScale);
    }
  }, [parts.length, SZ, preset]);

  // ——— returns condicionales DESPUÉS de declarar hooks ———
  if (state.invalid) return <div className="text-red-500 text-center">Fecha inválida</div>;
  if (state.ended) return <div className="text-green-600 text-center">¡Llegó el día!</div>;

  const fontFamily = preset.fontFamily || "Inter, system-ui, sans-serif";
  const color = preset.color || "#111";

  return (
    <div ref={wrapperRef} className="w-full flex justify-center overflow-hidden">
      <div
        ref={innerRef}
        className="flex items-center justify-center"
        style={{
          fontFamily,
          gap: SZ.gap,
          transform: `scale(${scale})`,
          transformOrigin: "center",
        }}
      >
        {parts.map((it, i) => (
          <div key={it.key} className="relative flex items-center">
            {/* minimal = solo números */}
            {preset.layout === "minimal" ? (
              <span
                className="font-bold leading-none"
                style={{ color, fontSize: SZ.valueFs }}
              >
                {it.value}
              </span>
            ) : (
              <div
                className="relative flex flex-col items-center justify-center leading-none"
                style={{
                  background: preset.boxBg || "#fff",
                  border: `1px solid ${preset.boxBorder || "#e5e7eb"}`,
                  borderRadius: preset.boxRadius ?? 12,
                  boxShadow: preset.boxShadow
                    ? "0 2px 6px rgba(0,0,0,0.15)"
                    : "none",
                  minWidth: SZ.chipMinW,
                  padding: `${SZ.chipPy}px ${SZ.chipPx}px`,
                }}
              >
                {/* valor */}
                <span
                  className="font-bold"
                  style={{ color, fontSize: SZ.valueFs }}
                >
                  {it.value}
                </span>
                {/* etiqueta */}
                {preset.showLabels && (
                  <span
                    className="text-gray-500"
                    style={{ fontSize: SZ.labelFs - 2 }}
                  >
                    {it.label}
                  </span>
                )}

                {/* flip: línea punteada al medio */}
                {preset.layout === "flip" && (
                  <span
                    className="pointer-events-none absolute left-0 right-0 border-t border-dashed"
                    style={{
                      top: "50%",
                      borderColor: preset.flipDividerColor || "#e5e7eb",
                    }}
                  />
                )}
              </div>
            )}

            {/* separador textual, si corresponde */}
            {preset.separator && i < parts.length - 1 && (
              <span className="mx-1 font-bold" style={{ color }}>
                {preset.separator}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
