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

const effectButtonClass =
  "w-[361px] max-w-full rounded-[3px] bg-white px-3 py-3 text-left [border:1px_solid_var(--Border,#00000029)] hover:[border-color:#692B9A] hover:bg-[#faf6ff] hover:[box-shadow:inset_0_0_0_1px_#692B9A]";
const effectTitleClass =
  "font-['Source_Sans_Pro',sans-serif] text-[16px] font-semibold leading-[24px] tracking-[0px] text-[#262626]";
const effectDescriptionClass =
  "mt-1 font-['Source_Sans_Pro',sans-serif] text-[14px] font-normal leading-[17px] tracking-[0px] text-[#262626]";

export default function MiniToolbarTabEfectos() {
  const [lastSummary, setLastSummary] = useState(null);

  useEffect(() => {
    const onApplied = (event) => {
      const detail = event?.detail || {};
      setLastSummary({
        presetId: String(detail.presetId || ""),
        changed: Number(detail.changed || 0),
        total: Number(detail.total || 0),
        changedSections: Number(detail.changedSections || 0),
        totalSections: Number(detail.totalSections || 0),
      });
    };

    window.addEventListener("motion-effects-applied", onApplied);
    return () => window.removeEventListener("motion-effects-applied", onApplied);
  }, []);

  const summaryText = useMemo(() => {
    if (!lastSummary || !lastSummary.presetId) return "";
    const copy = PRESET_COPY[lastSummary.presetId];
    if (!copy) return "";

    const baseText = `Aplicado: ${copy.title}. ${lastSummary.changed} de ${lastSummary.total} elementos actualizados.`;
    if (!lastSummary.totalSections) return baseText;

    return `${baseText} ${lastSummary.changedSections} de ${lastSummary.totalSections} secciones con adornos del fondo actualizadas.`;
  }, [lastSummary]);

  const applyPreset = (presetId) => {
    window.dispatchEvent(
      new CustomEvent("aplicar-estilo-efectos", {
        detail: { presetId },
      })
    );
  };

  return (
    <div className="flex flex-col items-center gap-3">
      {PRESET_ORDER.map((preset) => {
        const copy = PRESET_COPY[preset.id];
        if (!copy) return null;

        return (
          <button
            key={preset.id}
            onClick={() => applyPreset(preset.id)}
            className={effectButtonClass}
          >
            <div className={effectTitleClass}>{copy.title}</div>
            <div className={effectDescriptionClass}>{copy.description}</div>
          </button>
        );
      })}

      <button
        onClick={() => applyPreset(CLEAR_ALL_MOTION_PRESET_ID)}
        className={effectButtonClass}
      >
        <div className={effectTitleClass}>
          {PRESET_COPY[CLEAR_ALL_MOTION_PRESET_ID].title}
        </div>
        <div className={effectDescriptionClass}>
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
