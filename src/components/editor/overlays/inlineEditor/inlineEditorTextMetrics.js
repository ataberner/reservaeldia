import { roundMetric } from "@/components/editor/overlays/inlineEditor/inlineEditorNumeric";
import { isBoldFontWeight } from "@/components/editor/textSystem/metricsLayout/services/textFontStyleService";
import {
  buildCanvasFontValue as buildCanvasFontValueShared,
} from "@/components/editor/textSystem/metricsLayout/services/textMeasureService";

export function normalizeInlineFontProps(rawFontStyle, rawFontWeight) {
  const styleToken = String(rawFontStyle || "normal").toLowerCase();
  const weightToken = String(rawFontWeight || "").toLowerCase();

  const italic = styleToken.includes("italic") || styleToken.includes("oblique");
  const boldFromStyle = styleToken.includes("bold");
  const boldFromWeight = isBoldFontWeight(weightToken);
  const bold = boldFromStyle || boldFromWeight;

  return {
    fontStyle: italic ? "italic" : "normal",
    fontWeight: bold ? "bold" : "normal",
  };
}

export function buildCanvasFontValue({ fontStyle, fontWeight, fontSizePx, fontFamily }) {
  return buildCanvasFontValueShared({
    fontStyle,
    fontWeight,
    fontSizePx,
    fontFamily,
  });
}

export function resolveCanvasTextVisualWidth(metrics) {
  const fallbackWidth = Number(metrics?.width || 0);
  const left = Number(metrics?.actualBoundingBoxLeft);
  const right = Number(metrics?.actualBoundingBoxRight);
  if (Number.isFinite(left) && Number.isFinite(right)) {
    const visualWidth = left + right;
    if (Number.isFinite(visualWidth) && visualWidth > 0) return visualWidth;
  }
  return Number.isFinite(fallbackWidth) ? fallbackWidth : 0;
}

export function buildInlineProbeText({
  isSingleLine,
  normalizedValueForSingleLine,
  normalizedValue,
}) {
  return (
    (isSingleLine
      ? normalizedValueForSingleLine
      : (normalizedValue.split(/\r?\n/)[0] || "")
    )
      .replace(/\u200B/g, "")
      .slice(0, 32) || "HgAy"
  );
}

export function measureCanvasInkMetrics({
  fontStyle,
  fontWeight,
  fontSizePx,
  fontFamily,
  probeText,
}) {
  if (typeof document === "undefined") return null;
  try {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.font = buildCanvasFontValue({
      fontStyle,
      fontWeight,
      fontSizePx,
      fontFamily,
    });
    const m = ctx.measureText(probeText || "Hg");
    const ascent = Number(m.actualBoundingBoxAscent || 0);
    const descent = Number(m.actualBoundingBoxDescent || 0);
    const inkHeight = ascent + descent;
    const fontAscent = Number(m.fontBoundingBoxAscent || 0);
    const fontDescent = Number(m.fontBoundingBoxDescent || 0);
    return {
      probeText,
      actualAscentPx: roundMetric(ascent),
      actualDescentPx: roundMetric(descent),
      actualInkHeightPx: roundMetric(inkHeight),
      fontAscentPx: roundMetric(fontAscent),
      fontDescentPx: roundMetric(fontDescent),
      fontBoxHeightPx: roundMetric(fontAscent + fontDescent),
    };
  } catch {
    return null;
  }
}

