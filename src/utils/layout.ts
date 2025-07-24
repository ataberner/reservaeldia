// src/utils/layout.ts

// ✅ calcularOffsetY
export function calcularOffsetY(secciones: { altura: number }[], index: number): number {
  const anteriores = secciones.slice(0, index);
  return anteriores.reduce((acc, s) => acc + s.altura, 0);
}

// ✅ determinarNuevaSeccion
export const determinarNuevaSeccion = (
  yRelativaConOffset: number,
  seccionActualId: string,
  seccionesOrdenadas: { id: string; altura: number }[]
) => {
  const seccionActual = seccionesOrdenadas.find(s => s.id === seccionActualId);
  if (!seccionActual) return { nuevaSeccion: null, coordenadasAjustadas: {} };

  const yAbsolutaReal = yRelativaConOffset;

  let acumulado = 0;
  for (const seccion of seccionesOrdenadas) {
    if (yAbsolutaReal >= acumulado && yAbsolutaReal < acumulado + seccion.altura) {
      if (seccion.id === seccionActualId) {
        return { nuevaSeccion: null, coordenadasAjustadas: {} };
      }
      const nuevaY = yAbsolutaReal - acumulado;
      return {
        nuevaSeccion: seccion.id,
        coordenadasAjustadas: { y: nuevaY },
      };
    }
    acumulado += seccion.altura;
  }

  if (yAbsolutaReal < 0) {
    return {
      nuevaSeccion: seccionesOrdenadas[0].id,
      coordenadasAjustadas: { y: 0 },
    };
  } else {
    const ultimaSeccion = seccionesOrdenadas[seccionesOrdenadas.length - 1];
    return {
      nuevaSeccion: ultimaSeccion.id,
      coordenadasAjustadas: { y: ultimaSeccion.altura - 50 },
    };
  }
};
