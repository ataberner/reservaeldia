export function lineIntersectsLine(x1, y1, x2, y2, x3, y3, x4, y4) {
  const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
  if (Math.abs(denom) < 0.0001) return false;

  const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;
  const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / denom;

  return t >= 0 && t <= 1 && u >= 0 && u <= 1;
}

export function lineIntersectsRect(
  x1,
  y1,
  x2,
  y2,
  rectLeft,
  rectTop,
  rectRight,
  rectBottom
) {
  return (
    lineIntersectsLine(x1, y1, x2, y2, rectLeft, rectTop, rectRight, rectTop) ||
    lineIntersectsLine(x1, y1, x2, y2, rectRight, rectTop, rectRight, rectBottom) ||
    lineIntersectsLine(x1, y1, x2, y2, rectLeft, rectBottom, rectRight, rectBottom) ||
    lineIntersectsLine(x1, y1, x2, y2, rectLeft, rectTop, rectLeft, rectBottom)
  );
}

export function createLineIntersectionDetector() {
  return (lineObj, area, stage) => {
    try {
      if (!lineObj || !area || !lineObj.points) return false;

      let points = lineObj.points;
      if (!Array.isArray(points) || points.length < 4) {
        points = [0, 0, 100, 0];
      }

      const puntosLimpios = [
        parseFloat(points[0]) || 0,
        parseFloat(points[1]) || 0,
        parseFloat(points[2]) || 100,
        parseFloat(points[3]) || 0,
      ];

      const node = window._elementRefs?.[lineObj.id];
      const lineX = node ? node.x() : lineObj.x || 0;
      const lineY = node ? node.y() : lineObj.y || 0;

      const startX = lineX + puntosLimpios[0];
      const startY = lineY + puntosLimpios[1];
      const endX = lineX + puntosLimpios[2];
      const endY = lineY + puntosLimpios[3];

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

      if (startDentro || endDentro) {
        return true;
      }

      const intersecta = lineIntersectsRect(
        startX,
        startY,
        endX,
        endY,
        area.x,
        area.y,
        area.x + area.width,
        area.y + area.height
      );

      if (intersecta) {
        return true;
      }

      return false;
    } catch (error) {
      return false;
    }
  };
}
