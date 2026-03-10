import { roundMetric } from "@/components/editor/overlays/inlineEditor/inlineEditorNumeric";

function toFiniteNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function toFiniteNumberFallback(...values) {
  for (let index = 0; index < values.length; index += 1) {
    const numeric = toFiniteNumber(values[index]);
    if (numeric !== null) return numeric;
  }
  return null;
}

function roundNullable(value) {
  const numeric = toFiniteNumber(value);
  return numeric === null ? null : roundMetric(numeric);
}

function normalizeRect(rect) {
  if (!rect) return null;
  const x = toFiniteNumber(rect.x);
  const y = toFiniteNumber(rect.y);
  const width = toFiniteNumber(rect.width);
  const height = toFiniteNumber(rect.height);
  if ([x, y, width, height].some((value) => value === null)) return null;
  return { x, y, width, height };
}

function roundRect(rect) {
  const normalized = normalizeRect(rect);
  if (!normalized) return null;
  return {
    x: roundMetric(normalized.x),
    y: roundMetric(normalized.y),
    width: roundMetric(normalized.width),
    height: roundMetric(normalized.height),
  };
}

function unionRects(rects = []) {
  const usable = (Array.isArray(rects) ? rects : [])
    .map((rect) => normalizeRect(rect))
    .filter(Boolean);
  if (usable.length === 0) return null;
  let left = Number.POSITIVE_INFINITY;
  let top = Number.POSITIVE_INFINITY;
  let right = Number.NEGATIVE_INFINITY;
  let bottom = Number.NEGATIVE_INFINITY;
  usable.forEach((rect) => {
    left = Math.min(left, rect.x);
    top = Math.min(top, rect.y);
    right = Math.max(right, rect.x + rect.width);
    bottom = Math.max(bottom, rect.y + rect.height);
  });
  if (![left, top, right, bottom].every(Number.isFinite)) return null;
  return {
    x: left,
    y: top,
    width: Math.max(0, right - left),
    height: Math.max(0, bottom - top),
  };
}

function buildInkFromAbsoluteRect(boxRect, inkRect) {
  const box = normalizeRect(boxRect);
  const ink = normalizeRect(inkRect);
  if (!box || !ink) {
    return {
      ink: null,
      inset: {
        top: null,
        bottom: null,
        left: null,
        right: null,
      },
    };
  }
  const inkTop = ink.y;
  const inkBottom = ink.y + ink.height;
  const inkLeft = ink.x;
  const inkRight = ink.x + ink.width;
  return {
    ink: {
      top: roundMetric(inkTop),
      bottom: roundMetric(inkBottom),
      height: roundMetric(ink.height),
      centerY: roundMetric(inkTop + ink.height / 2),
      left: roundMetric(inkLeft),
      right: roundMetric(inkRight),
      width: roundMetric(ink.width),
      centerX: roundMetric(inkLeft + ink.width / 2),
    },
    inset: {
      top: roundMetric(inkTop - box.y),
      bottom: roundMetric(box.y + box.height - inkBottom),
      left: roundMetric(inkLeft - box.x),
      right: roundMetric(box.x + box.width - inkRight),
    },
  };
}

function pickAxisMetric(primary, fallback) {
  const primaryValue = toFiniteNumber(primary);
  if (primaryValue !== null) return primaryValue;
  return toFiniteNumber(fallback);
}

function composeInkModel({
  verticalInk = null,
  horizontalInk = null,
  verticalInset = null,
  horizontalInset = null,
}) {
  const top = pickAxisMetric(verticalInk?.top, horizontalInk?.top);
  const bottom = pickAxisMetric(verticalInk?.bottom, horizontalInk?.bottom);
  const height = pickAxisMetric(verticalInk?.height, horizontalInk?.height);
  const centerY = pickAxisMetric(verticalInk?.centerY, horizontalInk?.centerY);
  const left = pickAxisMetric(horizontalInk?.left, verticalInk?.left);
  const right = pickAxisMetric(horizontalInk?.right, verticalInk?.right);
  const width = pickAxisMetric(horizontalInk?.width, verticalInk?.width);
  const centerX = pickAxisMetric(horizontalInk?.centerX, verticalInk?.centerX);
  const insetTop = pickAxisMetric(verticalInset?.top, horizontalInset?.top);
  const insetBottom = pickAxisMetric(verticalInset?.bottom, horizontalInset?.bottom);
  const insetLeft = pickAxisMetric(horizontalInset?.left, verticalInset?.left);
  const insetRight = pickAxisMetric(horizontalInset?.right, verticalInset?.right);
  return {
    ink: {
      top: roundNullable(top),
      bottom: roundNullable(bottom),
      height: roundNullable(height),
      centerY: roundNullable(centerY),
      left: roundNullable(left),
      right: roundNullable(right),
      width: roundNullable(width),
      centerX: roundNullable(centerX),
    },
    inset: {
      top: roundNullable(insetTop),
      bottom: roundNullable(insetBottom),
      left: roundNullable(insetLeft),
      right: roundNullable(insetRight),
    },
  };
}

