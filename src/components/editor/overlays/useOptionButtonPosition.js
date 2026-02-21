import { useCallback, useEffect, useRef } from "react";

const FALLBACK_BUTTON_SIZE_DESKTOP = 28;
const FALLBACK_BUTTON_SIZE_MOBILE = 24;
const BUTTON_VERTEX_OVERLAP_RATIO = 0.5;
const BUTTON_VERTEX_NUDGE_X_DESKTOP = 20;
const BUTTON_VERTEX_NUDGE_Y_DESKTOP = 20;
const BUTTON_VERTEX_NUDGE_X_MOBILE = 20;
const BUTTON_VERTEX_NUDGE_Y_MOBILE = 20;
const LOG_THROTTLE_MS = 120;
const POSITION_SETTLE_MS_DESKTOP = 120;
const POSITION_SETTLE_MS_MOBILE = 320;

function isOptionButtonDebugEnabled() {
  return typeof window !== "undefined" && window.__DBG_OPTION_BUTTON === true;
}

function resolveScale(escalaVisual, escalaActiva) {
  if (Number.isFinite(escalaVisual) && escalaVisual > 0) return escalaVisual;
  if (Number.isFinite(escalaActiva) && escalaActiva > 0) return escalaActiva;
  return 1;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
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

export default function useOptionButtonPosition({
  botonOpcionesRef,
  layoutRootRef = null,
  elementRefs,
  elementosSeleccionados,
  stageRef,
  escalaVisual,
  escalaActiva,
  isMobile = false,
  buttonSize = FALLBACK_BUTTON_SIZE_DESKTOP,
}) {
  const lastLogByEventRef = useRef({});

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
  }, [botonOpcionesRef, debugLog, elementosSeleccionados, isMobile]);

  const actualizarPosicionBotonOpciones = useCallback((
    source = "manual",
    nativeEvent = null,
    eventTargetLabel = null
  ) => {
    if (typeof window === "undefined") return;
    if (!botonOpcionesRef.current) return;

    if (elementosSeleccionados.length !== 1) {
      ocultarBotonOpciones("selection-count", {
        source,
        count: elementosSeleccionados.length,
      });
      return;
    }

    const nodeRef = elementRefs.current[elementosSeleccionados[0]];
    const stage = stageRef.current;
    if (!nodeRef || !stage) {
      ocultarBotonOpciones("missing-node-or-stage", {
        source,
        hasNode: Boolean(nodeRef),
        hasStage: Boolean(stage),
      });
      return;
    }

    try {
      const box = nodeRef.getClientRect({
        relativeTo: stage,
        skipShadow: true,
      });
      const nodeAbsolutePosition =
        typeof nodeRef.getAbsolutePosition === "function"
          ? nodeRef.getAbsolutePosition()
          : {
            x: typeof nodeRef.x === "function" ? nodeRef.x() : null,
            y: typeof nodeRef.y === "function" ? nodeRef.y() : null,
          };
      const stageContainer =
        typeof stage.container === "function"
          ? stage.container()
          : stage.getStage?.()?.container?.();
      if (!stageContainer) {
        ocultarBotonOpciones("missing-stage-container", { source });
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
      const nudgeY = isMobile ? BUTTON_VERTEX_NUDGE_Y_MOBILE : BUTTON_VERTEX_NUDGE_Y_DESKTOP;

      const anchorStageY =
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
      const useFallbackNearVertexY = preferredY < minY && fallbackNearVertexY <= maxY;

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
      }

      botonOpcionesRef.current.style.left = `${Math.round(renderX)}px`;
      botonOpcionesRef.current.style.top = `${Math.round(renderY)}px`;
      botonOpcionesRef.current.style.display = "flex";

      if (isOptionButtonDebugEnabled()) {
        const debugScrollTarget = getScrollableAncestors(stageContainer)[0] || window;
        const stageWidth =
          typeof stage?.width === "function" ? Number(stage.width()) : Number(stage?.attrs?.width);
        const stageHeight =
          typeof stage?.height === "function" ? Number(stage.height()) : Number(stage?.attrs?.height);
        debugLog("position", {
          source,
          selectedId: elementosSeleccionados[0],
          isMobile,
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
    }
  }, [
    botonOpcionesRef,
    elementosSeleccionados,
    elementRefs,
    stageRef,
    escalaVisual,
    escalaActiva,
    debugLog,
    ocultarBotonOpciones,
    layoutRootRef,
    isMobile,
    buttonSize,
  ]);

  useEffect(() => {
    if (elementosSeleccionados.length !== 1) {
      ocultarBotonOpciones();
      return undefined;
    }

    let rafA = 0;
    let rafB = 0;
    let settleRaf = 0;
    let cancelled = false;
    const settleDurationMs = isMobile ? POSITION_SETTLE_MS_MOBILE : POSITION_SETTLE_MS_DESKTOP;
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
      }
    };

    rafA = window.requestAnimationFrame(() => {
      rafB = window.requestAnimationFrame(() => {
        actualizarPosicionBotonOpciones("raf-init", null, "raf");
        settleRaf = window.requestAnimationFrame(settleTick);
      });
    });

    return () => {
      cancelled = true;
      if (rafA) window.cancelAnimationFrame(rafA);
      if (rafB) window.cancelAnimationFrame(rafB);
      if (settleRaf) window.cancelAnimationFrame(settleRaf);
    };
  }, [elementosSeleccionados, actualizarPosicionBotonOpciones, ocultarBotonOpciones, isMobile]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const stage = stageRef.current?.getStage?.() || stageRef.current;
    const stageContainer =
      typeof stage?.container === "function" ? stage.container() : null;
    const hasRelativeRoot = Boolean(layoutRootRef?.current);

    const syncPosition = (source = "sync", nativeEvent = null) => {
      if (elementosSeleccionados.length === 1) {
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
      const onStageDragMove = (event) => syncPosition("stage-dragmove", event?.evt || null);
      const onStageDragEnd = (event) => syncPosition("stage-dragend", event?.evt || null);
      const onStageTransform = (event) => syncPosition("stage-transform", event?.evt || null);
      const onStageTransformEnd = (event) =>
        syncPosition("stage-transformend", event?.evt || null);

      stage.on("dragmove.option-button", onStageDragMove);
      stage.on("dragend.option-button", onStageDragEnd);
      stage.on("transform.option-button", onStageTransform);
      stage.on("transformend.option-button", onStageTransformEnd);
      detach.push(() => {
        stage.off("dragmove.option-button", onStageDragMove);
        stage.off("dragend.option-button", onStageDragEnd);
        stage.off("transform.option-button", onStageTransform);
        stage.off("transformend.option-button", onStageTransformEnd);
      });
    }

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
    stageRef,
    layoutRootRef,
    elementosSeleccionados.length,
    actualizarPosicionBotonOpciones,
    ocultarBotonOpciones,
  ]);

  return {
    actualizarPosicionBotonOpciones,
  };
}
