const DEFAULT_SHAPE_COLOR = "#111827";

const SHAPE_EXTRA_PROPS = {
  line: { points: [0, 0, 120, 0], strokeWidth: 3 },
  circle: { radius: 50 },
  triangle: { radius: 60 },
  diamond: { width: 120, height: 120 },
  star: { width: 120, height: 120 },
  heart: { width: 120, height: 108 },
  arrow: { width: 160, height: 90 },
  pentagon: { width: 120, height: 120 },
  hexagon: { width: 128, height: 112 },
  pill: { width: 170, height: 72, cornerRadius: 36 },
};

function parseOptionalPositiveInteger(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.round(parsed);
}

function cloneShapeExtraProps(figura) {
  const extraProps = SHAPE_EXTRA_PROPS[figura];
  if (!extraProps) return {};
  return Object.fromEntries(
    Object.entries(extraProps).map(([key, value]) => [
      key,
      Array.isArray(value) ? [...value] : value,
    ])
  );
}

export function buildShapeInsertPayload(shapeItem, timestamp = Date.now()) {
  const figura = shapeItem?.figura || "rect";
  return {
    id: `forma-${timestamp.toString(36)}`,
    tipo: "forma",
    figura,
    color: shapeItem?.color || DEFAULT_SHAPE_COLOR,
    texto: "",
    fontSize: 24,
    fontFamily: "sans-serif",
    fontWeight: "normal",
    fontStyle: "normal",
    colorTexto: "#111827",
    align: "center",
    ...cloneShapeExtraProps(figura),
  };
}

export function buildRasterIconInsertPayload(src, format, timestamp = Date.now()) {
  return {
    id: `icono-${timestamp.toString(36)}`,
    tipo: "icono",
    formato: format || "png",
    colorizable: false,
    src,
  };
}

export function buildDecorImageInsertPayload(item, timestamp = Date.now()) {
  const src = String(item?.src || "").trim();
  if (!src) return null;

  const width = parseOptionalPositiveInteger(item?.width);
  const height = parseOptionalPositiveInteger(item?.height);
  const payload = {
    id: `imagen-${timestamp.toString(36)}`,
    tipo: "imagen",
    src,
  };

  if (width) payload.ancho = width;
  if (height) payload.alto = height;

  return payload;
}
