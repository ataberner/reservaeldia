import {
  estimateCountdownUnitHeight,
  normalizeVisibleUnits,
  resolveCountdownUnitWidth,
} from "@/domain/countdownPresets/renderModel";
import {
  resolveCountdownContract,
} from "../../../shared/renderContractPolicy.js";

export const COUNTDOWN_AUDIT_TRACE_ID_FIELD = "countdownAuditTraceId";
export const COUNTDOWN_AUDIT_FIXTURE_FIELD = "countdownAuditFixture";
export const COUNTDOWN_AUDIT_LABEL_FIELD = "countdownAuditLabel";

const DEFAULT_UNITS = Object.freeze(["days", "hours", "minutes", "seconds"]);

function toFinite(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function roundMetric(value) {
  if (!Number.isFinite(value)) return null;
  return Math.round(value * 1000) / 1000;
}

function compactUnitLayouts(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item, index) => ({
    key: String(item?.key || item?.unit || index),
    unit: String(item?.unit || item?.key || ""),
    x: roundMetric(toFinite(item?.x, 0)),
    y: roundMetric(toFinite(item?.y, 0)),
    width: roundMetric(toFinite(item?.width, 0)),
    height: roundMetric(toFinite(item?.height, 0)),
  }));
}

function compactSeparatorLayouts(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item, index) => ({
    key: String(item?.key || index),
    x: roundMetric(toFinite(item?.x, 0)),
    y: roundMetric(toFinite(item?.y, 0)),
    width: roundMetric(toFinite(item?.width, 0)),
  }));
}

function normalizeLayoutType(value) {
  const safe = String(value || "").trim();
  return safe || "singleFrame";
}

function normalizeDistribution(value) {
  const safe = String(value || "").trim().toLowerCase();
  if (!safe) return "centered";
  return safe;
}