export function measureKonvaInkProbe({
  fontStyle,
  fontWeight,
  fontSizePx,
  fontFamily,
  lineHeightPx,
  letterSpacingPx,
  probeText,
}) {
  if (typeof document === "undefined") return null;
  const safeLineHeightPx = Number(lineHeightPx);
  if (!Number.isFinite(safeLineHeightPx) || safeLineHeightPx <= 0) return null;
  try {
    const probe = String(probeText || "Hg");
    const font = buildCanvasFontValue({
      fontStyle,
      fontWeight,
      fontSizePx,
      fontFamily,
    });
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;

    ctx.font = font;
    const letterSpacingSafe = Number.isFinite(Number(letterSpacingPx))
      ? Number(letterSpacingPx)
      : 0;
    const textWidthBase = Number(ctx.measureText(probe).width || 0);
    const spacingExtra = Math.max(0, probe.length - 1) * letterSpacingSafe;
    const textWidth = Math.max(1, textWidthBase + spacingExtra);

    const padX = Math.ceil(Math.max(16, fontSizePx * 1.5));
    const padY = Math.ceil(Math.max(16, fontSizePx * 1.5));
    const canvasWidth = Math.max(1, Math.ceil(textWidth + padX * 2 + 4));
    const canvasHeight = Math.max(1, Math.ceil(safeLineHeightPx + padY * 2 + 4));

    canvas.width = canvasWidth;
    canvas.height = canvasHeight;

    const drawCtx = canvas.getContext("2d", { willReadFrequently: true });
    if (!drawCtx) return null;
    drawCtx.font = font;
    drawCtx.fillStyle = "#000000";
    drawCtx.textAlign = "left";
    drawCtx.direction = "ltr";
    drawCtx.clearRect(0, 0, canvasWidth, canvasHeight);

    const fixTextRendering =
      typeof window !== "undefined" && Boolean(window?.Konva?._fixTextRendering);
    const lineTop = padY;
    const mRef = drawCtx.measureText("M");
    const fontBoxAscent = Number(mRef.fontBoundingBoxAscent || 0);
    const fontBoxDescent = Number(mRef.fontBoundingBoxDescent || 0);
    drawCtx.textBaseline = fixTextRendering ? "alphabetic" : "middle";
    const baselineY = fixTextRendering
      ? lineTop + safeLineHeightPx / 2 + (fontBoxAscent - fontBoxDescent) / 2
      : lineTop + safeLineHeightPx / 2;
    let drawX = padX;

    if (Math.abs(letterSpacingSafe) > 0.001) {
      for (const letter of Array.from(probe)) {
        drawCtx.fillText(letter, drawX, baselineY);
        drawX += Number(drawCtx.measureText(letter).width || 0) + letterSpacingSafe;
      }
    } else {
      drawCtx.fillText(probe, drawX, baselineY);
    }

    const sampleY = Math.max(0, Math.floor(lineTop));
    const sampleHeight = Math.max(
      1,
      Math.min(canvasHeight - sampleY, Math.ceil(safeLineHeightPx))
    );
    const imageData = drawCtx.getImageData(0, sampleY, canvasWidth, sampleHeight).data;

    let top = null;
    let bottom = null;
    const alphaThreshold = 8;
    for (let y = 0; y < sampleHeight; y += 1) {
      for (let x = 0; x < canvasWidth; x += 1) {
        const idx = (y * canvasWidth + x) * 4 + 3;
        if (imageData[idx] > alphaThreshold) {
          if (top === null) top = y;
          bottom = y;
          break;
        }
      }
    }
    if (top === null || bottom === null) return null;

    const glyphHeight = bottom - top + 1;
    return {
      probeText: probe,
      hostHeightPx: roundMetric(safeLineHeightPx),
      glyphHeightPx: roundMetric(glyphHeight),
      glyphTopInsetPx: roundMetric(top),
      glyphBottomInsetPx: roundMetric(safeLineHeightPx - (bottom + 1)),
      method: "pixel-scan",
      fixTextRendering,
    };
  } catch {
    return null;
  }
}

export function estimateDomCssInkProbe({
  domInkProbe,
  canvasInkMetrics,
  probeText,
}) {
  const hostHeightPx = Number(domInkProbe?.hostHeightPx);
  if (!Number.isFinite(hostHeightPx)) {
    return null;
  }
  const actualAscent = Number(canvasInkMetrics?.actualAscentPx);
  const actualDescent = Number(canvasInkMetrics?.actualDescentPx);
  const fontAscent = Number(canvasInkMetrics?.fontAscentPx);
  const fontDescent = Number(canvasInkMetrics?.fontDescentPx);
  if (![actualAscent, actualDescent, fontAscent, fontDescent].every(Number.isFinite)) {
    return null;
  }

  // Modelo estructural: CSS line box distribuye leading por arriba/abajo del font-box.
  // Luego convertimos font-box -> ink con deltas de canvas metrics.
  const fontBoxHeightPx = fontAscent + fontDescent;
  const fontBoxTopInsetPx = (hostHeightPx - fontBoxHeightPx) / 2;
  const fontToInkTopPx = fontAscent - actualAscent;
  const fontToInkBottomPx = fontDescent - actualDescent;
  const glyphTopInsetPx = fontBoxTopInsetPx + fontToInkTopPx;
  const glyphBottomInsetPx = fontBoxTopInsetPx + fontToInkBottomPx;
  const glyphHeightPx = hostHeightPx - glyphTopInsetPx - glyphBottomInsetPx;

  return {
    probeText: String(probeText || canvasInkMetrics?.probeText || "HgAy"),
    hostHeightPx: roundMetric(hostHeightPx),
    fontBoxHeightPx: roundMetric(fontBoxHeightPx),
    fontBoxTopInsetPx: roundMetric(fontBoxTopInsetPx),
    glyphHeightPx: roundMetric(glyphHeightPx),
    glyphTopInsetPx: roundMetric(glyphTopInsetPx),
    glyphBottomInsetPx: roundMetric(glyphBottomInsetPx),
    fontToInkTopPx: roundMetric(fontToInkTopPx),
    fontToInkBottomPx: roundMetric(fontToInkBottomPx),
    method: "css-linebox-plus-canvas-ink",
  };
}

