// components/MiniToolbarTabMenu.jsx
import React from "react";

export default function MiniToolbarTabMenu({
  onAbrirModalSeccion,
  onCrearPlantilla,
  onBorrarTodos,
}) {
  return (
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
  );
}
