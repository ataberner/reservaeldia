import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { roundMetric } from "@/components/editor/overlays/inlineEditor/inlineEditorNumeric";
import {
  emitInlineFocusRcaEvent,
} from "@/components/editor/textSystem/debug/inlineFocusOperationalDebug";

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
  inlineOverlayMountSession,
  swapAckSeenRef,
  setOverlayPhase,
  setEditorVisualReady,
  setLayoutProbeRevision,
}) {
  const emitDebugRef = useRef(emitDebug);
  useEffect(() => {
    emitDebugRef.current = emitDebug;
  }, [emitDebug]);
  const emitDebugStable = useCallback((eventName, payload = {}) => {
    const debugEmitter = emitDebugRef.current;
    if (typeof debugEmitter === "function") {
      debugEmitter(eventName, payload);
    }
  }, []);

  useEffect(() => {
    if (!isPhaseAtomicV2) return undefined;
    if (!editingId) return undefined;
    if (v2SwapRequested || v2OffsetComputed || swapAckSeenRef.current > 0) {
      return undefined;
    }
    let cancelled = false;
    let timeoutId = 0;

    setOverlayPhase("prepare_fonts");
    const markReady = (reason) => {
      if (cancelled) return;
      setV2FontsReady(true);
      emitDebugStable("overlay: after-fonts-ready", {
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
  }, [
    editingId,
    emitDebugStable,
    fontLoadStatusAvailable,
    isPhaseAtomicV2,
    v2OffsetComputed,
    v2SwapRequested,
    swapAckSeenRef,
  ]);

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

    const previousSessionId = overlaySessionIdRef.current;
    const hasSessionForEditingId =
      typeof previousSessionId === "string" &&
      previousSessionId.startsWith(`${editingId}-`);
    const sessionId = hasSessionForEditingId
      ? previousSessionId
      : `${editingId}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    overlaySessionIdRef.current = sessionId;
    if (!hasSessionForEditingId) {
      emitInlineFocusRcaEvent("inline-session-start", {
        editingId,
        overlayPhase: "ready_to_swap",
        extra: {
          sessionId,
          engine: "phase_atomic_v2",
        },
      });
    }
    setV2SwapRequested(true);
    setOverlayPhase("ready_to_swap");
    emitDebugStable("overlay: ready-to-swap", {
      phase: "ready_to_swap",
      sessionId,
      offsetYApplied: roundMetric(Number(v2OffsetOneShotPx || 0)),
    });
    emitInlineFocusRcaEvent("overlay-ready-to-swap", {
      editingId,
      overlayPhase: "ready_to_swap",
      extra: {
        sessionId,
      },
    });
    onOverlaySwapRequest({
      id: editingId,
      sessionId,
      phase: "ready_to_swap",
      offsetY: Number(v2OffsetOneShotPx || 0),
    });
  }, [
    editingId,
    emitDebugStable,
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

    const phase = swapAckToken?.phase || null;
    if (phase === "swap-commit") {
      const mountSession = inlineOverlayMountSession || null;
      const isMountedForSession = Boolean(
        mountSession?.mounted &&
        mountSession?.swapCommitted &&
        mountSession?.id === editingId &&
        mountSession?.sessionId === overlaySessionIdRef.current
      );
      const mountSessionToken = Number(mountSession?.token || 0);
      const mountTokenMatches =
        !Number.isFinite(mountSessionToken) ||
        mountSessionToken <= 0 ||
        mountSessionToken === token;
      if (!isMountedForSession || !mountTokenMatches) {
        emitDebugStable("overlay: swap-commit-wait-mount-session", {
          phase: "swap-commit-wait-mount-session",
          sessionId: overlaySessionIdRef.current,
          swapAckToken: token,
          mountSessionId: mountSession?.sessionId || null,
          mountSessionToken: Number.isFinite(mountSessionToken) ? mountSessionToken : null,
          mountSessionMounted: Boolean(mountSession?.mounted),
          mountSessionSwapCommitted: Boolean(mountSession?.swapCommitted),
        });
        return;
      }
      swapAckSeenRef.current = token;
      setOverlayPhase("await_focus_claim");
      setEditorVisualReady(true);
      emitDebugStable("overlay: swap-commit", {
        phase: "swap-commit",
        nextOverlayPhase: "await_focus_claim",
        sessionId: overlaySessionIdRef.current,
        swapAckToken: token,
        offsetYApplied: roundMetric(Number(v2OffsetOneShotPx || 0)),
      });
      emitInlineFocusRcaEvent("overlay-swap-commit", {
        editingId,
        overlayPhase: "await_focus_claim",
        extra: {
          sessionId: overlaySessionIdRef.current,
          swapAckToken: token,
        },
      });
      requestAnimationFrame(() => {
        setLayoutProbeRevision((prev) => prev + 1);
        emitDebugStable("overlay: after-first-paint", {
          phase: "after-first-paint",
          sessionId: overlaySessionIdRef.current,
          swapAckToken: token,
        });
      });
      return;
    }

    if (phase === "finish_commit" || phase === "done" || phase === "cancel") {
      swapAckSeenRef.current = token;
      setOverlayPhase("done");
    }
  }, [
    editingId,
    emitDebugStable,
    inlineOverlayMountSession,
    isPhaseAtomicV2,
    setLayoutProbeRevision,
    setEditorVisualReady,
    swapAckToken,
    v2OffsetOneShotPx,
  ]);
}
