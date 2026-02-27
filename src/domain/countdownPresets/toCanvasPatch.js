import { normalizeVisibleUnits } from "@/domain/countdownPresets/renderModel";

function toFinite(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function estimateChipWidth(tamanoBase, visibleUnits, distribution) {
  const base = Math.max(220, toFinite(tamanoBase, 320));
  const unitsCount = Math.max(1, normalizeVisibleUnits(visibleUnits).length);

  if (distribution === "vertical") return Math.round(base * 0.48);
  if (distribution === "grid") return Math.round(base * 0.42);
  if (distribution === "editorial") {
    if (unitsCount <= 2) return Math.round(base * 0.45);
    return Math.round(base * 0.34);
  }
  return Math.round(base / unitsCount) - 8;
}

export function buildCountdownCanvasPatchFromPreset({
  presetId,
  activeVersion,
  layout = {},
  tipografia = {},
  colores = {},
  animaciones = {},
  unidad = {},
  tamanoBase = 320,
  svgRef = {},
}) {
  const visibleUnits = normalizeVisibleUnits(layout.visibleUnits);
  const distribution = layout.distribution || "centered";
  const gap = toFinite(layout.gap, 8);
  const framePadding = toFinite(layout.framePadding, 10);
  const chipWidth = Math.max(34, estimateChipWidth(tamanoBase, visibleUnits, distribution));
  const numberSize = Math.max(10, toFinite(tipografia.numberSize, 28));
  const labelSize = Math.max(8, toFinite(tipografia.labelSize, 12));

  return {
    countdownSchemaVersion: 2,
    presetId,
    presetVersion: Number(activeVersion || 1),
    tamanoBase: Math.max(220, toFinite(tamanoBase, 320)),
    layoutType: layout.type || "singleFrame",
    distribution,
    visibleUnits,
    gap,
    framePadding,
    frameSvgUrl: svgRef.downloadUrl || null,
    frameColorMode: svgRef.colorMode || "fixed",
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
  };
}
