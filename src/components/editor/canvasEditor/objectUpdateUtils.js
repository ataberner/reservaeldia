export function mergeObjectForUpdate(currentObject, nuevo = {}) {
  if (!currentObject) return currentObject;
  const { fromTransform, ...cleanNuevo } = nuevo || {};

  if (currentObject.tipo === "forma" && currentObject.figura === "line") {
    return {
      ...currentObject,
      ...cleanNuevo,
      points: cleanNuevo.points || currentObject.points || [0, 0, 100, 0],
    };
  }

  return { ...currentObject, ...cleanNuevo };
}

export function applyObjectUpdateAtIndex(prevObjects, index, nuevo = {}) {
  if (!Array.isArray(prevObjects)) return prevObjects;
  if (!Number.isInteger(index) || index < 0 || index >= prevObjects.length) return prevObjects;

  const next = [...prevObjects];
  next[index] = mergeObjectForUpdate(next[index], nuevo);
  return next;
}

export function applyObjectUpdateById(prevObjects, id, cambios = {}) {
  if (!Array.isArray(prevObjects) || !id) return prevObjects;
  const index = prevObjects.findIndex((o) => o.id === id);
  if (index === -1) return prevObjects;
  return applyObjectUpdateAtIndex(prevObjects, index, cambios);
}

export function normalizarMedidasGaleria(galeria, widthCandidate, xCandidate) {
  const canvasWidth = 800;
  const rows = Math.max(1, Number(galeria?.rows) || 1);
  const cols = Math.max(1, Number(galeria?.cols) || 1);
  const gap = Math.max(0, Number(galeria?.gap) || 0);
  const cellRatio =
    galeria?.ratio === "4:3"
      ? 3 / 4
      : galeria?.ratio === "16:9"
        ? 9 / 16
        : 1;

  const minGridWidth = gap * (cols - 1) + cols;
  let widthPct = (Number(widthCandidate) / canvasWidth) * 100;
  if (!Number.isFinite(widthPct)) widthPct = Number(galeria?.widthPct);
  if (!Number.isFinite(widthPct)) widthPct = 70;
  widthPct = Math.max(10, Math.min(100, widthPct));

  let width = (canvasWidth * widthPct) / 100;
  width = Math.min(canvasWidth, Math.max(minGridWidth, width));
  widthPct = Math.max(10, Math.min(100, (width / canvasWidth) * 100));

  const maxX = Math.max(0, canvasWidth - width);
  const fallbackX = Number.isFinite(Number(galeria?.x)) ? Number(galeria.x) : 0;
  const rawX = Number.isFinite(Number(xCandidate)) ? Number(xCandidate) : fallbackX;
  const x = Math.max(0, Math.min(rawX, maxX));

  const cellW = Math.max(1, (width - gap * (cols - 1)) / cols);
  const cellH = cellW * cellRatio;
  const height = rows * cellH + gap * (rows - 1);

  return { width, height, widthPct, x };
}

export function applyLineUpdate(prevObjects, lineId, nuevaData = {}) {
  if (!Array.isArray(prevObjects) || !lineId) return prevObjects;
  const index = prevObjects.findIndex((obj) => obj.id === lineId);
  if (index === -1) return prevObjects;

  if (!nuevaData?.isPreview && !nuevaData?.isFinal) return prevObjects;

  const next = [...prevObjects];
  const cleanData = { ...nuevaData };
  delete cleanData.isPreview;
  delete cleanData.isFinal;

  if (cleanData.points) {
    cleanData.points = cleanData.points.map((p) => parseFloat(p) || 0);
  }

  if (cleanData.strokeWidth !== undefined) {
    cleanData.strokeWidth = parseInt(cleanData.strokeWidth, 10) || 2;
  }

  next[index] = { ...next[index], ...cleanData };
  return next;
}
