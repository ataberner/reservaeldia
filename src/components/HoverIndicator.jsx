import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { Rect, Group, Line } from "react-konva";
import {
  buildSelectionFramePolygon,
  getSelectionFramePadding,
} from "@/components/editor/textSystem/render/konva/selectionFrameVisuals";
import { isFunctionalCtaButton } from "@/domain/functionalCtaButtons";
import {
  buildCanvasBoxFlowBoundsDigest,
  flushCanvasBoxFlowSummary,
  logCanvasBoxFlow,
  recordCanvasBoxFlowSummary,
} from "@/components/editor/canvasEditor/canvasBoxFlowDebug";

function areBoundsDigestsEqual(left, right) {
  if (!left || !right) return left === right;
  return (
    left.kind === right.kind &&
    left.x === right.x &&
    left.y === right.y &&
    left.width === right.width &&
    left.height === right.height
  );
}

function getCountdownHoverBox(node) {
  try {
    const hitbox = node?.findOne?.(".countdown-hitbox");
    if (hitbox?.getClientRect) {
      const rect = hitbox.getClientRect({
        skipTransform: false,
        skipShadow: true,
        skipStroke: true,
      });
      if (Number.isFinite(rect?.width) && Number.isFinite(rect?.height)) {
        return rect;
      }
    }
  } catch {}

  try {
    return node?.getClientRect?.({
      skipTransform: false,
      skipShadow: true,
      skipStroke: true,
    });
  } catch {}

  return null;
}

function drawHoverIndicatorLayer(layer) {
  try {
    layer?.draw?.();
    return;
  } catch {}

  try {
    layer?.batchDraw?.();
  } catch {}
}

