export const TOUCH_DRAG_INTENT_DEFAULTS = Object.freeze({
  touchDragThresholdPx: 10,
  penDragThresholdPx: 8,
  mouseDragThresholdPx: 1,
  diagonalDragThresholdPx: 18,
  verticalScrollThresholdPx: 7,
  verticalDominanceRatio: 1.25,
  horizontalDominanceRatio: 1.05,
  verticalDragHoldMs: 180,
  scrollDeltaThresholdPx: 2,
});

export function resolvePointerTypeFromNativeEvent(nativeEvent = null) {
  if (nativeEvent?.pointerType) {
    return String(nativeEvent.pointerType).toLowerCase();
  }
  if (nativeEvent?.touches || nativeEvent?.changedTouches) return "touch";
  return "mouse";
}

export function isTouchLikePointerType(pointerType) {
  const normalized = String(pointerType || "").toLowerCase();
  return normalized === "touch" || normalized === "pen";
}

export function getTouchAwareDragThreshold(pointerType, fallback = null) {
  const normalized = String(pointerType || "").toLowerCase();
  if (normalized === "touch") return TOUCH_DRAG_INTENT_DEFAULTS.touchDragThresholdPx;
  if (normalized === "pen") return TOUCH_DRAG_INTENT_DEFAULTS.penDragThresholdPx;
  if (Number.isFinite(Number(fallback))) return Number(fallback);
  return TOUCH_DRAG_INTENT_DEFAULTS.mouseDragThresholdPx;
}

function toFiniteNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function resolveTouchDragIntent(input = {}) {
  const pointerType = String(input.pointerType || "").toLowerCase();
  const touchLike = isTouchLikePointerType(pointerType);
  const dx = toFiniteNumber(input.deltaX, 0);
  const dy = toFiniteNumber(input.deltaY, 0);
  const absDx = Math.abs(dx);
  const absDy = Math.abs(dy);
  const distancePx = Math.hypot(dx, dy);
  const elapsedMs = Math.max(0, toFiniteNumber(input.elapsedMs, 0));
  const scrollDeltaX = Math.abs(toFiniteNumber(input.scrollDeltaX, 0));
  const scrollDeltaY = Math.abs(toFiniteNumber(input.scrollDeltaY, 0));
  const dragThresholdPx = Math.max(
    1,
    toFiniteNumber(
      input.dragThresholdPx,
      getTouchAwareDragThreshold(pointerType)
    )
  );
  const verticalScrollThresholdPx = Math.max(
    1,
    toFiniteNumber(
      input.verticalScrollThresholdPx,
      TOUCH_DRAG_INTENT_DEFAULTS.verticalScrollThresholdPx
    )
  );
  const verticalDominanceRatio = Math.max(
    1,
    toFiniteNumber(
      input.verticalDominanceRatio,
      TOUCH_DRAG_INTENT_DEFAULTS.verticalDominanceRatio
    )
  );
  const horizontalDominanceRatio = Math.max(
    1,
    toFiniteNumber(
      input.horizontalDominanceRatio,
      TOUCH_DRAG_INTENT_DEFAULTS.horizontalDominanceRatio
    )
  );
  const diagonalDragThresholdPx = Math.max(
    dragThresholdPx,
    toFiniteNumber(
      input.diagonalDragThresholdPx,
      TOUCH_DRAG_INTENT_DEFAULTS.diagonalDragThresholdPx
    )
  );
  const verticalDragHoldMs = Math.max(
    0,
    toFiniteNumber(
      input.verticalDragHoldMs,
      TOUCH_DRAG_INTENT_DEFAULTS.verticalDragHoldMs
    )
  );
  const scrollDeltaThresholdPx = Math.max(
    0,
    toFiniteNumber(
      input.scrollDeltaThresholdPx,
      TOUCH_DRAG_INTENT_DEFAULTS.scrollDeltaThresholdPx
    )
  );

  if (!touchLike) {
    return {
      decision: distancePx >= dragThresholdPx ? "drag" : "pending",
      reason: distancePx >= dragThresholdPx ? "non-touch-threshold" : "below-threshold",
      distancePx,
      absDx,
      absDy,
      dragThresholdPx,
    };
  }

  if (scrollDeltaX > scrollDeltaThresholdPx || scrollDeltaY > scrollDeltaThresholdPx) {
    return {
      decision: "scroll",
      reason: "native-scroll-observed",
      distancePx,
      absDx,
      absDy,
      dragThresholdPx,
      scrollDeltaX,
      scrollDeltaY,
    };
  }

  if (distancePx < dragThresholdPx) {
    return {
      decision: "pending",
      reason: "below-threshold",
      distancePx,
      absDx,
      absDy,
      dragThresholdPx,
    };
  }

  const verticalDominant =
    absDy >= verticalScrollThresholdPx &&
    absDy >= absDx * verticalDominanceRatio;
  if (verticalDominant) {
    if (elapsedMs >= verticalDragHoldMs) {
      return {
        decision: "drag",
        reason: "vertical-drag-after-hold",
        distancePx,
        absDx,
        absDy,
        dragThresholdPx,
        elapsedMs,
      };
    }

    return {
      decision: "scroll",
      reason: "vertical-scroll-dominant",
      distancePx,
      absDx,
      absDy,
      dragThresholdPx,
      elapsedMs,
    };
  }

  const horizontalDominant =
    absDx >= dragThresholdPx &&
    absDx >= absDy * horizontalDominanceRatio;
  if (horizontalDominant) {
    return {
      decision: "drag",
      reason: "horizontal-drag-dominant",
      distancePx,
      absDx,
      absDy,
      dragThresholdPx,
      elapsedMs,
    };
  }

  if (distancePx >= diagonalDragThresholdPx) {
    return {
      decision: "drag",
      reason: "diagonal-drag-distance",
      distancePx,
      absDx,
      absDy,
      dragThresholdPx,
      elapsedMs,
    };
  }

  return {
    decision: "pending",
    reason: "ambiguous-diagonal",
    distancePx,
    absDx,
    absDy,
    dragThresholdPx,
    elapsedMs,
  };
}

