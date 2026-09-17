// Shared by the renderer and content measurement; this does not resize an object.
export function resolveTextBoxLayout(object, realTextWidth) {
  const validX = typeof object.x === "number" && !isNaN(object.x) ? object.x : 0;
  const availableWidth = Math.max(1, 800 - validX);
  const fixedWidth = Number(object.width);
  const fixed = object.__autoWidth === false && Number.isFinite(fixedWidth) && fixedWidth > 0;
  const wrapToEdge = !fixed && realTextWidth > availableWidth;
  const width = fixed ? fixedWidth : (wrapToEdge ? availableWidth : undefined);
  const wrap = fixed
    ? (String(object.textWrapMode || "").trim().toLowerCase() === "char" ? "char" : "word")
    : (wrapToEdge ? "char" : "none");
  const visualWidth = Math.max(0, Number(width ?? realTextWidth) || 0);
  const align = String(object.align || "left").trim().toLowerCase();
  const offsetX = align === "center" ? visualWidth / 2 : align === "right" ? visualWidth : 0;
  return { width, wrap, offsetX, availableWidth, visualTextBoxWidth: visualWidth };
}
