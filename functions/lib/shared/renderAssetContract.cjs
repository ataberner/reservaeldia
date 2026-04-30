function asObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value;
}

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeLowerText(value) {
  return normalizeText(value).toLowerCase();
}

function isRasterIconObject(value) {
  const safeValue = asObject(value);
  if (normalizeLowerText(safeValue.tipo) !== "icono") return false;
  return normalizeLowerText(safeValue.formato) !== "svg";
}

function isPrimaryObjectAssetObject(value) {
  const safeValue = asObject(value);
  const tipo = normalizeLowerText(safeValue.tipo);
  return tipo === "imagen" || isRasterIconObject(safeValue);
}

function resolveObjectPrimaryAssetUrl(value) {
  const safeValue = asObject(value);
  if (!isPrimaryObjectAssetObject(safeValue)) return "";
  return normalizeText(safeValue.src) || normalizeText(safeValue.url);
}

function resolveGalleryCellMediaUrl(value) {
  const safeValue = asObject(value);
  return (
    normalizeText(safeValue.mediaUrl) ||
    normalizeText(safeValue.url) ||
    normalizeText(safeValue.src)
  );
}

function resolveSectionDecorationAssetUrl(value) {
  const safeValue = asObject(value);
  return normalizeText(safeValue.src) || normalizeText(safeValue.url);
}

function resolveSectionEdgeDecorationAssetUrl(value) {
  return resolveSectionDecorationAssetUrl(value);
}

function normalizeRenderAssetObject(value) {
  const safeValue = asObject(value);
  if (!safeValue || Object.keys(safeValue).length === 0) return value;

  let next = safeValue;
  if (normalizeLowerText(safeValue.tipo) === "grupo" && Array.isArray(safeValue.children)) {
    next = {
      ...next,
      children: safeValue.children.map((child) => normalizeRenderAssetObject(child)),
    };
  }

  const primaryAssetUrl = resolveObjectPrimaryAssetUrl(safeValue);
  if (primaryAssetUrl) {
    next = {
      ...next,
      src: primaryAssetUrl,
    };
  }

  if (normalizeLowerText(safeValue.tipo) === "galeria" && Array.isArray(safeValue.cells)) {
    next = {
      ...next,
      cells: safeValue.cells.map((cell) => normalizeGalleryCellRecord(cell)),
    };
  }

  const frameSvgUrl = normalizeText(safeValue.frameSvgUrl);
  if (frameSvgUrl) {
    next = {
      ...next,
      frameSvgUrl,
    };
  }

  return next;
}

function normalizeGalleryCellRecord(value) {
  const safeValue = asObject(value);
  if (!safeValue || Object.keys(safeValue).length === 0) return value;

  const mediaUrl = resolveGalleryCellMediaUrl(safeValue);
  if (!mediaUrl) return safeValue;

  return {
    ...safeValue,
    mediaUrl,
  };
}

function normalizeSectionDecorationRecord(value) {
  const safeValue = asObject(value);
  if (!safeValue || Object.keys(safeValue).length === 0) return value;

  const src = resolveSectionDecorationAssetUrl(safeValue);
  if (!src) return safeValue;

  return {
    ...safeValue,
    src,
  };
}

function normalizeSectionEdgeDecorationRecord(value) {
  const safeValue = asObject(value);
  if (!safeValue || Object.keys(safeValue).length === 0) return value;

  const src = resolveSectionEdgeDecorationAssetUrl(safeValue);
  if (!src) return safeValue;

  return {
    ...safeValue,
    src,
  };
}

function normalizeSectionDecorationsValue(value) {
  const safeValue = asObject(value);
  if (!safeValue || Object.keys(safeValue).length === 0) return value;

  const next = {
    ...safeValue,
  };

  if (Array.isArray(safeValue.items)) {
    next.items = safeValue.items.map((item) => normalizeSectionDecorationRecord(item));
  }

  if (safeValue.superior && typeof safeValue.superior === "object" && !Array.isArray(safeValue.superior)) {
    next.superior = normalizeSectionDecorationRecord(safeValue.superior);
  }

  if (safeValue.inferior && typeof safeValue.inferior === "object" && !Array.isArray(safeValue.inferior)) {
    next.inferior = normalizeSectionDecorationRecord(safeValue.inferior);
  }

  return next;
}

function normalizeSectionEdgeDecorationsValue(value) {
  const safeValue = asObject(value);
  if (!safeValue || Object.keys(safeValue).length === 0) return value;

  const next = {
    ...safeValue,
  };

  if (safeValue.top && typeof safeValue.top === "object" && !Array.isArray(safeValue.top)) {
    next.top = normalizeSectionEdgeDecorationRecord(safeValue.top);
  }

  if (safeValue.bottom && typeof safeValue.bottom === "object" && !Array.isArray(safeValue.bottom)) {
    next.bottom = normalizeSectionEdgeDecorationRecord(safeValue.bottom);
  }

  return next;
}

function normalizeRenderAssetSection(value) {
  const safeValue = asObject(value);
  if (!safeValue || Object.keys(safeValue).length === 0) return value;

  const next = {
    ...safeValue,
  };

  const fondoImagen = normalizeText(safeValue.fondoImagen);
  if (fondoImagen) {
    next.fondoImagen = fondoImagen;
  }

  if (safeValue.decoracionesFondo && typeof safeValue.decoracionesFondo === "object") {
    next.decoracionesFondo = normalizeSectionDecorationsValue(safeValue.decoracionesFondo);
  }

  if (safeValue.decoracionesBorde && typeof safeValue.decoracionesBorde === "object") {
    next.decoracionesBorde = normalizeSectionEdgeDecorationsValue(safeValue.decoracionesBorde);
  }

  return next;
}

function normalizeRenderAssetState(value) {
  const safeValue = asObject(value);
  return {
    objetos: Array.isArray(safeValue.objetos)
      ? safeValue.objetos.map((item) => normalizeRenderAssetObject(item))
      : [],
    secciones: Array.isArray(safeValue.secciones)
      ? safeValue.secciones.map((item) => normalizeRenderAssetSection(item))
      : [],
  };
}

module.exports = {
  isRasterIconObject,
  resolveObjectPrimaryAssetUrl,
  resolveGalleryCellMediaUrl,
  resolveSectionDecorationAssetUrl,
  resolveSectionEdgeDecorationAssetUrl,
  normalizeRenderAssetObject,
  normalizeGalleryCellRecord,
  normalizeSectionDecorationRecord,
  normalizeSectionEdgeDecorationRecord,
  normalizeRenderAssetSection,
  normalizeRenderAssetState,
};
