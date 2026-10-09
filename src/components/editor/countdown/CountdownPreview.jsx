import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { getRemainingParts, fmt } from "./countdownUtils";
import {
  buildTextPaintStyle,
  resolveCountdownLayoutMetrics,
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

const LEGACY_UNIT_LABELS = Object.freeze({
  days: { key: "dias", label: "Días" },
  hours: { key: "horas", label: "Horas" },
  minutes: { key: "min", label: "Min" },
  seconds: { key: "seg", label: "Seg" },
});

function applyLabelTransform(label, mode) {
  const safe = String(label || "");
  if (mode === "uppercase") return safe.toUpperCase();
  if (mode === "lowercase") return safe.toLowerCase();
  if (mode === "capitalize") return safe.replace(/\b\w/g, (m) => m.toUpperCase());
  return safe;
}

export default function CountdownPreview({
  targetISO,
  preset,
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
  const layoutMetrics = resolveCountdownLayoutMetrics(preset);
  const previewParts = layoutMetrics.visibleUnits.map((unit) => {
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
      label: isV2
        ? UNIT_LABELS[unit]
        : preset?.labels?.[LEGACY_UNIT_LABELS[unit].key] ?? LEGACY_UNIT_LABELS[unit].label,
    };
  });

  useLayoutEffect(() => {
    measureScale();
  }, [measureScale, previewParts.length, preset]);

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
  const numberColor = resolvePreviewPaint(
    isV2 ? preset?.color : preset?.colorTexto ?? preset?.color,
    "#111"
  );
  const labelColor = resolvePreviewPaint(preset?.labelColor, "#6b7280");
  const separatorColor = resolvePreviewPaint(
    isV2
      ? preset?.separatorColor ?? preset?.color
      : preset?.separatorColor ?? preset?.colorTexto ?? preset?.color,
    "#111"
  );
  const numberTextPaintStyle = buildTextPaintStyle(numberColor, "#111");
  const labelTextPaintStyle = buildTextPaintStyle(labelColor, "#6b7280");
  const separatorTextPaintStyle = buildTextPaintStyle(separatorColor, "#111");
  const {
    frameSvgUrl: frameUrl,
    hasFrameConfigured,
    useSingleFrameLayout: hasSingleFrameLayout,
    useMultiUnitFrame: hasMultiUnitFrame,
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
  const useSingleFrameLayout = isV2 && hasSingleFrameLayout;
  const useMultiUnitFrame = isV2 && hasMultiUnitFrame;
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
  const isMinimal = isV2
    ? String(preset?.layout || "pills").toLowerCase() === "minimal"
    : String(preset?.presetId || preset?.layout || "pills").toLowerCase().includes("minimal");
  const chipBackground = isV2
    ? preset?.boxBg || "transparent"
    : preset?.chipBackground ?? preset?.boxBg ?? "rgba(255,255,255,.75)";
  const chipBorder = isV2
    ? preset?.boxBorder || "transparent"
    : preset?.chipBorder ?? preset?.boxBorder ?? "rgba(0,0,0,.08)";
  const legacyChipRadius = Number.isFinite(preset?.chipRadius)
    ? preset.chipRadius
    : Number.isFinite(preset?.boxRadius)
      ? preset.boxRadius
      : Number.isFinite(preset?.radius)
        ? preset.radius
        : 10;
  const frameScaleStyle = {
    transform: `scale(${frameScale})`,
    transformOrigin: "center",
  };
  const partsByUnit = new Map(previewParts.map((item) => [item.key, item]));
  const unitLayouts = layoutMetrics.unitLayouts.map((item) => ({
    ...item,
    ...(partsByUnit.get(item.unit) || {}),
  }));
  const frameVisualBounds = resolveCountdownFrameVisualBounds({
    width: containerW,
    height: containerH,
    frameScale: isV2 && hasFrameConfigured ? frameScale : 1,
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
                  borderRadius: isV2 ? chipRadius : legacyChipRadius,
                  background: isMinimal ? "transparent" : chipBackground,
                  border: isMinimal ? "none" : `1px solid ${chipBorder}`,
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
                      lineHeight: isV2 ? lineHeight : 1,
                      letterSpacing: `${letterSpacing}px`,
                      ...(!isV2 && Number.isFinite(preset?.fontWeight)
                        ? { fontWeight: preset.fontWeight }
                        : {}),
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
                        lineHeight: isV2 ? 1 : 1.05,
                        letterSpacing: `${letterSpacing}px`,
                        marginTop: isV2 ? 4 : 0,
                      }}
                    >
                      {isV2 ? applyLabelTransform(item.label, labelTransform) : item.label}
                    </span>
                  ) : null}
                </div>
                {/* Preserve the selector's historical flip decoration for v1. */}
                {!isV2 && !isMinimal && preset?.layout === "flip" ? (
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-x-0 top-1/2 border-t border-dashed"
                    style={{ borderColor: preset?.flipDividerColor || "#e5e7eb" }}
                  />
                ) : null}
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
                ...(!isV2 && Number.isFinite(preset?.fontWeight)
                  ? { fontWeight: preset.fontWeight }
                  : {}),
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
