function rectToPayload(rect) {
  if (!rect) return null;
  return {
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
  };
}

function isUsableDomRect(rect) {
  if (!rect) return false;
  const x = Number(rect.x);
  const y = Number(rect.y);
  const width = Number(rect.width);
  const height = Number(rect.height);
  return [x, y, width, height].every(Number.isFinite) && width >= 0 && height >= 0;
}

function unionClientRects(rects = []) {
  const usable = Array.from(rects || []).filter((rect) => {
    const width = Number(rect?.width);
    const height = Number(rect?.height);
    return Number.isFinite(width) && Number.isFinite(height) && (width > 0 || height > 0);
  });
  if (usable.length === 0) return null;
  let left = Number.POSITIVE_INFINITY;
  let top = Number.POSITIVE_INFINITY;
  let right = Number.NEGATIVE_INFINITY;
  let bottom = Number.NEGATIVE_INFINITY;
  usable.forEach((rect) => {
    left = Math.min(left, Number(rect.left));
    top = Math.min(top, Number(rect.top));
    right = Math.max(right, Number(rect.right));
    bottom = Math.max(bottom, Number(rect.bottom));
  });
  if (![left, top, right, bottom].every(Number.isFinite)) return null;
  return {
    x: left,
    y: top,
    width: Math.max(0, right - left),
    height: Math.max(0, bottom - top),
  };
}

function isIgnorableGlyphChar(char) {
  if (!char) return true;
  const codePoint = char.codePointAt(0);
  if (!Number.isFinite(codePoint)) return true;
  // Zero-width / formatting glyphs.
  if (
    codePoint === 0x200b || // zero-width space
    codePoint === 0x200c || // zero-width non-joiner
    codePoint === 0x200d || // zero-width joiner
    codePoint === 0xfeff // zero-width no-break space
  ) {
    return true;
  }
  // Treat whitespace/control-only runs as non-ink candidates.
  return /^\s$/u.test(char);
}

function getVisibleGlyphRectFromTextNode(textNode, searchFromEnd = false) {
  const text = String(textNode?.nodeValue || "");
  if (!text.length || typeof document === "undefined") return null;
  const chars = Array.from(text);
  const offsets = [];
  let codeUnitOffset = 0;
  for (let i = 0; i < chars.length; i += 1) {
    const char = chars[i];
    offsets.push({ char, start: codeUnitOffset, end: codeUnitOffset + char.length });
    codeUnitOffset += char.length;
  }
  const ordered = searchFromEnd ? [...offsets].reverse() : offsets;
  let fallbackRect = null;
  for (let i = 0; i < ordered.length; i += 1) {
    const candidate = ordered[i];
    try {
      const range = document.createRange();
      range.setStart(textNode, candidate.start);
      range.setEnd(textNode, candidate.end);
      const rect = range.getBoundingClientRect();
      if (!isUsableDomRect(rect)) continue;
      const payload = rectToPayload(rect);
      if (!fallbackRect) fallbackRect = payload;
      if (!isIgnorableGlyphChar(candidate.char)) {
        return payload;
      }
    } catch {
      // keep scanning candidates
    }
  }
  return fallbackRect;
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
    while (walker.nextNode()) {
      const node = walker.currentNode;
      const text = node?.nodeValue || "";
      if (text.length > 0) {
        const rect = getVisibleGlyphRectFromTextNode(node, false);
        if (rect) return rect;
      }
    }
    return null;
  } catch {
    return null;
  }
}

export function getLastGlyphRectInEditor(el) {
  if (!el || el instanceof HTMLInputElement || typeof document === "undefined") return null;
  try {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const textNodes = [];
    while (walker.nextNode()) {
      const node = walker.currentNode;
      const text = node?.nodeValue || "";
      if (text.length > 0) {
        textNodes.push(node);
      }
    }
    if (textNodes.length === 0) return null;
    for (let index = textNodes.length - 1; index >= 0; index -= 1) {
      const rect = getVisibleGlyphRectFromTextNode(textNodes[index], true);
      if (rect) return rect;
    }
    return null;
  } catch {
    return null;
  }
}

export function getTextInkRectInEditor(el) {
  if (!el || el instanceof HTMLInputElement || typeof document === "undefined") return null;
  try {
    const range = document.createRange();
    range.selectNodeContents(el);
    const clientRectUnion = unionClientRects(range.getClientRects?.() || []);
    if (clientRectUnion && isUsableDomRect(clientRectUnion)) {
      return rectToPayload(clientRectUnion);
    }
    const rangeRect = range.getBoundingClientRect();
    return isUsableDomRect(rangeRect) ? rectToPayload(rangeRect) : null;
  } catch {
    return null;
  }
}
