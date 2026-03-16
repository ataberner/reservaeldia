import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { getRemainingParts, fmt } from "./countdownUtils";
import {
  buildTextPaintStyle,
  estimateCountdownUnitHeight,
  resolveCountdownUnitWidth,
  resolvePreviewPaint,
} from "@/domain/countdownPresets/renderModel";

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

export default function CountdownPreview({ targetISO, preset, size = "sm", live = true }) {
  const [, setTick] = useState(0);

  useEffect(() => {
    // En catalogos grandes dejamos que el padre maneje el tick compartido.
    if (!live) return undefined;
    const timer = setInterval(() => setTick((n) => (n + 1) % 60), 1000);
    return () => clearInterval(timer);
  }, [live]);

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
  const measureScale = useCallback(() => {
    if (!wrapperRef.current || !innerRef.current) return;

    const containerWidth = wrapperRef.current.offsetWidth;
    const contentWidth = innerRef.current.scrollWidth;
    if (!containerWidth || !contentWidth) return;

    const marginFactor = 0.95;
    const nextScale =
      contentWidth > containerWidth
        ? (containerWidth / contentWidth) * marginFactor
        : 1 * marginFactor;

    setScale(nextScale);
  }, []);

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
    measureScale();
  }, [measureScale, previewParts.length, SZ, preset]);

  useEffect(() => {
    if (typeof ResizeObserver === "undefined") return undefined;
    if (!wrapperRef.current) return undefined;

    const wrapperNode = wrapperRef.current;
    const innerNode = innerRef.current;
    const observer = new ResizeObserver(() => {
      measureScale();
    });

    observer.observe(wrapperNode);
    if (innerNode && innerNode !== wrapperNode) observer.observe(innerNode);

    return () => observer.disconnect();
  }, [measureScale]);

  if (state.invalid) return <div className="text-center text-red-500">Fecha invalida</div>;
  if (state.ended) return <div className="text-center text-green-600">Llego el dia</div>;

  const fontFamily = preset?.fontFamily || "Inter, system-ui, sans-serif";
  const numberColor = resolvePreviewPaint(preset?.color, "#111");
  const labelColor = resolvePreviewPaint(preset?.labelColor, "#6b7280");
  const numberTextPaintStyle = buildTextPaintStyle(numberColor, "#111");
  const labelTextPaintStyle = buildTextPaintStyle(labelColor, "#6b7280");
  const legacyGap = Math.max(0, toFinite(preset?.gap, SZ.gap));
  const legacyPaddingX = Math.max(2, toFinite(preset?.paddingX, SZ.chipPx));
  const legacyPaddingY = Math.max(2, toFinite(preset?.paddingY, SZ.chipPy));
  const legacyValueSize = Math.max(10, toFinite(preset?.fontSize, SZ.valueFs));
  const legacyLabelSize = Math.max(8, toFinite(preset?.labelSize, SZ.labelFs - 2));
  const legacyShowLabels = preset?.showLabels !== false;
  const legacyChipRadius = Math.max(0, toFinite(preset?.boxRadius, 12));
  const legacyRequestedChipW = Math.max(
    36,
    toFinite(preset?.chipWidth, SZ.chipMinW) + legacyPaddingX * 2
  );
  const legacyChipH = Math.max(
    44,
    legacyPaddingY * 2 + legacyValueSize + (legacyShowLabels ? legacyLabelSize + 6 : 0)
  );
  const legacyChipW = resolveCountdownUnitWidth({
    width: legacyRequestedChipW,
    height: legacyChipH,
    boxRadius: legacyChipRadius,
  });
  const legacySeparatorFontSize = Math.max(10, Math.round(legacyValueSize * 0.64));

  if (!isV2) {
    return (
      <div ref={wrapperRef} className="flex w-full justify-center overflow-hidden">
        <div
          ref={innerRef}
          className="flex items-center justify-center"
          style={{
            fontFamily,
            gap: legacyGap,
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
                    borderRadius: legacyChipRadius,
                    boxShadow: preset?.boxShadow ? "0 2px 6px rgba(0,0,0,0.15)" : "none",
                    width: legacyChipW,
                    minWidth: legacyChipW,
                    height: legacyChipH,
                    boxSizing: "border-box",
                    padding: `${legacyPaddingY}px ${legacyPaddingX}px`,
                  }}
                >
                  <span
                    className="font-bold"
                    style={{ ...numberTextPaintStyle, fontSize: legacyValueSize }}
                  >
                    {item.value}
                  </span>
                  {legacyShowLabels ? (
                    <span
                      style={{ ...labelTextPaintStyle, fontSize: legacyLabelSize }}
                    >
                      {item.label}
                    </span>
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
                <span
                  className="mx-1 font-bold"
                  style={{ ...numberTextPaintStyle, fontSize: legacySeparatorFontSize }}
                >
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
  const chipPx = Math.max(2, toFinite(preset?.paddingX, SZ.chipPx));
  const chipPy = Math.max(2, toFinite(preset?.paddingY, SZ.chipPy));
  const chipRadius = Math.max(0, toFinite(preset?.boxRadius, 10));
  const showLabels = preset?.showLabels !== false;
  const separator = String(preset?.separator || "").slice(0, 3);
  const labelTransform = String(preset?.labelTransform || "uppercase").toLowerCase();
  const isMinimal = String(preset?.layout || "pills").toLowerCase() === "minimal";
  const canDrawSeparators = Boolean(separator && distribution !== "vertical" && distribution !== "grid");
  const itemCount = Math.max(1, v2Parts.length);
  const valueSize = Math.max(10, toFinite(preset?.fontSize, 28));
  const unitLabelSize = Math.max(8, toFinite(preset?.labelSize, 12));
  const lineHeight = Math.max(0.8, toFinite(preset?.lineHeight, 1.05));
  const letterSpacing = toFinite(preset?.letterSpacing, 0);
  const requestedChipW = Math.max(36, toFinite(preset?.chipWidth, SZ.chipMinW) + chipPx * 2);
  const textDrivenChipH = Math.max(
    44,
    chipPy * 2 + valueSize + (showLabels ? unitLabelSize + 6 : 0)
  );
  const layoutDrivenChipH = estimateCountdownUnitHeight({
    tamanoBase: toFinite(preset?.tamanoBase, 320),
    distribution,
    unitsCount: itemCount,
  });
  const chipOuterH = Math.max(textDrivenChipH, layoutDrivenChipH);
  const baseChipW = resolveCountdownUnitWidth({
    width: requestedChipW,
    height: chipOuterH,
    boxRadius: chipRadius,
  });
  const cols =
    distribution === "vertical"
      ? 1
      : distribution === "grid"
        ? Math.min(2, itemCount)
        : itemCount;
  const rows =
    distribution === "vertical"
      ? itemCount
      : distribution === "grid"
        ? Math.ceil(itemCount / cols)
        : 1;
  const editorialWidths =
    distribution === "editorial"
      ? Array.from({ length: itemCount }, (_, index) =>
          resolveCountdownUnitWidth({
            width: Math.max(
              34,
              Math.round(baseChipW * (index === 0 && itemCount > 1 ? 1.25 : 0.88))
            ),
            height: chipOuterH,
            boxRadius: chipRadius,
          })
        )
      : [];
  const naturalW =
    distribution === "vertical"
      ? baseChipW
      : distribution === "grid"
        ? cols * baseChipW + gap * (cols - 1)
        : distribution === "editorial"
          ? editorialWidths.reduce((acc, width) => acc + width, 0) +
            gap * Math.max(0, itemCount - 1)
          : itemCount * baseChipW + gap * (itemCount - 1);
  const naturalH =
    distribution === "vertical" || distribution === "grid"
      ? rows * chipOuterH + gap * Math.max(0, rows - 1)
      : chipOuterH;
  const containerW = Math.max(
    1,
    naturalW + (useSingleFrameLayout ? framePadding * 2 : 0)
  );
  const containerH = Math.max(
    1,
    naturalH + (useSingleFrameLayout ? framePadding * 2 : 0)
  );
  const contentBounds = {
    x: useSingleFrameLayout ? framePadding : 0,
    y: useSingleFrameLayout ? framePadding : 0,
    width: Math.max(1, containerW - (useSingleFrameLayout ? framePadding * 2 : 0)),
    height: Math.max(1, containerH - (useSingleFrameLayout ? framePadding * 2 : 0)),
  };
  const distributionW =
    distribution === "grid"
      ? cols * baseChipW + gap * (cols - 1)
      : distribution === "vertical"
        ? baseChipW
        : naturalW;
  const distributionH =
    distribution === "vertical" || distribution === "grid"
      ? rows * chipOuterH + gap * Math.max(0, rows - 1)
      : chipOuterH;
  const startX = contentBounds.x + (contentBounds.width - distributionW) / 2;
  const startY = contentBounds.y + (contentBounds.height - distributionH) / 2;
  const unitLayouts =
    distribution === "vertical"
      ? v2Parts.map((item, index) => ({
          ...item,
          x: contentBounds.x + (contentBounds.width - baseChipW) / 2,
          y: startY + index * (chipOuterH + gap),
          width: baseChipW,
          height: chipOuterH,
        }))
      : distribution === "grid"
        ? v2Parts.map((item, index) => {
            const row = Math.floor(index / cols);
            const col = index % cols;
            return {
              ...item,
              x: startX + col * (baseChipW + gap),
              y: startY + row * (chipOuterH + gap),
              width: baseChipW,
              height: chipOuterH,
            };
          })
        : distribution === "editorial"
          ? (() => {
              let cursorX = startX;
              return v2Parts.map((item, index) => {
                const width = editorialWidths[index] || baseChipW;
                const layout = {
                  ...item,
                  x: cursorX,
                  y: startY,
                  width,
                  height: chipOuterH,
                };
                cursorX += width + gap;
                return layout;
              });
            })()
          : v2Parts.map((item, index) => ({
              ...item,
              x: startX + index * (baseChipW + gap),
              y: startY,
              width: baseChipW,
              height: chipOuterH,
            }));
  const separatorFontSize = Math.max(10, Math.round(valueSize * 0.64));
  const separatorLayouts =
    canDrawSeparators && unitLayouts.length > 1
      ? unitLayouts.slice(0, -1).map((item, index) => {
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
        })
      : [];

  return (
    <div ref={wrapperRef} className="flex w-full justify-center overflow-hidden">
      <div
        ref={innerRef}
        className="relative"
        style={{
          width: containerW,
          height: containerH,
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
            className="pointer-events-none absolute inset-0 z-0 h-full w-full object-fill"
            loading="lazy"
            decoding="async"
          />
        ) : null}

        <div className="relative z-[1]" style={{ width: containerW, height: containerH }}>
          {unitLayouts.map((item) => (
            <div
              key={item.key}
              className="absolute flex items-center"
              style={{
                left: item.x,
                top: item.y,
                width: item.width,
                height: item.height,
              }}
            >
              <div
                className="relative flex h-full w-full min-w-0 flex-col items-center justify-center leading-none"
                style={{
                  boxSizing: "border-box",
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
                    className="pointer-events-none absolute inset-0 z-0 h-full w-full object-fill"
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
            </div>
          ))}
          {separatorLayouts.map((item) => (
            <span
              key={item.key}
              className="pointer-events-none absolute z-[2] flex items-center justify-center font-bold"
              style={{
                left: item.x,
                top: item.y,
                width: item.width,
                ...numberTextPaintStyle,
                fontSize: separatorFontSize,
                lineHeight,
                letterSpacing: `${letterSpacing}px`,
              }}
            >
              {separator}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
