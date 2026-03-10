import {
  normalizeInlineEditableText,
} from "@/components/editor/overlays/inlineTextModel";

const HIDDEN_CARET_TEXT_MEASURE_HOST_ID = "__inline_caret_text_measure_host__";

function hasDocumentSelectionApi() {
  return (
    typeof document !== "undefined" &&
    typeof window !== "undefined" &&
    typeof window.getSelection === "function"
  );
}

function clearMeasureHost(hostEl) {
  if (!hostEl) return;
  while (hostEl.firstChild) {
    hostEl.removeChild(hostEl.firstChild);
  }
}

function getHiddenTextMeasureHost() {
  if (typeof document === "undefined") return null;
  const body = document.body || null;
  if (!body) return null;

  const existing = document.getElementById(HIDDEN_CARET_TEXT_MEASURE_HOST_ID);
  if (existing) return existing;

  const host = document.createElement("div");
  host.id = HIDDEN_CARET_TEXT_MEASURE_HOST_ID;
  host.setAttribute("aria-hidden", "true");
  Object.assign(host.style, {
    position: "fixed",
    left: "-99999px",
    top: "-99999px",
    opacity: "0",
    pointerEvents: "none",
    whiteSpace: "pre-wrap",
    margin: "0",
    padding: "0",
    border: "none",
  });
  body.appendChild(host);
  return host;
}

export function collectEditableTextNodes(rootEl) {
  if (!rootEl || typeof document === "undefined") return [];
  try {
    const showText = typeof NodeFilter !== "undefined" ? NodeFilter.SHOW_TEXT : 4;
    const walker = document.createTreeWalker(rootEl, showText);
    const nodes = [];
    while (walker.nextNode()) {
      nodes.push(walker.currentNode);
    }
    return nodes;
  } catch {
    return [];
  }
}

export function getEditableTextNodeLength(node) {
  return typeof node?.nodeValue === "string" ? node.nodeValue.length : 0;
}

export function clampEditableRangeOffset(node, rawOffset) {
  const numericOffset = Number.isFinite(rawOffset)
    ? Math.max(0, Math.floor(rawOffset))
    : 0;
  if (!node) return 0;
  if (node.nodeType === 3) {
    return Math.min(numericOffset, getEditableTextNodeLength(node));
  }
  return Math.min(numericOffset, node.childNodes?.length || 0);
}

export function normalizeEditableRawText(rawText) {
  return normalizeInlineEditableText(String(rawText ?? ""), {
    trimPhantomTrailingNewline: false,
  });
}

export function getCanonicalEditorText(editorEl) {
  return normalizeInlineEditableText(String(editorEl?.innerText || ""), {
    trimPhantomTrailingNewline: true,
  });
}

export function getCanonicalEditorTextLength(editorEl) {
  return getCanonicalEditorText(editorEl).length;
}

function readRenderedTextFromRange(range) {
  if (!range || typeof document === "undefined") return null;
  const host = getHiddenTextMeasureHost();
  if (!host) return null;
  try {
    clearMeasureHost(host);
    host.appendChild(range.cloneContents());
    return String(host.innerText || "");
  } catch {
    return null;
  } finally {
    clearMeasureHost(host);
  }
}

export function computeCanonicalTextOffset(
  editorEl,
  anchorNode,
  anchorOffset,
  { textLength = null } = {}
) {
  if (!editorEl || !anchorNode || typeof document === "undefined") return null;
  const safeTextLength = Number.isFinite(textLength)
    ? Math.max(0, Number(textLength))
    : getCanonicalEditorTextLength(editorEl);
  const safeOffset = clampEditableRangeOffset(anchorNode, anchorOffset);

  if (anchorNode === editorEl && safeOffset <= 0) {
    return 0;
  }
  if (
    anchorNode === editorEl &&
    safeOffset >= Number(editorEl.childNodes?.length || 0)
  ) {
    return safeTextLength;
  }

  try {
    const prefixRange = document.createRange();
    prefixRange.selectNodeContents(editorEl);
    prefixRange.setEnd(anchorNode, safeOffset);

    const renderedText = readRenderedTextFromRange(prefixRange);
    if (typeof renderedText === "string") {
      const canonicalPrefixLength = normalizeEditableRawText(renderedText).length;
      return Math.max(0, Math.min(canonicalPrefixLength, safeTextLength));
    }

    const fallbackText = normalizeEditableRawText(prefixRange.toString()).length;
    return Math.max(0, Math.min(fallbackText, safeTextLength));
  } catch {
    return null;
  }
}

