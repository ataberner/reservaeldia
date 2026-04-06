const CANVAS_BOX_FLOW_DEBUG_STORE_KEY = "__CANVAS_BOX_FLOW_DEBUG_STORE";

export const CANVAS_BOX_FLOW_DEBUG_FLAG = "__DBG_CANVAS_BOX_FLOW";
export const CANVAS_BOX_FLOW_SUMMARY_THROTTLE_MS = 120;

function getDebugWindow(targetWindow = null) {
  if (targetWindow && typeof targetWindow === "object") {
    return targetWindow;
  }
  if (typeof window !== "undefined") {
    return window;
  }
  return null;
}

function getDebugConsole(targetWindow = null) {
  const resolvedWindow = getDebugWindow(targetWindow);
  if (resolvedWindow?.console && typeof resolvedWindow.console.log === "function") {
    return resolvedWindow.console;
  }
  if (typeof console !== "undefined" && typeof console.log === "function") {
    return console;
  }
  return {
    log() {},
  };
}

function readExplicitDebugFlag(rawValue) {
  if (rawValue === true || rawValue === 1 || rawValue === "1") return true;
  if (rawValue === false || rawValue === 0 || rawValue === "0") return false;

  if (typeof rawValue === "string") {
    const normalized = rawValue.trim().toLowerCase();
    if (normalized === "true" || normalized === "on" || normalized === "yes") {
      return true;
    }
    if (normalized === "false" || normalized === "off" || normalized === "no") {
      return false;
    }
  }

  return null;
}

function roundMetric(value, digits = 2) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  const precision = 10 ** digits;
  return Math.round(numeric * precision) / precision;
}

function getNowMs(targetWindow = null) {
  const resolvedWindow = getDebugWindow(targetWindow);
  const performanceApi = resolvedWindow?.performance || globalThis?.performance || null;
  const now =
    performanceApi && typeof performanceApi.now === "function"
      ? Number(performanceApi.now())
      : Number(Date.now());
  return Number.isFinite(now) ? now : 0;
}

function sanitizeCompactValue(value, seen = new WeakSet()) {
  if (value == null) return value;

  const valueType = typeof value;
  if (valueType === "string" || valueType === "boolean") return value;
  if (valueType === "number") {
    return Number.isFinite(value) ? roundMetric(value, 3) : null;
  }
  if (valueType === "bigint") return String(value);
  if (valueType === "function" || valueType === "symbol") return undefined;

  if (Array.isArray(value)) {
    const nextValue = value
      .map((item) => sanitizeCompactValue(item, seen))
      .filter((item) => typeof item !== "undefined");
    return nextValue;
  }

  if (valueType === "object") {
    if (seen.has(value)) return "[Circular]";
    seen.add(value);

    return Object.fromEntries(
      Object.entries(value)
        .map(([key, nestedValue]) => [key, sanitizeCompactValue(nestedValue, seen)])
        .filter(([, nestedValue]) => typeof nestedValue !== "undefined")
    );
  }

  return String(value);
}

function normalizeSummaryToken(value) {
  if (Array.isArray(value)) {
    const joined = value
      .map((item) => String(item ?? "").trim())
      .filter((item) => item !== "")
      .join(",");
    return joined || null;
  }

  if (value && typeof value === "object") {
    return null;
  }

  const trimmed = String(value ?? "").trim();
  return trimmed || null;
}

function appendUniqueSummaryValues(currentValues = [], nextValues = [], maxValues = 6) {
  const merged = Array.isArray(currentValues) ? [...currentValues] : [];
  nextValues.forEach((value) => {
    const normalizedValue = normalizeSummaryToken(value);
    if (!normalizedValue || merged.includes(normalizedValue)) return;
    if (merged.length < maxValues) {
      merged.push(normalizedValue);
    }
  });
  return merged;
}

function collectSummaryValues(payload, keys = []) {
  return keys
    .map((key) => normalizeSummaryToken(payload?.[key]))
    .filter(Boolean);
}

function formatSummaryValueList(values = [], maxVisible = 4) {
  const safeValues = Array.isArray(values) ? values.filter(Boolean) : [];
  if (safeValues.length === 0) return null;
  if (safeValues.length <= maxVisible) {
    return safeValues.join(" | ");
  }
  return `${safeValues.slice(0, maxVisible).join(" | ")} +${safeValues.length - maxVisible}`;
}

function formatPointInline(payload) {
  if (!payload || typeof payload !== "object") return null;
  const x = roundMetric(payload.x, 3);
  const y = roundMetric(payload.y, 3);
  if (x === null && y === null) return null;

  const parts = [];
  if (x !== null) parts.push(`x=${x}`);
  if (y !== null) parts.push(`y=${y}`);
  return parts.join(" ");
}

function formatBoundsInline(bounds) {
  const digest = buildCanvasBoxFlowBoundsDigest(bounds);
  if (!digest) return null;
  return `${digest.kind}@${digest.x},${digest.y} ${digest.width}x${digest.height}`;
}

function formatDriftInline(payload) {
  if (!payload || typeof payload !== "object") return null;
  const dx = roundMetric(payload.dx, 3);
  const dy = roundMetric(payload.dy, 3);
  const distance = roundMetric(payload.distance, 3);
  if (dx === null && dy === null && distance === null) return null;

  const parts = [];
  if (dx !== null) parts.push(`dx=${dx}`);
  if (dy !== null) parts.push(`dy=${dy}`);
  if (distance !== null) parts.push(`dist=${distance}`);
  return parts.join(" ");
}

function summarizeDriftPattern(values = []) {
  const safeValues = Array.isArray(values)
    ? values.map((value) => normalizeSummaryToken(value)).filter(Boolean)
    : [];
  if (safeValues.length === 0) return null;
  if (safeValues.every((value) => value === "aligned")) return "aligned";
  if (safeValues.every((value) => value === "stable" || value === "aligned")) {
    return "stable";
  }
  if (safeValues.length === 1) return safeValues[0];
  return "changing";
}

function pickSummaryValue(...values) {
  for (const value of values) {
    const normalizedValue = normalizeSummaryToken(value);
    if (normalizedValue) return normalizedValue;
  }
  return null;
}

