import React, { useEffect, useState } from "react";
import { getGalleryLayoutPresets } from "@/domain/gallery/galleryLayoutPresets";

const SELECTABLE_LAYOUT_PRESETS = getGalleryLayoutPresets();
const DEFAULT_ALLOWED_LAYOUTS = ["squares", "banner", "side_by_side"];

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, Number.isNaN(n) ? min : n));
}

export default function MiniToolbarTabGalleryBuilder({
  onInsertarGaleria,
  templateSessionMeta = null,
}) {
  const [isMobileViewport, setIsMobileViewport] = useState(
    typeof window !== "undefined" ? window.innerWidth < 768 : false
  );
  const [cfg, setCfg] = useState({
    rows: 3,
    cols: 3,
    gap: 8,
    radius: 6,
    ratio: "1:1",
    widthPct: 70,
    allowedLayouts: DEFAULT_ALLOWED_LAYOUTS,
    defaultLayout: "squares",
    currentLayout: "squares",
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    const syncViewport = () => setIsMobileViewport(window.innerWidth < 768);
    syncViewport();
    window.addEventListener("resize", syncViewport);
    return () => window.removeEventListener("resize", syncViewport);
  }, []);

  const controlClass = "mt-1 w-full rounded border border-zinc-300 px-2 py-1 text-sm";
  const compactGap = isMobileViewport ? "gap-1.5" : "gap-2";
  const selectedLayoutOptions = SELECTABLE_LAYOUT_PRESETS.filter((preset) =>
    cfg.allowedLayouts.includes(preset.id)
  );

  const setAllowedLayout = (layoutId, enabled) => {
    setCfg((prev) => {
      const current = Array.isArray(prev.allowedLayouts) ? prev.allowedLayouts : [];
      const nextAllowed = enabled
        ? Array.from(new Set([...current, layoutId]))
        : current.filter((id) => id !== layoutId);

      if (nextAllowed.length === 0) return prev;

      const defaultLayout = nextAllowed.includes(prev.defaultLayout)
        ? prev.defaultLayout
        : nextAllowed[0];
      const currentLayout = nextAllowed.includes(prev.currentLayout)
        ? prev.currentLayout
        : defaultLayout;

      return {
        ...prev,
        allowedLayouts: nextAllowed,
        defaultLayout,
        currentLayout,
      };
    });
  };

  const setDefaultLayout = (layoutId) => {
    setCfg((prev) => {
      if (!prev.allowedLayouts.includes(layoutId)) return prev;
      return {
        ...prev,
        defaultLayout: layoutId,
        currentLayout: prev.allowedLayouts.includes(prev.currentLayout)
          ? prev.currentLayout
          : layoutId,
      };
    });
  };

  const setCurrentLayout = (layoutId) => {
    setCfg((prev) => {
      if (!prev.allowedLayouts.includes(layoutId)) return prev;
      return {
        ...prev,
        currentLayout: layoutId,
      };
    });
  };

  return (
    <div className={`flex flex-col flex-1 min-h-0 ${isMobileViewport ? "gap-2" : "gap-3"}`}>
      <section
        className={`border border-amber-200 bg-amber-50 ${
          isMobileViewport ? "rounded-lg px-2.5 py-2" : "rounded-xl px-3 py-2.5"
        }`}
      >
        <div className="text-[11px] font-semibold uppercase tracking-wide text-amber-800">
          Builder de galeria
        </div>
        <p className={`${isMobileViewport ? "mt-1 text-[11px]" : "mt-1 text-xs"} text-amber-900`}>
          Solo para autores de plantilla. Crea estructuras `tipo: "galeria"` compatibles con el sistema actual.
        </p>
        {templateSessionMeta?.templateId && (
          <p className="mt-1 text-[11px] text-amber-800">
            Plantilla: {templateSessionMeta.templateId}
          </p>
        )}
      </section>

      <section
        className={`border border-zinc-200 bg-white ${
          isMobileViewport ? "rounded-lg p-2.5" : "rounded-xl p-3"
        }`}
      >
        <div className="text-xs font-semibold text-zinc-800">Estructura inicial</div>
        <div className={`mt-2 grid grid-cols-2 ${compactGap}`}>
          <label className="text-xs font-medium text-zinc-700">
            Filas
            <input
              type="number"
              min={1}
              max={6}
              value={cfg.rows}
              onChange={(e) => setCfg({ ...cfg, rows: clamp(+e.target.value, 1, 6) })}
              className={controlClass}
            />
          </label>
          <label className="text-xs font-medium text-zinc-700">
            Columnas
            <input
              type="number"
              min={1}
              max={6}
              value={cfg.cols}
              onChange={(e) => setCfg({ ...cfg, cols: clamp(+e.target.value, 1, 6) })}
              className={controlClass}
            />
          </label>
        </div>

        <div className={`mt-2 grid grid-cols-2 ${compactGap}`}>
          <label className="text-xs font-medium text-zinc-700">
            Espaciado: {cfg.gap}px
            <input
              type="range"
              min={0}
              max={30}
              value={cfg.gap}
              onChange={(e) => setCfg({ ...cfg, gap: +e.target.value })}
              className="w-full"
            />
          </label>
          <label className="text-xs font-medium text-zinc-700">
            Bordes: {cfg.radius}px
            <input
              type="range"
              min={0}
              max={30}
              value={cfg.radius}
              onChange={(e) => setCfg({ ...cfg, radius: +e.target.value })}
              className="w-full"
            />
          </label>
        </div>

        <div className={isMobileViewport ? "mt-2" : "mt-3"}>
          <div className="mb-1 text-xs font-medium text-zinc-700">Proporcion</div>
          <div className="flex gap-2">
            {["1:1", "4:3", "16:9"].map((ratio) => (
              <button
                key={ratio}
                type="button"
                onClick={() => setCfg({ ...cfg, ratio })}
                className={`rounded border px-2 py-1 text-xs ${
                  cfg.ratio === ratio
                    ? "border-purple-500 bg-purple-50 text-purple-800 ring-2 ring-purple-100"
                    : "border-zinc-300 text-zinc-700"
                }`}
              >
                {ratio}
              </button>
            ))}
          </div>
        </div>

        <label className={`block text-xs font-medium text-zinc-700 ${isMobileViewport ? "mt-2" : "mt-3"}`}>
          Ancho (% del canvas): {cfg.widthPct}%
          <input
            type="range"
            min={10}
            max={100}
            value={cfg.widthPct}
            onChange={(e) => setCfg({ ...cfg, widthPct: clamp(+e.target.value, 10, 100) })}
            className="w-full"
          />
        </label>

        <button
          type="button"
          onClick={() => onInsertarGaleria?.(cfg)}
          className={`mt-3 w-full rounded bg-purple-600 font-medium text-white transition hover:bg-purple-700 ${
            isMobileViewport ? "px-3 py-1.5 text-sm" : "px-4 py-2 text-sm"
          }`}
        >
          Insertar galeria
        </button>
      </section>

      <section
        className={`border border-zinc-200 bg-zinc-50 ${
          isMobileViewport ? "rounded-lg p-2.5" : "rounded-xl p-3"
        }`}
      >
        <div className="text-xs font-semibold text-zinc-800">Presets y restricciones</div>
        <p className="mt-1 text-xs text-zinc-600">
          Configura presets predefinidos para usuarios finales. No edita blueprints libres.
        </p>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {SELECTABLE_LAYOUT_PRESETS.map((preset) => (
            <label
              key={preset.id}
              className={`flex items-center gap-2 rounded border px-2 py-1.5 text-xs ${
                cfg.allowedLayouts.includes(preset.id)
                  ? "border-purple-200 bg-white text-purple-800"
                  : "border-zinc-200 bg-white text-zinc-500"
              }`}
            >
              <input
                type="checkbox"
                checked={cfg.allowedLayouts.includes(preset.id)}
                onChange={(event) => setAllowedLayout(preset.id, event.target.checked)}
              />
              <span>{preset.label}</span>
            </label>
          ))}
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <label className="text-xs font-medium text-zinc-700">
            Default
            <select
              value={cfg.defaultLayout}
              onChange={(event) => setDefaultLayout(event.target.value)}
              className={controlClass}
            >
              {selectedLayoutOptions.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-medium text-zinc-700">
            Actual
            <select
              value={cfg.currentLayout}
              onChange={(event) => setCurrentLayout(event.target.value)}
              className={controlClass}
            >
              {selectedLayoutOptions.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>
    </div>
  );
}
