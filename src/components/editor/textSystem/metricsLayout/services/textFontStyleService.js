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
