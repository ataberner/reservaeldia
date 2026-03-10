import { roundMetric } from "@/components/editor/overlays/inlineEditor/inlineEditorNumeric";

const ELEMENT_NODE = 1;
const TEXT_NODE = 3;
let html2canvasModulePromise = null;
const SAFE_SNAPSHOT_STYLE_PROPERTIES = [
  "display",
  "position",
  "left",
  "top",
  "right",
  "bottom",
  "width",
  "height",
  "min-width",
  "min-height",
  "max-width",
  "max-height",
  "margin",
  "margin-top",
  "margin-right",
  "margin-bottom",
  "margin-left",
  "padding",
  "padding-top",
  "padding-right",
  "padding-bottom",
  "padding-left",
  "border",
  "border-top",
  "border-right",
  "border-bottom",
  "border-left",
  "border-radius",
  "outline",
  "box-sizing",
  "overflow",
  "overflow-x",
  "overflow-y",
  "opacity",
  "visibility",
  "background",
  "background-color",
  "background-image",
  "background-size",
  "background-position",
  "background-repeat",
  "transform",
  "transform-origin",
  "white-space",
  "overflow-wrap",
  "word-break",
  "word-wrap",
  "text-align",
  "text-indent",
  "text-transform",
  "text-rendering",
  "text-decoration",
  "font",
  "font-family",
  "font-size",
  "font-style",
  "font-weight",
  "font-kerning",
  "font-feature-settings",
  "font-variant-ligatures",
  "font-optical-sizing",
  "line-height",
  "letter-spacing",
  "color",
  "-webkit-text-fill-color",
  "caret-color",
  "user-select",
  "pointer-events",
  "vertical-align",
  "z-index",
 ];