function buildSummaryEndpointFields(prefix, payload) {
  if (!payload || typeof payload !== "object") {
    return {};
  }

  const nextFields = {};
  const source = normalizeSummaryToken(payload.source);
  const debugSource = normalizeSummaryToken(payload.debugSource);
  const point = formatPointInline(payload);
  const bounds = formatBoundsInline(
    payload.bounds ||
      (
        Number.isFinite(Number(payload.width)) &&
        Number.isFinite(Number(payload.height))
          ? payload
          : null
      )
  );
  const drift = formatDriftInline(payload);
  const dragBounds = formatBoundsInline(payload.dragBounds);
  const boxBounds = formatBoundsInline(payload.overlayBounds || payload.boxBounds);
  const driftState = normalizeSummaryToken(payload.driftState);
  const comparisonOrder = normalizeSummaryToken(payload.comparisonOrder);

  if (source) nextFields[`${prefix}Source`] = source;
  if (debugSource) nextFields[`${prefix}DebugSource`] = debugSource;
  if (point) nextFields[`${prefix}Pos`] = point;
  if (bounds) nextFields[`${prefix}Bounds`] = bounds;
  if (drift) nextFields[`${prefix}Drift`] = drift;
  if (dragBounds) nextFields[`${prefix}DragBounds`] = dragBounds;
  if (boxBounds) nextFields[`${prefix}BoxBounds`] = boxBounds;
  if (driftState) nextFields[`${prefix}DriftState`] = driftState;
  if (comparisonOrder) nextFields[`${prefix}Order`] = comparisonOrder;

  return nextFields;
}

function buildFlatSummaryPayload(session, summaryKey, reason, activeSummary) {
  const firstPayload = activeSummary?.firstPayload || null;
  const lastPayload = activeSummary?.lastPayload || null;
  const flatPayload = {
    flowKind: session?.channel || null,
    sessionToken: session?.token || null,
    sessionIdentity: session?.identity || null,
    summaryKey: String(summaryKey || "summary"),
    reason: normalizeSummaryToken(reason) || "manual",
    count: Number(activeSummary?.count || 0),
    durationMs: roundMetric(
      Number(activeSummary?.lastAtMs ?? 0) - Number(activeSummary?.startedAtMs ?? 0)
    ),
  };

  const sources = appendUniqueSummaryValues(
    appendUniqueSummaryValues(
      [],
      activeSummary?.sources || []
    ),
    [
      firstPayload?.source,
      lastPayload?.source,
    ]
  );
  const debugSources = appendUniqueSummaryValues(
    appendUniqueSummaryValues(
      [],
      activeSummary?.debugSources || []
    ),
    [
      firstPayload?.debugSource,
      lastPayload?.debugSource,
    ]
  );

  if (sources.length === 1) flatPayload.source = sources[0];
  if (sources.length > 0) flatPayload.sources = formatSummaryValueList(sources);
  if (debugSources.length === 1) flatPayload.debugSource = debugSources[0];
  if (debugSources.length > 0) {
    flatPayload.debugSources = formatSummaryValueList(debugSources);
  }

  const selectedIds = pickSummaryValue(
    lastPayload?.selectedIds,
    firstPayload?.selectedIds
  );
  const hoverId = pickSummaryValue(
    lastPayload?.hoverId,
    lastPayload?.hoveredElement,
    lastPayload?.rawHoverId,
    firstPayload?.hoverId,
    firstPayload?.hoveredElement,
    firstPayload?.rawHoverId
  );
  const targetId = pickSummaryValue(
    lastPayload?.targetId,
    lastPayload?.elementId,
    firstPayload?.targetId,
    firstPayload?.elementId
  );
  const dragId = pickSummaryValue(
    lastPayload?.dragId,
    firstPayload?.dragId
  );
  const dragSources = appendUniqueSummaryValues(
    [],
    [
      ...(activeSummary?.dragSources || []),
      firstPayload?.dragSource,
      lastPayload?.dragSource,
    ]
  );
  const boxSources = appendUniqueSummaryValues(
    [],
    [
      ...(activeSummary?.boxSources || []),
      firstPayload?.overlaySource,
      firstPayload?.boxSource,
      lastPayload?.overlaySource,
      lastPayload?.boxSource,
    ]
  );
  const comparisonOrders = appendUniqueSummaryValues(
    [],
    [
      ...(activeSummary?.comparisonOrders || []),
      firstPayload?.comparisonOrder,
      lastPayload?.comparisonOrder,
    ]
  );
  const driftPattern = summarizeDriftPattern(activeSummary?.driftStates || []);
  const maxEventGap = Number(activeSummary?.maxEventGap || 0);
  const firstVisibleBeforeLiveDrag =
    typeof lastPayload?.firstVisibleBeforeLiveDrag === "boolean"
      ? lastPayload.firstVisibleBeforeLiveDrag
      : typeof firstPayload?.firstVisibleBeforeLiveDrag === "boolean"
        ? firstPayload.firstVisibleBeforeLiveDrag
        : undefined;
  const visibleSeedBeforeLiveDrag =
    typeof lastPayload?.visibleSeedBeforeLiveDrag === "boolean"
      ? lastPayload.visibleSeedBeforeLiveDrag
      : typeof firstPayload?.visibleSeedBeforeLiveDrag === "boolean"
        ? firstPayload.visibleSeedBeforeLiveDrag
        : undefined;
  const startupJump = pickSummaryValue(
    lastPayload?.startupJump,
    firstPayload?.startupJump
  );

  if (selectedIds) flatPayload.selectedIds = selectedIds;
  if (hoverId) flatPayload.hoverId = hoverId;
  if (targetId) flatPayload.targetId = targetId;
  if (dragId) flatPayload.dragId = dragId;
  if (dragSources.length === 1) flatPayload.dragSource = dragSources[0];
  if (dragSources.length > 0) {
    flatPayload.dragSources = formatSummaryValueList(dragSources);
  }
  if (boxSources.length === 1) flatPayload.boxSource = boxSources[0];
  if (boxSources.length > 0) {
    flatPayload.boxSources = formatSummaryValueList(boxSources);
  }
  if (comparisonOrders.length > 0) {
    flatPayload.orders = formatSummaryValueList(comparisonOrders);
  }
  if (driftPattern) flatPayload.driftPattern = driftPattern;
  if (maxEventGap > 0) flatPayload.maxEventGap = maxEventGap;
  if (typeof firstVisibleBeforeLiveDrag === "boolean") {
    flatPayload.firstVisibleBeforeLiveDrag = firstVisibleBeforeLiveDrag;
  }
  if (typeof visibleSeedBeforeLiveDrag === "boolean") {
    flatPayload.visibleSeedBeforeLiveDrag = visibleSeedBeforeLiveDrag;
  }
  if (startupJump) flatPayload.startupJump = startupJump;

  Object.assign(
    flatPayload,
    buildSummaryEndpointFields("first", firstPayload),
    buildSummaryEndpointFields("last", lastPayload),
    buildSummaryEndpointFields("max", activeSummary?.maxPayload || null)
  );

  return Object.fromEntries(
    Object.entries(flatPayload).filter(([, value]) => {
      if (typeof value === "undefined" || value === null) return false;
      if (typeof value === "string" && value.trim() === "") return false;
      return true;
    })
  );
}

