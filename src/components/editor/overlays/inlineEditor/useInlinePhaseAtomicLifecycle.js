import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { roundMetric } from "@/components/editor/overlays/inlineEditor/inlineEditorNumeric";
import {
  emitInlineFocusRcaEvent,
} from "@/components/editor/textSystem/debug/inlineFocusOperationalDebug";

function isNearlyEqual(a, b, epsilon = 0.0001) {
  const left = Number(a);
  const right = Number(b);
  if (!Number.isFinite(left) || !Number.isFinite(right)) return false;
  return Math.abs(left - right) <= epsilon;
}

export default function useInlinePhaseAtomicLifecycle({
  editingId,
  isPhaseAtomicV2,
  fontLoadStatusAvailable,
  v2VerticalAuthoritySnapshot,
  onOverlaySwapRequest,
  swapAckToken,
  emitDebug,
  v2FontsReady,
  setV2FontsReady,
  v2OffsetComputed,
  v2OffsetOneShotPx,
  setV2OffsetOneShotPx,
  v2SwapRequested,
  setV2SwapRequested,
  overlaySessionIdRef,
  inlineOverlayMountSession,
  swapAckSeenRef,
  setOverlayPhase,
  setEditorVisualReady,
  setRenderAuthorityPhase,
  setCaretVisible,
  setLayoutProbeRevision,
}) {
  const emitDebugRef = useRef(emitDebug);
  const promotionRafIdsRef = useRef({
    previewReady: 0,
    previewPaint: 0,
    editableReady: 0,
    editablePaint: 0,
  });
  useLayoutEffect(() => {
    emitDebugRef.current = emitDebug;
  }, [emitDebug]);

  const emitDebugStable = useCallback((eventName, payload = {}) => {
    const debugEmitter = emitDebugRef.current;
    if (typeof debugEmitter === "function") {
      debugEmitter(eventName, payload);
    }
  }, []);
  const clearPromotionRafs = useCallback(() => {
    const pending = promotionRafIdsRef.current || {};
    if (pending.previewReady) window.cancelAnimationFrame(pending.previewReady);
    if (pending.previewPaint) window.cancelAnimationFrame(pending.previewPaint);
    if (pending.editableReady) window.cancelAnimationFrame(pending.editableReady);
    if (pending.editablePaint) window.cancelAnimationFrame(pending.editablePaint);
    promotionRafIdsRef.current = {
      previewReady: 0,
      previewPaint: 0,
      editableReady: 0,
      editablePaint: 0,
    };
  }, []);

  useEffect(() => clearPromotionRafs, [clearPromotionRafs]);

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
    setOverlayPhase,
    setV2FontsReady,
    v2OffsetComputed,
    v2SwapRequested,
    swapAckSeenRef,
    overlaySessionIdRef,
  ]);

  useLayoutEffect(() => {
    if (!isPhaseAtomicV2) return;
    if (!editingId) return;
    if (!v2OffsetComputed || v2SwapRequested) return;
    if (typeof onOverlaySwapRequest !== "function") return;
    if (!v2VerticalAuthoritySnapshot?.frozen) return;

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

    const authorityOffsetRaw = Number(v2VerticalAuthoritySnapshot?.visualOffsetPx || 0);
    const authorityOffset = Number.isFinite(authorityOffsetRaw) ? authorityOffsetRaw : 0;
    const authorityRevision = Number(v2VerticalAuthoritySnapshot?.revision || 0);
    const authoritySource = v2VerticalAuthoritySnapshot?.source || null;
    const authoritySpace = v2VerticalAuthoritySnapshot?.coordinateSpace || "content-ink";
    const oneShotOffsetRaw = Number(v2OffsetOneShotPx || 0);
    const oneShotOffset = Number.isFinite(oneShotOffsetRaw) ? oneShotOffsetRaw : 0;
    const offsetAtomicPass = isNearlyEqual(oneShotOffset, authorityOffset);
    if (!offsetAtomicPass) {
      setV2OffsetOneShotPx(authorityOffset);
      emitDebugStable("overlay: offset-atomic-corrected-before-swap", {
        phase: "ready_to_swap",
        sessionId,
        offsetAtOneShot: roundMetric(oneShotOffset),
        offsetAtAuthority: roundMetric(authorityOffset),
      });
    }

    const resolvedSwapOffset = authorityOffset;
    setV2SwapRequested(true);
    setOverlayPhase("ready_to_swap");
    emitDebugStable("overlay: ready-to-swap", {
      phase: "ready_to_swap",
      sessionId,
      authorityRevision: Number.isFinite(authorityRevision) ? authorityRevision : null,
      authorityFrozen: true,
      offsetSource: authoritySource,
      offsetSpace: authoritySpace,
      offsetAtReadyToSwap: roundMetric(resolvedSwapOffset),
      offsetYApplied: roundMetric(resolvedSwapOffset),
      invariantOffsetAtomicPass: offsetAtomicPass,
      offsetAtOneShot: roundMetric(oneShotOffset),
      renderAuthorityPhase: "konva",
      caretVisible: false,
      paintStable: false,
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
      offsetY: Number(resolvedSwapOffset || 0),
      offsetRevision: Number.isFinite(authorityRevision) ? authorityRevision : null,
      offsetSource: authoritySource,
      offsetSpace: authoritySpace,
      renderAuthority: "konva",
      caretVisible: false,
      paintStable: false,
    });
  }, [
    editingId,
    emitDebugStable,
    isPhaseAtomicV2,
    onOverlaySwapRequest,
    overlaySessionIdRef,
    setOverlayPhase,
    setV2OffsetOneShotPx,
    setV2SwapRequested,
    v2OffsetComputed,
    v2OffsetOneShotPx,
    v2SwapRequested,
    v2VerticalAuthoritySnapshot,
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

      const expectedRevision = Number(v2VerticalAuthoritySnapshot?.revision || 0);
      const expectedSource = v2VerticalAuthoritySnapshot?.source || null;
      const expectedSpace = v2VerticalAuthoritySnapshot?.coordinateSpace || "content-ink";
      const expectedOffsetRaw = Number(v2VerticalAuthoritySnapshot?.visualOffsetPx || 0);
      const expectedOffset = Number.isFinite(expectedOffsetRaw) ? expectedOffsetRaw : 0;
      const ackOffset = Number(swapAckToken?.offsetY);
      const ackRevision = Number(swapAckToken?.offsetRevision);
      const ackSource = swapAckToken?.offsetSource || null;
      const ackSpace = swapAckToken?.offsetSpace || null;
      const revisionMatches =
        !Number.isFinite(expectedRevision) ||
        expectedRevision <= 0 ||
        (Number.isFinite(ackRevision) && ackRevision === expectedRevision);
      const sourceMatches = !expectedSource || !ackSource || ackSource === expectedSource;
      const spaceMatches = !expectedSpace || !ackSpace || ackSpace === expectedSpace;
      const offsetMatches = isNearlyEqual(ackOffset, expectedOffset);
      const invariantOffsetAtomicPass =
        revisionMatches && sourceMatches && spaceMatches && offsetMatches;

      if (!invariantOffsetAtomicPass) {
        emitDebugStable("overlay: swap-commit-rejected-offset-mismatch", {
          phase: "swap-commit",
          sessionId: overlaySessionIdRef.current,
          swapAckToken: token,
          expectedRevision: Number.isFinite(expectedRevision) ? expectedRevision : null,
          ackRevision: Number.isFinite(ackRevision) ? ackRevision : null,
          expectedSource,
          ackSource,
          expectedSpace,
          ackSpace,
          expectedOffset: roundMetric(expectedOffset),
          ackOffset: roundMetric(ackOffset),
          invariantOffsetAtomicPass,
        });
        return;
      }

      swapAckSeenRef.current = token;
      setRenderAuthorityPhase("dom-preview");
      setCaretVisible(false);
      setOverlayPhase("dom_preview");
      setEditorVisualReady(true);
      emitDebugStable("overlay: swap-commit", {
        phase: "swap-commit",
        nextOverlayPhase: "dom_preview",
        sessionId: overlaySessionIdRef.current,
        swapAckToken: token,
        authorityRevision: Number.isFinite(expectedRevision) ? expectedRevision : null,
        authorityFrozen: true,
        offsetSource: expectedSource,
        offsetSpace: expectedSpace,
        offsetAtSwapCommit: roundMetric(expectedOffset),
        offsetYApplied: roundMetric(expectedOffset),
        invariantOffsetAtomicPass,
        renderAuthorityPhase: "dom-preview",
        caretVisible: false,
        paintStable: false,
      });
      emitInlineFocusRcaEvent("overlay-swap-commit", {
        editingId,
        overlayPhase: "dom_preview",
        extra: {
          sessionId: overlaySessionIdRef.current,
          swapAckToken: token,
        },
      });
      clearPromotionRafs();

      promotionRafIdsRef.current.previewReady = requestAnimationFrame(() => {
        if (overlaySessionIdRef.current !== swapAckToken?.sessionId) return;
        if (typeof onOverlaySwapRequest === "function") {
          onOverlaySwapRequest({
            id: editingId,
            sessionId: overlaySessionIdRef.current,
            phase: "preview_ready",
            offsetY: expectedOffset,
            offsetRevision: Number.isFinite(expectedRevision) ? expectedRevision : null,
            offsetSource: expectedSource,
            offsetSpace: expectedSpace,
            renderAuthority: "dom-preview",
            caretVisible: false,
            paintStable: true,
          });
        }
        promotionRafIdsRef.current.previewPaint = requestAnimationFrame(() => {
          if (overlaySessionIdRef.current !== swapAckToken?.sessionId) return;
          setLayoutProbeRevision((prev) => prev + 1);
          emitDebugStable("overlay: preview-ready", {
            phase: "preview-ready",
            sessionId: overlaySessionIdRef.current,
            swapAckToken: token,
            authorityRevision: Number.isFinite(expectedRevision) ? expectedRevision : null,
            authorityFrozen: true,
            offsetSource: expectedSource,
            offsetSpace: expectedSpace,
            offsetAtPreviewReady: roundMetric(expectedOffset),
            offsetYApplied: roundMetric(expectedOffset),
            invariantOffsetAtomicPass,
            renderAuthorityPhase: "dom-preview",
            caretVisible: false,
            paintStable: true,
          });
          emitDebugStable("overlay: after-first-paint", {
            phase: "after-first-paint",
            sessionId: overlaySessionIdRef.current,
            swapAckToken: token,
            authorityRevision: Number.isFinite(expectedRevision) ? expectedRevision : null,
            authorityFrozen: true,
            offsetSource: expectedSource,
            offsetSpace: expectedSpace,
            offsetAtFirstPaint: roundMetric(expectedOffset),
            offsetYApplied: roundMetric(expectedOffset),
            invariantOffsetAtomicPass,
            renderAuthorityPhase: "dom-preview",
            caretVisible: false,
            paintStable: true,
          });
          promotionRafIdsRef.current.editableReady = requestAnimationFrame(() => {
            if (overlaySessionIdRef.current !== swapAckToken?.sessionId) return;
            setRenderAuthorityPhase("dom-editable");
            setCaretVisible(true);
            setOverlayPhase("await_focus_claim");
            if (typeof onOverlaySwapRequest === "function") {
              onOverlaySwapRequest({
                id: editingId,
                sessionId: overlaySessionIdRef.current,
                phase: "editable_ready",
                offsetY: expectedOffset,
                offsetRevision: Number.isFinite(expectedRevision) ? expectedRevision : null,
                offsetSource: expectedSource,
                offsetSpace: expectedSpace,
                renderAuthority: "dom-editable",
                caretVisible: true,
                paintStable: true,
              });
            }
            promotionRafIdsRef.current.editablePaint = requestAnimationFrame(() => {
              if (overlaySessionIdRef.current !== swapAckToken?.sessionId) return;
              setLayoutProbeRevision((prev) => prev + 1);
              emitDebugStable("overlay: editable-ready", {
                phase: "editable-ready",
                sessionId: overlaySessionIdRef.current,
                swapAckToken: token,
                authorityRevision: Number.isFinite(expectedRevision) ? expectedRevision : null,
                authorityFrozen: true,
                offsetSource: expectedSource,
                offsetSpace: expectedSpace,
                offsetAtEditableReady: roundMetric(expectedOffset),
                offsetYApplied: roundMetric(expectedOffset),
                invariantOffsetAtomicPass,
                renderAuthorityPhase: "dom-editable",
                caretVisible: true,
                paintStable: true,
              });
            });
          });
        });
      });
    }

    if (phase === "finish_commit" || phase === "done" || phase === "cancel") {
      clearPromotionRafs();
      swapAckSeenRef.current = token;
      setOverlayPhase("done");
      setRenderAuthorityPhase("konva");
      setCaretVisible(false);
    }
  }, [
    editingId,
    clearPromotionRafs,
    emitDebugStable,
    inlineOverlayMountSession,
    isPhaseAtomicV2,
    onOverlaySwapRequest,
    overlaySessionIdRef,
    setCaretVisible,
    setEditorVisualReady,
    setLayoutProbeRevision,
    setOverlayPhase,
    setRenderAuthorityPhase,
    swapAckSeenRef,
    swapAckToken,
    v2OffsetOneShotPx,
    v2VerticalAuthoritySnapshot,
  ]);
}
