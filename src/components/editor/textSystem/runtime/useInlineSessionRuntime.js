import { useCallback, useEffect } from "react";
import { flushSync } from "react-dom";
import {
  isInlineDebugEnabled,
  formatInlineLogPayload,
  inlineDebugLog,
  nextInlineFrameMeta,
  roundInlineMetric,
  rectToInlinePayload,
  getInlineInkCharMetrics,
  getInlineLineBoxRect,
  resolveInlineKonvaTextNode,
  getInlineKonvaProjectedRectViewport,
  getInlineLineStats,
} from "@/components/editor/canvasEditor/inlineSnapshotPrimitives";
import {
  clearCurrentInlineEditingIdIfMatches,
  getCurrentInlineEditingId,
  setCurrentInlineEditingId,
} from "@/components/editor/textSystem/bridges/window/inlineWindowBridge";
import useInlineDebugABConfig from "@/components/editor/textSystem/runtime/useInlineDebugABConfig";
import useInlineFontReady from "@/components/editor/textSystem/runtime/useInlineFontReady";
import useInlineGlobalEditingSync from "@/components/editor/textSystem/bridges/window/useInlineGlobalEditingSync";
import resolveInlineCanvasVisibility from "@/components/editor/textSystem/adapters/konvaDom/resolveInlineCanvasVisibility";

function parseInlineDiagFlag(value, fallback = false) {
  if (typeof value === "undefined") return fallback;
  if (value === true || value === 1 || value === "1") return true;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") return true;
    if (normalized === "false") return false;
  }
  if (value === false || value === 0 || value === "0") return false;
  return fallback;
}

function readInlineAlignmentDiagConfig(debugEnabled) {
  if (!debugEnabled || typeof window === "undefined") {
    return {
      enabled: false,
      extended: false,
    };
  }
  const enabled = parseInlineDiagFlag(window.__INLINE_DIAG_ALIGNMENT, true);
  const extended = parseInlineDiagFlag(window.__INLINE_DIAG_ALIGNMENT_EXTENDED, false);
  return {
    enabled,
    extended,
  };
}

