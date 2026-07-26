const {
  normalizeCountdownFrameScale,
} = require("./countdownFrameGeometry.cjs");

const COUNTDOWN_DEFAULT_VISIBLE_UNITS = Object.freeze([
  "days",
  "hours",
  "minutes",
  "seconds",
]);

const COUNTDOWN_LAYOUT_DEFAULTS = Object.freeze({
  distribution: "centered",
  layoutType: "singleFrame",
  gap: 8,
  framePadding: 10,
  paddingX: 8,
  paddingY: 6,
  chipWidth: 46,
  fontSize: 16,
  labelSize: 10,
  lineHeight: 1.05,
  letterSpacing: 0,
  boxRadius: 8,
  tamanoBase: 320,
});

const COUNTDOWN_VALID_UNITS = new Set(COUNTDOWN_DEFAULT_VISIBLE_UNITS);

function toFiniteCountdownMetric(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clampCountdownMetric(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalizeCountdownVisibleUnits(value) {
  if (!Array.isArray(value) || value.length === 0) {
    return [...COUNTDOWN_DEFAULT_VISIBLE_UNITS];
  }

  const units = [];
  value.forEach((entry) => {
    const unit = String(entry || "").trim().toLowerCase();
    if (!COUNTDOWN_VALID_UNITS.has(unit) || units.includes(unit)) return;
    units.push(unit);
  });
  return units.length ? units : [...COUNTDOWN_DEFAULT_VISIBLE_UNITS];
}

function estimateCountdownUnitHeight({
  tamanoBase = COUNTDOWN_LAYOUT_DEFAULTS.tamanoBase,
  distribution = COUNTDOWN_LAYOUT_DEFAULTS.distribution,
  unitsCount = COUNTDOWN_DEFAULT_VISIBLE_UNITS.length,
} = {}) {
  const base = clampCountdownMetric(
    toFiniteCountdownMetric(
      tamanoBase,
      COUNTDOWN_LAYOUT_DEFAULTS.tamanoBase
    ),
    220,
    960
  );
  const count = Math.max(1, Math.min(4, Number(unitsCount || 4)));
  const mode = String(
    distribution || COUNTDOWN_LAYOUT_DEFAULTS.distribution
  ).toLowerCase();

  if (mode === "vertical") return Math.max(44, Math.round(base * 0.17));
  if (mode === "grid") return Math.max(44, Math.round(base * 0.2));
  if (mode === "editorial") return Math.max(44, Math.round(base * 0.16));

  const centeredScale =
    count <= 1 ? 0.34 : count === 2 ? 0.24 : count === 3 ? 0.18 : 0.15;
  return Math.max(44, Math.round(base * centeredScale));
}

function resolveCountdownUnitWidth({
  width = COUNTDOWN_LAYOUT_DEFAULTS.chipWidth,
  height = 44,
  boxRadius = 0,
} = {}) {
  const safeWidth = Math.max(1, toFiniteCountdownMetric(width, 46));
  const safeHeight = Math.max(1, toFiniteCountdownMetric(height, 44));
  const safeRadius = clampCountdownMetric(
    toFiniteCountdownMetric(boxRadius, 0),
    0,
    999
  );
  const roundedThreshold = safeHeight / 2;

  if (safeWidth <= safeHeight || safeRadius <= roundedThreshold) {
    return Math.round(safeWidth);
  }

  const circleThreshold = safeHeight;
  const blend =
    circleThreshold <= roundedThreshold
      ? 1
      : clampCountdownMetric(
          (safeRadius - roundedThreshold) /
            (circleThreshold - roundedThreshold),
          0,
          1
        );

  return Math.round(safeWidth + (safeHeight - safeWidth) * blend);
}

function buildCountdownEditorialWidths({
  unitsCount = COUNTDOWN_DEFAULT_VISIBLE_UNITS.length,
  baseChipWidth = COUNTDOWN_LAYOUT_DEFAULTS.chipWidth,
  chipHeight = 44,
  boxRadius = 0,
} = {}) {
  const count = Math.max(1, Math.min(4, Number(unitsCount) || 1));
  return Array.from({ length: count }, (_, index) =>
    resolveCountdownUnitWidth({
      width: Math.max(
        34,
        Math.round(
          Number(baseChipWidth || COUNTDOWN_LAYOUT_DEFAULTS.chipWidth) *
            (index === 0 && count > 1 ? 1.25 : 0.88)
        )
      ),
      height: chipHeight,
      boxRadius,
    })
  );
}

function normalizeCountdownLayoutType(value) {
  const raw = String(
    value || COUNTDOWN_LAYOUT_DEFAULTS.layoutType
  ).trim();
  const key = raw.toLowerCase();
  if (key === "multiunit") {
    return { layoutType: "multiUnit", layoutTypeKey: "multiunit" };
  }
  return { layoutType: "singleFrame", layoutTypeKey: "singleframe" };
}

function normalizeCountdownDistribution(value) {
  const distribution = String(
    value || COUNTDOWN_LAYOUT_DEFAULTS.distribution
  )
    .trim()
    .toLowerCase();
  return ["centered", "vertical", "grid", "editorial"].includes(distribution)
    ? distribution
    : COUNTDOWN_LAYOUT_DEFAULTS.distribution;
}

function resolveCountdownLayoutMetrics(source = {}) {
  const countdown =
    source && typeof source === "object" && !Array.isArray(source)
      ? source
      : {};
  const visibleUnits = normalizeCountdownVisibleUnits(countdown.visibleUnits);
  const unitsCount = Math.max(1, visibleUnits.length);
  const distribution = normalizeCountdownDistribution(
    countdown.distribution || countdown.layoutType
  );
  const { layoutType, layoutTypeKey } = normalizeCountdownLayoutType(
    countdown.layoutType
  );
  const frameSvgUrl = String(countdown.frameSvgUrl || "").trim();
  const frameAssetType =
    String(countdown.frameAssetType || "").toLowerCase() === "png"
      ? "png"
      : "svg";
  const hasFrameConfigured = frameSvgUrl.length > 0;
  const useSingleFrameLayout =
    layoutTypeKey === "singleframe" && hasFrameConfigured;
  const useMultiUnitFrame =
    layoutTypeKey === "multiunit" && hasFrameConfigured;
  const gap = clampCountdownMetric(
    toFiniteCountdownMetric(countdown.gap, COUNTDOWN_LAYOUT_DEFAULTS.gap),
    0,
    48
  );
  const framePadding = Math.max(
    0,
    toFiniteCountdownMetric(
      countdown.framePadding,
      COUNTDOWN_LAYOUT_DEFAULTS.framePadding
    )
  );
  const frameScale = normalizeCountdownFrameScale(countdown.frameScale);
  const paddingX = Math.max(
    2,
    toFiniteCountdownMetric(
      countdown.paddingX,
      COUNTDOWN_LAYOUT_DEFAULTS.paddingX
    )
  );
  const paddingY = Math.max(
    2,
    toFiniteCountdownMetric(
      countdown.paddingY,
      COUNTDOWN_LAYOUT_DEFAULTS.paddingY
    )
  );
  const valueSize = Math.max(
    10,
    toFiniteCountdownMetric(
      countdown.fontSize,
      COUNTDOWN_LAYOUT_DEFAULTS.fontSize
    )
  );
  const labelSize = Math.max(
    8,
    toFiniteCountdownMetric(
      countdown.labelSize,
      COUNTDOWN_LAYOUT_DEFAULTS.labelSize
    )
  );
  const lineHeight = Math.max(
    0.8,
    toFiniteCountdownMetric(
      countdown.lineHeight,
      COUNTDOWN_LAYOUT_DEFAULTS.lineHeight
    )
  );
  const letterSpacing = toFiniteCountdownMetric(
    countdown.letterSpacing,
    COUNTDOWN_LAYOUT_DEFAULTS.letterSpacing
  );
  const showLabels = countdown.showLabels !== false;
  const boxRadius = Math.max(
    0,
    toFiniteCountdownMetric(
      countdown.boxRadius,
      COUNTDOWN_LAYOUT_DEFAULTS.boxRadius
    )
  );
  const chipWidth = toFiniteCountdownMetric(
    countdown.chipWidth,
    COUNTDOWN_LAYOUT_DEFAULTS.chipWidth
  );
  const requestedChipW = Math.max(36, chipWidth + paddingX * 2);
  const textDrivenChipH = Math.max(
    44,
    paddingY * 2 + valueSize + (showLabels ? labelSize + 6 : 0)
  );
  const tamanoBase = toFiniteCountdownMetric(
    countdown.tamanoBase,
    COUNTDOWN_LAYOUT_DEFAULTS.tamanoBase
  );
  const layoutDrivenChipH = estimateCountdownUnitHeight({
    tamanoBase,
    distribution,
    unitsCount,
  });
  const chipH = Math.max(textDrivenChipH, layoutDrivenChipH);
  const baseChipW = resolveCountdownUnitWidth({
    width: requestedChipW,
    height: chipH,
    boxRadius,
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
      ? buildCountdownEditorialWidths({
          unitsCount,
          baseChipWidth: baseChipW,
          chipHeight: chipH,
          boxRadius,
        })
      : [];
  const naturalW =
    distribution === "vertical"
      ? baseChipW
      : distribution === "grid"
        ? cols * baseChipW + gap * (cols - 1)
        : distribution === "editorial"
          ? editorialWidths.reduce((total, width) => total + width, 0) +
            gap * Math.max(0, unitsCount - 1)
          : unitsCount * baseChipW + gap * (unitsCount - 1);
  const naturalH =
    distribution === "vertical" || distribution === "grid"
      ? rows * chipH + gap * Math.max(0, rows - 1)
      : chipH;
  const naturalContainerW =
    naturalW + (useSingleFrameLayout ? framePadding * 2 : 0);
  const naturalContainerH =
    naturalH + (useSingleFrameLayout ? framePadding * 2 : 0);
  const containerW = Math.max(
    toFiniteCountdownMetric(countdown.width, 0),
    naturalContainerW
  );
  const containerH = Math.max(
    toFiniteCountdownMetric(countdown.height, 0),
    naturalContainerH
  );
  const contentBounds = {
    x: useSingleFrameLayout ? framePadding : 0,
    y: useSingleFrameLayout ? framePadding : 0,
    width: Math.max(
      1,
      containerW - (useSingleFrameLayout ? framePadding * 2 : 0)
    ),
    height: Math.max(
      1,
      containerH - (useSingleFrameLayout ? framePadding * 2 : 0)
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
  const startX =
    contentBounds.x + (contentBounds.width - distributionW) / 2;
  const startY =
    contentBounds.y + (contentBounds.height - distributionH) / 2;

  let unitLayouts;
  if (distribution === "vertical") {
    unitLayouts = visibleUnits.map((unit, index) => ({
      key: unit,
      unit,
      x: contentBounds.x + (contentBounds.width - baseChipW) / 2,
      y: startY + index * (chipH + gap),
      width: baseChipW,
      height: chipH,
    }));
  } else if (distribution === "grid") {
    unitLayouts = visibleUnits.map((unit, index) => {
      const row = Math.floor(index / cols);
      const col = index % cols;
      return {
        key: unit,
        unit,
        x: startX + col * (baseChipW + gap),
        y: startY + row * (chipH + gap),
        width: baseChipW,
        height: chipH,
      };
    });
  } else if (distribution === "editorial") {
    let cursorX = startX;
    unitLayouts = visibleUnits.map((unit, index) => {
      const width = editorialWidths[index] || baseChipW;
      const item = {
        key: unit,
        unit,
        x: cursorX,
        y: startY,
        width,
        height: chipH,
      };
      cursorX += width + gap;
      return item;
    });
  } else {
    unitLayouts = visibleUnits.map((unit, index) => ({
      key: unit,
      unit,
      x: startX + index * (baseChipW + gap),
      y: startY,
      width: baseChipW,
      height: chipH,
    }));
  }

  const separatorText = String(countdown.separator || "");
  const separatorFontSize = Math.max(10, Math.round(valueSize * 0.64));
  const canRenderSeparators =
    Boolean(separatorText) &&
    distribution !== "vertical" &&
    distribution !== "grid" &&
    unitLayouts.length > 1;
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
    visibleUnits,
    unitsCount,
    distribution,
    layoutType,
    layoutTypeKey,
    frameSvgUrl,
    frameAssetType,
    hasFrameConfigured,
    useSingleFrameLayout,
    useMultiUnitFrame,
    gap,
    framePadding,
    frameScale,
    paddingX,
    paddingY,
    valueSize,
    labelSize,
    lineHeight,
    letterSpacing,
    showLabels,
    boxRadius,
    chipWidth,
    tamanoBase,
    chipH,
    baseChipW,
    cols,
    rows,
    editorialWidths,
    naturalW,
    naturalH,
    naturalContainerW,
    naturalContainerH,
    containerW,
    containerH,
    contentBounds,
    distributionW,
    distributionH,
    startX,
    startY,
    unitLayouts,
    separatorText,
    separatorFontSize,
    canRenderSeparators,
    separatorLayouts,
  };
}

module.exports = {
  COUNTDOWN_DEFAULT_VISIBLE_UNITS,
  COUNTDOWN_LAYOUT_DEFAULTS,
  normalizeCountdownVisibleUnits,
  estimateCountdownUnitHeight,
  resolveCountdownUnitWidth,
  buildCountdownEditorialWidths,
  resolveCountdownLayoutMetrics,
};
