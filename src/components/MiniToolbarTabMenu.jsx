// components/MiniToolbarTabMenu.jsx
import React from "react";
import { useAuthClaims } from "@/hooks/useAuthClaims";

export default function MiniToolbarTabMenu({
  onAbrirModalSeccion,
  onCrearPlantilla,
  onBorrarTodos,
}) {
  const { esAdmin, loadingClaims } = useAuthClaims();

  if (loadingClaims) {
    return (
      <div className="flex flex-col gap-2 flex-1 min-h-0">
        <div className="h-10 w-full rounded-xl bg-zinc-100 animate-pulse" />
        <div className="h-10 w-full rounded-xl bg-zinc-100 animate-pulse" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 flex-1 min-h-0">
      <div className="flex flex-col gap-2 flex-1 min-h-0 overflow-y-auto pr-1">
        <button
          onClick={onAbrirModalSeccion}
          className="flex items-center gap-2 w-full bg-purple-100 hover:bg-purple-200 text-purple-800 font-medium py-2 px-4 rounded-xl shadow-sm transition-all"
        >
          <span className="text-lg">➕</span>
          <span>Añadir sección</span>
        </button>

        <button
          onClick={() => {
            window.dispatchEvent(
              new CustomEvent("insertar-elemento", {
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
                  align: "center",
                },
              })
            );
          }}
          className="flex items-center gap-2 w-full bg-green-100 hover:bg-green-200 text-green-800 font-medium py-2 px-4 rounded-xl shadow-sm transition-all"
        >
          <span className="text-lg">📩</span>
          <span>Añadir RSVP</span>
        </button>

        {esAdmin && (
          <button
            onClick={onCrearPlantilla}
            className="flex items-center gap-2 w-full bg-blue-100 hover:bg-blue-200 text-blue-800 font-medium py-2 px-4 rounded-xl shadow-sm transition-all"
          >
            <span className="text-lg">✨</span>
            <span>Crear plantilla</span>
          </button>
        )}

        {esAdmin && (
          <button
            onClick={onBorrarTodos}
            className="flex items-center gap-2 w-full bg-red-100 hover:bg-red-200 text-red-800 font-medium py-2 px-4 rounded-xl shadow-sm transition-all"
          >
            <span className="text-lg">🗑️</span>
            <span>Borrar todos los borradores</span>
          </button>
        )}
      </div>
    </div>
  );
}
