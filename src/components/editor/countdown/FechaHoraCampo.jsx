import React, { useMemo } from "react";

// Convierte Date -> "YYYY-MM-DDTHH:mm" (local)
function toLocalInputValue(d) {
  if (!(d instanceof Date) || isNaN(d)) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Convierte "YYYY-MM-DDTHH:mm" (local) -> ISO UTC
function fromLocalInputValue(v) {
  if (!v) return null;
  const d = new Date(v);              // interpreta en zona local
  return isNaN(d) ? null : d.toISOString();
}

export default function FechaHoraCampo({ valueISO, onChangeISO }) {
  // Mostrar en el input el valor actual en formato local
  const inputValue = useMemo(() => {
    if (!valueISO) return "";
    const d = new Date(valueISO);
    return toLocalInputValue(d);
  }, [valueISO]);

  return (
    <div className="p-3 rounded-xl border border-zinc-200">
      <label className="text-xs font-medium text-zinc-700">Fecha y hora del evento</label>
      <input
        type="datetime-local"
        value={inputValue}
        onChange={(e) => {
          const iso = fromLocalInputValue(e.target.value);
          if (iso) onChangeISO?.(iso);
        }}
        className="mt-1 w-full rounded-lg border px-2 py-2 text-sm"
      />
    </div>
  );
}
