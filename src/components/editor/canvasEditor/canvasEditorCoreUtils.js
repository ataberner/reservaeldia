import {
  isBoldFontWeight as isBoldFontWeightShared,
  resolveKonvaFontStyle as resolveKonvaFontStyleShared,
} from "@/components/editor/textSystem/metricsLayout/services/textFontStyleService";

export const ALTURA_REFERENCIA_PANTALLA = 500;
export const ALTURA_PANTALLA_EDITOR = 500;

export function normalizarAltoModo(modo) {
  const m = String(modo || "fijo").toLowerCase();
  return m === "pantalla" ? "pantalla" : "fijo";
}

export const isBoldFontWeight = (weight) => isBoldFontWeightShared(weight);

export const resolveKonvaFontStyle = (fontStyle, fontWeight) =>
  resolveKonvaFontStyleShared(fontStyle, fontWeight);

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