function buildSummaryInlineText(payload = {}) {
  const parts = [];

  if (payload.flowKind) parts.push(`flow=${payload.flowKind}`);
  if (payload.sessionIdentity) parts.push(`id=${payload.sessionIdentity}`);
  if (payload.summaryKey) parts.push(`summary=${payload.summaryKey}`);
  if (payload.reason) parts.push(`reason=${payload.reason}`);
  if (Number.isFinite(Number(payload.count))) parts.push(`count=${payload.count}`);
  if (Number.isFinite(Number(payload.durationMs))) parts.push(`dur=${payload.durationMs}ms`);
  if (payload.sources) parts.push(`src=${payload.sources}`);
  if (payload.selectedIds) parts.push(`selected=${payload.selectedIds}`);
  if (payload.hoverId) parts.push(`hover=${payload.hoverId}`);
  if (payload.targetId) parts.push(`target=${payload.targetId}`);
  if (payload.dragId) parts.push(`drag=${payload.dragId}`);
  if (payload.firstPos) parts.push(`firstPos=${payload.firstPos}`);
  if (payload.lastPos) parts.push(`lastPos=${payload.lastPos}`);
  if (payload.firstBounds) parts.push(`firstBounds=${payload.firstBounds}`);
  if (payload.lastBounds) parts.push(`lastBounds=${payload.lastBounds}`);
  if (payload.firstDrift) parts.push(`firstDrift=${payload.firstDrift}`);
  if (payload.maxDrift) parts.push(`maxDrift=${payload.maxDrift}`);
  if (payload.lastDrift) parts.push(`lastDrift=${payload.lastDrift}`);
  if (payload.firstDragBounds) parts.push(`firstDrag=${payload.firstDragBounds}`);
  if (payload.lastDragBounds) parts.push(`lastDrag=${payload.lastDragBounds}`);
  if (payload.firstBoxBounds) parts.push(`firstBox=${payload.firstBoxBounds}`);
  if (payload.lastBoxBounds) parts.push(`lastBox=${payload.lastBoxBounds}`);
  if (payload.driftPattern) parts.push(`drift=${payload.driftPattern}`);
  if (payload.orders) parts.push(`order=${payload.orders}`);
  if (payload.dragSources) parts.push(`dragSrc=${payload.dragSources}`);
  if (payload.boxSources) parts.push(`boxSrc=${payload.boxSources}`);
  if (typeof payload.firstVisibleBeforeLiveDrag === "boolean") {
    parts.push(
      `visibleBeforeLive=${payload.firstVisibleBeforeLiveDrag ? "yes" : "no"}`
    );
  }
  if (typeof payload.visibleSeedBeforeLiveDrag === "boolean") {
    parts.push(
      `seedBeforeLive=${payload.visibleSeedBeforeLiveDrag ? "yes" : "no"}`
    );
  }
  if (payload.startupJump) parts.push(`startupJump=${payload.startupJump}`);
  if (Number.isFinite(Number(payload.maxEventGap))) {
    parts.push(`maxGap=${payload.maxEventGap}`);
  }

  return parts.join(" ");
}

function startsWithNormalized(value, prefix) {
  const normalizedValue = normalizeSummaryToken(value);
  const normalizedPrefix = normalizeSummaryToken(prefix);
  return Boolean(
    normalizedValue &&
      normalizedPrefix &&
      normalizedValue.startsWith(normalizedPrefix)
  );
}

function looksLikeDragSessionIdentity(value) {
  return startsWithNormalized(value, "drag-session:");
}

function looksLikeOverlaySessionIdentity(value) {
  return startsWithNormalized(value, "drag-overlay:");
}

function normalizeIdDigestValue(value) {
  if (Array.isArray(value)) {
    const joined = value
      .map((item) => String(item ?? "").trim())
      .filter((item) => item !== "")
      .join(",");
    return joined || null;
  }

  if (value && typeof value === "object") {
    return null;
  }

  const normalizedValue = normalizeSummaryToken(value);
  return normalizedValue || null;
}

function mapOwnerKind(value) {
  const normalizedValue = normalizeSummaryToken(value);
  if (!normalizedValue) return null;

  if (
    normalizedValue === "transformer-primary" ||
    normalizedValue === "line-controls"
  ) {
    return "selected-phase";
  }

  return normalizedValue;
}

function inferOwnerFromEvent(entry) {
  const payload = entry?.payload || {};
  const payloadOwner = mapOwnerKind(payload.owner || payload.ownerKind);
  if (payloadOwner) return payloadOwner;

  const source = normalizeSummaryToken(payload.source);
  const debugSource = normalizeSummaryToken(payload.debugSource);
  const eventName = normalizeSummaryToken(entry?.eventName) || "";

  if (
    looksLikeOverlaySessionIdentity(payload.dragOverlaySessionKey) ||
    source === "drag-overlay" ||
    debugSource === "drag-overlay" ||
    eventName.startsWith("drag-overlay:")
  ) {
    return "drag-overlay";
  }

  if (
    source === "hover-indicator" ||
    eventName === "forced-clear" ||
    eventName.startsWith("target:") ||
    eventName.startsWith("stage:") ||
    normalizeSummaryToken(payload.hoverId)
  ) {
    return "hover-indicator";
  }

  if (
    source === "transformer-primary" ||
    source === "selection-transformer" ||
    source === "line-indicator" ||
    debugSource === "line-indicator" ||
    eventName.startsWith("line-indicator:") ||
    eventName.startsWith("attach:") ||
    eventName.startsWith("transformer") ||
    eventName.startsWith("bounds-sync:") ||
    eventName.startsWith("restore-after-settle:")
  ) {
    return "selected-phase";
  }

  return null;
}

function inferPhaseFromEvent(entry, owner = null) {
  const payload = entry?.payload || {};
  const eventName = normalizeSummaryToken(entry?.eventName) || "";
  const explicitPhase =
    normalizeSummaryToken(payload.phase) ||
    normalizeSummaryToken(payload.dragOverlayPhase) ||
    normalizeSummaryToken(payload.dragInteractionPhase);

  if (explicitPhase) return explicitPhase;
  if (
    payload.predragActive === true ||
    payload.predragVisualSelectionActive === true ||
    payload.pendingDragSelectionPhase === "predrag" ||
    eventName.startsWith("predrag:")
  ) {
    return "predrag";
  }
  if (
    payload.settling === true ||
    payload.canvasInteractionSettling === true ||
    eventName.startsWith("settling:")
  ) {
    return "settling";
  }
  if (
    payload.canvasInteractionActive === true ||
    payload.effectiveDragging === true ||
    eventName.startsWith("drag:")
  ) {
    return "drag";
  }
  if (owner === "hover-indicator" || normalizeSummaryToken(payload.hoverId)) {
    return "hover";
  }
  if (
    owner === "selected-phase" ||
    normalizeSummaryToken(payload.selectedIds) ||
    normalizeSummaryToken(payload.renderMode)
  ) {
    return "selected";
  }
  return null;
}