function classifyDomProbeSourceWithAnchor({
  ready = false,
  usesSeparateInkAnchorBox = false,
}) {
  if (!ready) return null;
  return usesSeparateInkAnchorBox
    ? "dom-probe-relative-to-ink-anchor-box"
    : "dom-probe-relative-to-box";
}

function buildInkFromProbe(boxRect, probe, baselineAscentPx = null) {
  const box = normalizeRect(boxRect);
  const hostWidth = toFiniteNumber(probe?.hostWidthPx);
  const hostHeight = toFiniteNumber(probe?.hostHeightPx);
  const insetTopHost = toFiniteNumberFallback(
    probe?.glyphInkTopInsetPx,
    probe?.glyphTopInsetPx
  );
  const insetBottomHost = toFiniteNumberFallback(
    probe?.glyphInkBottomInsetPx,
    probe?.glyphBottomInsetPx
  );
  const insetLeftHost = toFiniteNumberFallback(
    probe?.glyphInkLeftInsetPx,
    probe?.glyphLeftInsetPx
  );
  const insetRightHost = toFiniteNumberFallback(
    probe?.glyphInkRightInsetPx,
    probe?.glyphRightInsetPx
  );
  if (!box) {
    return {
      ink: null,
      inset: {
        top: null,
        bottom: null,
        left: null,
        right: null,
      },
      baselineY: null,
      horizontalReady: false,
      verticalReady: false,
    };
  }
  const scaleX = hostWidth !== null && hostWidth > 0 ? box.width / hostWidth : null;
  const scaleY = hostHeight !== null && hostHeight > 0 ? box.height / hostHeight : null;
  const horizontalReady =
    scaleX !== null &&
    insetLeftHost !== null &&
    insetRightHost !== null;
  const verticalReady =
    scaleY !== null &&
    insetTopHost !== null &&
    insetBottomHost !== null;
  const insetTop = verticalReady ? insetTopHost * scaleY : null;
  const insetBottom = verticalReady ? insetBottomHost * scaleY : null;
  const insetLeft = horizontalReady ? insetLeftHost * scaleX : null;
  const insetRight = horizontalReady ? insetRightHost * scaleX : null;
  const inkTop = verticalReady ? box.y + insetTop : null;
  const inkBottom = verticalReady ? box.y + box.height - insetBottom : null;
  const inkLeft = horizontalReady ? box.x + insetLeft : null;
  const inkRight = horizontalReady ? box.x + box.width - insetRight : null;
  const inkHeight =
    inkTop !== null && inkBottom !== null
      ? Math.max(0, inkBottom - inkTop)
      : null;
  const inkWidth =
    inkLeft !== null && inkRight !== null
      ? Math.max(0, inkRight - inkLeft)
      : null;
  const baselineY =
    verticalReady && baselineAscentPx !== null
      ? box.y + (insetTopHost + baselineAscentPx) * scaleY
      : null;
  return {
    ink: {
      top: roundNullable(inkTop),
      bottom: roundNullable(inkBottom),
      height: roundNullable(inkHeight),
      centerY: roundNullable(
        inkTop !== null && inkBottom !== null ? (inkTop + inkBottom) / 2 : null
      ),
      left: roundNullable(inkLeft),
      right: roundNullable(inkRight),
      width: roundNullable(inkWidth),
      centerX: roundNullable(
        inkLeft !== null && inkRight !== null ? (inkLeft + inkRight) / 2 : null
      ),
    },
    inset: {
      top: roundNullable(insetTop),
      bottom: roundNullable(insetBottom),
      left: roundNullable(insetLeft),
      right: roundNullable(insetRight),
    },
    baselineY: roundNullable(baselineY),
    horizontalReady,
    verticalReady,
  };
}

