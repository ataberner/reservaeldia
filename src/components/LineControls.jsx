import { Circle, Group, Line, Rect, Text } from "react-konva";
import { useState, useRef, useEffect, useCallback } from "react";
import { getActiveGroupDragSession, startDragGrupalLider } from "@/drag/dragGrupal";
import useIsTouchLike from "@/components/editor/mobile/useIsTouchLike";

const batchDraw = (node) => node?.getLayer?.() && node.getLayer().batchDraw();
const DEBUG_LINE_CONTROLS = false;

const lcLog = (...args) => {
  if (!DEBUG_LINE_CONTROLS) return;
  console.log(...args);
};

const lcError = (...args) => {
  if (!DEBUG_LINE_CONTROLS) return;
  console.error(...args);
};

const LINE_HORIZONTAL_SNAP_TOLERANCE = {
  touch: 5,
  mouse: 2,
};

function clamp(value, min, max) {
  if (!Number.isFinite(value)) return min;
  if (!Number.isFinite(min) || !Number.isFinite(max)) return value;
  return Math.min(Math.max(value, min), max);
}

function normalizeHorizontalLineAngle(angle) {
  if (!Number.isFinite(angle)) return 0;

  let normalized = angle % 180;
  if (normalized <= -90) normalized += 180;
  if (normalized > 90) normalized -= 180;

  return normalized;
}

function getLineMetrics(points) {
  const safePoints = Array.isArray(points) ? points : [0, 0, 0, 0];
  const [startX = 0, startY = 0, endX = 0, endY = 0] = safePoints;
  const dx = endX - startX;
  const dy = endY - startY;
  const length = Math.sqrt((dx * dx) + (dy * dy));
  const angle = (Math.atan2(dy, dx) * 180) / Math.PI;

  return {
    length,
    displayAngle: normalizeHorizontalLineAngle(angle),
  };
}

function formatMetricLength(length) {
  const safeLength = Number.isFinite(length) ? Math.max(0, length) : 0;
  return `${Math.round(safeLength)} px`;
}

function formatMetricAngle(angle) {
  const safeAngle = Number.isFinite(angle) ? angle : 0;
  const rounded = Math.round(safeAngle * 10) / 10;
  const normalized = Math.abs(rounded) < 0.05 ? 0 : rounded;
  const label = Number.isInteger(normalized)
    ? normalized.toFixed(0)
    : normalized.toFixed(1);

  return `${label}${String.fromCharCode(176)}`;
}

