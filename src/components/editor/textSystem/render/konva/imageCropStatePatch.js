function toFiniteNumber(value, fallback = null) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function clampNormalizedPosition(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.min(1, numeric));
}

function resolveCurrentObjectYRel(current, {
  usesPantallaMode = false,
  ALTURA_PANTALLA_EDITOR = 1,
} = {}) {
  const persistedY = toFiniteNumber(current?.y, null);
  if (Number.isFinite(persistedY)) {
    return persistedY;
  }

  if (usesPantallaMode) {
    const safePantallaHeight =
      Number.isFinite(Number(ALTURA_PANTALLA_EDITOR)) &&
      Number(ALTURA_PANTALLA_EDITOR) > 0
        ? Number(ALTURA_PANTALLA_EDITOR)
        : 1;
    const normalizedY = toFiniteNumber(current?.yNorm, null);
    if (Number.isFinite(normalizedY)) {
      return normalizedY * safePantallaHeight;
    }
  }

  return 0;
}

export function buildImageCropObjectState({
  current,
  cropAttrs = {},
  seccionesOrdenadas = [],
  convertirAbsARel,
  esSeccionPantallaById,
  ALTURA_PANTALLA_EDITOR,
} = {}) {
  if (!current || current.tipo !== "imagen" || current.esFondo) {
    return current;
  }

  const sectionId = current.seccionId || null;
  const sectionUsesYNorm =
    typeof esSeccionPantallaById === "function"
      ? esSeccionPantallaById(sectionId)
      : false;
  const currentYRel = resolveCurrentObjectYRel(current, {
    usesPantallaMode: sectionUsesYNorm,
    ALTURA_PANTALLA_EDITOR,
  });
  const nextStageY = toFiniteNumber(cropAttrs.y, null);
  const nextYRel =
    Number.isFinite(nextStageY) &&
    typeof convertirAbsARel === "function" &&
    sectionId
      ? convertirAbsARel(nextStageY, sectionId, seccionesOrdenadas)
      : currentYRel;
  const safePantallaHeight =
    Number.isFinite(Number(ALTURA_PANTALLA_EDITOR)) &&
    Number(ALTURA_PANTALLA_EDITOR) > 0
      ? Number(ALTURA_PANTALLA_EDITOR)
      : 1;

  const nextObject = {
    ...current,
    x: Number.isFinite(cropAttrs.x) ? cropAttrs.x : current.x,
    y: Number.isFinite(nextYRel) ? nextYRel : current.y,
    width: Number.isFinite(cropAttrs.width) ? cropAttrs.width : current.width,
    height: Number.isFinite(cropAttrs.height) ? cropAttrs.height : current.height,
    cropX: Number.isFinite(cropAttrs.cropX) ? cropAttrs.cropX : current.cropX,
    cropY: Number.isFinite(cropAttrs.cropY) ? cropAttrs.cropY : current.cropY,
    cropWidth: Number.isFinite(cropAttrs.cropWidth)
      ? cropAttrs.cropWidth
      : current.cropWidth,
    cropHeight: Number.isFinite(cropAttrs.cropHeight)
      ? cropAttrs.cropHeight
      : current.cropHeight,
    ancho: Number.isFinite(cropAttrs.ancho) ? cropAttrs.ancho : current.ancho,
    alto: Number.isFinite(cropAttrs.alto) ? cropAttrs.alto : current.alto,
    rotation: Number.isFinite(cropAttrs.rotation)
      ? cropAttrs.rotation
      : (current.rotation || 0),
    scaleX: 1,
    scaleY: 1,
  };

  if (sectionUsesYNorm && Number.isFinite(nextYRel)) {
    nextObject.yNorm = clampNormalizedPosition(nextYRel / safePantallaHeight);
  } else {
    delete nextObject.yNorm;
  }

  return nextObject;
}
