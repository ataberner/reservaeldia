import { resolveCountdownTargetIso } from "../../../shared/renderContractPolicy.js";
import { resolveCountdownEffectiveGeometry } from "./effectiveGeometry.js";

export const COUNTDOWN_PRESET_STYLE_KEYS = Object.freeze([
  "fontFamily",
  "fontSize",
  "color",
  "labelColor",
  "showLabels",
  "boxBg",
  "boxBorder",
  "boxRadius",
  "boxShadow",
  "separator",
  "gap",
  "paddingX",
  "paddingY",
  "chipWidth",
  "labelSize",
  "letterSpacing",
  "lineHeight",
  "padZero",
  "layout",
  "background",
  "countdownSchemaVersion",
  "presetVersion",
  "tamanoBase",
  "layoutType",
  "distribution",
  "visibleUnits",
  "framePadding",
  "frameScale",
  "frameSvgUrl",
  "frameAssetType",
  "frameMimeType",
  "frameIntrinsicWidth",
  "frameIntrinsicHeight",
  "frameColorMode",
  "frameColor",
  "entryAnimation",
  "tickAnimation",
  "frameAnimation",
  "labelTransform",
  "presetPropsVersion",
]);

export function buildCountdownPresetStylePatch(source = {}) {
  return COUNTDOWN_PRESET_STYLE_KEYS.reduce((patch, key) => {
    patch[key] = source[key];
    return patch;
  }, {});
}

function preserveFiniteDimension(nextValue, currentValue) {
  const parsed = Number(nextValue);
  if (Number.isFinite(parsed) && parsed > 0) return parsed;
  return currentValue;
}

function toFinite(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function resolveCountdownRootY(countdown, pantallaHeight) {
  const safePantallaHeight = Number(pantallaHeight);
  const yNorm = Number(countdown?.yNorm);
  if (
    Number.isFinite(safePantallaHeight) &&
    safePantallaHeight > 0 &&
    Number.isFinite(yNorm)
  ) {
    return yNorm * safePantallaHeight;
  }
  return toFinite(countdown?.y, 0);
}

function resolveTransformedCenterOffset(countdown, bounds) {
  const localCenterX = bounds.x + bounds.width / 2;
  const localCenterY = bounds.y + bounds.height / 2;
  const scaleX = toFinite(countdown?.scaleX, 1) || 1;
  const scaleY = toFinite(countdown?.scaleY, 1) || 1;
  const radians = (toFinite(countdown?.rotation, 0) * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const scaledCenterX = localCenterX * scaleX;
  const scaledCenterY = localCenterY * scaleY;

  return {
    x: scaledCenterX * cos - scaledCenterY * sin,
    y: scaledCenterX * sin + scaledCenterY * cos,
  };
}

export function resolveCountdownVisualCenter(
  countdown,
  { pantallaHeight = null } = {}
) {
  const geometry = resolveCountdownEffectiveGeometry(countdown);
  const offset = resolveTransformedCenterOffset(
    countdown,
    geometry.effectiveBounds
  );

  return {
    x: toFinite(countdown?.x, 0) + offset.x,
    y: resolveCountdownRootY(countdown, pantallaHeight) + offset.y,
  };
}

export function applyCountdownPresetToExisting(
  currentCountdown,
  preparedCountdown,
  { pantallaHeight = null } = {}
) {
  if (
    !currentCountdown ||
    currentCountdown.tipo !== "countdown" ||
    !preparedCountdown ||
    preparedCountdown.tipo !== "countdown"
  ) {
    return currentCountdown;
  }

  const currentTarget = resolveCountdownTargetIso(currentCountdown);
  const preparedTarget = resolveCountdownTargetIso(preparedCountdown);
  const preservedTarget = currentTarget.targetISO || preparedTarget.targetISO;
  const stylePatch = buildCountdownPresetStylePatch(preparedCountdown);
  const nextCountdown = {
    ...currentCountdown,
    ...stylePatch,
    width: preserveFiniteDimension(
      preparedCountdown.width,
      currentCountdown.width
    ),
    height: preserveFiniteDimension(
      preparedCountdown.height,
      currentCountdown.height
    ),
    scaleX: 1,
    scaleY: 1,
    fechaObjetivo: preservedTarget,
    mostrarCuentaRegresiva:
      preparedCountdown.mostrarCuentaRegresiva !== false,
    presetId: preparedCountdown.presetId,
    id: currentCountdown.id,
    seccionId: currentCountdown.seccionId,
    x: currentCountdown.x,
    y: currentCountdown.y,
  };
  const isPresetApplication =
    String(preparedCountdown.presetId || "").trim().length > 0;
  if (!isPresetApplication) return nextCountdown;

  const currentCenter = resolveCountdownVisualCenter(currentCountdown, {
    pantallaHeight,
  });
  const nextGeometry = resolveCountdownEffectiveGeometry(nextCountdown);
  const nextWithRealDimensions = {
    ...nextCountdown,
    width: nextGeometry.width,
    height: nextGeometry.height,
  };
  const nextOffset = resolveTransformedCenterOffset(
    nextWithRealDimensions,
    nextGeometry.effectiveBounds
  );
  const nextRootX = currentCenter.x - nextOffset.x;
  const nextRootY = currentCenter.y - nextOffset.y;
  const currentRootY = resolveCountdownRootY(
    currentCountdown,
    pantallaHeight
  );
  const rootDeltaY = nextRootY - currentRootY;
  const safePantallaHeight = Number(pantallaHeight);
  const usesNormalizedY =
    Number.isFinite(safePantallaHeight) &&
    safePantallaHeight > 0 &&
    Number.isFinite(Number(currentCountdown.yNorm));

  return {
    ...nextWithRealDimensions,
    x: nextRootX,
    y: Number.isFinite(Number(currentCountdown.y))
      ? Number(currentCountdown.y) + rootDeltaY
      : currentCountdown.y,
    ...(usesNormalizedY
      ? { yNorm: nextRootY / safePantallaHeight }
      : { y: nextRootY }),
  };
}
