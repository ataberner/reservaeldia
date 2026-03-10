import {
  getInlineKonvaProjectedRectViewport as getInlineKonvaProjectedRectViewportShared,
  resolveInlineKonvaTextNode as resolveInlineKonvaTextNodeShared,
} from "@/components/editor/overlays/inlineGeometry";
import {
  getInlineLineStats as getInlineLineStatsShared,
} from "@/components/editor/overlays/inlineTextModel";
import {
  clampEditableRangeOffset as clampInlineRangeOffsetShared,
  collectEditableTextNodes as collectInlineTextNodesShared,
  computeCanonicalTextOffset as computeInlineGlobalTextOffsetShared,
  getEditableTextNodeLength as getInlineTextNodeLengthShared,
  resolveEditorCaretTextPosition as resolveInlineCaretTextPositionShared,
} from "@/components/editor/textSystem/services/textCaretPositionService";

export function isInlineDebugEnabled() {
  return typeof window !== "undefined" && window.__INLINE_DEBUG !== false;
}

export function isInlineMicroMoveDebugEnabled() {
  return typeof window !== "undefined" && window.__INLINE_MICROMOVE_DEBUG === true;
}

export function formatInlineLogPayload(payload = {}) {
  try {
    return JSON.stringify(payload, null, 2);
  } catch (error) {
    return String(error || payload);
  }
}

export function inlineDebugLog(event, payload = {}) {
  if (!isInlineDebugEnabled()) return;
  const microMoveEnabled = isInlineMicroMoveDebugEnabled();
  const microMoveEvents = new Set([
    "snapshot-overlay: pre-focus-call",
    "snapshot-overlay: post-focus-sync",
    "snapshot-overlay: before-show",
    "snapshot-overlay: after-show-sync",
    "snapshot-overlay: after-show-raf1",
    "snapshot-konva: before-hide",
    "snapshot-konva: after-hide-sync",
    "snapshot-konva: after-hide-raf1",
    "snapshot-selection-set",
    "snapshot-konva-hide-before-applied",
    "snapshot-konva-hide-applied",
  ]);
  const shouldLog = microMoveEnabled && microMoveEvents.has(event);
  if (!shouldLog) return;
  const ts = new Date().toISOString();
  const body = formatInlineLogPayload(payload);
  console.log(`[INLINE][${ts}] ${event}\n${body}`);
}

export function nextInlineFrameMeta() {
  if (typeof window === "undefined") {
    return { frame: null, perfMs: null };
  }
  const prev = Number(window.__INLINE_FRAME_SEQ || 0);
  const next = prev + 1;
  window.__INLINE_FRAME_SEQ = next;
  const perfMs =
    typeof window.performance?.now === "function"
      ? Number(window.performance.now().toFixed(3))
      : null;
  return { frame: next, perfMs };
}

export function roundInlineMetric(value, digits = 4) {
  return Number.isFinite(value) ? Number(value.toFixed(digits)) : null;
}

export function rectToInlinePayload(rect) {
  if (!rect) return null;
  return {
    x: roundInlineMetric(Number(rect.x)),
    y: roundInlineMetric(Number(rect.y)),
    width: roundInlineMetric(Number(rect.width)),
    height: roundInlineMetric(Number(rect.height)),
  };
}

export function computeInlineRectDelta(prevRect, nextRect) {
  if (!prevRect || !nextRect) return null;
  return {
    dx: roundInlineMetric(Number(nextRect.x) - Number(prevRect.x)),
    dy: roundInlineMetric(Number(nextRect.y) - Number(prevRect.y)),
    dw: roundInlineMetric(Number(nextRect.width) - Number(prevRect.width)),
    dh: roundInlineMetric(Number(nextRect.height) - Number(prevRect.height)),
  };
}

export function isInlineRectEmpty(rect) {
  if (!rect) return true;
  const x = Number(rect.x);
  const y = Number(rect.y);
  const width = Number(rect.width);
  const height = Number(rect.height);
  if (![x, y, width, height].every(Number.isFinite)) return true;
  const eps = 0.001;
  return (
    Math.abs(x) <= eps &&
    Math.abs(y) <= eps &&
    Math.abs(width) <= eps &&
    Math.abs(height) <= eps
  );
}

export function pickInlinePrimaryRect(rangeRect, firstClientRect) {
  if (!isInlineRectEmpty(firstClientRect)) return firstClientRect;
  if (!isInlineRectEmpty(rangeRect)) return rangeRect;
  return null;
}

export function collectInlineTextNodes(rootEl) {
  return collectInlineTextNodesShared(rootEl);
}

export function getInlineTextNodeLength(node) {
  return getInlineTextNodeLengthShared(node);
}

export function clampInlineRangeOffset(node, rawOffset) {
  return clampInlineRangeOffsetShared(node, rawOffset);
}

