import { resolveCountdownTargetIso } from "../../../shared/renderContractPolicy.js";

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

export function applyCountdownPresetToExisting(
  currentCountdown,
  preparedCountdown
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

  return {
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
}
