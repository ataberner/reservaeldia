const {
  normalizeCountdownVisibleUnits,
} = require("./countdownLayoutContract.cjs");
const {
  normalizeCountdownFrameScale,
} = require("./countdownFrameGeometry.cjs");
const {
  normalizeCountdownFrameColorMode,
  resolveCountdownFrameAssetType,
  resolveCountdownFrameMimeType,
} = require("./countdownFrameAssetContract.cjs");

const COUNTDOWN_CHIP_WIDTH_LIMITS = Object.freeze({ min: 34, max: 520 });

function toFinite(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function estimateCountdownPresetChipWidth(
  tamanoBase,
  visibleUnits,
  distribution
) {
  const base = Math.max(220, toFinite(tamanoBase, 320));
  const unitsCount = Math.max(1, visibleUnits.length);

  if (distribution === "vertical") return Math.round(base * 0.48);
  if (distribution === "grid") return Math.round(base * 0.42);
  if (distribution === "editorial") {
    return Math.round(base * (unitsCount <= 2 ? 0.45 : 0.34));
  }
  return Math.round(base / unitsCount) - 8;
}

function resolveCountdownPresetChipWidth({
  chipWidth,
  tamanoBase,
  visibleUnits,
  distribution,
} = {}) {
  // `null` is the persisted auto-width sentinel. Do not coerce it through
  // Number(null), because that turns the sentinel into an explicit zero.
  if (Number.isFinite(chipWidth)) {
    return Math.max(
      COUNTDOWN_CHIP_WIDTH_LIMITS.min,
      Math.min(COUNTDOWN_CHIP_WIDTH_LIMITS.max, chipWidth)
    );
  }

  return Math.max(
    COUNTDOWN_CHIP_WIDTH_LIMITS.min,
    estimateCountdownPresetChipWidth(
      tamanoBase,
      visibleUnits,
      distribution
    )
  );
}

function buildCountdownCanvasPatchFromPreset({
  presetId,
  activeVersion,
  layout = {},
  tipografia = {},
  colores = {},
  animaciones = {},
  unidad = {},
  tamanoBase = 320,
  svgRef = {},
} = {}) {
  const frameRef =
    svgRef && typeof svgRef === "object" && !Array.isArray(svgRef)
      ? svgRef
      : {};
  const visibleUnits = normalizeCountdownVisibleUnits(layout.visibleUnits);
  const distribution = layout.distribution || "centered";
  const normalizedBaseSize = Math.max(220, toFinite(tamanoBase, 320));
  const gap = toFinite(layout.gap, 8);
  const framePadding = toFinite(layout.framePadding, 10);
  const frameScale = normalizeCountdownFrameScale(layout.frameScale);
  const chipWidth = resolveCountdownPresetChipWidth({
    chipWidth: layout.chipWidth,
    tamanoBase: normalizedBaseSize,
    visibleUnits,
    distribution,
  });
  const numberSize = Math.max(10, toFinite(tipografia.numberSize, 28));
  const labelSize = Math.max(8, toFinite(tipografia.labelSize, 12));
  const frameAssetType = frameRef.downloadUrl
    ? resolveCountdownFrameAssetType(frameRef, "svg")
    : null;
  const frameMimeType = frameAssetType
    ? resolveCountdownFrameMimeType(frameRef, frameAssetType)
    : null;

  return {
    countdownSchemaVersion: 2,
    presetId,
    presetVersion: Number(activeVersion || 1),
    tamanoBase: normalizedBaseSize,
    layoutType: layout.type || "singleFrame",
    distribution,
    visibleUnits,
    gap,
    framePadding,
    frameScale,
    frameSvgUrl: frameRef.downloadUrl || null,
    frameAssetType,
    frameMimeType,
    frameIntrinsicWidth: Number(frameRef.width || 0) || null,
    frameIntrinsicHeight: Number(frameRef.height || 0) || null,
    frameColorMode: normalizeCountdownFrameColorMode(
      frameAssetType,
      frameRef.colorMode
    ),
    frameColor: colores.frameColor || "#773dbe",
    fontFamily: tipografia.fontFamily || "Poppins",
    fontSize: numberSize,
    labelSize,
    letterSpacing: toFinite(tipografia.letterSpacing, 0),
    lineHeight: toFinite(tipografia.lineHeight, 1.05),
    labelTransform: tipografia.labelTransform || "uppercase",
    color: colores.numberColor || "#111111",
    labelColor: colores.labelColor || "#4b5563",
    entryAnimation: animaciones.entry || "fadeUp",
    tickAnimation: animaciones.tick || "flipSoft",
    frameAnimation: animaciones.frame || "none",
    showLabels: unidad.showLabels !== false,
    padZero: true,
    separator: String(unidad.separator || ""),
    paddingX: Math.max(4, Math.round(framePadding * 0.52)),
    paddingY: Math.max(4, Math.round(framePadding * 0.4)),
    chipWidth,
    layout: "pills",
    background: "transparent",
    boxBg: unidad.boxBg || "transparent",
    boxBorder: unidad.boxBorder || "transparent",
    boxRadius: Math.max(0, toFinite(unidad.boxRadius, 10)),
    boxShadow: unidad.boxShadow === true,
    presetPropsVersion: 2,
  };
}

module.exports = {
  COUNTDOWN_CHIP_WIDTH_LIMITS,
  estimateCountdownPresetChipWidth,
  resolveCountdownPresetChipWidth,
  buildCountdownCanvasPatchFromPreset,
};
