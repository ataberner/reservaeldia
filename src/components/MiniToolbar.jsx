// components/MiniToolbar.jsx
import React, { useEffect, useState } from "react";
import GaleriaDeImagenes from "@/components/GaleriaDeImagenes";
import CountdownPreview from "@/components/editor/countdown/CountdownPreview";
import { COUNTDOWN_PRESETS } from "@/config/countdownPresets";
import { TEXT_PRESETS } from "@/config/textPresets";



// Normaliza props de texto para que CanvasEditor/ElementoCanvas las entienda
function normalizeTextProps(el) {
  const fontSize = Number(el.fontSize ?? el.size ?? 24);

  // Alineación: tomamos alias y devolvemos en minúscula
  const align =
    (el.align || el.textAlign || el.alignment || el.alineacion || "left").toLowerCase();

  // Color: soportar alias y setear ambos (color y fill)
  const color =
    el.color ?? el.fill ?? el.colorTexto ?? el.textColor ?? "#000000";

  // Konva usa factor para lineHeight
  const lineHeight =
    typeof el.lineHeight === "number" && el.lineHeight > 0
      ? el.lineHeight
      : typeof el.lineHeightPx === "number" && fontSize > 0
        ? el.lineHeightPx / fontSize
        : 1.2;

  // La alineación necesita un ancho para notarse. Si no vino, damos uno por defecto cuando no es left.
  const width = el.width ?? undefined;

  return {
    fontSize,
    fontFamily: el.fontFamily ?? el.font ?? "sans-serif",
    fontWeight: el.fontWeight ?? el.weight ?? "normal",
    fontStyle: el.fontStyle ?? el.style ?? "normal",
    textDecoration: el.textDecoration ?? el.decoration ?? "none",
    lineHeight,
    align,
    color,         // para tu modelo de datos
    fill: color,   // para Konva/Text (por si tu ElementoCanvas lo pasa tal cual)
    colorTexto: color,
    width,         // necesario para que align se vea
  };
}


// 🔎 Obtiene una sección destino robusta, usando fallbacks del Canvas
function getSeccionDestino(explicitId) {
  if (explicitId) return explicitId;
  if (typeof window === "undefined") return null;
  return (
    window._seccionActivaId ||
    (window.canvasEditor && window.canvasEditor.seccionActivaId) ||
    window._lastSeccionActivaId ||
    (Array.isArray(window._seccionesOrdenadas) && window._seccionesOrdenadas[0]?.id) ||
    null
  );

}

// Altura aproximada del bloque de texto (en px) para apilado vertical
function calcTextBlockHeight(el) {
  const fs = Number(el.fontSize ?? 24);
  // En Konva, lineHeight es un factor (1.0 = igual al fontSize, 1.2 recomendable)
  const lineH = (typeof el.lineHeight === "number" && el.lineHeight > 0) ? el.lineHeight : 1.2;
  const lines = String(el.texto ?? "").split("\n").length || 1;
  return Math.ceil(fs * lineH * lines);
}


