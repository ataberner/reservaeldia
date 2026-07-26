import { useEffect, useMemo, useRef, useState } from "react";
import { buildCountdownCanvasPatchFromPreset } from "@/domain/countdownPresets/toCanvasPatch";
import { loadGoogleFont } from "@/utils/loadFont";
import {
  buildTextPaintStyle,
  buildFrameSvgMarkup,
  getCountdownParts,
  resolveCountdownLayoutMetrics,
  resolveCanvasPaint,
  resolvePreviewPaint,
  transformLabel,
} from "@/domain/countdownPresets/renderModel";
import {
  recordCountdownAssetLoadError,
  recordCountdownRenderTelemetry,
} from "@/domain/countdownObservability/telemetry";
import {
  resolveCountdownFrameVisualBounds,
} from "@/domain/countdownPresets/frameGeometry";

const LEGACY_LAYOUTS = new Set(["pills", "flip", "minimal"]);
const GENERIC_FONT_NAMES = new Set([
  "serif",
  "sans-serif",
  "monospace",
  "cursive",
  "fantasy",
  "system-ui",
  "ui-serif",
  "ui-sans-serif",
  "ui-monospace",
]);

function extractPrimaryFontName(fontFamily) {
  const first = String(fontFamily || "")
    .replace(/['"]/g, "")
    .split(",")[0]
    .trim();
  return first;
}

function usePulseOnChange(valuesKey, enabled) {
  const [pulseToken, setPulseToken] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    setPulseToken((prev) => prev + 1);
  }, [valuesKey, enabled]);

  return pulseToken;
}

