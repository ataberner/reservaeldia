import React, { useCallback, useEffect, useMemo, useState } from "react";
import GalleryLayoutSelector, {
  PRIMARY_GALLERY_LAYOUT_IDS,
} from "@/components/gallery/GalleryLayoutSelector";
import { configureGalleryLayout } from "@/domain/gallery/galleryMutations";
import { getGalleryLayoutPresets } from "@/domain/gallery/galleryLayoutPresets";
import {
  getGalleryAllowedLayoutState,
} from "@/domain/gallery/sidebarModel";
import {
  readEditorObjectById,
  readEditorSelectionSnapshot,
} from "@/lib/editorRuntimeBridge";
import { EDITOR_BRIDGE_EVENTS } from "@/lib/editorBridgeContracts";

const SELECTABLE_LAYOUT_PRESETS = getGalleryLayoutPresets();
const DEFAULT_ALLOWED_LAYOUTS = [...PRIMARY_GALLERY_LAYOUT_IDS];
const PRESET_BY_ID = new Map(SELECTABLE_LAYOUT_PRESETS.map((preset) => [preset.id, preset]));

function getLayoutGridDefaults(layoutId) {
  const preset = PRESET_BY_ID.get(layoutId);
  const render = preset?.render || {};
  if (layoutId === "squares") {
    return { rows: 1, cols: 2, ratio: "1:1" };
  }

  return {
    rows: Math.max(1, Number(render.rows) || 1),
    cols: Math.max(1, Number(render.cols) || 1),
    ratio: render.ratio || "1:1",
  };
}