export default function LineControls({
  lineElement,
  elementRefs,
  onUpdateLine,
  altoCanvas: _altoCanvas,
  isDragGrupalActive = false,
  elementosSeleccionados = [],
  isMobile = false,
}) {
  const [draggingPoint, setDraggingPoint] = useState(null);
  const [lineBeingDragged, setLineBeingDragged] = useState(false);
  const [isGroupDrag, setIsGroupDrag] = useState(false);
  const [nodePos, setNodePos] = useState({
    x: lineElement?.x || 0,
    y: lineElement?.y || 0,
  });

  const pointsCache = useRef(null);
  const lastUpdateTime = useRef(0);
  const metricsIndicatorGroupRef = useRef(null);
  const metricsIndicatorBgRef = useRef(null);
  const metricsIndicatorTextRef = useRef(null);
  const dragGuideLineRef = useRef(null);
  const drawFrameRef = useRef(null);

  const isTouchLike = useIsTouchLike(isMobile);
  const pointRadius = isTouchLike ? 12 : 10;
  const pointHitStrokeWidth = isTouchLike ? 44 : 28;
  const lineHorizontalSnapTolerance = isTouchLike
    ? LINE_HORIZONTAL_SNAP_TOLERANCE.touch
    : LINE_HORIZONTAL_SNAP_TOLERANCE.mouse;
  const metricsIndicatorWidth = isTouchLike ? 152 : 128;
  const metricsIndicatorHeight = isTouchLike ? 58 : 48;
  const metricsIndicatorOffsetX = isTouchLike ? 28 : 22;
  const metricsIndicatorOffsetY = isTouchLike ? 26 : 20;
  const metricsIndicatorMargin = isTouchLike ? 16 : 10;
  const metricsIndicatorFontSize = isTouchLike ? 15 : 13;

  const isValidLine =
    !!lineElement &&
    lineElement.tipo === "forma" &&
    lineElement.figura === "line";
  const lineId = lineElement?.id ?? null;
  const nodeRef = lineId ? elementRefs.current?.[lineId] : null;

  useEffect(() => {
    if (!isValidLine || !nodeRef) return undefined;

    const syncPos = () => {
      const now = performance.now();
      if (now - lastUpdateTime.current < 8) return;
      lastUpdateTime.current = now;

      setNodePos({ x: nodeRef.x(), y: nodeRef.y() });
    };

    syncPos();
    nodeRef.on("dragmove", syncPos);

    return () => {
      nodeRef.off("dragmove", syncPos);
    };
  }, [isValidLine, nodeRef]);

  useEffect(() => {
    if (!isValidLine || !lineId) {
      setIsGroupDrag(false);
      return;
    }

    const isPartOfMultipleSelection = elementosSeleccionados.length > 1;
    const isThisLineSelected = elementosSeleccionados.includes(lineId);

    setIsGroupDrag(isDragGrupalActive && isPartOfMultipleSelection && isThisLineSelected);
  }, [elementosSeleccionados, isDragGrupalActive, isValidLine, lineId]);

  useEffect(() => {
    if (!isValidLine || !nodeRef || !lineId) return undefined;

    const handleDragStart = (event) => {
      lcLog("[LINE CONTROLS] Drag start", lineId);
      setLineBeingDragged(true);

      const selectedIds = window._elementosSeleccionados || [];
      if (selectedIds.length > 1 && selectedIds.includes(lineId)) {
        try {
          const groupDragResult = startDragGrupalLider(event, lineElement);
          if (groupDragResult.mode === "follower-ignored") {
            try { event?.target?.stopDrag?.(); } catch {}
            try { nodeRef?.stopDrag?.(); } catch {}
            try {
              if (groupDragResult.restorePose && typeof nodeRef?.position === "function") {
                nodeRef.position({
                  x: groupDragResult.restorePose.x,
                  y: groupDragResult.restorePose.y,
                });
              }
            } catch {}
            try { nodeRef?.draggable?.(false); } catch {}
            batchDraw(nodeRef);
            return;
          }

          if (groupDragResult.mode !== "started") {
            setTimeout(() => {
              if (nodeRef?.draggable) {
                nodeRef.draggable(false);
              }
            }, 0);
          }
        } catch (error) {
          lcError("[LINE CONTROLS] Error en drag grupal:", error);
        }
      }
    };

    const handleDragEnd = () => {
      lcLog("[LINE CONTROLS] Drag end", lineId);
      setLineBeingDragged(false);

      setTimeout(() => {
        const activeSession = getActiveGroupDragSession();
        const isActiveFollower = Boolean(
          activeSession?.active &&
          activeSession.leaderId !== lineId &&
          Array.isArray(activeSession.elementIds) &&
          activeSession.elementIds.includes(lineId)
        );
        if (isActiveFollower) return;
        if (nodeRef?.draggable) {
          nodeRef.draggable(true);
        }
      }, 100);
    };

    nodeRef.on("dragstart", handleDragStart);
    nodeRef.on("dragend", handleDragEnd);

    return () => {
      nodeRef.off("dragstart", handleDragStart);
      nodeRef.off("dragend", handleDragEnd);
    };
  }, [isValidLine, lineElement, lineId, nodeRef]);

  const points = (isValidLine && Array.isArray(lineElement.points))
    ? lineElement.points
    : [0, 0, 100, 0];
  const puntosValidados = points.slice(0, 4).map((point, index) => {
    const parsedPoint = parseFloat(point || 0);
    return Number.isNaN(parsedPoint) ? (index === 2 ? 100 : 0) : parsedPoint;
  });
  const currentLineMetrics = getLineMetrics(puntosValidados);

  const [normalizedStartX, normalizedStartY, normalizedEndX, normalizedEndY] = puntosValidados;
  const startAbsoluteX = nodePos.x + normalizedStartX;
  const startAbsoluteY = nodePos.y + normalizedStartY;
  const endAbsoluteX = nodePos.x + normalizedEndX;
  const endAbsoluteY = nodePos.y + normalizedEndY;

  const scheduleLayerDraw = useCallback((node) => {
    const layer = node?.getLayer?.();
    if (!layer) return;
    if (drawFrameRef.current != null) return;

    drawFrameRef.current = requestAnimationFrame(() => {
      drawFrameRef.current = null;
      layer.batchDraw?.();
    });
  }, []);

  const hideMetricsIndicator = useCallback(() => {
    const indicator = metricsIndicatorGroupRef.current;
    if (!indicator || !indicator.visible()) return;

    indicator.visible(false);
    scheduleLayerDraw(indicator);
  }, [scheduleLayerDraw]);

  const hideDragGuide = useCallback(() => {
    const guideLine = dragGuideLineRef.current;
    if (!guideLine || !guideLine.visible()) return;

    guideLine.visible(false);
    scheduleLayerDraw(guideLine);
  }, [scheduleLayerDraw]);

  const clearTransientDragUi = useCallback(() => {
    hideMetricsIndicator();
    hideDragGuide();
  }, [hideDragGuide, hideMetricsIndicator]);

  const updateDragGuide = useCallback((absolutePoints, isSnapped) => {
    const guideLine = dragGuideLineRef.current;
    if (!guideLine || !Array.isArray(absolutePoints) || absolutePoints.length < 4) return;

    guideLine.points(absolutePoints);
    guideLine.stroke(
      isSnapped ? "rgba(34, 211, 238, 0.95)" : "rgba(119, 61, 190, 0.45)"
    );
    guideLine.strokeWidth(isSnapped ? (isTouchLike ? 1.8 : 1.4) : 1);
    guideLine.dash(isSnapped ? [8, 5] : [4, 4]);
    guideLine.visible(true);
    scheduleLayerDraw(guideLine);
  }, [isTouchLike, scheduleLayerDraw]);

  const updateMetricsIndicator = useCallback((stage, pointerPos, metrics, isSnapped) => {
    const indicator = metricsIndicatorGroupRef.current;
    const indicatorBg = metricsIndicatorBgRef.current;
    const indicatorText = metricsIndicatorTextRef.current;
    if (!indicator || !indicatorBg || !indicatorText || !stage || !pointerPos) return;

    const stageWidth =
      typeof stage.width === "function"
        ? Number(stage.width())
        : Number(stage?.attrs?.width);
    const stageHeight =
      typeof stage.height === "function"
        ? Number(stage.height())
        : Number(stage?.attrs?.height);
    const desiredX = Number(pointerPos.x) + metricsIndicatorOffsetX;
    const desiredY = Number(pointerPos.y) + metricsIndicatorOffsetY;
    const nextX = Number.isFinite(stageWidth)
      ? clamp(
          desiredX,
          metricsIndicatorMargin,
          Math.max(
            metricsIndicatorMargin,
            stageWidth - metricsIndicatorWidth - metricsIndicatorMargin
          )
        )
      : desiredX;
    const nextY = Number.isFinite(stageHeight)
      ? clamp(
          desiredY,
          metricsIndicatorMargin,
          Math.max(
            metricsIndicatorMargin,
            stageHeight - metricsIndicatorHeight - metricsIndicatorMargin
          )
        )
      : desiredY;

    indicator.position({ x: nextX, y: nextY });
    indicator.visible(true);
    indicatorBg.fill(
      isSnapped ? "rgba(8, 145, 178, 0.94)" : "rgba(88, 28, 135, 0.94)"
    );
    indicatorBg.stroke(isSnapped ? "#67E8F9" : "#A855F7");
    indicatorBg.shadowColor(
      isSnapped ? "rgba(6, 182, 212, 0.38)" : "rgba(76, 29, 149, 0.28)"
    );
    indicatorText.text(
      `Largo ${formatMetricLength(metrics?.length)}\nAngulo ${formatMetricAngle(metrics?.displayAngle)}`
    );
    scheduleLayerDraw(indicator);
  }, [
    metricsIndicatorHeight,
    metricsIndicatorMargin,
    metricsIndicatorOffsetX,
    metricsIndicatorOffsetY,
    metricsIndicatorWidth,
    scheduleLayerDraw,
  ]);

  const resolveDragPointerPosition = useCallback((event) => {
    const stage = event?.target?.getStage?.();
    if (!stage) return { stage: null, pointerPos: null };

    const stagePointerPos =
      typeof stage.getPointerPosition === "function" ? stage.getPointerPosition() : null;
    if (stagePointerPos) {
      return { stage, pointerPos: stagePointerPos };
    }

    const fallbackPosition =
      typeof event?.target?.position === "function" ? event.target.position() : null;
    if (
      fallbackPosition &&
      Number.isFinite(fallbackPosition.x) &&
      Number.isFinite(fallbackPosition.y)
    ) {
      return { stage, pointerPos: fallbackPosition };
    }

    return { stage, pointerPos: null };
  }, []);

  const buildDraggedLineGeometry = useCallback((pointType, pointerPos) => {
    if (!nodeRef || !pointerPos) return null;

    const realNodeX = nodeRef.x();
    const realNodeY = nodeRef.y();
    const draggedPoint = {
      x: Number(pointerPos.x) - realNodeX,
      y: Number(pointerPos.y) - realNodeY,
    };
    const fixedPoint =
      pointType === "start"
        ? { x: normalizedEndX, y: normalizedEndY }
        : { x: normalizedStartX, y: normalizedStartY };

    const rawPoints =
      pointType === "start"
        ? [draggedPoint.x, draggedPoint.y, fixedPoint.x, fixedPoint.y]
        : [fixedPoint.x, fixedPoint.y, draggedPoint.x, draggedPoint.y];
    const rawMetrics = getLineMetrics(rawPoints);
    const shouldSnapHorizontal =
      rawMetrics.length > 0 &&
      Math.abs(rawMetrics.displayAngle) <= lineHorizontalSnapTolerance;

    if (shouldSnapHorizontal) {
      draggedPoint.y = fixedPoint.y;
    }

    const nextPoints =
      pointType === "start"
        ? [draggedPoint.x, draggedPoint.y, fixedPoint.x, fixedPoint.y]
        : [fixedPoint.x, fixedPoint.y, draggedPoint.x, draggedPoint.y];

    return {
      points: nextPoints,
      metrics: getLineMetrics(nextPoints),
      shouldSnapHorizontal,
      absolutePoints: [
        realNodeX + nextPoints[0],
        realNodeY + nextPoints[1],
        realNodeX + nextPoints[2],
        realNodeY + nextPoints[3],
      ],
      draggedHandleAbsolutePosition:
        pointType === "start"
          ? { x: realNodeX + nextPoints[0], y: realNodeY + nextPoints[1] }
          : { x: realNodeX + nextPoints[2], y: realNodeY + nextPoints[3] },
    };
  }, [
    lineHorizontalSnapTolerance,
    nodeRef,
    normalizedEndX,
    normalizedEndY,
    normalizedStartX,
    normalizedStartY,
  ]);

  const resetPointDragState = useCallback((event = null) => {
    clearTransientDragUi();
    setDraggingPoint(null);
    pointsCache.current = null;

    const stage = event?.target?.getStage?.();
    const container = stage?.container?.();
    if (container) {
      container.style.cursor = "default";
    }
  }, [clearTransientDragUi]);

  useEffect(() => {
    if (!lineBeingDragged && !isGroupDrag) return;
    clearTransientDragUi();
  }, [clearTransientDragUi, isGroupDrag, lineBeingDragged]);

  useEffect(() => () => {
    clearTransientDragUi();
    if (drawFrameRef.current != null) {
      cancelAnimationFrame(drawFrameRef.current);
      drawFrameRef.current = null;
    }
  }, [clearTransientDragUi]);

  const handlePointDragStart = useCallback((pointType, event) => {
    setDraggingPoint(pointType);
    pointsCache.current = null;
    event.cancelBubble = true;

    updateDragGuide(
      [startAbsoluteX, startAbsoluteY, endAbsoluteX, endAbsoluteY],
      false
    );

    const stage = event.target.getStage?.();
    const container = stage?.container?.();
    if (container) {
      container.style.cursor = "crosshair";
    }
  }, [
    endAbsoluteX,
    endAbsoluteY,
    startAbsoluteX,
    startAbsoluteY,
    updateDragGuide,
  ]);

  const handlePointDragMove = useCallback((pointType, event) => {
    if (!isValidLine || !nodeRef || !lineId) return;
    if (draggingPoint !== pointType) return;

    const { stage, pointerPos } = resolveDragPointerPosition(event);
    if (!stage || !pointerPos) return;

    const now = performance.now();
    if (now - lastUpdateTime.current < 4) return;
    lastUpdateTime.current = now;

    const dragGeometry = buildDraggedLineGeometry(pointType, pointerPos);
    if (!dragGeometry) return;

    updateMetricsIndicator(
      stage,
      pointerPos,
      dragGeometry.metrics,
      dragGeometry.shouldSnapHorizontal
    );
    updateDragGuide(
      dragGeometry.absolutePoints,
      dragGeometry.shouldSnapHorizontal
    );

    if (dragGeometry.shouldSnapHorizontal) {
      event.target.position(dragGeometry.draggedHandleAbsolutePosition);
    }

    const lineNode = elementRefs.current?.[lineId];
    if (!lineNode) return;

    const pointsKey = dragGeometry.points.join(",");
    if (pointsCache.current === pointsKey) return;

    pointsCache.current = pointsKey;
    lineNode.points(dragGeometry.points);
    scheduleLayerDraw(lineNode);
  }, [
    buildDraggedLineGeometry,
    draggingPoint,
    elementRefs,
    isValidLine,
    lineId,
    nodeRef,
    resolveDragPointerPosition,
    scheduleLayerDraw,
    updateDragGuide,
    updateMetricsIndicator,
  ]);

  const handlePointDragEnd = useCallback((pointType, event) => {
    if (!isValidLine || !nodeRef || !lineId) return;
    if (draggingPoint !== pointType) return;

    const { pointerPos } = resolveDragPointerPosition(event);
    const dragGeometry = buildDraggedLineGeometry(pointType, pointerPos);
    if (!dragGeometry) {
      resetPointDragState(event);
      return;
    }

    const lineNode = elementRefs.current?.[lineId];
    if (lineNode) {
      lineNode.points(dragGeometry.points);
      batchDraw(lineNode);
    }

    event.target.position(dragGeometry.draggedHandleAbsolutePosition);

    if (onUpdateLine) {
      onUpdateLine(lineId, {
        points: dragGeometry.points,
        isFinal: true,
      });
    }

    resetPointDragState(event);
  }, [
    buildDraggedLineGeometry,
    draggingPoint,
    elementRefs,
    isValidLine,
    lineId,
    nodeRef,
    onUpdateLine,
    resetPointDragState,
    resolveDragPointerPosition,
  ]);

  if (!isValidLine || !nodeRef) return null;

  return (
    <Group name="ui">
      {!lineBeingDragged && !isGroupDrag && (
        <>
          <Line
            ref={dragGuideLineRef}
            name="ui line-drag-guide"
            points={[startAbsoluteX, startAbsoluteY, endAbsoluteX, endAbsoluteY]}
            stroke="rgba(119, 61, 190, 0.45)"
            strokeWidth={1}
            dash={[4, 4]}
            listening={false}
            visible={false}
            perfectDrawEnabled={false}
            shadowForStrokeEnabled={false}
          />

          <Circle
            x={startAbsoluteX}
            y={startAbsoluteY}
            radius={pointRadius}
            fill={draggingPoint === "start" ? "#2563eb" : "#3b82f6"}
            stroke="#ffffff"
            strokeWidth={2.5}
            draggable={true}
            onDragStart={(event) => handlePointDragStart("start", event)}
            onDragMove={(event) => handlePointDragMove("start", event)}
            onDragEnd={(event) => handlePointDragEnd("start", event)}
            onMouseEnter={(event) => {
              event.target.getStage().container().style.cursor = "crosshair";
            }}
            onMouseLeave={(event) => {
              if (!draggingPoint) {
                event.target.getStage().container().style.cursor = "default";
              }
            }}
            shadowColor="rgba(59, 130, 246, 0.3)"
            shadowBlur={4}
            shadowOffset={{ x: 0, y: 3 }}
            perfectDrawEnabled={false}
            shadowForStrokeEnabled={false}
            hitStrokeWidth={pointHitStrokeWidth}
          />

          <Circle
            x={endAbsoluteX}
            y={endAbsoluteY}
            radius={pointRadius}
            fill={draggingPoint === "end" ? "#2563eb" : "#3b82f6"}
            stroke="#ffffff"
            strokeWidth={2.5}
            draggable={true}
            onDragStart={(event) => handlePointDragStart("end", event)}
            onDragMove={(event) => handlePointDragMove("end", event)}
            onDragEnd={(event) => handlePointDragEnd("end", event)}
            onMouseEnter={(event) => {
              event.target.getStage().container().style.cursor = "crosshair";
            }}
            onMouseLeave={(event) => {
              if (!draggingPoint) {
                event.target.getStage().container().style.cursor = "default";
              }
            }}
            shadowColor="rgba(59, 130, 246, 0.3)"
            shadowBlur={6}
            shadowOffset={{ x: 0, y: 3 }}
            perfectDrawEnabled={false}
            shadowForStrokeEnabled={false}
            hitStrokeWidth={pointHitStrokeWidth}
          />

          <Group
            ref={metricsIndicatorGroupRef}
            name="ui line-metrics-indicator"
            listening={false}
            visible={false}
          >
            <Rect
              ref={metricsIndicatorBgRef}
              x={0}
              y={0}
              width={metricsIndicatorWidth}
              height={metricsIndicatorHeight}
              cornerRadius={isTouchLike ? 14 : 10}
              fill="rgba(88, 28, 135, 0.94)"
              stroke="#A855F7"
              strokeWidth={isTouchLike ? 1.5 : 1}
              shadowColor="rgba(76, 29, 149, 0.28)"
              shadowBlur={isTouchLike ? 12 : 8}
              shadowOffset={{ x: 0, y: isTouchLike ? 4 : 3 }}
              shadowOpacity={1}
            />
            <Text
              ref={metricsIndicatorTextRef}
              x={0}
              y={0}
              width={metricsIndicatorWidth}
              height={metricsIndicatorHeight}
              align="center"
              verticalAlign="middle"
              fill="#FFFFFF"
              fontSize={metricsIndicatorFontSize}
              fontStyle="bold"
              lineHeight={1.25}
              text={`Largo ${formatMetricLength(currentLineMetrics.length)}\nAngulo ${formatMetricAngle(currentLineMetrics.displayAngle)}`}
              listening={false}
            />
          </Group>
        </>
      )}
    </Group>
  );
}