function toFinite(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function resolveUnitCssValue(value, fallback) {
  const safe = String(value || "").trim();
  if (!safe) return fallback;
  if (/[<>;]/.test(safe)) return fallback;
  if (/(url\s*\(|javascript:|expression\s*\()/i.test(safe)) return fallback;
  return safe;
}

function resolveLegacyLayout(value) {
  const safe = String(value || "").trim().toLowerCase();
  return LEGACY_LAYOUTS.has(safe) ? safe : "pills";
}

function useElementSize(ref) {
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const apply = (width, height) => {
      const nextWidth = Math.max(0, Math.floor(width));
      const nextHeight = Math.max(0, Math.floor(height));
      setSize((prev) =>
        prev.width === nextWidth && prev.height === nextHeight
          ? prev
          : { width: nextWidth, height: nextHeight }
      );
    };

    const measure = () => apply(node.clientWidth || 0, node.clientHeight || 0);
    measure();

    if (typeof ResizeObserver === "function") {
      const observer = new ResizeObserver((entries) => {
        const rect = entries[0]?.contentRect;
        if (!rect) {
          measure();
          return;
        }
        apply(rect.width, rect.height);
      });
      observer.observe(node);
      return () => observer.disconnect();
    }

    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [ref]);

  return size;
}

export default function CountdownPresetLivePreview({
  config,
  svgText,
  frameUrl = "",
  frameAssetType = null,
  svgColorMode = "fixed",
  frameColor = "#773dbe",
  targetISO,
  nowMs = null,
  reducedMotion = false,
  legacyPresetProps = null,
  useLegacyCanvasPreview = false,
}) {
  const [tick, setTick] = useState(0);
  const stageViewportRef = useRef(null);
  const stageViewport = useElementSize(stageViewportRef);
  const hasInjectedNow =
    nowMs !== null &&
    nowMs !== "" &&
    Number.isFinite(Number(nowMs));

  useEffect(() => {
    if (hasInjectedNow) return undefined;
    const timer = setInterval(() => {
      setTick((prev) => (prev + 1) % 3600);
    }, 1000);
    return () => clearInterval(timer);
  }, [hasInjectedNow]);

  const safeConfig = config || {};
  const layout = safeConfig.layout || {};
  const typo = safeConfig.tipografia || {};
  const colors = safeConfig.colores || {};
  const animations = safeConfig.animaciones || {};
  const unidad = safeConfig.unidad || {};
  const legacyMode = useLegacyCanvasPreview === true;

  const previewPatch = useMemo(
    () =>
      buildCountdownCanvasPatchFromPreset({
        presetId: "preview",
        activeVersion: 1,
        layout,
        tipografia: typo,
        colores: colors,
        animaciones: animations,
        unidad,
        tamanoBase: safeConfig?.tamanoBase,
        svgRef: {
          type: frameAssetType,
          colorMode:
            frameAssetType === "png" ? "fixed" : svgColorMode,
          downloadUrl: null,
        },
      }),
    [
      layout,
      typo,
      colors,
      animations,
      unidad,
      safeConfig?.tamanoBase,
      svgColorMode,
      frameAssetType,
    ]
  );

  useEffect(() => {
    recordCountdownRenderTelemetry({
      countdown: previewPatch,
      renderer: "builder-live-preview",
    });
  }, [previewPatch]);

  const handleFrameLoadError = () => {
    recordCountdownAssetLoadError({
      countdown: previewPatch,
      renderer: "builder-live-preview",
      assetKind: `frame-${frameAssetType === "png" ? "png" : "svg"}`,
    });
  };

  const layoutVariant = resolveLegacyLayout(
    legacyPresetProps?.layout || unidad?.legacyLayout || previewPatch.layout
  );
  const flipDividerColor = resolveUnitCssValue(
    legacyPresetProps?.flipDividerColor || unidad?.flipDividerColor,
    "#e5e7eb"
  );

  const layoutMetrics = useMemo(
    () =>
      resolveCountdownLayoutMetrics({
        ...previewPatch,
        frameSvgUrl:
          String(frameUrl || "").trim() || (svgText ? "inline:svg" : ""),
        frameAssetType,
      }),
    [previewPatch, frameUrl, svgText, frameAssetType]
  );
  const visibleUnits = layoutMetrics.visibleUnits;
  const parts = useMemo(
    () =>
      getCountdownParts(
        targetISO,
        visibleUnits,
        hasInjectedNow ? Number(nowMs) : Date.now()
      ),
    [targetISO, tick, visibleUnits, nowMs, hasInjectedNow]
  );

  const valuesKey = parts.map((part) => part.value).join("|");
  const pulseToken = usePulseOnChange(
    valuesKey,
    !reducedMotion &&
      !legacyMode &&
      animations.tick &&
      animations.tick !== "none"
  );
  const canAnimateFrame = Boolean(
      !reducedMotion &&
      !legacyMode &&
      (svgText || frameUrl) &&
      animations.frame &&
      animations.frame !== "none"
  );

  const frameSvgMarkup = useMemo(
    () =>
      frameAssetType === "png"
        ? ""
        : buildFrameSvgMarkup(svgText, {
        colorMode: svgColorMode,
        frameColor,
      }),
    [svgText, svgColorMode, frameColor, frameAssetType]
  );
  const safeFrameUrl = String(frameUrl || "").trim();
  const isPngFrame = frameAssetType === "png";
  const canUseCurrentColor =
    !isPngFrame && svgColorMode === "currentColor";

  const {
    useSingleFrameLayout,
    useMultiUnitFrame,
    showLabels,
    separatorText: separator,
    valueSize: numberSize,
    labelSize,
    lineHeight,
    letterSpacing,
    frameScale,
    boxRadius: unitBoxRadius,
    containerW,
    containerH,
    separatorFontSize,
  } = layoutMetrics;
  const partsByUnit = useMemo(
    () => new Map(parts.map((part) => [part.unit, part])),
    [parts]
  );
  const unitLayouts = useMemo(
    () =>
      layoutMetrics.unitLayouts.map((item) => ({
        ...item,
        ...(partsByUnit.get(item.unit) || {}),
      })),
    [layoutMetrics, partsByUnit]
  );
  const frameVisualBounds = resolveCountdownFrameVisualBounds({
    width: containerW,
    height: containerH,
    frameScale:
      frameSvgMarkup || safeFrameUrl
        ? frameScale
        : 1,
    frameRects: useMultiUnitFrame ? unitLayouts : undefined,
  });

  const displayTargetWidth = Math.max(220, Math.min(560, toFinite(safeConfig?.tamanoBase, 320)));
  const viewportWidth = Math.max(1, stageViewport.width || displayTargetWidth);
  const viewportHeight = Math.max(1, stageViewport.height || 280);
  const constrainedTargetWidth = Math.min(displayTargetWidth, viewportWidth);
  const stageScale = Math.min(
    1,
    constrainedTargetWidth / frameVisualBounds.width,
    viewportHeight / frameVisualBounds.height
  );
  const stageWidth = Math.max(
    1,
    Math.round(frameVisualBounds.width * stageScale)
  );
  const stageHeight = Math.max(
    1,
    Math.round(frameVisualBounds.height * stageScale)
  );
  const frameScaleStyle = {
    transform: `scale(${frameScale})`,
    transformOrigin: "center",
  };
  const separatorLayouts = layoutMetrics.separatorLayouts;

  const unitBoxBg = resolveUnitCssValue(
    resolvePreviewPaint(unidad.boxBg, "transparent"),
    "transparent"
  );
  const unitBoxBorder = resolveUnitCssValue(
    resolveCanvasPaint(unidad.boxBorder, "transparent"),
    "transparent"
  );
  const unitBoxShadow = unidad.boxShadow === true;
  const numberColor = resolvePreviewPaint(
    colors.numberColor || previewPatch.color,
    "#111111"
  );
  const labelColor = resolvePreviewPaint(
    colors.labelColor || previewPatch.labelColor,
    "#4b5563"
  );
  const separatorColor = resolvePreviewPaint(
    previewPatch.separatorColor ?? previewPatch.color,
    "#111111"
  );
  const frameStrokeColor = resolveCanvasPaint(
    previewPatch.frameColor || frameColor,
    "#773dbe"
  );
  const fontFamily = typo.fontFamily || previewPatch.fontFamily || "Poppins";
  const labelTransform = typo.labelTransform || previewPatch.labelTransform || "uppercase";
  const numberTextPaintStyle = buildTextPaintStyle(numberColor, "#111111");
  const labelTextPaintStyle = buildTextPaintStyle(labelColor, "#4b5563");
  const separatorTextPaintStyle = buildTextPaintStyle(
    separatorColor,
    "#111111"
  );

  useEffect(() => {
    const family = extractPrimaryFontName(fontFamily);
    if (!family) return;
    if (GENERIC_FONT_NAMES.has(family.toLowerCase())) return;
    loadGoogleFont(family).catch(() => {
      // Non-blocking: mantiene fallback de stack CSS.
    });
  }, [fontFamily]);

  const frameAnimationClass =
    animations.frame === "rotateSlow"
      ? "cd-preview-frame-rotate"
      : animations.frame === "shimmer"
        ? "cd-preview-frame-shimmer"
        : "";

  const tickAnimationClass =
    animations.tick === "flipSoft"
      ? "cd-preview-value-flip"
      : animations.tick === "pulse"
        ? "cd-preview-value-pulse"
        : "";

  const entryAnimationClass =
    reducedMotion
      ? ""
      : animations.entry === "fadeUp"
      ? "cd-preview-entry-up"
      : animations.entry === "fadeIn"
        ? "cd-preview-entry-fade"
        : animations.entry === "scaleIn"
          ? "cd-preview-entry-scale"
          : "";

  return (
    <div
      className="rounded-2xl border border-slate-200 bg-gradient-to-b from-white to-slate-50 p-2"
      data-countdown-preview-motion={reducedMotion ? "reduced" : "full"}
    >
      <div
        className={`relative overflow-hidden rounded-2xl border border-slate-200 bg-white ${legacyMode ? "" : entryAnimationClass}`}
        style={{ height: "clamp(200px, 34vh, 340px)" }}
      >
        <div
          ref={stageViewportRef}
          className="absolute inset-2 flex items-center justify-center overflow-hidden"
        >
          <div className="relative z-[1]" style={{ width: `${stageWidth}px`, height: `${stageHeight}px` }}>
          <div
            className="relative"
            style={{
              width: `${frameVisualBounds.width}px`,
              height: `${frameVisualBounds.height}px`,
              transform: `scale(${stageScale})`,
              transformOrigin: "top left",
            }}
          >
          <div
            className="absolute"
            style={{
              left: `${frameVisualBounds.offsetX}px`,
              top: `${frameVisualBounds.offsetY}px`,
              width: `${containerW}px`,
              height: `${containerH}px`,
            }}
          >
            {useSingleFrameLayout && frameSvgMarkup ? (
              <div
                aria-hidden="true"
                className={`cd-preview-svg pointer-events-none absolute inset-0 ${canAnimateFrame ? frameAnimationClass : ""}`}
                style={frameScaleStyle}
                dangerouslySetInnerHTML={{ __html: frameSvgMarkup }}
              />
            ) : null}

            {useSingleFrameLayout && !frameSvgMarkup && safeFrameUrl ? (
              canUseCurrentColor ? (
                <>
                  <img
                    src={safeFrameUrl}
                    alt=""
                    aria-hidden="true"
                    onError={handleFrameLoadError}
                    className="hidden"
                    loading="eager"
                    decoding="async"
                  />
                  <span
                    aria-hidden="true"
                    className={`pointer-events-none absolute inset-0 ${canAnimateFrame ? frameAnimationClass : ""}`}
                    style={{
                      ...frameScaleStyle,
                      backgroundColor: frameStrokeColor,
                      WebkitMaskImage: `url("${safeFrameUrl}")`,
                      maskImage: `url("${safeFrameUrl}")`,
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
                  src={safeFrameUrl}
                  alt=""
                  aria-hidden="true"
                  onError={handleFrameLoadError}
                  className={`pointer-events-none absolute inset-0 h-full w-full ${
                    isPngFrame ? "object-contain" : "object-fill"
                  } ${canAnimateFrame ? frameAnimationClass : ""}`}
                  style={frameScaleStyle}
                  loading="lazy"
                  decoding="async"
                />
              )
            ) : null}

            {unitLayouts.map((item) => {
                const pulseClass =
                  !reducedMotion && pulseToken > 0 ? tickAnimationClass : "";
                const label = transformLabel(item.label, labelTransform);
                const canDrawBox = layoutVariant !== "minimal";
                const cornerRadius = Math.min(unitBoxRadius, item.width / 2, item.height / 2);

                return (
                <div
                  key={item.unit}
                  className="absolute"
                  style={{
                    left: `${item.x}px`,
                    top: `${item.y}px`,
                    width: `${item.width}px`,
                    height: `${item.height}px`,
                  }}
                >
                  {canDrawBox ? (
                    <div
                      className="absolute inset-0"
                      style={{
                        background: unitBoxBg || "transparent",
                        border: `1px solid ${unitBoxBorder || "transparent"}`,
                        borderRadius: `${cornerRadius}px`,
                        boxShadow: unitBoxShadow
                          ? "0 2px 6px rgba(0,0,0,0.15)"
                          : "none",
                      }}
                    />
                  ) : null}

                  {useMultiUnitFrame && frameSvgMarkup ? (
                    <div
                      aria-hidden="true"
                      className={`cd-preview-svg pointer-events-none absolute inset-0 ${canAnimateFrame ? frameAnimationClass : ""}`}
                      style={frameScaleStyle}
                      dangerouslySetInnerHTML={{ __html: frameSvgMarkup }}
                    />
                  ) : null}

                  {useMultiUnitFrame && !frameSvgMarkup && safeFrameUrl ? (
                    canUseCurrentColor ? (
                      <>
                        <img
                          src={safeFrameUrl}
                          alt=""
                          aria-hidden="true"
                          onError={handleFrameLoadError}
                          className="hidden"
                          loading="eager"
                          decoding="async"
                        />
                        <span
                          aria-hidden="true"
                          className={`pointer-events-none absolute inset-0 ${canAnimateFrame ? frameAnimationClass : ""}`}
                          style={{
                            ...frameScaleStyle,
                            backgroundColor: frameStrokeColor,
                            WebkitMaskImage: `url("${safeFrameUrl}")`,
                            maskImage: `url("${safeFrameUrl}")`,
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
                        src={safeFrameUrl}
                        alt=""
                        aria-hidden="true"
                        onError={handleFrameLoadError}
                        className={`pointer-events-none absolute inset-0 h-full w-full ${
                          isPngFrame ? "object-contain" : "object-fill"
                        } ${canAnimateFrame ? frameAnimationClass : ""}`}
                        style={frameScaleStyle}
                        loading="lazy"
                        decoding="async"
                      />
                    )
                  ) : null}

                  {layoutVariant === "flip" && canDrawBox ? (
                    <span
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-x-0 top-1/2 border-t border-dashed"
                      style={{ borderColor: flipDividerColor }}
                    />
                  ) : null}

                  <div className="relative z-[2] flex h-full flex-col items-center justify-center leading-none">
                    <span
                      className={`font-bold ${pulseClass}`}
                      style={{
                        ...numberTextPaintStyle,
                        fontFamily,
                        fontSize: numberSize,
                        letterSpacing: `${letterSpacing}px`,
                        lineHeight,
                      }}
                    >
                      {item.value}
                    </span>
                    {showLabels ? (
                      <span
                        style={{
                          ...labelTextPaintStyle,
                          fontFamily,
                          fontSize: labelSize,
                          marginTop: 4,
                          letterSpacing: `${letterSpacing}px`,
                          lineHeight: 1,
                        }}
                      >
                        {label}
                      </span>
                    ) : null}
                  </div>

                  </div>
                );
              })}

              {separatorLayouts.map((item) => (
                <span
                  key={item.key}
                  className="pointer-events-none absolute z-[5] flex items-center justify-center font-bold leading-none"
                  style={{
                    left: `${item.x}px`,
                    top: `${item.y}px`,
                    width: `${item.width}px`,
                    ...separatorTextPaintStyle,
                    fontFamily,
                    fontSize: separatorFontSize,
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
      </div>

      <style jsx>{`
        .cd-preview-entry-up {
          animation: cdPreviewEntryUp 420ms ease both;
        }
        .cd-preview-entry-fade {
          animation: cdPreviewEntryFade 380ms ease both;
        }
        .cd-preview-entry-scale {
          animation: cdPreviewEntryScale 420ms cubic-bezier(0.22, 1, 0.36, 1) both;
        }
        .cd-preview-value-flip {
          animation: cdPreviewFlip 320ms ease;
          transform-origin: center;
        }
        .cd-preview-value-pulse {
          animation: cdPreviewPulse 280ms ease;
        }
        .cd-preview-frame-rotate :global(svg) {
          animation: cdPreviewFrameRotate 12s linear infinite;
          transform-origin: 50% 50%;
        }
        .cd-preview-frame-shimmer :global(svg) {
          animation: cdPreviewFrameShimmer 2.5s ease-in-out infinite;
        }
        .cd-preview-svg :global(svg) {
          width: 100%;
          height: 100%;
          display: block;
        }
        @keyframes cdPreviewEntryUp {
          from {
            opacity: 0;
            transform: translateY(12px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        @keyframes cdPreviewEntryFade {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }
        @keyframes cdPreviewEntryScale {
          from {
            opacity: 0;
            transform: scale(0.98);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }
        @keyframes cdPreviewFlip {
          0% {
            transform: rotateX(0);
            opacity: 0.85;
          }
          50% {
            transform: rotateX(60deg);
            opacity: 0.95;
          }
          100% {
            transform: rotateX(0);
            opacity: 1;
          }
        }
        @keyframes cdPreviewPulse {
          0% {
            transform: scale(1);
          }
          50% {
            transform: scale(1.06);
          }
          100% {
            transform: scale(1);
          }
        }
        @keyframes cdPreviewFrameRotate {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }
        @keyframes cdPreviewFrameShimmer {
          0%,
          100% {
            opacity: 0.8;
            filter: brightness(1);
          }
          50% {
            opacity: 1;
            filter: brightness(1.08);
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .cd-preview-entry-up,
          .cd-preview-entry-fade,
          .cd-preview-entry-scale,
          .cd-preview-value-flip,
          .cd-preview-value-pulse {
            animation: none !important;
          }
          .cd-preview-frame-rotate :global(svg),
          .cd-preview-frame-shimmer :global(svg) {
            animation: none !important;
          }
        }
      `}</style>
    </div>
  );
}
