import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
} from "react";
import { Rect, Group, Line } from "react-konva";
import {
  buildSelectionFramePolygon,
  getSelectionFramePadding,
} from "@/components/editor/textSystem/render/konva/selectionFrameVisuals";
import {
  resolveNodeSelectionRect,
  resolveSingleTextSelectionVisualBounds,
} from "@/components/editor/textSystem/render/konva/selectionBoundsGeometry";
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
  interactionPhase = null,
  activeVisualOwner = "none",
  higherPriorityOwner = "none",
  suppressionReasons = [],
}, forwardedRef) {
  const groupRef = useRef(null);
  const rectRef = useRef(null);
  const lineRef = useRef(null);
  const hoverIndicatorSnapshotRef = useRef(null);

  const node = hoveredElement ? elementRefs?.current?.[hoveredElement] || null : null;
  const hoveredObj = Array.isArray(objetos)
    ? objetos.find((o) => o.id === hoveredElement) || null
    : null;
  const suppressInlineTextHover =
    hoveredObj?.tipo === "texto" && hoveredElement === activeInlineEditingId;
  const isTextHoverTarget = hoveredObj?.tipo === "texto";
  const isImageHoverTarget =
    hoveredObj?.tipo === "imagen" && !hoveredObj?.esFondo;
  const shouldUseRotatedFrame =
    isImageHoverTarget ||
    hoveredObj?.tipo === "forma" ||
    isFunctionalCtaButton(hoveredObj);
  const suppressionReasonsList = Array.isArray(suppressionReasons)
    ? suppressionReasons
    : [];
  const suppressionReasonsKey = suppressionReasonsList.join(",");

  let availabilityReason = null;
  if (!hoveredElement) {
    availabilityReason = "no-hover-target";
  } else if (!node) {
    availabilityReason = "missing-node";
  } else if (!node?.getStage?.()) {
    availabilityReason = "missing-stage";
  } else if (suppressInlineTextHover) {
    availabilityReason = "inline-editing-active-fallback";
  }

  let box = null;
  let boundsSource = null;
  let renderBounds = null;

  if (!availabilityReason) {
    if (isTextHoverTarget) {
      renderBounds = resolveSingleTextSelectionVisualBounds({
        object: hoveredObj,
        node,
        isMobile,
        includePadding: true,
        debugMeta: {
          phase: "hover",
          surface: "hover",
          caller: "HoverIndicator",
        },
      });
      boundsSource =
        renderBounds?.kind === "polygon"
          ? "text-visual-polygon"
          : renderBounds?.kind === "rect"
            ? "text-visual-rect"
            : "text-visual-missing";
    } else if (hoveredObj?.tipo === "galeria") {
      box = resolveNodeSelectionRect(hoveredObj, node, {
        phase: "hover",
        surface: "hover",
        caller: "HoverIndicator",
      });
      let galleryBoundsSource = box ? "gallery-frame-live" : null;
      const absPos =
        typeof node.getAbsolutePosition === "function"
          ? node.getAbsolutePosition()
          : {
              x: typeof node.x === "function" ? node.x() : 0,
              y: typeof node.y === "function" ? node.y() : 0,
            };

      if (!box) {
        const fallbackWidth = Number(hoveredObj.width);
        const fallbackHeight = Number(hoveredObj.height);
        if (!Number.isFinite(fallbackWidth) || !Number.isFinite(fallbackHeight)) {
          galleryBoundsSource = "gallery-frame-missing";
        } else {
          box = {
            x: absPos.x,
            y: absPos.y,
            width: fallbackWidth,
            height: fallbackHeight,
          };
          galleryBoundsSource = "gallery-frame-fallback";
        }
      }
      boundsSource = galleryBoundsSource || "gallery-frame";
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
    !availabilityReason && !isTextHoverTarget && shouldUseRotatedFrame
      ? buildSelectionFramePolygon(node, framePadding)
      : null;
  const hasFramePoints =
    Array.isArray(framePoints) &&
    framePoints.length === 8 &&
    framePoints.every((value) => Number.isFinite(Number(value)));
  if (!renderBounds && !availabilityReason) {
    renderBounds = hasFramePoints
      ? { kind: "polygon", points: framePoints }
      : box
        ? {
            kind: "rect",
            x: box.x - framePadding,
            y: box.y - framePadding,
            width: box.width + framePadding * 2,
            height: box.height + framePadding * 2,
          }
        : null;
  }
  const effectiveBoundsSource =
    renderBounds?.kind === "polygon"
      ? boundsSource === "text-visual-polygon"
        ? boundsSource
        : "polygon"
      : boundsSource;

  if (
    !availabilityReason &&
    (
      !renderBounds ||
      (
        renderBounds.kind === "rect" &&
        (
          isNaN(renderBounds.x) ||
          isNaN(renderBounds.y) ||
          renderBounds.width <= 0 ||
          renderBounds.height <= 0
        )
      )
    )
  ) {
    availabilityReason = "invalid-bounds";
  }

  const boundsDigest = buildCanvasBoxFlowBoundsDigest(renderBounds);
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
        phase: interactionPhase || null,
        owner: activeVisualOwner || "hover",
        higherPriorityOwner: higherPriorityOwner || "none",
        suppressionReasons: suppressionReasonsList,
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
        phase: interactionPhase || null,
        owner: activeVisualOwner || "hover",
        higherPriorityOwner: higherPriorityOwner || "none",
        suppressionReasons: suppressionReasonsList,
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
        phase: interactionPhase || null,
        owner: activeVisualOwner || "hover",
        higherPriorityOwner: higherPriorityOwner || "none",
        suppressionReasons: suppressionReasonsList,
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
    activeVisualOwner,
    boundsDigest,
    effectiveBoundsSource,
    higherPriorityOwner,
    hoveredElement,
    interactionPhase,
    shouldRender,
    suppressionReasonsKey,
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
        phase: interactionPhase || null,
        owner: activeVisualOwner || "hover",
        higherPriorityOwner: higherPriorityOwner || "none",
        suppressionReasons: suppressionReasonsList,
      }, {
        identity: previousSnapshot.hoverId,
      });
      drawHoverIndicatorLayer(previousSnapshot.layer);
    },
    [activeVisualOwner, higherPriorityOwner, interactionPhase, suppressionReasonsKey]
  );

  if (!shouldRender) {
    return null;
  }

  return (
    <Group ref={groupRef} name="ui-hover-indicator">
      {renderBounds?.kind === "polygon" ? (
        <Line
          ref={lineRef}
          points={renderBounds.points}
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
          x={renderBounds?.kind === "rect" ? renderBounds.x : 0}
          y={renderBounds?.kind === "rect" ? renderBounds.y : 0}
          width={renderBounds?.kind === "rect" ? renderBounds.width : 0}
          height={renderBounds?.kind === "rect" ? renderBounds.height : 0}
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
