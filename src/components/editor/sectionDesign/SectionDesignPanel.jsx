import { X } from "lucide-react";
import { SECTION_DESIGN_PANEL_DESKTOP_WIDTH_PX } from "@/domain/dashboard/editorCanvasLayout";
import {
  SECTION_DIVIDER_MAX_HEIGHT,
  SECTION_DIVIDER_MIN_HEIGHT,
  SECTION_DIVIDER_PRESETS,
  hasActiveSectionDividers,
  normalizeSectionDividers,
} from "../../../../shared/sectionDividerPresets.js";

function DividerThumbnail({ preset, active }) {
  return (
    <svg
      viewBox={preset.viewBox}
      preserveAspectRatio="none"
      className={`h-8 w-full overflow-hidden rounded-md border ${
        active
          ? "border-[#9b73d6] bg-[#f4edff]"
          : "border-[#e7def5] bg-[#faf8fd]"
      }`}
      aria-hidden="true"
    >
      {preset.path ? (
        <path d={preset.path} fill={active ? "#773dbe" : "#b79bdc"} />
      ) : (
        <path
          d="M80 50 H920"
          fill="none"
          stroke={active ? "#773dbe" : "#b79bdc"}
          strokeDasharray="36 24"
          strokeWidth="6"
          strokeLinecap="round"
        />
      )}
    </svg>
  );
}

function DividerPresetSelector({
  id,
  label,
  value,
  disabled,
  onChange,
}) {
  return (
    <fieldset className="space-y-2" disabled={disabled}>
      <legend className="text-sm font-semibold text-slate-800">{label}</legend>
      <div
        id={id}
        className="grid grid-cols-2 gap-2"
        role="radiogroup"
        aria-label={label}
      >
        {SECTION_DIVIDER_PRESETS.map((preset) => {
          const active = value === preset.id;
          return (
            <button
              key={preset.id}
              type="button"
              role="radio"
              aria-checked={active}
              disabled={disabled}
              onClick={() => onChange(preset.id)}
              className={`flex min-h-[70px] flex-col gap-1.5 rounded-xl border p-2 text-left text-xs font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#dccaf7] disabled:cursor-not-allowed disabled:opacity-50 ${
                active
                  ? "border-[#a783dc] bg-[#f7f2ff] text-[#5f3596] shadow-[0_7px_16px_rgba(119,61,190,0.12)]"
                  : "border-[#e8e0f4] bg-white text-slate-600 hover:border-[#d2c1f2] hover:bg-[#faf7ff]"
              }`}
            >
              <DividerThumbnail preset={preset} active={active} />
              <span>{preset.label}</span>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

export default function SectionDesignPanel({
  seccion,
  disabled = false,
  onClose,
  onDividersChange,
}) {
  const dividers = normalizeSectionDividers(seccion?.divisores);
  const hasDividers = hasActiveSectionDividers(dividers);

  return (
    <aside
      role="dialog"
      aria-modal="false"
      aria-labelledby="section-design-panel-title"
      data-section-design-panel="true"
      data-editor-only="true"
      data-preserve-canvas-selection="true"
      className="fixed bottom-[104px] left-2 right-2 top-[calc(var(--dashboard-header-height,52px)+8px)] z-[80] flex min-h-0 flex-col overflow-hidden rounded-2xl border border-[#e6dbf8] bg-white shadow-[0_22px_55px_rgba(43,26,73,0.22)] md:bottom-0 md:left-auto md:right-0 md:top-[var(--dashboard-header-height,52px)] md:z-[48] md:w-[var(--section-design-panel-width)] md:rounded-none md:rounded-l-2xl"
      style={{
        "--section-design-panel-width": `${SECTION_DESIGN_PANEL_DESKTOP_WIDTH_PX}px`,
      }}
      onMouseDown={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <header className="flex min-h-[58px] items-center justify-between border-b border-[#ece4f8] bg-gradient-to-r from-[#fbf9ff] to-white px-5">
        <div>
          <h2
            id="section-design-panel-title"
            className="font-['Source_Sans_Pro',sans-serif] text-lg font-semibold text-[#40215f]"
          >
            Diseño de la sección
          </h2>
          <p className="text-xs text-slate-500">
            {seccion?.id ? "Editando la sección seleccionada" : "Seleccioná una sección"}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-slate-600 transition hover:bg-[#f2eafe] hover:text-[#692b9a] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#dccaf7]"
          title="Cerrar Diseño de la sección"
          aria-label="Cerrar Diseño de la sección"
        >
          <X className="h-5 w-5" aria-hidden="true" />
        </button>
      </header>

      <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-5">
        <DividerPresetSelector
          id="section-divider-top-options"
          label="Divisor superior"
          value={dividers.top}
          disabled={disabled || !seccion?.id}
          onChange={(top) => onDividersChange?.({ top })}
        />

        <DividerPresetSelector
          id="section-divider-bottom-options"
          label="Divisor inferior"
          value={dividers.bottom}
          disabled={disabled || !seccion?.id}
          onChange={(bottom) => onDividersChange?.({ bottom })}
        />

        <section
          className={`space-y-2 rounded-xl border border-[#e8e0f4] bg-[#fbf9ff] p-3 ${
            hasDividers ? "" : "opacity-55"
          }`}
        >
          <div className="flex items-center justify-between gap-3">
            <label
              htmlFor="section-divider-height"
              className="text-sm font-semibold text-slate-800"
            >
              Altura del divisor
            </label>
            <output
              htmlFor="section-divider-height"
              className="rounded-md bg-white px-2 py-1 text-xs font-semibold text-[#692b9a] shadow-sm"
            >
              {dividers.height} px
            </output>
          </div>
          <input
            id="section-divider-height"
            type="range"
            min={SECTION_DIVIDER_MIN_HEIGHT}
            max={SECTION_DIVIDER_MAX_HEIGHT}
            step="1"
            value={dividers.height}
            disabled={disabled || !seccion?.id || !hasDividers}
            onChange={(event) =>
              onDividersChange?.({ height: Number(event.target.value) })
            }
            className="h-2 w-full cursor-pointer accent-[#773dbe] disabled:cursor-not-allowed"
          />
        </section>
      </div>
    </aside>
  );
}
