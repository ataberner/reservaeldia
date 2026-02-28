import { useEffect, useMemo, useRef, useState } from "react";
import { buildCountdownCanvasPatchFromPreset } from "@/domain/countdownPresets/toCanvasPatch";
import { loadGoogleFont } from "@/utils/loadFont";
import {
  buildTextPaintStyle,
  buildFrameSvgMarkup,
  estimateCountdownUnitHeight,
  getCountdownParts,
  normalizeVisibleUnits,
  resolveCanvasPaint,
  resolvePreviewPaint,
  transformLabel,
} from "@/domain/countdownPresets/renderModel";

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
  svgColorMode = "fixed",
  frameColor = "#773dbe",
  targetISO,
  legacyPresetProps = null,
  useLegacyCanvasPreview = false,
}) {
  const [tick, setTick] = useState(0);
  const stageViewportRef = useRef(null);
  const stageViewport = useElementSize(stageViewportRef);

  useEffect(() => {
    const timer = setInterval(() => {
      setTick((prev) => (prev + 1) % 3600);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

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
          colorMode: svgColorMode,
          downloadUrl: null,
        },
      }),
    [layout, typo, colors, animations, unidad, safeConfig?.tamanoBase, svgColorMode]
  );

  const layoutVariant = resolveLegacyLayout(
    legacyPresetProps?.layout || unidad?.legacyLayout || previewPatch.layout
  );
  const flipDividerColor = resolveUnitCssValue(
    legacyPresetProps?.flipDividerColor || unidad?.flipDividerColor,
    "#e5e7eb"
  );

  const visibleUnits = normalizeVisibleUnits(previewPatch.visibleUnits);
  const parts = useMemo(
    () => getCountdownParts(targetISO, visibleUnits),
    [targetISO, tick, visibleUnits]
  );

  const valuesKey = parts.map((part) => part.value).join("|");
  const pulseToken = usePulseOnChange(
    valuesKey,
    !legacyMode && animations.tick && animations.tick !== "none"
  );
  const canAnimateFrame = Boolean(
    !legacyMode &&
      svgText &&
      animations.frame &&
      animations.frame !== "none"
  );

  const frameSvgMarkup = useMemo(
    () =>
      buildFrameSvgMarkup(svgText, {
        colorMode: svgColorMode,
        frameColor,
      }),
    [svgText, svgColorMode, frameColor]
  );
  const safeFrameUrl = String(frameUrl || "").trim();

  const distribution = String(previewPatch.distribution || "centered");
  const layoutType = String(previewPatch.layoutType || "singleFrame");
  const showLabels = previewPatch.showLabels !== false;
  const separator = String(previewPatch.separator || "").slice(0, 3);
  const numberSize = Math.max(10, toFinite(previewPatch.fontSize, 28));
  const labelSize = Math.max(8, toFinite(previewPatch.labelSize, 12));
  const lineHeight = Math.max(0.8, toFinite(previewPatch.lineHeight, 1.05));
  const letterSpacing = toFinite(previewPatch.letterSpacing, 0);
  const gap = Math.max(0, toFinite(previewPatch.gap, 8));
  const framePadding = Math.max(0, toFinite(previewPatch.framePadding, 10));
  const paddingX = Math.max(2, toFinite(previewPatch.paddingX, 8));
  const paddingY = Math.max(2, toFinite(previewPatch.paddingY, 6));
  const baseChipW = Math.max(36, toFinite(previewPatch.chipWidth, 46) + paddingX * 2);
  const textDrivenChipH = Math.max(
    44,
    paddingY * 2 + numberSize + (showLabels ? labelSize + 6 : 0)
  );
  const itemCount = Math.max(1, parts.length);
  const layoutDrivenChipH = estimateCountdownUnitHeight({
    tamanoBase: toFinite(previewPatch.tamanoBase, 320),
    distribution,
    unitsCount: itemCount,
  });
  const chipH = Math.max(textDrivenChipH, layoutDrivenChipH);

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
          Math.max(34, Math.round(baseChipW * (index === 0 && itemCount > 1 ? 1.25 : 0.88)))
        )
      : [];

  const naturalW =
    distribution === "vertical"
      ? baseChipW
      : distribution === "grid"
        ? cols * baseChipW + gap * (cols - 1)
        : distribution === "editorial"
          ? editorialWidths.reduce((acc, width) => acc + width, 0) + gap * Math.max(0, itemCount - 1)
          : itemCount * baseChipW + gap * (itemCount - 1);

  const naturalH =
    distribution === "vertical" || distribution === "grid"
      ? rows * chipH + gap * Math.max(0, rows - 1)
      : chipH;

  const containerW = Math.max(
    naturalW + (layoutType === "singleFrame" ? framePadding * 2 : 0),
    1
  );
  const containerH = Math.max(
    naturalH + (layoutType === "singleFrame" ? framePadding * 2 : 0),
    1
  );

  const contentBounds = {
    x: layoutType === "singleFrame" ? framePadding : 0,
    y: layoutType === "singleFrame" ? framePadding : 0,
    width: Math.max(
      1,
      containerW - (layoutType === "singleFrame" ? framePadding * 2 : 0)
    ),
    height: Math.max(
      1,
      containerH - (layoutType === "singleFrame" ? framePadding * 2 : 0)
    ),
  };

  const distributionW =
    distribution === "grid"
      ? cols * baseChipW + gap * (cols - 1)
      : distribution === "vertical"
        ? baseChipW
        : naturalW;
  const distributionH =
    distribution === "vertical" || distribution === "grid"
      ? rows * chipH + gap * Math.max(0, rows - 1)
      : chipH;

  const startX = contentBounds.x + (contentBounds.width - distributionW) / 2;
  const startY = contentBounds.y + (contentBounds.height - distributionH) / 2;

  const unitLayouts = useMemo(() => {
    if (distribution === "vertical") {
      return parts.map((part, index) => ({
        ...part,
        x: contentBounds.x + (contentBounds.width - baseChipW) / 2,
        y: startY + index * (chipH + gap),
        width: baseChipW,
        height: chipH,
      }));
    }

    if (distribution === "grid") {
      return parts.map((part, index) => {
        const row = Math.floor(index / cols);
        const col = index % cols;
        return {
          ...part,
          x: startX + col * (baseChipW + gap),
          y: startY + row * (chipH + gap),
          width: baseChipW,
          height: chipH,
        };
      });
    }

    if (distribution === "editorial") {
      let cursorX = startX;
      return parts.map((part, index) => {
        const width = editorialWidths[index] || baseChipW;
        const item = {
          ...part,
          x: cursorX,
          y: startY,
          width,
          height: chipH,
        };
        cursorX += width + gap;
        return item;
      });
    }

    return parts.map((part, index) => ({
      ...part,
      x: startX + index * (baseChipW + gap),
      y: startY,
      width: baseChipW,
      height: chipH,
    }));
  }, [
    distribution,
    parts,
    contentBounds.x,
    contentBounds.width,
    startY,
    chipH,
    gap,
    cols,
    startX,
    baseChipW,
    editorialWidths,
  ]);

  const displayTargetWidth = Math.max(220, Math.min(420, toFinite(safeConfig?.tamanoBase, 320)));
  const viewportWidth = Math.max(1, stageViewport.width || displayTargetWidth);
  const viewportHeight = Math.max(1, stageViewport.height || 280);
  const constrainedTargetWidth = Math.min(displayTargetWidth, viewportWidth);
  const stageScale = Math.min(
    1,
    constrainedTargetWidth / containerW,
    viewportHeight / containerH
  );
  const stageWidth = Math.max(1, Math.round(containerW * stageScale));
  const stageHeight = Math.max(1, Math.round(containerH * stageScale));
  const canRenderSeparators = Boolean(
    separator && distribution !== "vertical" && distribution !== "grid"
  );
  const separatorLayouts = useMemo(() => {
    if (!canRenderSeparators || unitLayouts.length < 2) return [];
    return unitLayouts.slice(0, -1).map((item, index) => {
      const next = unitLayouts[index + 1];
      const itemRight = item.x + item.width;
      const midpointX = itemRight + (next.x - itemRight) / 2;
      return {
        key: `${item.unit}-${next.unit}-${index}`,
        x: midpointX,
        y: item.y + Math.max(5, item.height * 0.31),
      };
    });
  }, [canRenderSeparators, unitLayouts]);

  const unitBoxBg = resolveUnitCssValue(
    resolvePreviewPaint(unidad.boxBg, "transparent"),
    "transparent"
  );
  const unitBoxBorder = resolveUnitCssValue(
    resolveCanvasPaint(unidad.boxBorder, "transparent"),
    "transparent"
  );
  const unitBoxRadius = Math.max(0, Math.min(120, Number(unidad.boxRadius || 10)));
  const unitBoxShadow = unidad.boxShadow === true;
  const numberColor = resolvePreviewPaint(
    colors.numberColor || previewPatch.color,
    "#111111"
  );
  const labelColor = resolvePreviewPaint(
    colors.labelColor || previewPatch.labelColor,
    "#4b5563"
  );
  const frameStrokeColor = resolveCanvasPaint(
    previewPatch.frameColor || frameColor,
    "#773dbe"
  );
  const fontFamily = typo.fontFamily || previewPatch.fontFamily || "Poppins";
  const labelTransform = typo.labelTransform || previewPatch.labelTransform || "uppercase";
  const numberTextPaintStyle = buildTextPaintStyle(numberColor, "#111111");
  const labelTextPaintStyle = buildTextPaintStyle(labelColor, "#4b5563");

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
    animations.entry === "fadeUp"
      ? "cd-preview-entry-up"
      : animations.entry === "fadeIn"
        ? "cd-preview-entry-fade"
        : animations.entry === "scaleIn"
          ? "cd-preview-entry-scale"
          : "";

  return (
    <div className="rounded-2xl border border-slate-200 bg-gradient-to-b from-white to-slate-50 p-4">
      <div
        className={`relative overflow-hidden rounded-2xl border border-slate-200 bg-white ${legacyMode ? "" : entryAnimationClass}`}
        style={{ height: "clamp(220px, 44vh, 430px)" }}
      >
        <div
          ref={stageViewportRef}
          className="absolute inset-3 flex items-center justify-center overflow-hidden"
        >
          <div className="relative z-[1]" style={{ width: `${stageWidth}px`, height: `${stageHeight}px` }}>
          <div
            className="relative"
            style={{
              width: `${containerW}px`,
              height: `${containerH}px`,
              transform: `scale(${stageScale})`,
              transformOrigin: "top left",
            }}
          >
            {layoutType === "singleFrame" && frameSvgMarkup ? (
              <div
                aria-hidden="true"
                className={`cd-preview-svg pointer-events-none absolute inset-0 opacity-95 ${canAnimateFrame ? frameAnimationClass : ""}`}
                dangerouslySetInnerHTML={{ __html: frameSvgMarkup }}
              />
            ) : null}

            {layoutType === "singleFrame" && !frameSvgMarkup && safeFrameUrl ? (
              <img
                src={safeFrameUrl}
                alt=""
                aria-hidden="true"
                className={`pointer-events-none absolute inset-0 h-full w-full object-contain opacity-95 ${canAnimateFrame ? frameAnimationClass : ""}`}
                loading="lazy"
                decoding="async"
              />
            ) : null}

            {layoutType === "singleFrame" && !frameSvgMarkup && !safeFrameUrl && previewPatch.frameColor ? (
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0"
                style={{
                  border: `1px solid ${frameStrokeColor}`,
                  borderRadius: `${Math.min(18, Math.round(framePadding * 1.4))}px`,
                }}
              />
            ) : null}

            {unitLayouts.map((item, index) => {
                const pulseClass = pulseToken > 0 ? tickAnimationClass : "";
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
                  {layoutType === "multiUnit" && frameSvgMarkup ? (
                    <div
                      aria-hidden="true"
                      className={`cd-preview-svg pointer-events-none absolute inset-0 opacity-95 ${canAnimateFrame ? frameAnimationClass : ""}`}
                      dangerouslySetInnerHTML={{ __html: frameSvgMarkup }}
                    />
                  ) : null}

                  {layoutType === "multiUnit" && !frameSvgMarkup && safeFrameUrl ? (
                    <img
                      src={safeFrameUrl}
                      alt=""
                      aria-hidden="true"
                      className={`pointer-events-none absolute inset-0 h-full w-full object-contain opacity-95 ${canAnimateFrame ? frameAnimationClass : ""}`}
                      loading="lazy"
                      decoding="async"
                    />
                  ) : null}

                  {layoutType === "multiUnit" && !frameSvgMarkup && !safeFrameUrl && previewPatch.frameColor ? (
                    <div
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-0"
                      style={{
                        border: `1px solid ${frameStrokeColor}`,
                        borderRadius: `${cornerRadius}px`,
                      }}
                    />
                  ) : null}

                  {canDrawBox ? (
                    <div
                      className="absolute inset-0"
                      style={{
                        background: unitBoxBg || "transparent",
                        border: `1px solid ${unitBoxBorder || "transparent"}`,
                        borderRadius: `${cornerRadius}px`,
                        boxShadow: unitBoxShadow ? "0 8px 22px rgba(15,23,42,0.18)" : "none",
                      }}
                    />
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
                  className="pointer-events-none absolute z-[5] font-bold leading-none"
                  style={{
                    left: `${item.x}px`,
                    top: `${item.y}px`,
                    transform: "translateX(-50%)",
                    ...numberTextPaintStyle,
                    fontFamily,
                    fontSize: Math.max(10, Math.round(numberSize * 0.64)),
                  }}
                >
                  {separator}
                </span>
              ))}
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