function inferDragSessionIdentity(entry, session = null) {
  const payload = entry?.payload || {};
  const candidates = [
    payload.dragSession,
    payload.dragInteractionSessionKey,
    payload.sessionIdentity,
    session?.authorityIdentity,
    session?.identity,
  ];

  for (const candidate of candidates) {
    const normalizedValue = normalizeSummaryToken(candidate);
    if (looksLikeDragSessionIdentity(normalizedValue)) {
      return normalizedValue;
    }
  }

  return null;
}

function inferOverlaySessionIdentity(entry, session = null) {
  const payload = entry?.payload || {};
  const candidates = [
    payload.overlaySession,
    payload.dragOverlaySessionKey,
    payload.lifecycleKey,
    payload.boxFlowIdentity,
    payload.eventIdentity,
    session?.identity,
  ];

  for (const candidate of candidates) {
    const normalizedValue = normalizeSummaryToken(candidate);
    if (looksLikeOverlaySessionIdentity(normalizedValue)) {
      return normalizedValue;
    }
  }

  return null;
}

function inferSelectionAuthority(entry, owner = null, phase = null) {
  const payload = entry?.payload || {};
  const explicitAuthority = normalizeSummaryToken(payload.selectionAuthority);
  if (explicitAuthority) return explicitAuthority;

  if (
    owner === "drag-overlay" ||
    phase === "predrag" ||
    phase === "drag" ||
    phase === "settling"
  ) {
    return "drag-session";
  }
  if (owner === "hover-indicator" || normalizeSummaryToken(payload.hoverId)) {
    return "hover-target";
  }
  if (normalizeIdDigestValue(payload.selectedIds)) {
    return "logical-selection";
  }
  return null;
}

function inferGeometryAuthority(entry, owner = null, phase = null) {
  const payload = entry?.payload || {};
  const explicitAuthority = normalizeSummaryToken(payload.geometryAuthority);
  if (explicitAuthority) return explicitAuthority;

  const source =
    normalizeSummaryToken(payload.overlaySource) ||
    normalizeSummaryToken(payload.source);
  const debugSource = normalizeSummaryToken(payload.debugSource);

  if (owner === "drag-overlay" && phase === "settling") {
    return "frozen-controlled-snapshot";
  }
  if (owner === "drag-overlay") {
    if (
      source === "predrag-seed" ||
      source === "drag-selection-seed" ||
      source === "controlled-seed" ||
      source === "group-drag-start"
    ) {
      return "startup-seed";
    }
    return "live-nodes";
  }
  if (owner === "hover-indicator") {
    return "live-hover";
  }
  if (debugSource === "line-indicator" || source === "line-indicator") {
    return "selected-auto-bounds";
  }
  if (source === "transformer-primary") {
    return "transformer-live";
  }
  if (debugSource) {
    return debugSource === "drag-overlay"
      ? "live-nodes"
      : "selected-auto-bounds";
  }
  return null;
}

function inferOverlayVisible(entry, owner = null) {
  const payload = entry?.payload || {};
  if (typeof payload.overlayVisible === "boolean") {
    return payload.overlayVisible;
  }
  if (typeof payload.showDragSelectionOverlay === "boolean") {
    return payload.showDragSelectionOverlay;
  }
  if (entry?.eventName === "drag-overlay:shown") return true;
  if (entry?.eventName === "drag-overlay:hidden") return false;
  if (owner === "drag-overlay" && entry?.eventName === "selection-box:shown") {
    return true;
  }
  if (owner === "drag-overlay" && entry?.eventName === "selection-box:hidden") {
    return false;
  }
  return null;
}

function inferSettling(entry, phase = null) {
  const payload = entry?.payload || {};
  if (typeof payload.settling === "boolean") return payload.settling;
  if (typeof payload.canvasInteractionSettling === "boolean") {
    return payload.canvasInteractionSettling;
  }
  return phase === "settling";
}

function formatInlineStringValue(value) {
  const normalizedValue = String(value ?? "").trim();
  if (!normalizedValue) return null;
  return /\s/.test(normalizedValue) ? JSON.stringify(normalizedValue) : normalizedValue;
}

function formatInlineFieldValue(key, value) {
  if (value == null) return null;

  if (
    key === "selectedIds" ||
    key === "visualIds" ||
    key === "suppressedLayers"
  ) {
    const normalizedDigest =
      key === "suppressedLayers"
        ? normalizeIdDigestValue(
            Array.isArray(value) ? value : String(value ?? "").split(",")
          )
        : normalizeIdDigestValue(value);
    return normalizedDigest ? `[${normalizedDigest}]` : null;
  }

  if (
    key === "bounds" ||
    key === "firstBounds" ||
    key === "lastBounds" ||
    key === "firstDragBounds" ||
    key === "lastDragBounds" ||
    key === "firstBoxBounds" ||
    key === "lastBoxBounds"
  ) {
    const inlineBounds =
      typeof value === "string" ? value : formatBoundsInline(value);
    return inlineBounds ? formatInlineStringValue(inlineBounds) : null;
  }

  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }

  if (typeof value === "number") {
    const roundedValue = roundMetric(value, 3);
    return roundedValue === null ? null : String(roundedValue);
  }

  if (Array.isArray(value)) {
    const listValue = value
      .map((item) => String(item ?? "").trim())
      .filter((item) => item !== "")
      .join(",");
    return listValue ? `[${listValue}]` : null;
  }

  if (typeof value === "object") {
    const inlineBounds = formatBoundsInline(value);
    if (inlineBounds) {
      return formatInlineStringValue(inlineBounds);
    }
    return formatInlineStringValue(JSON.stringify(sanitizeCompactValue(value)));
  }

  return formatInlineStringValue(value);
}

function pushInlineField(parts, key, value) {
  const inlineValue = formatInlineFieldValue(key, value);
  if (inlineValue === null) return;
  parts.push(`${key}=${inlineValue}`);
}

