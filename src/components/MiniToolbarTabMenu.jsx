// components/MiniToolbarTabMenu.jsx
import React from "react";
import { Plus, Sparkles, Trash2 } from "lucide-react";
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
    <div className="flex flex-col gap-1.5 flex-1 min-h-0">
      <div className="flex flex-col gap-1.5 flex-1 min-h-0 overflow-y-auto pr-1">
        <button
          onClick={onAbrirModalSeccion}
          className="inline-flex w-full items-start gap-2 rounded-lg bg-purple-100 px-3 py-1.5 text-left text-[13px] font-medium leading-tight text-purple-800 shadow-sm transition-all hover:bg-purple-200"
        >
          <Plus className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span className="min-w-0 break-words">Anadir seccion</span>
        </button>

        {esAdmin && (
          <button
            onClick={onCrearPlantilla}
            className="inline-flex w-full items-start gap-2 rounded-lg bg-blue-100 px-3 py-1.5 text-left text-[13px] font-medium leading-tight text-blue-800 shadow-sm transition-all hover:bg-blue-200"
          >
            <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span className="min-w-0 break-words">Crear plantilla</span>
          </button>
        )}

        {esAdmin && (
          <button
            onClick={onBorrarTodos}
            className="inline-flex w-full items-start gap-2 rounded-lg bg-red-100 px-3 py-1.5 text-left text-[13px] font-medium leading-tight text-red-800 shadow-sm transition-all hover:bg-red-200"
          >
            <Trash2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span className="min-w-0 break-words">Borrar todos los borradores</span>
          </button>
        )}
      </div>
    </div>
  );
}
