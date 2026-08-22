function toFiniteNumber(value, fallback = 0) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : fallback;
}

export function buildGalleryDragPreviewRows(rows, fromIndex, toIndex) {
  if (!Array.isArray(rows) || rows.length < 2) return rows;

  const from = Number(fromIndex);
  const to = Number(toIndex);
  if (
    !Number.isInteger(from) ||
    !Number.isInteger(to) ||
    from < 0 ||
    to < 0 ||
    from >= rows.length ||
    to >= rows.length ||
    from === to
  ) {
    return rows;
  }

  const nextRows = [...rows];
  const [draggedRow] = nextRows.splice(from, 1);
  nextRows.splice(to, 0, draggedRow);
  return nextRows;
}

export function createGalleryDragHitGeometry({
  listTop = 0,
  scrollTop = 0,
  rowRects = [],
} = {}) {
  if (!Array.isArray(rowRects) || rowRects.length === 0) return null;

  const safeListTop = toFiniteNumber(listTop);
  const safeScrollTop = toFiniteNumber(scrollTop);
  const rowMidpoints = rowRects.map((rect) => {
    const top = Number(rect?.top);
    const height = Number(rect?.height);
    if (!Number.isFinite(top) || !Number.isFinite(height)) return null;
    return top - safeListTop + safeScrollTop + Math.max(0, height) / 2;
  });

  if (rowMidpoints.some((midpoint) => midpoint === null)) return null;

  return { rowMidpoints };
}

export function resolveGalleryDragDropIndex({
  clientY,
  geometry,
  listTop = 0,
  scrollTop = 0,
} = {}) {
  const pointerY = Number(clientY);
  const rowMidpoints = geometry?.rowMidpoints;
  if (!Number.isFinite(pointerY) || !Array.isArray(rowMidpoints) || rowMidpoints.length === 0) {
    return -1;
  }

  const contentY =
    pointerY - toFiniteNumber(listTop) + toFiniteNumber(scrollTop);

  for (let index = 0; index < rowMidpoints.length; index += 1) {
    if (contentY < rowMidpoints[index]) return index;
  }

  return rowMidpoints.length - 1;
}
