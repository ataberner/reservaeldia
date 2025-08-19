// components/MiniToolbar.jsx
import React, { useState } from "react";
import GaleriaDeImagenes from "@/components/GaleriaDeImagenes";


export default function MiniToolbar({
  botonActivo,
  onAgregarTexto,
  onAgregarForma,
  onAgregarImagen,
  onCrearPlantilla,
  onBorrarTodos,
  onAbrirModalSeccion,
  mostrarGaleria,
  setMostrarGaleria,
  abrirSelector,
  imagenes,
  imagenesEnProceso,
  cargarImagenes,
  borrarImagen,
  hayMas,
  cargando,
  seccionActivaId,
  setImagenesSeleccionadas,
  onInsertarGaleria,
  objetoSeleccionado,
  celdaGaleriaActiva,
  onAsignarImagenGaleria,
  onQuitarImagenGaleria,
}) {
  const [mostrarPopoverGaleria, setMostrarPopoverGaleria] = useState(false);
  const [cfg, setCfg] = useState({
    rows: 3,
    cols: 3,
    gap: 8,
    radius: 6,
    ratio: "1:1", // "1:1" | "4:3" | "16:9"
    widthPct: 70,
  });


  if (!botonActivo) return null;

  return (
    <div className="flex flex-col gap-4">
      {botonActivo === "texto" && (
        <button
          onClick={onAgregarTexto}
          className="flex items-center gap-2 w-full bg-purple-100 hover:bg-purple-200 text-purple-800 font-medium py-2 px-4 rounded-xl shadow-sm transition-all"
        >
          <span className="text-lg">📝</span>
          <span>Añadir texto</span>
        </button>
      )}

      {botonActivo === "forma" && (
        <button
          onClick={onAgregarForma}
          className="flex items-center gap-2 w-full bg-yellow-100 hover:bg-yellow-200 text-yellow-800 font-medium py-2 px-4 rounded-xl shadow-sm transition-all"
        >
          <span className="text-lg">🔷</span>
          <span>Añadir forma</span>
        </button>
      )}

      {botonActivo === "imagen" && (
        <>
          {/* 🔹 Insertar galería (nuevo) */}
          <div className="relative">
            <button
              onClick={() => setMostrarPopoverGaleria(v => !v)}
              className="flex items-center gap-2 w-full bg-orange-100 hover:bg-orange-200 text-orange-800 font-medium py-2 px-4 rounded-xl shadow-sm transition-all"
            >
              <span className="text-lg">📷📦</span>
              <span>Insertar galería</span>
            </button>


            {/* ---------- Acciones de Galería (solo si hay selección y celda activa) ---------- */}
            {objetoSeleccionado?.tipo === "galeria" && celdaGaleriaActiva && (
              <div className="flex items-center gap-2">
                {/* Input file oculto */}
                <input
                  id="file-galeria"
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    // MVP: usamos Object URL local. Luego lo cambiamos por upload a Storage y usar la URL pública.
                    const url = URL.createObjectURL(file);
                    onAsignarImagenGaleria?.(url);
                    // Limpio el input para permitir re-seleccionar el mismo archivo luego si quiere
                    e.target.value = "";
                  }}
                />

                {/* Botón visible que dispara el input */}
                <label
                  htmlFor="file-galeria"
                  className="px-2 py-1 text-sm rounded bg-violet-600 text-white cursor-pointer hover:bg-violet-700"
                  title="Asignar imagen a la celda activa"
                >
                  Asignar imagen
                </label>

                {/* Quitar imagen del slot activo */}
                <button
                  type="button"
                  onClick={() => onQuitarImagenGaleria?.()}
                  className="px-2 py-1 text-sm rounded bg-gray-100 hover:bg-gray-200"
                  title="Quitar imagen de la celda activa"
                >
                  Quitar
                </button>
              </div>
            )}

            {mostrarPopoverGaleria && (
              <div className="absolute z-50 mt-2 w-72 right-0 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl shadow-xl p-3">
                {/* Filas / Columnas */}
                <div className="grid grid-cols-2 gap-2">
                  <label className="text-xs font-medium">
                    Filas
                    <input
                      type="number" min={1} max={6}
                      value={cfg.rows}
                      onChange={e => setCfg({ ...cfg, rows: clamp(+e.target.value, 1, 6) })}
                      className="mt-1 w-full rounded border px-2 py-1 text-sm"
                    />
                  </label>
                  <label className="text-xs font-medium">
                    Columnas
                    <input
                      type="number" min={1} max={6}
                      value={cfg.cols}
                      onChange={e => setCfg({ ...cfg, cols: clamp(+e.target.value, 1, 6) })}
                      className="mt-1 w-full rounded border px-2 py-1 text-sm"
                    />
                  </label>
                </div>

                {/* Gap / Radius */}
                <div className="grid grid-cols-2 gap-2 mt-2">
                  <label className="text-xs font-medium">
                    Espaciado: {cfg.gap}px
                    <input
                      type="range" min={0} max={30}
                      value={cfg.gap}
                      onChange={e => setCfg({ ...cfg, gap: +e.target.value })}
                      className="w-full"
                    />
                  </label>
                  <label className="text-xs font-medium">
                    Bordes: {cfg.radius}px
                    <input
                      type="range" min={0} max={30}
                      value={cfg.radius}
                      onChange={e => setCfg({ ...cfg, radius: +e.target.value })}
                      className="w-full"
                    />
                  </label>
                </div>

                {/* Ratio */}
                <div className="mt-2">
                  <div className="text-xs font-medium mb-1">Proporción</div>
                  <div className="flex gap-2">
                    {["1:1", "4:3", "16:9"].map(r => (
                      <button
                        key={r}
                        onClick={() => setCfg({ ...cfg, ratio: r })}
                        className={`text-xs px-2 py-1 rounded border ${cfg.ratio === r ? "border-purple-500 ring-2 ring-purple-200" : "border-zinc-300"}`}
                      >
                        {r}
                      </button>
                    ))}
                  </div>

                  {/* Ancho (% del canvas) */}
                  <div className="mt-2">
                    <label className="text-xs font-medium">
                      Ancho (% del canvas): {cfg.widthPct}%
                      <input
                        type="range" min={10} max={100}
                        value={cfg.widthPct}
                        onChange={e => setCfg({ ...cfg, widthPct: clamp(+e.target.value, 10, 100) })}
                        className="w-full"
                      />
                    </label>
                  </div>

                </div>

                {/* CTA */}
                <div className="mt-3 flex gap-2">
                  <button
                    onClick={() => setMostrarPopoverGaleria(false)}
                    className="flex-1 px-3 py-2 rounded bg-zinc-100 hover:bg-zinc-200 text-sm"
                  >Cancelar</button>
                  <button
                    onClick={() => {
                      setMostrarPopoverGaleria(false);
                      onInsertarGaleria?.(cfg); // 👈 dispara creación
                    }}
                    className="flex-1 px-3 py-2 rounded bg-purple-600 hover:bg-purple-700 text-white text-sm"
                  >Insertar</button>
                </div>
              </div>
            )}
          </div>

          <button
            onClick={abrirSelector}
            className="flex items-center gap-2 w-full bg-purple-100 hover:bg-purple-200 text-purple-800 font-medium py-2 px-4 rounded-xl shadow-sm transition-all"
          >
            <span className="text-lg">📤</span>
            <span>Subir imagen</span>
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
  // intenta asignar a la celda activa si existe
  // 'nuevo' puede venir con distintas keys; tomamos la URL de forma defensiva
  const url =
    nuevo?.url ||
    nuevo?.src ||
    nuevo?.downloadURL ||
    nuevo?.mediaUrl ||
    (typeof nuevo === "string" ? nuevo : null);

  if (url && typeof window.asignarImagenACelda === "function") {
    const ok = window.asignarImagenACelda(url, "cover");
    if (ok) {
      // flujo rápido: cerrá el panel si querés
      setMostrarGaleria(false);
      return; // ✅ NO insertes como objeto suelto
    }
  }

  // ⬇️ fallback: comportamiento anterior (insertar imagen suelta)
  window.dispatchEvent(new CustomEvent("insertar-elemento", { detail: nuevo }));
  setMostrarGaleria(false);
}}


              onSeleccionadasChange={setImagenesSeleccionadas}
            />
          </div>

        </>
      )}


      {botonActivo === "menu" && (
        <>
          <button
            onClick={onAbrirModalSeccion}
            className="flex items-center gap-2 w-full bg-purple-100 hover:bg-purple-200 text-purple-800 font-medium py-2 px-4 rounded-xl shadow-sm transition-all"
          >
            <span className="text-lg">➕</span>
            <span>Añadir sección</span>
          </button>
          <button
            onClick={() => {
              window.dispatchEvent(new CustomEvent("insertar-elemento", {
                detail: {
                  id: `rsvp-${Date.now()}`,
                  tipo: "rsvp-boton",
                  texto: "Confirmar asistencia",
                  x: 300,
                  y: 100,
                  ancho: 220,
                  alto: 50,
                  color: "#773dbe",
                  colorTexto: "#ffffff",
                  fontSize: 18,
                  fontFamily: "sans-serif",
                  align: "center"
                }
              }));
            }}
            className="flex items-center gap-2 w-full bg-green-100 hover:bg-green-200 text-green-800 font-medium py-2 px-4 rounded-xl shadow-sm transition-all"
          >
            <span className="text-lg">📩</span>
            <span>Añadir RSVP</span>
          </button>




          <button
            onClick={onCrearPlantilla}
            className="flex items-center gap-2 w-full bg-blue-100 hover:bg-blue-200 text-blue-800 font-medium py-2 px-4 rounded-xl shadow-sm transition-all"
          >
            <span className="text-lg">✨</span>
            <span>Crear plantilla</span>
          </button>

          <button
            onClick={onBorrarTodos}
            className="flex items-center gap-2 w-full bg-red-100 hover:bg-red-200 text-red-800 font-medium py-2 px-4 rounded-xl shadow-sm transition-all"
          >
            <span className="text-lg">🗑️</span>
            <span>Borrar todos los borradores</span>
          </button>
        </>
      )}
    </div>
  );
}
function clamp(n, min, max) { return Math.max(min, Math.min(max, isNaN(n) ? min : n)); }
