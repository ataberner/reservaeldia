import { useCallback } from "react";
import {
  getInlineLineStats,
  normalizeInlineEditableText,
} from "@/components/editor/overlays/inlineTextModel";
import {
  emitInlineFocusRcaEvent,
} from "@/components/editor/textSystem/debug/inlineFocusOperationalDebug";

export default function useInlineInputHandlers({
  editingId,
  editorRef,
  sessionIdRef,
  overlayPhase,
  normalizedValue,
  onChange,
  emitDebug,
  triggerFinish,
}) {
  const handleInput = useCallback((e) => {
    const domRaw = String(e.currentTarget.innerText || "");
    const domNormalized = normalizeInlineEditableText(domRaw, {
      trimPhantomTrailingNewline: false,
    });
    const nextValue = normalizeInlineEditableText(domRaw, {
      trimPhantomTrailingNewline: true,
    });
    const prevValue = normalizedValue;
    const prevStats = getInlineLineStats(prevValue, { canonical: true });
    const nextStats = getInlineLineStats(nextValue, { canonical: true });
    const domStats = getInlineLineStats(domNormalized, { canonical: false });
    const prevLineCount = prevStats.lineCount;
    const nextLineCount = nextStats.lineCount;
    const prevTrailingNewlines = prevStats.trailingNewlines;
    const nextTrailingNewlines = nextStats.trailingNewlines;
    const domLineCount = domStats.lineCount;
    const domTrailingNewlines = domStats.trailingNewlines;
    const normalizationChanged = domNormalized !== nextValue;

    onChange(nextValue);

    emitInlineFocusRcaEvent("input", {
      editingId,
      overlayPhase,
      editorEl: editorRef?.current || null,
      extra: {
        sessionId: sessionIdRef?.current || null,
        valueLength: nextValue.length,
      },
    });

    if (
      prevLineCount !== nextLineCount ||
      prevTrailingNewlines !== nextTrailingNewlines ||
      normalizationChanged
    ) {
      emitDebug("input: linebreak", {
        source: "unified-contentEditable",
        prevLength: prevValue.length,
        nextLength: nextValue.length,
        prevLineCount,
        nextLineCount,
        prevTrailingNewlines,
        nextTrailingNewlines,
        domLength: domNormalized.length,
        domLineCount,
        domTrailingNewlines,
        normalizationChanged,
      });
    }
  }, [editingId, editorRef, emitDebug, normalizedValue, onChange, overlayPhase, sessionIdRef]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === "Enter" && !e.isComposing) {
      e.stopPropagation();
    }
  }, []);

  const handleBlur = useCallback(() => {
    emitInlineFocusRcaEvent("blur", {
      editingId,
      overlayPhase,
      editorEl: editorRef?.current || null,
      extra: {
        sessionId: sessionIdRef?.current || null,
      },
    });
    triggerFinish("blur");
  }, [editingId, editorRef, overlayPhase, sessionIdRef, triggerFinish]);

  return {
    handleInput,
    handleKeyDown,
    handleBlur,
  };
}
