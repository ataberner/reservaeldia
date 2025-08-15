// components/MiniToolbar.jsx
import React from "react";
import GaleriaDeImagenes from "@/components/GaleriaDeImagenes";


export default function MiniToolbar({
  botonActivo,
  onAgregarTexto,
  onAgregarForma,
  onAgregarImagen,
  onCrearPlantilla,
  onBorrarTodos,
  onAbrirModalSeccion,
  mostrarGaleria,
  setMostrarGaleria,
  abrirSelector,
  imagenes,
  imagenesEnProceso,
  cargarImagenes,
  borrarImagen,
  hayMas,
  cargando,
  seccionActivaId,
  setImagenesSeleccionadas
}) {

  if (!botonActivo) return null;

  return (
    <div className="flex flex-col gap-4">
      {botonActivo === "texto" && (
        <button
          onClick={onAgregarTexto}
          className="flex items-center gap-2 w-full bg-purple-100 hover:bg-purple-200 text-purple-800 font-medium py-2 px-4 rounded-xl shadow-sm transition-all"
        >
          <span className="text-lg">📝</span>
          <span>Añadir texto</span>
        </button>
      )}

      {botonActivo === "forma" && (
        <button
          onClick={onAgregarForma}
          className="flex items-center gap-2 w-full bg-yellow-100 hover:bg-yellow-200 text-yellow-800 font-medium py-2 px-4 rounded-xl shadow-sm transition-all"
        >
          <span className="text-lg">🔷</span>
          <span>Añadir forma</span>
        </button>
      )}

      {botonActivo === "imagen" && (
        <>
          <button
            onClick={abrirSelector}
            className="flex items-center gap-2 w-full bg-purple-100 hover:bg-purple-200 text-purple-800 font-medium py-2 px-4 rounded-xl shadow-sm transition-all"
          >
            <span className="text-lg">📤</span>
            <span>Subir imagen</span>
          </button>

          <div className="flex-1 overflow-y-auto min-h-0">
            <GaleriaDeImagenes
              imagenes={imagenes || []}
              imagenesEnProceso={imagenesEnProceso || []}
              cargarImagenes={cargarImagenes}
              borrarImagen={borrarImagen}
              hayMas={hayMas}
              seccionActivaId={seccionActivaId}
              cargando={cargando}
              onInsertar={(nuevo) => {
                window.dispatchEvent(new CustomEvent("insertar-elemento", { detail: nuevo }));
                setMostrarGaleria(false);
              }}
              onSeleccionadasChange={setImagenesSeleccionadas}
            />
          </div>

        </>
      )}


      {botonActivo === "menu" && (
        <>
          <button
            onClick={onAbrirModalSeccion}
            className="flex items-center gap-2 w-full bg-purple-100 hover:bg-purple-200 text-purple-800 font-medium py-2 px-4 rounded-xl shadow-sm transition-all"
          >
            <span className="text-lg">➕</span>
            <span>Añadir sección</span>
          </button>
          <button
            onClick={() => {
              window.dispatchEvent(new CustomEvent("insertar-elemento", {
                detail: {
                  id: `rsvp-${Date.now()}`,
                  tipo: "rsvp-boton",
                  texto: "Confirmar asistencia",
                  x: 300,
                  y: 100,
                  ancho: 220,
                  alto: 50,
                  color: "#773dbe",
                  colorTexto: "#ffffff",
                  fontSize: 18,
                  fontFamily: "sans-serif",
                  align: "center"
                }
              }));
            }}
            className="flex items-center gap-2 w-full bg-green-100 hover:bg-green-200 text-green-800 font-medium py-2 px-4 rounded-xl shadow-sm transition-all"
          >
            <span className="text-lg">📩</span>
            <span>Añadir RSVP</span>
          </button>




          <button
            onClick={onCrearPlantilla}
            className="flex items-center gap-2 w-full bg-blue-100 hover:bg-blue-200 text-blue-800 font-medium py-2 px-4 rounded-xl shadow-sm transition-all"
          >
            <span className="text-lg">✨</span>
            <span>Crear plantilla</span>
          </button>

          <button
            onClick={onBorrarTodos}
            className="flex items-center gap-2 w-full bg-red-100 hover:bg-red-200 text-red-800 font-medium py-2 px-4 rounded-xl shadow-sm transition-all"
          >
            <span className="text-lg">🗑️</span>
            <span>Borrar todos los borradores</span>
          </button>
        </>
      )}
    </div>
  );
}
