export type Seccion = {
  id: string;
  orden: number;
  altura: number; // en px (ej: 400, 500...)
};

export function calcularTopPorSeccion(secciones: Seccion[]): Record<string, number> {
  const mapa: Record<string, number> = {};
  let acumulado = 0;

  const ordenadas = [...secciones].sort((a, b) => a.orden - b.orden);

  for (const s of ordenadas) {
    mapa[s.id] = acumulado;
    acumulado += s.altura;
  }

  return mapa;
}
