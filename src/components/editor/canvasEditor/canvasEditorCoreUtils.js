export const ALTURA_REFERENCIA_PANTALLA = 500;
export const ALTURA_PANTALLA_EDITOR = 500;

export function normalizarAltoModo(modo) {
  const m = String(modo || "fijo").toLowerCase();
  return m === "pantalla" ? "pantalla" : "fijo";
}

export function isBoldFontWeight(weight) {
  const normalized = String(weight || "normal").toLowerCase();
  return (
    normalized === "bold" ||
    normalized === "bolder" ||
    ["500", "600", "700", "800", "900"].includes(normalized)
  );
}

export function resolveKonvaFontStyle(fontStyle, fontWeight) {
  const style = String(fontStyle || "normal").toLowerCase();
  const isItalic = style.includes("italic") || style.includes("oblique");
  const isBold = style.includes("bold") || isBoldFontWeight(fontWeight);

  if (isBold && isItalic) return "bold italic";
  if (isBold) return "bold";
  if (isItalic) return "italic";
  return "normal";
}

export const limpiarObjetoUndefined = (obj) => {
  if (Array.isArray(obj)) {
    return obj.map(limpiarObjetoUndefined);
  }

  if (obj !== null && typeof obj === "object") {
    const objLimpio = {};
    Object.keys(obj).forEach((key) => {
      const valor = obj[key];
      if (valor !== undefined) {
        objLimpio[key] = limpiarObjetoUndefined(valor);
      }
    });
    return objLimpio;
  }

  return obj;
};

export function setGlobalCursor(cursor = "", stageRef = null) {
  try {
    document.body.style.cursor = cursor || "";
    const stage = stageRef?.current?.container?.() || null;
    if (stage) stage.style.cursor = cursor || "";
    const canvas = document.querySelector("canvas");
    if (canvas && canvas.parentElement) canvas.parentElement.style.cursor = cursor || "";
  } catch {
    // no-op
  }
}

export function clearGlobalCursor(stageRef = null) {
  setGlobalCursor("", stageRef);
}
