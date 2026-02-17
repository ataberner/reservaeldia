import { createPortal } from "react-dom";
import { useMemo, useEffect, useRef, useLayoutEffect, useCallback } from "react";

function isInlineDebugEnabled() {
  return typeof window !== "undefined" && window.__INLINE_DEBUG !== false;
}

function formatInlineLogPayload(payload = {}) {
  try {
    return JSON.stringify(payload, null, 2);
  } catch (error) {
    return String(error || payload);
  }
}

function nextInlineFrameMeta() {
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

function normalizeFinishMode(mode) {
  if (mode === "immediate" || mode === "raf" || mode === "timeout100") return mode;
  return "raf";
}

function normalizeWidthMode(mode) {
  return mode === "fit-content" ? "fit-content" : "measured";
}

function normalizeEditorText(rawText, { trimPhantomTrailingNewline = true } = {}) {
  const normalized = String(rawText ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\u200B/g, "");
  if (!trimPhantomTrailingNewline) return normalized;
  const trailingNewlines = normalized.match(/\n+$/)?.[0].length || 0;
  if (trailingNewlines >= 2) {
    // contentEditable puede reportar una linea vacia extra temporal al hacer Enter.
    return normalized.slice(0, -1);
  }
  return normalized;
}

function countLines(text) {
  const normalized = String(text ?? "").replace(/\r\n/g, "\n");
  return normalized === "" ? 1 : normalized.split("\n").length;
}

function countTrailingNewlines(text) {
  const normalized = String(text ?? "").replace(/\r\n/g, "\n");
  const trailing = normalized.match(/\n+$/)?.[0];
  return trailing ? trailing.length : 0;
}

function rectToPayload(rect) {
  if (!rect) return null;
  return {
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
  };
}

function getFullRangeRect(el) {
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

function getSelectionRectInEditor(el) {
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

function getCollapsedCaretProbeRectInEditor(el) {
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

function roundMetric(value, digits = 4) {
  return Number.isFinite(value) ? Number(value.toFixed(digits)) : null;
}

function getFirstGlyphRectInEditor(el) {
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

function measureCanvasInkMetrics({
  fontStyle,
  fontWeight,
  fontSizePx,
  fontFamily,
  probeText,
}) {
  if (typeof document === "undefined") return null;
  try {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    const safeFamily = String(fontFamily || "sans-serif");
    const familyForCanvas = safeFamily.includes(",")
      ? safeFamily
      : (/\s/.test(safeFamily) ? `"${safeFamily}"` : safeFamily);
    ctx.font = `${fontStyle || "normal"} ${fontWeight || "normal"} ${fontSizePx}px ${familyForCanvas}`;
    const m = ctx.measureText(probeText || "Hg");
    const ascent = Number(m.actualBoundingBoxAscent || 0);
    const descent = Number(m.actualBoundingBoxDescent || 0);
    const inkHeight = ascent + descent;
    const fontAscent = Number(m.fontBoundingBoxAscent || 0);
    const fontDescent = Number(m.fontBoundingBoxDescent || 0);
    return {
      probeText,
      actualAscentPx: roundMetric(ascent),
      actualDescentPx: roundMetric(descent),
      actualInkHeightPx: roundMetric(inkHeight),
      fontAscentPx: roundMetric(fontAscent),
      fontDescentPx: roundMetric(fontDescent),
      fontBoxHeightPx: roundMetric(fontAscent + fontDescent),
    };
  } catch {
    return null;
  }
}

function measureDomInkProbe({
  fontStyle,
  fontWeight,
  fontSizePx,
  fontFamily,
  lineHeightPx,
  probeText,
}) {
  if (typeof document === "undefined") return null;
  let host = null;
  try {
    host = document.createElement("div");
    host.style.position = "fixed";
    host.style.left = "-100000px";
    host.style.top = "-100000px";
    host.style.margin = "0";
    host.style.padding = "0";
    host.style.border = "0";
    host.style.whiteSpace = "pre";
    host.style.fontSize = `${fontSizePx}px`;
    host.style.fontFamily = fontFamily || "sans-serif";
    host.style.fontWeight = fontWeight || "normal";
    host.style.fontStyle = fontStyle || "normal";
    host.style.lineHeight = `${lineHeightPx}px`;
    host.style.boxSizing = "border-box";
    host.style.pointerEvents = "none";
    host.style.userSelect = "none";

    const span = document.createElement("span");
    span.style.margin = "0";
    span.style.padding = "0";
    span.style.border = "0";
    span.style.whiteSpace = "pre";
    span.textContent = probeText || "Hg";
    host.appendChild(span);
    document.body.appendChild(host);

    const hostRect = host.getBoundingClientRect();
    const spanRect = span.getBoundingClientRect();
    return {
      probeText,
      hostHeightPx: roundMetric(hostRect.height),
      glyphHeightPx: roundMetric(spanRect.height),
      glyphTopInsetPx: roundMetric(spanRect.top - hostRect.top),
      glyphBottomInsetPx: roundMetric(hostRect.bottom - spanRect.bottom),
    };
  } catch {
    return null;
  } finally {
    if (host && host.parentNode) {
      host.parentNode.removeChild(host);
    }
  }
}

const INLINE_LAYOUT_VERSION = "linebreak-unified-editor-v9";

export default function InlineTextEditor({
  editingId = null,
  node,
  value,
  onChange,
  onFinish,
  textAlign,
  scaleVisual = 1,
  finishMode = "raf",
  widthMode = "measured",
  onOverlayMountChange = null,
  onDebugEvent = null,
}) {
  if (!node) return null;

  const editorRef = useRef(null);
  const textCenterXDomRef = useRef(null);
  const DEBUG_MODE = isInlineDebugEnabled();

  const normalizedFinishMode = normalizeFinishMode(finishMode);
  const normalizedWidthMode = normalizeWidthMode(widthMode);

  // Stage (lo necesitamos para rects y posiciones)
  const stage = node.getStage();
  if (!stage) return null;

  const stageBox = stage.container().getBoundingClientRect();

  const stageScaleX =
    typeof stage.scaleX === "function" ? stage.scaleX() : stage.scaleX || 1;
  const stageScaleY =
    typeof stage.scaleY === "function" ? stage.scaleY() : stage.scaleY || 1;

  const totalScaleX = (scaleVisual || 1) * (stageScaleX || 1);
  const totalScaleY = (scaleVisual || 1) * (stageScaleY || 1);

  // Detectar el nodo de texto real para estilo (color, fuente, etc.)
  const textNode = useMemo(() => {
    try {
      if (typeof node.getClassName === "function") {
        const cls = node.getClassName();
        if (cls === "Text") {
          return node;
        }
      }

      const nodeId =
        (typeof node.id === "function" ? node.id() : node?.attrs?.id) || null;
      if (nodeId && typeof stage?.findOne === "function") {
        const pairedText = stage.findOne(`#${nodeId}-text`);
        if (pairedText?.getClassName?.() === "Text") {
          return pairedText;
        }
      }

      if (typeof node.findOne === "function") {
        const found = node.findOne((n) => n.getClassName() === "Text");
        if (found) return found;
      }

      if (typeof node.findAncestor === "function") {
        const ancestorText = node.findAncestor(
          (n) => n.getClassName && n.getClassName() === "Text"
        );
        if (ancestorText) return ancestorText;
      }

      return node;
    } catch (error) {
      console.warn("Error buscando textNode para InlineTextEditor:", error);
      return node;
    }
  }, [node, stage]);

  const nodeProps = useMemo(() => {
    try {
      const getProp = (n, getterName, fallback) => {
        if (!n) return fallback;
        const fn = n[getterName];
        if (typeof fn === "function") return fn.call(n);
        return n[getterName] || fallback;
      };

      return {
        fontSize: getProp(textNode, "fontSize", 24),
        fontFamily: getProp(textNode, "fontFamily", "sans-serif"),
        fontWeight: getProp(textNode, "fontWeight", "normal"),
        fontStyle: getProp(textNode, "fontStyle", "normal"),
        fill: getProp(textNode, "fill", "#000"),
        lineHeightKonva: getProp(textNode, "lineHeight", 1.2),
      };
    } catch (error) {
      console.warn("Error obteniendo propiedades del textNode:", error);
      return {
        fontSize: 24,
        fontFamily: "sans-serif",
        fontWeight: "normal",
        fontStyle: "normal",
        fill: "#000",
        lineHeightKonva: 1.2,
      };
    }
  }, [textNode]);

  const konvaLineHeight = nodeProps.lineHeightKonva;
  const rectSourceNode = textNode || node;
  const rect = rectSourceNode.getClientRect({ relativeTo: stage, skipStroke: true });

  const PADDING_X = 0;
  const PADDING_Y = 0;
  const fontSizePx = Math.max(1, Number(nodeProps.fontSize || 24) * totalScaleY);
  const lineHeightPx = Math.max(1, fontSizePx * konvaLineHeight);
  const rawValue = String(value ?? "");
  const normalizedValue = rawValue.replace(/\r\n/g, "\n");
  const normalizedValueForSingleLine = normalizedValue.replace(/\n+$/g, "");
  const isSingleLine = !normalizedValue.includes("\n");
  const verticalInsetPx = 0;
  const editableLineHeightPx = lineHeightPx;

  const className =
    typeof node.getClassName === "function" ? node.getClassName() : "Text";
  const isTextNode = className === "Text";

  const baseTextWidth = Math.max(20, rect.width * totalScaleX);

  const measuredContentWidth = useMemo(() => {
    if (normalizedWidthMode !== "measured") return null;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return baseTextWidth;

    const safeFontFamily = String(nodeProps.fontFamily || "sans-serif");
    const fontFamilyForCanvas = safeFontFamily.includes(",")
      ? safeFontFamily
      : (/\s/.test(safeFontFamily) ? `"${safeFontFamily}"` : safeFontFamily);
    ctx.font = `${nodeProps.fontStyle || "normal"} ${nodeProps.fontWeight || "normal"} ${fontSizePx}px ${fontFamilyForCanvas}`;

    const textValue = isSingleLine ? normalizedValueForSingleLine : normalizedValue;
    const lines = textValue.split(/\r?\n/);
    const maxLineWidth = Math.max(...lines.map((line) => ctx.measureText(line).width), 0);
    return Math.max(20, Math.ceil(maxLineWidth));
  }, [
    normalizedWidthMode,
    nodeProps.fontFamily,
    nodeProps.fontSize,
    nodeProps.fontStyle,
    nodeProps.fontWeight,
    totalScaleY,
    isSingleLine,
    normalizedValue,
    normalizedValueForSingleLine,
  ]);

  const effectiveTextWidth =
    normalizedWidthMode === "measured" && Number.isFinite(measuredContentWidth)
      ? measuredContentWidth
      : baseTextWidth;
  const minWidthPx =
    normalizedWidthMode === "measured" ? effectiveTextWidth : baseTextWidth;

  const cardWidth = effectiveTextWidth + PADDING_X * 2;
  let left;
  let top;

  if (isTextNode) {
    if (textCenterXDomRef.current == null) {
      const centerXCanvas = rect.x + rect.width / 2;
      textCenterXDomRef.current =
        stageBox.left + centerXCanvas * totalScaleX + window.scrollX;
    }

    top =
      stageBox.top +
      rect.y * totalScaleY +
      window.scrollY -
      PADDING_Y;
    left = textCenterXDomRef.current - cardWidth / 2;
  } else {
    const centerXCanvas = rect.x + rect.width / 2;
    const centerYCanvas = rect.y + rect.height / 2;

    const centerXDom =
      stageBox.left + centerXCanvas * totalScaleX + window.scrollX;
    const centerYDom =
      stageBox.top + centerYCanvas * totalScaleY + window.scrollY;

    const approxHeight =
      nodeProps.fontSize * konvaLineHeight * totalScaleY + PADDING_Y * 2;

    left = centerXDom - cardWidth / 2;
    top = centerYDom - approxHeight / 2;
  }

  const emitDebug = useCallback((eventName, extra = {}) => {
    if (!DEBUG_MODE) return;
    const essentialEvents = new Set([
      "overlay: after-focus",
      "input: linebreak",
    ]);
    if (!essentialEvents.has(eventName)) return;
    const ts = new Date().toISOString();
    const frameMeta = nextInlineFrameMeta();
    const overlayEl = editorRef.current?.parentElement || null;
    const overlayRect = overlayEl?.getBoundingClientRect?.() || null;
    const contentRect = editorRef.current?.getBoundingClientRect?.() || null;
    const computedStyle = editorRef.current
      ? window.getComputedStyle(editorRef.current)
      : null;
    const fullRangeRect = getFullRangeRect(editorRef.current);
    const selectionInfo = getSelectionRectInEditor(editorRef.current);
    const projectedKonvaRect = {
      x: stageBox.left + rect.x * totalScaleX + window.scrollX,
      y: stageBox.top + rect.y * totalScaleY + window.scrollY,
      width: rect.width * totalScaleX,
      height: rect.height * totalScaleY,
    };
    const overlayToKonvaDy = overlayRect
      ? overlayRect.y - projectedKonvaRect.y
      : null;
    const contentToKonvaDy = contentRect
      ? contentRect.y - projectedKonvaRect.y
      : null;
    const fullRangeToContentDy =
      fullRangeRect && contentRect ? fullRangeRect.y - contentRect.y : null;
    const caretToContentDy =
      selectionInfo.inEditor && selectionInfo.rect && contentRect
        ? selectionInfo.rect.y - contentRect.y
        : null;
    const caretProbeRect = getCollapsedCaretProbeRectInEditor(editorRef.current);
    const caretProbeToContentDy =
      caretProbeRect && contentRect ? caretProbeRect.y - contentRect.y : null;
    const caretProbeHeightPx = caretProbeRect ? caretProbeRect.height : null;
    const firstGlyphRect = getFirstGlyphRectInEditor(editorRef.current);
    const firstGlyphToContentDy =
      firstGlyphRect && contentRect ? firstGlyphRect.y - contentRect.y : null;
    const firstGlyphHeightPx = firstGlyphRect ? firstGlyphRect.height : null;
    const probeText = (
      isSingleLine
        ? normalizedValueForSingleLine
        : (normalizedValue.split(/\r?\n/)[0] || "")
    )
      .replace(/\u200B/g, "")
      .slice(0, 32) || "HgAy";
    const canvasInkMetrics = measureCanvasInkMetrics({
      fontStyle: nodeProps.fontStyle,
      fontWeight: nodeProps.fontWeight,
      fontSizePx,
      fontFamily: nodeProps.fontFamily,
      probeText,
    });
    const domInkProbe = measureDomInkProbe({
      fontStyle: nodeProps.fontStyle,
      fontWeight: nodeProps.fontWeight,
      fontSizePx,
      fontFamily: nodeProps.fontFamily,
      lineHeightPx: editableLineHeightPx,
      probeText,
    });
    const canvasInkTopInsetPx =
      canvasInkMetrics && Number.isFinite(canvasInkMetrics.actualInkHeightPx)
        ? (editableLineHeightPx - canvasInkMetrics.actualInkHeightPx) / 2
        : null;
    const domVsCanvasTopInsetDeltaPx =
      domInkProbe && Number.isFinite(canvasInkTopInsetPx)
        ? domInkProbe.glyphTopInsetPx - canvasInkTopInsetPx
        : null;
    const liveVsProbeGlyphTopDeltaPx =
      Number.isFinite(firstGlyphToContentDy) && domInkProbe
        ? firstGlyphToContentDy - domInkProbe.glyphTopInsetPx
        : null;

    const payload = {
      ...frameMeta,
      id: editingId || null,
      eventName,
      valueLength: rawValue.length,
      left,
      top,
      baseTextWidth,
      effectiveTextWidth,
      finishMode: normalizedFinishMode,
      widthMode: normalizedWidthMode,
      overlayRect: overlayRect
        ? {
            x: overlayRect.x,
            y: overlayRect.y,
            width: overlayRect.width,
            height: overlayRect.height,
          }
        : null,
      contentRect: contentRect
        ? {
            x: contentRect.x,
            y: contentRect.y,
            width: contentRect.width,
            height: contentRect.height,
          }
        : null,
      contentScrollWidth: editorRef.current?.scrollWidth ?? null,
      contentClientWidth: editorRef.current?.clientWidth ?? null,
      isFocused: document.activeElement === editorRef.current,
      projectedKonvaRect,
      overlayToKonvaDy,
      contentToKonvaDy,
      fullRangeRect,
      selectionInEditor: selectionInfo.inEditor,
      selectionRect: selectionInfo.rect,
      fullRangeToContentDy,
      caretToContentDy,
      caretProbeRect,
      caretProbeToContentDy,
      caretProbeHeightPx,
      firstGlyphRect,
      firstGlyphToContentDy,
      firstGlyphHeightPx,
      computedFontSize: computedStyle?.fontSize ?? null,
      computedLineHeight: computedStyle?.lineHeight ?? null,
      computedPaddingTop: computedStyle?.paddingTop ?? null,
      computedPaddingBottom: computedStyle?.paddingBottom ?? null,
      computedBorderTop: computedStyle?.borderTopWidth ?? null,
      computedBorderBottom: computedStyle?.borderBottomWidth ?? null,
      fontSizePx,
      lineHeightPx,
      isSingleLine,
      verticalInsetPx,
      editableLineHeightPx,
      editorTag: !editorRef.current
        ? null
        : editorRef.current instanceof HTMLInputElement
          ? "input"
          : "contentEditable",
      normalizedValueLength: isSingleLine
        ? normalizedValueForSingleLine.length
        : normalizedValue.length,
      hadTrailingNewline:
        isSingleLine && normalizedValueForSingleLine.length !== normalizedValue.length,
      canvasInkMetrics,
      domInkProbe,
      canvasInkTopInsetPx: roundMetric(canvasInkTopInsetPx),
      domVsCanvasTopInsetDeltaPx: roundMetric(domVsCanvasTopInsetDeltaPx),
      liveVsProbeGlyphTopDeltaPx: roundMetric(liveVsProbeGlyphTopDeltaPx),
      layoutModelVersion: INLINE_LAYOUT_VERSION,
      ...extra,
    };

    const body = formatInlineLogPayload(payload);
    console.log(`[INLINE][${ts}] ${eventName}\n${body}`);
    if (typeof onDebugEvent === "function") {
      onDebugEvent(eventName, payload);
    }
  }, [
    DEBUG_MODE,
    editingId,
    rawValue,
    normalizedValue,
    normalizedValueForSingleLine,
    left,
    top,
    baseTextWidth,
    effectiveTextWidth,
    normalizedFinishMode,
    normalizedWidthMode,
    onDebugEvent,
    stageBox.left,
    stageBox.top,
    rect.x,
    rect.y,
    rect.width,
    rect.height,
    totalScaleX,
    totalScaleY,
    fontSizePx,
    lineHeightPx,
    isSingleLine,
    verticalInsetPx,
    editableLineHeightPx,
  ]);

  // Inicializar contenido + foco + caret antes del primer paint visible
  useLayoutEffect(() => {
    const el = editorRef.current;
    if (!el) return;

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

    if (typeof onOverlayMountChange === "function" && editingId) {
      onOverlayMountChange(editingId, true);
    }
    emitDebug("overlay: after-focus");
    return () => {
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
          currentEditingId: window._currentEditingId ?? null,
          globalEditingId: window.editing?.id ?? null,
        });
      });
      if (typeof onOverlayMountChange === "function" && editingId) {
        onOverlayMountChange(editingId, false);
      }
    };
  }, [editingId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    el.scrollLeft = 0;
    el.scrollTop = 0;
  }, []);

  const triggerFinish = useCallback((trigger = "blur") => {
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
  }, [editingId, emitDebug, normalizedFinishMode, onFinish]);

  return createPortal(
    <>
      <div
        data-inline-editor-id={editingId || ""}
        data-inline-editor="true"
        data-inline-width-mode={normalizedWidthMode}
        data-inline-finish-mode={normalizedFinishMode}
        style={{
          position: "fixed",
          left: `${left}px`,
          top: `${top}px`,
          display: "block",
          verticalAlign: "top",
          width:
            normalizedWidthMode === "measured"
              ? `${effectiveTextWidth}px`
              : "fit-content",
          minWidth: `${minWidthPx}px`,
          maxWidth: "min(100vw - 40px, 1200px)",
          background: "transparent",
          borderRadius: 0,
          boxShadow: "none",
          border: "none",
          padding: `${PADDING_Y}px ${PADDING_X}px`,
          zIndex: 9999,
          boxSizing: "border-box",
        }}
      >
        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          style={{
            display: "block",
            verticalAlign: "top",
            width:
              normalizedWidthMode === "measured"
                ? `${effectiveTextWidth}px`
                : undefined,
            minWidth: `${minWidthPx}px`,
            whiteSpace: "pre",
            overflowWrap: "normal",
            wordBreak: "normal",
            overflow: "visible",
            fontSize: `${fontSizePx}px`,
            fontFamily: nodeProps.fontFamily,
            fontWeight: nodeProps.fontWeight,
            fontStyle: nodeProps.fontStyle,
            lineHeight: `${editableLineHeightPx}px`,
            minHeight: `${lineHeightPx}px`,
            color: "transparent",
            caretColor: nodeProps.fill,
            WebkitTextFillColor: "transparent",
            background: "transparent",
            borderRadius: 0,
            paddingTop: `${verticalInsetPx}px`,
            paddingBottom: `${verticalInsetPx}px`,
            paddingLeft: 0,
            paddingRight: 0,
            margin: 0,
            outline: "none",
            boxSizing: "border-box",
            textAlign: textAlign || "left",
          }}
          onInput={(e) => {
            const domRaw = String(e.currentTarget.innerText || "");
            const domNormalized = domRaw
              .replace(/\r\n/g, "\n")
              .replace(/\u200B/g, "");
            const nextValue = normalizeEditorText(domRaw);
            const prevValue = normalizedValue;

            const prevLineCount = countLines(prevValue);
            const nextLineCount = countLines(nextValue);
            const prevTrailingNewlines = countTrailingNewlines(prevValue);
            const nextTrailingNewlines = countTrailingNewlines(nextValue);
            const domLineCount = countLines(domNormalized);
            const domTrailingNewlines = countTrailingNewlines(domNormalized);
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
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.isComposing) {
              e.stopPropagation();
            }
          }}
          onBlur={() => {
            triggerFinish("blur");
          }}
        />
      </div>
    </>,
    document.body
  );
}