export function measureDomInkProbe({
  fontStyle,
  fontWeight,
  fontSizePx,
  fontFamily,
  lineHeightPx,
  letterSpacingPx,
  probeText,
}) {
  if (typeof document === "undefined") return null;
  let host = null;
  try {
    host = document.createElement("div");
    host.style.position = "fixed";
    host.style.left = "-100000px";
    host.style.top = "-100000px";
    host.style.margin = "0";
    host.style.padding = "0";
    host.style.border = "0";
    host.style.whiteSpace = "pre";
    host.style.fontSize = `${fontSizePx}px`;
    host.style.fontFamily = fontFamily || "sans-serif";
    host.style.fontWeight = fontWeight || "normal";
    host.style.fontStyle = fontStyle || "normal";
    host.style.fontOpticalSizing = "none";
    host.style.textRendering = "geometricPrecision";
    host.style.webkitFontSmoothing = "antialiased";
    host.style.mozOsxFontSmoothing = "grayscale";
    host.style.lineHeight = `${lineHeightPx}px`;
    host.style.letterSpacing = `${Number(letterSpacingPx || 0)}px`;
    host.style.boxSizing = "border-box";
    host.style.pointerEvents = "none";
    host.style.userSelect = "none";

    const span = document.createElement("span");
    span.style.margin = "0";
    span.style.padding = "0";
    span.style.border = "0";
    span.style.whiteSpace = "pre";
    span.textContent = probeText || "Hg";
    host.appendChild(span);
    document.body.appendChild(host);

    const hostRect = host.getBoundingClientRect();
    const spanRect = span.getBoundingClientRect();
    return {
      probeText,
      hostHeightPx: roundMetric(hostRect.height),
      glyphHeightPx: roundMetric(spanRect.height),
      glyphTopInsetPx: roundMetric(spanRect.top - hostRect.top),
      glyphBottomInsetPx: roundMetric(hostRect.bottom - spanRect.bottom),
    };
  } catch {
    return null;
  } finally {
    if (host && host.parentNode) {
      host.parentNode.removeChild(host);
    }
  }
}

export function measureDomTextVisualWidth({
  fontStyle,
  fontWeight,
  fontSizePx,
  fontFamily,
  lineHeightPx,
  letterSpacingPx,
  probeText,
}) {
  if (typeof document === "undefined") return null;
  let host = null;
  try {
    host = document.createElement("div");
    host.style.position = "fixed";
    host.style.left = "-100000px";
    host.style.top = "-100000px";
    host.style.margin = "0";
    host.style.padding = "0";
    host.style.border = "0";
    host.style.whiteSpace = "pre";
    host.style.pointerEvents = "none";
    host.style.userSelect = "none";
    host.style.boxSizing = "border-box";

    const span = document.createElement("span");
    span.style.display = "inline-block";
    span.style.margin = "0";
    span.style.padding = "0";
    span.style.border = "0";
    span.style.whiteSpace = "pre";
    span.style.boxSizing = "border-box";
    span.style.fontSize = `${fontSizePx}px`;
    span.style.fontFamily = fontFamily || "sans-serif";
    span.style.fontWeight = fontWeight || "normal";
    span.style.fontStyle = fontStyle || "normal";
    span.style.fontOpticalSizing = "none";
    span.style.textRendering = "geometricPrecision";
    span.style.webkitFontSmoothing = "antialiased";
    span.style.mozOsxFontSmoothing = "grayscale";
    span.style.lineHeight = `${lineHeightPx}px`;
    span.style.letterSpacing = `${Number(letterSpacingPx || 0)}px`;
    span.textContent = String(probeText || "").length > 0 ? String(probeText) : "\u200b";

    host.appendChild(span);
    document.body.appendChild(host);
    const rect = span.getBoundingClientRect();
    if (!Number.isFinite(rect.width)) return null;
    return Number(rect.width);
  } catch {
    return null;
  } finally {
    if (host && host.parentNode) {
      host.parentNode.removeChild(host);
    }
  }
}
