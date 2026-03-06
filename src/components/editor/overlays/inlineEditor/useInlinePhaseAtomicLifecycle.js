import { useEffect, useLayoutEffect } from "react";
import { roundMetric } from "@/components/editor/overlays/inlineEditor/inlineEditorNumeric";

export default function useInlinePhaseAtomicLifecycle({
  editingId,
  isPhaseAtomicV2,
  fontLoadStatusAvailable,
  domToKonvaOffsetApplied,
  onOverlaySwapRequest,
  swapAckToken,
  emitDebug,
  v2FontsReady,
  setV2FontsReady,
  v2OffsetComputed,
  setV2OffsetComputed,
  v2OffsetOneShotPx,
  setV2OffsetOneShotPx,
  v2SwapRequested,
  setV2SwapRequested,
  overlaySessionIdRef,
  swapAckSeenRef,
  setOverlayPhase,
  setEditorVisualReady,
  setLayoutProbeRevision,
}) {
  useEffect(() => {
    if (!isPhaseAtomicV2) return undefined;
    if (!editingId) return undefined;
    let cancelled = false;
    let timeoutId = 0;

    setOverlayPhase("prepare_fonts");
    const markReady = (reason) => {
      if (cancelled) return;
      setV2FontsReady(true);
      emitDebug("overlay: after-fonts-ready", {
        phase: "after-fonts-ready",
        reason,
        sessionId: overlaySessionIdRef.current,
        maxPrepareLatencyMs: 120,
      });
    };

    if (fontLoadStatusAvailable !== false) {
      markReady("fonts-ready");
      return () => {
        cancelled = true;
      };
    }

    timeoutId = window.setTimeout(() => {
      markReady("timeout-120ms");
    }, 120);

    return () => {
      cancelled = true;
      if (timeoutId) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [editingId, emitDebug, fontLoadStatusAvailable, isPhaseAtomicV2]);

  useEffect(() => {
    if (!isPhaseAtomicV2) return;
    if (!editingId) return;
    if (!v2FontsReady || v2OffsetComputed) return;

    setOverlayPhase("compute_offset");
    const offset = Number(domToKonvaOffsetApplied);
    setV2OffsetOneShotPx(Number.isFinite(offset) ? offset : 0);
    setV2OffsetComputed(true);
    setOverlayPhase("ready_to_swap");
  }, [
    domToKonvaOffsetApplied,
    editingId,
    isPhaseAtomicV2,
    v2FontsReady,
    v2OffsetComputed,
  ]);

  useLayoutEffect(() => {
    if (!isPhaseAtomicV2) return;
    if (!editingId) return;
    if (!v2OffsetComputed || v2SwapRequested) return;
    if (typeof onOverlaySwapRequest !== "function") return;

    const sessionId = overlaySessionIdRef.current || `${editingId}-${Date.now()}`;
    overlaySessionIdRef.current = sessionId;
    setV2SwapRequested(true);
    setOverlayPhase("ready_to_swap");
    emitDebug("overlay: ready-to-swap", {
      phase: "ready_to_swap",
      sessionId,
      offsetYApplied: roundMetric(Number(v2OffsetOneShotPx || 0)),
    });
    onOverlaySwapRequest({
      id: editingId,
      sessionId,
      phase: "ready_to_swap",
      offsetY: Number(v2OffsetOneShotPx || 0),
    });
  }, [
    editingId,
    emitDebug,
    isPhaseAtomicV2,
    onOverlaySwapRequest,
    v2OffsetComputed,
    v2OffsetOneShotPx,
    v2SwapRequested,
  ]);

  useLayoutEffect(() => {
    if (!isPhaseAtomicV2) return;
    if (!editingId) return;
    const token = Number(swapAckToken?.token || 0);
    if (!Number.isFinite(token) || token <= 0 || token === swapAckSeenRef.current) return;
    if (swapAckToken?.id !== editingId) return;
    if (swapAckToken?.sessionId !== overlaySessionIdRef.current) return;

    swapAckSeenRef.current = token;
    const phase = swapAckToken?.phase || null;
    if (phase === "swap-commit") {
      setOverlayPhase("active");
      setEditorVisualReady(true);
      emitDebug("overlay: swap-commit", {
        phase: "swap-commit",
        sessionId: overlaySessionIdRef.current,
        swapAckToken: token,
        offsetYApplied: roundMetric(Number(v2OffsetOneShotPx || 0)),
      });
      requestAnimationFrame(() => {
        setLayoutProbeRevision((prev) => prev + 1);
        emitDebug("overlay: after-first-paint", {
          phase: "after-first-paint",
          sessionId: overlaySessionIdRef.current,
          swapAckToken: token,
        });
      });
      return;
    }

    if (phase === "finish_commit" || phase === "done" || phase === "cancel") {
      setOverlayPhase("done");
    }
  }, [
    editingId,
    emitDebug,
    isPhaseAtomicV2,
    setLayoutProbeRevision,
    setEditorVisualReady,
    swapAckToken,
    v2OffsetOneShotPx,
  ]);
}