function computeV2Metrics(countdown) {
  const visibleUnits = normalizeVisibleUnits(countdown?.visibleUnits);
  const unitCount = Math.max(1, visibleUnits.length);
  const distribution = normalizeDistribution(
    countdown?.distribution || countdown?.layoutType || "centered"
  );
  const layoutType = normalizeLayoutType(countdown?.layoutType || "singleFrame");
  const hasFrameConfigured = String(countdown?.frameSvgUrl || "").trim().length > 0;
  const useSingleFrameLayout =
    layoutType.toLowerCase() === "singleframe" && hasFrameConfigured;
  const gap = Math.max(0, toFinite(countdown?.gap, 8));
  const framePadding = Math.max(0, toFinite(countdown?.framePadding, 10));
  const paddingX = Math.max(2, toFinite(countdown?.paddingX, 8));
  const paddingY = Math.max(2, toFinite(countdown?.paddingY, 6));
  const fontSize = Math.max(10, toFinite(countdown?.fontSize, 16));
  const labelSize = Math.max(8, toFinite(countdown?.labelSize, 10));
  const showLabels = countdown?.showLabels !== false;
  const boxRadius = Math.max(0, toFinite(countdown?.boxRadius, 8));
  const requestedChipW = Math.max(36, toFinite(countdown?.chipWidth, 46) + paddingX * 2);
  const textDrivenChipH = Math.max(
    44,
    paddingY * 2 + fontSize + (showLabels ? labelSize + 6 : 0)
  );
  const layoutDrivenChipH = estimateCountdownUnitHeight({
    tamanoBase: toFinite(countdown?.tamanoBase, 320),
    distribution,
    unitsCount: unitCount,
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
        ? Math.min(2, unitCount)
        : unitCount;
  const rows =
    distribution === "vertical"
      ? unitCount
      : distribution === "grid"
        ? Math.ceil(unitCount / cols)
        : 1;

  const editorialWidths =
    distribution === "editorial"
      ? Array.from({ length: unitCount }, (_, index) =>
          resolveCountdownUnitWidth({
            width: Math.max(
              34,
              Math.round(baseChipW * (index === 0 && unitCount > 1 ? 1.25 : 0.88))
            ),
            height: chipH,
            boxRadius,
          })
        )
      : [];

  const naturalW =
    distribution === "vertical"
      ? baseChipW
      : distribution === "grid"
        ? cols * baseChipW + gap * (cols - 1)
        : distribution === "editorial"
          ? editorialWidths.reduce((acc, width) => acc + width, 0) +
            gap * Math.max(0, unitCount - 1)
          : unitCount * baseChipW + gap * (unitCount - 1);

  const naturalH =
    distribution === "vertical" || distribution === "grid"
      ? rows * chipH + gap * Math.max(0, rows - 1)
      : chipH;

  const containerW = Math.max(
    toFinite(countdown?.width, 0),
    naturalW + (useSingleFrameLayout ? framePadding * 2 : 0)
  );
  const containerH = Math.max(
    toFinite(countdown?.height, 0),
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

  let unitLayouts = [];
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

  const separatorText = String(countdown?.separator || "");
  const separatorFontSize = Math.max(10, Math.round(fontSize * 0.64));
  const canRenderSeparators =
    !!separatorText &&
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
    layoutType,
    distribution,
    visibleUnits,
    gap,
    framePadding,
    paddingX,
    paddingY,
    chipWidth: toFinite(countdown?.chipWidth, 46),
    fontSize,
    labelSize,
    boxRadius,
    showLabels,
    chipH,
    baseChipW,
    naturalW,
    naturalH,
    containerW,
    containerH,
    startX,
    startY,
    unitLayouts,
    separatorLayouts,
  };
}

function computeLegacyMetrics(countdown) {
  const visibleUnits = [...DEFAULT_UNITS];
  const unitCount = visibleUnits.length;
  const gap = Math.max(0, toFinite(countdown?.gap, 8));
  const containerW = Math.max(0, toFinite(countdown?.width, 0));
  const containerH = Math.max(0, toFinite(countdown?.height, 0));
  const chipWidthProp = Number.isFinite(Number(countdown?.chipWidth))
    ? Number(countdown.chipWidth)
    : null;
  const paddingXProp = Number.isFinite(Number(countdown?.paddingX))
    ? Number(countdown.paddingX)
    : null;
  const chipWTotal =
    containerW > 0
      ? Math.max(40, (containerW - gap * (unitCount - 1)) / unitCount)
      : 56;
  const paddingX =
    paddingXProp != null ? paddingXProp : Math.max(6, Math.round(chipWTotal * 0.18));
  const paddingY = Math.max(5, Math.round(paddingX * 0.65));
  const fontSize = Number.isFinite(Number(countdown?.fontSize))
    ? Number(countdown.fontSize)
    : Math.max(14, Math.round(chipWTotal * 0.34));
  const labelSize = Number.isFinite(Number(countdown?.labelSize))
    ? Number(countdown.labelSize)
    : Math.max(9, Math.round(fontSize * 0.62));
  const showLabels = countdown?.showLabels !== false;
  const chipH =
    containerH > 0
      ? containerH
      : Math.max(44, paddingY * 2 + fontSize + (showLabels ? labelSize + 6 : 0));
  const unitLayouts = visibleUnits.map((unit, index) => ({
    key: unit,
    unit,
    x: index * (chipWTotal + gap),
    y: 0,
    width: chipWTotal,
    height: chipH,
  }));
  const separatorText = String(countdown?.separator || "");
  const separatorFontSize = Math.max(10, Math.round(fontSize * 0.64));
  const separatorLayouts =
    separatorText && unitLayouts.length > 1
      ? unitLayouts.slice(0, -1).map((item, index) => {
          const next = unitLayouts[index + 1];
          const itemRight = item.x + item.width;
          const midpointX = itemRight + (next.x - itemRight) / 2;
          const width = Math.max(12, Math.round(separatorFontSize * 1.4));
          return {
            key: `${item.unit}-${next.unit}-${index}`,
            x: midpointX - width / 2,
            y: Math.max(4, item.height * 0.3),
            width,
          };
        })
      : [];

  return {
    layoutType: String(countdown?.layout || "pills"),
    distribution: "centered",
    visibleUnits,
    gap,
    framePadding: 0,
    paddingX,
    paddingY,
    chipWidth: chipWidthProp != null ? chipWidthProp : Math.max(10, chipWTotal - paddingX * 2),
    fontSize,
    labelSize,
    boxRadius: Math.max(0, toFinite(countdown?.boxRadius, 10)),
    showLabels,
    chipH,
    baseChipW: chipWTotal,
    naturalW: unitCount * chipWTotal + gap * (unitCount - 1),
    naturalH: chipH,
    containerW: containerW || unitCount * chipWTotal + gap * (unitCount - 1),
    containerH: containerH || chipH,
    startX: 0,
    startY: 0,
    unitLayouts,
    separatorLayouts,
  };
}

export function extractCountdownAuditMeta(source = {}) {
  const safeSource = source && typeof source === "object" ? source : {};
  const traceId = String(safeSource[COUNTDOWN_AUDIT_TRACE_ID_FIELD] || "").trim() || null;
  const fixture = String(safeSource[COUNTDOWN_AUDIT_FIXTURE_FIELD] || "").trim() || null;
  const label = String(safeSource[COUNTDOWN_AUDIT_LABEL_FIELD] || "").trim() || null;

  return {
    traceId,
    fixture,
    label,
  };
}

export function shouldCaptureCountdownAudit(source = {}) {
  const meta = extractCountdownAuditMeta(source);
  return Boolean(meta.traceId);
}

export function buildCountdownAuditSnapshot({
  countdown,
  stage = "",
  renderer = "",
  sourceDocument = "",
  viewport = "",
  wrapperScale = 1,
  usesRasterThumbnail = false,
  altoModo = "",
  timestamp = Date.now(),
  sourceLabel = "",
  traceId = null,
} = {}) {
  const safeCountdown = countdown && typeof countdown === "object" ? countdown : null;
  if (!safeCountdown) return null;
  if (String(safeCountdown?.tipo || "countdown").trim().toLowerCase() !== "countdown") {
    return null;
  }

  const meta = extractCountdownAuditMeta(safeCountdown);
  const resolvedTraceId =
    String(traceId || meta.traceId || safeCountdown?.presetId || safeCountdown?.id || "").trim() ||
    null;
  if (!resolvedTraceId) return null;

  const countdownContract = resolveCountdownContract(safeCountdown);
  const schemaVersion = countdownContract.schemaVersion || 1;
  const metrics =
    countdownContract.contractVersion === "v2"
      ? computeV2Metrics(safeCountdown)
      : computeLegacyMetrics(safeCountdown);

  const snapshot = {
    traceId: resolvedTraceId,
    fixture: meta.fixture,
    label: meta.label,
    id: String(safeCountdown?.id || "").trim() || null,
    presetId: String(safeCountdown?.presetId || "").trim() || null,
    countdownSchemaVersion: schemaVersion,
    renderContractId: countdownContract.contractId || null,
    renderContractStatus: countdownContract.status || null,
    seccionId: String(safeCountdown?.seccionId || "").trim() || null,
    altoModo: String(altoModo || safeCountdown?.altoModo || "").trim() || null,
    x: roundMetric(toFinite(safeCountdown?.x, 0)),
    y: roundMetric(toFinite(safeCountdown?.y, 0)),
    yNorm:
      Number.isFinite(Number(safeCountdown?.yNorm))
        ? roundMetric(Number(safeCountdown.yNorm))
        : null,
    width: roundMetric(toFinite(safeCountdown?.width, 0)),
    height: roundMetric(toFinite(safeCountdown?.height, 0)),
    scaleX: roundMetric(toFinite(safeCountdown?.scaleX, 1)),
    scaleY: roundMetric(toFinite(safeCountdown?.scaleY, 1)),
    rotation: roundMetric(toFinite(safeCountdown?.rotation, 0)),
    tamanoBase: roundMetric(toFinite(safeCountdown?.tamanoBase, 320)),
    layoutType: metrics.layoutType,
    distribution: metrics.distribution,
    visibleUnits: [...metrics.visibleUnits],
    gap: roundMetric(metrics.gap),
    framePadding: roundMetric(metrics.framePadding),
    paddingX: roundMetric(metrics.paddingX),
    paddingY: roundMetric(metrics.paddingY),
    chipWidth: roundMetric(metrics.chipWidth),
    fontSize: roundMetric(metrics.fontSize),
    labelSize: roundMetric(metrics.labelSize),
    boxRadius: roundMetric(metrics.boxRadius),
    showLabels: metrics.showLabels,
    chipH: roundMetric(metrics.chipH),
    baseChipW: roundMetric(metrics.baseChipW),
    naturalW: roundMetric(metrics.naturalW),
    naturalH: roundMetric(metrics.naturalH),
    containerW: roundMetric(metrics.containerW),
    containerH: roundMetric(metrics.containerH),
    startX: roundMetric(metrics.startX),
    startY: roundMetric(metrics.startY),
    unitLayouts: compactUnitLayouts(metrics.unitLayouts),
    separatorLayouts: compactSeparatorLayouts(metrics.separatorLayouts),
    renderer: String(renderer || "").trim() || null,
    viewport: String(viewport || "").trim() || null,
    wrapperScale: roundMetric(toFinite(wrapperScale, 1)),
    usesRasterThumbnail: usesRasterThumbnail === true,
    sourceDocument: String(sourceDocument || "").trim() || null,
    sourceLabel: String(sourceLabel || "").trim() || null,
    timestamp: Number.isFinite(Number(timestamp)) ? Number(timestamp) : Date.now(),
  };

  return {
    ...snapshot,
    signature: JSON.stringify({
      traceId: snapshot.traceId,
      stage,
      renderer: snapshot.renderer,
      sourceDocument: snapshot.sourceDocument,
      viewport: snapshot.viewport,
      x: snapshot.x,
      y: snapshot.y,
      yNorm: snapshot.yNorm,
      width: snapshot.width,
      height: snapshot.height,
      scaleX: snapshot.scaleX,
      scaleY: snapshot.scaleY,
      chipH: snapshot.chipH,
      baseChipW: snapshot.baseChipW,
      containerW: snapshot.containerW,
      containerH: snapshot.containerH,
      wrapperScale: snapshot.wrapperScale,
      usesRasterThumbnail: snapshot.usesRasterThumbnail,
      unitLayouts: snapshot.unitLayouts,
      separatorLayouts: snapshot.separatorLayouts,
    }),
    stage: String(stage || "").trim() || null,
  };
}
