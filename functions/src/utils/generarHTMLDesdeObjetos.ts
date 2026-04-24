import { LINE_CONSTANTS } from "../models/lineConstants";
import { resolveRsvpButtonVisual } from "../rsvp/buttonStyles";
import {
  getFunctionalCtaContractForObjectType,
  type FunctionalCtaContract,
} from "./functionalCtaContract";
import { resolvePublishImageCropState } from "./publishImageCrop";

const {
  normalizeGalleryLayoutMode,
  normalizeGalleryLayoutType,
  resolveGalleryRenderLayout,
} = require("../../shared/templates/galleryDynamicLayout.cjs");
const {
  normalizeRenderAssetObject,
} = require("../../shared/renderAssetContract.cjs");
const {
  classifyRenderObjectContract,
  resolveCountdownContract,
  resolveCountdownTargetIso,
} = require("../../shared/renderContractPolicy.cjs");

// ✅ Escapar strings para meterlos en atributos/HTML
function escHTML(str: any = ""): string {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function escapeAttr(str: string = ""): string {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

const MOTION_EFFECT_VALUES = new Set(["none", "reveal", "draw", "zoom", "hover", "pulse", "rsvp"]);
const MOBILE_TEXT_SCALE_MODE_VALUES = new Set(["inherit", "lock", "custom"]);
const MOBILE_TEXT_SCALE_CAP_MIN = 1;
const MOBILE_TEXT_SCALE_CAP_MAX = 1.15;
const UNSAFE_CSS_TOKEN = /[<>;]/;
const UNSAFE_CSS_PATTERN = /(url\s*\(|javascript:|expression\s*\()/i;
const SAFE_CSS_PAINT = /^[#(),.%\-+\s\w:/]*$/i;

function sanitizeCssPaint(value: any, fallback: string): string {
  const safe = String(value || "").trim();
  if (!safe) return fallback;
  if (UNSAFE_CSS_TOKEN.test(safe) || UNSAFE_CSS_PATTERN.test(safe)) return fallback;
  if (!SAFE_CSS_PAINT.test(safe)) return fallback;
  return safe;
}

function isLinearGradientPaint(value: string): boolean {
  const safe = String(value || "").trim().toLowerCase();
  return safe.startsWith("linear-gradient(") && safe.endsWith(")");
}

function buildTextPaintStyleCss(value: any, fallback: string): string {
  const safePaint = sanitizeCssPaint(value, fallback);
  if (!isLinearGradientPaint(safePaint)) return `color: ${safePaint};`;

  return `
background-image: ${safePaint};
background-clip: text;
-webkit-background-clip: text;
color: transparent;
-webkit-text-fill-color: transparent;
display: inline-block;
`.trim();
}

function sanitizeMotionEffect(value: any): string {
  const normalized = String(value || "").trim().toLowerCase();
  return MOTION_EFFECT_VALUES.has(normalized) ? normalized : "none";
}

function sanitizeMobileTextScaleMode(value: any): "inherit" | "lock" | "custom" {
  const normalized = String(value || "").trim().toLowerCase();
  if (!MOBILE_TEXT_SCALE_MODE_VALUES.has(normalized)) return "inherit";
  return normalized as "inherit" | "lock" | "custom";
}

function sanitizeMobileTextScaleMax(value: any): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return MOBILE_TEXT_SCALE_CAP_MAX;
  return Math.max(MOBILE_TEXT_SCALE_CAP_MIN, Math.min(MOBILE_TEXT_SCALE_CAP_MAX, numeric));
}

function toCssNumber(value: number): string {
  return String(Math.round(value * 1000) / 1000);
}

const COUNTDOWN_UNIT_LABELS = Object.freeze({
  days: "Dias",
  hours: "Horas",
  minutes: "Min",
  seconds: "Seg",
});

const COUNTDOWN_DEFAULT_VISIBLE_UNITS = Object.freeze(["days", "hours", "minutes", "seconds"]);

function clampNumber(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function toFiniteNumber(value: any, fallback: number): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function normalizeCountdownUnits(value: any): string[] {
  if (!Array.isArray(value) || value.length === 0) return [...COUNTDOWN_DEFAULT_VISIBLE_UNITS];

  const normalized = value
    .map((unit) => String(unit || "").trim())
    .filter((unit) => Object.prototype.hasOwnProperty.call(COUNTDOWN_UNIT_LABELS, unit));

  const unique: string[] = [];
  normalized.forEach((unit) => {
    if (!unique.includes(unit)) unique.push(unit);
  });

  return unique.length > 0 ? unique : [...COUNTDOWN_DEFAULT_VISIBLE_UNITS];
}

function estimateCountdownUnitHeightLikeCanvas({
  tamanoBase = 320,
  distribution = "centered",
  unitsCount = 4,
}: {
  tamanoBase?: any;
  distribution?: any;
  unitsCount?: any;
} = {}): number {
  const base = clampNumber(toFiniteNumber(tamanoBase, 320), 220, 960);
  const count = Math.max(1, Math.min(4, Number(unitsCount || 4)));
  const mode = String(distribution || "centered").toLowerCase();

  if (mode === "vertical") return Math.max(44, Math.round(base * 0.17));
  if (mode === "grid") return Math.max(44, Math.round(base * 0.2));
  if (mode === "editorial") return Math.max(44, Math.round(base * 0.16));

  const centeredScale =
    count <= 1 ? 0.34 : count === 2 ? 0.24 : count === 3 ? 0.18 : 0.15;
  return Math.max(44, Math.round(base * centeredScale));
}

function resolveCountdownUnitWidthLikeCanvas({
  width = 46,
  height = 44,
  boxRadius = 0,
}: {
  width?: any;
  height?: any;
  boxRadius?: any;
} = {}): number {
  const safeWidth = Math.max(1, toFiniteNumber(width, 46));
  const safeHeight = Math.max(1, toFiniteNumber(height, 44));
  const safeRadius = clampNumber(toFiniteNumber(boxRadius, 0), 0, 999);
  const roundedThreshold = safeHeight / 2;

  if (safeWidth <= safeHeight || safeRadius <= roundedThreshold) {
    return Math.round(safeWidth);
  }

  const circleThreshold = safeHeight;
  const blend =
    circleThreshold <= roundedThreshold
      ? 1
      : clampNumber(
          (safeRadius - roundedThreshold) / (circleThreshold - roundedThreshold),
          0,
          1
        );

  return Math.round(safeWidth + (safeHeight - safeWidth) * blend);
}

function transformCountdownLabel(label: string, transformMode: string): string {
  const safe = String(label || "");
  if (transformMode === "uppercase") return safe.toUpperCase();
  if (transformMode === "lowercase") return safe.toLowerCase();
  if (transformMode === "capitalize") {
    return safe.replace(/\b\w/g, (match) => match.toUpperCase());
  }
  return safe;
}

function buildCountdownLayoutMetrics(obj: any) {
  const units = normalizeCountdownUnits(obj?.visibleUnits);
  const unitsCount = Math.max(1, units.length);
  const frameSvgUrl = String(obj?.frameSvgUrl || "").trim();
  const hasFrameConfigured = frameSvgUrl.length > 0;
  const distribution = String(obj?.distribution || obj?.layoutType || "centered").toLowerCase();
  const layoutType = String(obj?.layoutType || "singleFrame").toLowerCase();
  const useSingleFrameLayout = layoutType === "singleframe" && hasFrameConfigured;
  const useMultiUnitFrame = layoutType === "multiunit" && hasFrameConfigured;
  const gap = Math.max(0, toFiniteNumber(obj?.gap, 8));
  const framePadding = Math.max(0, toFiniteNumber(obj?.framePadding, 10));
  const paddingY = Math.max(2, toFiniteNumber(obj?.paddingY, 6));
  const paddingX = Math.max(2, toFiniteNumber(obj?.paddingX, 8));
  const valueSize = Math.max(10, toFiniteNumber(obj?.fontSize, 16));
  const labelSize = Math.max(8, toFiniteNumber(obj?.labelSize, 10));
  const showLabels = obj?.showLabels !== false;
  const unitBoxRadius = Math.max(0, toFiniteNumber(obj?.boxRadius, 8));
  const requestedChipW = Math.max(36, toFiniteNumber(obj?.chipWidth, 46) + paddingX * 2);
  const textDrivenChipH = Math.max(
    44,
    paddingY * 2 + valueSize + (showLabels ? labelSize + 6 : 0)
  );
  const layoutDrivenChipH = estimateCountdownUnitHeightLikeCanvas({
    tamanoBase: toFiniteNumber(obj?.tamanoBase, 320),
    distribution,
    unitsCount,
  });
  const chipH = Math.max(textDrivenChipH, layoutDrivenChipH);
  const baseChipW = resolveCountdownUnitWidthLikeCanvas({
    width: requestedChipW,
    height: chipH,
    boxRadius: unitBoxRadius,
  });

  const cols =
    distribution === "vertical"
      ? 1
      : distribution === "grid"
        ? Math.min(2, unitsCount)
        : unitsCount;
  const rows =
    distribution === "vertical"
      ? unitsCount
      : distribution === "grid"
        ? Math.ceil(unitsCount / cols)
        : 1;

  const editorialWidths =
    distribution === "editorial"
      ? Array.from({ length: unitsCount }, (_, index) =>
          resolveCountdownUnitWidthLikeCanvas({
            width: Math.max(34, Math.round(baseChipW * (index === 0 && unitsCount > 1 ? 1.25 : 0.88))),
            height: chipH,
            boxRadius: unitBoxRadius,
          })
        )
      : [];

  const naturalW =
    distribution === "vertical"
      ? baseChipW
      : distribution === "grid"
        ? cols * baseChipW + gap * (cols - 1)
        : distribution === "editorial"
          ? editorialWidths.reduce((acc, width) => acc + width, 0) + gap * Math.max(0, unitsCount - 1)
          : unitsCount * baseChipW + gap * (unitsCount - 1);

  const naturalH =
    distribution === "vertical" || distribution === "grid"
      ? rows * chipH + gap * Math.max(0, rows - 1)
      : chipH;

  const containerW = Math.max(
    toFiniteNumber(obj?.width, 0),
    naturalW + (useSingleFrameLayout ? framePadding * 2 : 0)
  );
  const containerH = Math.max(
    toFiniteNumber(obj?.height, 0),
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
      ? rows * chipH + gap * Math.max(0, rows - 1)
      : chipH;

  const startX = contentBounds.x + (contentBounds.width - distributionW) / 2;
  const startY = contentBounds.y + (contentBounds.height - distributionH) / 2;

  const unitLayouts =
    distribution === "vertical"
      ? units.map((unit, index) => ({
          unit,
          x: contentBounds.x + (contentBounds.width - baseChipW) / 2,
          y: startY + index * (chipH + gap),
          width: baseChipW,
          height: chipH,
        }))
      : distribution === "grid"
        ? units.map((unit, index) => {
            const row = Math.floor(index / cols);
            const col = index % cols;
            return {
              unit,
              x: startX + col * (baseChipW + gap),
              y: startY + row * (chipH + gap),
              width: baseChipW,
              height: chipH,
            };
          })
        : distribution === "editorial"
          ? (() => {
              let cursorX = startX;
              return units.map((unit, index) => {
                const width = editorialWidths[index] || baseChipW;
                const item = {
                  unit,
                  x: cursorX,
                  y: startY,
                  width,
                  height: chipH,
                };
                cursorX += width + gap;
                return item;
              });
            })()
          : units.map((unit, index) => ({
              unit,
              x: startX + index * (baseChipW + gap),
              y: startY,
              width: baseChipW,
              height: chipH,
            }));

  const separatorText = String(obj?.separator || "");
  const separatorFontSize = Math.max(10, Math.round(valueSize * 0.64));
  const canRenderSeparators = Boolean(
    separatorText && distribution !== "vertical" && distribution !== "grid" && unitLayouts.length > 1
  );
  const separatorLayouts = canRenderSeparators
    ? unitLayouts.slice(0, -1).map((item, index) => {
        const next = unitLayouts[index + 1];
        const itemRight = item.x + item.width;
        const midpointX = itemRight + (next.x - itemRight) / 2;
        const width = Math.max(12, Math.round(separatorFontSize * 1.4));
        return {
          key: `${item.unit}-${next.unit}-${index}`,
          x: midpointX - width / 2,
          y: item.y + Math.max(4, item.height * 0.3),
          width,
        };
      })
    : [];

  return {
    units,
    distribution,
    layoutType,
    frameSvgUrl,
    hasFrameConfigured,
    useSingleFrameLayout,
    useMultiUnitFrame,
    gap,
    framePadding,
    paddingX,
    paddingY,
    chipWidth: toFiniteNumber(obj?.chipWidth, 46),
    showLabels,
    boxRadius: unitBoxRadius,
    valueSize,
    labelSize,
    chipH,
    baseChipW,
    naturalW,
    naturalH,
    containerW,
    containerH,
    startX,
    startY,
    unitLayouts,
    separatorText,
    separatorFontSize,
    separatorLayouts,
  };
}

function formatShapePercent(value: number): string {
  return `${Math.round(value * 1000) / 10}%`;
}

function buildRegularPolygonClipPath(sides: number): string {
  const totalSides = Math.max(3, Math.round(Number(sides) || 3));
  const points: string[] = [];

  for (let i = 0; i < totalSides; i += 1) {
    const angle = -Math.PI / 2 + (i * (Math.PI * 2)) / totalSides;
    const x = 50 + Math.cos(angle) * 50;
    const y = 50 + Math.sin(angle) * 50;
    points.push(`${formatShapePercent(x)} ${formatShapePercent(y)}`);
  }

  return points.join(", ");
}

function buildStarClipPath(innerRatio = 0.45): string {
  const points: string[] = [];

  for (let i = 0; i < 10; i += 1) {
    const angle = -Math.PI / 2 + (i * Math.PI) / 5;
    const radius = i % 2 === 0 ? 50 : 50 * innerRatio;
    const x = 50 + Math.cos(angle) * radius;
    const y = 50 + Math.sin(angle) * radius;
    points.push(`${formatShapePercent(x)} ${formatShapePercent(y)}`);
  }

  return points.join(", ");
}

function buildHeartMaskDataUri(): string {
  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" preserveAspectRatio="none">
  <path fill="white" d="M 50 84 C 8 58, 14 25, 34 25 C 42 25, 47 30, 50 36 C 53 30, 58 25, 66 25 C 86 25, 92 58, 50 84 Z" />
</svg>
`.trim();

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function buildSvgPolygonPoints(values: number[]): string {
  const safeValues = Array.isArray(values) ? values : [];
  const pairs: string[] = [];

  for (let index = 0; index < safeValues.length; index += 2) {
    const x = Number(safeValues[index]);
    const y = Number(safeValues[index + 1]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    pairs.push(`${toCssNumber(x)},${toCssNumber(y)}`);
  }

  return pairs.join(" ");
}

function buildRegularPolygonSvgPoints(sides: number, width: number, height: number): string {
  const totalSides = Math.max(3, Math.round(Number(sides) || 3));
  const cx = width / 2;
  const cy = height / 2;
  const rx = width / 2;
  const ry = height / 2;
  const points: number[] = [];

  for (let index = 0; index < totalSides; index += 1) {
    const angle = -Math.PI / 2 + (index * (Math.PI * 2)) / totalSides;
    points.push(cx + Math.cos(angle) * rx, cy + Math.sin(angle) * ry);
  }

  return buildSvgPolygonPoints(points);
}

function buildStarSvgPoints(width: number, height: number, innerRatio = 0.45): string {
  const cx = width / 2;
  const cy = height / 2;
  const outerX = width / 2;
  const outerY = height / 2;
  const innerX = outerX * innerRatio;
  const innerY = outerY * innerRatio;
  const points: number[] = [];

  for (let index = 0; index < 10; index += 1) {
    const angle = -Math.PI / 2 + (index * Math.PI) / 5;
    const radiusX = index % 2 === 0 ? outerX : innerX;
    const radiusY = index % 2 === 0 ? outerY : innerY;
    points.push(cx + Math.cos(angle) * radiusX, cy + Math.sin(angle) * radiusY);
  }

  return buildSvgPolygonPoints(points);
}

function buildDiamondSvgPoints(width: number, height: number): string {
  return buildSvgPolygonPoints([width / 2, 0, width, height / 2, width / 2, height, 0, height / 2]);
}

function buildArrowSvgPoints(width: number, height: number): string {
  return buildSvgPolygonPoints([
    0, height * 0.34,
    width * 0.6, height * 0.34,
    width * 0.6, 0,
    width, height / 2,
    width * 0.6, height,
    width * 0.6, height * 0.66,
    0, height * 0.66,
  ]);
}

function buildHeartSvgPath(width: number, height: number): string {
  const w = Math.max(1, width);
  const h = Math.max(1, height);

  return `M ${toCssNumber(w * 0.5)} ${toCssNumber(h * 0.84)}
    C ${toCssNumber(w * 0.08)} ${toCssNumber(h * 0.58)}, ${toCssNumber(w * 0.14)} ${toCssNumber(h * 0.25)}, ${toCssNumber(w * 0.34)} ${toCssNumber(h * 0.25)}
    C ${toCssNumber(w * 0.42)} ${toCssNumber(h * 0.25)}, ${toCssNumber(w * 0.47)} ${toCssNumber(h * 0.30)}, ${toCssNumber(w * 0.5)} ${toCssNumber(h * 0.36)}
    C ${toCssNumber(w * 0.53)} ${toCssNumber(h * 0.30)}, ${toCssNumber(w * 0.58)} ${toCssNumber(h * 0.25)}, ${toCssNumber(w * 0.66)} ${toCssNumber(h * 0.25)}
    C ${toCssNumber(w * 0.86)} ${toCssNumber(h * 0.25)}, ${toCssNumber(w * 0.92)} ${toCssNumber(h * 0.58)}, ${toCssNumber(w * 0.5)} ${toCssNumber(h * 0.84)}
    Z`;
}

function splitGradientArguments(input: string): string[] {
  const chunks: string[] = [];
  let current = "";
  let depth = 0;

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    if (char === "(") depth += 1;
    if (char === ")") depth = Math.max(0, depth - 1);

    if (char === "," && depth === 0) {
      chunks.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  if (current.trim().length > 0) {
    chunks.push(current.trim());
  }

  return chunks;
}

function isGradientDirectionToken(token: string): boolean {
  const normalized = String(token || "").trim().toLowerCase();
  if (!normalized) return false;
  if (normalized.startsWith("to ")) return true;
  return (
    normalized.endsWith("deg") ||
    normalized.endsWith("rad") ||
    normalized.endsWith("turn")
  );
}

function stripGradientColorStop(token: string): string {
  const safe = String(token || "").trim();
  if (!safe) return "";

  const cleaned = safe.replace(
    /\s+(-?\d+(?:\.\d+)?%?)(?:\s+(-?\d+(?:\.\d+)?%?))?\s*$/i,
    ""
  );
  return cleaned.trim() || safe;
}

function parseLinearGradientPaint(value: string): { from: string; to: string } | null {
  const safe = String(value || "").trim();
  if (!isLinearGradientPaint(safe)) return null;

  const inner = safe.slice("linear-gradient(".length, -1).trim();
  if (!inner) return null;

  const rawArgs = splitGradientArguments(inner);
  if (rawArgs.length < 2) return null;

  const colorArgs = isGradientDirectionToken(rawArgs[0]) ? rawArgs.slice(1) : rawArgs;
  if (colorArgs.length < 2) return null;

  const from = stripGradientColorStop(colorArgs[0]);
  const to = stripGradientColorStop(colorArgs[1]);
  if (!from || !to) return null;

  return { from, to };
}


function normalizeRoleValue(value: any): string {
  return String(value || "").trim().toLowerCase();
}

function mapObjToDataType(obj: any): string {
  const tipo = normalizeRoleValue(obj?.tipo);
  const figura = normalizeRoleValue(obj?.figura);

  if (tipo === "grupo" || tipo === "group") return "group";
  if (tipo === "texto" || tipo === "text") return "text";
  if (tipo === "imagen" || tipo === "image") return "image";
  if (tipo === "icono" || tipo === "icono-svg" || tipo === "icon") return "icon";
  if (tipo === "galeria" || tipo === "gallery") return "gallery";
  if (tipo === "countdown") return "countdown";
  if (tipo === "rsvp-boton" || tipo === "regalo-boton" || tipo === "rsvp") return "rsvp";
  if (tipo === "button" || tipo === "boton") return "button";
  if (tipo === "line" || tipo === "divider") return "divider";
  if (tipo === "forma" && figura === "line") return "divider";
  if (tipo === "forma") return "shape";

  return "unknown";
}

function inferDataRole(obj: any): string {
  const explicitRole = normalizeRoleValue(obj?.role || obj?.rol);
  if (explicitRole) return explicitRole;

  const type = mapObjToDataType(obj);
  if (type === "text") {
    const fontSize = Number(obj?.fontSize);
    if (Number.isFinite(fontSize) && fontSize >= 30) return "title";
    if (Number.isFinite(fontSize) && fontSize >= 22) return "subtitle";
    return "body";
  }

  if (type === "divider") return "divider";
  if (type === "image") return "image";
  if (type === "icon") return "icon";
  if (type === "group") return "group";
  if (type === "gallery") return "gallery";
  if (type === "countdown") return "countdown";
  if (type === "rsvp" || type === "button") return "cta";
  if (type === "shape") return "decorative";

  return "content";
}

function buildMotionDataAttrs(
  obj: any,
  {
    includeObjId = true,
    extraAttrs = {},
  }: {
    includeObjId?: boolean;
    extraAttrs?: Record<string, string | null | undefined>;
  } = {}
): string {
  const dataType = escapeAttr(mapObjToDataType(obj));
  const dataRole = escapeAttr(inferDataRole(obj));
  const dataMotion = escapeAttr(sanitizeMotionEffect(obj?.motionEffect));
  const dataObjId = escapeAttr(String(obj?.id || "").trim());
  const serializedExtraAttrs = Object.entries(extraAttrs || {})
    .map(([key, value]) => {
      const safeKey = String(key || "").trim();
      if (!safeKey) return "";
      const safeValue = String(value || "").trim();
      if (!safeValue) return "";
      return `${safeKey}="${escapeAttr(safeValue)}"`;
    })
    .filter(Boolean)
    .join(" ");

  return [
    `data-type="${dataType}"`,
    `data-role="${dataRole}"`,
    `data-motion="${dataMotion}"`,
    includeObjId && dataObjId ? `data-obj-id="${dataObjId}"` : "",
    serializedExtraAttrs,
  ]
    .filter(Boolean)
    .join(" ");
}

function appendMotionDataAttrs(
  htmlElemento: string,
  obj: any,
  options: {
    includeObjId?: boolean;
    extraAttrs?: Record<string, string | null | undefined>;
  } = {}
): string {
  if (!htmlElemento || typeof htmlElemento !== "string") return htmlElemento;

  const attrs = buildMotionDataAttrs(obj, options);
  return htmlElemento.replace(/(<(?:div|img|svg)\b)/i, `$1 ${attrs} `);
}

function roundCountdownAuditMetric(value: any): number | null {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return Math.round(numeric * 1000) / 1000;
}

function compactCountdownAuditUnitLayouts(value: any): Array<Record<string, any>> {
  if (!Array.isArray(value)) return [];
  return value.map((item: any, index: number) => ({
    key: String(item?.key || item?.unit || index),
    unit: String(item?.unit || item?.key || ""),
    x: roundCountdownAuditMetric(item?.x),
    y: roundCountdownAuditMetric(item?.y),
    width: roundCountdownAuditMetric(item?.width),
    height: roundCountdownAuditMetric(item?.height),
  }));
}

function compactCountdownAuditSeparatorLayouts(value: any): Array<Record<string, any>> {
  if (!Array.isArray(value)) return [];
  return value.map((item: any, index: number) => ({
    key: String(item?.key || index),
    x: roundCountdownAuditMetric(item?.x),
    y: roundCountdownAuditMetric(item?.y),
    width: roundCountdownAuditMetric(item?.width),
  }));
}

function resolveCountdownAuditMeta(obj: any) {
  const traceId = String(obj?.countdownAuditTraceId || "").trim();
  const fixture = String(obj?.countdownAuditFixture || "").trim();
  const label = String(obj?.countdownAuditLabel || "").trim();

  return {
    traceId: traceId || null,
    fixture: fixture || null,
    label: label || null,
  };
}

function buildCountdownAuditAttrs(obj: any, payload: Record<string, any> | null): string {
  const meta = resolveCountdownAuditMeta(obj);
  if (!meta.traceId || !payload) return "";

  const serialized = escapeAttr(
    JSON.stringify({
      ...payload,
      fixture: meta.fixture,
      label: meta.label,
      sourceDocument: "generated-html",
      renderer: "dom-generated",
      wrapperScale: 1,
      usesRasterThumbnail: false,
    })
  );

  return ` data-countdown-audit-trace-id="${escapeAttr(meta.traceId)}" data-countdown-audit-payload="${serialized}"`;
}

function getLinkProps(obj: any) {
  const raw = obj?.enlace;
  if (!raw) return null;

  if (typeof raw === "string") {
    const href = escapeAttr(raw);
    if (!href) return null;
    return { href, target: "_blank", rel: "noopener noreferrer" };
  }

  const href = escapeAttr(raw.href || "");
  if (!href) return null;

  const target = escapeAttr(raw.target || "_blank");
  const rel = escapeAttr(raw.rel || "noopener noreferrer");
  return { href, target, rel };
}

function envolverSiEnlace(
  htmlElemento: string,
  obj: any,
  options: {
    includeObjId?: boolean;
    extraAttrs?: Record<string, string | null | undefined>;
    allowLinkWrap?: boolean;
  } = {}
): string {
  const htmlConData = appendMotionDataAttrs(htmlElemento, obj, {
    includeObjId: options.includeObjId,
    extraAttrs: options.extraAttrs,
  });
  if (obj?.tipo === "rsvp-boton" || obj?.tipo === "regalo-boton") return htmlConData;
  if (options.allowLinkWrap === false) return htmlConData;

  const link = getLinkProps(obj);
  if (!link) return htmlConData;

  return `<a href="${link.href}" target="${link.target}" rel="${link.rel}" style="text-decoration:none;color:inherit;display:contents">${htmlConData}</a>`;
}

export function escapeHTML(texto: string = ""): string {
  return texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

type GenerarHTMLDesdeObjetosOptions = {
  functionalCtaContract?: FunctionalCtaContract | null;
  renderMode?: "top-level" | "group-child";
  inheritedSectionId?: string | null;
  inheritedAnchor?: string | null;
  groupId?: string | null;
};

export function generarHTMLDesdeObjetos(
  objetos: any[],
  _secciones: any[],
  options: GenerarHTMLDesdeObjetosOptions = {}
): string {
  const renderMode = options.renderMode === "group-child" ? "group-child" : "top-level";
  const isGroupChildRender = renderMode === "group-child";
  const inheritedSectionId = String(options.inheritedSectionId || "").trim();
  const inheritedAnchor = String(options.inheritedAnchor || "").trim();
  const parentGroupId = String(options.groupId || "").trim();
  const altoModoPorSeccion = new Map(
    (_secciones || []).map((s: any) => [s.id, String(s.altoModo || "fijo").toLowerCase()])
  );

  function inheritGroupLayoutFields(obj: any): any {
    if (!isGroupChildRender || !obj || typeof obj !== "object") return obj;

    return {
      ...obj,
      seccionId: inheritedSectionId || obj?.seccionId,
      anclaje: inheritedAnchor || obj?.anclaje,
    };
  }

  function normalizeGroupChildRootHtml(
    htmlElemento: string,
    obj: any,
    force = false
  ): string {
    if ((!isGroupChildRender && !force) || !htmlElemento) return htmlElemento;

    const classMatch = htmlElemento.match(/class="([^"]*)"/i);
    if (!classMatch) return htmlElemento;

    const currentClasses = String(classMatch[1] || "")
      .split(/\s+/)
      .filter(Boolean)
      .filter((className) => className !== "objeto");
    const nextClasses = Array.from(
      new Set(["group-child-root", ...currentClasses])
    ).join(" ");

    let normalizedHtml = htmlElemento.replace(
      /class="[^"]*"/i,
      `class="${escapeAttr(nextClasses)}"`
    );

    normalizedHtml = normalizedHtml.replace(/\sdata-obj-id="[^"]*"/i, "");

    const extraAttrs = [
      parentGroupId ? `data-group-id="${escapeAttr(parentGroupId)}"` : "",
      String(obj?.id || "").trim()
        ? `data-group-child-id="${escapeAttr(String(obj?.id || "").trim())}"`
        : "",
    ]
      .filter(Boolean)
      .join(" ");

    if (!extraAttrs) return normalizedHtml;

    return normalizedHtml.replace(/(<(?:div|img|svg)\b)/i, `$1 ${extraAttrs} `);
  }

  function esSeccionPantalla(obj: any): boolean {
    const modo = altoModoPorSeccion.get(obj?.seccionId) || "fijo";
    return modo === "pantalla";
  }

  function isFullBleed(obj: any): boolean {
    return String(obj?.anclaje || "").toLowerCase() === "fullbleed";
  }

  /**
   * ✅ Escala uniforme del CONTENIDO:
   * - pantalla: var(--sfinal) (fit si hace falta)
   * - fijo: var(--sx)
   */
  function sContenidoVar(obj: any): string {
    return esSeccionPantalla(obj) ? "var(--sfinal)" : "var(--sx)";
  }

  /**
   * ✅ X scale:
   * - fullBleed: var(--bx) (NO fit)
   * - contenido: sContenidoVar (fit si pantalla)
   */
  function sX(obj: any): string {
    return isFullBleed(obj) ? "var(--bx)" : sContenidoVar(obj);
  }

  /**
   * ✅ Y scale:
   * - fullBleed: var(--sx) (NO fit)
   * - contenido: sContenidoVar (fit si pantalla)
   */
  function sY(obj: any): string {
    return isFullBleed(obj) ? "var(--sx)" : sContenidoVar(obj);
  }

  function pxX(obj: any, px: number): string {
    const n = Number.isFinite(px) ? px : 0;
    return `calc(${sX(obj)} * ${n}px)`;
  }

  function pxY(obj: any, px: number): string {
    const n = Number.isFinite(px) ? px : 0;
    return `calc(${sY(obj)} * ${n}px)`;
  }

  // ===========================
  // ✅ PANTALLA: top por porcentaje
  // ===========================
  const ALTURA_EDITOR_PANTALLA = 500;

  // ✅ Offsets en secciones Pantalla: ON
  // ⚠️ IMPORTANTE: este archivo SOLO genera objetos.
  // El valor DESKTOP/MOBILE real se controla vía CSS global con:
  //   :root { --pantalla-y-offset: Xpx }
  //   @media (max-width: 640px) { :root { --pantalla-y-offset: Ypx } }
  //
  // Acá dejamos fallback (desktop) por si la variable CSS no existe.
  const PANTALLA_Y_OFFSET_DESKTOP_PX = 0;

  function clamp01(n: any): number | null {
    const x = Number(n);
    if (!Number.isFinite(x)) return null;
    return Math.max(0, Math.min(1, x));
  }

  function getYPxEditor(obj: any): number {
    if (isGroupChildRender) {
      const yPx = Number(obj?.y);
      return Number.isFinite(yPx) ? yPx : 0;
    }

    // ✅ En Pantalla ON: yNorm es la fuente de verdad (0..1)
    const yn = clamp01(obj?.yNorm);
    if (yn != null) return yn * ALTURA_EDITOR_PANTALLA;

    // fallback: si no hay yNorm, usamos y como "editor px"
    const yPx = Number(obj?.y);
    if (Number.isFinite(yPx)) return yPx;

    return 0;
  }

  function topPantallaCSS(obj: any, ynRaw: any): string {
    const yn = clamp01(ynRaw) ?? 0;
    const yBloqueDisenio = `calc(${sContenidoVar(obj)} * ${ALTURA_EDITOR_PANTALLA}px)`;
    const yBasePantalla = `var(--pantalla-y-base, 0px)`;
    const ynCompactado = `calc(0.5 + ((${yn}) - 0.5) * (1 - var(--pantalla-y-compact, 0)))`;
    return `calc(
  ${yBasePantalla}
  + (${yBloqueDisenio} * ${ynCompactado})
  + (${sContenidoVar(obj)} * var(--pantalla-y-offset, ${PANTALLA_Y_OFFSET_DESKTOP_PX}px))
)`;
  }

  /**
   * ✅ topCSS:
   * - Pantalla ON: usa bloque de diseño escalado (500px * sfinal) + offset base uniforme
   * - Texto en Pantalla ON: suma offset (CSS var) escalado por sContenidoVar
   * - Fijo: pxY(obj, y)
   */
  function topCSS(obj: any): string {
    if (isGroupChildRender) {
      const y = Number(obj?.y || 0);
      return pxY(obj, y);
    }

    if (esSeccionPantalla(obj)) {
      const yPxEditor = getYPxEditor(obj);
      const yn = clamp01(yPxEditor / ALTURA_EDITOR_PANTALLA) ?? 0;
      return topPantallaCSS(obj, yn);
    }

    const y = Number(obj?.y || 0);
    return pxY(obj, y);
  }

  /**
   * ✅ Variante para cuando ya tenés yPx (en "px editor")
   */
  function topCSSFromYPx(obj: any, yPx: number): string {
    if (isGroupChildRender) {
      return pxY(obj, yPx);
    }

    if (esSeccionPantalla(obj)) {
      const yn = clamp01(yPx / ALTURA_EDITOR_PANTALLA) ?? 0;
      return topPantallaCSS(obj, yn);
    }

    return pxY(obj, yPx);
  }

  function stylePosBase(obj: any): string {
    const x = Number(obj?.x || 0);

    const rot = obj?.rotation ?? 0;
    const scaleX = obj?.scaleX ?? 1;
    const scaleY = obj?.scaleY ?? 1;

    const zIndex = Number.isFinite(obj?.zIndex) ? obj.zIndex : undefined;

    return `
position: absolute;
left: ${pxX(obj, x)};
top: ${topCSS(obj)};
transform: rotate(${rot}deg) scale(${scaleX}, ${scaleY});
transform-origin: top left;
${zIndex !== undefined ? `z-index:${zIndex};` : ""}
pointer-events: auto;
`.trim();
  }

  function styleSize(obj: any, w?: number, h?: number): string {
    const ww = Number.isFinite(w) ? (w as number) : undefined;
    const hh = Number.isFinite(h) ? (h as number) : undefined;

    const parts: string[] = [];
    if (ww !== undefined) parts.push(`width: ${pxX(obj, ww)};`);
    if (hh !== undefined) parts.push(`height: ${pxY(obj, hh)};`);
    return parts.join("\n");
  }

  function buildShapeSvgFillMarkup(fill: string, gradientId: string): {
    defsHtml: string;
    fillValue: string;
  } {
    const safePaint = sanitizeCssPaint(fill, "#000000");
    const gradient = parseLinearGradientPaint(safePaint);

    if (!gradient) {
      return {
        defsHtml: "",
        fillValue: escapeAttr(safePaint),
      };
    }

    return {
      defsHtml: `
<defs>
  <linearGradient id="${escapeAttr(gradientId)}" x1="0%" y1="0%" x2="100%" y2="100%">
    <stop offset="0%" stop-color="${escapeAttr(gradient.from)}" />
    <stop offset="100%" stop-color="${escapeAttr(gradient.to)}" />
  </linearGradient>
</defs>
`.trim(),
      fillValue: `url(#${escapeAttr(gradientId)})`,
    };
  }

  function renderShapeSvgHtml(
    obj: any,
    width: number,
    height: number,
    innerHtml: string,
    extraStyle = ""
  ): string {
    const baseStyle = stylePosBase(obj);
    const style = `
${baseStyle}
${styleSize(obj, width, height)}
display: block;
overflow: visible;
pointer-events: auto;
${extraStyle}
`.trim();

    return `<svg class="objeto" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${escapeAttr(String(width))} ${escapeAttr(String(height))}" preserveAspectRatio="none" style="${style}">${innerHtml}</svg>`;
  }

  function sanitizeSvgIdToken(value: any, fallback = "shape"): string {
    const raw = String(value || "").trim();
    const cleaned = raw.replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
    return cleaned || fallback;
  }

  function renderShapePolygonSvgHtml(
    obj: any,
    fill: string,
    width: number,
    height: number,
    points: string
  ): string {
    const gradientId = `shape-fill-${sanitizeSvgIdToken(obj?.id)}`;
    const shapeFill = buildShapeSvgFillMarkup(fill, gradientId);
    const innerHtml = `
${shapeFill.defsHtml}
<polygon points="${escapeAttr(points)}" fill="${shapeFill.fillValue}" />
`.trim();

    return renderShapeSvgHtml(obj, width, height, innerHtml);
  }

  function renderShapePathSvgHtml(
    obj: any,
    fill: string,
    width: number,
    height: number,
    pathData: string
  ): string {
    const gradientId = `shape-fill-${sanitizeSvgIdToken(obj?.id)}`;
    const shapeFill = buildShapeSvgFillMarkup(fill, gradientId);
    const innerHtml = `
${shapeFill.defsHtml}
<path d="${escapeAttr(pathData)}" fill="${shapeFill.fillValue}" />
`.trim();

    return renderShapeSvgHtml(obj, width, height, innerHtml);
  }

  function renderShapeLineSvgHtml(obj: any, fill: string): string {
    const points = Array.isArray(obj?.points)
      ? obj.points
      : [0, 0, LINE_CONSTANTS.DEFAULT_LENGTH, 0];
    const x1 = Number.parseFloat(String(points[0])) || 0;
    const y1 = Number.parseFloat(String(points[1])) || 0;
    const x2 = Number.parseFloat(String(points[2])) || LINE_CONSTANTS.DEFAULT_LENGTH;
    const y2 = Number.parseFloat(String(points[3])) || 0;
    const strokeWidth = Math.max(1, Number(obj?.strokeWidth) || LINE_CONSTANTS.STROKE_WIDTH);

    const halfStroke = strokeWidth / 2;
    const minX = Math.min(x1, x2) - halfStroke;
    const minY = Math.min(y1, y2) - halfStroke;
    const maxX = Math.max(x1, x2) + halfStroke;
    const maxY = Math.max(y1, y2) + halfStroke;
    const width = Math.max(1, maxX - minX);
    const height = Math.max(1, maxY - minY);

    const absoluteX = Number(obj?.x || 0) + minX;
    const absoluteY = getYPxEditor(obj) + minY;
    const rot = obj?.rotation ?? 0;
    const scaleX = obj?.scaleX ?? 1;
    const scaleY = obj?.scaleY ?? 1;
    const zIndex = Number.isFinite(obj?.zIndex) ? obj.zIndex : undefined;

    const gradientId = `shape-stroke-${sanitizeSvgIdToken(obj?.id, "line")}`;
    const strokePaint = buildShapeSvgFillMarkup(fill, gradientId);
    const style = `
position: absolute;
left: ${pxX(obj, absoluteX)};
top: ${topCSSFromYPx(obj, absoluteY)};
width: ${pxX(obj, width)};
height: ${pxY(obj, height)};
transform: rotate(${rot}deg) scale(${scaleX}, ${scaleY});
transform-origin: ${pxX(obj, -minX)} ${pxY(obj, -minY)};
overflow: visible;
display: block;
${zIndex !== undefined ? `z-index:${zIndex};` : ""}
pointer-events: auto;
`.trim();

    const innerHtml = `
${strokePaint.defsHtml}
<line
  x1="${escapeAttr(toCssNumber(x1 - minX))}"
  y1="${escapeAttr(toCssNumber(y1 - minY))}"
  x2="${escapeAttr(toCssNumber(x2 - minX))}"
  y2="${escapeAttr(toCssNumber(y2 - minY))}"
  stroke="${strokePaint.fillValue}"
  stroke-width="${escapeAttr(toCssNumber(strokeWidth))}"
  stroke-linecap="round"
  stroke-linejoin="round"
/>
`.trim();

    return `<svg class="objeto linea" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${escapeAttr(
      toCssNumber(width)
    )} ${escapeAttr(toCssNumber(height))}" preserveAspectRatio="none" style="${style}">${innerHtml}</svg>`;
  }

  function renderIconoSvgNuevoInline(obj: any) {
    const viewBox = obj.viewBox || "0 0 24 24";
    const color = obj.color || "#000";
    const paths = Array.isArray(obj.paths) ? obj.paths : [];
    if (!paths.length) return "";

    const w = Number.isFinite(obj?.width) ? obj.width : 24;
    const h = Number.isFinite(obj?.height) ? obj.height : 24;

    const rot = obj?.rotation ?? 0;
    const scaleX = obj?.scaleX ?? 1;
    const scaleY = obj?.scaleY ?? 1;

    const x = Number(obj?.x || 0);
    const yPx = getYPxEditor(obj);

    const pathsHtml = paths
      .map((p: any) => (p?.d ? `<path d="${escHTML(p.d)}" fill="${escHTML(color)}"></path>` : ""))
      .join("");

    const style = `
position: absolute;
left: ${pxX(obj, x)};
top: ${topCSSFromYPx(obj, yPx)};
width: ${pxX(obj, w)};
height: ${pxY(obj, h)};
transform: rotate(${rot}deg) scale(${scaleX}, ${scaleY});
transform-origin: top left;
pointer-events: auto;
`.trim();

    return `<svg class="objeto" xmlns="http://www.w3.org/2000/svg" viewBox="${escHTML(
      viewBox
    )}" style="${style}">${pathsHtml}</svg>`;
  }

  return objetos
    .map((obj) => {
      obj = inheritGroupLayoutFields(normalizeRenderAssetObject(obj));
      const tipo = obj?.tipo;

      if (tipo === "grupo") {
        const children = Array.isArray(obj?.children) ? obj.children : [];
        const hasLinkedChildren = children.some((child: any) => Boolean(getLinkProps(child)));
        const width = Number.isFinite(obj?.width) ? Number(obj.width) : undefined;
        const height = Number.isFinite(obj?.height) ? Number(obj.height) : undefined;
        const groupStyle = `
${stylePosBase(obj)}
${styleSize(obj, width, height)}
display: block;
overflow: visible;
box-sizing: border-box;
`.trim();
        const childrenHtml = children
          .map((child: any) =>
            normalizeGroupChildRootHtml(
              generarHTMLDesdeObjetos([child], _secciones, {
                ...options,
                renderMode: "group-child",
                inheritedSectionId: String(obj?.seccionId || "").trim() || null,
                inheritedAnchor: String(obj?.anclaje || "").trim() || null,
                groupId: String(obj?.id || "").trim() || null,
              }),
              child,
              true
            )
          )
          .filter(Boolean)
          .join("\n");

        return envolverSiEnlace(
          `<div class="objeto group-object" data-mobile-cluster="isolated" style="${groupStyle}">${childrenHtml}</div>`,
          obj,
          {
            allowLinkWrap: !hasLinkedChildren,
          }
        );
      }

      // ---------------- TEXTO ----------------
      if (tipo === "texto") {
        const align = String(obj.align || obj.textAlign || "left").toLowerCase();
        const color = obj.colorTexto || obj.color || obj.fill || "#000";
        const mobileTextScaleMode = sanitizeMobileTextScaleMode(obj?.mobileTextScaleMode);
        const mobileTextScaleMaxCss =
          mobileTextScaleMode === "custom"
            ? `--text-scale-max: ${toCssNumber(sanitizeMobileTextScaleMax(obj?.mobileTextScaleMax))};`
            : "";

        const baseLineHeight =
          typeof obj.lineHeight === "number" && obj.lineHeight > 0 ? obj.lineHeight : 1.2;
        const lineHeightFinal = baseLineHeight * 0.92;

        const safeTexto = escHTML(obj.texto || "");
        const baseStyle = stylePosBase(obj);

        const w = Number.isFinite(obj?.width) ? obj.width : undefined;
        const fs = Number.isFinite(obj?.fontSize) ? obj.fontSize : 24;

        // ⚠️ texto fullBleed NO hace fit => escala con var(--sx)
        const sFont = isFullBleed(obj) ? "var(--sx)" : sContenidoVar(obj);

        const rot = obj?.rotation ?? 0;
        const scaleX = obj?.scaleX ?? 1;
        const scaleY = obj?.scaleY ?? 1;

        const origin =
          align === "center" ? "top center" :
            (align === "right" ? "top right" : "top left");

        const style = `
${baseStyle}
/* Keep absolute geometry stable; visual text zoom is applied via transform. */
transform-origin: ${origin};
transform: rotate(${rot}deg) scale(${scaleX}, ${scaleY}) scale(var(--text-scale-effective, 1));
${w !== undefined ? `width: ${pxX(obj, w)};` : ""}
${mobileTextScaleMaxCss}
font-size: calc(${sFont} * ${fs}px);
font-family: ${obj.fontFamily || "sans-serif"};
font-weight: ${obj.fontWeight || "normal"};
font-style: ${obj.fontStyle || "normal"};
text-decoration: ${obj.textDecoration || "none"};
color: ${color};
text-align: ${align};
white-space: pre-wrap;
line-height: ${lineHeightFinal};
letter-spacing: calc(${sFont} * ${Number.isFinite(obj?.letterSpacing) ? Number(obj.letterSpacing) : 0}px);
padding: 0;
margin: 0;
box-sizing: content-box;
${obj.stroke && obj.strokeWidth > 0
            ? `-webkit-text-stroke: ${obj.strokeWidth}px ${obj.stroke};`
            : ""
          }
${obj.shadowColor
            ? `text-shadow: ${obj.shadowOffsetX || 0}px ${obj.shadowOffsetY || 0}px ${obj.shadowBlur || 0}px ${obj.shadowColor};`
            : "text-shadow: none;"
          }
`.trim();

        return envolverSiEnlace(
          `<div class="objeto" data-debug-texto="1" data-text-scale-mode="${escapeAttr(mobileTextScaleMode)}" style="${style}">${safeTexto}</div>`,
          obj
        );
      }


      // ---------------- IMAGEN ----------------
      if (tipo === "imagen") {
        const src = obj.src || "";
        if (!src) return "";

        const imageCropState = resolvePublishImageCropState(obj);
        const baseStyle = stylePosBase(obj);
        const w = Number.isFinite(imageCropState.displayWidth)
          ? imageCropState.displayWidth
          : (Number.isFinite(obj?.width) ? obj.width : undefined);
        const h = Number.isFinite(imageCropState.displayHeight)
          ? imageCropState.displayHeight
          : (Number.isFinite(obj?.height) ? obj.height : undefined);
        const hasDisplayBox =
          Number.isFinite(Number(w)) && Number.isFinite(Number(h));

        if (!hasDisplayBox) {
          const fallbackStyle = `
${baseStyle}
${styleSize(obj, w, h)}
display: block;
max-width: none;
`.trim();

          return envolverSiEnlace(
            `<img class="objeto" src="${escapeAttr(src)}" alt="" loading="lazy" decoding="async" draggable="false" style="${fallbackStyle}" />`,
            obj
          );
        }

        const wrapperStyle = `
${baseStyle}
${styleSize(obj, w, h)}
display: block;
overflow: hidden;
box-sizing: border-box;
`.trim();

        const shouldMaterializeCrop =
          imageCropState.hasMeaningfulCrop && imageCropState.canMaterializeCrop;
        const innerImageStyle = shouldMaterializeCrop
          ? `
position: absolute;
left: calc(-100% * ${toCssNumber(imageCropState.cropX)} / ${toCssNumber(imageCropState.cropWidth || 1)});
top: calc(-100% * ${toCssNumber(imageCropState.cropY)} / ${toCssNumber(imageCropState.cropHeight || 1)});
width: calc(100% * ${toCssNumber(imageCropState.sourceWidth || 1)} / ${toCssNumber(imageCropState.cropWidth || 1)});
height: calc(100% * ${toCssNumber(imageCropState.sourceHeight || 1)} / ${toCssNumber(imageCropState.cropHeight || 1)});
display: block;
max-width: none;
user-select: none;
pointer-events: none;
`.trim()
          : `
width: 100%;
height: 100%;
object-fit: fill;
display: block;
user-select: none;
pointer-events: none;
`.trim();

        return envolverSiEnlace(
          `
<div class="objeto image-object" style="${wrapperStyle}">
  <img src="${escapeAttr(src)}" alt="" loading="lazy" decoding="async" draggable="false" style="${innerImageStyle}" />
</div>
`.trim(),
          obj
        );
      }

      // ---------------- ICONO (nuevo) ----------------
      if (tipo === "icono") {
        if (obj.formato === "svg") {
          const svgHtml = renderIconoSvgNuevoInline(obj);
          if (!svgHtml) return "";
          return envolverSiEnlace(svgHtml, obj);
        }

        const src = obj.src || "";
        if (!src) return "";

        const baseStyle = stylePosBase(obj);
        const w = Number.isFinite(obj?.width) ? obj.width : undefined;
        const h = Number.isFinite(obj?.height) ? obj.height : undefined;

        const style = `
${baseStyle}
${styleSize(obj, w, h)}
object-fit: contain;
display: block;
`.trim();

        return envolverSiEnlace(`<img class="objeto" src="${escapeAttr(src)}" style="${style}" />`, obj);
      }

      // ---------------- ICONO LEGACY (icono-svg) ----------------
      if (tipo === "icono-svg" && obj.d) {
        const iconContract = classifyRenderObjectContract(obj);
        const vb = obj.viewBox || "0 0 100 100";
        const fill = obj.color || "#000";

        const baseStyle = stylePosBase(obj);
        const w = Number.isFinite(obj?.width) ? obj.width : 100;
        const h = Number.isFinite(obj?.height) ? obj.height : 100;

        const style = `
${baseStyle}
width: ${pxX(obj, w)};
height: ${pxY(obj, h)};
fill: ${escapeAttr(fill)};
`.trim();

        const svg = `<svg class="objeto" data-render-contract-id="${escapeAttr(
          iconContract.contractId || ""
        )}" data-render-contract-status="${escapeAttr(
          iconContract.status || ""
        )}" xmlns="http://www.w3.org/2000/svg" viewBox="${escapeAttr(
          vb
        )}" style="${style}"><path d="${escHTML(obj.d)}" /></svg>`;

        return envolverSiEnlace(svg, obj);
      }

      // ---------------- COUNTDOWN ----------------
      if (tipo === "countdown") {
        const countdownTarget = resolveCountdownTargetIso(obj);
        const countdownContract = resolveCountdownContract(obj);
        const targetISO = countdownTarget.targetISO;
        const schemaVersion = countdownContract.schemaVersion || 1;
        const countdownContractVersion = countdownContract.contractVersion || "v1";
        const countdownContractId = countdownContract.contractId || "";
        const countdownContractStatus = countdownContract.status || "";
        const countdownTargetSource = countdownTarget.sourceField || "";

        if (countdownContractVersion === "v2") {
          const layout = buildCountdownLayoutMetrics(obj);
          const safeUnits = layout.units;
          const distribution = layout.distribution;
          const layoutType = layout.layoutType;
          const altoModo = altoModoPorSeccion.get(obj?.seccionId) || "fijo";
          const frameColorMode = String(obj.frameColorMode || "fixed").toLowerCase();
          const labelTransform = String(obj.labelTransform || "uppercase").toLowerCase();
          const entryAnim = String(obj.entryAnimation || "none").toLowerCase();
          const tickAnim = String(obj.tickAnimation || "none").toLowerCase();
          const frameAnim = String(obj.frameAnimation || "none").toLowerCase();
          const showLabels = obj.showLabels !== false;

          const baseStyle = stylePosBase(obj);
          const sChip = isFullBleed(obj) ? "var(--sx)" : sContenidoVar(obj);
          const sChipPx = (value: number): string => `calc(${sChip} * ${toCssNumber(value)}px)`;
          const numberPaint = sanitizeCssPaint(obj.color, "#111");
          const labelPaint = sanitizeCssPaint(obj.labelColor, "#6b7280");
          const unitBgPaint = sanitizeCssPaint(obj.boxBg, "transparent");
          const unitBorderPaint = sanitizeCssPaint(obj.boxBorder, "transparent");

          const containerStyle = `
${baseStyle}
width: ${pxX(obj, layout.containerW)};
height: ${pxY(obj, layout.containerH)};
display: block;
font-family: ${obj.fontFamily || "Inter, system-ui, sans-serif"};
color: ${numberPaint};
`.trim();
          const countdownAuditAttrs = buildCountdownAuditAttrs(obj, {
            id: String(obj?.id || "").trim() || null,
            presetId: String(obj?.presetId || "").trim() || null,
            countdownSchemaVersion: schemaVersion,
            seccionId: String(obj?.seccionId || "").trim() || null,
            altoModo: altoModo || null,
            x: roundCountdownAuditMetric(obj?.x),
            y: roundCountdownAuditMetric(obj?.y),
            yNorm:
              Number.isFinite(Number(obj?.yNorm)) ? roundCountdownAuditMetric(obj?.yNorm) : null,
            width: roundCountdownAuditMetric(layout.containerW),
            height: roundCountdownAuditMetric(layout.containerH),
            scaleX: roundCountdownAuditMetric(obj?.scaleX ?? 1),
            scaleY: roundCountdownAuditMetric(obj?.scaleY ?? 1),
            rotation: roundCountdownAuditMetric(obj?.rotation ?? 0),
            tamanoBase: roundCountdownAuditMetric(obj?.tamanoBase ?? 320),
            layoutType,
            distribution,
            visibleUnits: [...safeUnits],
            gap: roundCountdownAuditMetric(layout.gap),
            framePadding: roundCountdownAuditMetric(layout.framePadding),
            paddingX: roundCountdownAuditMetric(layout.paddingX),
            paddingY: roundCountdownAuditMetric(layout.paddingY),
            chipWidth: roundCountdownAuditMetric(layout.chipWidth),
            fontSize: roundCountdownAuditMetric(layout.valueSize),
            labelSize: roundCountdownAuditMetric(layout.labelSize),
            boxRadius: roundCountdownAuditMetric(layout.boxRadius),
            showLabels: layout.showLabels,
            chipH: roundCountdownAuditMetric(layout.chipH),
            baseChipW: roundCountdownAuditMetric(layout.baseChipW),
            naturalW: roundCountdownAuditMetric(layout.naturalW),
            naturalH: roundCountdownAuditMetric(layout.naturalH),
            containerW: roundCountdownAuditMetric(layout.containerW),
            containerH: roundCountdownAuditMetric(layout.containerH),
            startX: roundCountdownAuditMetric(layout.startX),
            startY: roundCountdownAuditMetric(layout.startY),
            unitLayouts: compactCountdownAuditUnitLayouts(layout.unitLayouts),
            separatorLayouts: compactCountdownAuditSeparatorLayouts(layout.separatorLayouts),
          });

          const gridStyle = `
position: absolute;
inset: 0;
z-index: 2;
display: block;
pointer-events: none;
`.trim();

          const valueStyle = `
font-weight: 700;
font-size: ${sChipPx(layout.valueSize)};
line-height: ${Number.isFinite(obj.lineHeight) ? Number(obj.lineHeight) : 1.05};
letter-spacing: ${sChipPx(Number.isFinite(obj.letterSpacing) ? Number(obj.letterSpacing) : 0)};
${buildTextPaintStyleCss(numberPaint, "#111")}
`.trim();

          const labelStyle = `
font-size: ${sChipPx(layout.labelSize)};
line-height: 1;
letter-spacing: ${sChipPx(Number.isFinite(obj.letterSpacing) ? Number(obj.letterSpacing) : 0)};
${buildTextPaintStyleCss(labelPaint, "#6b7280")}
`.trim();

          const frameUrl = layout.frameSvgUrl;
          const frameColor = sanitizeCssPaint(obj.frameColor, "#773dbe");

          const singleFrameHtml =
            layout.useSingleFrameLayout && layout.hasFrameConfigured
              ? `<div class="cdv2-frame cdv2-frame--single" data-frame-anim="${escapeAttr(frameAnim)}" style="position:absolute;inset:0;z-index:1;"><img src="${escapeAttr(frameUrl)}" alt="" aria-hidden="true" loading="lazy" decoding="async" style="width:100%;height:100%;object-fit:fill;display:block;${frameColorMode === "currentcolor" ? `color:${escapeAttr(frameColor)};` : ""}" /></div>`
              : "";

          const unitsHtml = layout.unitLayouts
            .map((item, index: number) => {
              const unit = item.unit;
              const cornerRadius = Math.min(
                Number.isFinite(obj.boxRadius) ? Number(obj.boxRadius) : 8,
                item.width / 2,
                item.height / 2
              );
              const unitStyle = `
position: absolute;
left: ${sChipPx(item.x)};
top: ${sChipPx(item.y)};
width: ${sChipPx(item.width)};
height: ${sChipPx(item.height)};
display: flex;
align-items: center;
justify-content: center;
overflow: hidden;
border-radius: ${sChipPx(cornerRadius)};
background: ${unitBgPaint};
border: ${sChipPx(1)} solid ${unitBorderPaint};
box-sizing: border-box;
pointer-events: none;
`.trim();
              const unitFrameHtml =
                layout.useMultiUnitFrame && layout.hasFrameConfigured
                  ? `<div class="cdv2-frame cdv2-frame--unit" data-frame-anim="${escapeAttr(frameAnim)}" style="position:absolute;inset:0;z-index:1;"><img src="${escapeAttr(frameUrl)}" alt="" aria-hidden="true" loading="lazy" decoding="async" style="width:100%;height:100%;object-fit:fill;display:block;${frameColorMode === "currentcolor" ? `color:${escapeAttr(frameColor)};` : ""}" /></div>`
                  : "";
              const labelOffsetStyle = showLabels ? `margin-top:${sChipPx(4)};` : "";

              return `
<div class="cdv2-unit${distribution === "editorial" && index === 0 ? " cdv2-unit--hero" : ""}" data-unit="${escapeAttr(unit)}" style="${unitStyle}">
  ${unitFrameHtml}
  <div class="cdv2-content" style="position:relative;z-index:2;display:flex;width:100%;height:100%;flex-direction:column;align-items:center;justify-content:center;box-sizing:border-box;">
    <span class="cdv2-val cd-val" style="${valueStyle}">00</span>
    ${showLabels ? `<span class="cdv2-lab" style="${labelStyle}${labelOffsetStyle}">${escapeAttr(transformCountdownLabel(COUNTDOWN_UNIT_LABELS[unit as keyof typeof COUNTDOWN_UNIT_LABELS] || unit, labelTransform))}</span>` : ""}
  </div>
</div>`.trim();
            })
            .join("");

          const separatorPaint = sanitizeCssPaint(obj.separatorColor ?? obj.labelColor, "#6b7280");
          const separatorStyle = `
font-weight: 700;
font-size: ${sChipPx(layout.separatorFontSize)};
line-height: 1;
text-align: center;
white-space: pre;
${buildTextPaintStyleCss(separatorPaint, "#6b7280")}
`.trim();

          const separatorsHtml = layout.separatorLayouts
            .map(
              (item) => `
<span class="cdv2-separator" aria-hidden="true" style="position:absolute;left:${sChipPx(item.x)};top:${sChipPx(item.y)};width:${sChipPx(item.width)};z-index:3;pointer-events:none;${separatorStyle}">${escapeAttr(layout.separatorText)}</span>
`.trim()
            )
            .join("");

          const htmlCountdownV2 = `
<div class="objeto countdown-v2"
  data-mobile-cluster="isolated"
  data-mobile-center="force"
  data-countdown
  data-countdown-contract="${escapeAttr(countdownContractVersion)}"
  data-countdown-v2="1"
  data-countdown-target-source="${escapeAttr(countdownTargetSource)}"
  data-render-contract-id="${escapeAttr(countdownContractId)}"
  data-render-contract-status="${escapeAttr(countdownContractStatus)}"
  ${countdownAuditAttrs}
  data-target="${escapeAttr(targetISO)}"
  data-layout-type="${escapeAttr(layoutType)}"
  data-distribution="${escapeAttr(distribution)}"
  data-entry-anim="${escapeAttr(entryAnim)}"
  data-tick-anim="${escapeAttr(tickAnim)}"
  data-frame-anim="${escapeAttr(frameAnim)}"
  data-frame-color-mode="${escapeAttr(frameColorMode)}"
  data-units="${escapeAttr(safeUnits.join(","))}"
  style="${containerStyle}">
  ${singleFrameHtml}
  <div class="cdv2-grid" style="${gridStyle}">
    ${unitsHtml}
    ${separatorsHtml}
  </div>
</div>
`.trim();

          return appendMotionDataAttrs(htmlCountdownV2, obj);
        }

        const textColor = sanitizeCssPaint(obj.colorTexto ?? obj.color, "#111");
        const fontFamily = obj.fontFamily || "Inter, system-ui, sans-serif";

        const preset = obj.presetId || obj.layout || "pills";
        const isMinimal = String(preset).toLowerCase().includes("minimal");

        // ✅ ancho/alto del objeto (si existen)
        const wObj = Number.isFinite(obj?.width) ? Number(obj.width) : null;
        const hObj = Number.isFinite(obj?.height) ? Number(obj.height) : null;

        // ✅ gap: si viene de Konva, respetarlo
        const gap = Number.isFinite(obj.gap)
          ? Number(obj.gap)
          : Number.isFinite(obj.spacing)
            ? Number(obj.spacing)
            : 8;

        // ✅ Si tu Konva guarda chipWidth / paddingX, respetalos
        // chipWidth: ancho interno del texto (sin padding)
        const chipWidthProp = Number.isFinite(obj.chipWidth) ? Number(obj.chipWidth) : null;
        const paddingXProp = Number.isFinite(obj.paddingX) ? Number(obj.paddingX) : null;

        // ✅ Derivación raíz (cuando no hay props)
        const n = 4;

        // chipWTotal: ancho total de cada chip (incluye padding)
        let chipWTotal = 56; // fallback razonable
        if (wObj && wObj > 0) {
          chipWTotal = Math.max(40, (wObj - gap * (n - 1)) / n);
        }

        // paddingX derivado del chipWTotal (si no vino)
        const paddingX = paddingXProp ?? Math.max(6, Math.round(chipWTotal * 0.18)); // ~18%
        const paddingY = Math.max(5, Math.round(paddingX * 0.65));

        // chipWidth (texto) derivado si no vino
        const chipWidth = chipWidthProp ?? Math.max(10, Math.round(chipWTotal - paddingX * 2));

        // ✅ font sizes: si vienen, respetar; si no, derivar desde chipWTotal
        const valueSize =
          Number.isFinite(obj.fontSize) ? Number(obj.fontSize) : Math.max(14, Math.round(chipWTotal * 0.34));
        const labelSize =
          Number.isFinite(obj.labelSize) ? Number(obj.labelSize) : Math.max(9, Math.round(valueSize * 0.62));

        const labelColor = sanitizeCssPaint(obj.labelColor, "#6b7280");
        const fontWeight = Number.isFinite(obj.fontWeight) ? obj.fontWeight : 700;
        const letterSpacing = Number.isFinite(obj.letterSpacing) ? obj.letterSpacing : 0;

        // ✅ estilos de chip
        const containerBgFinal = "transparent";
        const chipBgFinal = isMinimal
          ? "transparent"
          : sanitizeCssPaint(obj.chipBackground ?? obj.boxBg, "rgba(255,255,255,.75)");
        const chipBorderColorFinal = isMinimal
          ? "transparent"
          : sanitizeCssPaint(obj.chipBorder ?? obj.boxBorder, "rgba(0,0,0,.08)");

        const containerRadius = Number.isFinite(obj.boxRadius)
          ? obj.boxRadius
          : Number.isFinite(obj.radius)
            ? obj.radius
            : 10;

        const chipRadiusFinal = Number.isFinite(obj.chipRadius) ? obj.chipRadius : containerRadius;
        const altoModo = altoModoPorSeccion.get(obj?.seccionId) || "fijo";

        const baseStyle = stylePosBase(obj);

        // ✅ Escala correcta (respeta pantalla y bleed)
        const sChip = isFullBleed(obj) ? "var(--sx)" : sContenidoVar(obj);

        const containerStyle = `
${baseStyle}
${wObj ? `width: ${pxX(obj, wObj)};` : ""}
${hObj ? `height: ${pxY(obj, hObj)};` : ""}
display: flex;
align-items: center;
justify-content: center;
gap: calc(${sChip} * ${gap}px);
font-family: ${fontFamily};
color: ${textColor};
background: ${containerBgFinal};
border-radius: calc(${sChip} * ${containerRadius}px);
letter-spacing: calc(${sChip} * ${letterSpacing}px);
`.trim();

        const chipStyle = `
width: calc(${sChip} * ${Math.round(chipWTotal)}px);
padding: calc(${sChip} * ${paddingY}px) calc(${sChip} * ${paddingX}px);
border: ${isMinimal ? "0" : `calc(${sChip} * 1px) solid ${chipBorderColorFinal}`};
border-radius: calc(${sChip} * ${chipRadiusFinal}px);
display: flex;
flex-direction: column;
align-items: center;
justify-content: center;
background: ${chipBgFinal};
box-sizing: border-box;
`.trim();

        const valueStyle = `
font-weight: ${fontWeight};
font-size: calc(${sChip} * ${valueSize}px);
line-height: 1;
${buildTextPaintStyleCss(textColor, "#111")}
`.trim();

        const labelStyle = `
font-size: calc(${sChip} * ${labelSize}px);
line-height: 1.05;
${buildTextPaintStyleCss(labelColor, "#6b7280")}
`.trim();

        const showLabels = obj.showLabels !== false;
        const chipH =
          hObj && hObj > 0
            ? hObj
            : Math.max(44, paddingY * 2 + valueSize + (showLabels ? labelSize + 6 : 0));
        const naturalW = n * Math.round(chipWTotal) + gap * Math.max(0, n - 1);
        const unitLayouts = Array.from({ length: n }, (_, index) => ({
          key: COUNTDOWN_DEFAULT_VISIBLE_UNITS[index] || String(index),
          unit: COUNTDOWN_DEFAULT_VISIBLE_UNITS[index] || String(index),
          x: index * (Math.round(chipWTotal) + gap),
          y: 0,
          width: Math.round(chipWTotal),
          height: chipH,
        }));
        const countdownAuditAttrs = buildCountdownAuditAttrs(obj, {
          id: String(obj?.id || "").trim() || null,
          presetId: String(obj?.presetId || "").trim() || null,
          countdownSchemaVersion: schemaVersion,
          seccionId: String(obj?.seccionId || "").trim() || null,
          altoModo: altoModo || null,
          x: roundCountdownAuditMetric(obj?.x),
          y: roundCountdownAuditMetric(obj?.y),
          yNorm:
            Number.isFinite(Number(obj?.yNorm)) ? roundCountdownAuditMetric(obj?.yNorm) : null,
          width: roundCountdownAuditMetric(wObj || naturalW),
          height: roundCountdownAuditMetric(hObj || chipH),
          scaleX: roundCountdownAuditMetric(obj?.scaleX ?? 1),
          scaleY: roundCountdownAuditMetric(obj?.scaleY ?? 1),
          rotation: roundCountdownAuditMetric(obj?.rotation ?? 0),
          tamanoBase: roundCountdownAuditMetric(obj?.tamanoBase ?? 320),
          layoutType: String(obj?.layout || "pills"),
          distribution: "centered",
          visibleUnits: [...COUNTDOWN_DEFAULT_VISIBLE_UNITS],
          gap: roundCountdownAuditMetric(gap),
          framePadding: 0,
          paddingX: roundCountdownAuditMetric(paddingX),
          paddingY: roundCountdownAuditMetric(paddingY),
          chipWidth: roundCountdownAuditMetric(chipWidth),
          fontSize: roundCountdownAuditMetric(valueSize),
          labelSize: roundCountdownAuditMetric(labelSize),
          boxRadius: roundCountdownAuditMetric(chipRadiusFinal),
          showLabels,
          chipH: roundCountdownAuditMetric(chipH),
          baseChipW: roundCountdownAuditMetric(Math.round(chipWTotal)),
          naturalW: roundCountdownAuditMetric(naturalW),
          naturalH: roundCountdownAuditMetric(chipH),
          containerW: roundCountdownAuditMetric(wObj || naturalW),
          containerH: roundCountdownAuditMetric(hObj || chipH),
          startX: 0,
          startY: 0,
          unitLayouts: compactCountdownAuditUnitLayouts(unitLayouts),
          separatorLayouts: [],
        });
        const labels = obj.labels ?? { dias: "Días", horas: "Horas", min: "Min", seg: "Seg" };

        const htmlCountdown = `
<div class="objeto"
  data-mobile-cluster="isolated"
  data-mobile-center="force"
  data-countdown
  data-countdown-contract="${escapeAttr(countdownContractVersion)}"
  data-countdown-target-source="${escapeAttr(countdownTargetSource)}"
  data-render-contract-id="${escapeAttr(countdownContractId)}"
  data-render-contract-status="${escapeAttr(countdownContractStatus)}"
  ${countdownAuditAttrs}
  data-target="${escapeAttr(targetISO)}"
  data-preset="${escapeAttr(
          preset
        )}" style="${containerStyle}">
  <div class="cd-chip" style="${chipStyle}">
    <span class="cd-val" style="${valueStyle}">00</span>
    ${showLabels ? `<span class="cd-lab" style="${labelStyle}">${escapeAttr(labels.dias)}</span>` : ""}
  </div>
  <div class="cd-chip" style="${chipStyle}">
    <span class="cd-val" style="${valueStyle}">00</span>
    ${showLabels ? `<span class="cd-lab" style="${labelStyle}">${escapeAttr(labels.horas)}</span>` : ""}
  </div>
  <div class="cd-chip" style="${chipStyle}">
    <span class="cd-val" style="${valueStyle}">00</span>
    ${showLabels ? `<span class="cd-lab" style="${labelStyle}">${escapeAttr(labels.min)}</span>` : ""}
  </div>
  <div class="cd-chip" style="${chipStyle}">
    <span class="cd-val" style="${valueStyle}">00</span>
    ${showLabels ? `<span class="cd-lab" style="${labelStyle}">${escapeAttr(labels.seg)}</span>` : ""}
  </div>
</div>
`.trim();
        return appendMotionDataAttrs(htmlCountdown, obj);
      }


      // ---------------- GALERÍA ----------------
      if (tipo === "galeria") {
        const rows = Math.max(1, parseInt(obj.rows || 1, 10));
        const cols = Math.max(1, parseInt(obj.cols || 1, 10));
        const gapPx = Math.max(0, parseInt(obj.gap || 0, 10));
        const radiusPx = Math.max(0, parseInt(obj.radius || 0, 10));
        const layoutMode = normalizeGalleryLayoutMode(obj.galleryLayoutMode);
        const layoutType = normalizeGalleryLayoutType(obj.galleryLayoutType);

        const baseStyle = stylePosBase(obj);
        const w = Number.isFinite(obj?.width) ? Number(obj.width) : 1;
        const h = Number.isFinite(obj?.height) ? Number(obj.height) : undefined;

        const sGrid = isFullBleed(obj) ? "var(--sx)" : sContenidoVar(obj);
        const sourceCells = Array.isArray(obj.cells) ? obj.cells : [];

        if (layoutMode === "dynamic_media") {
          const mediaCells = sourceCells
            .map((cell: any) => {
              const mediaUrl = String(cell?.mediaUrl || "").trim();
              if (!mediaUrl) return null;
              return {
                mediaUrl,
                fit: cell?.fit === "contain" ? "contain" : "cover",
                bg: sanitizeCssPaint(cell?.bg, "#f3f4f6"),
              };
            })
            .filter(Boolean);

          const mediaUrls = mediaCells.map((cell: any) => cell.mediaUrl);
          const desktopLayout = resolveGalleryRenderLayout({
            width: w,
            rows,
            cols,
            gap: gapPx,
            ratio: obj.ratio,
            layoutMode,
            layoutType,
            layoutBlueprint: obj.galleryLayoutBlueprint,
            mediaUrls,
            isMobile: false,
          });
          const mobileLayout = resolveGalleryRenderLayout({
            width: w,
            rows,
            cols,
            gap: gapPx,
            ratio: obj.ratio,
            layoutMode,
            layoutType,
            layoutBlueprint: obj.galleryLayoutBlueprint,
            mediaUrls,
            isMobile: true,
          });

          const desktopWidth = Math.max(
            0,
            Number.isFinite(Number(desktopLayout?.totalWidth))
              ? Number(desktopLayout.totalWidth)
              : w
          );
          const desktopHeight = Math.max(
            0,
            Number.isFinite(Number(desktopLayout?.totalHeight))
              ? Number(desktopLayout.totalHeight)
              : Number.isFinite(h)
                ? Number(h)
                : 0
          );
          const mobileHeight = Math.max(
            0,
            Number.isFinite(Number(mobileLayout?.totalHeight))
              ? Number(mobileLayout.totalHeight)
              : desktopHeight
          );

          const styleContenedorDinamico = `
${baseStyle}
width: ${pxX(obj, desktopWidth)};
--gallery-scale: ${sGrid};
--gallery-height-desktop: ${desktopHeight};
--gallery-height-mobile: ${mobileHeight};
--gallery-cell-radius: ${radiusPx};
box-sizing: border-box;
`.trim();

          const htmlCeldas = mediaCells
            .map((cell: any, idx: number) => {
              const desktopRect = desktopLayout?.rects?.[idx];
              const mobileRect = mobileLayout?.rects?.[idx] || desktopRect;
              if (!desktopRect || !mobileRect) return "";

              const safeSrc = escapeAttr(cell.mediaUrl || "");
              const safeFit = cell.fit === "contain" ? "contain" : "cover";
              const safeBg = sanitizeCssPaint(cell.bg, "#f3f4f6");
              const celdaStyle = `
--cell-x-desktop:${Number(desktopRect.x) || 0};
--cell-y-desktop:${Number(desktopRect.y) || 0};
--cell-w-desktop:${Number(desktopRect.width) || 0};
--cell-h-desktop:${Number(desktopRect.height) || 0};
--cell-x-mobile:${Number(mobileRect.x) || 0};
--cell-y-mobile:${Number(mobileRect.y) || 0};
--cell-w-mobile:${Number(mobileRect.width) || 0};
--cell-h-mobile:${Number(mobileRect.height) || 0};
background:${safeBg};
`.trim();

              return `
<div class="galeria-celda galeria-celda--clickable"
     data-index="${idx}"
     data-gallery-image="1"
     role="button"
     tabindex="0"
     aria-label="Ver imagen en pantalla completa"
     style="${celdaStyle}">
  <img src="${safeSrc}" alt="" loading="lazy" decoding="async"
       style="width:100%;height:100%;object-fit:${safeFit};display:block;" />
</div>
`.trim();
            })
            .filter(Boolean)
            .join("");

          const htmlGaleriaDinamica = `
<div class="objeto galeria galeria--dynamic"
  data-gallery-layout-mode="${escapeAttr(layoutMode)}"
  data-gallery-layout-type="${escapeAttr(layoutType)}"
  style="${styleContenedorDinamico}">
  ${htmlCeldas}
</div>
`.trim();

          return envolverSiEnlace(htmlGaleriaDinamica, obj);
        }

        const styleContenedor = `
${baseStyle}
${styleSize(obj, w, h)}
display: grid;
grid-template-columns: repeat(${cols}, 1fr);
grid-template-rows: repeat(${rows}, 1fr);
gap: calc(${sGrid} * ${gapPx}px);
box-sizing: border-box;
`.trim();

        const total = rows * cols;
        const cells = Array.from({ length: total }, (_, i) => {
          const c = sourceCells[i] || {};
          return {
            mediaUrl: c.mediaUrl || "",
            fit: c.fit === "contain" ? "contain" : "cover",
            bg: sanitizeCssPaint(c.bg, "#f3f4f6"),
          };
        });

        const htmlCeldas = cells
          .map((cell, idx) => {
            const safeSrc = escapeAttr(cell.mediaUrl || "");
            const celdaStyle = `
position: relative;
width: 100%;
height: 100%;
overflow: hidden;
border-radius: calc(${sGrid} * ${radiusPx}px);
background: ${cell.bg};
`.trim();

            if (!safeSrc) {
              return `<div class="galeria-celda" data-index="${idx}" style="${celdaStyle}"></div>`;
            }

            return `
<div class="galeria-celda galeria-celda--clickable"
     data-index="${idx}"
     data-gallery-image="1"
     role="button"
     tabindex="0"
     aria-label="Ver imagen en pantalla completa"
     style="${celdaStyle}">
  <img src="${safeSrc}" alt="" loading="lazy" decoding="async"
       style="width:100%;height:100%;object-fit:${cell.fit};display:block;" />
</div>
`.trim();
          })
          .join("");

        const htmlGaleria = `<div class="objeto galeria" style="${styleContenedor}">${htmlCeldas}</div>`;
        return envolverSiEnlace(htmlGaleria, obj);
      }

      // ---------------- RSVP BOTÓN ----------------
      if (tipo === "rsvp-boton" || tipo === "regalo-boton") {
        const isGiftButton = tipo === "regalo-boton";
        const ctaContract = getFunctionalCtaContractForObjectType(
          tipo,
          options.functionalCtaContract
        );
        // Compatibility: direct object rendering still treats CTA buttons as interactive
        // when no resolved root/object contract was provided by the caller.
        const ctaReady = ctaContract ? ctaContract.ready === true : true;
        const ctaReason = ctaContract ? ctaContract.reason : "ready";
        const textoRaw = obj.texto || (isGiftButton ? "Ver regalos" : "Confirmar asistencia");
        const texto = escapeHTML(textoRaw);
        const w = Number.isFinite(obj?.width)
          ? obj.width
          : (Number.isFinite(obj?.ancho) ? obj.ancho : 200);
        const h = Number.isFinite(obj?.height)
          ? obj.height
          : (Number.isFinite(obj?.alto) ? obj.alto : 50);

        const rsvpVisual = resolveRsvpButtonVisual(obj || {});
        const fontSize = Number.isFinite(obj?.fontSize) ? obj.fontSize : 18;
        const cornerRadius = Number.isFinite(obj?.cornerRadius) ? obj.cornerRadius : 8;
        const fontFamily = obj.fontFamily || "sans-serif";
        const fontWeight = obj.fontWeight || "bold";
        const fontStyle = obj.fontStyle || "normal";
        const textDecoration = obj.textDecoration || "none";
        const align = obj.align || "center";

        const baseStyle = stylePosBase(obj);
        // Grouped CTAs must stay above decorative siblings so clicks keep hitting
        // the functional node instead of an overlapping group child without CTA semantics.
        const groupedReadyCtaLayerStyle =
          isGroupChildRender && ctaReady ? "z-index: 2147483647;" : "";

        // RSVP (contenido): si está en pantalla, fittea (sContenidoVar)
        const sBtn = isFullBleed(obj) ? "var(--sx)" : sContenidoVar(obj);

        const style = `
${baseStyle}
${groupedReadyCtaLayerStyle}
width: ${pxX(obj, w)};
height: ${pxY(obj, h)};
background: ${rsvpVisual.cssBackground};
color: ${rsvpVisual.textColor};
font-size: calc(${sBtn} * ${fontSize}px);
font-family: ${fontFamily};
font-weight: ${fontWeight};
font-style: ${fontStyle};
text-decoration: ${textDecoration};
text-align: ${align};
display: flex;
align-items: center;
justify-content: center;
border-radius: calc(${sBtn} * ${cornerRadius}px);
border: ${rsvpVisual.cssBorder};
box-shadow: ${rsvpVisual.cssShadow};
cursor: ${ctaReady ? "pointer" : "default"};
`.trim();

        const stateAttrs = ctaReady
          ? `data-cta-state="ready"
  data-accion="${isGiftButton ? "abrir-regalos" : "abrir-rsvp"}"
  ${isGiftButton ? "data-gift-open" : "data-rsvp-open"}
  role="button"
  tabindex="0"`
          : `data-cta-state="unavailable"
  data-cta-reason="${escapeAttr(ctaReason)}"
  aria-disabled="true"
  title="No disponible"`;
        const interactiveClass = ctaReady ? "is-interactive" : "is-functional-cta-unavailable";

        const htmlRsvp = `
<div class="objeto ${interactiveClass} ${isGiftButton ? "regalo-boton" : "rsvp-boton"}"
  ${!isGiftButton && ctaReady ? 'id="abrirModalRSVP"' : ""}
  ${stateAttrs}
  aria-label="${escapeAttr(textoRaw)}"
  style="${style}">
  ${texto}
</div>
`.trim();
        return appendMotionDataAttrs(htmlRsvp, obj);
      }

      // ---------------- FORMAS ----------------
      if (tipo === "forma") {
        const fill = obj.color || "#000";
        const figura = obj.figura;

        if (figura === "rect") {
          const w = Number.isFinite(obj?.width) ? obj.width : 100;
          const h = Number.isFinite(obj?.height) ? obj.height : 100;
          const cornerRadius = obj.cornerRadius || 0;

          const fontSize = obj.fontSize || 24;
          const fontFamily = obj.fontFamily || "sans-serif";
          const fontWeight = obj.fontWeight || "normal";
          const fontStyle = obj.fontStyle || "normal";
          const textDecoration = obj.textDecoration || "none";
          const align = obj.align || "center";
          const colorTexto = obj.colorTexto || "#000000";
          const texto = escHTML(obj.texto || "");

          const baseStyle = stylePosBase(obj);
          const sRectText = isFullBleed(obj) ? "var(--sx)" : sContenidoVar(obj);

          const style = `
${baseStyle}
width: ${pxX(obj, w)};
height: ${pxY(obj, h)};
background: ${fill};
border-radius: calc(${sRectText} * ${cornerRadius}px);
display: flex;
align-items: center;
justify-content: ${align === "left" ? "flex-start" : align === "right" ? "flex-end" : "center"
            };
text-align: ${align};
padding: calc(${sRectText} * 4px);
box-sizing: border-box;
`.trim();

          const inner = `
<div style="
  width: 100%;
  font-size: calc(${sRectText} * ${fontSize}px);
  font-family: ${fontFamily};
  font-weight: ${fontWeight};
  font-style: ${fontStyle};
  text-decoration: ${textDecoration};
  color: ${colorTexto};
  line-height: 1.2;
  white-space: pre-wrap;
  word-break: break-word;
">${texto}</div>
`.trim();

          return envolverSiEnlace(`<div class="objeto" style="${style}">${inner}</div>`, obj);
        }

        if (figura === "circle") {
          const radius = Number.isFinite(obj?.radius) ? obj.radius : 50;
          const diameter = radius * 2;

          const x = Number(obj?.x || 0) - radius;
          const yPxCenter = getYPxEditor(obj);
          const yPxTopLeft = yPxCenter - radius;

          const rot = obj?.rotation ?? 0;
          const scaleX = obj?.scaleX ?? 1;
          const scaleY = obj?.scaleY ?? 1;

          const style = `
position: absolute;
left: ${pxX(obj, x)};
top: ${topCSSFromYPx(obj, yPxTopLeft)};
width: ${pxX(obj, diameter)};
height: ${pxY(obj, diameter)};
border-radius: 50%;
background: ${fill};
transform: rotate(${rot}deg) scale(${scaleX}, ${scaleY});
transform-origin: center center;
pointer-events: auto;
`.trim();

          return envolverSiEnlace(`<div class="objeto" style="${style}"></div>`, obj);
        }

        if (figura === "pill") {
          const w = Math.max(1, Number.isFinite(obj?.width) ? Number(obj.width) : 170);
          const h = Math.max(1, Number.isFinite(obj?.height) ? Number(obj.height) : 72);
          const cornerRadius = Number.isFinite(obj?.cornerRadius)
            ? Number(obj.cornerRadius)
            : Math.max(10, Math.round(h / 2));
          const baseStyle = stylePosBase(obj);
          const sPill = isFullBleed(obj) ? "var(--sx)" : sContenidoVar(obj);

          const style = `
${baseStyle}
width: ${pxX(obj, w)};
height: ${pxY(obj, h)};
background: ${fill};
border-radius: calc(${sPill} * ${cornerRadius}px);
box-sizing: border-box;
pointer-events: auto;
`.trim();

          return envolverSiEnlace(`<div class="objeto" style="${style}"></div>`, obj);
        }

        if (figura === "line") {
          return envolverSiEnlace(renderShapeLineSvgHtml(obj, fill), obj);
          const points = obj.points || [0, 0, LINE_CONSTANTS.DEFAULT_LENGTH, 0];
          const x1 = parseFloat(points[0]) || 0;
          const y1 = parseFloat(points[1]) || 0;
          const x2 = parseFloat(points[2]) || LINE_CONSTANTS.DEFAULT_LENGTH;
          const y2 = parseFloat(points[3]) || 0;

          const strokeWidth = obj.strokeWidth || LINE_CONSTANTS.STROKE_WIDTH;

          const deltaX = x2 - x1;
          const deltaY = y2 - y1;
          const length = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
          const angle = Math.atan2(deltaY, deltaX) * (180 / Math.PI);

          const startX = Number(obj?.x || 0) + x1;

          const baseY = getYPxEditor(obj);
          const startY = baseY + y1;

          const totalRotation = angle + (obj.rotation || 0);
          const scaleX = obj?.scaleX ?? 1;
          const scaleY = obj?.scaleY ?? 1;

          // alto de línea: usamos escala Y del objeto (contenido: sfinal/sx, bleed: sx)
          const lineH = `calc(${sY(obj)} * ${strokeWidth}px)`;

          const style = `
position: absolute;
left: ${pxX(obj, startX)};
top: ${topCSSFromYPx(obj, startY)};
width: ${pxX(obj, length)};
height: ${lineH};
background: ${fill};
border-radius: ${lineH};
transform: rotate(${totalRotation}deg) scale(${scaleX}, ${scaleY});
transform-origin: 0 50%;
pointer-events: auto;
`.trim();

          return envolverSiEnlace(`<div class="objeto linea" style="${style}"></div>`, obj);
        }

        if (figura === "triangle") {
          const radius = obj.radius || 60;

          const sin60 = Math.sqrt(3) / 2;
          const cos60 = 0.5;

          const triangleWidth = 2 * radius * sin60;
          const triangleHeight = radius * (1 + cos60);
          const centroidOffsetY = triangleHeight / 3;

          const baseY = getYPxEditor(obj);
          const topContainerPx = baseY - (triangleHeight - centroidOffsetY);
          const leftContainer = Number(obj?.x || 0) - triangleWidth / 2;

          const baseStyle = `
position: absolute;
left: ${pxX(obj, leftContainer)};
top: ${topCSSFromYPx(obj, topContainerPx)};
width: ${pxX(obj, triangleWidth)};
height: ${pxY(obj, triangleHeight)};
background: ${fill};
clip-path: polygon(50% 0%, 0% 100%, 100% 100%);
transform: rotate(${obj.rotation ?? 0}deg) scale(${obj.scaleX ?? 1}, ${obj.scaleY ?? 1});
transform-origin: center center;
pointer-events: auto;
`.trim();

          return envolverSiEnlace(`<div class="objeto" style="${baseStyle}"></div>`, obj);
        }

        if (figura === "diamond") {
          const w = Math.max(1, Number.isFinite(obj?.width) ? Number(obj.width) : 120);
          const h = Math.max(1, Number.isFinite(obj?.height) ? Number(obj.height) : 120);
          return envolverSiEnlace(
            renderShapePolygonSvgHtml(obj, fill, w, h, buildDiamondSvgPoints(w, h)),
            obj
          );
        }

        if (figura === "star") {
          const w = Math.max(1, Number.isFinite(obj?.width) ? Number(obj.width) : 120);
          const h = Math.max(1, Number.isFinite(obj?.height) ? Number(obj.height) : 120);
          return envolverSiEnlace(
            renderShapePolygonSvgHtml(obj, fill, w, h, buildStarSvgPoints(w, h)),
            obj
          );
        }

        if (figura === "arrow") {
          const w = Math.max(1, Number.isFinite(obj?.width) ? Number(obj.width) : 160);
          const h = Math.max(1, Number.isFinite(obj?.height) ? Number(obj.height) : 90);
          return envolverSiEnlace(
            renderShapePolygonSvgHtml(
              obj,
              fill,
              w,
              h,
              buildArrowSvgPoints(w, h)
            ),
            obj
          );
        }

        if (figura === "pentagon") {
          const w = Math.max(1, Number.isFinite(obj?.width) ? Number(obj.width) : 120);
          const h = Math.max(1, Number.isFinite(obj?.height) ? Number(obj.height) : 120);
          return envolverSiEnlace(
            renderShapePolygonSvgHtml(obj, fill, w, h, buildRegularPolygonSvgPoints(5, w, h)),
            obj
          );
        }

        if (figura === "hexagon") {
          const w = Math.max(1, Number.isFinite(obj?.width) ? Number(obj.width) : 128);
          const h = Math.max(1, Number.isFinite(obj?.height) ? Number(obj.height) : 112);
          return envolverSiEnlace(
            renderShapePolygonSvgHtml(obj, fill, w, h, buildRegularPolygonSvgPoints(6, w, h)),
            obj
          );
        }

        if (figura === "heart") {
          const w = Math.max(1, Number.isFinite(obj?.width) ? Number(obj.width) : 120);
          const h = Math.max(1, Number.isFinite(obj?.height) ? Number(obj.height) : 108);
          return envolverSiEnlace(
            renderShapePathSvgHtml(obj, fill, w, h, buildHeartSvgPath(w, h)),
            obj
          );
        }

        return "";
      }

      return "";
    })
    .join("\n");
}