function buildCfgForLayout(prev, layoutId) {
  const allowedLayouts = prev.allowedLayouts.includes(layoutId)
    ? prev.allowedLayouts
    : [...prev.allowedLayouts, layoutId];
  const gridDefaults = getLayoutGridDefaults(layoutId);
  return {
    ...prev,
    allowedLayouts,
    defaultLayout: allowedLayouts.includes(prev.defaultLayout)
      ? prev.defaultLayout
      : layoutId,
    currentLayout: layoutId,
    rows: gridDefaults.rows,
    cols: gridDefaults.cols,
    ratio: gridDefaults.ratio,
  };
}

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
    rows: 1,
    cols: 4,
    gap: 8,
    radius: 6,
    ratio: "1:1",
    widthPct: 70,
    allowedLayouts: DEFAULT_ALLOWED_LAYOUTS,
    defaultLayout: "one_by_n",
    currentLayout: "one_by_n",
  });
  const [editorSelection, setEditorSelection] = useState(() =>
    typeof window !== "undefined" ? readEditorSelectionSnapshot() : { selectedIds: [] }
  );
  const [selectionRefreshToken, setSelectionRefreshToken] = useState(0);
  const [panelNotice, setPanelNotice] = useState("");

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
  const selectedGallery = useMemo(() => {
    if (!Array.isArray(editorSelection.selectedIds) || editorSelection.selectedIds.length !== 1) {
      return null;
    }

    const selectedId = editorSelection.selectedIds[0];
    const object = readEditorObjectById(selectedId);
    return object?.tipo === "galeria" ? object : null;
  }, [editorSelection.selectedIds, selectionRefreshToken]);
  const selectedGalleryLayoutState = useMemo(
    () => getGalleryAllowedLayoutState(selectedGallery),
    [selectedGallery]
  );
  const builderLayoutOptions = useMemo(() => {
    const ids = [
      ...PRIMARY_GALLERY_LAYOUT_IDS,
      ...selectedGalleryLayoutState.allowedLayouts,
      ...cfg.allowedLayouts,
    ];
    const seen = new Set();
    return ids
      .filter((id) => {
        if (!PRESET_BY_ID.has(id) || seen.has(id)) return false;
        seen.add(id);
        return true;
      })
      .map((id) => PRESET_BY_ID.get(id));
  }, [cfg.allowedLayouts, selectedGalleryLayoutState.allowedLayouts]);
  const activeLayoutId = selectedGallery
    ? selectedGalleryLayoutState.selectedLayout || cfg.currentLayout
    : cfg.currentLayout;

  useEffect(() => {
    if (typeof window === "undefined") return;
    const syncSelection = () => setEditorSelection(readEditorSelectionSnapshot());
    syncSelection();
    window.addEventListener(EDITOR_BRIDGE_EVENTS.SELECTION_CHANGE, syncSelection);
    return () => window.removeEventListener(EDITOR_BRIDGE_EVENTS.SELECTION_CHANGE, syncSelection);
  }, []);

  useEffect(() => {
    if (!selectedGallery) return;
    const allowedLayouts = selectedGalleryLayoutState.allowedLayouts.length
      ? selectedGalleryLayoutState.allowedLayouts
      : DEFAULT_ALLOWED_LAYOUTS;
    const defaultLayout = selectedGalleryLayoutState.defaultLayout || allowedLayouts[0] || "one_by_n";
    const currentLayout = selectedGalleryLayoutState.selectedLayout || defaultLayout;

    setCfg((prev) => ({
      ...prev,
      rows: Math.max(1, Number(selectedGallery.rows) || prev.rows),
      cols: Math.max(1, Number(selectedGallery.cols) || prev.cols),
      gap: Number.isFinite(Number(selectedGallery.gap)) ? Number(selectedGallery.gap) : prev.gap,
      radius: Number.isFinite(Number(selectedGallery.radius)) ? Number(selectedGallery.radius) : prev.radius,
      ratio: selectedGallery.ratio || prev.ratio,
      widthPct: Number.isFinite(Number(selectedGallery.widthPct)) ? Number(selectedGallery.widthPct) : prev.widthPct,
      allowedLayouts,
      defaultLayout,
      currentLayout,
    }));
  }, [
    selectedGallery?.id,
    selectedGallery?.rows,
    selectedGallery?.cols,
    selectedGallery?.gap,
    selectedGallery?.radius,
    selectedGallery?.ratio,
    selectedGallery?.widthPct,
    selectedGalleryLayoutState.defaultLayout,
    selectedGalleryLayoutState.selectedLayout,
    selectedGalleryLayoutState.allowedLayouts.join("|"),
  ]);

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

  const commitSelectedGalleryLayout = useCallback((layoutId) => {
    if (!selectedGallery) return false;

    const allowedLayouts = Array.from(
      new Set([
        ...(selectedGalleryLayoutState.allowedLayouts.length
          ? selectedGalleryLayoutState.allowedLayouts
          : cfg.allowedLayouts),
        layoutId,
      ])
    );
    const mutation = configureGalleryLayout(selectedGallery, layoutId, {
      allowedLayouts,
      defaultLayout: selectedGalleryLayoutState.defaultLayout || cfg.defaultLayout || layoutId,
    });

    if (!mutation.changed) {
      setPanelNotice(
        mutation.reason === "layout-not-allowed"
          ? "Ese layout no esta disponible para esta galeria."
          : "Ese layout ya esta seleccionado."
      );
      return false;
    }

    window.dispatchEvent(
      new CustomEvent(EDITOR_BRIDGE_EVENTS.UPDATE_ELEMENT, {
        detail: {
          id: selectedGallery.id,
          cambios: mutation.gallery,
        },
      })
    );
    setCfg((prev) => ({
      ...prev,
      allowedLayouts: mutation.gallery.allowedLayouts,
      defaultLayout: mutation.gallery.defaultLayout,
      currentLayout: mutation.gallery.currentLayout,
    }));
    setSelectionRefreshToken((value) => value + 1);
    setPanelNotice("Layout actualizado en la galeria seleccionada.");
    return true;
  }, [
    cfg.allowedLayouts,
    cfg.defaultLayout,
    selectedGallery,
    selectedGalleryLayoutState.allowedLayouts,
    selectedGalleryLayoutState.defaultLayout,
  ]);

  const handleLayoutSelected = useCallback((layoutId) => {
    if (selectedGallery) {
      commitSelectedGalleryLayout(layoutId);
      return;
    }

    const nextCfg = buildCfgForLayout(cfg, layoutId);
    setCfg(nextCfg);
    onInsertarGaleria?.(nextCfg);
    setPanelNotice("Galeria nueva insertada con el layout seleccionado.");
  }, [cfg, commitSelectedGalleryLayout, onInsertarGaleria, selectedGallery]);

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
        <GalleryLayoutSelector
          title="Layout"
          options={builderLayoutOptions}
          activeLayoutId={activeLayoutId}
          onSelect={handleLayoutSelected}
          compact={isMobileViewport}
        />
        {selectedGallery?.id && (
          <p className="mt-2 text-[11px] text-zinc-500">
            Galeria seleccionada: {selectedGallery.id}
          </p>
        )}
        {panelNotice && (
          <p className="mt-2 rounded border border-sky-100 bg-sky-50 px-2 py-1.5 text-xs text-sky-800">
            {panelNotice}
          </p>
        )}

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

        {!selectedGallery && (
          <button
            type="button"
            onClick={() => onInsertarGaleria?.(cfg)}
            className={`mt-3 w-full rounded bg-purple-600 font-medium text-white transition hover:bg-purple-700 ${
              isMobileViewport ? "px-3 py-1.5 text-sm" : "px-4 py-2 text-sm"
            }`}
          >
            Insertar galeria
          </button>
        )}
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
        </div>
      </section>
    </div>
  );
}
