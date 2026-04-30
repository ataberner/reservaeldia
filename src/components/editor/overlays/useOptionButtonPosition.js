import { useCallback, useEffect, useRef } from "react";
import {
  startCanvasDragPerfSpan,
  trackCanvasDragPerf,
} from "@/components/editor/canvasEditor/canvasDragPerf";
import {
  resolveSelectionFrameRect,
} from "@/components/editor/textSystem/render/konva/selectionBoundsGeometry";

const FALLBACK_BUTTON_SIZE_DESKTOP = 28;
const FALLBACK_BUTTON_SIZE_MOBILE = 24;
const BUTTON_VERTEX_OVERLAP_RATIO = 0.5;
const BUTTON_VERTEX_NUDGE_X_DESKTOP = 20;
const BUTTON_VERTEX_NUDGE_Y_DESKTOP = 20;
const BUTTON_VERTEX_NUDGE_X_MOBILE = 20;
const BUTTON_VERTEX_NUDGE_Y_MOBILE = 20;
const BUTTON_VERTEX_NUDGE_Y_SECTION_BG_DESKTOP = 8;
const BUTTON_VERTEX_NUDGE_Y_SECTION_BG_MOBILE = 10;
const LOG_THROTTLE_MS = 120;
const POSITION_SETTLE_MS_DESKTOP = 120;
const POSITION_SETTLE_MS_MOBILE = 320;

function isOptionButtonDebugEnabled() {
  return false;
}

