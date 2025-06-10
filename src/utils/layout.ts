// Calcula el desplazamiento vertical de una sección
export function calcularOffsetY(secciones: { altura: number }[], index: number): number {
  const anteriores = secciones.slice(0, index);
  return anteriores.reduce((acc, s) => acc + s.altura, 0);
}