function deltaMetric(domValue, konvaValue) {
  const dom = toFiniteNumber(domValue);
  const konva = toFiniteNumber(konvaValue);
  if (dom === null || konva === null) return null;
  return roundMetric(dom - konva);
}

function maxAbsMetric(values = []) {
  const normalized = (Array.isArray(values) ? values : [])
    .map((value) => toFiniteNumber(value))
    .filter((value) => value !== null)
    .map((value) => Math.abs(value));
  if (normalized.length === 0) return null;
  return Math.max(...normalized);
}

function resolveLargestDeltaMetric(delta = {}) {
  const entries = Object.entries(delta || {}).filter(([, value]) => (
    toFiniteNumber(value) !== null
  ));
  if (entries.length === 0) return null;
  let winner = null;
  let winnerAbs = Number.NEGATIVE_INFINITY;
  entries.forEach(([key, value]) => {
    const numeric = toFiniteNumber(value);
    if (numeric === null) return;
    const abs = Math.abs(numeric);
    if (abs > winnerAbs) {
      winnerAbs = abs;
      winner = key;
    }
  });
  return winner;
}

function normalizeSourceToken(source) {
  if (source === null || typeof source === "undefined") return null;
  return String(source).trim().toLowerCase() || null;
}

function sourceUsesProbe(sourceToken) {
  return Boolean(sourceToken && sourceToken.includes("probe"));
}

function sourceUsesDerivedGeometry(sourceToken) {
  if (!sourceToken) return false;
  return (
    sourceToken.includes("rect") ||
    sourceToken.includes("range") ||
    sourceToken.includes("union")
  );
}

function resolveAxisComparability(domSource, konvaSource) {
  const domToken = normalizeSourceToken(domSource);
  const konvaToken = normalizeSourceToken(konvaSource);
  if (domToken && !konvaToken) return "dom-only";
  if (!domToken && konvaToken) return "canvas-only";
  if (!domToken && !konvaToken) return "mixed-sources";
  const domProbe = sourceUsesProbe(domToken);
  const konvaProbe = sourceUsesProbe(konvaToken);
  if (domProbe && konvaProbe) return "same-model";
  if (sourceUsesDerivedGeometry(domToken) && konvaProbe) return "mixed-sources";
  return "mixed-sources";
}

function resolveBaselineComparability({
  domBaselineY = null,
  konvaBaselineY = null,
  domVerticalSource = null,
  konvaSource = null,
}) {
  const domBaseline = toFiniteNumber(domBaselineY);
  const konvaBaseline = toFiniteNumber(konvaBaselineY);
  if (domBaseline !== null && konvaBaseline === null) return "dom-only";
  if (domBaseline === null && konvaBaseline !== null) return "canvas-only";
  if (domBaseline === null && konvaBaseline === null) return "mixed-sources";
  const domToken = normalizeSourceToken(domVerticalSource);
  const konvaToken = normalizeSourceToken(konvaSource);
  const domProbe = sourceUsesProbe(domToken);
  const konvaProbe = sourceUsesProbe(konvaToken);
  if (domProbe && konvaProbe) return "same-model";
  if (!domProbe && konvaProbe) return "derived-vs-probe";
  return "mixed-sources";
}