function resolveScale(escalaVisual, escalaActiva) {
  if (Number.isFinite(escalaVisual) && escalaVisual > 0) return escalaVisual;
  if (Number.isFinite(escalaActiva) && escalaActiva > 0) return escalaActiva;
  return 1;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function resolveRotatedBoundingSize(width, height, rotation) {
  const safeWidth = Math.max(1, Number(width) || 1);
  const safeHeight = Math.max(1, Number(height) || 1);
  const radians = (Math.PI / 180) * (Number(rotation) || 0);
  const cos = Math.abs(Math.cos(radians));
  const sin = Math.abs(Math.sin(radians));

  return {
    width: safeWidth * cos + safeHeight * sin,
    height: safeWidth * sin + safeHeight * cos,
  };
}

function resolveBackgroundDecorationStageBox(selection) {
  if (!selection || typeof selection !== "object") return null;

  const width = Math.max(1, Number(selection.width) || 1);
  const height = Math.max(1, Number(selection.height) || 1);
  const top = Number(selection.y);
  const left = Number(selection.x);

  if (!Number.isFinite(left) || !Number.isFinite(top)) return null;

  const bounding = resolveRotatedBoundingSize(width, height, selection.rotation);
  const centerX = left + width / 2;
  const centerY = top + height / 2;

  return {
    x: centerX - bounding.width / 2,
    y: centerY - bounding.height / 2,
    width: bounding.width,
    height: bounding.height,
  };
}

function describeEventTarget(target) {
  if (target === window) return "window";
  if (target === document) return "document";
  if (!(target instanceof Element)) return "unknown";

  const tag = String(target.tagName || "").toLowerCase();
  const id = target.id ? `#${target.id}` : "";
  const classes = target.classList?.length
    ? `.${Array.from(target.classList).slice(0, 2).join(".")}`
    : "";
  return `${tag}${id}${classes}` || "element";
}

function resolveRenderedScale(stage, stageRect, escalaVisual, escalaActiva) {
  const stageWidth =
    typeof stage?.width === "function" ? Number(stage.width()) : Number(stage?.attrs?.width);
  const stageHeight =
    typeof stage?.height === "function" ? Number(stage.height()) : Number(stage?.attrs?.height);

  const fallback = resolveScale(escalaVisual, escalaActiva);
  const scaleX = Number.isFinite(stageWidth) && stageWidth > 0
    ? stageRect.width / stageWidth
    : fallback;
  const scaleY = Number.isFinite(stageHeight) && stageHeight > 0
    ? stageRect.height / stageHeight
    : fallback;

  return {
    x: Number.isFinite(scaleX) && scaleX > 0 ? scaleX : fallback,
    y: Number.isFinite(scaleY) && scaleY > 0 ? scaleY : fallback,
  };
}

function getScrollableAncestors(startNode) {
  if (typeof window === "undefined") return [];
  if (!(startNode instanceof Element)) return [window];

  const targets = [];
  let current = startNode.parentElement;

  while (current && current !== document.body) {
    const style = window.getComputedStyle(current);
    const overflowY = String(style.overflowY || "").toLowerCase();
    const overflow = String(style.overflow || "").toLowerCase();
    const isScrollable =
      overflowY === "auto" ||
      overflowY === "scroll" ||
      overflowY === "overlay" ||
      overflow === "auto" ||
      overflow === "scroll" ||
      overflow === "overlay";

    if (isScrollable) {
      targets.push(current);
    }

    current = current.parentElement;
  }

  if (document.scrollingElement) {
    targets.push(document.scrollingElement);
  }
  targets.push(window);

  return Array.from(new Set(targets));
}

function isRegisteredRefRelevantToOverlaySelection(overlaySelection, registeredId) {
  const safeRegisteredId = String(registeredId || "").trim();
  if (!safeRegisteredId || !overlaySelection) return false;

  if (overlaySelection.kind === "canvas-object") {
    return String(overlaySelection?.objectId || "").trim() === safeRegisteredId;
  }

  if (overlaySelection.kind === "multi-selection") {
    return Array.isArray(overlaySelection?.selectedIds)
      ? overlaySelection.selectedIds.some(
          (selectedId) => String(selectedId || "").trim() === safeRegisteredId
        )
      : false;
  }

  return false;
}

function resolveDashboardHeaderBottom() {
  if (typeof window === "undefined" || typeof document === "undefined") return 0;

  let headerBottom = 0;
  const headerNode = document.querySelector('[data-dashboard-header="true"]');
  if (headerNode && typeof headerNode.getBoundingClientRect === "function") {
    headerBottom = Math.max(0, Number(headerNode.getBoundingClientRect().bottom) || 0);
  }

  const cssValue = window
    .getComputedStyle(document.documentElement)
    .getPropertyValue("--dashboard-header-height");
  const cssHeight = Number.parseFloat(cssValue);
  if (Number.isFinite(cssHeight) && cssHeight > 0) {
    headerBottom = Math.max(headerBottom, cssHeight);
  }

  return headerBottom;
}

export default function useOptionButtonPosition({
  botonOpcionesRef,
  layoutRootRef = null,
  elementRefs,
  elementosSeleccionados,
  overlaySelection = null,
  overlayNodeRefs = null,
  stageRef,
  escalaVisual,
  escalaActiva,
  isMobile = false,
  buttonSize = FALLBACK_BUTTON_SIZE_DESKTOP,
  canvasUiSuppressed = false,
  canvasInteractionEpoch = 0,
}) {
  const lastLogByEventRef = useRef({});
  const pendingPositionSyncRafsRef = useRef({
    rafA: 0,
    rafB: 0,
    settleRaf: 0,
  });
  const lastInteractionEpochRef = useRef(canvasInteractionEpoch);
  const lastAnchorSignatureRef = useRef({
    anchorSignature: null,
    renderSignature: null,
  });

  const buildAnchorSignature = useCallback(() => {
    if (typeof window === "undefined") return null;

    const overlayKind = overlaySelection?.kind || null;
    const overlayMenuItem = overlaySelection?.menuItem || null;
    const hasObjectSelection =
      overlayKind === "canvas-object" && elementosSeleccionados.length === 1;
    const hasMultiSelection =
      overlayKind === "multi-selection" &&
      Array.isArray(overlaySelection?.selectedIds) &&
      overlaySelection.selectedIds.length >= 2;
    const hasBackgroundDecorationSelection =
      overlayKind === "background-decoration" && Boolean(overlayMenuItem?.id);
    const hasSectionEdgeDecorationSelection =
      overlayKind === "section-edge-decoration" && Boolean(overlayMenuItem?.id);
    const hasSectionBaseImageSelection =
      overlayKind === "section-base-image" && Boolean(overlaySelection?.sectionId);
    if (
      !hasObjectSelection &&
      !hasMultiSelection &&
      !hasBackgroundDecorationSelection &&
      !hasSectionEdgeDecorationSelection &&
      !hasSectionBaseImageSelection
    ) {
      return null;
    }

    const stage = stageRef.current;
    const selectionKind = hasObjectSelection
      ? "object"
      : hasMultiSelection
        ? "multi-selection"
      : hasSectionBaseImageSelection
        ? "section-base-image"
      : hasSectionEdgeDecorationSelection
        ? "section-edge-decoration"
        : "background-decoration";
    const nodeRef = hasObjectSelection
      ? elementRefs.current[elementosSeleccionados[0]]
      : hasSectionBaseImageSelection
        ? overlayNodeRefs?.current?.[overlaySelection.sectionId] || null
      : null;
    if (
      (!nodeRef &&
        !hasMultiSelection &&
        !hasBackgroundDecorationSelection &&
        !hasSectionEdgeDecorationSelection) ||
      !stage
    ) return null;

    try {
      const box =
        hasObjectSelection || hasSectionBaseImageSelection
        ? nodeRef.getClientRect({
            relativeTo: stage,
            skipShadow: true,
          })
        : hasMultiSelection
          ? resolveSelectionFrameRect({
              selectedElements: overlaySelection.selectedIds,
              elementRefs,
              objetos: overlaySelection.selectedObjects,
              includePadding: true,
              requireLiveNodes: false,
            })
        : resolveBackgroundDecorationStageBox(overlayMenuItem);
      if (!box) return null;

      const nodeAbsolutePosition =
        hasObjectSelection || hasSectionBaseImageSelection
        ? (
            typeof nodeRef.getAbsolutePosition === "function"
              ? nodeRef.getAbsolutePosition()
              : {
                  x: typeof nodeRef.x === "function" ? nodeRef.x() : null,
                  y: typeof nodeRef.y === "function" ? nodeRef.y() : null,
                }
          )
        : hasMultiSelection
          ? {
              x: Number(box.x) || 0,
              y: Number(box.y) || 0,
            }
        : {
            x: Number(overlayMenuItem?.x) || 0,
            y: Number(overlayMenuItem?.y) || 0,
          };
      const rotation =
        hasObjectSelection || hasSectionBaseImageSelection
        ? (
            typeof nodeRef?.rotation === "function"
              ? Number(nodeRef.rotation() || 0)
              : Number(nodeRef?.attrs?.rotation || 0)
          )
        : hasMultiSelection
          ? 0
        : Number(overlayMenuItem?.rotation || 0);
      const anchorStageY =
        (hasObjectSelection || hasSectionBaseImageSelection) &&
        Number.isFinite(nodeAbsolutePosition?.y)
          ? Math.min(box.y, nodeAbsolutePosition.y)
          : box.y;
      const selectedId = hasObjectSelection
        ? elementosSeleccionados[0]
        : hasMultiSelection
          ? `multi:${overlaySelection.selectedIds.join(",")}`
        : hasSectionBaseImageSelection
          ? overlayMenuItem?.id || `section-base-image:${overlaySelection.sectionId}`
          : hasSectionEdgeDecorationSelection
            ? overlayMenuItem?.id || "section-edge-decoration"
          : overlayMenuItem?.id || "background-decoration";
      const round = (value) => {
        const numeric = Number(value);
        return Number.isFinite(numeric) ? Number(numeric.toFixed(2)) : null;
      };

      return `anchor:${selectedId}:x=${round(box.x)}:y=${round(anchorStageY)}:w=${round(box.width)}:h=${round(box.height)}:r=${round(rotation)}`;
    } catch {
      return null;
    }
  }, [
    elementosSeleccionados,
    elementRefs,
    overlayNodeRefs,
    overlaySelection,
    stageRef,
  ]);

  const debugLog = useCallback((eventName, payload = {}, force = false) => {
    if (!isOptionButtonDebugEnabled()) return;

    const now = Date.now();
    const previous = Number(lastLogByEventRef.current[eventName] || 0);
    if (!force && now - previous < LOG_THROTTLE_MS) return;
    lastLogByEventRef.current[eventName] = now;

    console.log(`[OPTION-BUTTON] ${eventName}`, {
      ts: new Date(now).toISOString(),
      ...payload,
    });

    if (eventName === "position") {
      const boxY = payload?.boxStage?.y ?? null;
      const absY = payload?.nodeAbsolute?.y ?? null;
      const anchorY = payload?.anchorStageY ?? null;
      const finalY = payload?.final?.y ?? null;
      const elementY = payload?.elementScreen?.y ?? null;
      const stageTop = payload?.stageRect?.top ?? null;
      const source = payload?.source ?? "unknown";
      const target = payload?.eventTarget?.label ?? payload?.scrollTarget?.label ?? "unknown";
      console.log(
        `[OPTION-BUTTON][SUMMARY] src=${source} target=${target} boxY=${boxY} absY=${absY} anchorY=${anchorY} elementY=${elementY} finalY=${finalY} stageTop=${stageTop}`
      );
    }
  }, []);

  const ocultarBotonOpciones = useCallback((reason = "unknown", extra = null) => {
    if (!botonOpcionesRef.current) return;
    botonOpcionesRef.current.style.display = "none";
    debugLog(
      "hide",
      {
        reason,
        selectedId: elementosSeleccionados?.[0] ?? null,
        isMobile,
        extra,
      },
      false
    );
  }, [
    botonOpcionesRef,
    debugLog,
    elementosSeleccionados,
    isMobile,
  ]);

  const cancelPendingPositionSyncRafs = useCallback(() => {
    const pending = pendingPositionSyncRafsRef.current;
    if (pending.rafA) {
      window.cancelAnimationFrame(pending.rafA);
      pending.rafA = 0;
    }
    if (pending.rafB) {
      window.cancelAnimationFrame(pending.rafB);
      pending.rafB = 0;
    }
    if (pending.settleRaf) {
      window.cancelAnimationFrame(pending.settleRaf);
      pending.settleRaf = 0;
    }
  }, []);

  const actualizarPosicionBotonOpciones = useCallback((
    source = "manual",
    nativeEvent = null,
    eventTargetLabel = null
  ) => {
    const finishPerf = startCanvasDragPerfSpan("toolbar:sync", {
      source,
    }, {
      throttleMs: 180,
      throttleKey: `toolbar:sync:${source}`,
    });

    if (typeof window === "undefined") {
      finishPerf?.({ reason: "missing-window" });
      return;
    }
    if (!botonOpcionesRef.current) {
      finishPerf?.({ reason: "missing-button-ref" });
      return;
    }

    const isInteractionActive =
      canvasUiSuppressed ||
      window._isDragging ||
      window._grupoLider ||
      window._resizeData?.isResizing;

    if (isInteractionActive) {
      ocultarBotonOpciones("interaction-active", {
        source,
        canvasUiSuppressed,
        isDragging: Boolean(window._isDragging),
        groupLeader: window._grupoLider || null,
        isResizing: Boolean(window._resizeData?.isResizing),
      });
      trackCanvasDragPerf("toolbar:hidden-interaction", {
        source,
        isDragging: Boolean(window._isDragging),
        groupLeader: window._grupoLider || null,
        isResizing: Boolean(window._resizeData?.isResizing),
      }, {
        throttleMs: 180,
        throttleKey: "toolbar:hidden-interaction",
      });
      finishPerf?.({ reason: "interaction-active" });
      return;
    }

    const overlayKind = overlaySelection?.kind || null;
    const overlayMenuItem = overlaySelection?.menuItem || null;
    const selectionKind =
      overlayKind === "canvas-object"
        ? "object"
        : overlayKind === "multi-selection"
          ? "multi-selection"
        : overlayKind === "section-base-image"
          ? "section-base-image"
          : overlayKind === "section-edge-decoration"
            ? "section-edge-decoration"
          : overlayKind === "background-decoration"
            ? "background-decoration"
            : "none";
    const hasObjectSelection =
      overlayKind === "canvas-object" && elementosSeleccionados.length === 1;
    const hasMultiSelection =
      overlayKind === "multi-selection" &&
      Array.isArray(overlaySelection?.selectedIds) &&
      overlaySelection.selectedIds.length >= 2;
    const hasBackgroundDecorationSelection =
      overlayKind === "background-decoration" && Boolean(overlayMenuItem?.id);
    const hasSectionEdgeDecorationSelection =
      overlayKind === "section-edge-decoration" && Boolean(overlayMenuItem?.id);
    const hasSectionBaseImageSelection =
      overlayKind === "section-base-image" && Boolean(overlaySelection?.sectionId);

    if (
      !hasObjectSelection &&
      !hasMultiSelection &&
      !hasBackgroundDecorationSelection &&
      !hasSectionEdgeDecorationSelection &&
      !hasSectionBaseImageSelection
    ) {
      ocultarBotonOpciones("selection-count", {
        source,
        count: elementosSeleccionados.length,
        hasMultiSelection,
        hasBackgroundDecorationSelection,
        hasSectionEdgeDecorationSelection,
        hasSectionBaseImageSelection,
      });
      finishPerf?.({ reason: "selection-count" });
      return;
    }

    const stage = stageRef.current;
    const nodeRef = hasObjectSelection
      ? elementRefs.current[elementosSeleccionados[0]]
      : hasSectionBaseImageSelection
        ? overlayNodeRefs?.current?.[overlaySelection.sectionId] || null
      : null;
    if (
      (!nodeRef &&
        !hasMultiSelection &&
        !hasBackgroundDecorationSelection &&
        !hasSectionEdgeDecorationSelection) ||
      !stage
    ) {
      ocultarBotonOpciones("missing-node-or-stage", {
        source,
        hasNode: Boolean(nodeRef),
        hasStage: Boolean(stage),
        hasMultiSelection,
        hasBackgroundDecorationSelection,
        hasSectionEdgeDecorationSelection,
        hasSectionBaseImageSelection,
      });
      finishPerf?.({ reason: "missing-node-or-stage" });
      return;
    }

    try {
      const box =
        hasObjectSelection || hasSectionBaseImageSelection
        ? nodeRef.getClientRect({
            relativeTo: stage,
            skipShadow: true,
          })
        : hasMultiSelection
          ? resolveSelectionFrameRect({
              selectedElements: overlaySelection.selectedIds,
              elementRefs,
              objetos: overlaySelection.selectedObjects,
              includePadding: true,
              requireLiveNodes: false,
            })
        : resolveBackgroundDecorationStageBox(overlayMenuItem);
      if (!box) {
        ocultarBotonOpciones("missing-box", {
          source,
          hasObjectSelection,
          hasMultiSelection,
          hasBackgroundDecorationSelection,
          hasSectionEdgeDecorationSelection,
          hasSectionBaseImageSelection,
        });
        finishPerf?.({ reason: "missing-box" });
        return;
      }
      const nodeAbsolutePosition =
        hasObjectSelection || hasSectionBaseImageSelection
        ? (
            typeof nodeRef.getAbsolutePosition === "function"
              ? nodeRef.getAbsolutePosition()
              : {
                  x: typeof nodeRef.x === "function" ? nodeRef.x() : null,
                  y: typeof nodeRef.y === "function" ? nodeRef.y() : null,
                }
          )
        : hasMultiSelection
          ? {
              x: Number(box.x) || 0,
              y: Number(box.y) || 0,
            }
        : {
            x: Number(overlayMenuItem?.x) || 0,
            y: Number(overlayMenuItem?.y) || 0,
          };
      const stageContainer =
        typeof stage.container === "function"
          ? stage.container()
          : stage.getStage?.()?.container?.();
      if (!stageContainer) {
        ocultarBotonOpciones("missing-stage-container", { source });
        finishPerf?.({ reason: "missing-stage-container" });
        return;
      }

      const stageRect = stageContainer.getBoundingClientRect();
      const renderedScale = resolveRenderedScale(stage, stageRect, escalaVisual, escalaActiva);
      const targetButtonSize =
        Number.isFinite(buttonSize) && buttonSize > 0
          ? buttonSize
          : isMobile
            ? FALLBACK_BUTTON_SIZE_MOBILE
            : FALLBACK_BUTTON_SIZE_DESKTOP;
      const overlapPx = targetButtonSize * BUTTON_VERTEX_OVERLAP_RATIO;
      const nudgeX = isMobile ? BUTTON_VERTEX_NUDGE_X_MOBILE : BUTTON_VERTEX_NUDGE_X_DESKTOP;
      const nudgeY = selectionKind === "section-base-image"
        ? (isMobile ? BUTTON_VERTEX_NUDGE_Y_SECTION_BG_MOBILE : BUTTON_VERTEX_NUDGE_Y_SECTION_BG_DESKTOP)
        : (isMobile ? BUTTON_VERTEX_NUDGE_Y_MOBILE : BUTTON_VERTEX_NUDGE_Y_DESKTOP);

      const anchorStageY =
        (hasObjectSelection || hasSectionBaseImageSelection) &&
        Number.isFinite(nodeAbsolutePosition?.y)
          ? Math.min(box.y, nodeAbsolutePosition.y)
          : box.y;

      const elementoX = stageRect.left + box.x * renderedScale.x;
      const elementoY = stageRect.top + anchorStageY * renderedScale.y;
      const anchoElemento = Math.max(0, box.width * renderedScale.x);
      const altoElemento = Math.max(0, box.height * renderedScale.y);
      const elementoRight = elementoX + anchoElemento;

      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const viewportPadding = isMobile ? 8 : 4;
      const headerSafeOffset = resolveDashboardHeaderBottom();
      const topSafeViewportY = Math.max(
        viewportPadding,
        Math.ceil(headerSafeOffset + (isMobile ? 8 : 6))
      );

      const elementoVisible =
        elementoX + anchoElemento >= 0 &&
        elementoX <= viewportWidth &&
        elementoY + altoElemento >= 0 &&
        elementoY <= viewportHeight;

      if (!elementoVisible) {
        ocultarBotonOpciones("element-outside-viewport", {
          source,
          elementRect: {
            left: Math.round(elementoX),
            top: Math.round(elementoY),
            width: Math.round(anchoElemento),
            height: Math.round(altoElemento),
          },
          viewport: { width: viewportWidth, height: viewportHeight },
        });
        finishPerf?.({ reason: "element-outside-viewport" });
        return;
      }

      // Ancla visual: centro del botón exactamente en el vértice superior derecho.
      const preferredX = elementoRight - overlapPx + nudgeX;
      const preferredY = elementoY - overlapPx - nudgeY;

      const minX = viewportPadding;
      const maxX = Math.max(minX, viewportWidth - targetButtonSize - viewportPadding);
      const minY = viewportPadding;
      const maxY = Math.max(minY, viewportHeight - targetButtonSize - viewportPadding);

      const fallbackNearVertexX = elementoRight - targetButtonSize - 1;
      const useFallbackNearVertexX =
        preferredX + targetButtonSize > viewportWidth - viewportPadding &&
        fallbackNearVertexX >= minX;
      const fallbackNearVertexY = elementoY + 1;
      const useFallbackNearVertexY =
        preferredY < topSafeViewportY &&
        fallbackNearVertexY >= minY &&
        fallbackNearVertexY <= maxY;

      const placementModeX = useFallbackNearVertexX ? "fallback-left-of-vertex" : "vertex";
      const placementModeY = useFallbackNearVertexY ? "fallback-below-vertex" : "vertex";
      let botonX = useFallbackNearVertexX ? fallbackNearVertexX : preferredX;
      let botonY = useFallbackNearVertexY ? fallbackNearVertexY : preferredY;


      botonX = clamp(botonX, minX, maxX);
      botonY = clamp(botonY, minY, maxY);

      const hasRelativeRoot = Boolean(layoutRootRef?.current);
      let renderX = botonX;
      let renderY = botonY;
      if (hasRelativeRoot) {
        const rootRect = layoutRootRef.current.getBoundingClientRect();
        renderX = botonX - rootRect.left;
        renderY = botonY - rootRect.top;
        const minRenderY = Math.max(
          viewportPadding,
          Math.ceil(headerSafeOffset + (isMobile ? 8 : 6) - rootRect.top)
        );
        renderY = Math.max(renderY, minRenderY);
      } else {
        const minViewportY = Math.max(
          viewportPadding,
          Math.ceil(headerSafeOffset + (isMobile ? 8 : 6))
        );
        botonY = Math.max(botonY, minViewportY);
        renderY = botonY;
      }

      botonOpcionesRef.current.style.left = `${Math.round(renderX)}px`;
      botonOpcionesRef.current.style.top = `${Math.round(renderY)}px`;
      botonOpcionesRef.current.style.display = "flex";
      const anchorSignature = buildAnchorSignature();
      lastAnchorSignatureRef.current = {
        anchorSignature,
        renderSignature: anchorSignature
          ? `${anchorSignature}:epoch=${canvasInteractionEpoch}`
          : null,
      };
      finishPerf?.({
        selectionKind: hasObjectSelection
          ? "object"
          : hasSectionBaseImageSelection
            ? "section-base-image"
            : hasSectionEdgeDecorationSelection
              ? "section-edge-decoration"
            : "background-decoration",
      });

      if (isOptionButtonDebugEnabled()) {
        const debugScrollTarget = getScrollableAncestors(stageContainer)[0] || window;
        const stageWidth =
          typeof stage?.width === "function" ? Number(stage.width()) : Number(stage?.attrs?.width);
        const stageHeight =
          typeof stage?.height === "function" ? Number(stage.height()) : Number(stage?.attrs?.height);
        debugLog("position", {
          source,
          selectedId: hasObjectSelection
            ? elementosSeleccionados[0]
            : hasMultiSelection
              ? `multi:${overlaySelection.selectedIds.join(",")}`
            : hasSectionBaseImageSelection
              ? overlayMenuItem?.id || overlaySelection?.sectionId || null
              : overlayMenuItem?.id || null,
          isMobile,
          selectionKind: hasObjectSelection
            ? "object"
            : hasMultiSelection
              ? "multi-selection"
            : hasSectionBaseImageSelection
              ? "section-base-image"
              : hasSectionEdgeDecorationSelection
                ? "section-edge-decoration"
              : "background-decoration",
          pointerType: nativeEvent?.pointerType ?? null,
          nativeEventType: nativeEvent?.type ?? null,
          eventTarget: {
            label: eventTargetLabel || describeEventTarget(nativeEvent?.target),
          },
          stageSize: {
            width: Number.isFinite(stageWidth) ? stageWidth : null,
            height: Number.isFinite(stageHeight) ? stageHeight : null,
          },
          stageRect: {
            left: Math.round(stageRect.left),
            top: Math.round(stageRect.top),
            width: Math.round(stageRect.width),
            height: Math.round(stageRect.height),
          },
          renderedScale: {
            x: Number(renderedScale.x.toFixed(4)),
            y: Number(renderedScale.y.toFixed(4)),
          },
          boxStage: {
            x: Number(box.x.toFixed(2)),
            y: Number(box.y.toFixed(2)),
            width: Number(box.width.toFixed(2)),
            height: Number(box.height.toFixed(2)),
          },
          nodeAbsolute: {
            x: Number.isFinite(nodeAbsolutePosition?.x)
              ? Number(nodeAbsolutePosition.x.toFixed(2))
              : null,
            y: Number.isFinite(nodeAbsolutePosition?.y)
              ? Number(nodeAbsolutePosition.y.toFixed(2))
              : null,
          },
          anchorStageY: Number(anchorStageY.toFixed(2)),
          elementScreen: {
            x: Number(elementoX.toFixed(2)),
            y: Number(elementoY.toFixed(2)),
            right: Number(elementoRight.toFixed(2)),
            width: Number(anchoElemento.toFixed(2)),
            height: Number(altoElemento.toFixed(2)),
          },
          preferred: {
            x: Number(preferredX.toFixed(2)),
            y: Number(preferredY.toFixed(2)),
            targetButtonSize,
            overlapPx: Number(overlapPx.toFixed(2)),
            nudgeX,
            nudgeY,
            fallbackNearVertexX: Number(fallbackNearVertexX.toFixed(2)),
            fallbackNearVertexY: Number(fallbackNearVertexY.toFixed(2)),
            placementModeX,
            placementModeY,
          },
          final: {
            x: Number(botonX.toFixed(2)),
            y: Number(botonY.toFixed(2)),
            renderX: Number(renderX.toFixed(2)),
            renderY: Number(renderY.toFixed(2)),
            positionMode: hasRelativeRoot ? "absolute" : "fixed",
            minX,
            maxX,
            minY,
            maxY,
          },
          viewport: {
            width: viewportWidth,
            height: viewportHeight,
            scrollX: Number(window.scrollX || window.pageXOffset || 0),
            scrollY: Number(window.scrollY || window.pageYOffset || 0),
            visualViewport: window.visualViewport
              ? {
                offsetTop: Number(window.visualViewport.offsetTop || 0),
                offsetLeft: Number(window.visualViewport.offsetLeft || 0),
                width: Number(window.visualViewport.width || 0),
                height: Number(window.visualViewport.height || 0),
                scale: Number(window.visualViewport.scale || 1),
              }
              : null,
          },
          scrollTarget: {
            label: describeEventTarget(debugScrollTarget),
            scrollTop:
              debugScrollTarget && "scrollTop" in debugScrollTarget
                ? Number(debugScrollTarget.scrollTop || 0)
                : null,
          },
        });
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error || "unknown-error");
      debugLog("position-error", {
        source,
        selectedId: elementosSeleccionados?.[0] ?? null,
        error: message,
      }, true);
      ocultarBotonOpciones("exception", { source, error: message });
      finishPerf?.({ reason: "exception", message });
    }
  }, [
    botonOpcionesRef,
    elementosSeleccionados,
    elementRefs,
    overlayNodeRefs,
    overlaySelection,
    stageRef,
    escalaVisual,
    escalaActiva,
    debugLog,
    ocultarBotonOpciones,
    layoutRootRef,
    isMobile,
    buttonSize,
    canvasUiSuppressed,
    buildAnchorSignature,
    canvasInteractionEpoch,
  ]);

  useEffect(() => {
    const hasAnchoredTarget =
      overlaySelection?.kind === "canvas-object"
        ? elementosSeleccionados.length === 1
        : overlaySelection?.kind === "multi-selection"
          ? Array.isArray(overlaySelection?.selectedIds) &&
            overlaySelection.selectedIds.length >= 2
        : overlaySelection?.kind === "background-decoration"
          ? Boolean(overlaySelection?.menuItem?.id)
        : overlaySelection?.kind === "section-edge-decoration"
          ? Boolean(overlaySelection?.menuItem?.id)
          : overlaySelection?.kind === "section-base-image"
            ? Boolean(overlaySelection?.sectionId)
            : false;

    if (canvasUiSuppressed) {
      cancelPendingPositionSyncRafs();
      ocultarBotonOpciones("canvas-ui-suppressed", {
        canvasInteractionEpoch,
      });
      lastInteractionEpochRef.current = canvasInteractionEpoch;
      return undefined;
    }

    if (!hasAnchoredTarget) {
      ocultarBotonOpciones();
      return undefined;
    }

    let rafA = 0;
    let rafB = 0;
    let settleRaf = 0;
    let cancelled = false;
    const interactionEpochChanged =
      Number(lastInteractionEpochRef.current) !== Number(canvasInteractionEpoch);
    const currentAnchorSignature = buildAnchorSignature();
    const stableAnchorAfterInteraction =
      interactionEpochChanged &&
      currentAnchorSignature &&
      currentAnchorSignature === lastAnchorSignatureRef.current?.anchorSignature;
    const settleDurationMs = interactionEpochChanged
      ? 0
      : (isMobile ? POSITION_SETTLE_MS_MOBILE : POSITION_SETTLE_MS_DESKTOP);
    const settleStartTs =
      typeof performance !== "undefined" && typeof performance.now === "function"
        ? performance.now()
        : Date.now();

    const settleTick = () => {
      if (cancelled) return;
      const now =
        typeof performance !== "undefined" && typeof performance.now === "function"
          ? performance.now()
          : Date.now();

      actualizarPosicionBotonOpciones("settle-loop");
      if (now - settleStartTs < settleDurationMs) {
        settleRaf = window.requestAnimationFrame(settleTick);
        pendingPositionSyncRafsRef.current.settleRaf = settleRaf;
      }
    };

    cancelPendingPositionSyncRafs();

    if (stableAnchorAfterInteraction) {
      actualizarPosicionBotonOpciones("stable-anchor-release", null, "stable-anchor");
      lastInteractionEpochRef.current = canvasInteractionEpoch;
      return () => {
        cancelled = true;
        cancelPendingPositionSyncRafs();
      };
    }

    rafA = window.requestAnimationFrame(() => {
      pendingPositionSyncRafsRef.current.rafA = 0;
      rafB = window.requestAnimationFrame(() => {
        pendingPositionSyncRafsRef.current.rafB = 0;
        actualizarPosicionBotonOpciones("raf-init", null, "raf");
        if (settleDurationMs > 0) {
          settleRaf = window.requestAnimationFrame(settleTick);
          pendingPositionSyncRafsRef.current.settleRaf = settleRaf;
        }
      });
      pendingPositionSyncRafsRef.current.rafB = rafB;
    });
    pendingPositionSyncRafsRef.current.rafA = rafA;
    lastInteractionEpochRef.current = canvasInteractionEpoch;

    return () => {
      cancelled = true;
      cancelPendingPositionSyncRafs();
    };
  }, [
    elementosSeleccionados,
    actualizarPosicionBotonOpciones,
    buildAnchorSignature,
    canvasInteractionEpoch,
    canvasUiSuppressed,
    cancelPendingPositionSyncRafs,
    ocultarBotonOpciones,
    isMobile,
    overlaySelection,
  ]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const stage = stageRef.current?.getStage?.() || stageRef.current;
    const stageContainer =
      typeof stage?.container === "function" ? stage.container() : null;
    const hasRelativeRoot = Boolean(layoutRootRef?.current);

    const syncPosition = (source = "sync", nativeEvent = null) => {
      if (canvasUiSuppressed) {
        ocultarBotonOpciones("canvas-ui-suppressed", {
          source,
          canvasInteractionEpoch,
        });
        return;
      }
      if (
        (overlaySelection?.kind === "canvas-object" && elementosSeleccionados.length === 1) ||
        (overlaySelection?.kind === "multi-selection" &&
          Array.isArray(overlaySelection?.selectedIds) &&
          overlaySelection.selectedIds.length >= 2) ||
        (overlaySelection?.kind === "background-decoration" &&
          overlaySelection?.menuItem?.id) ||
        (overlaySelection?.kind === "section-edge-decoration" &&
          overlaySelection?.menuItem?.id) ||
        (overlaySelection?.kind === "section-base-image" &&
          overlaySelection?.sectionId)
      ) {
        actualizarPosicionBotonOpciones(
          source,
          nativeEvent,
          describeEventTarget(nativeEvent?.target)
        );
      } else {
        ocultarBotonOpciones("sync-no-selection", { source });
      }
    };

    const scrollTargets = hasRelativeRoot
      ? []
      : (stageContainer ? getScrollableAncestors(stageContainer) : [window]);
    const detach = [];

    scrollTargets.forEach((target) => {
      if (!target?.addEventListener || !target?.removeEventListener) return;
      const onScroll = (event) => {
        syncPosition(`scroll:${describeEventTarget(event.target)}`, event);
      };
      target.addEventListener("scroll", onScroll, { passive: true });
      detach.push(() => target.removeEventListener("scroll", onScroll));
    });

    if (!hasRelativeRoot && window.visualViewport) {
      const onVisualViewportScroll = (event) => {
        syncPosition("visual-viewport-scroll", event);
      };
      const onVisualViewportResize = (event) => {
        syncPosition("visual-viewport-resize", event);
      };
      window.visualViewport.addEventListener("scroll", onVisualViewportScroll);
      window.visualViewport.addEventListener("resize", onVisualViewportResize);
      detach.push(() => {
        window.visualViewport.removeEventListener("scroll", onVisualViewportScroll);
        window.visualViewport.removeEventListener("resize", onVisualViewportResize);
      });
    }

    const onResize = (event) => {
      syncPosition("window-resize", event);
    };
    const onOrientationChange = (event) => {
      syncPosition("window-orientationchange", event);
    };
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onOrientationChange);
    detach.push(() => window.removeEventListener("resize", onResize));
    detach.push(() => window.removeEventListener("orientationchange", onOrientationChange));

    if (stage?.on && stage?.off) {
      const onStageDragStart = () => {
        cancelPendingPositionSyncRafs();
        ocultarBotonOpciones("stage-dragstart");
      };
      const onStageDragEnd = (event) => syncPosition("stage-dragend", event?.evt || null);
      const onStageTransformStart = () => {
        ocultarBotonOpciones("stage-transformstart");
      };
      const onStageTransformEnd = (event) =>
        syncPosition("stage-transformend", event?.evt || null);

      stage.on("dragstart.option-button", onStageDragStart);
      stage.on("dragend.option-button", onStageDragEnd);
      stage.on("transformstart.option-button", onStageTransformStart);
      stage.on("transformend.option-button", onStageTransformEnd);
      detach.push(() => {
        stage.off("dragstart.option-button", onStageDragStart);
        stage.off("dragend.option-button", onStageDragEnd);
        stage.off("transformstart.option-button", onStageTransformStart);
        stage.off("transformend.option-button", onStageTransformEnd);
      });
    }

    const onGlobalDraggingStart = () => {
      cancelPendingPositionSyncRafs();
      ocultarBotonOpciones("global-dragging-start");
    };
    window.addEventListener("dragging-start", onGlobalDraggingStart);
    detach.push(() => window.removeEventListener("dragging-start", onGlobalDraggingStart));

    // Primer sync inmediato por si hay cambio de scroll entre renders.
    syncPosition("initial-sync");

    return () => {
      detach.forEach((fn) => {
        try {
          fn();
        } catch {
          // no-op cleanup guard
        }
      });
    };
  }, [
    canvasInteractionEpoch,
    canvasUiSuppressed,
    stageRef,
    layoutRootRef,
    elementosSeleccionados.length,
    actualizarPosicionBotonOpciones,
    cancelPendingPositionSyncRafs,
    ocultarBotonOpciones,
    overlaySelection,
  ]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const handleElementRefRegistered = (event) => {
      const registeredId = event?.detail?.id || null;
      if (!isRegisteredRefRelevantToOverlaySelection(overlaySelection, registeredId)) {
        return;
      }

      if (canvasUiSuppressed) return;

      actualizarPosicionBotonOpciones(
        "element-ref-registered",
        event,
        `element-ref:${String(registeredId || "").trim()}`
      );
    };

    window.addEventListener("element-ref-registrado", handleElementRefRegistered);
    return () => {
      window.removeEventListener("element-ref-registrado", handleElementRefRegistered);
    };
  }, [
    actualizarPosicionBotonOpciones,
    canvasUiSuppressed,
    overlaySelection,
  ]);

  return {
    actualizarPosicionBotonOpciones,
  };
}
