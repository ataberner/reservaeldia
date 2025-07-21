// src/components/PanelDeFormas.jsx
import { useState, useEffect } from "react";
import useIconosPublicos from "@/hooks/useIconosPublicos";
import { ChevronRight } from "lucide-react";


export default function PanelDeFormas({ abierto, onCerrar, sidebarAbierta, seccionActivaId, }) {
  const [verTodo, setVerTodo] = useState(null);
const { iconos, populares, cargarMas, cargando, hayMas, cargarPorCategoria } = useIconosPublicos();

const [categoriaEspecial, setCategoriaEspecial] = useState([]);


useEffect(() => {
  cargarPorCategoria("corazones").then(setCategoriaEspecial);
}, []);



  if (!abierto || !sidebarAbierta) return null;

  const formas = [
    { id: "cuadrado", tipo: "forma", figura: "rect", color: "#000000" },
    { id: "circulo", tipo: "forma", figura: "circle", color: "#000000" },
   { id: "linea", tipo: "forma", figura: "line", color: "#000000", points: [0, 0, 100, 0] },
    { id: "triangulo", tipo: "forma", figura: "triangle", color: "#000000" },
  ];

 

  return (
  <div className="transition-all duration-500 ease-in-out overflow-hidden max-h-[500px] opacity-100">
    <div className="flex flex-col pt-2">
      

{/* ⭐ Íconos populares */}
<div>
  <div className="flex justify-between items-center px-2">
    <span className="text-xs text-purple-200 uppercase tracking-wider font-semibold">
      Íconos populares
    </span>
    <button
      className="text-xs underline text-white"
      onClick={() => setVerTodo(verTodo === "populares" ? null : "populares")}
    >
      {verTodo === "populares" ? "Cerrar" : "Ver todo"}
    </button>
  </div>

  <div className="relative">
    <div
      className={`flex gap-2 px-2 overflow-x-auto scrollbar-hide py-2 transition-all ${
        verTodo === "populares" ? "max-h-[400px]" : "max-h-[100px]"
      }`}
    >
      {populares.map((icono) => {
        if (!icono.src) return null;

        return (
          <div
            key={`pop-${icono.id}`}
            className="w-14 h-14 rounded-xl bg-white flex items-center justify-center shadow cursor-pointer hover:scale-105 transition flex-shrink-0"
            onClick={() => {
              window.dispatchEvent(new CustomEvent("insertar-elemento", {
  detail: {
    id: `icono-${Date.now()}`,
    tipo: "icono",
    src: icono.src,
    x: 100,
    y: 100,
    seccionId: seccionActivaId,
    scaleX: 1,
    scaleY: 1,
    width: 100,
    height: 100,
    rotation: 0,
  }
}));

            }}
          >
            <div
              className="w-10 h-10 bg-center bg-no-repeat bg-contain"
              style={{ backgroundImage: `url(${icono.src})` }}
            />
          </div>
        );
      })}
    </div>

    {/* Flecha flotante */}
    <div className="pointer-events-none absolute right-1 top-[30%] z-10 p-1 rounded-full bg-black/30 backdrop-blur-sm">
      <ChevronRight className="w-5 h-5 text-white drop-shadow" />
    </div>
  </div>
</div>




<hr className="border-purple-700/50 my-3 mx-2" />

      {/* Hilera de Formas */}
      <div>
        <div className="flex justify-between items-center px-2">
          <span className="text-xs text-purple-200 uppercase tracking-wider font-semibold">Formas básicas</span>
          <button
            className="text-xs underline text-white"
            onClick={() => setVerTodo(verTodo === "formas" ? null : "formas")}
          >
            {verTodo === "formas" ? "Cerrar" : "Ver todo"}
          </button>
        </div>  
        <div
          className={`flex gap-2 px-2 overflow-x-auto py-2 transition-all ${
            verTodo === "formas" ? "max-h-[400px]" : "max-h-[100px]"
          }`}
        >

        {formas.map((forma) => (
          <div
            key={forma.id}
            className="w-14 h-14 rounded-xl bg-white flex items-center justify-center shadow hover:scale-105 transition cursor-pointer"
            onClick={() => {
  // Objeto base con TODAS las propiedades por defecto
 const elementoNuevo = {
  id: `forma-${Date.now()}`,
  tipo: "forma",
  figura: forma.figura,
  color: forma.color,
  x: 100,
  y: 100,
  width: 100,
  height: 100,
  scaleX: 1,
  scaleY: 1,
  rotation: 0,

  // 🆕 Propiedades para permitir texto dentro de la forma
  texto: "",
  fontSize: 24,
  fontFamily: "sans-serif",
  fontWeight: "normal",
  fontStyle: "normal",
  colorTexto: "#000000",
  align: "center",
};


  // Agregar propiedades ADICIONALES según el tipo
  if (forma.figura === "line") {
    // Para líneas, AGREGAR points (sin quitar width/height)
    elementoNuevo.points = [0, 0, 100, 0];
    elementoNuevo.strokeWidth = 2; // 🔥 AGREGAR GROSOR POR DEFECTO
  } else if (forma.figura === "circle") {
    // Para círculos, AGREGAR radius
    elementoNuevo.radius = 50;
  } else if (forma.figura === "triangle") {
    // Para triángulos, AGREGAR radius (Konva usa RegularPolygon)
    elementoNuevo.radius = 60;
  }

  window.dispatchEvent(new CustomEvent("insertar-elemento", { 
    detail: elementoNuevo
  }));
}}
          >
            {/* Dibujos visuales por tipo */}
            {forma.figura === "rect" && (
              <div className="w-8 h-8 bg-black" />
            )}
            {forma.figura === "circle" && (
              <div className="w-8 h-8 rounded-full bg-black" />
            )}
            {forma.figura === "line" && (
              <div className="w-8 h-[2px] bg-black" />
            )}
            {forma.figura === "triangle" && (
              <div
                className="w-0 h-0"
                style={{
                  borderLeft: "20px solid transparent",
                  borderRight: "20px solid transparent",
                  borderBottom: "35px solid #000000",
                }}
              />
            )}
      </div>
  ))}
</div>

       </div>


<hr className="border-purple-700/50 my-3 mx-2" />


      {/* Hilera de Iconos */}
      <div>
        <div className="flex justify-between items-center px-2">
          <span className="text-xs text-purple-200 uppercase tracking-wider font-semibold">
            Íconos & GIFs
          </span>

          <button
            className="text-xs underline text-white"
            onClick={() => setVerTodo(verTodo === "iconos" ? null : "iconos")}
          >
            {verTodo === "iconos" ? "Cerrar" : "Ver todo"}
          </button>
        </div>

      <div className="relative">
       <div
        className={`flex gap-2 px-2 overflow-x-auto scrollbar-hide py-2 min-h-[112px] transition-all ${
          verTodo === "iconos" ? "max-h-[400px]" : "max-h-[124px]"
        }`}
      >    
        {iconos.map((icono) => {
  

            return (
                     <div
                      key={icono.id}
                      className="w-14 h-14 rounded-xl bg-white flex items-center justify-center shadow cursor-pointer hover:scale-105 transition flex-shrink-0"
                      onClick={() => {
                         window.dispatchEvent(new CustomEvent("insertar-elemento", {
                           detail: {
                            id: `icono-${Date.now()}`,
                            tipo: "icono",
                            src: icono.src,
                            x: 100,
                            y: 100,
                            width: 100,
                            height: 100,
                            scaleX: 1,
                            scaleY: 1,
                            rotation: 0,
                          }}));
                        }}
                    >
                      <div
                        className="w-10 h-10 bg-center bg-no-repeat bg-contain"
                        style={{ backgroundImage: `url(${icono.src})` }}
                      />
                    </div>
                    );
                  })}{cargando &&
                    [...Array(3)].map((_, i) => (
                      <div
                        key={i}
                        className="w-14 h-14 rounded-xl bg-gray-300 animate-pulse shadow flex-shrink-0"
                      />
                    ))}

                  {hayMas && !cargando && (
                    <button
                      onClick={cargarMas}
                      className="w-14 h-14 bg-purple-200 text-purple-800 text-sm font-semibold rounded-xl hover:bg-purple-300 transition shadow flex-shrink-0"
                    >
                      +
                    </button>
                  )}

        </div>

        <div className="pointer-events-none absolute right-1 top-[22%] z-10 p-1 rounded-full bg-black/30 backdrop-blur-sm">
          <ChevronRight className="w-5 h-5 text-white drop-shadow" />
        </div>

      </div>

      </div>
    </div>
  </div>
);
}