function buildInlineEventParts(entry, session = null) {
  const payload = entry?.payload || {};
  const owner = inferOwnerFromEvent(entry);
  const phase = inferPhaseFromEvent(entry, owner);
  const dragSession = inferDragSessionIdentity(entry, session);
  const overlaySession = inferOverlaySessionIdentity(entry, session);
  const selectedIds = normalizeIdDigestValue(payload.selectedIds);
  const visualIds =
    normalizeIdDigestValue(payload.visualIds) ||
    normalizeIdDigestValue(payload.dragOverlaySelectionIds) ||
    normalizeIdDigestValue(payload.visualSelectionSnapshot) ||
    normalizeIdDigestValue(payload.overlaySelectionSnapshot) ||
    (
      entry?.eventName === "selection-box:shown" ||
      entry?.eventName === "selection-box:hidden"
        ? selectedIds
        : null
    );
  const selectionAuthority = inferSelectionAuthority(entry, owner, phase);
  const geometryAuthority = inferGeometryAuthority(entry, owner, phase);
  const overlayVisible = inferOverlayVisible(entry, owner);
  const settling = inferSettling(entry, phase);
  const preferredSource =
    normalizeSummaryToken(payload.overlaySource) ||
    normalizeSummaryToken(payload.source) ||
    normalizeSummaryToken(payload.debugSource);

  const parts = [
    "[BOXFLOW]",
    `token=${entry.token}`,
    `seq=${entry.seq}`,
    `t=${entry.relativeMs}ms`,
    `event=${formatInlineFieldValue("event", entry.eventName)}`,
  ];

  pushInlineField(parts, "channel", entry.channel);
  pushInlineField(parts, "phase", phase);
  pushInlineField(parts, "owner", owner);
  pushInlineField(parts, "dragSession", dragSession);
  pushInlineField(parts, "overlaySession", overlaySession);
  pushInlineField(parts, "dragId", payload.dragId);
  pushInlineField(parts, "hoverId", payload.hoverId);
  pushInlineField(parts, "targetId", payload.targetId);
  pushInlineField(parts, "selectedIds", selectedIds);
  pushInlineField(parts, "visualIds", visualIds);
  pushInlineField(parts, "selectionAuthority", selectionAuthority);
  pushInlineField(parts, "geometryAuthority", geometryAuthority);
  pushInlineField(parts, "source", preferredSource);
  pushInlineField(parts, "sources", payload.sources);
  pushInlineField(parts, "debugSource", payload.debugSource || payload.debugSources);
  pushInlineField(parts, "syncToken", payload.syncToken);
  pushInlineField(parts, "overlayVisible", overlayVisible);
  pushInlineField(parts, "visibilityAuthority", payload.visibilityAuthority);
  pushInlineField(parts, "visibilityDriver", payload.visibilityDriver);
  pushInlineField(parts, "nextVisibilityDriver", payload.nextVisibilityDriver);
  pushInlineField(parts, "ready", payload.isReady);
  pushInlineField(parts, "settling", settling);
  pushInlineField(parts, "suppressedLayers", payload.suppressedLayers);
  pushInlineField(parts, "reason", payload.reason);

  if (payload.summaryKey) {
    pushInlineField(parts, "summary", payload.summaryKey);
    pushInlineField(parts, "count", payload.count);
    if (Number.isFinite(Number(payload.durationMs))) {
      pushInlineField(parts, "dur", `${payload.durationMs}ms`);
    }
    pushInlineField(parts, "firstPos", payload.firstPos);
    pushInlineField(parts, "lastPos", payload.lastPos);
    pushInlineField(parts, "firstBounds", payload.firstBounds);
    pushInlineField(parts, "lastBounds", payload.lastBounds);
    pushInlineField(parts, "firstDrift", payload.firstDrift);
    pushInlineField(parts, "maxDrift", payload.maxDrift);
    pushInlineField(parts, "lastDrift", payload.lastDrift);
    pushInlineField(parts, "firstDragBounds", payload.firstDragBounds);
    pushInlineField(parts, "lastDragBounds", payload.lastDragBounds);
    pushInlineField(parts, "firstBoxBounds", payload.firstBoxBounds);
    pushInlineField(parts, "lastBoxBounds", payload.lastBoxBounds);
    pushInlineField(parts, "dragSources", payload.dragSources);
    pushInlineField(parts, "boxSources", payload.boxSources);
    pushInlineField(parts, "orders", payload.orders);
    pushInlineField(parts, "startupJump", payload.startupJump);
  } else {
    pushInlineField(parts, "bounds", payload.bounds);
  }

  pushInlineField(parts, "renderMode", payload.renderMode);
  pushInlineField(parts, "pipeline", payload.pipeline);
  pushInlineField(parts, "eventIdentity", payload.eventIdentity);
  pushInlineField(parts, "identity", payload.identity);
  pushInlineField(parts, "previousIdentity", payload.previousIdentity);
  pushInlineField(parts, "nextIdentity", payload.nextIdentity || payload.identity);

  return parts;
}

function buildInlineEventLine(entry, session = null) {
  return buildInlineEventParts(entry, session).join(" ");
}

function normalizeChannel(channel) {
  return channel === "hover" ? "hover" : "selection";
}

function normalizeIdentity(identity, channel) {
  if (Array.isArray(identity)) {
    const joined = identity
      .map((value) => String(value ?? "").trim())
      .filter((value) => value !== "")
      .join(",");
    return joined || `${normalizeChannel(channel)}:default`;
  }

  const trimmed = String(identity ?? "").trim();
  return trimmed || `${normalizeChannel(channel)}:default`;
}

function readRetiredIdentityStore(store, channel) {
  if (!store) return null;
  const safeChannel = normalizeChannel(channel);
  if (!store.retiredIdentities || typeof store.retiredIdentities !== "object") {
    store.retiredIdentities = {};
  }
  if (!store.retiredIdentities[safeChannel]) {
    store.retiredIdentities[safeChannel] = {};
  }
  return store.retiredIdentities[safeChannel];
}

function isCanvasBoxFlowIdentityRetiredInStore(
  store,
  channel,
  identity,
  currentSession = null
) {
  const safeChannel = normalizeChannel(channel);
  const safeIdentity = normalizeIdentity(identity, safeChannel);
  if (!safeIdentity) return false;
  if (currentSession?.identity === safeIdentity) return false;
  const retiredIdentityStore = readRetiredIdentityStore(store, safeChannel);
  return Boolean(retiredIdentityStore?.[safeIdentity]);
}

function retireCanvasBoxFlowIdentityInStore(
  store,
  channel,
  identity,
  payload = {},
  targetWindow = null
) {
  const safeChannel = normalizeChannel(channel);
  const safeIdentity = normalizeIdentity(identity, safeChannel);
  if (!safeIdentity) return null;
  const retiredIdentityStore = readRetiredIdentityStore(store, safeChannel);
  if (!retiredIdentityStore) return null;
  const existingRecord = retiredIdentityStore[safeIdentity] || null;
  const nextRecord = {
    identity: safeIdentity,
    retiredAtMs: getNowMs(targetWindow),
    reason: payload?.reason || null,
  };
  retiredIdentityStore[safeIdentity] = {
    ...existingRecord,
    ...nextRecord,
  };
  return retiredIdentityStore[safeIdentity];
}

