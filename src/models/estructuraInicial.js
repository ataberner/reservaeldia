// ✅ Paso 1.1 – Modelo de datos para secciones y objetos (en Firestore)
import { buildSectionDecorationsPayload } from "@/domain/sections/backgrounds";

function sanitizeDecoracionesFondo(rawDecoracionesFondo, altura = 300) {
  return buildSectionDecorationsPayload(
    {
      altura,
      decoracionesFondo: rawDecoracionesFondo,
    },
    {
      sectionHeight: altura,
    }
  );
}

export const crearSeccion = (datos = {}, seccionesExistentes = []) => {
  const {
    tipo = "custom",
    altura = 300,
    fondo = "#ffffff",
    fondoTipo,
    fondoImagen,
    fondoImagenOffsetX,
    fondoImagenOffsetY,
    fondoImagenScale,
    fondoImagenDraggable,
    altoModo,
    alturaFijoBackup,
    decoracionesFondo,
  } = datos;
  const maxOrden = Math.max(-1, ...seccionesExistentes.map((s) => s.orden ?? 0));

  return {
    id: `seccion-${Date.now()}`,
    tipo,
    altura,
    fondo,
    ...(typeof fondoTipo === "string" && fondoTipo.trim() ? { fondoTipo: fondoTipo.trim() } : {}),
    ...(typeof fondoImagen === "string" && fondoImagen.trim()
      ? { fondoImagen: fondoImagen.trim() }
      : {}),
    ...(Number.isFinite(Number(fondoImagenOffsetX))
      ? { fondoImagenOffsetX: Number(fondoImagenOffsetX) }
      : {}),
    ...(Number.isFinite(Number(fondoImagenOffsetY))
      ? { fondoImagenOffsetY: Number(fondoImagenOffsetY) }
      : {}),
    ...(Number.isFinite(Number(fondoImagenScale))
      ? { fondoImagenScale: Math.max(1, Number(fondoImagenScale)) }
      : {}),
    ...(typeof fondoImagenDraggable === "boolean"
      ? { fondoImagenDraggable }
      : {}),
    ...(typeof altoModo === "string" && altoModo.trim() ? { altoModo: altoModo.trim() } : {}),
    ...(Number.isFinite(Number(alturaFijoBackup))
      ? { alturaFijoBackup: Number(alturaFijoBackup) }
      : {}),
    decoracionesFondo: sanitizeDecoracionesFondo(decoracionesFondo, altura),
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
