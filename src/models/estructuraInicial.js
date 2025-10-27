// ✅ Paso 1.1 – Modelo de datos para secciones y objetos (en Firestore)

// Este archivo puede ir en src/models/estructuraInicial.js

export const crearSeccion = ({ tipo = "custom", altura = 300, fondo = "#ffffff" }, seccionesExistentes = []) => {
  const maxOrden = Math.max(-1, ...seccionesExistentes.map(s => s.orden ?? 0));

  return {
    id: `seccion-${Date.now()}`,
    tipo,
    altura,
    fondo,
    orden: maxOrden + 1, // ✅ Siempre consecutivo
  };
};



export const crearObjetoTexto = ({ texto = "Texto", x = 100, y = 100, seccionId }) => {
  return {
    id: `obj-${Date.now()}`,
    tipo: "texto",
    texto,
    x,
    y,
    fontSize: 24,
    color: "#000000",
    fontFamily: "sans-serif",
    fontWeight: "normal",
    fontStyle: "normal",
    textDecoration: "none",
    rotation: 0,
    scaleX: 1,
    scaleY: 1,
    seccionId,
  };
};