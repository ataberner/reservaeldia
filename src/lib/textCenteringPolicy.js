function normalizeText(value) {
  return String(value || "").trim().toLowerCase();
}

export function shouldPreserveTextCenterPosition(objeto) {
  if (!objeto || typeof objeto !== "object") return false;
  if (normalizeText(objeto.tipo) !== "texto") return false;
  if (objeto.__groupAlign) return false;

  const width = Number(objeto?.width);
  const hasExplicitFixedWidth = Number.isFinite(width) && width > 0;

  // El preview solo trata como caja fija a los textos con width efectivo.
  // Si no hay width explicito, debemos preservar el centro aunque exista
  // un __autoWidth legado en false.
  if (!hasExplicitFixedWidth) {
    return true;
  }

  // Algunos textos arrastran width serializado pero en el editor se siguen
  // comportando como auto-width; en esos casos mantenemos el centrado.
  return objeto.__autoWidth !== false;
}
