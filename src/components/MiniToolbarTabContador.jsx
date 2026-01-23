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

// ✅ Calcular ancho inicial real del countdown según defaults + preset
function calcCountdownInitialWidth(presetProps = {}) {
  const n = 4; // d, h, m, s
  const gap = presetProps.gap ?? 8;
  const paddingX = presetProps.paddingX ?? 8;
  const chipWidth = presetProps.chipWidth ?? 46;
  const chipW = chipWidth + paddingX * 2;
  const totalW = n * chipW + gap * (n - 1);
  return Math.max(120, Math.round(totalW));
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

                  const rawPresetProps = p?.props || {};
                  // ✅ No permitir que el preset pise geometría/fecha/tipo/id
                  const {
                    x: _px,
                    y: _py,
                    width: _pw,
                    height: _ph,
                    fechaObjetivo: _pFecha,
                    fechaISO: _pFechaISO,
                    targetISO: _pTargetISO,
                    tipo: _ptipo,
                    id: _pid,
                    ...presetPropsSafe
                  } = rawPresetProps;

                  const width = calcCountdownInitialWidth(rawPresetProps);
                  const height = 90;
                  const anchoBase = 800;
                  const x = (anchoBase - width) / 2;
                  const y = 140;

                  window.dispatchEvent(new CustomEvent("insertar-elemento", {
                    detail: {
                      id: `count-${Date.now().toString(36)}`,
                      tipo: "countdown",
                      x, y, width, height,
                      rotation: 0,
                      scaleX: 1,
                      scaleY: 1,

                      // ✅ usar solo el campo que lee CountdownKonva
                      fechaObjetivo: iso,

                      // (si querés conservar compatibilidad, podés dejarlos, pero no es necesario)
                      // fechaISO: iso,
                      // targetISO: iso,

                      ...presetPropsSafe,
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
