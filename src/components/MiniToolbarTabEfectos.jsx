import React, { useEffect, useMemo, useState } from "react";
import {
  CLEAR_ALL_MOTION_PRESET_ID,
  GLOBAL_MOTION_PRESETS,
} from "@/domain/motionEffects";

const PRESET_ORDER = [
  GLOBAL_MOTION_PRESETS.soft_elegant,
  GLOBAL_MOTION_PRESETS.modern_dynamic,
  GLOBAL_MOTION_PRESETS.minimal,
];

const PRESET_COPY = {
  soft_elegant: {
    title: "Suave y elegante",
    description: "Animaciones sutiles al hacer scroll, sin efectos llamativos.",
  },
  modern_dynamic: {
    title: "Moderno y dinamico",
    description: "Animaciones mas notorias, look actual y transiciones suaves.",
  },
  minimal: {
    title: "Minimalista",
    description:
      "Casi sin animaciones, solo en titulos principales para un toque delicado.",
  },
  [CLEAR_ALL_MOTION_PRESET_ID]: {
    title: "Sin efectos",
    description: "Quita todos los efectos de la invitacion.",
  },
};

export default function MiniToolbarTabEfectos() {
  const [lastSummary, setLastSummary] = useState(null);

  useEffect(() => {
    const onApplied = (event) => {
      const detail = event?.detail || {};
      setLastSummary({
        presetId: String(detail.presetId || ""),
        changed: Number(detail.changed || 0),
        total: Number(detail.total || 0),
      });
    };

    window.addEventListener("motion-effects-applied", onApplied);
    return () => window.removeEventListener("motion-effects-applied", onApplied);
  }, []);

  const summaryText = useMemo(() => {
    if (!lastSummary || !lastSummary.presetId) return "";
    const copy = PRESET_COPY[lastSummary.presetId];
    if (!copy) return "";

    return `Aplicado: ${copy.title}. ${lastSummary.changed} de ${lastSummary.total} elementos actualizados.`;
  }, [lastSummary]);

  const applyPreset = (presetId) => {
    window.dispatchEvent(
      new CustomEvent("aplicar-estilo-efectos", {
        detail: { presetId },
      })
    );
  };

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-zinc-600">
        Elige un estilo global. Se asigna un efecto por elemento y se guarda en
        el borrador automaticamente.
      </p>

      {PRESET_ORDER.map((preset) => {
        const copy = PRESET_COPY[preset.id];
        if (!copy) return null;

        return (
          <button
            key={preset.id}
            onClick={() => applyPreset(preset.id)}
            className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-3 text-left shadow-sm transition-all hover:border-[#7a44ce] hover:bg-[#faf6ff]"
          >
            <div className="text-sm font-semibold text-zinc-800">{copy.title}</div>
            <div className="mt-1 text-xs text-zinc-600">{copy.description}</div>
          </button>
        );
      })}

      <button
        onClick={() => applyPreset(CLEAR_ALL_MOTION_PRESET_ID)}
        className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-3 text-left shadow-sm transition-all hover:border-rose-300 hover:bg-rose-50"
      >
        <div className="text-sm font-semibold text-zinc-800">
          {PRESET_COPY[CLEAR_ALL_MOTION_PRESET_ID].title}
        </div>
        <div className="mt-1 text-xs text-zinc-600">
          {PRESET_COPY[CLEAR_ALL_MOTION_PRESET_ID].description}
        </div>
      </button>

      {summaryText ? (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
          {summaryText}
        </p>
      ) : null}
    </div>
  );
}
