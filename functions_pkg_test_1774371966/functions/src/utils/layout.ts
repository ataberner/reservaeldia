export function convertirAlturaVH(alturaEnVH: number, altoCanvas: number): number {
  return (alturaEnVH / 100) * altoCanvas;
}

export function calcularOffsetY(secciones: { altura: number }[], index: number, altoCanvas: number): number {
  const anteriores = secciones.slice(0, index);
  return anteriores.reduce((acc, s) => acc + convertirAlturaVH(s.altura, altoCanvas), 0);
}
