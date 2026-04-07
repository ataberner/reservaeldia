import {
  isSelectedDragDebugEnabled,
  logSelectedDragDebug,
  sampleCanvasInteractionLog,
} from "@/components/editor/canvasEditor/selectedDragDebug";

const TEXT_GEOMETRY_CONTRACT_DEBUG_STORE_KEY =
  "__TEXT_GEOMETRY_CONTRACT_DEBUG_STORE";

function getContractDebugStore() {
  if (typeof window === "undefined") return null;
  if (!window[TEXT_GEOMETRY_CONTRACT_DEBUG_STORE_KEY]) {
    window[TEXT_GEOMETRY_CONTRACT_DEBUG_STORE_KEY] = {
      lastSignatureByKey: {},
      latestSnapByKey: {},
    };
  }
  return window[TEXT_GEOMETRY_CONTRACT_DEBUG_STORE_KEY];
}

function readWindowDebugToken(value) {
  if (value == null) return null;
  const trimmed = String(value).trim();
  return trimmed || null;
}

function resolveTextGeometryContractDebugScope() {
  if (typeof window === "undefined") {
    return {
      mode: "all",
      elementId: null,
      sessionId: null,
    };
  }

  const explicitMode = readWindowDebugToken(window.__DEBUG_TEXT_GEOMETRY_SCOPE);
  const explicitElementId = readWindowDebugToken(
    window.__DEBUG_TEXT_GEOMETRY_ELEMENT_ID
  );
  const explicitSessionId = readWindowDebugToken(
    window.__DEBUG_TEXT_GEOMETRY_SESSION_ID
  );

  if (explicitMode === "all") {
    return {
      mode: "all",
      elementId: explicitElementId,
      sessionId: explicitSessionId,
    };
  }

  if (explicitElementId || explicitSessionId) {
    return {
      mode: explicitMode || "explicit",
      elementId: explicitElementId,
      sessionId: explicitSessionId,
    };
  }

  const activeDraggedElementId = readWindowDebugToken(
    window._pendingDragSelectionId
  );
  if (window._isDragging === true && activeDraggedElementId) {
    return {
      mode: "active-drag",
      elementId: activeDraggedElementId,
      sessionId: null,
    };
  }

  const selectedIds = Array.isArray(window._elementosSeleccionados)
    ? window._elementosSeleccionados
        .map((value) => readWindowDebugToken(value))
        .filter(Boolean)
    : [];
  if (selectedIds.length === 1) {
    return {
      mode: "single-selection",
      elementId: selectedIds[0],
      sessionId: null,
    };
  }

  return {
    mode: explicitMode || "all",
    elementId: null,
    sessionId: null,
  };
}

export function roundTextGeometryContractMetric(value, digits = 2) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  const factor = 10 ** digits;
  return Math.round(numeric * factor) / factor;
}

