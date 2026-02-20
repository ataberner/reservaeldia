// components/MiniToolbarTabImagen.jsx
import React, { useEffect, useMemo, useState } from "react";
import GaleriaDeImagenes from "@/components/GaleriaDeImagenes";

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, isNaN(n) ? min : n));
}

function getWindowSelectionSnapshot() {
  if (typeof window === "undefined") {
    return { selectedIds: [], galleryCell: null };
  }

  return {
    selectedIds: Array.isArray(window._elementosSeleccionados)
      ? window._elementosSeleccionados
      : [],
    galleryCell: window._celdaGaleriaActiva || null,
  };
}

export default function MiniToolbarTabImagen({
  abrirSelector,
  imagenes,
  imagenesEnProceso,
  cargarImagenes,
  borrarImagen,
  hayMas,
  cargando,
  seccionActivaId,
  setMostrarGaleria,
  onInsertarGaleria,
  setImagenesSeleccionadas,
}) {
  const [mostrarPopoverGaleria, setMostrarPopoverGaleria] = useState(false);
  const [isMobileViewport, setIsMobileViewport] = useState(
    typeof window !== "undefined" ? window.innerWidth < 768 : false
  );
  const [editorSelection, setEditorSelection] = useState(getWindowSelectionSnapshot);
  const [cfg, setCfg] = useState({
    rows: 3,
    cols: 3,
    gap: 8,
    radius: 6,
    ratio: "1:1",
    widthPct: 70,
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    const syncViewport = () => setIsMobileViewport(window.innerWidth < 768);
    syncViewport();
    window.addEventListener("resize", syncViewport);
    return () => window.removeEventListener("resize", syncViewport);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const syncSelection = (event) => {
      const detail = event?.detail || {};
      const fallback = getWindowSelectionSnapshot();

      const selectedIds = Array.isArray(detail.ids)
        ? detail.ids
        : fallback.selectedIds;

      const galleryCellFromDetail =
        detail.galleryCell !== undefined
          ? detail.galleryCell
          : detail.cell !== undefined
            ? detail.cell
            : undefined;

      const galleryCell =
        galleryCellFromDetail !== undefined
          ? galleryCellFromDetail
          : fallback.galleryCell;

      setEditorSelection({
        selectedIds,
        galleryCell: galleryCell || null,
      });
    };

    syncSelection();

    window.addEventListener("editor-selection-change", syncSelection);
    window.addEventListener("editor-gallery-cell-change", syncSelection);

    return () => {
      window.removeEventListener("editor-selection-change", syncSelection);
      window.removeEventListener("editor-gallery-cell-change", syncSelection);
    };
  }, []);

  const galeriaSeleccionada = useMemo(() => {
    if (typeof window === "undefined") return null;
    if (!Array.isArray(editorSelection.selectedIds) || editorSelection.selectedIds.length !== 1) {
      return null;
    }

    const selectedId = editorSelection.selectedIds[0];
    const objetos = Array.isArray(window._objetosActuales) ? window._objetosActuales : [];
    const obj = objetos.find((item) => item?.id === selectedId);
    return obj?.tipo === "galeria" ? obj : null;
  }, [editorSelection.selectedIds]);

  const totalCeldasGaleria = useMemo(() => {
    const rows = Math.max(1, Number(galeriaSeleccionada?.rows) || 1);
    const cols = Math.max(1, Number(galeriaSeleccionada?.cols) || 1);
    return rows * cols;
  }, [galeriaSeleccionada?.rows, galeriaSeleccionada?.cols]);

  const celdaActiva = useMemo(() => {
    const cell = editorSelection.galleryCell;
    if (!cell || !galeriaSeleccionada) return null;
    if (cell.objId !== galeriaSeleccionada.id) return null;

    const idx = Number(cell.index);
    if (!Number.isFinite(idx) || idx < 0 || idx >= totalCeldasGaleria) return null;

    return { ...cell, index: idx };
  }, [editorSelection.galleryCell, galeriaSeleccionada, totalCeldasGaleria]);

  const textoAyudaGaleria = useMemo(() => {
    if (celdaActiva) {
      return `Celda ${celdaActiva.index + 1} de ${totalCeldasGaleria} lista. Toca una miniatura o usa "Subir y asignar".`;
    }

    if (galeriaSeleccionada) {
      return "Selecciona una celda en el lienzo para decidir donde se carga la proxima imagen.";
    }

    return "Selecciona un bloque de galeria para activar el modo de carga por celdas.";
  }, [celdaActiva, galeriaSeleccionada, totalCeldasGaleria]);

  const limpiarCeldaActiva = () => {
    if (!celdaActiva || typeof window.asignarImagenACelda !== "function") return;
    window.asignarImagenACelda(null, "cover");
  };

  return (
    <>
      <div className="relative">
        <button
          onClick={() => setMostrarPopoverGaleria((v) => !v)}
          className="flex items-center gap-2 w-full bg-orange-100 hover:bg-orange-200 text-orange-800 font-medium py-2 px-4 rounded-xl shadow-sm transition-all"
        >
          <span>Insertar galeria</span>
        </button>

        {mostrarPopoverGaleria && (
          <div className="absolute z-50 mt-2 w-72 right-0 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl shadow-xl p-3">
            <div className="grid grid-cols-2 gap-2">
              <label className="text-xs font-medium">
                Filas
                <input
                  type="number" min={1} max={6}
                  value={cfg.rows}
                  onChange={(e) => setCfg({ ...cfg, rows: clamp(+e.target.value, 1, 6) })}
                  className="mt-1 w-full rounded border px-2 py-1 text-sm"
                />
              </label>
              <label className="text-xs font-medium">
                Columnas
                <input
                  type="number" min={1} max={6}
                  value={cfg.cols}
                  onChange={(e) => setCfg({ ...cfg, cols: clamp(+e.target.value, 1, 6) })}
                  className="mt-1 w-full rounded border px-2 py-1 text-sm"
                />
              </label>
            </div>

            <div className="grid grid-cols-2 gap-2 mt-2">
              <label className="text-xs font-medium">
                Espaciado: {cfg.gap}px
                <input
                  type="range" min={0} max={30}
                  value={cfg.gap}
                  onChange={(e) => setCfg({ ...cfg, gap: +e.target.value })}
                  className="w-full"
                />
              </label>
              <label className="text-xs font-medium">
                Bordes: {cfg.radius}px
                <input
                  type="range" min={0} max={30}
                  value={cfg.radius}
                  onChange={(e) => setCfg({ ...cfg, radius: +e.target.value })}
                  className="w-full"
                />
              </label>
            </div>

            <div className="mt-2">
              <div className="text-xs font-medium mb-1">Proporcion</div>
              <div className="flex gap-2">
                {["1:1", "4:3", "16:9"].map((r) => (
                  <button
                    key={r}
                    onClick={() => setCfg({ ...cfg, ratio: r })}
                    className={`text-xs px-2 py-1 rounded border ${cfg.ratio === r ? "border-purple-500 ring-2 ring-purple-200" : "border-zinc-300"}`}
                  >
                    {r}
                  </button>
                ))}
              </div>

              <div className="mt-2">
                <label className="text-xs font-medium">
                  Ancho (% del canvas): {cfg.widthPct}%
                  <input
                    type="range" min={10} max={100}
                    value={cfg.widthPct}
                    onChange={(e) => setCfg({ ...cfg, widthPct: clamp(+e.target.value, 10, 100) })}
                    className="w-full"
                  />
                </label>
              </div>
            </div>

            <div className="mt-3 flex gap-2">
              <button
                onClick={() => setMostrarPopoverGaleria(false)}
                className="flex-1 px-3 py-2 rounded bg-zinc-100 hover:bg-zinc-200 text-sm"
              >Cancelar</button>
              <button
                onClick={() => {
                  setMostrarPopoverGaleria(false);
                  onInsertarGaleria?.(cfg);
                }}
                className="flex-1 px-3 py-2 rounded bg-purple-600 hover:bg-purple-700 text-white text-sm"
              >Insertar</button>
            </div>
          </div>
        )}
      </div>

      <div
        className={`rounded-xl border px-3 py-2 ${
          celdaActiva
            ? "border-emerald-200 bg-emerald-50"
            : "border-zinc-200 bg-zinc-50"
        }`}
      >
        {isMobileViewport && (
          <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-600">
            Modo galeria
          </div>
        )}
        <p className="mt-1 text-xs text-zinc-700">{textoAyudaGaleria}</p>
        {celdaActiva && (
          <button
            type="button"
            onClick={limpiarCeldaActiva}
            className="mt-2 text-xs font-medium text-zinc-600 hover:text-zinc-900 underline"
          >
            Quitar imagen de la celda activa
          </button>
        )}
      </div>

      <button
        onClick={abrirSelector}
        className={`flex items-center gap-2 w-full font-medium py-2 px-4 rounded-xl shadow-sm transition-all ${
          celdaActiva
            ? "bg-emerald-100 hover:bg-emerald-200 text-emerald-800"
            : "bg-purple-100 hover:bg-purple-200 text-purple-800"
        }`}
      >
        <span>{celdaActiva ? "Subir y asignar" : "Subir imagen"}</span>
      </button>

      <div className="flex-1 overflow-y-auto min-h-0">
        <GaleriaDeImagenes
          imagenes={imagenes || []}
          imagenesEnProceso={imagenesEnProceso || []}
          cargarImagenes={cargarImagenes}
          borrarImagen={borrarImagen}
          hayMas={hayMas}
          seccionActivaId={seccionActivaId}
          cargando={cargando}
          onInsertar={(nuevo) => {
            const url =
              nuevo?.url ||
              nuevo?.src ||
              nuevo?.downloadURL ||
              nuevo?.mediaUrl ||
              (typeof nuevo === "string" ? nuevo : null);

            if (url && typeof window.asignarImagenACelda === "function") {
              const ok = window.asignarImagenACelda(url, "cover");
              if (ok) {
                return;
              }
            }

            window.dispatchEvent(new CustomEvent("insertar-elemento", { detail: nuevo }));
            setMostrarGaleria(false);
          }}
          onSeleccionadasChange={setImagenesSeleccionadas}
        />
      </div>
    </>
  );
}
