export const TOUCH_DRAG_INTENT_DEFAULTS = Object.freeze({
  touchDragThresholdPx: 10,
  penDragThresholdPx: 8,
  mouseDragThresholdPx: 1,
  diagonalDragThresholdPx: 18,
  verticalScrollThresholdPx: 7,
  verticalDominanceRatio: 1,
  horizontalDominanceRatio: 1.05,
  scrollDeltaThresholdPx: 2,
});

const activeNativeTouchScrollLeases = new WeakMap();
let nativeTouchScrollLeaseSequence = 0;

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

function resolveNativeEvent(event = null) {
  return event?.evt || event?.nativeEvent || event || null;
}

/**
 * Temporarily disables Konva's per-hit-node touchstart preventDefault. Konva
 * checks the hit Shape after bubbling, so a press handler can safely acquire
 * this lease before Stage performs that check.
 */
export function allowNativeTouchScrollOnKonvaPress(event = null) {
  const nativeEvent = resolveNativeEvent(event);
  const pointerType = resolvePointerTypeFromNativeEvent(nativeEvent);
  if (!isTouchLikePointerType(pointerType)) return null;

  const target = event?.target || null;
  if (!target || typeof target.preventDefault !== "function") return null;

  const activeLease = activeNativeTouchScrollLeases.get(target);
  if (activeLease && !activeLease.released) return activeLease;

  let previousPreventDefault;
  try {
    previousPreventDefault = Boolean(target.preventDefault());
    target.preventDefault(false);
  } catch {
    return null;
  }

  nativeTouchScrollLeaseSequence += 1;
  const lease = {
    id: nativeTouchScrollLeaseSequence,
    pointerType,
    target,
    previousPreventDefault,
    released: false,
  };
  activeNativeTouchScrollLeases.set(target, lease);
  return lease;
}

export function releaseNativeTouchScrollOnKonvaPress(lease = null) {
  if (!lease || lease.released || !lease.target) return false;

  const { target } = lease;
  if (activeNativeTouchScrollLeases.get(target) !== lease) {
    lease.released = true;
    return false;
  }

  lease.released = true;
  activeNativeTouchScrollLeases.delete(target);
  try {
    target.preventDefault(Boolean(lease.previousPreventDefault));
    return true;
  } catch {
    return false;
  }
}

/**
 * Transfers ownership from native scrolling to an intentional Konva drag.
 * Restoration and node ownership happen before cancelling the confirming move.
 */
export function claimNativeTouchDrag(
  leaseOrInput = null,
  dragNodeArgument = null,
  nativeEventArgument = null
) {
  const usesObjectInput = Boolean(
    leaseOrInput &&
      typeof leaseOrInput === "object" &&
      (
        Object.prototype.hasOwnProperty.call(leaseOrInput, "lease") ||
        Object.prototype.hasOwnProperty.call(leaseOrInput, "dragNode") ||
        Object.prototype.hasOwnProperty.call(leaseOrInput, "nativeEvent")
      )
  );
  const lease = usesObjectInput ? leaseOrInput.lease || null : leaseOrInput;
  const dragNode = usesObjectInput
    ? leaseOrInput.dragNode || null
    : dragNodeArgument;
  const nativeEvent = resolveNativeEvent(
    usesObjectInput ? leaseOrInput.nativeEvent || null : nativeEventArgument
  );
  const pointerType = String(
    lease?.pointerType || resolvePointerTypeFromNativeEvent(nativeEvent) || ""
  ).toLowerCase();

  if (!isTouchLikePointerType(pointerType)) {
    return {
      claimed: false,
      leaseReleased: false,
      dragNodeClaimed: false,
      nativeDefaultPrevented: false,
    };
  }

  const leaseReleased = releaseNativeTouchScrollOnKonvaPress(lease);
  let dragNodeClaimed = false;
  if (typeof dragNode?.preventDefault === "function") {
    try {
      dragNode.preventDefault(true);
      dragNodeClaimed = true;
    } catch {}
  }

  let nativeDefaultPrevented = false;
  if (nativeEvent?.cancelable && typeof nativeEvent.preventDefault === "function") {
    try {
      nativeEvent.preventDefault();
      nativeDefaultPrevented = true;
    } catch {}
  }

  return {
    claimed: true,
    leaseReleased,
    dragNodeClaimed,
    nativeDefaultPrevented,
  };
}

export function resolveTouchDragIntent(input = {}) {
  const pointerType = String(input.pointerType || "").toLowerCase();
  const touchLike = isTouchLikePointerType(pointerType);
  const dx = toFiniteNumber(input.deltaX, 0);
  const dy = toFiniteNumber(input.deltaY, 0);
  const absDx = Math.abs(dx);
  const absDy = Math.abs(dy);
  const distancePx = Math.hypot(dx, dy);
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
    return {
      decision: "scroll",
      reason: "vertical-scroll-dominant",
      distancePx,
      absDx,
      absDy,
      dragThresholdPx,
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
    };
  }

  return {
    decision: "pending",
    reason: "ambiguous-diagonal",
    distancePx,
    absDx,
    absDy,
    dragThresholdPx,
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
