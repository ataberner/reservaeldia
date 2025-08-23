// src/components/editor/selection/selectionUtils.js

/**
 * 🎯 Normaliza puntos de línea: asegura 4 valores numéricos.
 * Si falta alguno, usa 0 para inicio y 100 para x2 como fallback.
 */
export function validarPuntosLinea(obj) {
  const puntosActuales = obj.points || [];
  const puntosValidos = [];

  for (let i = 0; i < 4; i++) {
    const valor = parseFloat(puntosActuales[i]);
    puntosValidos.push(isNaN(valor) ? (i === 2 ? 100 : 0) : valor);
  }

  return {
    ...obj,
    points: puntosValidos,
  };
}

/**
 * 🔍 Detecta intersección de una línea con un área rectangular.
 * Usa helpers de colisión línea-rect y línea-línea.
 */
export function detectarInterseccionLinea(lineObj, area, stage) {
  const node = stage.findOne(`#${lineObj.id}`);
  if (!node) return false;

  const nodePos = node.position();
  const points = lineObj.points || [0, 0, 100, 0];

  const cleanPoints = [
    parseFloat(points[0]) || 0,
    parseFloat(points[1]) || 0,
    parseFloat(points[2]) || 100,
    parseFloat(points[3]) || 0,
  ];

  const startX = nodePos.x + cleanPoints[0];
  const startY = nodePos.y + cleanPoints[1];
  const endX = nodePos.x + cleanPoints[2];
  const endY = nodePos.y + cleanPoints[3];

  // ¿alguno de los puntos extremos dentro del área?
  const startDentro =
    startX >= area.x &&
    startX <= area.x + area.width &&
    startY >= area.y &&
    startY <= area.y + area.height;

  const endDentro =
    endX >= area.x &&
    endX <= area.x + area.width &&
    endY >= area.y &&
    endY <= area.y + area.height;

  // chequeo por bounding box de la línea contra el área
  const lineMinX = Math.min(startX, endX);
  const lineMaxX = Math.max(startX, endX);
  const lineMinY = Math.min(startY, endY);
  const lineMaxY = Math.max(startY, endY);

  const areaIntersectaLinea = !(
    area.x > lineMaxX ||
    area.x + area.width < lineMinX ||
    area.y > lineMaxY ||
    area.y + area.height < lineMinY
  );

  return startDentro || endDentro || areaIntersectaLinea;
}

/**
 * Helper: intersección línea con rectángulo (usado internamente).
 */
function lineIntersectsRect(x1, y1, x2, y2, rectLeft, rectTop, rectRight, rectBottom) {
  return (
    lineIntersectsLine(x1, y1, x2, y2, rectLeft, rectTop, rectRight, rectTop) ||
    lineIntersectsLine(x1, y1, x2, y2, rectRight, rectTop, rectRight, rectBottom) ||
    lineIntersectsLine(x1, y1, x2, y2, rectLeft, rectBottom, rectRight, rectBottom) ||
    lineIntersectsLine(x1, y1, x2, y2, rectLeft, rectTop, rectLeft, rectBottom)
  );
}

/**
 * Helper: intersección entre dos segmentos de línea.
 */
function lineIntersectsLine(x1, y1, x2, y2, x3, y3, x4, y4) {
  const denom = (y4 - y3) * (x2 - x1) - (x4 - x3) * (y2 - y1);
  if (denom === 0) return false;

  const ua = ((x4 - x3) * (y1 - y3) - (y4 - y3) * (x1 - x3)) / denom;
  const ub = ((x2 - x1) * (y1 - y3) - (y2 - y1) * (x1 - x3)) / denom;

  return ua >= 0 && ua <= 1 && ub >= 0 && ub <= 1;
}