function resolveAnchorAliasKind(editorEl, anchorNode, anchorOffset) {
  if (!editorEl || !anchorNode) return null;
  if (anchorNode.nodeType === 3) return null;

  const safeOffset = clampEditableRangeOffset(anchorNode, anchorOffset);
  if (anchorNode === editorEl) {
    const childCount = Number(editorEl.childNodes?.length || 0);
    if (childCount <= 0) return "root-empty";
    if (safeOffset <= 0) return "root-start";
    if (safeOffset >= childCount) return "root-end";
    return "root-interstitial";
  }

  if (
    anchorNode.nodeType === 1 &&
    typeof editorEl.contains === "function" &&
    editorEl.contains(anchorNode)
  ) {
    const childCount = Number(anchorNode.childNodes?.length || 0);
    if (childCount <= 0) return "element-empty";
    if (safeOffset <= 0) return "element-start";
    if (safeOffset >= childCount) return "element-end";
    return "element-interstitial";
  }

  return null;
}

export function resolveSelectionAliasKind(editorEl, range) {
  if (!editorEl || !range || !range.collapsed) return null;
  return resolveAnchorAliasKind(
    editorEl,
    range.startContainer || null,
    range.startOffset || 0
  );
}

export function resolveBoundaryCaretTarget(editorEl, boundary = "end") {
  if (!editorEl) {
    return {
      node: null,
      offset: null,
      strategy: "editor-missing",
    };
  }

  const textNodes = collectEditableTextNodes(editorEl).filter(
    (node) => getEditableTextNodeLength(node) > 0
  );
  if (textNodes.length <= 0) {
    return {
      node: editorEl,
      offset: 0,
      strategy: "empty-editor-root",
    };
  }

  if (boundary === "start") {
    return {
      node: textNodes[0],
      offset: 0,
      strategy: "boundary-start-text-node",
    };
  }

  const lastTextNode = textNodes[textNodes.length - 1];
  return {
    node: lastTextNode,
    offset: getEditableTextNodeLength(lastTextNode),
    strategy: "boundary-end-text-node",
  };
}

export function createCollapsedCaretRange(node, offset) {
  if (!node || typeof document === "undefined") return null;
  try {
    const range = document.createRange();
    range.setStart(node, clampEditableRangeOffset(node, offset));
    range.collapse(true);
    return range;
  } catch {
    return null;
  }
}

export function createBoundaryCaretRange(editorEl, boundary = "end") {
  const target = resolveBoundaryCaretTarget(editorEl, boundary);
  return {
    target,
    range: createCollapsedCaretRange(target.node, target.offset),
  };
}

function clampLogicalTextOffset(logicalOffset, textLength) {
  const numericOffset = Number(logicalOffset);
  const safeTextLength = Math.max(0, Number(textLength) || 0);
  if (!Number.isFinite(numericOffset)) return null;
  return Math.max(0, Math.min(safeTextLength, Math.floor(numericOffset)));
}

function resolveTextNodeLogicalOffsetBounds(editorEl, textNode, textLength) {
  if (!editorEl || !textNode) return null;
  const textNodeLength = getEditableTextNodeLength(textNode);
  const startLogicalOffset = computeCanonicalTextOffset(editorEl, textNode, 0, {
    textLength,
  });
  const endLogicalOffset = computeCanonicalTextOffset(
    editorEl,
    textNode,
    textNodeLength,
    { textLength }
  );
  if (
    !Number.isFinite(startLogicalOffset) ||
    !Number.isFinite(endLogicalOffset)
  ) {
    return null;
  }
  return {
    startLogicalOffset: Number(startLogicalOffset),
    endLogicalOffset: Number(endLogicalOffset),
    textNodeLength,
  };
}

