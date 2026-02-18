// components/MiniToolbarTabContador.jsx
import React, { useEffect, useMemo, useState } from "react";
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
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(
      d.getDate()
    )}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  })();

  const [fechaEventoStr, setFechaEventoStr] = useState(ahoraMas30d);

  // ✅ Estado del countdown seleccionado (si hay uno)
  const [countdownSel, setCountdownSel] = useState(null);

  // Lee selección desde los globals que ya expone CanvasEditor:
  // window._elementosSeleccionados y window._objetosActuales
  useEffect(() => {
    const syncSelectedCountdown = () => {
      try {
        const ids = window._elementosSeleccionados || [];
        const objs = window._objetosActuales || [];

        if (!Array.isArray(ids) || !Array.isArray(objs) || ids.length !== 1) {
          setCountdownSel(null);
          return;
        }

        const obj = objs.find((o) => o.id === ids[0]);
        if (!obj || obj.tipo !== "countdown") {
          setCountdownSel(null);
          return;
        }

        setCountdownSel(obj);
      } catch {
        setCountdownSel(null);
      }
    };

    syncSelectedCountdown();
    window.addEventListener("editor-selection-change", syncSelectedCountdown);

    return () => {
      window.removeEventListener("editor-selection-change", syncSelectedCountdown);
    };
  }, []);

  const selectedUI = useMemo(() => {
    if (!countdownSel) return null;
    return {
      id: countdownSel.id,
      color: countdownSel.color ?? "#111827",            // números
      labelColor: countdownSel.labelColor ?? "#6b7280",  // labels
      boxBg: countdownSel.boxBg ?? "#ffffff",            // fondo chip
      boxBorder: countdownSel.boxBorder ?? "#e5e7eb",    // borde chip
      showLabels: !!countdownSel.showLabels,
    };

  }, [countdownSel]);

  const patchSelectedCountdown = (cambios) => {
    const id = selectedUI?.id;
    if (!id) return;

    window.dispatchEvent(
      new CustomEvent("actualizar-elemento", {
        detail: { id, cambios },
      })
    );
  };

  return (
    <div className="flex flex-col gap-3">
      {/* ✅ Edición rápida (solo si hay countdown seleccionado) */}
      {selectedUI && (
        <div className="p-3 rounded-xl border border-purple-200 bg-purple-50/40">
          <div className="text-xs font-semibold text-purple-800 mb-2">
            Colores del countdown seleccionado
          </div>


          <label className="text-xs font-medium text-zinc-700 col-span-2">
            Separación entre chips
            <input
              type="range"
              min={0}
              max={40}
              step={1}
              value={countdownSel.gap ?? 8}
              onChange={(e) =>
                patchSelectedCountdown({ gap: Number(e.target.value) })
              }
              className="mt-2 w-full"
            />
            <div className="mt-1 text-[11px] text-zinc-500">
              Gap actual: {countdownSel.gap ?? 8}px
            </div>
          </label>


          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs font-medium text-zinc-700">
              Números
              <input
                type="color"
                className="mt-1 w-full h-10 rounded-lg border p-1 bg-white"
                value={selectedUI.color}
                onChange={(e) => patchSelectedCountdown({ color: e.target.value })}
              />
            </label>

            <label className="text-xs font-medium text-zinc-700">
              Etiquetas
              <input
                type="color"
                className="mt-1 w-full h-10 rounded-lg border p-1 bg-white disabled:opacity-50"
                value={selectedUI.labelColor}
                onChange={(e) => patchSelectedCountdown({ labelColor: e.target.value })}
                disabled={!selectedUI.showLabels}
                title={
                  !selectedUI.showLabels
                    ? "Este preset no muestra labels (showLabels=false)"
                    : ""
                }
              />
              {!selectedUI.showLabels && (
                <div className="mt-1 text-[11px] text-zinc-600">
                  Este preset no muestra labels, por eso está deshabilitado.
                </div>
              )}
            </label>


            <label className="text-xs font-medium text-zinc-700">
              Fondo del chip
              <input
                type="color"
                className="mt-1 w-full h-10 rounded-lg border p-1 bg-white"
                value={selectedUI.boxBg}
                onChange={(e) => patchSelectedCountdown({ boxBg: e.target.value })}
              />
            </label>

            <label className="text-xs font-medium text-zinc-700">
              Borde del chip
              <input
                type="color"
                className="mt-1 w-full h-10 rounded-lg border p-1 bg-white"
                value={selectedUI.boxBorder}
                onChange={(e) => patchSelectedCountdown({ boxBorder: e.target.value })}
              />
            </label>


          </div>
        </div>
      )}

      {/* Selector de fecha/hora */}
      <div className="p-3 rounded-xl border border-zinc-200">
        <label className="text-xs font-medium text-zinc-700">
          Fecha y hora del evento
        </label>
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

                                    window.dispatchEvent(
                    new CustomEvent("insertar-elemento", {
                      detail: {
                        id: `count-${Date.now().toString(36)}`,
                        tipo: "countdown",
                        fechaObjetivo: iso,
                        presetId: p.id,
                        presetProps: presetPropsSafe,
                      },
                    })
                  );
                }}
                className="w-full group rounded-xl border border-zinc-200 hover:border-purple-300 hover:shadow-sm text-left flex flex-col px-2 py-3"
              >
                <div className="text-sm font-semibold text-zinc-800 mb-2">
                  {p.nombre}
                </div>
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