function resolveReusableIdentity(
  store,
  channel,
  identity,
  currentSession = null
) {
  const safeChannel = normalizeChannel(channel);
  const safeIdentity = normalizeIdentity(identity, safeChannel);
  if (!safeIdentity) return null;
  if (
    isCanvasBoxFlowIdentityRetiredInStore(
      store,
      safeChannel,
      safeIdentity,
      currentSession
    )
  ) {
    return null;
  }
  return safeIdentity;
}

function resolveSessionIdentity(
  channel,
  options = {},
  currentSession = null,
  store = null
) {
  const safeChannel = normalizeChannel(channel);

  if (
    options &&
    Object.prototype.hasOwnProperty.call(options, "sessionIdentity")
  ) {
    const safeSessionIdentity = resolveReusableIdentity(
      store,
      safeChannel,
      options.sessionIdentity,
      currentSession
    );
    if (safeSessionIdentity) {
      return safeSessionIdentity;
    }
  }

  if (
    options &&
    Object.prototype.hasOwnProperty.call(options, "identity")
  ) {
    const safeIdentity = resolveReusableIdentity(
      store,
      safeChannel,
      options.identity,
      currentSession
    );
    if (safeIdentity) {
      return safeIdentity;
    }
  }

  return currentSession?.identity || null;
}

function resolveAuthorityIdentity(
  channel,
  options = {},
  currentSession = null,
  store = null
) {
  const safeChannel = normalizeChannel(channel);

  if (
    options &&
    Object.prototype.hasOwnProperty.call(options, "authorityIdentity")
  ) {
    const rawAuthorityIdentity = options.authorityIdentity;
    if (
      rawAuthorityIdentity === null ||
      typeof rawAuthorityIdentity === "undefined" ||
      rawAuthorityIdentity === false
    ) {
      return null;
    }
    return resolveReusableIdentity(
      store,
      safeChannel,
      rawAuthorityIdentity,
      currentSession
    );
  }

  return currentSession?.authorityIdentity || null;
}

function isAuthorityIdentityLocked(session, authorityIdentity = null) {
  const lockedIdentity = authorityIdentity || session?.authorityIdentity || null;
  if (!session || !lockedIdentity) return false;
  return session.identity === lockedIdentity;
}

function shouldPreserveAuthoritySession(
  session,
  requestedIdentity,
  authorityIdentity = null,
  options = {}
) {
  if (!session) return false;
  if (options?.allowAuthorityReplace === true) return false;
  if (!isAuthorityIdentityLocked(session, authorityIdentity)) return false;
  if (!requestedIdentity) return true;
  return requestedIdentity !== session.identity;
}

function syncSessionAuthorityIdentity(session, authorityIdentity = null) {
  if (!session) return session;
  const normalizedAuthorityIdentity = authorityIdentity || null;
  if (session.authorityIdentity === normalizedAuthorityIdentity) {
    return session;
  }
  session.authorityIdentity = normalizedAuthorityIdentity;
  return session;
}

function maybeAttachEventIdentity(
  payload,
  options = {},
  sessionIdentity = null,
  channel = "selection",
  store = null,
  currentSession = null
) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return payload;
  }

  if (
    !options ||
    !Object.prototype.hasOwnProperty.call(options, "identity")
  ) {
    return payload;
  }

  const eventIdentity = resolveReusableIdentity(
    store,
    channel,
    options.identity,
    currentSession
  );
  if (!eventIdentity || eventIdentity === sessionIdentity || payload.eventIdentity) {
    return payload;
  }

  return {
    ...payload,
    eventIdentity,
  };
}

function ensureDebugStore(targetWindow = null, { reset = false } = {}) {
  const resolvedWindow = getDebugWindow(targetWindow);
  if (!resolvedWindow) return null;

  if (reset || !resolvedWindow[CANVAS_BOX_FLOW_DEBUG_STORE_KEY]) {
    resolvedWindow[CANVAS_BOX_FLOW_DEBUG_STORE_KEY] = {
      counters: {
        hover: 0,
        selection: 0,
      },
      sessions: {
        hover: null,
        selection: null,
      },
      retiredIdentities: {
        hover: {},
        selection: {},
      },
    };
  }

  return resolvedWindow[CANVAS_BOX_FLOW_DEBUG_STORE_KEY];
}

function buildLogEntry(session, eventName, payload = {}, targetWindow = null) {
  const nowMs = getNowMs(targetWindow);
  const nextSequence = Number(session.seq || 0) + 1;
  const relativeMs = roundMetric(nowMs - Number(session.startedAtMs ?? nowMs));
  const compactPayload = sanitizeCompactValue(payload);

  session.seq = nextSequence;
  session.lastEventName = String(eventName || "unknown");
  session.lastEventAtMs = nowMs;
  session.lastPayload = compactPayload;

  return {
    token: session.token,
    channel: session.channel,
    identity: session.identity,
    seq: nextSequence,
    relativeMs,
    eventName: String(eventName || "unknown"),
    payload: compactPayload,
  };
}

function emitBoxFlowLog(session, eventName, payload = {}, targetWindow = null) {
  const entry = buildLogEntry(session, eventName, payload, targetWindow);
  const logger = getDebugConsole(targetWindow);
  const line = buildInlineEventLine(entry, session);

  try {
    logger.log(line);
  } catch {
    // no-op
  }

  return entry;
}

function hasActiveSessionSummaries(session) {
  return Boolean(session && Object.keys(session.summaries || {}).length > 0);
}

function shouldRetargetSessionIdentity(session, options = {}) {
  if (options.allowIdentityRetarget !== true) return false;
  if (!session || hasActiveSessionSummaries(session)) return false;
  return Number(session.seq || 0) <= 1;
}

function flushSessionSummary(session, summaryKey, reason = "manual", targetWindow = null) {
  if (!session || !summaryKey) return null;

  const activeSummary = session.summaries?.[summaryKey];
  if (!activeSummary || Number(activeSummary.count || 0) <= 0) {
    return null;
  }

  delete session.summaries[summaryKey];

  const flatSummaryPayload = buildFlatSummaryPayload(
    session,
    summaryKey,
    reason,
    activeSummary
  );

  return emitBoxFlowLog(
    session,
    activeSummary.eventName || `${summaryKey}:summary`,
    flatSummaryPayload,
    targetWindow
  );
}

export function isCanvasBoxFlowDebugEnabled(targetWindow = null) {
  const resolvedWindow = getDebugWindow(targetWindow);
  if (!resolvedWindow) return false;

  const explicitFlag = readExplicitDebugFlag(
    resolvedWindow[CANVAS_BOX_FLOW_DEBUG_FLAG]
  );
  return explicitFlag === true;
}

export function resetCanvasBoxFlowDebugState(targetWindow = null) {
  const store = ensureDebugStore(targetWindow, { reset: true });
  return Boolean(store);
}