export default function useCanvasEditorInlineRuntime({
  editing,
  isMobile,
  mobileSectionActionsOpen,
  setMobileSectionActionsOpen,
  seccionActivaId,
  fontManager,
  inlineSwapAckSeqRef,
  inlineCommitDebugRef,
  inlineVisibilitySnapshotRef,
  inlineKonvaDrawMetaRef,
  inlinePaintApproxRef,
  logInlineSnapshotRef,
  inlineRenderValueRef,
  inlineOverlayMountedId,
  setInlineOverlayMountedId,
  setInlineSwapAck,
  stageRef,
  elementRefs,
  escalaVisual,
  objetos,
  startEdit,
  updateEdit,
  finishEdit,
  restoreElementDrag,
  obtenerMetricasNodoInline,
}) {
  const { inlineDebugAB } = useInlineDebugABConfig({
    editingId: editing.id,
    editingValue: editing.value,
  });

  useEffect(() => {
    if (!isMobile && mobileSectionActionsOpen) {
      setMobileSectionActionsOpen(false);
    }
  }, [isMobile, mobileSectionActionsOpen]);

  const { ensureInlineFontReady } = useInlineFontReady({
    fontManager,
  });

  useEffect(() => {
    if (!isMobile) return;
    setMobileSectionActionsOpen(false);
  }, [seccionActivaId, isMobile]);

  const markInlineKonvaDraw = useCallback((source = "unknown") => {
    const nowMs =
      typeof window !== "undefined" && typeof window.performance?.now === "function"
        ? roundInlineMetric(Number(window.performance.now()), 3)
        : null;
    const prevSeq = Number(inlineKonvaDrawMetaRef.current?.seq || 0);
    inlineKonvaDrawMetaRef.current = {
      seq: prevSeq + 1,
      nowMs,
      source,
    };
  }, []);

  const emitAlignmentVisibilityAuthority = useCallback((eventName, details = {}) => {
    try {
      const diagConfig = readInlineAlignmentDiagConfig(isInlineDebugEnabled());
      if (!diagConfig.enabled) return;

      const defaultDiagEvents = new Set([
        "overlay-mounted-state",
        "konva: after-hide-sync",
        "finish_commit",
        "done",
        "cancel",
      ]);
      const extendedDiagEvents = new Set([
        "konva: after-hide-raf1",
      ]);

      const resolvedEngine = "phase_atomic_v2";
      const canEmitExtended = true;
      const shouldEmit =
        defaultDiagEvents.has(eventName) ||
        (canEmitExtended && extendedDiagEvents.has(eventName));
      if (!shouldEmit) return;

      const targetId = details?.id || editing.id || null;
      if (!targetId) return;

      const overlayMountedId = Object.prototype.hasOwnProperty.call(details, "inlineOverlayMountedId")
        ? details.inlineOverlayMountedId
        : inlineOverlayMountedId;
      const resolvedVisibilityMode =
        inlineDebugAB.visibilitySource === "window" ? "window" : "reactive";
      const currentInlineEditingId = getCurrentInlineEditingId();
      const safeId = String(targetId).replace(/"/g, '\\"');
      const overlayRoot =
        typeof document !== "undefined"
          ? document.querySelector(`[data-inline-editor-id="${safeId}"]`)
          : null;
      const overlayDomPresent = Boolean(overlayRoot);
      const overlayVisualReady =
        overlayRoot?.getAttribute?.("data-inline-editor-visual-ready") === "true";
      const activeEl = typeof document !== "undefined" ? document.activeElement : null;
      const overlayFocused = Boolean(
        overlayRoot &&
        activeEl &&
        (activeEl === overlayRoot || overlayRoot.contains(activeEl))
      );

      const adapterDecision = resolveInlineCanvasVisibility({
        overlayEngine: resolvedEngine,
        visibilityMode: resolvedVisibilityMode,
        inlineOverlayMountedId: overlayMountedId,
        objectId: targetId,
        editingId: editing.id,
        currentInlineEditingId,
      });
      const targetNode = elementRefs.current[targetId] || null;
      const konvaOpacity =
        targetNode && typeof targetNode.opacity === "function"
          ? roundInlineMetric(Number(targetNode.opacity()), 4)
          : null;
      const konvaVisible =
        targetNode && typeof targetNode.visible === "function"
          ? Boolean(targetNode.visible())
          : null;

      const payload = {
        id: targetId,
        sessionId: details?.sessionId || null,
        eventName,
        phase: details?.phase || eventName,
        engine: resolvedEngine,
        visibilityMode: resolvedVisibilityMode,
        authorities: {
          editingIdReactive: editing.id || null,
          currentEditingIdWindow: currentInlineEditingId || null,
          inlineOverlayMountedId: overlayMountedId || null,
        },
        overlayState: {
          overlayDomPresent,
          overlayVisualReady,
          overlayFocused,
        },
        adapterDecision: {
          isEditingByWindow: Boolean(adapterDecision?.isEditingByWindow),
          isEditingByReactive: Boolean(adapterDecision?.isEditingByReactive),
          isEditingByOverlay: Boolean(adapterDecision?.isEditingByOverlay),
          isEditing: Boolean(adapterDecision?.isEditing),
        },
        konvaState: {
          opacity: konvaOpacity,
          visible: konvaVisible,
          drawSeq: Number(inlineKonvaDrawMetaRef.current?.seq || 0),
        },
        handoff: {
          swapToken: Number.isFinite(Number(details?.swapToken))
            ? Number(details.swapToken)
            : null,
          offsetY: Number.isFinite(Number(details?.offsetY))
            ? roundInlineMetric(Number(details.offsetY), 4)
            : null,
          eventLoopPhase: details?.eventLoopPhase || "sync",
        },
      };
      console.log(
        `[INLINE][DIAG] alignment-visibility-authority\n${formatInlineLogPayload(payload)}`
      );
    } catch (diagError) {
      console.warn("[INLINE][DIAG] visibility-channel-error", {
        eventName,
        error: String(diagError || ""),
      });
    }
  }, [
    editing.id,
    elementRefs,
    inlineDebugAB.overlayEngine,
    inlineDebugAB.visibilitySource,
    inlineKonvaDrawMetaRef,
    inlineOverlayMountedId,
  ]);

  const applyInlineOverlayMountState = useCallback((id, mounted, meta = {}) => {
    const safeId = id || null;
    if (!safeId) return;

    if (mounted) {
      logInlineSnapshotRef.current?.("konva-hide-before-applied", {
        id: safeId,
        hideCanvasTextWhenEditing: true,
        hideApplied: false,
        ...meta,
      });
    }

    const sourceNode = elementRefs.current[safeId] || null;
    const stageForHandoff =
      sourceNode?.getStage?.() || stageRef.current?.getStage?.() || stageRef.current || null;
    const nodeForHandoff = resolveInlineKonvaTextNode(sourceNode, stageForHandoff) || sourceNode;
    if (mounted) {
      logInlineSnapshotRef.current?.("konva: before-hide", {
        id: safeId,
        eventLoopPhase: "sync",
        ...meta,
      });
    }
    if (nodeForHandoff && typeof nodeForHandoff.opacity === "function") {
      nodeForHandoff.opacity(mounted ? 0 : 1);
      const layer = nodeForHandoff.getLayer?.() || null;
      if (typeof layer?.batchDraw === "function") {
        layer.batchDraw();
        markInlineKonvaDraw("layer.batchDraw");
      } else {
        const stage = stageRef.current?.getStage?.() || stageRef.current || null;
        if (typeof stage?.batchDraw === "function") {
          stage.batchDraw();
          markInlineKonvaDraw("stage.batchDraw");
        }
      }
      if (mounted) {
        logInlineSnapshotRef.current?.("konva: after-hide-sync", {
          id: safeId,
          eventLoopPhase: "sync",
          ...meta,
        });
        emitAlignmentVisibilityAuthority("konva: after-hide-sync", {
          id: safeId,
          sessionId: meta?.sessionId || null,
          phase: meta?.phase || null,
          engine: meta?.engine || inlineDebugAB.overlayEngine,
          offsetY: meta?.offsetY,
          eventLoopPhase: "sync",
          swapToken: null,
        });
        requestAnimationFrame((rafStamp) => {
          logInlineSnapshotRef.current?.("konva: after-hide-raf1", {
            id: safeId,
            eventLoopPhase: "raf",
            rafStamp: roundInlineMetric(Number(rafStamp), 3),
            ...meta,
          });
          emitAlignmentVisibilityAuthority("konva: after-hide-raf1", {
            id: safeId,
            sessionId: meta?.sessionId || null,
            phase: meta?.phase || null,
            engine: meta?.engine || inlineDebugAB.overlayEngine,
            offsetY: meta?.offsetY,
            eventLoopPhase: "raf",
            swapToken: null,
          });
        });
      }
      if (mounted) {
        logInlineSnapshotRef.current?.("konva-hide-applied", {
          id: safeId,
          hideCanvasTextWhenEditing: true,
          hideApplied: true,
          ...meta,
        });
      }
    }

    setInlineOverlayMountedId((previous) => {
      const next = mounted ? safeId : (previous === safeId ? null : previous);
      const baseNode = elementRefs.current[safeId] || null;
      const stageForVisibility =
        baseNode?.getStage?.() || stageRef.current?.getStage?.() || stageRef.current || null;
      const node = resolveInlineKonvaTextNode(baseNode, stageForVisibility) || baseNode;
      const nodeVisibility = node
        ? {
            opacity:
              typeof node.opacity === "function" ? node.opacity() : null,
            visible:
              typeof node.visible === "function" ? node.visible() : null,
          }
        : null;
      const safeDomId = String(safeId).replace(/"/g, '\\"');
      const overlayDomPresent = safeDomId
        ? Boolean(document.querySelector(`[data-inline-editor-id="${safeDomId}"]`))
        : false;
      inlineDebugLog("overlay-mounted-state", {
        id: safeId,
        mounted,
        previousOverlayMountedId: previous,
        nextOverlayMountedId: next,
        overlayDomPresent,
        nodeVisibility,
        ...meta,
      });
      emitAlignmentVisibilityAuthority("overlay-mounted-state", {
        id: safeId,
        sessionId: meta?.sessionId || null,
        phase: meta?.phase || null,
        engine: meta?.engine || inlineDebugAB.overlayEngine,
        offsetY: meta?.offsetY,
        eventLoopPhase: "sync",
        swapToken: null,
        inlineOverlayMountedId: next,
      });
      if (mounted) {
        logInlineSnapshotRef.current?.("overlay-visible-applied", {
          id: safeId,
          overlayMounted: next === safeId,
          overlayDomPresent,
          ...meta,
        });
      }
      return next;
    });
  }, [
    emitAlignmentVisibilityAuthority,
    inlineDebugAB.overlayEngine,
    markInlineKonvaDraw,
    resolveInlineKonvaTextNode,
    stageRef,
  ]);

  const scheduleInlineSwapCommit = useCallback((commitFn) => {
    if (typeof commitFn !== "function") return;
    const runCommit = () => commitFn();
    if (typeof queueMicrotask === "function") {
      queueMicrotask(runCommit);
      return;
    }
    Promise.resolve().then(runCommit);
  }, []);

  const handleInlineOverlaySwapRequest = useCallback((payload = {}) => {
    const id = payload?.id || null;
    const sessionId = payload?.sessionId || null;
    const phase = payload?.phase || null;
    const offsetY = Number(payload?.offsetY);
    if (!id || !sessionId || !phase) return;

    const meta = {
      engine: "phase_atomic_v2",
      phase,
      sessionId,
      offsetY: Number.isFinite(offsetY) ? roundInlineMetric(offsetY, 4) : null,
    };

    if (phase === "ready_to_swap") {
      scheduleInlineSwapCommit(() => {
        applyInlineOverlayMountState(id, true, meta);
        inlineSwapAckSeqRef.current += 1;
        setInlineSwapAck({
          id,
          sessionId,
          phase: "swap-commit",
          token: inlineSwapAckSeqRef.current,
          offsetY: Number.isFinite(offsetY) ? offsetY : 0,
        });
      });
      return;
    }

    if (phase === "finish_commit" || phase === "done" || phase === "cancel") {
      scheduleInlineSwapCommit(() => {
        applyInlineOverlayMountState(id, false, meta);
        inlineSwapAckSeqRef.current += 1;
        const nextToken = inlineSwapAckSeqRef.current;
        setInlineSwapAck({
          id,
          sessionId,
          phase,
          token: nextToken,
          offsetY: Number.isFinite(offsetY) ? offsetY : 0,
        });
        emitAlignmentVisibilityAuthority(phase, {
          id,
          sessionId,
          phase,
          engine: "phase_atomic_v2",
          offsetY: Number.isFinite(offsetY) ? offsetY : null,
          eventLoopPhase: "sync",
          swapToken: nextToken,
        });
      });
    }
  }, [applyInlineOverlayMountState, emitAlignmentVisibilityAuthority, scheduleInlineSwapCommit]);

  const logInlineSnapshot = useCallback((eventName, extra = {}) => {
    if (typeof window === "undefined") return;
    if (!isInlineDebugEnabled()) return;
    if (window.__INLINE_SNAPSHOT !== true) return;

    const snapshotAllowlist = new Set([
      "overlay: pre-focus-call",
      "overlay: post-focus-sync",
      "overlay: before-show",
      "overlay: after-show-sync",
      "overlay: after-show-raf1",
      "konva: before-hide",
      "konva: after-hide-sync",
      "konva: after-hide-raf1",
      "selection-set",
      "konva-hide-before-applied",
      "konva-hide-applied",
    ]);
    if (!snapshotAllowlist.has(eventName)) return;

    const nowMsRaw =
      typeof window.performance?.now === "function"
        ? Number(window.performance.now())
        : null;
    if (!inlinePaintApproxRef.current.pending && typeof requestAnimationFrame === "function") {
      inlinePaintApproxRef.current.pending = true;
      requestAnimationFrame(() => {
        requestAnimationFrame((stamp) => {
          inlinePaintApproxRef.current.lastPaintApproxMs = roundInlineMetric(
            Number(stamp),
            3
          );
          inlinePaintApproxRef.current.pending = false;
        });
      });
    }

    const snapshotId =
      extra.id ||
      editing.id ||
      inlineCommitDebugRef.current?.id ||
      null;
    const snapshotKey = String(snapshotId || "__none__");
    const safeId =
      snapshotId == null ? null : String(snapshotId).replace(/"/g, '\\"');
    const overlayEl = safeId
      ? document.querySelector(`[data-inline-editor-id="${safeId}"]`)
      : null;
    const contentEl = overlayEl
      ? (
          overlayEl.querySelector('[contenteditable="true"]') ||
          overlayEl.querySelector("input") ||
          overlayEl.querySelector("textarea")
        )
      : null;

    const overlayRect = rectToInlinePayload(overlayEl?.getBoundingClientRect?.() || null);
    const inkFirstCharMetrics = getInlineInkCharMetrics(contentEl, "first");
    const inkFirstCharRect = inkFirstCharMetrics?.inkRect ?? null;
    const inkLineBoxRect = getInlineLineBoxRect(contentEl);
    const readOverlayMetric = (attrName) => {
      const raw = overlayEl?.getAttribute?.(attrName);
      const numeric = Number(raw);
      return Number.isFinite(numeric) ? roundInlineMetric(numeric) : null;
    };
    const readExtraMetric = (key) => {
      const numeric = Number(extra?.[key]);
      return Number.isFinite(numeric) ? roundInlineMetric(numeric) : null;
    };
    const computedBaselineOffsetPx =
      readExtraMetric("computedBaselineOffsetPx") ??
      readOverlayMetric("data-inline-computed-baseline-offset") ??
      null;
    const appliedVerticalCorrectionPx =
      readExtraMetric("appliedVerticalCorrectionPx") ??
      readOverlayMetric("data-inline-vertical-correction") ??
      null;
    const topRawPx =
      readExtraMetric("topRawPx") ??
      readOverlayMetric("data-inline-top-raw") ??
      null;
    const topCorrectedPx =
      readExtraMetric("topCorrectedPx") ??
      readOverlayMetric("data-inline-top-corrected") ??
      null;
    const baselineFromTopPx =
      readExtraMetric("baselineFromTopPx") ??
      readOverlayMetric("data-inline-baseline-from-top") ??
      null;
    const eventLoopPhase =
      typeof extra?.eventLoopPhase === "string"
        ? extra.eventLoopPhase
        : (eventName.includes("raf") ? "raf" : "sync");
    const rafStamp = readExtraMetric("rafStamp");
    const nowMs = Number.isFinite(nowMsRaw) ? roundInlineMetric(nowMsRaw, 3) : null;
    const lastPaintApprox =
      readExtraMetric("lastPaintApprox") ??
      inlinePaintApproxRef.current.lastPaintApproxMs ??
      null;
    const overlayComputedStyle =
      overlayEl && typeof window.getComputedStyle === "function"
        ? window.getComputedStyle(overlayEl)
        : null;
    const overlayComputedOpacity = overlayComputedStyle
      ? roundInlineMetric(Number(overlayComputedStyle.opacity || 1), 4)
      : null;
    const overlayComputedVisibility = overlayComputedStyle?.visibility ?? null;
    const overlayComputedDisplay = overlayComputedStyle?.display ?? null;
    const overlayComputedTransform = overlayComputedStyle?.transform ?? null;
    const overlayComputedWillChange = overlayComputedStyle?.willChange ?? null;
    const overlayIsConnected = Boolean(overlayEl?.isConnected);
    const overlayHasFocus = Boolean(contentEl && document.activeElement === contentEl);

    const stage = stageRef.current?.getStage?.() || stageRef.current || null;
    const node = snapshotId ? elementRefs.current[snapshotId] || null : null;
    const konvaTextOpacity =
      node && typeof node.opacity === "function"
        ? roundInlineMetric(Number(node.opacity()), 4)
        : null;
    const konvaTextVisible =
      node && typeof node.visible === "function" ? Boolean(node.visible()) : null;
    const currentDrawSeq = Number(inlineKonvaDrawMetaRef.current?.seq || 0);
    const previousDrawSeq =
      Number(inlineVisibilitySnapshotRef.current[snapshotKey]?.drawSeq || 0);
    const konvaDrawnThisFrame =
      currentDrawSeq > 0 && currentDrawSeq !== previousDrawSeq;
    inlineVisibilitySnapshotRef.current[snapshotKey] = {
      drawSeq: currentDrawSeq,
    };
    const konvaTextNode = resolveInlineKonvaTextNode(node, stage);
    const konvaProjection = getInlineKonvaProjectedRectViewport(
      konvaTextNode,
      stage,
      escalaVisual
    );
    const konvaTextClientRect = konvaProjection.konvaTextClientRect;
    const konvaProjectedRectViewport = konvaProjection.konvaProjectedRectViewport;
    const konvaVsDomInkDelta = konvaProjectedRectViewport
      ? {
          dx: inkFirstCharRect
            ? roundInlineMetric(
                Number(inkFirstCharRect.x) - Number(konvaProjectedRectViewport.x)
              )
            : null,
          dy: inkFirstCharRect
            ? roundInlineMetric(
                Number(inkFirstCharRect.y) - Number(konvaProjectedRectViewport.y)
              )
            : null,
          dw: inkLineBoxRect
            ? roundInlineMetric(
                Number(inkLineBoxRect.width) - Number(konvaProjectedRectViewport.width)
              )
            : null,
          dh: inkLineBoxRect
            ? roundInlineMetric(
                Number(inkLineBoxRect.height) - Number(konvaProjectedRectViewport.height)
              )
            : null,
        }
      : null;

    const readKonvaStyleValue = (target, key) => {
      if (!target) return null;
      try {
        const fn = target[key];
        if (typeof fn === "function") {
          const value = fn.call(target);
          return value ?? null;
        }
        if (typeof target.getAttr === "function") {
          const attrValue = target.getAttr(key);
          if (typeof attrValue !== "undefined") return attrValue;
        }
        if (target?.attrs && Object.prototype.hasOwnProperty.call(target.attrs, key)) {
          return target.attrs[key];
        }
      } catch {
        return null;
      }
      return null;
    };

    const konvaStyleNode = konvaTextNode || node;
    const konvaFontSize = Number(readKonvaStyleValue(konvaStyleNode, "fontSize"));
    const konvaLineHeightRaw = Number(readKonvaStyleValue(konvaStyleNode, "lineHeight"));
    const konvaLineHeightEffective =
      Number.isFinite(konvaFontSize) && Number.isFinite(konvaLineHeightRaw)
        ? roundInlineMetric(konvaFontSize * konvaLineHeightRaw)
        : (Number.isFinite(konvaLineHeightRaw) ? roundInlineMetric(konvaLineHeightRaw) : null);

    const konvaTextStyleSnapshot = {
      fontFamily: readKonvaStyleValue(konvaStyleNode, "fontFamily"),
      fontSize: Number.isFinite(konvaFontSize) ? roundInlineMetric(konvaFontSize) : null,
      fontStyle: readKonvaStyleValue(konvaStyleNode, "fontStyle"),
      fontVariant: readKonvaStyleValue(konvaStyleNode, "fontVariant"),
      fontWeight: readKonvaStyleValue(konvaStyleNode, "fontWeight"),
      lineHeight: konvaLineHeightEffective,
      padding: (() => {
        const value = Number(readKonvaStyleValue(konvaStyleNode, "padding"));
        return Number.isFinite(value) ? roundInlineMetric(value) : readKonvaStyleValue(konvaStyleNode, "padding");
      })(),
      align: readKonvaStyleValue(konvaStyleNode, "align"),
      verticalAlign: readKonvaStyleValue(konvaStyleNode, "verticalAlign"),
      scaleX: (() => {
        const value = Number(readKonvaStyleValue(konvaStyleNode, "scaleX"));
        return Number.isFinite(value) ? roundInlineMetric(value) : null;
      })(),
      scaleY: (() => {
        const value = Number(readKonvaStyleValue(konvaStyleNode, "scaleY"));
        return Number.isFinite(value) ? roundInlineMetric(value) : null;
      })(),
      offsetX: (() => {
        const value = Number(readKonvaStyleValue(konvaStyleNode, "offsetX"));
        return Number.isFinite(value) ? roundInlineMetric(value) : null;
      })(),
      offsetY: (() => {
        const value = Number(readKonvaStyleValue(konvaStyleNode, "offsetY"));
        return Number.isFinite(value) ? roundInlineMetric(value) : null;
      })(),
      rotation: (() => {
        const value = Number(readKonvaStyleValue(konvaStyleNode, "rotation"));
        return Number.isFinite(value) ? roundInlineMetric(value) : null;
      })(),
    };

    const domComputedStyle =
      contentEl && typeof window.getComputedStyle === "function"
        ? window.getComputedStyle(contentEl)
        : null;
    const domTextStyleSnapshot = {
      fontFamily: domComputedStyle?.fontFamily ?? null,
      fontSize: domComputedStyle?.fontSize ?? null,
      fontWeight: domComputedStyle?.fontWeight ?? null,
      fontStyle: domComputedStyle?.fontStyle ?? null,
      lineHeight: domComputedStyle?.lineHeight ?? null,
      letterSpacing: domComputedStyle?.letterSpacing ?? null,
      paddingTop: domComputedStyle?.paddingTop ?? null,
      paddingLeft: domComputedStyle?.paddingLeft ?? null,
      borderTopWidth: domComputedStyle?.borderTopWidth ?? null,
      borderLeftWidth: domComputedStyle?.borderLeftWidth ?? null,
      boxSizing: domComputedStyle?.boxSizing ?? null,
      whiteSpace: domComputedStyle?.whiteSpace ?? null,
      transform: domComputedStyle?.transform ?? null,
    };

    const baselineDiagnostics = {
      domGlyphTop: inkFirstCharRect ? roundInlineMetric(Number(inkFirstCharRect.y)) : null,
      domLineBoxTop: inkLineBoxRect ? roundInlineMetric(Number(inkLineBoxRect.y)) : null,
      domLineBoxHeight: inkLineBoxRect ? roundInlineMetric(Number(inkLineBoxRect.height)) : null,
      konvaTop: konvaProjectedRectViewport ? roundInlineMetric(Number(konvaProjectedRectViewport.y)) : null,
      konvaHeight: konvaProjectedRectViewport ? roundInlineMetric(Number(konvaProjectedRectViewport.height)) : null,
      deltaTop:
        konvaProjectedRectViewport && inkLineBoxRect
          ? roundInlineMetric(Number(inkLineBoxRect.y) - Number(konvaProjectedRectViewport.y))
          : null,
      deltaGlyphTop:
        konvaProjectedRectViewport && inkFirstCharRect
          ? roundInlineMetric(Number(inkFirstCharRect.y) - Number(konvaProjectedRectViewport.y))
          : null,
    };

    const payload = {
      escalaVisual,
      nowMs,
      eventLoopPhase,
      rafStamp,
      lastPaintApprox,
      overlayRect,
      inkFirstCharRect,
      inkLineBoxRect,
      konvaTextOpacity,
      konvaTextVisible,
      konvaDrawnThisFrame,
      overlayComputedOpacity,
      overlayComputedVisibility,
      overlayComputedDisplay,
      overlayComputedTransform,
      overlayComputedWillChange,
      overlayIsConnected,
      overlayHasFocus,
      konvaTextClientRect,
      konvaProjectedRectViewport,
      konvaVsDomInkDelta,
      computedBaselineOffsetPx,
      appliedVerticalCorrectionPx,
      topRawPx,
      topCorrectedPx,
      baselineFromTopPx,
      konvaTextStyleSnapshot,
      domTextStyleSnapshot,
      baselineDiagnostics,
    };

    const overlayVisibleForCrossfade =
      Number(overlayComputedOpacity) > 0 &&
      overlayComputedDisplay !== "none" &&
      overlayComputedVisibility !== "hidden";
    const overlayHiddenForCrossfade =
      Number(overlayComputedOpacity) === 0 ||
      overlayComputedDisplay === "none" ||
      overlayComputedVisibility === "hidden";
    const crossfadeState = {
      bothVisible:
        Number(konvaTextOpacity) > 0 &&
        overlayVisibleForCrossfade,
      bothHidden:
        Number(konvaTextOpacity) === 0 &&
        overlayHiddenForCrossfade,
    };
    payload.crossfadeState = crossfadeState;

    inlineDebugLog(`snapshot-${eventName}`, payload);

    const threshold = 0.5;
    const deltaTop = Number(baselineDiagnostics.deltaTop);
    const hasKonvaDomMismatch =
      Number.isFinite(deltaTop) &&
      Math.abs(deltaTop) >= threshold;

    if (hasKonvaDomMismatch) {
      const mismatchPayload = {
        eventName,
        deltaTop: baselineDiagnostics.deltaTop,
        deltaGlyphTop: baselineDiagnostics.deltaGlyphTop,
        konvaProjectedRectViewport,
        inkLineBoxRect,
      };
      const ts = new Date().toISOString();
      console.log(
        `[INLINE][ALERT][${ts}] konva-dom-mismatch\n${formatInlineLogPayload(mismatchPayload)}`
      );
    }

    const crossfadeAlertEvents = new Set([
      "overlay: before-show",
      "overlay: after-show-sync",
      "overlay: after-show-raf1",
      "konva: before-hide",
      "konva: after-hide-sync",
      "konva: after-hide-raf1",
    ]);
    if (
      crossfadeAlertEvents.has(eventName) &&
      (crossfadeState.bothVisible || crossfadeState.bothHidden)
    ) {
      const ts = new Date().toISOString();
      console.log(
        `[INLINE][ALERT][${ts}] crossfade-glitch\n${formatInlineLogPayload({
          eventName,
          crossfadeState,
          konvaTextOpacity,
          konvaTextVisible,
          overlayComputedOpacity,
          overlayComputedDisplay,
          overlayComputedVisibility,
          nowMs,
          eventLoopPhase,
          rafStamp,
          lastPaintApprox,
          deltaTop: baselineDiagnostics.deltaTop,
          deltaGlyphTop: baselineDiagnostics.deltaGlyphTop,
        })}`
      );
    }
  }, [editing.id, escalaVisual]);

  const captureInlineSnapshot = useCallback((eventName, extra = {}) => {
    logInlineSnapshot(eventName, extra);
  }, [logInlineSnapshot]);

  logInlineSnapshotRef.current = logInlineSnapshot;

  useEffect(() => {
    const currentId = editing.id || null;
    const currentValue = String(editing.value ?? "");
    const prev = inlineRenderValueRef.current;

    if (currentId && prev.id === currentId && prev.value !== currentValue) {
      const prevStats = getInlineLineStats(prev.value);
      const nextStats = getInlineLineStats(currentValue);
      const linebreakChanged =
        prevStats.lineCount !== nextStats.lineCount ||
        prevStats.trailingNewlines !== nextStats.trailingNewlines;

      if (linebreakChanged) {
        const frameMeta = nextInlineFrameMeta();
        const node = elementRefs.current[currentId] || null;
        const nodeMetrics = obtenerMetricasNodoInline(node);

        const stage = stageRef.current?.getStage?.() || stageRef.current || null;
        let transformerRect = null;
        try {
          const transformer = stage?.findOne?.("Transformer");
          if (transformer) {
            const trRect = transformer.getClientRect({
              skipTransform: false,
              skipShadow: true,
              skipStroke: true,
            });
            const nodes = transformer.nodes?.() || [];
            transformerRect = trRect
              ? {
                  x: trRect.x,
                  y: trRect.y,
                  width: trRect.width,
                  height: trRect.height,
                  nodesCount: nodes.length,
                  includesEditingNode: !!(node && nodes.includes(node)),
                }
              : null;
          }
        } catch {
          transformerRect = null;
        }

        let overlayRect = null;
        let contentRect = null;
        const safeId = String(currentId).replace(/"/g, '\\"');
        const overlayEl = document.querySelector(`[data-inline-editor-id="${safeId}"]`);
        if (overlayEl) {
          const r = overlayEl.getBoundingClientRect();
          overlayRect = {
            x: r.x,
            y: r.y,
            width: r.width,
            height: r.height,
          };
          const contentEl = overlayEl.querySelector('[contenteditable="true"]');
          const cr = contentEl?.getBoundingClientRect?.();
          if (cr) {
            contentRect = {
              x: cr.x,
              y: cr.y,
              width: cr.width,
              height: cr.height,
            };
          }
        }

        inlineDebugLog("linebreak-transformer", {
          ...frameMeta,
          id: currentId,
          prevLength: prevStats.length,
          nextLength: nextStats.length,
          prevLineCount: prevStats.lineCount,
          nextLineCount: nextStats.lineCount,
          prevTrailingNewlines: prevStats.trailingNewlines,
          nextTrailingNewlines: nextStats.trailingNewlines,
          overlayMountedId: inlineOverlayMountedId ?? null,
          overlayRect,
          contentRect,
          nodeMetrics,
          transformerRect,
        });
      }

      captureInlineSnapshot("input: after-render", {
        id: currentId,
        previousLength: prev.value.length,
        valueLength: currentValue.length,
      });
    }

    inlineRenderValueRef.current = {
      id: currentId,
      value: currentValue,
    };
  }, [
    editing.id,
    editing.value,
    captureInlineSnapshot,
    inlineOverlayMountedId,
    obtenerMetricasNodoInline,
  ]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.__INLINE_DEBUG === undefined) {
      window.__INLINE_DEBUG = false;
    }
    if (window.__INLINE_MICROMOVE_DEBUG === undefined) {
      window.__INLINE_MICROMOVE_DEBUG = false;
    }
    if (window.__INLINE_FRAME_SEQ === undefined) {
      window.__INLINE_FRAME_SEQ = 0;
    }
    window.__INLINE_AB = { ...inlineDebugAB };
    inlineDebugLog("debug-enabled", {
      enabled: window.__INLINE_DEBUG,
      microMoveEnabled: window.__INLINE_MICROMOVE_DEBUG,
      inlineAB: window.__INLINE_AB,
      frameSeq: window.__INLINE_FRAME_SEQ,
    });
  }, [inlineDebugAB]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    if (!Array.isArray(window.__INLINE_TRACE)) {
      window.__INLINE_TRACE = [];
    }
    if (!window.__INLINE_TEST || typeof window.__INLINE_TEST !== "object") {
      window.__INLINE_TEST = {};
    }

    const fallbackRunMatrix = async (options = {}) => {
      const maxErrorPx = Number.isFinite(Number(options?.maxErrorPx))
        ? Number(options.maxErrorPx)
        : 0.5;
      const phases = new Set(["after-first-paint", "post-layout"]);
      const trace = Array.isArray(window.__INLINE_TRACE) ? [...window.__INLINE_TRACE] : [];
      const filtered = trace.filter((entry) => phases.has(entry?.phase || entry?.eventName));
      const failures = filtered.filter((entry) => {
        const dx = Math.abs(Number(entry?.dx || 0));
        const dy = Math.abs(Number(entry?.dy || 0));
        return dx > maxErrorPx || dy > maxErrorPx;
      });
      return {
        generatedAt: new Date().toISOString(),
        engine: "canvas-fallback",
        summary: {
          sampleCount: filtered.length,
          failures: failures.length,
          passRate:
            filtered.length > 0
              ? roundInlineMetric(((filtered.length - failures.length) / filtered.length) * 100, 2)
              : null,
          maxErrorPx,
        },
        sampleCount: trace.length,
        trace,
      };
    };

    const previousRunMatrix = window.__INLINE_TEST.runMatrix;
    if (typeof previousRunMatrix !== "function") {
      window.__INLINE_TEST.runMatrix = fallbackRunMatrix;
    }
    if (typeof window.__INLINE_TEST.clearTrace !== "function") {
      window.__INLINE_TEST.clearTrace = () => {
        window.__INLINE_TRACE = [];
        return true;
      };
    }

    return () => {
      if (window.__INLINE_TEST?.runMatrix === fallbackRunMatrix) {
        delete window.__INLINE_TEST.runMatrix;
      }
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    if (!window.__INLINE_TEST || typeof window.__INLINE_TEST !== "object") {
      window.__INLINE_TEST = {};
    }

    const findInlineProbeCandidate = (preferredId = null) => {
      if (preferredId) {
        const preferred = objetos.find((obj) => obj?.id === preferredId) || null;
        if (preferred && (
          preferred.tipo === "texto" ||
          (preferred.tipo === "forma" && preferred.figura === "rect" && typeof preferred.texto === "string")
        )) {
          return preferred;
        }
      }
      return (
        objetos.find((obj) => (
          obj?.tipo === "texto" ||
          (obj?.tipo === "forma" && obj?.figura === "rect" && typeof obj?.texto === "string")
        )) || null
      );
    };

    const startFirstTextEdit = async (options = {}) => {
      const preferredId = options?.id || null;
      const candidate = findInlineProbeCandidate(preferredId);
      if (!candidate) {
        return { ok: false, reason: "no-inline-text-candidate" };
      }
      try {
        await ensureInlineFontReady(candidate.fontFamily);
      } catch {
        // no-op
      }
      const id = candidate.id;
      const initialValue = String(candidate.texto ?? "");
      setInlineOverlayMountedId(null);
      setInlineSwapAck((prev) => ({
        id: null,
        sessionId: null,
        phase: "probe-reset",
        token: Number(prev?.token || 0) + 1,
        offsetY: 0,
      }));
      setCurrentInlineEditingId(id);
      flushSync(() => {
        startEdit(id, initialValue);
      });
      const node = elementRefs.current[id] || null;
      node?.draggable?.(false);
      node?.getLayer?.()?.batchDraw?.();
      return {
        ok: true,
        id,
        valueLength: initialValue.length,
      };
    };

    const setInlineValueForProbe = async (nextValue = "") => {
      if (!editing.id) {
        return { ok: false, reason: "no-active-inline-session" };
      }
      const safeValue = String(nextValue ?? "");
      flushSync(() => {
        updateEdit(safeValue);
      });
      return { ok: true, id: editing.id, valueLength: safeValue.length };
    };

    const finishInlineEditForProbe = async () => {
      const currentId = editing.id || null;
      if (!currentId) {
        return { ok: false, reason: "no-active-inline-session" };
      }
      flushSync(() => {
        finishEdit();
      });
      restoreElementDrag(currentId);
      clearCurrentInlineEditingIdIfMatches(currentId);
      setInlineOverlayMountedId((prev) => (prev === currentId ? null : prev));
      return { ok: true, id: currentId };
    };

    const getInlineProbeState = () => ({
      editingId: editing.id || null,
      overlayMountedId: inlineOverlayMountedId || null,
      objectsCount: objetos.length,
      textCandidateCount: objetos.filter((obj) => (
        obj?.tipo === "texto" ||
        (obj?.tipo === "forma" && obj?.figura === "rect" && typeof obj?.texto === "string")
      )).length,
    });

    window.__INLINE_TEST.startFirstTextEdit = startFirstTextEdit;
    window.__INLINE_TEST.setInlineValue = setInlineValueForProbe;
    window.__INLINE_TEST.finishInlineEdit = finishInlineEditForProbe;
    window.__INLINE_TEST.getProbeState = getInlineProbeState;

    return () => {
      if (window.__INLINE_TEST?.startFirstTextEdit === startFirstTextEdit) {
        delete window.__INLINE_TEST.startFirstTextEdit;
      }
      if (window.__INLINE_TEST?.setInlineValue === setInlineValueForProbe) {
        delete window.__INLINE_TEST.setInlineValue;
      }
      if (window.__INLINE_TEST?.finishInlineEdit === finishInlineEditForProbe) {
        delete window.__INLINE_TEST.finishInlineEdit;
      }
      if (window.__INLINE_TEST?.getProbeState === getInlineProbeState) {
        delete window.__INLINE_TEST.getProbeState;
      }
    };
  }, [
    editing.id,
    ensureInlineFontReady,
    finishEdit,
    inlineOverlayMountedId,
    objetos,
    restoreElementDrag,
    startEdit,
    updateEdit,
  ]);

  useInlineGlobalEditingSync({
    editing,
    inlineDebugLog,
  });


  return {
    inlineDebugAB,
    ensureInlineFontReady,
    captureInlineSnapshot,
    handleInlineOverlaySwapRequest,
  };
}

