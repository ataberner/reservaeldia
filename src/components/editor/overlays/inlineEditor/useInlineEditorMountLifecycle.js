import { useLayoutEffect, useEffect, useCallback, useRef } from "react";
import {
  getCurrentInlineEditingId,
  getInlineEditingSnapshot,
} from "@/components/editor/textSystem/bridges/window/inlineWindowBridge";
import {
  emitInlineFocusRcaEvent,
} from "@/components/editor/textSystem/debug/inlineFocusOperationalDebug";

export default function useInlineEditorMountLifecycle({
  editorRef,
  editingId,
  isPhaseAtomicV2,
  clearPendingDoneDispatchForId,
  pendingDoneDispatchRef,
  emitDebug,
  setOverlayPhase,
  overlaySessionIdRef,
  normalizedValue,
  onChange,
  onOverlaySwapRequest,
  v2OffsetOneShotPx,
  v2VerticalAuthoritySnapshot,
  setLayoutProbeRevision,
  normalizedFinishMode,
  onFinish,
}) {
  const v2OffsetOneShotRef = useRef(v2OffsetOneShotPx);
  const v2VerticalAuthoritySnapshotRef = useRef(v2VerticalAuthoritySnapshot);
  useEffect(() => {
    v2OffsetOneShotRef.current = v2OffsetOneShotPx;
  }, [v2OffsetOneShotPx]);
  useEffect(() => {
    v2VerticalAuthoritySnapshotRef.current = v2VerticalAuthoritySnapshot;
  }, [v2VerticalAuthoritySnapshot]);

  // Inicializar contenido + foco + caret antes del primer paint visible
  useLayoutEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    clearPendingDoneDispatchForId(editingId || null);
    if (isPhaseAtomicV2) {
      setOverlayPhase("prepare_mount");
      emitDebug("overlay: before-show", {
        phase: "before-show",
        sessionId: overlaySessionIdRef.current,
      });
    }

    let initialText = normalizedValue;

    if (window._preFillChar) {
      initialText = (initialText || "") + window._preFillChar;
      onChange(initialText);
      window._preFillChar = null;
    }

    let cancelled = false;
    let retryRafId = 0;
    let layoutRaf1 = 0;
    let layoutRaf2 = 0;
    let afterFocusRaf = 0;
    const maxFocusAttempts = 1;
    let focusAttempts = 0;

    const isFocusedNow = () =>
      typeof document !== "undefined" && document.activeElement === el;

    const placeCaretAtEnd = () => {
      if (el instanceof HTMLInputElement) {
        const len = initialText.length;
        try {
          el.setSelectionRange(len, len);
        } catch {
          // no-op
        }
        return;
      }

      try {
        const range = document.createRange();
        range.selectNodeContents(el);
        range.collapse(false);
        const sel = window.getSelection?.();
        if (!sel) return;
        sel.removeAllRanges();
        sel.addRange(range);
      } catch {
        // no-op
      }
    };

    const focusAndSelect = (attempt) => {
      emitDebug("overlay: before-focus", { attempt });
      try {
        el.focus({ preventScroll: true });
      } catch {
        el.focus();
      }
      const focused = isFocusedNow();
      if (focused) {
        placeCaretAtEnd();
      }
      return focused;
    };

    if (el instanceof HTMLInputElement) {
      el.value = initialText;
    } else {
      el.innerText = initialText;
    }

    const finalizeLayoutProbe = ({ emitAfterFocus = true } = {}) => {
      layoutRaf1 = requestAnimationFrame(() => {
        if (cancelled) return;
        layoutRaf2 = requestAnimationFrame(() => {
          if (cancelled) return;
          setLayoutProbeRevision((prev) => prev + 1);
          if (!emitAfterFocus) return;
          afterFocusRaf = requestAnimationFrame(() => {
            if (cancelled) return;
            const focused = isFocusedNow();
            if (!focused) {
              emitDebug("overlay: after-focus-skipped", {
                attempt: focusAttempts,
                isFocused: false,
                reason: "no-focus-ownership",
              });
              return;
            }
            emitDebug("overlay: after-focus", {
              attempt: focusAttempts,
              isFocused: true,
            });
          });
        });
      });
    };

    const runFocusHandshake = () => {
      if (cancelled) return;
      focusAttempts += 1;
      const focused = focusAndSelect(focusAttempts);
      if (focused || focusAttempts >= maxFocusAttempts) {
        finalizeLayoutProbe();
        return;
      }
      retryRafId = requestAnimationFrame(runFocusHandshake);
    };

    if (isPhaseAtomicV2) {
      emitDebug("overlay: before-focus", {
        attempt: 0,
        skipped: true,
        reason: "await-semantic-ready-focus-authority",
      });
      emitInlineFocusRcaEvent("focus-mount-skipped-v2", {
        editingId,
        overlayPhase: "prepare_mount",
        editorEl: el,
        extra: {
          sessionId: overlaySessionIdRef.current || null,
          reason: "await-semantic-ready-focus-authority",
        },
      });
      finalizeLayoutProbe({ emitAfterFocus: false });
    } else {
      runFocusHandshake();
    }

    return () => {
      cancelled = true;
      if (retryRafId) window.cancelAnimationFrame(retryRafId);
      if (layoutRaf1) window.cancelAnimationFrame(layoutRaf1);
      if (layoutRaf2) window.cancelAnimationFrame(layoutRaf2);
      if (afterFocusRaf) window.cancelAnimationFrame(afterFocusRaf);
      if (isPhaseAtomicV2 && typeof onOverlaySwapRequest === "function" && editingId) {
        const closingId = editingId;
        const closingSessionId = overlaySessionIdRef.current;
        const closingSnapshot = v2VerticalAuthoritySnapshotRef.current;
        const closingOffset = Number(
          closingSnapshot?.visualOffsetPx ?? v2OffsetOneShotRef.current ?? 0
        );
        const closingOffsetRevision = Number(closingSnapshot?.revision || 0);
        const closingOffsetSource = closingSnapshot?.source || null;
        const closingOffsetSpace =
          closingSnapshot?.coordinateSpace || "content-ink";
        const timerId = window.setTimeout(() => {
          const pending = pendingDoneDispatchRef.current || {};
          if (Number(pending.timerId || 0) !== Number(timerId)) return;
          pendingDoneDispatchRef.current = {
            timerId: 0,
            id: null,
            sessionId: null,
          };
          onOverlaySwapRequest({
            id: closingId,
            sessionId: closingSessionId,
            phase: "done",
            offsetY: closingOffset,
            offsetRevision: Number.isFinite(closingOffsetRevision) && closingOffsetRevision > 0
              ? closingOffsetRevision
              : null,
            offsetSource: closingOffsetSource,
            offsetSpace: closingOffsetSpace,
          });
        }, 0);
        pendingDoneDispatchRef.current = {
          timerId,
          id: closingId,
          sessionId: closingSessionId,
        };
      }
      emitDebug("overlay: before-unmount");
      const closingId = editingId || null;
      requestAnimationFrame(() => {
        const safeId = String(closingId || "").replace(/"/g, '\\"');
        const overlayStillPresent = safeId
          ? Boolean(document.querySelector(`[data-inline-editor-id="${safeId}"]`))
          : false;
        emitDebug("overlay: after-unmount-raf", {
          id: closingId,
          overlayStillPresent,
          currentEditingId: getCurrentInlineEditingId(),
          globalEditingId: getInlineEditingSnapshot()?.id ?? null,
        });
      });
    };
  }, [clearPendingDoneDispatchForId, editingId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    el.scrollLeft = 0;
    el.scrollTop = 0;
  }, []);

  const triggerFinish = useCallback((trigger = "blur") => {
    if (isPhaseAtomicV2 && typeof onOverlaySwapRequest === "function" && editingId) {
      setOverlayPhase("finish_commit");
      const activeSnapshot = v2VerticalAuthoritySnapshotRef.current;
      onOverlaySwapRequest({
        id: editingId,
        sessionId: overlaySessionIdRef.current,
        phase: "finish_commit",
        offsetY: Number(activeSnapshot?.visualOffsetPx ?? v2OffsetOneShotRef.current ?? 0),
        offsetRevision:
          Number.isFinite(Number(activeSnapshot?.revision)) &&
          Number(activeSnapshot?.revision) > 0
            ? Number(activeSnapshot?.revision)
            : null,
        offsetSource: activeSnapshot?.source || null,
        offsetSpace: activeSnapshot?.coordinateSpace || "content-ink",
      });
    }
    emitDebug("finish: blur", {
      id: editingId || null,
      mode: normalizedFinishMode,
      trigger,
    });
    if (normalizedFinishMode === "immediate") {
      onFinish();
      return;
    }
    if (normalizedFinishMode === "raf") {
      requestAnimationFrame(() => {
        onFinish();
      });
      return;
    }
    setTimeout(onFinish, 100);
  }, [
    editingId,
    emitDebug,
    isPhaseAtomicV2,
    normalizedFinishMode,
    onFinish,
    onOverlaySwapRequest,
    overlaySessionIdRef,
    setOverlayPhase,
  ]);

  return {
    triggerFinish,
  };
}