function toFiniteRectMetric(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

export function buildTextGeometryContractRect(rect) {
  const x = toFiniteRectMetric(rect?.x);
  const y = toFiniteRectMetric(rect?.y);
  const width = toFiniteRectMetric(rect?.width);
  const height = toFiniteRectMetric(rect?.height);

  if ([x, y, width, height].some((value) => value === null)) {
    return null;
  }

  return {
    x: roundTextGeometryContractMetric(x, 3),
    y: roundTextGeometryContractMetric(y, 3),
    width: roundTextGeometryContractMetric(width, 3),
    height: roundTextGeometryContractMetric(height, 3),
    centerX: roundTextGeometryContractMetric(x + width / 2, 3),
    centerY: roundTextGeometryContractMetric(y + height / 2, 3),
  };
}

export function buildTextGeometryContractRectDelta(fromRect, toRect) {
  const from = buildTextGeometryContractRect(fromRect);
  const to = buildTextGeometryContractRect(toRect);
  if (!from || !to) return null;

  return {
    dx: roundTextGeometryContractMetric(to.x - from.x, 3),
    dy: roundTextGeometryContractMetric(to.y - from.y, 3),
    dWidth: roundTextGeometryContractMetric(to.width - from.width, 3),
    dHeight: roundTextGeometryContractMetric(to.height - from.height, 3),
    dCenterX: roundTextGeometryContractMetric(to.centerX - from.centerX, 3),
    dCenterY: roundTextGeometryContractMetric(to.centerY - from.centerY, 3),
  };
}

export function hasMeaningfulTextGeometryContractRectDelta(
  delta,
  tolerance = 0.5
) {
  if (!delta) return false;

  return [
    delta.dx,
    delta.dy,
    delta.dWidth,
    delta.dHeight,
    delta.dCenterX,
    delta.dCenterY,
  ].some((value) => Math.abs(Number(value) || 0) > tolerance);
}

export function evaluateTextGeometryContractRectAlignment(
  expectedRect,
  actualRect,
  {
    tolerance = 0.5,
    expectedLabel = "authoritative",
    actualLabel = "observed",
  } = {}
) {
  const normalizedExpected = buildTextGeometryContractRect(expectedRect);
  const normalizedActual = buildTextGeometryContractRect(actualRect);

  if (!normalizedExpected) {
    return {
      pass: false,
      delta: null,
      failureReason: `missing ${expectedLabel} rect`,
    };
  }

  if (!normalizedActual) {
    return {
      pass: false,
      delta: null,
      failureReason: `missing ${actualLabel} rect`,
    };
  }

  const delta = buildTextGeometryContractRectDelta(
    normalizedExpected,
    normalizedActual
  );
  const pass = !hasMeaningfulTextGeometryContractRectDelta(delta, tolerance);
  const failureReason = pass
    ? null
    : `${actualLabel} diverged from ${expectedLabel}`;

  return {
    pass,
    delta,
    failureReason,
  };
}

export function recordTextGeometryContractSnapshot(
  sessionOrElementKey,
  snapshot = {}
) {
  const store = getContractDebugStore();
  const safeKey = readWindowDebugToken(sessionOrElementKey);
  if (!store || !safeKey) return;

  store.latestSnapByKey[safeKey] = {
    ...snapshot,
    recordedAtMs: roundTextGeometryContractMetric(
      typeof performance !== "undefined" && typeof performance.now === "function"
        ? performance.now()
        : Date.now(),
      3
    ),
  };
}

export function readTextGeometryContractSnapshot(
  sessionOrElementKey,
  fallbackElementKey = null,
  { preferPrimaryOnly = false } = {}
) {
  const store = getContractDebugStore();
  if (!store) return null;

  const primaryKey = readWindowDebugToken(sessionOrElementKey);
  const fallbackKey = readWindowDebugToken(fallbackElementKey);
  const primarySnapshot = primaryKey
    ? store.latestSnapByKey[primaryKey] || null
    : null;

  if (primarySnapshot || preferPrimaryOnly) {
    return primarySnapshot;
  }

  return fallbackKey ? store.latestSnapByKey[fallbackKey] || null : null;
}

function buildInvariantStateSignature(payload = {}) {
  const observedRects = payload?.observedRects || null;
  return JSON.stringify({
    pass: payload?.pass === true,
    phase: payload?.phase || null,
    authoritySource: payload?.authoritySource || null,
    renderAuthority: payload?.renderAuthority || null,
    failureReason: payload?.failureReason || null,
    observedRects,
  });
}

export function logTextGeometryContractInvariant(
  invariantName,
  payload = {},
  {
    sampleKey = null,
    firstCount = 3,
    throttleMs = 180,
    force = false,
    stateSignature = null,
  } = {}
) {
  if (!isSelectedDragDebugEnabled()) return;

  const scope = resolveTextGeometryContractDebugScope();
  const payloadElementId = readWindowDebugToken(payload?.elementId);
  const payloadSessionCandidates = [
    readWindowDebugToken(payload?.sessionIdentity),
    readWindowDebugToken(payload?.dragOverlaySessionKey),
    readWindowDebugToken(payload?.guideSessionId),
  ].filter(Boolean);
  const matchesScopedElement =
    !scope.elementId || payloadElementId === scope.elementId;
  const matchesScopedSession =
    !scope.sessionId || payloadSessionCandidates.includes(scope.sessionId);
  const shouldLogForScope =
    scope.mode === "all" ||
    (matchesScopedElement && matchesScopedSession) ||
    (
      !scope.elementId &&
      scope.sessionId &&
      matchesScopedSession
    );

  if (!shouldLogForScope) return;

  const resolvedInvariant = String(invariantName || "text-geometry");
  const resolvedSampleKey =
    sampleKey ||
    `text-contract:${resolvedInvariant}:${
      payload?.sessionIdentity || payload?.elementId || "global"
    }`;

  const sample = sampleCanvasInteractionLog(resolvedSampleKey, {
    firstCount,
    throttleMs,
  });

  const store = getContractDebugStore();
  const signature = stateSignature || buildInvariantStateSignature(payload);
  const previousSignature = store?.lastSignatureByKey?.[resolvedSampleKey] || null;
  const changed = previousSignature !== signature;

  if (store && changed) {
    store.lastSignatureByKey[resolvedSampleKey] = signature;
  }

  const shouldLog =
    force ||
    payload?.pass === false ||
    changed ||
    sample.shouldLog;

  if (!shouldLog) return;

  logSelectedDragDebug(`contract:${resolvedInvariant}`, {
    sampleCount: sample.sampleCount,
    perfNowMs: sample.nowMs,
    invariant: resolvedInvariant,
    ...payload,
    pass: payload?.pass === true,
    changed,
  });
}
