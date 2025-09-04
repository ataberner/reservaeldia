// components/MiniToolbarTabContador.jsx
import React, { useState } from "react";
import CountdownPreview from "@/components/editor/countdown/CountdownPreview";
import { COUNTDOWN_PRESETS } from "@/config/countdownPresets";

// Helper copiado tal cual
function fechaStrToISO(str) {
  if (!str || typeof str !== "string") return null;
  let s = str.trim();
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s)) s += ":00";
  const d = new Date(s);
  const ms = d.getTime();
  if (Number.isNaN(ms)) {
    console.warn("[Countdown] fecha/hora inválida →", str);
    return null;
  }
  return d.toISOString();
}

export default function MiniToolbarTabContador() {
  // valor inicial: +30 días, formateado como "YYYY-MM-DDTHH:mm" (misma lógica)
  const ahoraMas30d = (() => {
    const d = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30);
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  })();

  const [fechaEventoStr, setFechaEventoStr] = useState(ahoraMas30d);

  return (
    <div className="flex flex-col gap-3">
      {/* Selector de fecha/hora */}
      <div className="p-3 rounded-xl border border-zinc-200">
        <label className="text-xs font-medium text-zinc-700">Fecha y hora del evento</label>
        <input
          type="datetime-local"
          value={fechaEventoStr}
          onChange={(e) => setFechaEventoStr(e.target.value)}
          className="mt-1 w-full rounded-lg border px-2 py-2 text-sm"
        />
      </div>

      {/* Diseños */}
      <div>
        <div className="text-xs font-medium text-zinc-700 mb-2">Diseños</div>
        <div className="flex flex-col gap-3">
          {COUNTDOWN_PRESETS.map((p) => {
            const isoPreview = fechaStrToISO(fechaEventoStr) || new Date().toISOString();
            return (
              <button
                key={p.id}
                onClick={() => {
                  const iso = fechaStrToISO(fechaEventoStr);
                  if (!iso) {
                    alert("⚠️ La fecha/hora no es válida. Elegí una fecha.");
                    return;
                  }
                  window.dispatchEvent(new CustomEvent("insertar-elemento", {
                    detail: {
                      id: `count-${Date.now().toString(36)}`,
                      tipo: "countdown",
                      x: 100, y: 140, width: 600, height: 90,
                      fechaObjetivo: iso, fechaISO: iso, targetISO: iso,
                      ...(p.props),
                      presetId: p.id,
                    }
                  }));
                }}
                className="w-full group rounded-xl border border-zinc-200 hover:border-purple-300 hover:shadow-sm text-left flex flex-col px-2 py-3"
              >
                <div className="text-sm font-semibold text-zinc-800 mb-2">{p.nombre}</div>
                <div className="w-full">
                  <CountdownPreview targetISO={isoPreview} preset={p.props} size="sm" />
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
