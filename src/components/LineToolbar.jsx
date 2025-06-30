// components/LineToolbar.jsx
import { useState, useRef, useEffect } from "react";

export default function LineToolbar({ 
  lineElement, 
  onUpdateLine, 
  style = {} 
}) {
  const [mostrarSelectorGrosor, setMostrarSelectorGrosor] = useState(false);
  const [mostrarSelectorColor, setMostrarSelectorColor] = useState(false);
  const grosorRef = useRef(null);
  const colorRef = useRef(null);

  // Cerrar selectores al hacer clic fuera
  useEffect(() => {
    const handleClickFuera = (e) => {
      if (grosorRef.current && !grosorRef.current.contains(e.target)) {
        setMostrarSelectorGrosor(false);
      }
      if (colorRef.current && !colorRef.current.contains(e.target)) {
        setMostrarSelectorColor(false);
      }
    };

    document.addEventListener('mousedown', handleClickFuera);
    return () => document.removeEventListener('mousedown', handleClickFuera);
  }, []);

  if (!lineElement || lineElement.tipo !== 'forma' || lineElement.figura !== 'line') {
    return null;
  }

  const grosorActual = lineElement.strokeWidth || 3;
  const colorActual = lineElement.color || "#000000";

  // Grosores predefinidos
  const grosoresDisponibles = [1, 2, 3, 4, 5, 6, 8, 10, 12, 15, 18, 20, 24, 28, 32];

  // Colores predefinidos populares
  const coloresPredefinidos = [
    "#000000", // Negro
    "#ffffff", // Blanco
    "#ff0000", // Rojo
    "#00ff00", // Verde
    "#0000ff", // Azul
    "#ffff00", // Amarillo
    "#ff00ff", // Magenta
    "#00ffff", // Cyan
    "#ffa500", // Naranja
    "#800080", // Púrpura
    "#808080", // Gris
    "#a52a2a", // Marrón
  ];

  const actualizarGrosor = (nuevoGrosor) => {
    if (onUpdateLine) {
      onUpdateLine(lineElement.id, {
        strokeWidth: nuevoGrosor,
        isFinal: true
      });
    }
    setMostrarSelectorGrosor(false);
  };

  const actualizarColor = (nuevoColor) => {
    if (onUpdateLine) {
      onUpdateLine(lineElement.id, {
        color: nuevoColor,
        isFinal: true
      });
    }
  };

  return (
    <div
      className="fixed z-50 bg-white border rounded shadow p-2 flex gap-2 items-center line-toolbar"
      style={{
        ...style,
        width: "auto",
        maxWidth: "400px",
        animation: "fadeInScale 0.15s ease-out", // Animación suave de aparición
      }}
      onMouseDown={(e) => e.stopPropagation()} // Prevenir interferencias con el canvas
    >
      {/* 📏 Control de grosor */}
      <div className="relative" ref={grosorRef}>
        <button
          onClick={() => setMostrarSelectorGrosor(!mostrarSelectorGrosor)}
          className={`flex items-center gap-2 px-3 py-2 rounded border text-sm transition-all duration-200 ${
            mostrarSelectorGrosor ? "bg-gray-200" : "hover:bg-gray-100"
          }`}
          title={`Grosor: ${grosorActual}px`}
        >
          {/* Previsualización visual del grosor */}
          <div className="flex items-center gap-2">
            <div 
              className="bg-gray-700 rounded-full"
              style={{
                width: "20px",
                height: `${Math.min(Math.max(grosorActual / 2, 1), 8)}px`,
                minHeight: "1px"
              }}
            />
            <span className="text-xs font-medium">{grosorActual}px</span>
          </div>
          
          {/* Flecha */}
          <svg 
            className={`w-3 h-3 transition-transform ${mostrarSelectorGrosor ? 'rotate-180' : ''}`} 
            fill="none" 
            stroke="currentColor" 
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {/* Dropdown de grosores */}
        {mostrarSelectorGrosor && (
          <div className="absolute top-full left-0 mt-2 bg-white border rounded-lg shadow-xl p-3 z-50 min-w-[200px]">
            <div className="text-xs font-medium text-gray-600 mb-2">Seleccionar grosor:</div>
            <div className="space-y-2 max-h-[200px] overflow-y-auto">
              {grosoresDisponibles.map((grosor) => (
                <button
                  key={grosor}
                  onClick={() => actualizarGrosor(grosor)}
                  className={`w-full flex items-center justify-between p-2 rounded hover:bg-gray-100 transition-colors ${
                    grosorActual === grosor ? 'bg-purple-50 border border-purple-300' : ''
                  }`}
                >
                  <div className="flex items-center gap-3">
                    {/* Previsualización visual */}
                    <div 
                      className="bg-gray-700 rounded-full"
                      style={{
                        width: "30px",
                        height: `${Math.min(Math.max(grosor / 2, 1), 12)}px`,
                        minHeight: "1px"
                      }}
                    />
                    <span className="text-sm">{grosor}px</span>
                  </div>
                  
                  {/* Checkmark si está seleccionado */}
                  {grosorActual === grosor && (
                    <svg className="w-4 h-4 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 🎨 Control de color */}
      <div className="relative" ref={colorRef}>
        <button
          onClick={() => setMostrarSelectorColor(!mostrarSelectorColor)}
          className={`flex items-center gap-2 px-3 py-2 rounded border text-sm transition-all duration-200 ${
            mostrarSelectorColor ? "bg-gray-200" : "hover:bg-gray-100"
          }`}
          title={`Color: ${colorActual}`}
        >
          {/* Muestra de color */}
          <div 
            className="w-5 h-5 rounded-full border-2 border-gray-300"
            style={{ backgroundColor: colorActual }}
          />
          <span className="text-xs font-medium">Color</span>
          
          {/* Flecha */}
          <svg 
            className={`w-3 h-3 transition-transform ${mostrarSelectorColor ? 'rotate-180' : ''}`} 
            fill="none" 
            stroke="currentColor" 
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {/* Dropdown de colores */}
        {mostrarSelectorColor && (
          <div className="absolute top-full right-0 mt-2 bg-white border rounded-lg shadow-xl p-3 z-50 min-w-[250px]">
            <div className="text-xs font-medium text-gray-600 mb-2">Seleccionar color:</div>
            
            {/* Selector de color personalizado */}
            <div className="mb-3">
              <input
                type="color"
                value={colorActual}
                onChange={(e) => actualizarColor(e.target.value)}
                className="w-full h-8 rounded border border-gray-300 cursor-pointer"
                title="Color personalizado"
              />
            </div>
            
            {/* Colores predefinidos */}
            <div className="grid grid-cols-6 gap-2">
              {coloresPredefinidos.map((color) => (
                <button
                  key={color}
                  onClick={() => actualizarColor(color)}
                  className={`w-8 h-8 rounded border-2 hover:border-purple-400 transition-colors ${
                    colorActual === color ? 'border-purple-500 shadow-md' : 'border-gray-300'
                  }`}
                  style={{ backgroundColor: color }}
                  title={color}
                >
                  {/* Checkmark para color seleccionado */}
                  {colorActual === color && (
                    <svg 
                      className="w-4 h-4 mx-auto text-white drop-shadow-sm" 
                      fill="none" 
                      stroke="currentColor" 
                      viewBox="0 0 24 24"
                      style={{ filter: color === "#ffffff" ? "invert(1)" : "none" }}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </button>
              ))}
            </div>
            
            {/* Valor hex */}
            <div className="pt-2 mt-2 border-t text-center">
              <span className="text-xs text-gray-500 font-mono">{colorActual}</span>
            </div>
          </div>
        )}
      </div>

      {/* 📐 Información adicional */}
      <div className="flex items-center gap-1 px-2 py-1 bg-gray-50 rounded text-xs text-gray-600">
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <span>Línea</span>
      </div>
    </div>
  );
}