export function computeInlineGlobalTextOffset(rootEl, anchorNode, anchorOffset) {
  return computeInlineGlobalTextOffsetShared(rootEl, anchorNode, anchorOffset);
}

export function resolveInlineCaretTextPosition(rootEl, anchorNode, anchorOffset) {
  const resolved = resolveInlineCaretTextPositionShared(
    rootEl,
    anchorNode,
    anchorOffset
  );
  return {
    resolvedNode: resolved?.resolvedNode || null,
    resolvedOffset: Number.isFinite(resolved?.resolvedOffset)
      ? Number(resolved.resolvedOffset)
      : null,
    strategy: resolved?.strategy || "unresolved",
  };
}

export function measureInlineRangeRects(range) {
  if (!range) return { rangeRect: null, firstClientRect: null };
  let rangeRect = null;
  let firstClientRect = null;
  try {
    rangeRect = rectToInlinePayload(range.getBoundingClientRect());
  } catch {
    rangeRect = null;
  }
  try {
    const rects = range.getClientRects?.();
    firstClientRect = rects && rects.length > 0 ? rectToInlinePayload(rects[0]) : null;
  } catch {
    firstClientRect = null;
  }
  return { rangeRect, firstClientRect };
}

export function buildInlineCaretFallbackRange(rootEl, resolvedNode, resolvedOffset) {
  if (typeof document === "undefined") {
    return {
      range: null,
      fallbackUsed: false,
      fallbackDirection: null,
      fallbackReason: "document-unavailable",
    };
  }

  const nodeLen = getInlineTextNodeLength(resolvedNode);
  if (resolvedNode && nodeLen > 0) {
    const safeOffset = clampInlineRangeOffset(resolvedNode, resolvedOffset);
    const fallbackRange = document.createRange();
    if (safeOffset > 0) {
      fallbackRange.setStart(resolvedNode, safeOffset - 1);
      fallbackRange.setEnd(resolvedNode, safeOffset);
      return {
        range: fallbackRange,
        fallbackUsed: true,
        fallbackDirection: "before",
        fallbackReason: "collapsed-caret-empty",
      };
    }
    if (safeOffset < nodeLen) {
      fallbackRange.setStart(resolvedNode, safeOffset);
      fallbackRange.setEnd(resolvedNode, safeOffset + 1);
      return {
        range: fallbackRange,
        fallbackUsed: true,
        fallbackDirection: "after",
        fallbackReason: "collapsed-caret-empty",
      };
    }
  }

  const textNodes = collectInlineTextNodes(rootEl).filter(
    (node) => getInlineTextNodeLength(node) > 0
  );
  if (textNodes.length > 0) {
    const firstTextNode = textNodes[0];
    const fallbackRange = document.createRange();
    fallbackRange.setStart(firstTextNode, 0);
    fallbackRange.setEnd(firstTextNode, Math.min(1, getInlineTextNodeLength(firstTextNode)));
    return {
      range: fallbackRange,
      fallbackUsed: true,
      fallbackDirection: "first-char",
      fallbackReason: "collapsed-caret-empty-no-local-char",
    };
  }

  return {
    range: null,
    fallbackUsed: false,
    fallbackDirection: null,
    fallbackReason: "fallback-no-text-available",
  };
}

export function getInlineEdgeCharTarget(rootEl, edge = "first") {
  const textNodes = collectInlineTextNodes(rootEl).filter(
    (node) => getInlineTextNodeLength(node) > 0
  );
  if (textNodes.length === 0) return null;
  const searchFirst = edge !== "last";
  const nodes = searchFirst ? textNodes : [...textNodes].reverse();

  for (const textNode of nodes) {
    const text = textNode.nodeValue || "";
    if (!text) continue;
    if (searchFirst) {
      for (let i = 0; i < text.length; i += 1) {
        if (/\S/.test(text[i])) return { node: textNode, offset: i, char: text[i] };
      }
    } else {
      for (let i = text.length - 1; i >= 0; i -= 1) {
        if (/\S/.test(text[i])) return { node: textNode, offset: i, char: text[i] };
      }
    }
  }

  if (searchFirst) {
    const firstNode = textNodes[0];
    return {
      node: firstNode,
      offset: 0,
      char: firstNode.nodeValue?.[0] || "",
    };
  }

  const lastNode = textNodes[textNodes.length - 1];
  const lastOffset = Math.max(0, getInlineTextNodeLength(lastNode) - 1);
  return {
    node: lastNode,
    offset: lastOffset,
    char: lastNode.nodeValue?.[lastOffset] || "",
  };
}

