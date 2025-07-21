// components/ShapeToolbar.jsx
import { useState, useEffect, useRef } from "react";

export default function ShapeToolbar({ shapeElement, onUpdateShape, style = {} }) {
  const [mostrarSelectorColor, setMostrarSelectorColor] = useState(false);
  const colorRef = useRef(null);

  useEffect(() => {
    const handleClickFuera = (e) => {
      if (colorRef.current && !colorRef.current.contains(e.target)) {
        setMostrarSelectorColor(false);
      }
    };

    document.addEventListener("mousedown", handleClickFuera);
    return () => document.removeEventListener("mousedown", handleClickFuera);
  }, []);

  if (!shapeElement || shapeElement.tipo !== "forma" || shapeElement.figura === "line") return null;

  const colorActual = shapeElement.color || "#000000";

  const coloresPredefinidos = ["#000", "#fff", "#ff0000", "#00ff00", "#0000ff", "#ff00ff", "#00ffff", "#ffa500", "#808080"];

  const actualizarColor = (nuevoColor) => {
    if (onUpdateShape) {
      onUpdateShape(shapeElement.id, {
        color: nuevoColor,
        isFinal: true,
      });
    }
  };

  return (
    <div
      className="fixed z-50 bg-white border rounded shadow p-2 flex gap-2 items-center"
      style={{
        ...style,
        animation: "fadeInScale 0.15s ease-out",
      }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="relative" ref={colorRef}>
        <button
          onClick={() => setMostrarSelectorColor(!mostrarSelectorColor)}
          className="flex items-center gap-2 px-3 py-2 rounded border text-sm hover:bg-gray-100"
        >
          <div className="w-5 h-5 rounded-full border border-gray-300" style={{ backgroundColor: colorActual }} />
          <span className="text-xs font-medium">Color</span>
        </button>

        {mostrarSelectorColor && (
          <div className="absolute top-full mt-2 bg-white border rounded-lg shadow-xl p-3 z-50 min-w-[200px]">
            <input
              type="color"
              value={colorActual}
              onChange={(e) => actualizarColor(e.target.value)}
              className="w-full h-8 mb-3 rounded border"
            />
            <div className="grid grid-cols-5 gap-2">
              {coloresPredefinidos.map((color) => (
                <button
                  key={color}
                  className="w-6 h-6 rounded-full border"
                  style={{ backgroundColor: color }}
                  onClick={() => actualizarColor(color)}
                />
              ))}
            </div>
          </div>
        )}
      </div>



{/* 🟪 Control de esquinas redondeadas */}
<div className="flex flex-col items-start">
  <label className="text-xs text-gray-600 mb-1">Esquinas</label>
  <div className="flex items-center gap-2">
    {/* Slider */}
    <input
      type="range"
      min={0}
      max={100}
      step={1}
      value={shapeElement.cornerRadius || 0}
      onChange={(e) => {
        const nuevoRadio = parseInt(e.target.value);
        onUpdateShape(shapeElement.id, {
          cornerRadius: nuevoRadio,
          isPreview: true,
        });
      }}
      onMouseUp={(e) => {
        const nuevoRadio = parseInt(e.target.value);
        onUpdateShape(shapeElement.id, {
          cornerRadius: nuevoRadio,
          isFinal: true,
        });
      }}
      className="w-[120px]"
    />

    {/* Input numérico */}
    <input
      type="number"
      min={0}
      max={100}
      value={shapeElement.cornerRadius || 0}
      onChange={(e) => {
        const nuevoValor = parseInt(e.target.value);
        if (!isNaN(nuevoValor)) {
          onUpdateShape(shapeElement.id, {
            cornerRadius: nuevoValor,
            isPreview: true,
          });
        }
      }}
      onBlur={(e) => {
        const valorFinal = parseInt(e.target.value);
        if (!isNaN(valorFinal)) {
          onUpdateShape(shapeElement.id, {
            cornerRadius: valorFinal,
            isFinal: true,
          });
        }
      }}
      className="w-[50px] px-1 py-0.5 border rounded text-sm"
    />
  </div>
</div>




{/* Tamaño de fuente */}
<div className="flex items-center gap-2">
  <label className="text-xs text-white w-24">Tamaño texto</label>
  <input
    type="number"
    min={8}
    max={200}
    value={shapeElement.fontSize || 24}
    onChange={(e) =>
      onActualizar({ fontSize: parseInt(e.target.value), isFinal: true })
    }
    className="w-20 text-black rounded px-1"
  />
</div>

{/* Color del texto */}
<div className="flex items-center gap-2">
  <label className="text-xs text-white w-24">Color texto</label>
  <input
    type="color"
    value={shapeElement.colorTexto || "#000000"}
    onChange={(e) =>
      onActualizar({ colorTexto: e.target.value, isFinal: true })
    }
    className="w-8 h-6 rounded"
  />
</div>

{/* Fuente */}
<div className="flex items-center gap-2">
  <label className="text-xs text-white w-24">Fuente</label>
  <select
    value={shapeElement.fontFamily || "sans-serif"}
    onChange={(e) =>
      onActualizar({ fontFamily: e.target.value, isFinal: true })
    }
    className="text-black rounded px-1"
  >
    <option value="sans-serif">Sans-serif</option>
    <option value="serif">Serif</option>
    <option value="monospace">Monospace</option>
    <option value="Great Vibes">Great Vibes</option>
  </select>
</div>

{/* Alineación */}
<div className="flex items-center gap-2">
  <label className="text-xs text-white w-24">Alineación</label>
  <select
    value={shapeElement.align || "center"}
    onChange={(e) =>
      onActualizar({ align: e.target.value, isFinal: true })
    }
    className="text-black rounded px-1"
  >
    <option value="left">Izquierda</option>
    <option value="center">Centro</option>
    <option value="right">Derecha</option>
  </select>
</div>




    </div>  
  );
}
