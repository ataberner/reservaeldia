const ICON_RENDER_SCHEMA_VERSION = 1;
const ICON_RENDER_CONTRACT_ID = "icon_svg_snapshot_v1";
const ICON_RENDER_MAX_SVG_BYTES = 64 * 1024;
const DEFAULT_ICON_COLOR = "#111827";

function asObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value;
}

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function parseViewBox(value) {
  const raw = normalizeText(value);
  if (!raw) return null;
  const parts = raw.split(/[\s,]+/).map((token) => Number(token));
  if (
    parts.length !== 4 ||
    parts.some((part) => !Number.isFinite(part)) ||
    parts[2] <= 0 ||
    parts[3] <= 0
  ) {
    return null;
  }

  return {
    value: parts.join(" "),
    minX: parts[0],
    minY: parts[1],
    width: parts[2],
    height: parts[3],
  };
}

function normalizeIconColor(value) {
  const color = normalizeText(value);
  if (/^#[0-9a-f]{3,8}$/i.test(color)) return color;
  return DEFAULT_ICON_COLOR;
}

function normalizeIconRenderable(value) {
  const raw = asObject(value);
  const schemaVersion = Number(raw.schemaVersion);
  const contractId = normalizeText(raw.contractId);
  const mediaType = normalizeText(raw.mediaType).toLowerCase();
  const svgText = normalizeText(raw.svgText);
  const viewBox = parseViewBox(raw.viewBox);
  const colorMode = normalizeText(raw.colorMode).toLowerCase();
  const geometryCount = Number(raw.geometryCount);
  const bytes = Number(raw.bytes);
  const hashSha256 = normalizeText(raw.hashSha256).toLowerCase();

  if (schemaVersion !== ICON_RENDER_SCHEMA_VERSION) return null;
  if (contractId !== ICON_RENDER_CONTRACT_ID) return null;
  if (mediaType !== "image/svg+xml") return null;
  if (!svgText.startsWith("<svg") || !svgText.endsWith("</svg>")) return null;
  if (!viewBox) return null;
  if (colorMode !== "currentcolor" && colorMode !== "fixed") return null;
  if (!Number.isInteger(geometryCount) || geometryCount <= 0) return null;
  if (!Number.isInteger(bytes) || bytes <= 0 || bytes > ICON_RENDER_MAX_SVG_BYTES) {
    return null;
  }
  if (!/^[0-9a-f]{64}$/.test(hashSha256)) return null;

  return {
    schemaVersion: ICON_RENDER_SCHEMA_VERSION,
    contractId: ICON_RENDER_CONTRACT_ID,
    mediaType: "image/svg+xml",
    svgText,
    viewBox: viewBox.value,
    viewBoxWidth: viewBox.width,
    viewBoxHeight: viewBox.height,
    colorMode: colorMode === "currentcolor" ? "currentColor" : "fixed",
    geometryCount,
    bytes,
    hashSha256,
  };
}

function isCanonicalSvgIconRenderable(value) {
  return Boolean(normalizeIconRenderable(value));
}

function buildIconSvgMarkup(value, color) {
  const renderable = normalizeIconRenderable(value);
  if (!renderable) return "";
  if (renderable.colorMode !== "currentColor") return renderable.svgText;

  const safeColor = normalizeIconColor(color);
  return renderable.svgText.replace(
    /\b(fill|stroke|color|stop-color)="currentColor"/gi,
    (_match, attributeName) => `${attributeName}="${safeColor}"`
  );
}

function buildIconSvgDataUrl(value, color) {
  const svgText = buildIconSvgMarkup(value, color);
  if (!svgText) return "";
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgText)}`;
}

function computeIconContainRect(value, boxWidth, boxHeight) {
  const renderable = normalizeIconRenderable(value);
  const width = Number(boxWidth);
  const height = Number(boxHeight);
  if (!renderable || !Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0) {
    return null;
  }

  const scale = Math.min(
    width / renderable.viewBoxWidth,
    height / renderable.viewBoxHeight
  );
  const renderedWidth = renderable.viewBoxWidth * scale;
  const renderedHeight = renderable.viewBoxHeight * scale;
  return {
    x: (width - renderedWidth) / 2,
    y: (height - renderedHeight) / 2,
    width: renderedWidth,
    height: renderedHeight,
  };
}

module.exports = {
  ICON_RENDER_SCHEMA_VERSION,
  ICON_RENDER_CONTRACT_ID,
  ICON_RENDER_MAX_SVG_BYTES,
  DEFAULT_ICON_COLOR,
  parseViewBox,
  normalizeIconColor,
  normalizeIconRenderable,
  isCanonicalSvgIconRenderable,
  buildIconSvgMarkup,
  buildIconSvgDataUrl,
  computeIconContainRect,
};