function searchTextNodeOffsetForLogicalPosition(
  editorEl,
  textNode,
  targetLogicalOffset,
  textLength
) {
  const bounds = resolveTextNodeLogicalOffsetBounds(editorEl, textNode, textLength);
  if (!bounds) return null;

  const {
    startLogicalOffset,
    endLogicalOffset,
    textNodeLength,
  } = bounds;
  if (targetLogicalOffset <= startLogicalOffset) {
    return {
      offset: 0,
      strategy: "logical-node-start",
    };
  }
  if (targetLogicalOffset >= endLogicalOffset) {
    return {
      offset: textNodeLength,
      strategy: "logical-node-end",
    };
  }

  let low = 0;
  let high = textNodeLength;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    const midLogicalOffset = computeCanonicalTextOffset(
      editorEl,
      textNode,
      mid,
      { textLength }
    );
    if (!Number.isFinite(midLogicalOffset)) {
      return null;
    }
    if (midLogicalOffset < targetLogicalOffset) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }

  const resolvedOffset = clampEditableRangeOffset(textNode, low);
  const resolvedLogicalOffset = computeCanonicalTextOffset(
    editorEl,
    textNode,
    resolvedOffset,
    { textLength }
  );
  if (
    Number.isFinite(resolvedLogicalOffset) &&
    resolvedLogicalOffset > targetLogicalOffset &&
    resolvedOffset > 0
  ) {
    const previousOffset = resolvedOffset - 1;
    const previousLogicalOffset = computeCanonicalTextOffset(
      editorEl,
      textNode,
      previousOffset,
      { textLength }
    );
    if (Number(previousLogicalOffset) === targetLogicalOffset) {
      return {
        offset: previousOffset,
        strategy: "logical-node-binary-search-previous-exact",
      };
    }
  }

  return {
    offset: resolvedOffset,
    strategy: "logical-node-binary-search",
  };
}

export function resolveLogicalCaretTarget(
  editorEl,
  logicalOffset,
  { textLength = null } = {}
) {
  if (!editorEl) {
    return {
      logicalOffset: null,
      node: null,
      offset: null,
      strategy: "editor-missing",
      textLength: 0,
    };
  }

  const safeTextLength = Number.isFinite(textLength)
    ? Math.max(0, Number(textLength))
    : getCanonicalEditorTextLength(editorEl);
  const safeLogicalOffset = clampLogicalTextOffset(logicalOffset, safeTextLength);
  if (!Number.isFinite(safeLogicalOffset)) {
    return {
      logicalOffset: null,
      node: null,
      offset: null,
      strategy: "logical-offset-invalid",
      textLength: safeTextLength,
    };
  }

  const textNodes = collectEditableTextNodes(editorEl).filter(
    (node) => getEditableTextNodeLength(node) > 0
  );
  if (textNodes.length <= 0) {
    return {
      logicalOffset: 0,
      node: editorEl,
      offset: 0,
      strategy: "logical-empty-editor-root",
      textLength: 0,
    };
  }

  if (safeLogicalOffset <= 0) {
    const target = resolveBoundaryCaretTarget(editorEl, "start");
    return {
      logicalOffset: 0,
      node: target.node,
      offset: target.offset,
      strategy: "logical-start-boundary",
      textLength: safeTextLength,
    };
  }

  if (safeLogicalOffset >= safeTextLength) {
    const target = resolveBoundaryCaretTarget(editorEl, "end");
    return {
      logicalOffset: safeTextLength,
      node: target.node,
      offset: target.offset,
      strategy: "logical-end-boundary",
      textLength: safeTextLength,
    };
  }

  let previousTextNode = textNodes[0];
  for (const textNode of textNodes) {
    const bounds = resolveTextNodeLogicalOffsetBounds(
      editorEl,
      textNode,
      safeTextLength
    );
    if (!bounds) {
      previousTextNode = textNode;
      continue;
    }

    if (safeLogicalOffset < bounds.startLogicalOffset) {
      return {
        logicalOffset: safeLogicalOffset,
        node: previousTextNode,
        offset: getEditableTextNodeLength(previousTextNode),
        strategy: "logical-gap-previous-node-end",
        textLength: safeTextLength,
      };
    }

    if (safeLogicalOffset <= bounds.endLogicalOffset) {
      const nodeSearch = searchTextNodeOffsetForLogicalPosition(
        editorEl,
        textNode,
        safeLogicalOffset,
        safeTextLength
      );
      if (nodeSearch) {
        return {
          logicalOffset: safeLogicalOffset,
          node: textNode,
          offset: nodeSearch.offset,
          strategy: nodeSearch.strategy,
          textLength: safeTextLength,
        };
      }
    }

    previousTextNode = textNode;
  }

  const fallbackTarget = resolveBoundaryCaretTarget(editorEl, "end");
  return {
    logicalOffset: safeLogicalOffset,
    node: fallbackTarget.node,
    offset: fallbackTarget.offset,
    strategy: "logical-fallback-end-boundary",
    textLength: safeTextLength,
  };
}

export function createLogicalCaretRange(
  editorEl,
  logicalOffset,
  { textLength = null } = {}
) {
  const target = resolveLogicalCaretTarget(editorEl, logicalOffset, { textLength });
  return {
    target,
    range: createCollapsedCaretRange(target.node, target.offset),
  };
}