export function getActiveCanvasBoxFlowSession(channel, targetWindow = null) {
  const store = ensureDebugStore(targetWindow);
  if (!store) return null;
  return store.sessions[normalizeChannel(channel)] || null;
}

export function isCanvasBoxFlowIdentityRetired(
  channel,
  identity,
  targetWindow = null
) {
  const store = ensureDebugStore(targetWindow);
  if (!store) return false;
  return isCanvasBoxFlowIdentityRetiredInStore(store, channel, identity, null);
}

export function ensureCanvasBoxFlowSession(
  channel,
  identity,
  payload = {},
  options = {},
  targetWindow = null
) {
  if (!isCanvasBoxFlowDebugEnabled(targetWindow)) return null;

  const safeChannel = normalizeChannel(channel);
  const store = ensureDebugStore(targetWindow);
  if (!store) return null;

  const currentSession = store.sessions[safeChannel];
  const safeIdentity = resolveSessionIdentity(safeChannel, {
    ...options,
    sessionIdentity:
      Object.prototype.hasOwnProperty.call(options || {}, "sessionIdentity")
        ? options.sessionIdentity
        : identity,
  }, currentSession, store);
  const authorityIdentity = resolveAuthorityIdentity(
    safeChannel,
    options,
    currentSession,
    store
  );
  if (!safeIdentity) {
    return currentSession || null;
  }
  if (currentSession && currentSession.identity === safeIdentity) {
    syncSessionAuthorityIdentity(currentSession, authorityIdentity);
    return currentSession;
  }

  if (currentSession) {
    if (
      shouldPreserveAuthoritySession(
        currentSession,
        safeIdentity,
        authorityIdentity,
        options
      )
    ) {
      syncSessionAuthorityIdentity(currentSession, authorityIdentity);
      return currentSession;
    }

    if (shouldRetargetSessionIdentity(currentSession, options)) {
      const previousIdentity = currentSession.identity;
      currentSession.identity = safeIdentity;
      syncSessionAuthorityIdentity(currentSession, authorityIdentity);
      emitBoxFlowLog(
        currentSession,
        options.retargetEventName || "interaction:retarget",
        {
          previousIdentity,
          identity: safeIdentity,
          ...payload,
        },
        targetWindow
      );
      return currentSession;
    }

    Object.keys(currentSession.summaries || {}).forEach((summaryKey) => {
      flushSessionSummary(currentSession, summaryKey, "session-replaced", targetWindow);
    });
    emitBoxFlowLog(
      currentSession,
      options.endEventName || "interaction:end",
      {
        reason: options.endReason || "identity-change",
        nextIdentity: safeIdentity,
      },
      targetWindow
    );
  }

  const nextCount = Number(store.counters[safeChannel] || 0) + 1;
  store.counters[safeChannel] = nextCount;

  const nextSession = {
    channel: safeChannel,
    token: `${safeChannel}#${nextCount}`,
    identity: safeIdentity,
    authorityIdentity: authorityIdentity || null,
    startedAtMs: getNowMs(targetWindow),
    seq: 0,
    summaries: {},
    lastEventName: null,
    lastEventAtMs: null,
    lastPayload: null,
  };
  store.sessions[safeChannel] = nextSession;

  emitBoxFlowLog(
    nextSession,
    options.startEventName || "interaction:start",
    {
      identity: safeIdentity,
      ...payload,
    },
    targetWindow
  );

  return nextSession;
}

export function logCanvasBoxFlow(
  channel,
  eventName,
  payload = {},
  options = {},
  targetWindow = null
) {
  if (!isCanvasBoxFlowDebugEnabled(targetWindow)) return null;

  const safeChannel = normalizeChannel(channel);
  const store = ensureDebugStore(targetWindow);
  if (!store) return null;

  let session = store.sessions[safeChannel];
  const nextIdentity = resolveSessionIdentity(
    safeChannel,
    options,
    session,
    store
  );
  const authorityIdentity = resolveAuthorityIdentity(
    safeChannel,
    options,
    session,
    store
  );

  if (
    session &&
    shouldPreserveAuthoritySession(
      session,
      nextIdentity,
      authorityIdentity,
      options
    )
  ) {
    syncSessionAuthorityIdentity(session, authorityIdentity);
  } else if (!session || (nextIdentity && session.identity !== nextIdentity)) {
    if (!session && !nextIdentity) {
      return null;
    }
    session = ensureCanvasBoxFlowSession(
      safeChannel,
      nextIdentity || `${safeChannel}:implicit`,
      options.startPayload || {},
      {
        startEventName: options.startEventName,
        endEventName: options.endEventName,
        endReason: options.endReason,
        authorityIdentity,
      },
      targetWindow
    );
  }

  if (!session) return null;
  syncSessionAuthorityIdentity(session, authorityIdentity);

  if (Array.isArray(options.flushSummaryKeys)) {
    options.flushSummaryKeys.forEach((summaryKey) => {
      flushSessionSummary(
        session,
        summaryKey,
        options.flushReason || "pre-log-flush",
        targetWindow
      );
    });
  }

  return emitBoxFlowLog(
    session,
    eventName,
    maybeAttachEventIdentity(
      payload,
      options,
      session.identity,
      safeChannel,
      store,
      session
    ),
    targetWindow
  );
}

