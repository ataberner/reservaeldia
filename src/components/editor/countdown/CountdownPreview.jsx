import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { getRemainingParts, fmt } from "./countdownUtils";
import { buildTextPaintStyle, resolvePreviewPaint } from "@/domain/countdownPresets/renderModel";

const UNIT_LABELS = Object.freeze({
  days: "Dias",
  hours: "Horas",
  minutes: "Min",
  seconds: "Seg",
});

const DEFAULT_UNITS = Object.freeze(["days", "hours", "minutes", "seconds"]);

function normalizeVisibleUnits(units) {
  if (!Array.isArray(units) || units.length === 0) return [...DEFAULT_UNITS];
  const unique = [];
  units.forEach((unit) => {
    const safe = String(unit || "").trim();
    if (!UNIT_LABELS[safe]) return;
    if (!unique.includes(safe)) unique.push(safe);
  });
  return unique.length ? unique : [...DEFAULT_UNITS];
}

function applyLabelTransform(label, mode) {
  const safe = String(label || "");
  if (mode === "uppercase") return safe.toUpperCase();
  if (mode === "lowercase") return safe.toLowerCase();
  if (mode === "capitalize") return safe.replace(/\b\w/g, (m) => m.toUpperCase());
  return safe;
}

function toFinite(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function getGridTemplate(distribution, count) {
  if (distribution === "vertical") return "1fr";
  if (distribution === "grid") return `repeat(${Math.min(2, count)}, minmax(0, 1fr))`;
  if (distribution === "editorial" && count > 1) {
    return `minmax(0,1.25fr) repeat(${Math.max(0, count - 1)}, minmax(0,1fr))`;
  }
  return `repeat(${count}, minmax(0, 1fr))`;
}

export default function CountdownPreview({ targetISO, preset, size = "sm" }) {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setTick((n) => (n + 1) % 60), 1000);
    return () => clearInterval(timer);
  }, []);

  const SZ = useMemo(() => {
    const options = {
      sm: {
        valueFs: 15,
        labelFs: 10,
        chipMinW: 46,
        chipPx: 8,
        chipPy: 6,
        gap: 8,
        framePadding: 8,
      },
      md: {
        valueFs: 16,
        labelFs: 11,
        chipMinW: 50,
        chipPx: 10,
        chipPy: 8,
        gap: 10,
        framePadding: 10,
      },
    };
    return options[size] || options.sm;
  }, [size]);

  const state = getRemainingParts(targetISO);
  const wrapperRef = useRef(null);
  const innerRef = useRef(null);
  const [scale, setScale] = useState(1);

  const isV2 = Number(preset?.countdownSchemaVersion || 1) >= 2;
  const legacyParts = [
    { key: "d", value: fmt(state.d, preset?.padZero), label: "Dias" },
    { key: "h", value: fmt(state.h, preset?.padZero), label: "Horas" },
    { key: "m", value: fmt(state.m, preset?.padZero), label: "Min" },
    { key: "s", value: fmt(state.s, preset?.padZero), label: "Seg" },
  ];

  const units = normalizeVisibleUnits(preset?.visibleUnits);
  const v2Parts = units.map((unit) => {
    const numeric =
      unit === "days"
        ? state.d
        : unit === "hours"
          ? state.h
          : unit === "minutes"
            ? state.m
            : state.s;
    return {
      key: unit,
      value: fmt(numeric, preset?.padZero),
      label: UNIT_LABELS[unit],
    };
  });

  const previewParts = isV2 ? v2Parts : legacyParts;

  useLayoutEffect(() => {
    if (!wrapperRef.current || !innerRef.current) return;
    const containerWidth = wrapperRef.current.offsetWidth;
    const contentWidth = innerRef.current.scrollWidth;
    const marginFactor = 0.95;
    const nextScale =
      contentWidth > containerWidth
        ? (containerWidth / contentWidth) * marginFactor
        : 1 * marginFactor;
    setScale(nextScale);
  }, [previewParts.length, SZ, preset, tick]);

  if (state.invalid) return <div className="text-center text-red-500">Fecha invalida</div>;
  if (state.ended) return <div className="text-center text-green-600">Llego el dia</div>;

  const fontFamily = preset?.fontFamily || "Inter, system-ui, sans-serif";
  const numberColor = resolvePreviewPaint(preset?.color, "#111");
  const labelColor = resolvePreviewPaint(preset?.labelColor, "#6b7280");
  const numberTextPaintStyle = buildTextPaintStyle(numberColor, "#111");
  const labelTextPaintStyle = buildTextPaintStyle(labelColor, "#6b7280");

  if (!isV2) {
    return (
      <div ref={wrapperRef} className="flex w-full justify-center overflow-hidden">
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
          {legacyParts.map((item, index) => (
            <div key={item.key} className="relative flex items-center">
              {preset?.layout === "minimal" ? (
                <span className="font-bold leading-none" style={{ ...numberTextPaintStyle, fontSize: SZ.valueFs }}>
                  {item.value}
                </span>
              ) : (
                <div
                  className="relative flex flex-col items-center justify-center leading-none"
                  style={{
                    background: preset?.boxBg || "#fff",
                    border: `1px solid ${preset?.boxBorder || "#e5e7eb"}`,
                    borderRadius: preset?.boxRadius ?? 12,
                    boxShadow: preset?.boxShadow ? "0 2px 6px rgba(0,0,0,0.15)" : "none",
                    minWidth: SZ.chipMinW,
                    padding: `${SZ.chipPy}px ${SZ.chipPx}px`,
                  }}
                >
                  <span className="font-bold" style={{ ...numberTextPaintStyle, fontSize: SZ.valueFs }}>
                    {item.value}
                  </span>
                  {preset?.showLabels !== false ? (
                    <span style={{ ...labelTextPaintStyle, fontSize: SZ.labelFs - 2 }}>{item.label}</span>
                  ) : null}
                  {preset?.layout === "flip" ? (
                    <span
                      className="pointer-events-none absolute inset-x-0 top-1/2 border-t border-dashed"
                      style={{ borderColor: preset?.flipDividerColor || "#e5e7eb" }}
                    />
                  ) : null}
                </div>
              )}

              {preset?.separator && index < legacyParts.length - 1 ? (
                <span className="mx-1 font-bold" style={{ ...numberTextPaintStyle }}>
                  {preset.separator}
                </span>
              ) : null}
            </div>
          ))}
        </div>
      </div>
    );
  }

  const distribution = String(preset?.distribution || "centered").toLowerCase();
  const layoutType = String(preset?.layoutType || "singleFrame").toLowerCase();
  const frameUrl = String(preset?.frameSvgUrl || "").trim();
  const hasFrameConfigured = frameUrl.length > 0;
  const useSingleFrameLayout = layoutType === "singleframe" && hasFrameConfigured;
  const useMultiUnitFrame = layoutType === "multiunit" && hasFrameConfigured;
  const framePadding = Math.max(0, toFinite(preset?.framePadding, SZ.framePadding));
  const gap = Math.max(0, toFinite(preset?.gap, SZ.gap));
  const chipW = Math.max(36, toFinite(preset?.chipWidth, SZ.chipMinW));
  const chipPx = Math.max(4, toFinite(preset?.paddingX, SZ.chipPx));
  const chipPy = Math.max(3, toFinite(preset?.paddingY, SZ.chipPy));
  const chipRadius = Math.max(0, toFinite(preset?.boxRadius, 10));
  const showLabels = preset?.showLabels !== false;
  const separator = String(preset?.separator || "").slice(0, 3);
  const labelTransform = String(preset?.labelTransform || "uppercase").toLowerCase();
  const isMinimal = String(preset?.layout || "pills").toLowerCase() === "minimal";
  const canDrawSeparators = Boolean(separator && distribution !== "vertical" && distribution !== "grid");
  const gridTemplateColumns = getGridTemplate(distribution, Math.max(1, v2Parts.length));

  const valueSize = Math.max(11, Math.round(SZ.valueFs * 0.95));
  const unitLabelSize = Math.max(8, Math.round(SZ.labelFs * 0.9));

  return (
    <div ref={wrapperRef} className="flex w-full justify-center overflow-hidden">
      <div
        ref={innerRef}
        className="relative"
        style={{
          fontFamily,
          transform: `scale(${scale})`,
          transformOrigin: "center",
        }}
      >
        {useSingleFrameLayout ? (
          <img
            src={frameUrl}
            alt=""
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 z-0 h-full w-full object-contain"
            loading="lazy"
            decoding="async"
          />
        ) : null}

        <div
          className="relative z-[1] grid"
          style={{
            gridTemplateColumns,
            gap: `${gap}px`,
            padding: useSingleFrameLayout ? `${framePadding}px` : 0,
          }}
        >
          {v2Parts.map((item, index) => (
            <div key={item.key} className="relative flex items-center">
              <div
                className="relative flex min-w-0 flex-col items-center justify-center leading-none"
                style={{
                  minWidth: chipW,
                  padding: `${chipPy}px ${chipPx}px`,
                  borderRadius: chipRadius,
                  background: isMinimal ? "transparent" : (preset?.boxBg || "transparent"),
                  border: isMinimal ? "none" : `1px solid ${preset?.boxBorder || "transparent"}`,
                  boxShadow: preset?.boxShadow ? "0 2px 6px rgba(0,0,0,0.15)" : "none",
                }}
              >
                {useMultiUnitFrame ? (
                  <img
                    src={frameUrl}
                    alt=""
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 z-0 h-full w-full object-contain"
                    loading="lazy"
                    decoding="async"
                  />
                ) : null}

                <div className="relative z-[1] flex flex-col items-center">
                  <span className="font-bold" style={{ ...numberTextPaintStyle, fontSize: valueSize }}>
                    {item.value}
                  </span>
                  {showLabels ? (
                    <span style={{ ...labelTextPaintStyle, fontSize: unitLabelSize }}>
                      {applyLabelTransform(item.label, labelTransform)}
                    </span>
                  ) : null}
                </div>
              </div>

              {canDrawSeparators && index < v2Parts.length - 1 ? (
                <span className="mx-1 font-bold" style={{ ...numberTextPaintStyle, fontSize: valueSize }}>
                  {separator}
                </span>
              ) : null}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
