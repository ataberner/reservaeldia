// src/utils/calcGrid.js

/**
 * cellRatio = ALTO/ANCHO por celda (1 -> 1:1, 3/4 -> 4:3, 9/16 -> 16:9)
 * width = ancho del grupo (frame)
 * Devuelve rects (x,y,width,height) y el alto total necesario del grupo.
 */
export function calcGalleryLayout({ width, rows, cols, gap, cellRatio }) {
  const totalGapX = gap * (cols - 1);
  const totalGapY = gap * (rows - 1);

  // Ancho de cada celda
  const cellW = (width - totalGapX) / cols;
  const cellH = cellW * cellRatio;

  // Alto total del grupo para que las celdas respeten la proporción
  const totalHeight = rows * cellH + totalGapY;

  const rects = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      rects.push({
        x: c * (cellW + gap),
        y: r * (cellH + gap),
        width: cellW,
        height: cellH,
      });
    }
  }

  return { rects, totalHeight };
}
