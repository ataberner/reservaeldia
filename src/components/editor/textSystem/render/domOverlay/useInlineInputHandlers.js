import { useCallback } from "react";
import {
  getInlineLineStats,
  normalizeInlineEditableText,
} from "@/components/editor/overlays/inlineTextModel";

export default function useInlineInputHandlers({
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
  }, [emitDebug, normalizedValue, onChange]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === "Enter" && !e.isComposing) {
      e.stopPropagation();
    }
  }, []);

  const handleBlur = useCallback(() => {
    triggerFinish("blur");
  }, [triggerFinish]);

  return {
    handleInput,
    handleKeyDown,
    handleBlur,
  };
}