export function applySelectionRange(range) {
  if (!range || !hasDocumentSelectionApi()) return false;
  try {
    const selection = window.getSelection?.();
    if (!selection) return false;
    selection.removeAllRanges();
    selection.addRange(range);
    return true;
  } catch {
    return false;
  }
}

export function resolveEditorCaretTextPosition(
  editorEl,
  anchorNode,
  anchorOffset,
  { textLength = null } = {}
) {
  const safeTextLength = Number.isFinite(textLength)
    ? Math.max(0, Number(textLength))
    : getCanonicalEditorTextLength(editorEl);
  const safeOffset = clampEditableRangeOffset(anchorNode, anchorOffset);
  const logicalOffset = computeCanonicalTextOffset(editorEl, anchorNode, safeOffset, {
    textLength: safeTextLength,
  });
  const selectionAliasKind = resolveAnchorAliasKind(editorEl, anchorNode, safeOffset);

  if (!anchorNode) {
    return {
      logicalOffset,
      selectionAliasKind,
      resolvedNode: null,
      resolvedOffset: null,
      strategy: "anchor-missing",
      textLength: safeTextLength,
    };
  }

  if (anchorNode.nodeType === 3) {
    return {
      logicalOffset,
      selectionAliasKind,
      resolvedNode: anchorNode,
      resolvedOffset: safeOffset,
      strategy: "anchor-text-node",
      textLength: safeTextLength,
    };
  }

  if (selectionAliasKind === "root-empty") {
    return {
      logicalOffset: 0,
      selectionAliasKind,
      resolvedNode: editorEl,
      resolvedOffset: 0,
      strategy: "root-empty",
      textLength: 0,
    };
  }

  if (
    selectionAliasKind === "root-start" ||
    (Number.isFinite(logicalOffset) && logicalOffset <= 0)
  ) {
    const target = resolveBoundaryCaretTarget(editorEl, "start");
    return {
      logicalOffset: 0,
      selectionAliasKind,
      resolvedNode: target.node,
      resolvedOffset: target.offset,
      strategy: selectionAliasKind
        ? `${selectionAliasKind}-to-start-boundary`
        : target.strategy,
      textLength: safeTextLength,
    };
  }

  if (
    selectionAliasKind === "root-end" ||
    (Number.isFinite(logicalOffset) && logicalOffset >= safeTextLength)
  ) {
    const target = resolveBoundaryCaretTarget(editorEl, "end");
    return {
      logicalOffset: safeTextLength,
      selectionAliasKind,
      resolvedNode: target.node,
      resolvedOffset: target.offset,
      strategy: selectionAliasKind
        ? `${selectionAliasKind}-to-end-boundary`
        : target.strategy,
      textLength: safeTextLength,
    };
  }

  return {
    logicalOffset,
    selectionAliasKind,
    resolvedNode: null,
    resolvedOffset: null,
    strategy: selectionAliasKind
      ? `${selectionAliasKind}-logical-only`
      : "logical-only",
    textLength: safeTextLength,
  };
}

export function resolveEditorRangeTextPosition(editorEl, range) {
  if (!editorEl || !range) {
    return {
      logicalOffset: null,
      logicalFocusOffset: null,
      textLength: 0,
      selectionAliasKind: null,
      canonicalNode: null,
      canonicalOffset: null,
      canonicalNodeName: null,
      canonicalRange: null,
      canonicalStrategy: null,
    };
  }

  const textLength = getCanonicalEditorTextLength(editorEl);
  const caretPosition = resolveEditorCaretTextPosition(
    editorEl,
    range.startContainer || null,
    range.startOffset || 0,
    { textLength }
  );
  const logicalFocusOffset = computeCanonicalTextOffset(
    editorEl,
    range.endContainer || null,
    range.endOffset || 0,
    { textLength }
  );
  const canonicalRange = range.collapsed
    ? createCollapsedCaretRange(caretPosition.resolvedNode, caretPosition.resolvedOffset)
    : null;

  return {
    logicalOffset: Number.isFinite(caretPosition.logicalOffset)
      ? Number(caretPosition.logicalOffset)
      : null,
    logicalFocusOffset: Number.isFinite(logicalFocusOffset)
      ? Number(logicalFocusOffset)
      : null,
    textLength,
    selectionAliasKind: caretPosition.selectionAliasKind || null,
    canonicalNode: caretPosition.resolvedNode || null,
    canonicalOffset: Number.isFinite(caretPosition.resolvedOffset)
      ? Number(caretPosition.resolvedOffset)
      : null,
    canonicalNodeName: caretPosition.resolvedNode?.nodeName || null,
    canonicalRange,
    canonicalStrategy: caretPosition.strategy || null,
  };
}