function toFiniteNumber(value, fallback = null) {
  if (value === null || typeof value === "undefined" || value === "") {
    return fallback;
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function roundNullableMetric(value) {
  const numeric = toFiniteNumber(value, null);
  return numeric === null ? null : roundMetric(numeric);
}

function normalizeRect(rect, dpr = 1, paddingPx = 0) {
  const x = toFiniteNumber(rect?.x, null);
  const y = toFiniteNumber(rect?.y, null);
  const width = toFiniteNumber(rect?.width, null);
  const height = toFiniteNumber(rect?.height, null);
  if (![x, y, width, height].every(Number.isFinite)) return null;
  if (width <= 0 || height <= 0) return null;
  const safeDpr = Math.max(1, toFiniteNumber(dpr, 1));
  const left = Math.floor((x - paddingPx) * safeDpr) / safeDpr;
  const top = Math.floor((y - paddingPx) * safeDpr) / safeDpr;
  const right = Math.ceil((x + width + paddingPx) * safeDpr) / safeDpr;
  const bottom = Math.ceil((y + height + paddingPx) * safeDpr) / safeDpr;
  return {
    x: left,
    y: top,
    width: Math.max(1 / safeDpr, right - left),
    height: Math.max(1 / safeDpr, bottom - top),
  };
}

function unionRects(rects = [], dpr = 1, paddingPx = 0) {
  const normalized = rects
    .map((rect) => normalizeRect(rect, dpr, 0))
    .filter((rect) => rect);
  if (normalized.length === 0) return null;
  const minX = Math.min(...normalized.map((rect) => rect.x));
  const minY = Math.min(...normalized.map((rect) => rect.y));
  const maxX = Math.max(...normalized.map((rect) => rect.x + rect.width));
  const maxY = Math.max(...normalized.map((rect) => rect.y + rect.height));
  return normalizeRect({
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  }, dpr, paddingPx);
}

function createCanvas(width, height) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  return canvas;
}

async function loadHtml2Canvas() {
  if (!html2canvasModulePromise) {
    html2canvasModulePromise = import("html2canvas").then((module) => module?.default || module);
  }
  return html2canvasModulePromise;
}

function copySnapshotStyles(target, sourceNode) {
  if (!target || !sourceNode || sourceNode.nodeType !== ELEMENT_NODE) return;
  const computedStyle = window.getComputedStyle(sourceNode);
  SAFE_SNAPSHOT_STYLE_PROPERTIES.forEach((property) => {
    const value = computedStyle.getPropertyValue(property);
    if (!value) return;
    target.style.setProperty(property, value, computedStyle.getPropertyPriority(property));
  });
}

function cloneNodeWithComputedStyles(sourceNode) {
  if (!sourceNode) return null;
  if (sourceNode.nodeType === TEXT_NODE) {
    return document.createTextNode(sourceNode.textContent || "");
  }
  if (sourceNode.nodeType !== ELEMENT_NODE) {
    return sourceNode.cloneNode(false);
  }

  const tagName = String(sourceNode.tagName || "div").toLowerCase();
  const clone = document.createElement(tagName);
  copySnapshotStyles(clone, sourceNode);
  clone.removeAttribute("id");
  clone.setAttribute("contenteditable", "false");
  clone.setAttribute("spellcheck", "false");
  if (sourceNode.hasAttribute?.("dir")) {
    clone.setAttribute("dir", sourceNode.getAttribute("dir") || "auto");
  }

  const children = Array.from(sourceNode.childNodes || []);
  children.forEach((child) => {
    const childClone = cloneNodeWithComputedStyles(child);
    if (childClone) clone.appendChild(childClone);
  });
  return clone;
}

function applyRootSnapshotOverrides(clone, width, height) {
  if (!clone || clone.nodeType !== ELEMENT_NODE) return;
  clone.setAttribute("xmlns", "http://www.w3.org/1999/xhtml");
  clone.style.position = "relative";
  clone.style.left = "0px";
  clone.style.top = "0px";
  clone.style.right = "auto";
  clone.style.bottom = "auto";
  clone.style.margin = "0";
  clone.style.transform = "none";
  clone.style.transformOrigin = "top left";
  clone.style.width = `${width}px`;
  clone.style.minWidth = `${width}px`;
  clone.style.maxWidth = `${width}px`;
  clone.style.height = `${height}px`;
  clone.style.minHeight = `${height}px`;
  clone.style.maxHeight = `${height}px`;
  clone.style.overflow = "visible";
  clone.style.caretColor = "transparent";
}

function rectToLocal(rect, originRect) {
  const x = toFiniteNumber(rect?.x, null);
  const y = toFiniteNumber(rect?.y, null);
  const width = toFiniteNumber(rect?.width, null);
  const height = toFiniteNumber(rect?.height, null);
  const originX = toFiniteNumber(originRect?.x, null);
  const originY = toFiniteNumber(originRect?.y, null);
  if (![x, y, width, height, originX, originY].every(Number.isFinite)) return null;
  return {
    x: x - originX,
    y: y - originY,
    width,
    height,
  };
}

function serializeDomSnapshotSvg(rootNode, width, height) {
  const wrapper = document.createElement("div");
  wrapper.setAttribute("xmlns", "http://www.w3.org/1999/xhtml");
  wrapper.style.width = `${width}px`;
  wrapper.style.height = `${height}px`;
  wrapper.style.margin = "0";
  wrapper.style.padding = "0";
  wrapper.style.background = "transparent";
  wrapper.style.overflow = "visible";
  wrapper.style.position = "relative";
  wrapper.appendChild(rootNode);

  const serializer = new XMLSerializer();
  const serializedWrapper = serializer.serializeToString(wrapper);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><foreignObject width="100%" height="100%">${serializedWrapper}</foreignObject></svg>`;
}

function encodeSvgDataUrl(svgMarkup) {
  const encoded = encodeURIComponent(svgMarkup)
    .replace(/%0A/g, "")
    .replace(/%20/g, " ");
  return `data:image/svg+xml;charset=utf-8,${encoded}`;
}

function loadImageFromSrc(src, sourceLabel) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      resolve(image);
    };
    image.onerror = (errorEvent) => {
      const reason = errorEvent?.message || `${sourceLabel}-image-load-failed`;
      reject(new Error(reason));
    };
    image.src = src;
  });
}

async function loadImageFromSvg(svgMarkup) {
  const trimmedMarkup = String(svgMarkup || "").trim();
  const blob = new Blob([trimmedMarkup], { type: "image/svg+xml;charset=utf-8" });
  const objectUrl = URL.createObjectURL(blob);
  try {
    return await loadImageFromSrc(objectUrl, "blob-url");
  } catch (blobError) {
    const dataUrl = encodeSvgDataUrl(trimmedMarkup);
    try {
      return await loadImageFromSrc(dataUrl, "data-url");
    } catch (dataUrlError) {
      const blobReason = blobError?.message || "blob-url-image-load-failed";
      const dataReason = dataUrlError?.message || "data-url-image-load-failed";
      throw new Error(`dom-snapshot-load-failed:${blobReason};${dataReason}`);
    }
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function getVisibleStageCanvases(stage) {
  const container = stage?.container?.();
  if (!container) return [];
  return Array.from(container.querySelectorAll("canvas")).filter((canvas) => {
    const style = window.getComputedStyle(canvas);
    return (
      style.display !== "none" &&
      style.visibility !== "hidden" &&
      Number(canvas.width) > 0 &&
      Number(canvas.height) > 0 &&
      Number(style.opacity || 1) > 0
    );
  });
}

function summarizeBitmapMeta(snapshot) {
  if (!snapshot) return null;
  return {
    status: snapshot.status || null,
    reason: snapshot.reason || null,
    eventName: snapshot.eventName || null,
    phase: snapshot.phase || null,
    rendererKind: snapshot.rendererKind || null,
    captureSource: snapshot.captureSource || null,
    caretRequested: Boolean(snapshot.caretRequested),
    caretCaptureMode: snapshot.caretCaptureMode || null,
    caretCaptureReason: snapshot.caretCaptureReason || null,
    dpr: roundNullableMetric(snapshot.dpr),
    captureRect: snapshot.captureRect
      ? {
          x: roundNullableMetric(snapshot.captureRect.x),
          y: roundNullableMetric(snapshot.captureRect.y),
          width: roundNullableMetric(snapshot.captureRect.width),
          height: roundNullableMetric(snapshot.captureRect.height),
        }
      : null,
    bitmapSize: {
      width: Number(snapshot.pixelWidth || 0),
      height: Number(snapshot.pixelHeight || 0),
    },
  };
}

export function resolveInlineRenderCaptureRect({
  dpr = 1,
  textInkRect = null,
  fullRangeRect = null,
  contentRect = null,
  caretRect = null,
  includeCaret = false,
  paddingPx = 2,
}) {
  const rects = [textInkRect, fullRangeRect, contentRect];
  if (includeCaret && caretRect) rects.push(caretRect);
  return unionRects(rects, dpr, paddingPx);
}

export async function captureKonvaRenderBitmap({
  stage,
  captureRect,
  dpr = 1,
  eventName = null,
  phase = null,
  rendererKind = "konva",
}) {
  const safeDpr = Math.max(1, toFiniteNumber(dpr, 1));
  const normalizedCaptureRect = normalizeRect(captureRect, safeDpr, 0);
  if (!stage || !normalizedCaptureRect) {
    return {
      status: "skipped",
      reason: !stage ? "missing-stage" : "missing-capture-rect",
      eventName,
      phase,
      rendererKind,
    };
  }
  const stageContainer = stage.container?.();
  const stageRect = stageContainer?.getBoundingClientRect?.() || null;
  const visibleCanvases = getVisibleStageCanvases(stage);
  if (!stageRect || visibleCanvases.length === 0) {
    return {
      status: "skipped",
      reason: !stageRect ? "missing-stage-rect" : "missing-visible-canvases",
      eventName,
      phase,
      rendererKind,
    };
  }

  const pixelWidth = Math.max(1, Math.round(normalizedCaptureRect.width * safeDpr));
  const pixelHeight = Math.max(1, Math.round(normalizedCaptureRect.height * safeDpr));
  const canvas = createCanvas(pixelWidth, pixelHeight);
  const context = canvas.getContext("2d", { willReadFrequently: true, alpha: true });
  context.scale(safeDpr, safeDpr);
  context.translate(-normalizedCaptureRect.x, -normalizedCaptureRect.y);
  visibleCanvases.forEach((stageCanvas) => {
    context.drawImage(stageCanvas, stageRect.x, stageRect.y, stageRect.width, stageRect.height);
  });
  return {
    status: "captured",
    eventName,
    phase,
    rendererKind,
    captureSource: "konva-stage",
    captureRect: normalizedCaptureRect,
    sourceRect: {
      x: stageRect.x,
      y: stageRect.y,
      width: stageRect.width,
      height: stageRect.height,
    },
    pixelWidth,
    pixelHeight,
    dpr: safeDpr,
    imageData: context.getImageData(0, 0, pixelWidth, pixelHeight),
    caretRequested: false,
    caretCaptureMode: "not-requested",
    caretCaptureReason: null,
  };
}

export async function captureDomRenderBitmap({
  element,
  captureRect,
  dpr = 1,
  eventName = null,
  phase = null,
  rendererKind = "dom",
  caretVisible = false,
  caretRect = null,
  caretColor = null,
}) {
  const safeDpr = Math.max(1, toFiniteNumber(dpr, 1));
  const normalizedCaptureRect = normalizeRect(captureRect, safeDpr, 0);
  const sourceRect = element?.getBoundingClientRect?.() || null;
  if (!element || !sourceRect || !normalizedCaptureRect) {
    return {
      status: "skipped",
      reason: !element ? "missing-element" : (!sourceRect ? "missing-element-rect" : "missing-capture-rect"),
      eventName,
      phase,
      rendererKind,
      caretRequested: Boolean(caretVisible),
      caretCaptureMode: caretVisible ? "unavailable" : "not-requested",
      caretCaptureReason: caretVisible ? "missing-capture-bounds" : null,
    };
  }

  let caretCaptureMode = caretVisible ? "unavailable" : "not-requested";
  let caretCaptureReason = caretVisible ? "caret-geometry-unavailable" : null;
  const localCaretRect = caretVisible ? rectToLocal(caretRect, sourceRect) : null;
  try {
    const html2canvas = await loadHtml2Canvas();
    const snapshotMarkerAttr = "data-inline-render-snapshot-id";
    const previousMarker = element.getAttribute(snapshotMarkerAttr);
    const snapshotMarker = `inline-render-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 10)}`;
    element.setAttribute(snapshotMarkerAttr, snapshotMarker);
    if (caretVisible && localCaretRect) {
      caretCaptureMode = "synthetic";
      caretCaptureReason = null;
    }
    const renderedCanvas = await html2canvas(element, {
      backgroundColor: null,
      logging: false,
      scale: safeDpr,
      useCORS: true,
      allowTaint: false,
      foreignObjectRendering: false,
      imageTimeout: 0,
      width: Math.max(1, Math.ceil(sourceRect.width)),
      height: Math.max(1, Math.ceil(sourceRect.height)),
      onclone: (clonedDocument) => {
        const clonedRoot = clonedDocument.querySelector(
          `[${snapshotMarkerAttr}="${snapshotMarker}"]`
        );
        if (!clonedRoot || clonedRoot.nodeType !== ELEMENT_NODE) return;
        clonedRoot.removeAttribute(snapshotMarkerAttr);
        clonedRoot.setAttribute("contenteditable", "false");
        clonedRoot.setAttribute("spellcheck", "false");
        clonedRoot.style.caretColor = "transparent";
        if (typeof element.scrollLeft === "number") clonedRoot.scrollLeft = element.scrollLeft;
        if (typeof element.scrollTop === "number") clonedRoot.scrollTop = element.scrollTop;
        if (caretVisible && localCaretRect) {
          const syntheticCaret = clonedDocument.createElement("div");
          syntheticCaret.style.position = "absolute";
          syntheticCaret.style.left = `${localCaretRect.x}px`;
          syntheticCaret.style.top = `${localCaretRect.y}px`;
          syntheticCaret.style.width = `${Math.max(1, localCaretRect.width || 1)}px`;
          syntheticCaret.style.height = `${Math.max(1, localCaretRect.height || 1)}px`;
          syntheticCaret.style.margin = "0";
          syntheticCaret.style.padding = "0";
          syntheticCaret.style.border = "0";
          syntheticCaret.style.opacity = "1";
          syntheticCaret.style.background =
            caretColor || window.getComputedStyle(element).color || "#000";
          syntheticCaret.style.pointerEvents = "none";
          syntheticCaret.style.zIndex = "2147483647";
          clonedRoot.appendChild(syntheticCaret);
        }
      },
    });
    if (previousMarker === null) {
      element.removeAttribute(snapshotMarkerAttr);
    } else {
      element.setAttribute(snapshotMarkerAttr, previousMarker);
    }
    const pixelWidth = Math.max(1, Math.round(normalizedCaptureRect.width * safeDpr));
    const pixelHeight = Math.max(1, Math.round(normalizedCaptureRect.height * safeDpr));
    const canvas = createCanvas(pixelWidth, pixelHeight);
    const context = canvas.getContext("2d", { willReadFrequently: true, alpha: true });
    const sourceScaleX = renderedCanvas.width / Math.max(1, sourceRect.width);
    const sourceScaleY = renderedCanvas.height / Math.max(1, sourceRect.height);
    context.drawImage(
      renderedCanvas,
      (sourceRect.x - normalizedCaptureRect.x) * sourceScaleX,
      (sourceRect.y - normalizedCaptureRect.y) * sourceScaleY,
      renderedCanvas.width,
      renderedCanvas.height
    );
    return {
      status: "captured",
      eventName,
      phase,
      rendererKind,
      captureSource: "dom-html2canvas",
      captureRect: normalizedCaptureRect,
      sourceRect: {
        x: sourceRect.x,
        y: sourceRect.y,
        width: sourceRect.width,
        height: sourceRect.height,
      },
      pixelWidth,
      pixelHeight,
      dpr: safeDpr,
      imageData: context.getImageData(0, 0, pixelWidth, pixelHeight),
      caretRequested: Boolean(caretVisible),
      caretCaptureMode,
      caretCaptureReason,
    };
  } catch (error) {
    const snapshotMarkerAttr = "data-inline-render-snapshot-id";
    if (element?.hasAttribute?.(snapshotMarkerAttr)) {
      element.removeAttribute(snapshotMarkerAttr);
    }
    return {
      status: "failed",
      reason: error?.message || "dom-html2canvas-failed",
      eventName,
      phase,
      rendererKind,
      caretRequested: Boolean(caretVisible),
      caretCaptureMode,
      caretCaptureReason: caretCaptureReason || "dom-snapshot-failed",
    };
  }
}

export function buildInlineRenderPixelDiffPayload({
  comparisonKind,
  fromPhase,
  toPhase,
  beforeSnapshot,
  afterSnapshot,
  deltaThreshold = 8,
}) {
  const beforeMeta = summarizeBitmapMeta(beforeSnapshot);
  const afterMeta = summarizeBitmapMeta(afterSnapshot);
  if (!beforeSnapshot || beforeSnapshot.status !== "captured") {
    return {
      comparisonKind,
      fromPhase,
      toPhase,
      before: beforeMeta,
      after: afterMeta,
      summary: {
        status: "unavailable",
        likelySource: "missing-before-capture",
      },
    };
  }
  if (!afterSnapshot || afterSnapshot.status !== "captured") {
    return {
      comparisonKind,
      fromPhase,
      toPhase,
      before: beforeMeta,
      after: afterMeta,
      summary: {
        status: "unavailable",
        likelySource: "missing-after-capture",
      },
    };
  }

  const beforeData = beforeSnapshot.imageData?.data;
  const afterData = afterSnapshot.imageData?.data;
  const compareWidth = Math.min(
    Number(beforeSnapshot.pixelWidth || 0),
    Number(afterSnapshot.pixelWidth || 0)
  );
  const compareHeight = Math.min(
    Number(beforeSnapshot.pixelHeight || 0),
    Number(afterSnapshot.pixelHeight || 0)
  );
  if (!beforeData || !afterData || compareWidth <= 0 || compareHeight <= 0) {
    return {
      comparisonKind,
      fromPhase,
      toPhase,
      before: beforeMeta,
      after: afterMeta,
      summary: {
        status: "unavailable",
        likelySource: "invalid-bitmap-data",
      },
    };
  }

  const pixelCount = compareWidth * compareHeight;
  let changedPixels = 0;
  let changedAlphaPixels = 0;
  let maxChannelDelta = 0;
  let totalAbsChannelDelta = 0;
  let minX = compareWidth;
  let minY = compareHeight;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < compareHeight; y += 1) {
    for (let x = 0; x < compareWidth; x += 1) {
      const index = (y * compareWidth + x) * 4;
      const dr = Math.abs(beforeData[index] - afterData[index]);
      const dg = Math.abs(beforeData[index + 1] - afterData[index + 1]);
      const db = Math.abs(beforeData[index + 2] - afterData[index + 2]);
      const da = Math.abs(beforeData[index + 3] - afterData[index + 3]);
      const aggregateDelta = dr + dg + db + da;
      totalAbsChannelDelta += aggregateDelta;
      maxChannelDelta = Math.max(maxChannelDelta, dr, dg, db, da);
      if (aggregateDelta > deltaThreshold) {
        changedPixels += 1;
        if (da > 0) changedAlphaPixels += 1;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }

  const safeDpr = Math.max(
    1,
    toFiniteNumber(afterSnapshot.dpr, toFiniteNumber(beforeSnapshot.dpr, 1))
  );
  const diffBounds = maxX >= minX && maxY >= minY
    ? {
        x: minX / safeDpr,
        y: minY / safeDpr,
        width: (maxX - minX + 1) / safeDpr,
        height: (maxY - minY + 1) / safeDpr,
      }
    : null;
  const changedRatio = pixelCount > 0 ? changedPixels / pixelCount : 0;
  const meanAbsChannelDelta = pixelCount > 0 ? totalAbsChannelDelta / (pixelCount * 4) : 0;
  const likelySource = (() => {
    if (changedPixels === 0) return "none";
    if (
      comparisonKind === "dom-preview-to-dom-editable-caret" &&
      afterSnapshot.caretRequested &&
      afterSnapshot.caretCaptureMode === "synthetic" &&
      diffBounds &&
      diffBounds.width <= 4 &&
      diffBounds.height <= Math.max(8, afterSnapshot.captureRect?.height || 0)
    ) {
      return "caret";
    }
    if (changedRatio <= 0.02 && maxChannelDelta <= 64) return "raster-edge";
    if (comparisonKind === "konva-visible-to-dom-preview") return "rasterization";
    return "mixed";
  })();

  return {
    comparisonKind,
    fromPhase,
    toPhase,
    before: beforeMeta,
    after: afterMeta,
    diff: {
      pixelWidth: compareWidth,
      pixelHeight: compareHeight,
      changedPixels,
      changedRatio: roundNullableMetric(changedRatio),
      changedAlphaPixels,
      meanAbsChannelDelta: roundNullableMetric(meanAbsChannelDelta),
      maxChannelDelta: roundNullableMetric(maxChannelDelta),
      deltaThreshold,
      diffBoundsLocalPx: diffBounds
        ? {
            x: roundNullableMetric(diffBounds.x),
            y: roundNullableMetric(diffBounds.y),
            width: roundNullableMetric(diffBounds.width),
            height: roundNullableMetric(diffBounds.height),
          }
        : null,
    },
    summary: {
      status: changedPixels === 0 ? "identical" : "different",
      likelySource,
    },
  };
}