export function recordCanvasBoxFlowSummary(
  channel,
  summaryKey,
  payload = {},
  options = {},
  targetWindow = null
) {
  if (!isCanvasBoxFlowDebugEnabled(targetWindow)) return null;

  const safeChannel = normalizeChannel(channel);
  const store = ensureDebugStore(targetWindow);
  if (!store) return null;

  let session = store.sessions[safeChannel];
  const nextIdentity = resolveSessionIdentity(
    safeChannel,
    options,
    session,
    store
  );
  const authorityIdentity = resolveAuthorityIdentity(
    safeChannel,
    options,
    session,
    store
  );

  if (
    session &&
    shouldPreserveAuthoritySession(
      session,
      nextIdentity,
      authorityIdentity,
      options
    )
  ) {
    syncSessionAuthorityIdentity(session, authorityIdentity);
  } else if (!session || (nextIdentity && session.identity !== nextIdentity)) {
    if (!session && !nextIdentity) {
      return null;
    }
    session = ensureCanvasBoxFlowSession(
      safeChannel,
      nextIdentity || `${safeChannel}:implicit`,
      options.startPayload || {},
      {
        startEventName: options.startEventName,
        endEventName: options.endEventName,
        endReason: options.endReason,
        authorityIdentity,
      },
      targetWindow
    );
  }

  if (!session) return null;
  syncSessionAuthorityIdentity(session, authorityIdentity);

  const safeSummaryKey = String(summaryKey || "summary");
  const nowMs = getNowMs(targetWindow);
  const compactPayload = sanitizeCompactValue(
    maybeAttachEventIdentity(
      payload,
      options,
      session.identity,
      safeChannel,
      store,
      session
    )
  );
  const throttleMs = Math.max(
    0,
    Number(options.throttleMs ?? CANVAS_BOX_FLOW_SUMMARY_THROTTLE_MS) || 0
  );
  const existingSummary = session.summaries[safeSummaryKey] || {
    eventName: options.eventName || `${safeSummaryKey}:summary`,
    count: 0,
    startedAtMs: nowMs,
    lastAtMs: nowMs,
    lastFlushedAtMs: nowMs,
    firstPayload: null,
    lastPayload: null,
    sources: [],
    debugSources: [],
    dragSources: [],
    boxSources: [],
    comparisonOrders: [],
    driftStates: [],
    maxPayload: null,
    maxEventGap: 0,
  };

  existingSummary.eventName = options.eventName || existingSummary.eventName;
  existingSummary.count += 1;
  existingSummary.lastAtMs = nowMs;
  existingSummary.lastPayload = compactPayload;
  existingSummary.sources = appendUniqueSummaryValues(
    existingSummary.sources,
    collectSummaryValues(compactPayload, ["source"])
  );
  existingSummary.debugSources = appendUniqueSummaryValues(
    existingSummary.debugSources,
    collectSummaryValues(compactPayload, ["debugSource"])
  );
  existingSummary.dragSources = appendUniqueSummaryValues(
    existingSummary.dragSources,
    collectSummaryValues(compactPayload, ["dragSource"])
  );
  existingSummary.boxSources = appendUniqueSummaryValues(
    existingSummary.boxSources,
    collectSummaryValues(compactPayload, ["overlaySource", "boxSource"])
  );
  existingSummary.comparisonOrders = appendUniqueSummaryValues(
    existingSummary.comparisonOrders,
    collectSummaryValues(compactPayload, ["comparisonOrder"])
  );
  existingSummary.driftStates = appendUniqueSummaryValues(
    existingSummary.driftStates,
    collectSummaryValues(compactPayload, ["driftState"])
  );
  if (
    Number.isFinite(Number(compactPayload.distance)) &&
    (
      !existingSummary.maxPayload ||
      Number(compactPayload.distance) >= Number(existingSummary.maxPayload.distance || 0)
    )
  ) {
    existingSummary.maxPayload = compactPayload;
  }
  if (Number.isFinite(Number(compactPayload.orderGap))) {
    existingSummary.maxEventGap = Math.max(
      Number(existingSummary.maxEventGap || 0),
      Number(compactPayload.orderGap || 0)
    );
  }
  if (existingSummary.firstPayload === null) {
    existingSummary.firstPayload = compactPayload;
  }

  session.summaries[safeSummaryKey] = existingSummary;

  if (existingSummary.count <= 1) {
    return null;
  }

  const shouldFlushNow =
    throttleMs === 0 ||
    nowMs - Number(existingSummary.lastFlushedAtMs ?? 0) >= throttleMs;

  if (!shouldFlushNow) return null;

  existingSummary.lastFlushedAtMs = nowMs;
  return flushSessionSummary(
    session,
    safeSummaryKey,
    options.flushReason || "interval",
    targetWindow
  );
}

export function flushCanvasBoxFlowSummary(
  channel,
  summaryKey,
  options = {},
  targetWindow = null
) {
  if (!isCanvasBoxFlowDebugEnabled(targetWindow)) return null;

  const session = getActiveCanvasBoxFlowSession(channel, targetWindow);
  if (!session) return null;

  if (typeof summaryKey === "undefined" || summaryKey === null) {
    return Object.keys(session.summaries || {}).map((key) =>
      flushSessionSummary(session, key, options.reason || "manual", targetWindow)
    );
  }

  return flushSessionSummary(
    session,
    String(summaryKey),
    options.reason || "manual",
    targetWindow
  );
}

export function endCanvasBoxFlowSession(
  channel,
  payload = {},
  options = {},
  targetWindow = null
) {
  if (!isCanvasBoxFlowDebugEnabled(targetWindow)) return null;

  const safeChannel = normalizeChannel(channel);
  const store = ensureDebugStore(targetWindow);
  if (!store) return null;

  const session = store.sessions[safeChannel];
  if (!session) return null;

  Object.keys(session.summaries || {}).forEach((summaryKey) => {
    flushSessionSummary(session, summaryKey, options.summaryReason || "session-end", targetWindow);
  });

  const entry = emitBoxFlowLog(
    session,
    options.eventName || "interaction:end",
    payload,
    targetWindow
  );
  const shouldRetireIdentity =
    options.retireIdentity === true ||
    payload?.reason === "drag-session-complete";
  if (shouldRetireIdentity) {
    retireCanvasBoxFlowIdentityInStore(
      store,
      safeChannel,
      session.identity,
      payload,
      targetWindow
    );
  }
  store.sessions[safeChannel] = null;
  return entry;
}

export function buildCanvasBoxFlowBoundsDigest(bounds) {
  if (!bounds) return null;

  if (Array.isArray(bounds)) {
    const points = bounds
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value));
    if (points.length < 8) return null;
    return buildCanvasBoxFlowBoundsDigest({ kind: "polygon", points });
  }

  if (
    Array.isArray(bounds.points) &&
    bounds.points.length >= 8 &&
    bounds.points.every((value) => Number.isFinite(Number(value)))
  ) {
    const xs = bounds.points
      .filter((_, index) => index % 2 === 0)
      .map((value) => Number(value));
    const ys = bounds.points
      .filter((_, index) => index % 2 === 1)
      .map((value) => Number(value));
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    const maxX = Math.max(...xs);
    const maxY = Math.max(...ys);

    return {
      kind: bounds.kind || "polygon",
      x: roundMetric(minX, 3),
      y: roundMetric(minY, 3),
      width: roundMetric(maxX - minX, 3),
      height: roundMetric(maxY - minY, 3),
    };
  }

  const x = Number(bounds.x);
  const y = Number(bounds.y);
  const width = Number(bounds.width);
  const height = Number(bounds.height);

  if (
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    !Number.isFinite(width) ||
    !Number.isFinite(height)
  ) {
    return null;
  }

  return {
    kind: bounds.kind || "rect",
    x: roundMetric(x, 3),
    y: roundMetric(y, 3),
    width: roundMetric(width, 3),
    height: roundMetric(height, 3),
  };
}

export function buildCanvasBoxFlowIdsDigest(ids) {
  if (!Array.isArray(ids)) return "";
  return Array.from(
    new Set(
      ids
        .map((value) => String(value ?? "").trim())
        .filter((value) => value !== "")
    )
  )
    .sort((left, right) => left.localeCompare(right))
    .join(",");
}
