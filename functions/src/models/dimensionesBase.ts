// Dimensiones del canvas de diseño (referencia absoluta)
export const CANVAS_BASE = {
  ANCHO: 800,
  ALTO_MINIMO: 1200, // altura mínima recomendada para una invitación
};

// Alturas predefinidas en píxeles (optimizadas para visualización final)
export const ALTURAS_SECCIONES = [
  { px: 40, label: "Compacta (40px)", descripcion: "Headers, navegación" },
  { px: 60, label: "Pequeña (60px)", descripcion: "Contenido básico" },
  { px: 120, label: "Media (120px)", descripcion: "Contenido estándar" },
  { px: 300, label: "Grande (300px)", descripcion: "Sección destacada" },
  { px: 400, label: "Muy Grande (400px)", descripcion: "Pantalla completa" },
  { px: 500, label: "Extra Grande (500px)", descripcion: "Pantalla completa en desktop" },
];

// Función para calcular el factor de escala según el ancho del viewport
export function calcularFactorEscala(anchoViewport: number): number {
  // En móvil (< 768px): escala para que el ancho encaje
  if (anchoViewport < 768) {
    return Math.min(anchoViewport / CANVAS_BASE.ANCHO, 1);
  }
  
  // En desktop: escala para mantener proporciones legibles
  return Math.min(anchoViewport / CANVAS_BASE.ANCHO, 1.2);
}