function resolveSummary({
  delta = {},
  comparability = {},
}) {
  const verticalMagnitude = maxAbsMetric([
    delta.inkTopDelta,
    delta.inkBottomDelta,
    delta.inkHeightDelta,
    delta.inkCenterYDelta,
    delta.baselineDelta,
  ]);
  const horizontalMagnitude = maxAbsMetric([
    delta.inkLeftDelta,
    delta.inkRightDelta,
    delta.inkWidthDelta,
    delta.inkCenterXDelta,
  ]);
  const maxAbsDeltaPx = maxAbsMetric([
    verticalMagnitude,
    horizontalMagnitude,
  ]);
  const largestDeltaMetric = resolveLargestDeltaMetric(delta);
  const status = (() => {
    const maxAbs = toFiniteNumber(maxAbsDeltaPx);
    if (maxAbs === null) return "aligned";
    if (maxAbs <= 0.05) return "aligned";
    if (maxAbs <= 0.75) return "subpixel";
    return "mismatch";
  })();
  const dominantAxis = (() => {
    const v = toFiniteNumber(verticalMagnitude);
    const h = toFiniteNumber(horizontalMagnitude);
    if (v === null && h === null) return "mixed";
    if (v !== null && h === null) return "vertical";
    if (v === null && h !== null) return "horizontal";
    if (Math.abs(v - h) <= 0.25) return "mixed";
    return v > h ? "vertical" : "horizontal";
  })();
  const likelySource = (() => {
    const hasMixedComparability = [
      comparability?.horizontal,
      comparability?.vertical,
      comparability?.baseline,
    ].some((token) => token === "mixed-sources" || token === "derived-vs-probe");
    if (hasMixedComparability && status !== "aligned") return "mixed-metrics";
    if (
      largestDeltaMetric === "baselineDelta" &&
      Math.abs(Number(delta?.baselineDelta || 0)) > 0.75
    ) {
      return "baseline-mismatch";
    }
    if (
      dominantAxis === "horizontal" &&
      (largestDeltaMetric === "inkWidthDelta" || largestDeltaMetric === "inkRightDelta")
    ) {
      return "width-measurement-drift";
    }
    if (status === "aligned") return "ink-position-mismatch";
    return "ink-position-mismatch";
  })();
  return {
    summary: {
      status,
      dominantAxis,
      maxAbsDeltaPx: roundNullable(maxAbsDeltaPx),
      largestDeltaMetric,
      likelySource,
    },
    inkDeltaMagnitude: {
      vertical: roundNullable(verticalMagnitude),
      horizontal: roundNullable(horizontalMagnitude),
    },
  };
}

