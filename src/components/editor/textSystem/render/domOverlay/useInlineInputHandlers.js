import { useCallback, useRef } from "react";
import {
  getInlineLineStats,
  normalizeInlineEditableDomText,
  normalizeInlineEditableText,
} from "@/components/editor/overlays/inlineTextModel";
import {
  emitInlineFocusRcaEvent,
} from "@/components/editor/textSystem/debug/inlineFocusOperationalDebug";
import {
  normalizeEditablePlainTextStructure,
  resolveEditorRangeTextPosition,
} from "@/components/editor/textSystem/services/textCaretPositionService";

function getCollapsedSelectionRangeInsideEditor(editorEl) {
  if (!editorEl || typeof window === "undefined") return null;
  try {
    const selection = window.getSelection?.();
    if (!selection || selection.rangeCount <= 0) return null;
    const range = selection.getRangeAt(0);
    if (!range?.collapsed) return null;
    const startContainer = range.startContainer || null;
    const endContainer = range.endContainer || null;
    if (!startContainer || !endContainer) return null;
    const contains = typeof editorEl.contains === "function"
      ? editorEl.contains.bind(editorEl)
      : () => false;
    const startsInside = startContainer === editorEl || contains(startContainer);
    const endsInside = endContainer === editorEl || contains(endContainer);
    return startsInside && endsInside ? range : null;
  } catch {
    return null;
  }
}

export default function useInlineInputHandlers({
  editingId,
  editorRef,
  sessionIdRef,
  overlayPhase,
  normalizedValue,
  onDomLayoutValueChange,
  onChange,
  emitDebug,
  triggerFinish,
}) {
  const pendingStructuredSelectionRestoreRef = useRef({
    logicalOffset: null,
    textLength: null,
    inputType: null,
  });
  const handleInput = useCallback((e) => {
    const editorEl = e.currentTarget || null;
    const domRaw = String(editorEl?.innerText || "");
    const domNormalized = normalizeInlineEditableText(domRaw, {
      trimPhantomTrailingNewline: false,
    });
    const nextValue = normalizeInlineEditableDomText(domRaw, {
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
    const isComposing = Boolean(e?.nativeEvent?.isComposing || e?.isComposing);
    const inputType = String(e?.nativeEvent?.inputType || "");
    const isLineBreakInput =
      inputType === "insertParagraph" || inputType === "insertLineBreak";
    const pendingRestore = pendingStructuredSelectionRestoreRef.current || {};
    const preferredLogicalOffset =
      isLineBreakInput &&
      Number.isFinite(pendingRestore.logicalOffset) &&
      Number.isFinite(pendingRestore.textLength)
        ? Math.max(
          0,
          Number(pendingRestore.logicalOffset) +
            Math.max(0, domNormalized.length - Number(pendingRestore.textLength))
        )
        : null;
    const domStructureNormalization = isComposing
      ? {
        applied: false,
        restoredSelection: false,
        selectionLogicalOffset: null,
        resolvedSelectionLogicalOffset: null,
        appliedSelectionLogicalOffset: null,
        selectionAliasKind: null,
        hadStructuredContent: false,
      }
      : normalizeEditablePlainTextStructure(editorEl, domNormalized, {
        textLength: domNormalized.length,
        preserveSelection: true,
        preferredLogicalOffset,
        preferPreferredLogicalOffset: isLineBreakInput,
      });
    pendingStructuredSelectionRestoreRef.current = {
      logicalOffset: null,
      textLength: null,
      inputType: null,
    };

    onDomLayoutValueChange?.(domNormalized);
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
      normalizationChanged ||
      domStructureNormalization.applied
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
        domStructureNormalized: Boolean(domStructureNormalization.applied),
        domStructureHadMarkup: Boolean(domStructureNormalization.hadStructuredContent),
        domSelectionRestored: Boolean(domStructureNormalization.restoredSelection),
        domSelectionAliasKind: domStructureNormalization.selectionAliasKind || null,
        domResolvedSelectionLogicalOffset:
          Number.isFinite(domStructureNormalization.resolvedSelectionLogicalOffset)
            ? Number(domStructureNormalization.resolvedSelectionLogicalOffset)
            : null,
        domSelectionLogicalOffset:
          Number.isFinite(domStructureNormalization.selectionLogicalOffset)
            ? Number(domStructureNormalization.selectionLogicalOffset)
            : null,
        domAppliedSelectionLogicalOffset:
          Number.isFinite(domStructureNormalization.appliedSelectionLogicalOffset)
            ? Number(domStructureNormalization.appliedSelectionLogicalOffset)
            : null,
        domPreferredLogicalOffset:
          Number.isFinite(preferredLogicalOffset)
            ? Number(preferredLogicalOffset)
            : null,
      });
    }
  }, [
    editingId,
    editorRef,
    emitDebug,
    normalizedValue,
    onChange,
    onDomLayoutValueChange,
    overlayPhase,
    sessionIdRef,
  ]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === "Enter" && !e.isComposing) {
      const editorEl = editorRef?.current || null;
      const currentRawText = normalizeInlineEditableText(
        String(editorEl?.innerText || ""),
        { trimPhantomTrailingNewline: false }
      );
      const currentRange = getCollapsedSelectionRangeInsideEditor(editorEl);
      const currentPosition = currentRange
        ? resolveEditorRangeTextPosition(editorEl, currentRange)
        : null;
      const currentLogicalOffset = Number.isFinite(currentPosition?.logicalFocusOffset)
        ? Number(currentPosition.logicalFocusOffset)
        : (
          Number.isFinite(currentPosition?.logicalOffset)
            ? Number(currentPosition.logicalOffset)
            : null
        );
      pendingStructuredSelectionRestoreRef.current = {
        logicalOffset: currentLogicalOffset,
        textLength: currentRawText.length,
        inputType: "enter",
      };
      e.stopPropagation();
      return;
    }
    pendingStructuredSelectionRestoreRef.current = {
      logicalOffset: null,
      textLength: null,
      inputType: null,
    };
  }, [editorRef]);

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
