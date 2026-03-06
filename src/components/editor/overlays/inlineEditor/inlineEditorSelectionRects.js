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
  let originalRange = null;
  let marker = null;
  try {
    const activeRange = sel.getRangeAt(0);
    if (!el.contains(activeRange.startContainer) || !el.contains(activeRange.endContainer)) {
      return null;
    }
    originalRange = activeRange.cloneRange();
    const probeRange = activeRange.cloneRange();
    probeRange.collapse(true);

    marker = document.createElement("span");
    marker.textContent = "\u200b";
    marker.style.display = "inline-block";
    marker.style.width = "0px";
    marker.style.padding = "0";
    marker.style.margin = "0";
    marker.style.border = "0";
    marker.style.lineHeight = "1";
    marker.style.pointerEvents = "none";

    probeRange.insertNode(marker);
    const rect = marker.getBoundingClientRect();

    if (marker.parentNode) {
      marker.parentNode.removeChild(marker);
      marker.parentNode?.normalize?.();
    }
    sel.removeAllRanges();
    sel.addRange(originalRange);
    return rectToPayload(rect);
  } catch {
    try {
      if (marker?.parentNode) {
        marker.parentNode.removeChild(marker);
      }
      if (originalRange && sel) {
        sel.removeAllRanges();
        sel.addRange(originalRange);
      }
    } catch {
      // no-op
    }
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
