// src/components/editor/toolbar/FloatingTextToolbar.jsx
import React from "react";
import { Check } from "lucide-react"; // mismo icono que usabas

export default function FloatingTextToolbar({
  // 🔧 Datos y handlers que YA existen en CanvasEditor (los pasamos por props)
  objetoSeleccionado,
  setObjetos,
  elementosSeleccionados,

  mostrarSelectorFuente,
  setMostrarSelectorFuente,

  mostrarSelectorTamaño,
  setMostrarSelectorTamaño,

  ALL_FONTS,
  fontManager,
  tamaniosDisponibles = [],

  onCambiarAlineacion,
}) {
  // 👉 mantenemos exactamente las mismas condiciones/variables auxiliares
  const esTexto = objetoSeleccionado?.tipo === "texto";
  const esFormaConTexto =
    objetoSeleccionado?.tipo === "forma" && objetoSeleccionado?.texto;
  const esRect = objetoSeleccionado?.figura === "rect";

  if (!(objetoSeleccionado?.tipo === "texto" || objetoSeleccionado?.tipo === "forma" || objetoSeleccionado?.tipo === "icono")) {
    return null;
  }

  // 🆕 AGREGAR ESTE BLOQUE COMPLETO después de la línea del return null:

  // Para iconos, solo mostrar selector de color
  if (objetoSeleccionado?.tipo === "icono") {
    return (
      <div
        className="fixed z-50 bg-white border rounded shadow p-2 flex gap-2 items-center"
        style={{
          top: "120px",
          left: "50%",
          transform: "translateX(-50%)",
          width: "auto",
          maxWidth: "200px",
        }}
      >
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-600">Color</label>
          <input
            type="color"
            value={objetoSeleccionado.color || "#000000"}
            onChange={(e) => {
              const nuevoColor = e.target.value;
              console.log("🎨 [TOOLBAR] Cambiando color de ícono:", {
                elementoId: elementosSeleccionados[0],
                colorAnterior: objetoSeleccionado.color,
                colorNuevo: nuevoColor,
                elementosSeleccionados
              });

              setObjetos((prev) => {
                console.log("🔍 [TOOLBAR] Objetos antes del cambio:", prev.length);

                const nuevosObjetos = prev.map((o) => {
                  if (elementosSeleccionados.includes(o.id)) {
                    console.log("✅ [TOOLBAR] Actualizando objeto:", {
                      id: o.id,
                      tipo: o.tipo,
                      colorAnterior: o.color,
                      colorNuevo: nuevoColor
                    });
                    return { ...o, color: nuevoColor };
                  }
                  return o;
                });

                console.log("🔍 [TOOLBAR] Objetos después del cambio:", nuevosObjetos.length);
                return nuevosObjetos;
              });
            }}
            className="w-8 h-6 rounded cursor-pointer"
            title="Color del ícono"
          />
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed z-50 bg-white border rounded shadow p-2 flex gap-2 items-center"
      style={{
        top: "120px",
        left: "50%",
        transform: "translateX(-50%)",
        width: "auto",
        maxWidth: "800px",
      }}
    >
      {/* 🎨 Color de fondo (solo formas) */}
      {objetoSeleccionado?.tipo === "forma" && (
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-600">Fondo</label>
          <input
            type="color"
            value={objetoSeleccionado.color || "#ffffff"}
            onChange={(e) =>
              setObjetos((prev) =>
                prev.map((o) =>
                  elementosSeleccionados.includes(o.id)
                    ? { ...o, color: e.target.value }
                    : o
                )
              )
            }
            className="w-8 h-6 rounded"
          />
        </div>
      )}

      {/* 🟣 Radio esquinas (solo rectángulos) */}
      {objetoSeleccionado?.tipo === "forma" && esRect && (
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-600">Esquinas</label>
          <input
            type="range"
            min={0}
            max={100}
            value={objetoSeleccionado.cornerRadius || 0}
            onChange={(e) =>
              setObjetos((prev) =>
                prev.map((o) =>
                  elementosSeleccionados.includes(o.id)
                    ? { ...o, cornerRadius: parseInt(e.target.value) }
                    : o
                )
              )
            }
          />
          <span className="text-xs text-gray-700">
            {objetoSeleccionado.cornerRadius || 0}
          </span>
        </div>
      )}

      {/* Selector de fuente */}
      <div
        className={`relative cursor-pointer px-3 py-1 rounded border text-sm transition-all ${mostrarSelectorFuente ? "bg-gray-200" : "hover:bg-gray-100"
          }`}
        style={{ fontFamily: objetoSeleccionado?.fontFamily || "sans-serif" }}
        title="Fuente"
        onClick={() => setMostrarSelectorFuente(!mostrarSelectorFuente)}
      >
        {objetoSeleccionado?.fontFamily || "sans-serif"}

        {mostrarSelectorFuente && (
          <div
            className="absolute popup-fuente z-50 bg-white border rounded-2xl shadow-md p-4 w-80 max-h-[500px] overflow-auto"
            style={{ top: "40px", left: "-200px" }}
          >
            <div className="text-xs font-semibold text-gray-600 mb-2">
              Fuente
            </div>
            {ALL_FONTS.map((fuente) => {
              const estaActiva = objetoSeleccionado?.fontFamily === fuente.valor;
              const estaCargada = fontManager.isFontAvailable(fuente.valor);

              return (
                <div
                  key={fuente.valor}
                  className={`flex items-center gap-2 px-2 py-2 rounded cursor-pointer transition-all ${estaCargada
                    ? "hover:bg-gray-100"
                    : "hover:bg-gray-50 opacity-70"
                    }`}
                  style={{ fontFamily: estaCargada ? fuente.valor : "sans-serif" }}
                  onClick={async (e) => {
                    e.stopPropagation();
                    try {
                      await fontManager.loadFonts([fuente.valor]);
                      setObjetos((prev) =>
                        prev.map((o) =>
                          elementosSeleccionados.includes(o.id)
                            ? { ...o, fontFamily: fuente.valor }
                            : o
                        )
                      );
                    } catch (error) {
                      console.error("Error cargando fuente:", error);
                    }
                  }}
                >
                  <span className="text-xs text-gray-500 w-20">
                    {fuente.categoria}
                  </span>
                  <span className="text-sm text-gray-700 flex-1">
                    {fuente.nombre}
                  </span>
                  <span
                    className="text-base text-gray-400"
                    style={{ fontFamily: fuente.valor }}
                  >
                    AaBbCc
                  </span>
                  {estaActiva && <Check className="w-4 h-4 text-purple-600 ml-2" />}
                  {!estaCargada && (
                    <div className="w-4 h-4 ml-2">
                      <div className="w-4 h-4 border-2 border-gray-300 border-t-transparent rounded-full animate-spin" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Control de tamaño */}
      <div className="relative flex items-center bg-white border rounded-lg">
        <button
          className="px-2 py-1 hover:bg-gray-100 transition"
          onClick={(e) => {
            e.stopPropagation();
            setObjetos((prev) =>
              prev.map((o) => {
                if (!elementosSeleccionados.includes(o.id)) return o;
                const actual = o.fontSize || 24;
                return { ...o, fontSize: Math.max(6, actual - 2) };
              })
            );
          }}
        >
          −
        </button>

        <div
          className={`px-2 py-1 text-sm cursor-pointer transition-all ${mostrarSelectorTamaño ? "bg-gray-200" : "hover:bg-gray-100"
            }`}
          onClick={() => setMostrarSelectorTamaño(!mostrarSelectorTamaño)}
        >
          {objetoSeleccionado?.fontSize || 24}
          {mostrarSelectorTamaño && (
            <div
              className="absolute popup-fuente z-50 bg-white border rounded-2xl shadow-md p-2 w-24 max-h-[300px] overflow-auto"
              style={{ top: "40px", left: "-10px" }}
            >
              {tamaniosDisponibles.map((tam) => (
                <div
                  key={tam}
                  className="px-2 py-1 text-sm hover:bg-gray-100 rounded cursor-pointer text-center"
                  onClick={(e) => {
                    e.stopPropagation();
                    setObjetos((prev) =>
                      prev.map((o) =>
                        elementosSeleccionados.includes(o.id)
                          ? { ...o, fontSize: tam }
                          : o
                      )
                    );
                    setMostrarSelectorTamaño(false);
                  }}
                >
                  {tam}
                </div>
              ))}
            </div>
          )}
        </div>

        <button
          className="px-2 py-1 hover:bg-gray-100 transition"
          onClick={() => {
            setObjetos((prev) =>
              prev.map((o) => {
                if (!elementosSeleccionados.includes(o.id)) return o;
                return {
                  ...o,
                  fontSize: Math.min(120, (o.fontSize || 24) + 2),
                };
              })
            );
          }}
        >
          +
        </button>
      </div>

      {/* 🎨 Color de texto */}
      <input
        type="color"
        value={objetoSeleccionado?.colorTexto || "#000000"}
        onChange={(e) => {
          setObjetos((prev) =>
            prev.map((o) =>
              elementosSeleccionados.includes(o.id)
                ? { ...o, colorTexto: e.target.value }
                : o
            )
          );
        }}
      />

      {/* B / I / S */}
      <button
        className={`px-2 py-1 rounded border text-sm font-bold transition ${objetoSeleccionado?.fontWeight === "bold"
          ? "bg-gray-200"
          : "hover:bg-gray-100"
          }`}
        onClick={() =>
          setObjetos((prev) =>
            prev.map((o) =>
              elementosSeleccionados.includes(o.id)
                ? {
                  ...o,
                  fontWeight: o.fontWeight === "bold" ? "normal" : "bold",
                }
                : o
            )
          )
        }
      >
        B
      </button>

      <button
        className={`px-2 py-1 rounded border text-sm italic transition ${objetoSeleccionado?.fontStyle === "italic"
          ? "bg-gray-200"
          : "hover:bg-gray-100"
          }`}
        onClick={() =>
          setObjetos((prev) =>
            prev.map((o) =>
              elementosSeleccionados.includes(o.id)
                ? {
                  ...o,
                  fontStyle: o.fontStyle === "italic" ? "normal" : "italic",
                }
                : o
            )
          )
        }
      >
        I
      </button>

      <button
        className={`px-2 py-1 rounded border text-sm transition ${objetoSeleccionado?.textDecoration === "underline"
          ? "bg-gray-200 underline"
          : "hover:bg-gray-100"
          }`}
        onClick={() =>
          setObjetos((prev) =>
            prev.map((o) =>
              elementosSeleccionados.includes(o.id)
                ? {
                  ...o,
                  textDecoration:
                    o.textDecoration === "underline" ? "none" : "underline",
                }
                : o
            )
          )
        }
      >
        S
      </button>

      {/* Alineación */}
      <button
        className="px-2 py-1 rounded border text-sm transition hover:bg-gray-100 flex items-center justify-center"
        onClick={onCambiarAlineacion}
        title={`Alineación: ${objetoSeleccionado?.align || "izquierda"}`}
      >
        {(() => {
          const align = objetoSeleccionado?.align || "left";
          switch (align) {
            case "left":
              return "⬅️";
            case "center":
              return "↔️";
            case "right":
              return "➡️";
            case "justify":
              return "⚌";
            default:
              return "⬅️";
          }
        })()}
      </button>
    </div>
  );
}
