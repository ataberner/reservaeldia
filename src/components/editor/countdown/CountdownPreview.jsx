import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { getRemainingParts, fmt } from "./countdownUtils";
import {
  buildTextPaintStyle,
  normalizeVisibleUnits,
  resolveCountdownLayoutMetrics,
  resolveCountdownUnitWidth,
  resolvePreviewPaint,
} from "@/domain/countdownPresets/renderModel";
import { resolveCountdownContract } from "../../../../shared/renderContractPolicy.js";
import {
  COUNTDOWN_PREVIEW_FIT_MODES,
  computeCountdownPreviewScale,
} from "./countdownPreviewScale";
import {
  recordCountdownAssetLoadError,
  recordCountdownRenderTelemetry,
} from "@/domain/countdownObservability/telemetry";
import {
  resolveCountdownFrameVisualBounds,
} from "@/domain/countdownPresets/frameGeometry";

const UNIT_LABELS = Object.freeze({
  days: "Dias",
  hours: "Horas",
  minutes: "Min",
  seconds: "Seg",
});

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

export default function CountdownPreview({
  targetISO,
  preset,
  size = "sm",
  live = true,
  fitMode = COUNTDOWN_PREVIEW_FIT_MODES.WIDTH,
  telemetryRenderer = "react-countdown-preview",
}) {
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

    const nextScale = computeCountdownPreviewScale({
      containerWidth: wrapperRef.current.offsetWidth,
      containerHeight: wrapperRef.current.offsetHeight,
      contentWidth: innerRef.current.scrollWidth,
      contentHeight: innerRef.current.scrollHeight,
      fitMode,
    });
    if (!nextScale) return;
    setScale(nextScale);
  }, [fitMode]);

  const countdownContract = useMemo(
    () => resolveCountdownContract(preset || null),
    [preset]
  );
  const isV2 = countdownContract.contractVersion === "v2";

  useEffect(() => {
    recordCountdownRenderTelemetry({
      countdown: preset,
      renderer: telemetryRenderer,
    });
  }, [preset, telemetryRenderer]);
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

  const fontFamily = preset?.fontFamily || "Inter, system-ui, sans-serif";
  const numberColor = resolvePreviewPaint(preset?.color, "#111");
  const labelColor = resolvePreviewPaint(preset?.labelColor, "#6b7280");
  const separatorColor = resolvePreviewPaint(
    preset?.separatorColor ?? preset?.color,
    "#111"
  );
  const numberTextPaintStyle = buildTextPaintStyle(numberColor, "#111");
  const labelTextPaintStyle = buildTextPaintStyle(labelColor, "#6b7280");
  const separatorTextPaintStyle = buildTextPaintStyle(separatorColor, "#111");
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

  const layoutMetrics = resolveCountdownLayoutMetrics(preset);
  const {
    frameSvgUrl: frameUrl,
    hasFrameConfigured,
    useSingleFrameLayout,
    useMultiUnitFrame,
    frameScale,
    paddingX: chipPx,
    paddingY: chipPy,
    boxRadius: chipRadius,
    showLabels,
    separatorText: separator,
    valueSize,
    labelSize: unitLabelSize,
    lineHeight,
    letterSpacing,
    containerW,
    containerH,
    separatorFontSize,
  } = layoutMetrics;
  const frameAssetType =
    String(preset?.frameAssetType || "").toLowerCase() === "png"
      ? "png"
      : "svg";
  const isPngFrame = frameAssetType === "png";
  const frameColorMode = String(preset?.frameColorMode || "fixed").toLowerCase();
  const frameColor = resolvePreviewPaint(preset?.frameColor, "#773dbe");
  const usesCurrentColorFrame =
    !isPngFrame && frameColorMode === "currentcolor";
  const handleFrameLoadError = () => {
    recordCountdownAssetLoadError({
      countdown: preset,
      renderer: telemetryRenderer,
      assetKind: `frame-${frameAssetType}`,
    });
  };
  const labelTransform = String(preset?.labelTransform || "uppercase").toLowerCase();
  const isMinimal = String(preset?.layout || "pills").toLowerCase() === "minimal";
  const frameScaleStyle = {
    transform: `scale(${frameScale})`,
    transformOrigin: "center",
  };
  const partsByUnit = new Map(v2Parts.map((item) => [item.key, item]));
  const unitLayouts = layoutMetrics.unitLayouts.map((item) => ({
    ...item,
    ...(partsByUnit.get(item.unit) || {}),
  }));
  const frameVisualBounds = resolveCountdownFrameVisualBounds({
    width: containerW,
    height: containerH,
    frameScale: hasFrameConfigured ? frameScale : 1,
    frameRects: useMultiUnitFrame ? unitLayouts : undefined,
  });
  const separatorLayouts = layoutMetrics.separatorLayouts;

  return (
    <div ref={wrapperRef} className="flex w-full justify-center overflow-hidden">
      <div
        ref={innerRef}
        className="relative"
        style={{
          width: frameVisualBounds.width,
          height: frameVisualBounds.height,
          fontFamily,
          transform: `scale(${scale})`,
          transformOrigin: "center",
        }}
      >
        <div
          className="absolute"
          style={{
            left: frameVisualBounds.offsetX,
            top: frameVisualBounds.offsetY,
            width: containerW,
            height: containerH,
          }}
        >
        {useSingleFrameLayout ? (
          usesCurrentColorFrame ? (
            <>
              <img
                src={frameUrl}
                alt=""
                aria-hidden="true"
                onError={handleFrameLoadError}
                className="hidden"
                loading="eager"
                decoding="async"
              />
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 z-0"
                style={{
                  ...frameScaleStyle,
                  backgroundColor: frameColor,
                  WebkitMaskImage: `url("${frameUrl}")`,
                  maskImage: `url("${frameUrl}")`,
                  WebkitMaskPosition: "center",
                  maskPosition: "center",
                  WebkitMaskRepeat: "no-repeat",
                  maskRepeat: "no-repeat",
                  WebkitMaskSize: "100% 100%",
                  maskSize: "100% 100%",
                }}
              />
            </>
          ) : (
            <img
              src={frameUrl}
              alt=""
              aria-hidden="true"
              onError={handleFrameLoadError}
              className={`pointer-events-none absolute inset-0 z-0 h-full w-full ${
                isPngFrame ? "object-contain" : "object-fill"
              }`}
              style={frameScaleStyle}
              loading="lazy"
              decoding="async"
            />
          )
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
                  usesCurrentColorFrame ? (
                    <>
                      <img
                        src={frameUrl}
                        alt=""
                        aria-hidden="true"
                        onError={handleFrameLoadError}
                        className="hidden"
                        loading="eager"
                        decoding="async"
                      />
                      <span
                        aria-hidden="true"
                        className="pointer-events-none absolute inset-0 z-0"
                        style={{
                          ...frameScaleStyle,
                          backgroundColor: frameColor,
                          WebkitMaskImage: `url("${frameUrl}")`,
                          maskImage: `url("${frameUrl}")`,
                          WebkitMaskPosition: "center",
                          maskPosition: "center",
                          WebkitMaskRepeat: "no-repeat",
                          maskRepeat: "no-repeat",
                          WebkitMaskSize: "100% 100%",
                          maskSize: "100% 100%",
                        }}
                      />
                    </>
                  ) : (
                    <img
                      src={frameUrl}
                      alt=""
                      aria-hidden="true"
                      onError={handleFrameLoadError}
                      className={`pointer-events-none absolute inset-0 z-0 h-full w-full ${
                        isPngFrame ? "object-contain" : "object-fill"
                      }`}
                      style={frameScaleStyle}
                      loading="lazy"
                      decoding="async"
                    />
                  )
                ) : null}

                <div className="relative z-[1] flex flex-col items-center">
                  <span
                    className="font-bold"
                    style={{
                      ...numberTextPaintStyle,
                      fontFamily,
                      fontSize: valueSize,
                      lineHeight,
                      letterSpacing: `${letterSpacing}px`,
                    }}
                  >
                    {item.value}
                  </span>
                  {showLabels ? (
                    <span
                      style={{
                        ...labelTextPaintStyle,
                        fontFamily,
                        fontSize: unitLabelSize,
                        lineHeight: 1,
                        letterSpacing: `${letterSpacing}px`,
                        marginTop: 4,
                      }}
                    >
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
                ...separatorTextPaintStyle,
                fontFamily,
                fontSize: separatorFontSize,
                lineHeight: 1,
                letterSpacing: `${letterSpacing}px`,
              }}
            >
              {separator}
            </span>
          ))}
        </div>
        </div>
      </div>
    </div>
  );
}