const HoverIndicator = forwardRef(function HoverIndicator({
  hoveredElement,
  elementRefs,
  objetos = [],
  activeInlineEditingId = null,
  isMobile = false,
}, forwardedRef) {
  const [runtimeDragActive, setRuntimeDragActive] = useState(false);
  const groupRef = useRef(null);
  const rectRef = useRef(null);
  const lineRef = useRef(null);
  const hoverIndicatorSnapshotRef = useRef(null);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const syncDragState = () => {
      setRuntimeDragActive(Boolean(window._isDragging));
    };

    const onDragStart = () => setRuntimeDragActive(true);
    const onDragEnd = () => syncDragState();

    window.addEventListener("dragging-start", onDragStart);
    window.addEventListener("dragging-end", onDragEnd);
    syncDragState();

    return () => {
      window.removeEventListener("dragging-start", onDragStart);
      window.removeEventListener("dragging-end", onDragEnd);
    };
  }, []);

  const node = hoveredElement ? elementRefs?.current?.[hoveredElement] || null : null;
  const hoveredObj = Array.isArray(objetos)
    ? objetos.find((o) => o.id === hoveredElement) || null
    : null;
  const suppressInlineTextHover =
    hoveredObj?.tipo === "texto" && hoveredElement === activeInlineEditingId;
  const isImageHoverTarget =
    hoveredObj?.tipo === "imagen" && !hoveredObj?.esFondo;
  const shouldUseRotatedFrame =
    hoveredObj?.tipo === "texto" ||
    isImageHoverTarget ||
    hoveredObj?.tipo === "forma" ||
    isFunctionalCtaButton(hoveredObj);

  let availabilityReason = null;
  if (runtimeDragActive) {
    availabilityReason = "runtime-drag-active";
  } else if (!hoveredElement) {
    availabilityReason = "no-hover-target";
  } else if (!node) {
    availabilityReason = "missing-node";
  } else if (!node?.getStage?.()) {
    availabilityReason = "missing-stage";
  } else if (suppressInlineTextHover) {
    availabilityReason = "inline-editing-active";
  }

  let box = null;
  let boundsSource = null;

  if (!availabilityReason) {
    if (
      hoveredObj?.tipo === "galeria" &&
      Number.isFinite(Number(hoveredObj.width)) &&
      Number.isFinite(Number(hoveredObj.height))
    ) {
      const absPos =
        typeof node.getAbsolutePosition === "function"
          ? node.getAbsolutePosition()
          : {
              x: typeof node.x === "function" ? node.x() : 0,
              y: typeof node.y === "function" ? node.y() : 0,
            };

      box = {
        x: absPos.x,
        y: absPos.y,
        width: Number(hoveredObj.width),
        height: Number(hoveredObj.height),
      };
      boundsSource = "gallery-frame";
    } else if (hoveredObj?.tipo === "countdown") {
      box = getCountdownHoverBox(node);
      boundsSource = "countdown-hitbox";
    } else if (isFunctionalCtaButton(hoveredObj)) {
      box = node.getClientRect({
        skipShadow: true,
        skipStroke: true,
      });
      boundsSource = "functional-cta-client-rect";
    } else {
      box = node.getClientRect();
      boundsSource = "client-rect";
    }
  }

  const framePadding = isImageHoverTarget
    ? 0
    : getSelectionFramePadding(isMobile);
  const framePoints =
    !availabilityReason && shouldUseRotatedFrame
      ? buildSelectionFramePolygon(node, framePadding)
      : null;
  const hasFramePoints =
    Array.isArray(framePoints) &&
    framePoints.length === 8 &&
    framePoints.every((value) => Number.isFinite(Number(value)));
  const effectiveBoundsSource = hasFramePoints ? "polygon" : boundsSource;

  if (
    !availabilityReason &&
    !hasFramePoints &&
    (!box || isNaN(box.x) || isNaN(box.y) || box.width <= 0 || box.height <= 0)
  ) {
    availabilityReason = "invalid-bounds";
  }

  const boundsDigest = buildCanvasBoxFlowBoundsDigest(
    hasFramePoints
      ? { kind: "polygon", points: framePoints }
      : box
        ? {
            kind: "rect",
            x: box.x - framePadding,
            y: box.y - framePadding,
            width: box.width + framePadding * 2,
            height: box.height + framePadding * 2,
          }
        : null
  );
  const shouldRender = Boolean(hoveredElement && !availabilityReason && boundsDigest);

  const forceHideHoverVisual = useCallback((meta = {}) => {
    const previousSnapshot = hoverIndicatorSnapshotRef.current;
    const hoverId = meta.hoverId || previousSnapshot?.hoverId || hoveredElement || null;
    const reason = meta.reason || "forced-clear";
    const layer =
      groupRef.current?.getLayer?.() ||
      previousSnapshot?.layer ||
      null;
    let didChange = false;

    try {
      if (groupRef.current?.visible?.()) {
        groupRef.current.visible(false);
        didChange = true;
      }
    } catch {}

    try {
      if (rectRef.current?.visible?.()) {
        rectRef.current.visible(false);
        didChange = true;
      }
    } catch {}

    try {
      if (lineRef.current?.visible?.()) {
        lineRef.current.visible(false);
        didChange = true;
      }
    } catch {}

    if (previousSnapshot?.visible && hoverId) {
      flushCanvasBoxFlowSummary("hover", "hover-bounds", {
        reason,
      });
      logCanvasBoxFlow("hover", "box:hidden", {
        source: "hover-indicator",
        hoverId,
        reason,
        boundsSource: previousSnapshot.boundsSource || null,
      }, {
        identity: hoverId,
      });
    }

    if (didChange || layer) {
      drawHoverIndicatorLayer(layer);
    }

    hoverIndicatorSnapshotRef.current = {
      hoverId,
      visible: false,
      boundsDigest: null,
      boundsSource: null,
      availabilityReason: reason,
      layer,
    };

    return Boolean(previousSnapshot?.visible || didChange);
  }, [hoveredElement]);

  useImperativeHandle(forwardedRef, () => ({
    forceHide(meta = {}) {
      return forceHideHoverVisual(meta);
    },
    getVisibleHoverId() {
      return hoverIndicatorSnapshotRef.current?.visible
        ? hoverIndicatorSnapshotRef.current.hoverId
        : null;
    },
  }), [forceHideHoverVisual]);

  useEffect(() => {
    const nextSnapshot = {
      hoverId: hoveredElement || null,
      visible: shouldRender,
      boundsDigest,
      boundsSource: effectiveBoundsSource,
      availabilityReason,
      layer: node?.getLayer?.() || null,
    };
    const previousSnapshot = hoverIndicatorSnapshotRef.current;
    hoverIndicatorSnapshotRef.current = nextSnapshot;

    if (previousSnapshot?.visible && (
      !nextSnapshot.visible ||
      previousSnapshot.hoverId !== nextSnapshot.hoverId
    )) {
      flushCanvasBoxFlowSummary("hover", "hover-bounds", {
        reason: "box-hidden",
      });
      logCanvasBoxFlow("hover", "box:hidden", {
        source: "hover-indicator",
        hoverId: previousSnapshot.hoverId,
        reason:
          previousSnapshot.hoverId !== nextSnapshot.hoverId
            ? "target-changed"
            : nextSnapshot.availabilityReason || "hidden",
        boundsSource: previousSnapshot.boundsSource || null,
      }, {
        identity: previousSnapshot.hoverId,
      });
      drawHoverIndicatorLayer(previousSnapshot.layer);
    }

    if (!hoveredElement) {
      return;
    }

    if (!shouldRender) {
      if (
        !previousSnapshot ||
        previousSnapshot.hoverId !== hoveredElement ||
        previousSnapshot.availabilityReason !== availabilityReason
      ) {
        logCanvasBoxFlow("hover", "box:unavailable", {
          source: "hover-indicator",
          hoverId: hoveredElement,
          reason: availabilityReason,
        }, {
          identity: hoveredElement,
        });
      }
      return;
    }

    if (!previousSnapshot?.visible || previousSnapshot.hoverId !== hoveredElement) {
      logCanvasBoxFlow("hover", "box:shown", {
        source: "hover-indicator",
        hoverId: hoveredElement,
        boundsSource: effectiveBoundsSource,
        bounds: boundsDigest,
      }, {
        identity: hoveredElement,
      });
    }

    if (
      !previousSnapshot ||
      previousSnapshot.hoverId !== hoveredElement ||
      !areBoundsDigestsEqual(previousSnapshot.boundsDigest, boundsDigest)
    ) {
      recordCanvasBoxFlowSummary("hover", "hover-bounds", {
        source: effectiveBoundsSource,
        hoverId: hoveredElement,
        bounds: boundsDigest,
      }, {
        identity: hoveredElement,
        eventName: "bounds:summary",
      });
    }
  }, [
    availabilityReason,
    boundsDigest,
    effectiveBoundsSource,
    hoveredElement,
    shouldRender,
  ]);

  useEffect(
    () => () => {
      const previousSnapshot = hoverIndicatorSnapshotRef.current;
      if (!previousSnapshot?.visible) return;
      flushCanvasBoxFlowSummary("hover", "hover-bounds", {
        reason: "component-unmount",
      });
      logCanvasBoxFlow("hover", "box:hidden", {
        source: "hover-indicator",
        hoverId: previousSnapshot.hoverId,
        reason: "component-unmount",
        boundsSource: previousSnapshot.boundsSource || null,
      }, {
        identity: previousSnapshot.hoverId,
      });
      drawHoverIndicatorLayer(previousSnapshot.layer);
    },
    []
  );

  if (!shouldRender) {
    return null;
  }

  return (
    <Group ref={groupRef} name="ui-hover-indicator">
      {hasFramePoints ? (
        <Line
          ref={lineRef}
          points={framePoints}
          closed
          fillEnabled={false}
          stroke="#9333EA"
          strokeWidth={2}
          listening={false}
          perfectDrawEnabled={false}
        />
      ) : (
        <Rect
          ref={rectRef}
          x={box.x - framePadding}
          y={box.y - framePadding}
          width={box.width + framePadding * 2}
          height={box.height + framePadding * 2}
          fill="transparent"
          stroke="#9333EA"
          strokeWidth={2}
          listening={false}
        />
      )}
    </Group>
  );
});

HoverIndicator.displayName = "HoverIndicator";

export default HoverIndicator;