export function buildInlineTextInkPositionDiagPayload({
  konvaBoxRect = null,
  domBoxRect = null,
  domInkAnchorRect = null,
  konvaInkProbe = null,
  domInkProbe = null,
  canvasInkMetrics = null,
  domTextInkRect = null,
  fullRangeRect = null,
  firstGlyphRect = null,
  lastGlyphRect = null,
}) {
  const konvaBox = roundRect(konvaBoxRect);
  const domBox = roundRect(domBoxRect);
  const domInkAnchorBox = roundRect(domInkAnchorRect || domBoxRect);
  const domUsesSeparateInkAnchorBox = Boolean(
    domInkAnchorBox &&
    domBox &&
    (
      Math.abs(Number(domInkAnchorBox.y) - Number(domBox.y)) > 0.0001 ||
      Math.abs(Number(domInkAnchorBox.x) - Number(domBox.x)) > 0.0001
    )
  );
  const ascentPx = toFiniteNumber(canvasInkMetrics?.actualAscentPx);

  const konvaInkModel = buildInkFromProbe(konvaBoxRect, konvaInkProbe, ascentPx);
  const domInkModelFromProbe = buildInkFromProbe(
    domInkAnchorRect || domBoxRect,
    domInkProbe,
    ascentPx
  );
  const domInkRectFallback = unionRects([
    domTextInkRect,
    fullRangeRect,
    unionRects([firstGlyphRect, lastGlyphRect]),
  ]);
  const domInkFromRect = buildInkFromAbsoluteRect(domBoxRect, domInkRectFallback);
  const domProbeHorizontalSource = classifyDomProbeSourceWithAnchor({
    ready: Boolean(domInkModelFromProbe?.horizontalReady),
    usesSeparateInkAnchorBox: domUsesSeparateInkAnchorBox,
  });
  const domProbeVerticalSource = classifyDomProbeSourceWithAnchor({
    ready: Boolean(domInkModelFromProbe?.verticalReady),
    usesSeparateInkAnchorBox: domUsesSeparateInkAnchorBox,
  });
  const shouldPreferProbeForHorizontal = Boolean(domInkModelFromProbe?.horizontalReady);
  const shouldPreferProbeForVertical = Boolean(domInkModelFromProbe?.verticalReady);
  const domInkComposed = composeInkModel({
    verticalInk: shouldPreferProbeForVertical ? domInkModelFromProbe.ink : null,
    horizontalInk: shouldPreferProbeForHorizontal ? domInkModelFromProbe.ink : domInkFromRect.ink,
    verticalInset: shouldPreferProbeForVertical ? domInkModelFromProbe.inset : null,
    horizontalInset: shouldPreferProbeForHorizontal
      ? domInkModelFromProbe.inset
      : domInkFromRect.inset,
  });
  const domBaselineFromProbe = shouldPreferProbeForVertical
    ? domInkModelFromProbe.baselineY
    : null;

  const domHorizontalSourceFallback = domTextInkRect
    ? "dom-text-ink-rect"
    : (fullRangeRect ? "full-range-rect" : "first-last-glyph-union");
  const domHorizontalSource = shouldPreferProbeForHorizontal
    ? domProbeHorizontalSource
    : domHorizontalSourceFallback;
  const domVerticalSource = shouldPreferProbeForVertical
    ? domProbeVerticalSource
    : domHorizontalSource;
  const konvaSource = "konva-probe-relative-to-box";

  const delta = {
    inkTopDelta: deltaMetric(domInkComposed.ink?.top, konvaInkModel.ink?.top),
    inkBottomDelta: deltaMetric(domInkComposed.ink?.bottom, konvaInkModel.ink?.bottom),
    inkHeightDelta: deltaMetric(domInkComposed.ink?.height, konvaInkModel.ink?.height),
    inkCenterYDelta: deltaMetric(domInkComposed.ink?.centerY, konvaInkModel.ink?.centerY),
    inkLeftDelta: deltaMetric(domInkComposed.ink?.left, konvaInkModel.ink?.left),
    inkRightDelta: deltaMetric(domInkComposed.ink?.right, konvaInkModel.ink?.right),
    inkWidthDelta: deltaMetric(domInkComposed.ink?.width, konvaInkModel.ink?.width),
    inkCenterXDelta: deltaMetric(domInkComposed.ink?.centerX, konvaInkModel.ink?.centerX),
    baselineDelta: deltaMetric(domBaselineFromProbe, konvaInkModel.baselineY),
  };
  const comparability = {
    horizontal: resolveAxisComparability(domHorizontalSource, konvaSource),
    vertical: resolveAxisComparability(domVerticalSource, konvaSource),
    baseline: resolveBaselineComparability({
      domBaselineY: domBaselineFromProbe,
      konvaBaselineY: konvaInkModel.baselineY,
      domVerticalSource,
      konvaSource,
    }),
  };
  const summaryModel = resolveSummary({
    delta,
    comparability,
  });
  const domRectVsProbeDelta = {
    inkLeftDelta: deltaMetric(domInkFromRect.ink?.left, domInkModelFromProbe.ink?.left),
    inkRightDelta: deltaMetric(domInkFromRect.ink?.right, domInkModelFromProbe.ink?.right),
    inkWidthDelta: deltaMetric(domInkFromRect.ink?.width, domInkModelFromProbe.ink?.width),
    inkCenterXDelta: deltaMetric(domInkFromRect.ink?.centerX, domInkModelFromProbe.ink?.centerX),
    source: {
      rect: domHorizontalSourceFallback,
      probe: domProbeHorizontalSource,
    },
  };

  return {
    konva: {
      box: konvaBox,
      ink: konvaInkModel.ink,
      inset: konvaInkModel.inset,
      baselineY: konvaInkModel.baselineY,
      inkSource: konvaSource,
    },
    dom: {
      box: domBox,
      inkAnchorBox: domInkAnchorBox,
      ink: domInkComposed.ink,
      inset: domInkComposed.inset,
      baselineY: domBaselineFromProbe,
      horizontalAuxFromDomRect: domInkFromRect.ink,
      horizontalAuxDomRectVsProbeDelta: domRectVsProbeDelta,
      inkSource: {
        horizontal: domHorizontalSource,
        vertical: domVerticalSource,
        horizontalAux: domHorizontalSourceFallback,
      },
    },
    delta,
    comparability,
    summary: summaryModel.summary,
    inkDeltaMagnitude: summaryModel.inkDeltaMagnitude,
  };
}
