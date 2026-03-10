import { roundMetric } from "@/components/editor/overlays/inlineEditor/inlineEditorNumeric";

function toFiniteNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function roundNullable(value) {
  const numeric = toFiniteNumber(value);
  return numeric === null ? null : roundMetric(numeric);
}

function parsePxToNumber(value) {
  if (typeof value !== "string") return null;
  const numeric = Number.parseFloat(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function readKonvaNodeValue(node, key) {
  if (!node) return null;
  try {
    const fn = node?.[key];
    if (typeof fn === "function") {
      const value = fn.call(node);
      if (typeof value !== "undefined") return value;
    }
  } catch {
    // no-op
  }
  try {
    if (typeof node?.getAttr === "function") {
      const attrValue = node.getAttr(key);
      if (typeof attrValue !== "undefined") return attrValue;
    }
  } catch {
    // no-op
  }
  return null;
}

function readKonvaMeasuredTextWidth(node) {
  if (!node) return null;
  try {
    const textValue = readKonvaNodeValue(node, "text");
    const textString = String(textValue || "");
    const measureSizeFn = node?.measureSize;
    if (typeof measureSizeFn === "function") {
      const measured = measureSizeFn.call(node, textString);
      return toFiniteNumber(measured?.width);
    }
  } catch {
    // no-op
  }
  return null;
}

export function buildInlineTextBoxesPayload({
  konvaNode = null,
  projectedKonvaRect = null,
  projectedKonvaRectRaw = null,
  domRect = null,
  domElement = null,
  domComputedStyle = null,
  totalScaleX = null,
  totalScaleY = null,
  domPerceptualScale = null,
  domPerceptualScaleModel = null,
}) {
  const konvaScaleX = toFiniteNumber(readKonvaNodeValue(konvaNode, "scaleX"));
  const konvaScaleY = toFiniteNumber(readKonvaNodeValue(konvaNode, "scaleY"));
  const konvaFontSize = toFiniteNumber(readKonvaNodeValue(konvaNode, "fontSize"));
  const konvaLineHeight = toFiniteNumber(readKonvaNodeValue(konvaNode, "lineHeight"));
  const konvaMeasuredTextWidth = readKonvaMeasuredTextWidth(konvaNode);
  const rawKonvaWidth = toFiniteNumber(projectedKonvaRectRaw?.width);
  const rawKonvaHeight = toFiniteNumber(projectedKonvaRectRaw?.height);
  const projectedKonvaWidth = toFiniteNumber(projectedKonvaRect?.width);
  const projectedKonvaHeight = toFiniteNumber(projectedKonvaRect?.height);
  const projectedScaleX =
    rawKonvaWidth !== null && projectedKonvaWidth !== null && Math.abs(rawKonvaWidth) > 0.0001
      ? projectedKonvaWidth / rawKonvaWidth
      : null;
  const projectedScaleY =
    rawKonvaHeight !== null && projectedKonvaHeight !== null && Math.abs(rawKonvaHeight) > 0.0001
      ? projectedKonvaHeight / rawKonvaHeight
      : null;
  const effectiveScaleX =
    toFiniteNumber(totalScaleX) ?? toFiniteNumber(projectedScaleX) ?? konvaScaleX ?? 1;
  const effectiveScaleY =
    toFiniteNumber(totalScaleY) ?? toFiniteNumber(projectedScaleY) ?? konvaScaleY ?? 1;
  const konvaEffectiveFontSize =
    konvaFontSize !== null ? konvaFontSize * Math.abs(effectiveScaleY) : null;

  const domFontSizePx = parsePxToNumber(domComputedStyle?.fontSize);
  const domLineHeightPx = parsePxToNumber(domComputedStyle?.lineHeight);

  const konva = {
    x: roundNullable(projectedKonvaRect?.x),
    y: roundNullable(projectedKonvaRect?.y),
    width: roundNullable(projectedKonvaRect?.width),
    height: roundNullable(projectedKonvaRect?.height),
    scaleX: roundNullable(konvaScaleX),
    scaleY: roundNullable(konvaScaleY),
    effectiveScaleX: roundNullable(effectiveScaleX),
    effectiveScaleY: roundNullable(effectiveScaleY),
    fontSize: roundNullable(konvaFontSize),
    effectiveFontSize: roundNullable(konvaEffectiveFontSize),
    lineHeight: roundNullable(konvaLineHeight),
    measuredTextWidth: roundNullable(konvaMeasuredTextWidth),
  };

  const dom = {
    x: roundNullable(domRect?.x),
    y: roundNullable(domRect?.y),
    width: roundNullable(domRect?.width),
    height: roundNullable(domRect?.height),
    clientWidth: roundNullable(domElement?.clientWidth),
    scrollWidth: roundNullable(domElement?.scrollWidth),
    offsetWidth: roundNullable(domElement?.offsetWidth),
    boundingWidth: roundNullable(domRect?.width),
    boundingHeight: roundNullable(domRect?.height),
    fontSize: roundNullable(domFontSizePx),
    lineHeight: roundNullable(domLineHeightPx),
    fontWeight: domComputedStyle?.fontWeight ?? null,
    fontFamily: domComputedStyle?.fontFamily ?? null,
    perceptualScale: roundNullable(domPerceptualScale),
    perceptualScaleSource: domPerceptualScaleModel?.source ?? null,
    perceptualScaleWidthRatio: roundNullable(domPerceptualScaleModel?.widthRatio),
    perceptualScaleDomProbeWidthPx: roundNullable(domPerceptualScaleModel?.domProbeWidthPx),
    perceptualScaleCanvasProbeWidthPx: roundNullable(domPerceptualScaleModel?.canvasProbeWidthPx),
    perceptualScaleCanvasProbeInkWidthPx: roundNullable(
      domPerceptualScaleModel?.canvasProbeInkWidthPx
    ),
  };

  const scaleDifference =
    effectiveScaleX !== null && effectiveScaleY !== null
      ? roundMetric((Math.abs(effectiveScaleX) + Math.abs(effectiveScaleY)) / 2 - 1)
      : null;

  const delta = {
    dx:
      toFiniteNumber(domRect?.x) !== null && toFiniteNumber(projectedKonvaRect?.x) !== null
        ? roundMetric(Number(domRect.x) - Number(projectedKonvaRect.x))
        : null,
    dy:
      toFiniteNumber(domRect?.y) !== null && toFiniteNumber(projectedKonvaRect?.y) !== null
        ? roundMetric(Number(domRect.y) - Number(projectedKonvaRect.y))
        : null,
    dWidth:
      toFiniteNumber(domRect?.width) !== null && toFiniteNumber(projectedKonvaRect?.width) !== null
        ? roundMetric(Number(domRect.width) - Number(projectedKonvaRect.width))
        : null,
    dHeight:
      toFiniteNumber(domRect?.height) !== null && toFiniteNumber(projectedKonvaRect?.height) !== null
        ? roundMetric(Number(domRect.height) - Number(projectedKonvaRect.height))
        : null,
    scaleDifference: roundNullable(scaleDifference),
    scaleDifferenceX: roundNullable(
      effectiveScaleX !== null ? effectiveScaleX - 1 : null
    ),
    scaleDifferenceY: roundNullable(
      effectiveScaleY !== null ? effectiveScaleY - 1 : null
    ),
    fontSizeDifference:
      domFontSizePx !== null && konvaFontSize !== null
        ? roundMetric(domFontSizePx - konvaFontSize)
        : null,
    fontSizeDifferenceEffective:
      domFontSizePx !== null && konvaEffectiveFontSize !== null
        ? roundMetric(domFontSizePx - konvaEffectiveFontSize)
        : null,
  };

  return {
    konva,
    dom,
    delta,
  };
}
