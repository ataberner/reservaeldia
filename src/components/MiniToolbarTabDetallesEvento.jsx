import React from "react";

const detailFields = [
  { label: "Nombre del evento", value: "Sin definir" },
  { label: "Fecha", value: "Sin definir" },
  { label: "Horario", value: "Sin definir" },
  { label: "Lugar", value: "Sin definir" },
];

export default function MiniToolbarTabDetallesEvento() {
  return (
    <div className="flex flex-1 min-h-0 flex-col gap-3 overflow-y-auto pr-1">
      <section className="rounded-xl border border-[#e9dcfb] bg-[#faf6ff] px-3 py-3">
        <h3 className="text-sm font-semibold text-[#262626]">Detalles del evento</h3>
        <p className="mt-1 text-xs leading-5 text-slate-600">
          Panel preparado para editar los datos principales del evento.
        </p>
      </section>

      <div className="grid grid-cols-1 gap-2">
        {detailFields.map((field) => (
          <div
            key={field.label}
            className="rounded-xl border border-zinc-200 bg-white px-3 py-2.5 shadow-sm"
          >
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              {field.label}
            </div>
            <div className="mt-1 text-sm text-slate-800">{field.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
