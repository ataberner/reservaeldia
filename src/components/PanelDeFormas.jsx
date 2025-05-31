// src/components/PanelDeFormas.jsx
import { useState } from "react";

export default function PanelDeFormas({ abierto, onCerrar, sidebarAbierta, onInsertarForma, onInsertarIcono }) {
  const [verTodo, setVerTodo] = useState(null); // "formas" o "iconos"

  if (!abierto || !sidebarAbierta) return null;

  const formas = [
    { id: "cuadrado", tipo: "forma", figura: "rect", color: "#773dbe" },
    { id: "circulo", tipo: "forma", figura: "circle", color: "#773dbe" },
    { id: "linea", tipo: "forma", figura: "line", color: "#773dbe" },
    { id: "triangulo", tipo: "forma", figura: "triangle", color: "#773dbe" },
  ];

  const iconos = [
    { id: "icono1", src: "/iconos/estrella.png" },
    { id: "icono2", src: "/iconos/corazon.png" },
    { id: "icono3", src: "/iconos/arcoiris.png" },
    // 🔁 luego los vas a cargar dinámicamente de Firebase
  ];

  return (
  <div className="transition-all duration-500 ease-in-out overflow-hidden max-h-[500px] opacity-100">
    <div className="flex flex-col gap-6 pt-2">
      {/* Hilera de Formas */}
      <div>
        <div className="flex justify-between items-center px-2">
          <span className="font-semibold text-sm text-white">Formas básicas</span>
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
      className="w-20 h-20 rounded bg-white flex items-center justify-center shadow cursor-pointer hover:scale-105 transition relative"
      onClick={() =>
        onInsertarForma({
          id: `forma-${Date.now()}`,
          tipo: "forma",
          figura: forma.figura,
          color: forma.color,
          x: 100,
          y: 100,
          scaleX: 1,
          scaleY: 1,
          rotation: 0,
        })
      }
    >
      {/* Dibujos visuales por tipo */}
      {forma.figura === "rect" && (
        <div className="w-10 h-10 bg-black" />
      )}
      {forma.figura === "circle" && (
        <div className="w-10 h-10 rounded-full bg-black" />
      )}
      {forma.figura === "line" && (
        <div className="w-10 h-[2px] bg-black" />
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
    

      {/* Hilera de Iconos */}
      <div>
        <div className="flex justify-between items-center px-2">
          <span className="font-semibold text-sm text-white">Íconos & GIFs</span>
          <button
            className="text-xs underline text-white"
            onClick={() => setVerTodo(verTodo === "iconos" ? null : "iconos")}
          >
            {verTodo === "iconos" ? "Cerrar" : "Ver todo"}
          </button>
        </div>

        <div
          className={`flex gap-2 px-2 overflow-x-auto py-2 transition-all ${
            verTodo === "iconos" ? "max-h-[400px]" : "max-h-[100px]"
          }`}
        >
          {iconos.map((icono) => (
            <div
              key={icono.id}
              className="w-20 h-20 rounded bg-white flex items-center justify-center overflow-hidden cursor-pointer hover:scale-105 transition"
              onClick={() =>
                onInsertarIcono({
                  id: `icono-${Date.now()}`,
                  tipo: "icono",
                  src: icono.src,
                  x: 100,
                  y: 100,
                  scaleX: 1,
                  scaleY: 1,
                  rotation: 0,
                })
              }
            >
              <img src={icono.src} alt="" className="w-full h-full object-contain" />
            </div>
          ))}
        </div>
      </div>
    </div>
  </div>
);

}
