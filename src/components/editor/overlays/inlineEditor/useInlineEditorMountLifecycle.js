import { useLayoutEffect, useEffect, useCallback } from "react";
import {
  getCurrentInlineEditingId,
  getInlineEditingSnapshot,
} from "@/components/editor/textSystem/bridges/window/inlineWindowBridge";

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
  setLayoutProbeRevision,
  normalizedFinishMode,
  onFinish,
}) {
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

    if (el instanceof HTMLInputElement) {
      el.value = initialText;
      emitDebug("overlay: before-focus");
      el.focus();
      const len = initialText.length;
      try {
        el.setSelectionRange(len, len);
      } catch {
        // no-op
      }
    } else {
      el.innerText = initialText;
      emitDebug("overlay: before-focus");
      el.focus();
      const range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    }

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setLayoutProbeRevision((prev) => prev + 1);
        requestAnimationFrame(() => {
          emitDebug("overlay: after-focus");
        });
      });
    });
    return () => {
      if (isPhaseAtomicV2 && typeof onOverlaySwapRequest === "function" && editingId) {
        const closingId = editingId;
        const closingSessionId = overlaySessionIdRef.current;
        const closingOffset = Number(v2OffsetOneShotPx || 0);
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
      onOverlaySwapRequest({
        id: editingId,
        sessionId: overlaySessionIdRef.current,
        phase: "finish_commit",
        offsetY: Number(v2OffsetOneShotPx || 0),
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
    v2OffsetOneShotPx,
  ]);

  return {
    triggerFinish,
  };
}