function isScrollableOverflow(value) {
  const normalized = String(value || "").toLowerCase();
  return normalized === "auto" || normalized === "scroll" || normalized === "overlay";
}

export function resolveEditorScrollContainer(source = null) {
  if (typeof document === "undefined") return null;

  const stage = source?.getStage?.() || source || null;
  const stageContainer =
    stage?.container?.() ||
    stage?.content ||
    (source?.nodeType === 1 ? source : null);

  const dashboardRoot = stageContainer?.closest?.("[data-dashboard-scroll-root='true']");
  if (dashboardRoot) return dashboardRoot;

  let current = stageContainer?.parentElement || null;
  while (current && current !== document.body) {
    const style = window.getComputedStyle?.(current);
    if (
      style &&
      (isScrollableOverflow(style.overflowY) || isScrollableOverflow(style.overflow))
    ) {
      return current;
    }
    current = current.parentElement;
  }

  return document.scrollingElement || document.documentElement || document.body || null;
}

export function createEditorScrollSnapshot(source = null) {
  if (typeof window === "undefined") {
    return {
      scrollRoot: null,
      scrollLeft: 0,
      scrollTop: 0,
      windowX: 0,
      windowY: 0,
    };
  }

  const scrollRoot = resolveEditorScrollContainer(source);
  return {
    scrollRoot,
    scrollLeft: Number(scrollRoot?.scrollLeft || 0),
    scrollTop: Number(scrollRoot?.scrollTop || 0),
    windowX: Number(window.scrollX || window.pageXOffset || 0),
    windowY: Number(window.scrollY || window.pageYOffset || 0),
  };
}

export function getEditorScrollDelta(snapshot = null) {
  if (typeof window === "undefined" || !snapshot) {
    return { x: 0, y: 0 };
  }

  const scrollRoot = snapshot.scrollRoot || null;
  const rootDeltaX = scrollRoot
    ? Number(scrollRoot.scrollLeft || 0) - Number(snapshot.scrollLeft || 0)
    : 0;
  const rootDeltaY = scrollRoot
    ? Number(scrollRoot.scrollTop || 0) - Number(snapshot.scrollTop || 0)
    : 0;
  const windowDeltaX =
    Number(window.scrollX || window.pageXOffset || 0) - Number(snapshot.windowX || 0);
  const windowDeltaY =
    Number(window.scrollY || window.pageYOffset || 0) - Number(snapshot.windowY || 0);

  return {
    x: Math.abs(rootDeltaX) >= Math.abs(windowDeltaX) ? rootDeltaX : windowDeltaX,
    y: Math.abs(rootDeltaY) >= Math.abs(windowDeltaY) ? rootDeltaY : windowDeltaY,
  };
}
