// src/components/sidebar/ModalCountdown.jsx
import { useMemo, useState } from "react";
import { makeDefaultCountdown } from "@/components/editor/countdown/countdownUtils";

export default function ModalCountdown({ visible, onClose }) {
  const [fecha, setFecha] = useState("");         // yyyy-mm-dd
  const [hora, setHora] = useState("");           // HH:mm
  const [layout, setLayout] = useState("pills");  // pills | flip | minimal
  const [showLabels, setShowLabels] = useState(true);

  const fechaISO = useMemo(() => {
    if (!fecha || !hora) return null;
    // ⚠️ guardamos en UTC ISO para consistencia (igual que el editor)
    const local = new Date(`${fecha}T${hora}:00`);
    return isNaN(local.getTime()) ? null : local.toISOString();
  }, [fecha, hora]);

  const crear = () => {
    const base = makeDefaultCountdown({ fechaISO: fechaISO || undefined });
    base.layout = layout;
    base.showLabels = showLabels;
    // Posición/tamaño iniciales (centrado aproximado)
    base.x = 160; base.y = 140; base.width = 480; base.height = 90;

    window.dispatchEvent(new CustomEvent("insertar-elemento", { detail: base }));
    onClose?.();
  };

  if (!visible) return null;

  return (
    <div className="absolute z-50 mt-2 w-80 right-0 bg-white border border-zinc-200 rounded-xl shadow-xl p-3">
      <div className="text-sm font-semibold mb-2">Añadir cuenta regresiva</div>

      <div className="grid grid-cols-2 gap-2">
        <label className="text-xs font-medium">
          Fecha
          <input
            type="date"
            value={fecha}
            onChange={e => setFecha(e.target.value)}
            className="mt-1 w-full rounded border px-2 py-1 text-sm"
          />
        </label>
        <label className="text-xs font-medium">
          Hora
          <input
            type="time"
            value={hora}
            onChange={e => setHora(e.target.value)}
            className="mt-1 w-full rounded border px-2 py-1 text-sm"
          />
        </label>
      </div>

      <div className="mt-3">
        <div className="text-xs font-medium mb-1">Estilo</div>
        <div className="flex gap-2">
          {["pills","flip","minimal"].map(op => (
            <button
              key={op}
              onClick={() => setLayout(op)}
              className={`text-xs px-2 py-1 rounded border ${layout === op ? "border-purple-500 ring-2 ring-purple-200" : "border-zinc-300"}`}
            >
              {op}
            </button>
          ))}
        </div>
      </div>

      <label className="mt-3 flex items-center gap-2 text-xs">
        <input type="checkbox" checked={showLabels} onChange={e => setShowLabels(e.target.checked)} />
        Mostrar etiquetas (Días, Horas, Min, Seg)
      </label>

      <div className="mt-3 flex gap-2">
        <button onClick={onClose} className="flex-1 px-3 py-2 rounded bg-zinc-100 hover:bg-zinc-200 text-sm">
          Cancelar
        </button>
        <button
          onClick={crear}
          className="flex-1 px-3 py-2 rounded bg-purple-600 hover:bg-purple-700 text-white text-sm disabled:opacity-50"
          disabled={!fechaISO}
        >
          Insertar
        </button>
      </div>

      {!fechaISO && (
        <div className="mt-2 text-[11px] text-zinc-500">
          Tip: completá fecha y hora para habilitar el botón.
        </div>
      )}
    </div>
  );
}
