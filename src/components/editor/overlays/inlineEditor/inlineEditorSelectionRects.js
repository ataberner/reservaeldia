function rectToPayload(rect) {
  if (!rect) return null;
  return {
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
  };
}

export function getFullRangeRect(el) {
  if (!el) return null;
  if (el instanceof HTMLInputElement) return null;
  try {
    const range = document.createRange();
    range.selectNodeContents(el);
    const rect = range.getBoundingClientRect();
    return rectToPayload(rect);
  } catch {
    return null;
  }
}

export function getSelectionRectInEditor(el) {
  if (!el || typeof window === "undefined") return { inEditor: false, rect: null };
  if (el instanceof HTMLInputElement) {
    const isFocused = document.activeElement === el;
    return {
      inEditor: isFocused,
      rect: isFocused ? rectToPayload(el.getBoundingClientRect()) : null,
    };
  }
  const sel = window.getSelection?.();
  if (!sel || sel.rangeCount === 0) return { inEditor: false, rect: null };
  try {
    const range = sel.getRangeAt(0);
    const startIn = el.contains(range.startContainer);
    const endIn = el.contains(range.endContainer);
    if (!startIn || !endIn) return { inEditor: false, rect: null };
    const rect = range.getBoundingClientRect();
    return { inEditor: true, rect: rectToPayload(rect) };
  } catch {
    return { inEditor: false, rect: null };
  }
}

export function getCollapsedCaretProbeRectInEditor(el) {
  if (!el || el instanceof HTMLInputElement || typeof window === "undefined") return null;
  const sel = window.getSelection?.();
  if (!sel || sel.rangeCount === 0) return null;
  try {
    const activeRange = sel.getRangeAt(0);
    if (!el.contains(activeRange.startContainer) || !el.contains(activeRange.endContainer)) {
      return null;
    }
    const probeRange = activeRange.cloneRange();
    probeRange.collapse(true);
    const rect = probeRange.getBoundingClientRect?.() || null;
    return rectToPayload(rect);
  } catch {
    return null;
  }
}

export function getFirstGlyphRectInEditor(el) {
  if (!el || el instanceof HTMLInputElement || typeof document === "undefined") return null;
  try {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let textNode = null;
    while (walker.nextNode()) {
      const node = walker.currentNode;
      const text = node?.nodeValue || "";
      if (text.length > 0) {
        textNode = node;
        break;
      }
    }
    if (!textNode) return null;
    const range = document.createRange();
    range.setStart(textNode, 0);
    range.setEnd(textNode, Math.min(1, textNode.nodeValue.length));
    return rectToPayload(range.getBoundingClientRect());
  } catch {
    return null;
  }
}
