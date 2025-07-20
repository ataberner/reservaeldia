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
    </div>
  );
}