export function getInlineInkCharMetrics(rootEl, edge = "first") {
  if (
    !rootEl ||
    rootEl instanceof HTMLInputElement ||
    rootEl instanceof HTMLTextAreaElement ||
    typeof document === "undefined"
  ) {
    return {
      available: false,
      edge,
      nodeName: null,
      offset: null,
      char: null,
      rangeRect: null,
      firstClientRect: null,
      inkRect: null,
    };
  }

  const target = getInlineEdgeCharTarget(rootEl, edge);
  if (!target?.node) {
    return {
      available: false,
      edge,
      nodeName: null,
      offset: null,
      char: null,
      rangeRect: null,
      firstClientRect: null,
      inkRect: null,
    };
  }

  try {
    const range = document.createRange();
    const safeStart = clampInlineRangeOffset(target.node, target.offset);
    const safeEnd = clampInlineRangeOffset(target.node, safeStart + 1);
    range.setStart(target.node, safeStart);
    range.setEnd(target.node, Math.max(safeEnd, safeStart));
    const measured = measureInlineRangeRects(range);
    const inkRect = pickInlinePrimaryRect(measured.rangeRect, measured.firstClientRect);
    return {
      available: Boolean(inkRect),
      edge,
      nodeName: target.node.nodeName || null,
      offset: safeStart,
      char: target.char ?? null,
      rangeRect: measured.rangeRect,
      firstClientRect: measured.firstClientRect,
      inkRect,
    };
  } catch {
    return {
      available: false,
      edge,
      nodeName: target.node.nodeName || null,
      offset: Number.isFinite(target.offset) ? target.offset : null,
      char: target.char ?? null,
      rangeRect: null,
      firstClientRect: null,
      inkRect: null,
    };
  }
}

export function buildInlineInkCenterRect(firstRect, lastRect) {
  const first = firstRect || null;
  const last = lastRect || null;
  if (!first && !last) return null;
  const a = first || last;
  const b = last || first;
  const centerAX = Number(a.x) + Number(a.width) / 2;
  const centerAY = Number(a.y) + Number(a.height) / 2;
  const centerBX = Number(b.x) + Number(b.width) / 2;
  const centerBY = Number(b.y) + Number(b.height) / 2;
  if (![centerAX, centerAY, centerBX, centerBY].every(Number.isFinite)) return null;
  return {
    x: roundInlineMetric((centerAX + centerBX) / 2),
    y: roundInlineMetric((centerAY + centerBY) / 2),
    width: 0,
    height: 0,
  };
}

export function getInlineLineBoxRect(rootEl) {
  if (
    !rootEl ||
    rootEl instanceof HTMLInputElement ||
    rootEl instanceof HTMLTextAreaElement ||
    typeof document === "undefined"
  ) {
    return null;
  }
  try {
    const range = document.createRange();
    range.selectNodeContents(rootEl);
    const rects = range.getClientRects?.();
    if (rects && rects.length > 0) return rectToInlinePayload(rects[0]);
    return rectToInlinePayload(range.getBoundingClientRect());
  } catch {
    return null;
  }
}

export function resolveInlineKonvaTextNode(node, stage) {
  return resolveInlineKonvaTextNodeShared(node, stage);
}

export function getInlineKonvaProjectedRectViewport(node, stage, escalaVisual = 1) {
  return getInlineKonvaProjectedRectViewportShared(node, stage, escalaVisual);
}

