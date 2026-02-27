import { COUNTDOWN_DEFAULT_VISIBLE_UNITS } from "@/domain/countdownPresets/contract";

const UNIT_LABELS = Object.freeze({
  days: "Dias",
  hours: "Horas",
  minutes: "Min",
  seconds: "Seg",
});

function toSafeDate(value) {
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function encodeSvg(svg) {
  return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`;
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

function clamp(value, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return min;
  return Math.max(min, Math.min(max, parsed));
}

function extractFirstColorToken(value, fallback) {
  const safe = String(value || "").trim();
  if (!safe) return fallback;
  const tokenMatch = safe.match(
    /#(?:[0-9a-f]{3,8})\b|rgba?\([^)]+\)|hsla?\([^)]+\)|\b(?:transparent|currentColor|black|white|gray|grey|red|blue|green|yellow|orange|pink|purple)\b/i
  );
  if (!tokenMatch) return fallback;
  return tokenMatch[0];
}

export function resolveCanvasPaint(value, fallback) {
  const safe = String(value || "").trim();
  if (!safe) return fallback;

  if (typeof CSS !== "undefined" && typeof CSS.supports === "function") {
    if (CSS.supports("color", safe)) return safe;
  }

  return extractFirstColorToken(safe, fallback);
}

function roundRectPath(ctx, x, y, w, h, radius) {
  const r = Math.max(0, Math.min(radius, Math.min(w, h) / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

export function normalizeVisibleUnits(units) {
  if (!Array.isArray(units) || units.length === 0) return [...COUNTDOWN_DEFAULT_VISIBLE_UNITS];

  const normalized = units
    .map((unit) => String(unit || "").trim())
    .filter((unit) => UNIT_LABELS[unit]);
  const unique = [];
  normalized.forEach((unit) => {
    if (!unique.includes(unit)) unique.push(unit);
  });
  return unique.length > 0 ? unique : [...COUNTDOWN_DEFAULT_VISIBLE_UNITS];
}

export function estimateCountdownUnitHeight({
  tamanoBase = 320,
  distribution = "centered",
  unitsCount = 4,
} = {}) {
  const base = clamp(tamanoBase, 220, 640);
  const count = Math.max(1, Math.min(4, Number(unitsCount || 4)));
  const mode = String(distribution || "centered").toLowerCase();

  if (mode === "vertical") return Math.max(44, Math.round(base * 0.17));
  if (mode === "grid") return Math.max(44, Math.round(base * 0.2));
  if (mode === "editorial") return Math.max(44, Math.round(base * 0.16));

  const centeredScale =
    count <= 1 ? 0.34 : count === 2 ? 0.24 : count === 3 ? 0.18 : 0.15;
  return Math.max(44, Math.round(base * centeredScale));
}

export function buildFrameSvgMarkup(svgText, { colorMode, frameColor }) {
  if (!svgText || typeof svgText !== "string") return "";

  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(svgText, "image/svg+xml");
    const parserError = doc.querySelector("parsererror");
    if (parserError) return "";

    const root = doc.documentElement;
    if (!root || String(root.tagName || "").toLowerCase() !== "svg") return "";

    const currentStyle = root.getAttribute("style") || "";
    const styleParts = [currentStyle, "display:block", "width:100%", "height:100%"];

    if (colorMode === "currentColor") {
      styleParts.push(`color:${frameColor}`);
      root.setAttribute("color", frameColor);
    }

    root.setAttribute("style", styleParts.filter(Boolean).join(";"));
    root.setAttribute("width", "100%");
    root.setAttribute("height", "100%");
    root.setAttribute("preserveAspectRatio", "xMidYMid meet");

    return new XMLSerializer().serializeToString(root);
  } catch {
    return "";
  }
}

export function transformLabel(label, transformMode) {
  const safe = String(label || "");
  if (transformMode === "uppercase") return safe.toUpperCase();
  if (transformMode === "lowercase") return safe.toLowerCase();
  if (transformMode === "capitalize") {
    return safe.replace(/\b\w/g, (match) => match.toUpperCase());
  }
  return safe;
}

export function getCountdownParts(targetISO, units) {
  const targetDate = toSafeDate(targetISO);
  if (!targetDate) {
    return normalizeVisibleUnits(units).map((unit) => ({
      unit,
      label: UNIT_LABELS[unit],
      value: "00",
    }));
  }

  const now = Date.now();
  const diffMs = Math.max(0, targetDate.getTime() - now);
  const days = Math.floor(diffMs / 86400000);
  const hours = Math.floor((diffMs % 86400000) / 3600000);
  const minutes = Math.floor((diffMs % 3600000) / 60000);
  const seconds = Math.floor((diffMs % 60000) / 1000);

  const map = { days, hours, minutes, seconds };
  return normalizeVisibleUnits(units).map((unit) => ({
    unit,
    label: UNIT_LABELS[unit],
    value: String(map[unit] || 0).padStart(2, "0"),
  }));
}

export function resolvePreviewDistributionStyle(distribution, unitCount) {
  const safeCount = Math.max(1, Number(unitCount || 1));

  if (distribution === "vertical") {
    return {
      display: "grid",
      gridTemplateColumns: "1fr",
      gap: "10px",
    };
  }

  if (distribution === "grid") {
    const cols = safeCount <= 2 ? safeCount : 2;
    return {
      display: "grid",
      gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
      gap: "10px",
    };
  }

  if (distribution === "editorial") {
    return {
      display: "grid",
      gridTemplateColumns: safeCount > 2 ? "2fr 1fr 1fr" : `repeat(${safeCount}, minmax(0, 1fr))`,
      gap: "10px",
    };
  }

  return {
    display: "grid",
    gridTemplateColumns: `repeat(${safeCount}, minmax(0, 1fr))`,
    gap: "10px",
  };
}

export function createFutureDateISO(daysAhead = 30) {
  const days = Number.isFinite(Number(daysAhead)) ? Number(daysAhead) : 30;
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

export async function generateCountdownThumbnailDataUrl({
  config,
  svgText,
  svgColorMode = "fixed",
  frameColor = "#773dbe",
  size = 320,
  targetISO,
}) {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  ctx.clearRect(0, 0, size, size);
  const baseConfig = config || {};
  const units = normalizeVisibleUnits(baseConfig?.layout?.visibleUnits);
  const parts = getCountdownParts(targetISO || createFutureDateISO(15), units);
  const isSingleFrame = baseConfig?.layout?.type === "singleFrame";
  const unitStyle = baseConfig?.unidad || {};
  const showLabels = unitStyle.showLabels !== false;
  const separator = String(unitStyle.separator || "").slice(0, 3);
  const boxBg = resolveCanvasPaint(unitStyle.boxBg, "transparent");
  const boxBorder = resolveCanvasPaint(unitStyle.boxBorder, "transparent");
  const boxRadius = clamp(unitStyle.boxRadius, 0, 120);
  const boxShadow = unitStyle.boxShadow === true;
  let frameImage = null;

  if (svgText) {
    try {
      const coloredSvg = buildFrameSvgMarkup(svgText, {
        colorMode: svgColorMode,
        frameColor,
      });
      const frameSrc = encodeSvg(coloredSvg);
      frameImage = await loadImage(frameSrc);
      const frameSize = Math.round(size * 0.9);
      const frameOffset = Math.round((size - frameSize) / 2);
      if (isSingleFrame) {
        ctx.drawImage(frameImage, frameOffset, frameOffset, frameSize, frameSize);
      }
    } catch {
      // Non-blocking for thumbnail generation.
    }
  }

  const distribution = baseConfig?.layout?.distribution || "centered";
  const gap = 8;
  const areaWidth = Math.round(size * 0.82);
  const areaX = Math.round((size - areaWidth) / 2);
  const chipH = Math.round(size * 0.22);
  const numberSize = Math.max(10, Math.min(120, Number(baseConfig?.tipografia?.numberSize) || 28));
  const labelSize = Math.max(8, Math.min(72, Number(baseConfig?.tipografia?.labelSize) || 11));
  const fontFamily = String(baseConfig?.tipografia?.fontFamily || "Poppins");
  const numberColor = String(baseConfig?.colores?.numberColor || "#111111");
  const labelColor = String(baseConfig?.colores?.labelColor || "#4b5563");
  const framePadding = Math.max(0, Number(baseConfig?.layout?.framePadding) || 10);
  const chipCount = Math.max(1, parts.length);

  const cols = distribution === "grid" ? Math.min(2, chipCount) : chipCount;
  const rows = distribution === "vertical" ? chipCount : distribution === "grid" ? Math.ceil(chipCount / cols) : 1;
  const chipW = Math.round((areaWidth - gap * (cols - 1)) / cols);
  const gridTotalH = rows * chipH + (rows - 1) * gap;
  const areaY = Math.round((size - gridTotalH) / 2);
  const canUseSeparators = separator && distribution !== "vertical" && distribution !== "grid";

  parts.forEach((part, index) => {
    const row = distribution === "vertical" ? index : distribution === "grid" ? Math.floor(index / cols) : 0;
    const col = distribution === "vertical" ? 0 : distribution === "grid" ? index % cols : index;
    const x = areaX + col * (chipW + gap);
    const y = areaY + row * (chipH + gap);

    if (baseConfig?.layout?.type === "multiUnit") {
      if (frameImage) {
        ctx.drawImage(frameImage, x, y, chipW, chipH);
      } else {
        ctx.strokeStyle = frameColor;
        ctx.lineWidth = 1.2;
        ctx.strokeRect(x, y, chipW, chipH);
      }
    } else if (!isSingleFrame) {
      ctx.strokeStyle = frameColor;
      ctx.lineWidth = 1.2;
      ctx.strokeRect(x, y, chipW, chipH);
    }

    if (boxShadow) {
      ctx.shadowColor = "rgba(15,23,42,0.18)";
      ctx.shadowBlur = 6;
      ctx.shadowOffsetY = 2;
    } else {
      ctx.shadowColor = "transparent";
      ctx.shadowBlur = 0;
      ctx.shadowOffsetY = 0;
    }

    roundRectPath(ctx, x, y, chipW, chipH, boxRadius);
    if (boxBg !== "transparent") {
      ctx.fillStyle = boxBg;
      ctx.fill();
    }
    if (boxBorder !== "transparent") {
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = boxBorder;
      ctx.stroke();
    }
    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;

    const valueY = showLabels ? y + chipH / 2 - labelSize * 0.35 : y + chipH / 2;

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = numberColor;
    ctx.font = `700 ${numberSize}px ${fontFamily}, sans-serif`;
    ctx.fillText(part.value, x + chipW / 2, valueY);

    if (showLabels) {
      ctx.fillStyle = labelColor;
      ctx.font = `500 ${labelSize}px ${fontFamily}, sans-serif`;
      const labelTransform = baseConfig?.tipografia?.labelTransform || "uppercase";
      ctx.fillText(
        transformLabel(part.label, labelTransform),
        x + chipW / 2,
        y + chipH / 2 + labelSize + framePadding * 0.02
      );
    }

    if (canUseSeparators && index < parts.length - 1) {
      ctx.fillStyle = numberColor;
      ctx.font = `700 ${Math.max(12, Math.round(numberSize * 0.62))}px ${fontFamily}, sans-serif`;
      ctx.fillText(separator, x + chipW + gap * 0.5, y + chipH / 2 - 1);
    }
  });

  return canvas.toDataURL("image/png", 0.92);
}