// Inserta una combinación prediseñada de textos usando el mismo camino que "Añadir título"
// Inserta una combinación prediseñada de textos centrando cada renglón por su propio ancho
function insertarPresetTexto(preset, seccionActivaId) {
  const seccionId = getSeccionDestino(seccionActivaId);
  if (!seccionId) {
    alert("⚠️ No hay secciones aún. Creá una sección para insertar el preset.");
    return;
  }

  // Tomamos un “centro base” para el grupo. Podés moverlo con preset.centerX si querés.
  const centerX = Number.isFinite(preset.centerX) ? preset.centerX : (preset.baseX ?? 300);
  const baseY = preset.baseY ?? 120;
  const gapY = preset.gapY ?? 6;

  const items = preset.elements || preset.items || preset.objetos || [];
  if (!items.length) return;

  let cursorY = baseY;

  items.forEach((raw, idx) => {
    const el = raw || {};
    const norm = normalizeTextProps(el); // tipografías, tamaños, color…

    // Posición vertical: y explícito (y/dy) o apilar
    const hasY = (el.y != null) || (el.dy != null);
    const y = hasY ? (baseY + Number(el.y ?? 0) + Number(el.dy ?? 0)) : cursorY;

    // Medimos ancho "real" de este renglón con su fuente
    const w = measureTextWidth(el.texto ?? "", {
      fontStyle: norm.fontStyle,
      fontWeight: norm.fontWeight,
      fontSize: norm.fontSize,
      fontFamily: norm.fontFamily,
    });

    // Posición horizontal: centrado respecto a centerX (+ dx opcional)
    // Si querés anular el centrado en un renglón, podés pasar el.x para forzar un x absoluto.
    let x;
    if (el.x != null) {
      x = (preset.baseX ?? 0) + Number(el.x); // x absoluto si lo pidieron
    } else {
      const dx = Number(el.dx ?? 0);
      x = Math.round((centerX - (w / 2)) + dx);
    }

    // Armamos el payload. Importante: NO seteamos width para no “atar” el alineado.
    const detail = {
      id: `${el.tipo || "texto"}-${Date.now().toString(36)}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
      tipo: el.tipo || "texto",
      texto: el.texto ?? "",
      x, y,

      // estilo
      fontSize: norm.fontSize,
      fontFamily: norm.fontFamily,
      fontWeight: norm.fontWeight,
      fontStyle: norm.fontStyle,
      textDecoration: norm.textDecoration,
      lineHeight: norm.lineHeight,

      // color (respetamos tu modelo actual)
      color: norm.color,
      colorTexto: norm.color,
      fill: norm.fill,

      // alineación visual en Konva: dejamos "left" para que el x calculado domine
      align: "left",

      // sin width → cada línea queda libre
      width: undefined,

      rotation: el.rotation ?? 0,
      scaleX: el.scaleX ?? 1,
      scaleY: el.scaleY ?? 1,
      seccionId,
    };

    window.dispatchEvent(new CustomEvent("insertar-elemento", { detail }));

    // Si no vino Y explícito, apilamos dejando gap
    if (!hasY) {
      // alto estimado del renglón (una sola línea); si esperás wraps, podés mejorar esto
      const lineH = (typeof norm.lineHeight === "number" && norm.lineHeight > 0) ? norm.lineHeight : 1.2;
      const h = Math.ceil(norm.fontSize * lineH);
      cursorY = y + h + gapY;
    }
  });
}



// ——— Helpers para medir texto en el DOM (offscreen) ———
let __measureCtx = null;

function getMeasureCtx() {
  if (typeof document === "undefined") return null;
  if (__measureCtx) return __measureCtx;
  const c = document.createElement("canvas");
  __measureCtx = c.getContext("2d");
  return __measureCtx;
}

function buildFontString({ fontStyle = "normal", fontWeight = "normal", fontSize = 24, fontFamily = "sans-serif" }) {
  // Ej: "italic 600 24px Poppins, sans-serif"
  const style = (fontStyle && fontStyle !== "normal") ? `${fontStyle} ` : "";
  const weight = (fontWeight && fontWeight !== "normal") ? `${fontWeight} ` : "";
  return `${style}${weight}${Number(fontSize)}px ${fontFamily}`;
}

function measureTextWidth(texto, fontDesc) {
  const ctx = getMeasureCtx();
  if (!ctx) return 0;
  ctx.font = buildFontString(fontDesc);
  // Nota: measureText().width da el ancho de la línea (sin wraps)
  return Math.ceil(ctx.measureText(String(texto ?? "")).width);
}



// Helper: convierte "YYYY-MM-DDTHH:mm" a ISO (UTC) y agrega segundos si faltan.
// Devuelve null si es inválida.
function fechaStrToISO(str) {
  if (!str || typeof str !== "string") return null;

  // Si no trae segundos, los agregamos para mayor compatibilidad (Safari, etc.)
  let s = str.trim();
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s)) {
    s += ":00";
  }

  const d = new Date(s); // interpretado en zona local del usuario
  const ms = d.getTime();
  if (Number.isNaN(ms)) {
    console.warn("[Countdown] fecha/hora inválida →", str);
    return null;
  }
  const iso = d.toISOString(); // normalizamos a UTC ISO
  return iso;
}




export default function MiniToolbar({
  botonActivo,
  onAgregarTitulo,
  onAgregarSubtitulo,
  onAgregarParrafo,
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
  seccionActivaId: seccionProp,
  setImagenesSeleccionadas,
  onInsertarGaleria,
  objetoSeleccionado,
  celdaGaleriaActiva,
  onAsignarImagenGaleria,
  onQuitarImagenGaleria,
  onAgregarCuentaRegresiva,
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

  // Estado interno sincronizado con 3 fuentes: prop -> evento global -> fallback por selección
  const [seccionActivaId, setSeccionActivaId] = useState(
    seccionProp || (typeof window !== "undefined" ? window._seccionActivaId : null)
  );

  // 1) Sync con la prop cuando cambie
  useEffect(() => {
    if (seccionProp) setSeccionActivaId(seccionProp);
  }, [seccionProp]);

  // Escuchar el evento global
  useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = (e) => setSeccionActivaId(e?.detail?.id ?? null);
    window.addEventListener("seccion-activa", handler);
    return () => window.removeEventListener("seccion-activa", handler);
  }, []);


  // 3) Fallback: si no hay sección pero hay elementos seleccionados, usar su seccionId
  const getSeccionIdParaInsertar = () => {
    let sid = seccionActivaId || (typeof window !== "undefined" ? window._seccionActivaId : null);
    if (sid) return sid;

    try {
      const sel = (typeof window !== "undefined" && window._elementosSeleccionados) ? window._elementosSeleccionados : [];
      if (sel && sel.length > 0 && typeof window.__getObjById === "function") {
        const objSel = window.__getObjById(sel[0]);
        if (objSel?.seccionId) sid = objSel.seccionId;
      }
    } catch {/* ignore */ }
    return sid || null;
  };


  // valor inicial: +30 días, formateado como "YYYY-MM-DDTHH:mm"
  const ahoraMas30d = (() => {
    const d = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30);
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  })();


  const [fechaEventoStr, setFechaEventoStr] = useState(ahoraMas30d);

  if (!botonActivo) return null;

  return (
    <div className="flex flex-col gap-4 h-full min-h-0">

      {botonActivo === "texto" && (
        <div className="flex flex-col gap-2 flex-1 min-h-0">
          {/* Botones individuales */}
          {/* Botón Título */}
          <button
            onClick={onAgregarTitulo}
            className="w-full px-4 py-2 rounded-lg border border-zinc-300 
             bg-white text-zinc-800 font-semibold text-center
             hover:bg-purple-100 hover:border-purple-500 hover:text-purple-700
             hover:shadow-md transition-all"
          >
            Añadir título
          </button>

          {/* Botón Subtítulo */}
          <button
            onClick={onAgregarSubtitulo}
            className="w-full px-4 py-2 rounded-lg border border-zinc-300 
             bg-white text-zinc-700 font-medium text-center
             hover:bg-purple-100 hover:border-purple-500 hover:text-purple-700
             hover:shadow-md transition-all"
          >
            Añadir subtítulo
          </button>

          {/* Botón Párrafo */}
          <button
            onClick={onAgregarParrafo}
            className="w-full px-4 py-2 rounded-lg border border-zinc-300 
             bg-white text-zinc-600 text-center
             hover:bg-purple-100 hover:border-purple-500 hover:text-purple-700
             hover:shadow-md transition-all"
          >
            Añadir párrafo
          </button>



          {/* 🔹 NUEVA SECCIÓN DE PRESETS */}
          <div className="mt-4 flex-1 min-h-0">
            <div className="flex flex-col gap-3 h-full overflow-y-auto pr-1">
              {TEXT_PRESETS.map((preset) => (

                <button
                  key={preset.id}
                  onClick={() => insertarPresetTexto(preset, seccionActivaId)}
                  className="w-full p-2 rounded-lg border border-zinc-200 hover:border-purple-400 hover:shadow-md transition bg-zinc-100 flex items-center justify-center"
                >
                  <div
                    className="flex flex-col items-center justify-center text-center"
                    style={{
                      transform: "scale(0.8)",   // 🔥 escala proporcional
                      transformOrigin: "center",
                      whiteSpace: "nowrap",      // 🔥 evita que corte líneas en 2
                    }}
                  >
                    {(preset.objetos || preset.elements || preset.items || []).map((obj, i) => {
                      const norm = normalizeTextProps(obj);
                      return (
                        <div
                          key={i}
                          style={{
                            fontFamily: norm.fontFamily,
                            fontSize: norm.fontSize, // usamos el real (se escala arriba)
                            color: norm.color,
                            fontWeight: norm.fontWeight,
                            fontStyle: norm.fontStyle,
                            textDecoration: norm.textDecoration,
                            lineHeight: norm.lineHeight,
                          }}
                        >
                          {obj.texto}
                        </div>
                      );
                    })}
                  </div>
                </button>


              ))}
            </div>
          </div>



        </div>
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


      {botonActivo === "contador" && (
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

                    {/* Wrapper para controlar tamaño exacto del preview */}
                    <div className="w-full">
                      <CountdownPreview targetISO={isoPreview} preset={p.props} size="sm" />
                    </div>


                  </button>
                );
              })}
            </div>
          </div>




        </div>
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