export function getInlineSelectionCaretMetrics(rootEl) {
  const emptySelection = {
    anchorOffset: null,
    focusOffset: null,
    isCollapsed: null,
    anchorNodeName: null,
    anchorInEditor: null,
  };

  if (
    typeof window === "undefined" ||
    typeof document === "undefined" ||
    typeof window.getSelection !== "function"
  ) {
    return {
      selection: emptySelection,
      caretResolvedNodeName: null,
      resolvedOffset: null,
      resolveStrategy: null,
      usedFallback: false,
      fallbackDirection: null,
      fallbackReason: null,
      caretRangeRect: null,
      caretFirstClientRect: null,
      caretRect: null,
      caretProxyRect: null,
      caretHeight: null,
      caretHasRects: false,
      hasMetrics: false,
      missingReason: "selection-api-unavailable",
    };
  }

  const selection = window.getSelection();
  if (!selection) {
    return {
      selection: emptySelection,
      caretResolvedNodeName: null,
      resolvedOffset: null,
      resolveStrategy: null,
      usedFallback: false,
      fallbackDirection: null,
      fallbackReason: null,
      caretRangeRect: null,
      caretFirstClientRect: null,
      caretRect: null,
      caretProxyRect: null,
      caretHeight: null,
      caretHasRects: false,
      hasMetrics: false,
      missingReason: "selection-null",
    };
  }

  const anchorNode = selection.anchorNode || null;
  const anchorOffset = Number.isFinite(selection.anchorOffset)
    ? selection.anchorOffset
    : null;
  const focusOffset = Number.isFinite(selection.focusOffset)
    ? selection.focusOffset
    : null;
  const isCollapsed =
    typeof selection.isCollapsed === "boolean" ? selection.isCollapsed : null;
  const anchorInEditor =
    !!rootEl &&
    !!anchorNode &&
    typeof rootEl.contains === "function" &&
    rootEl.contains(anchorNode);

  const selectionSnapshot = {
    anchorOffset,
    focusOffset,
    isCollapsed,
    anchorNodeName: anchorNode?.nodeName || null,
    anchorInEditor,
  };

  if (!anchorNode) {
    return {
      selection: selectionSnapshot,
      caretResolvedNodeName: null,
      resolvedOffset: null,
      resolveStrategy: null,
      usedFallback: false,
      fallbackDirection: null,
      fallbackReason: null,
      caretRangeRect: null,
      caretFirstClientRect: null,
      caretRect: null,
      caretProxyRect: null,
      caretHeight: null,
      caretHasRects: false,
      hasMetrics: false,
      missingReason: "anchor-node-missing",
    };
  }

  const resolved = resolveInlineCaretTextPosition(rootEl, anchorNode, anchorOffset);
  const resolvedNode = resolved.resolvedNode || null;
  const resolvedOffset = Number.isFinite(resolved.resolvedOffset)
    ? resolved.resolvedOffset
    : clampInlineRangeOffset(anchorNode, anchorOffset);

  let caretRange = null;
  try {
    caretRange = document.createRange();
    if (resolvedNode) {
      caretRange.setStart(
        resolvedNode,
        clampInlineRangeOffset(resolvedNode, resolvedOffset)
      );
    } else {
      caretRange.setStart(anchorNode, clampInlineRangeOffset(anchorNode, anchorOffset));
    }
    caretRange.collapse(true);
  } catch {
    caretRange = null;
  }

  const measured = measureInlineRangeRects(caretRange);
  const caretRangeRect = measured.rangeRect;
  const caretFirstClientRect = measured.firstClientRect;
  const caretRect = pickInlinePrimaryRect(caretRangeRect, caretFirstClientRect);
  const caretHasRects = Boolean(caretRect);

  let usedFallback = false;
  let fallbackDirection = null;
  let fallbackReason = null;
  let caretProxyRect = null;
  if (!caretHasRects && selectionSnapshot.anchorInEditor) {
    const fallback = buildInlineCaretFallbackRange(rootEl, resolvedNode, resolvedOffset);
    const fallbackMeasured = measureInlineRangeRects(fallback.range);
    const proxyRect = pickInlinePrimaryRect(
      fallbackMeasured.rangeRect,
      fallbackMeasured.firstClientRect
    );
    if (proxyRect) {
      usedFallback = true;
      fallbackDirection = fallback.fallbackDirection;
      fallbackReason = fallback.fallbackReason;
      caretProxyRect = proxyRect;
    } else if (fallback.fallbackUsed) {
      usedFallback = true;
      fallbackDirection = fallback.fallbackDirection;
      fallbackReason = `${fallback.fallbackReason}-no-usable-rect`;
    } else {
      fallbackReason = fallback.fallbackReason;
    }
  }

  return {
    selection: selectionSnapshot,
    caretResolvedNodeName: resolvedNode?.nodeName || anchorNode?.nodeName || null,
    resolvedOffset,
    resolveStrategy: resolved.strategy || null,
    usedFallback,
    fallbackDirection,
    fallbackReason,
    caretRangeRect,
    caretFirstClientRect,
    caretRect,
    caretProxyRect,
    caretHeight: Number.isFinite(caretRect?.height) ? caretRect.height : null,
    caretHasRects,
    hasMetrics: caretHasRects,
    missingReason: caretHasRects
      ? null
      : (!selectionSnapshot.anchorInEditor
        ? "caret-outside-editor"
        : (caretRange ? "caret-range-rect-empty" : "caret-range-error")),
  };
}

export function getInlineLineStats(value) {
  return getInlineLineStatsShared(value, {
    canonical: true,
    trimPhantomTrailingNewline: true,
  });
}

export function normalizeInlineDebugAB(rawConfig) {
  const raw = rawConfig && typeof rawConfig === "object" ? rawConfig : {};

  const visibilitySource =
    raw.visibilitySource === "window" ? "window" : "reactive";

  const finishMode =
    raw.finishMode === "immediate" ||
    raw.finishMode === "raf" ||
    raw.finishMode === "timeout100"
      ? raw.finishMode
      : "raf";

  const overlayWidthMode =
    raw.overlayWidthMode === "fit-content" ? "fit-content" : "measured";

  const overlayEngine = "phase_atomic_v2";

  return {
    visibilitySource,
    finishMode,
    overlayWidthMode,
    overlayEngine,
  };
}
