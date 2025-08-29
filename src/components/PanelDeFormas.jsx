// src/components/PanelDeFormas.jsx
import { useState, useEffect, useRef } from "react";
import useIconosPublicos from "@/hooks/useIconosPublicos";
import { ChevronRight, ChevronLeft } from "lucide-react";

// 🔹 Componente de flecha con auto-scroll horizontal
function FlechaScroll({ direccion = "right" }) {
  const rafId = useRef(null);
  const hovering = useRef(false);

  const startScroll = (targetEl) => {
    if (!targetEl) return;
    const speed = 12; // px por frame (~60fps)

    const tick = () => {
      if (!hovering.current) return;
      if (direccion === "right") {
        targetEl.scrollLeft = Math.min(
          targetEl.scrollLeft + speed,
          targetEl.scrollWidth - targetEl.clientWidth
        );
        if (hovering.current && targetEl.scrollLeft < targetEl.scrollWidth - targetEl.clientWidth) {
          rafId.current = requestAnimationFrame(tick);
        }
      } else {
        targetEl.scrollLeft = Math.max(targetEl.scrollLeft - speed, 0);
        if (hovering.current && targetEl.scrollLeft > 0) {
          rafId.current = requestAnimationFrame(tick);
        }
      }
    };
    rafId.current = requestAnimationFrame(tick);
  };

  return (
    <div
      className={`absolute ${direccion === "right" ? "right-1" : "left-1"} top-[30%] 
                  z-10 p-1 rounded-full bg-black/30 backdrop-blur-sm cursor-pointer select-none`}
      onMouseEnter={(e) => {
        const cont = e.currentTarget
          .closest(".relative")
          ?.querySelector(".scroll-horizontal");
        if (!cont) return;
        if (cont.scrollWidth <= cont.clientWidth + 1) return; // nada para scrollear
        hovering.current = true;
        startScroll(cont);
      }}
      onMouseLeave={() => {
        hovering.current = false;
        if (rafId.current) cancelAnimationFrame(rafId.current);
      }}
    >
      {direccion === "right" ? (
        <ChevronRight className="w-5 h-5 text-white drop-shadow" />
      ) : (
        <ChevronLeft className="w-5 h-5 text-white drop-shadow" />
      )}
    </div>
  );
}

export default function PanelDeFormas({ abierto, sidebarAbierta, seccionActivaId }) {
  const [verTodo, setVerTodo] = useState(null);
  const { iconos, populares, cargarMas, cargando, hayMas, cargarPorCategoria } = useIconosPublicos();

  const [categoriaEspecial, setCategoriaEspecial] = useState([]);
  const loadMoreRef = useRef(null);
  const scrollRef = useRef(null);

  useEffect(() => {
    cargarPorCategoria("corazones").then(setCategoriaEspecial);
  }, [cargarPorCategoria]);

  if (!abierto || !sidebarAbierta) return null;

  const formas = [
    { id: "cuadrado", tipo: "forma", figura: "rect", color: "#000000" },
    { id: "circulo", tipo: "forma", figura: "circle", color: "#000000" },
    { id: "linea", tipo: "forma", figura: "line", color: "#000000" },
    { id: "triangulo", tipo: "forma", figura: "triangle", color: "#000000" },
  ];

  // ——————————————————————— Helpers insertar
  const insertarIcono = (src) => {
    if (!src) return;
    window.dispatchEvent(
      new CustomEvent("insertar-elemento", {
        detail: {
          id: `icono-${Date.now()}`,
          tipo: "icono",
          src,
          x: 100,
          y: 100,
          width: 100,
          height: 100,
          scaleX: 1,
          scaleY: 1,
          rotation: 0,
          seccionId: seccionActivaId,
        },
      })
    );
  };

  const insertarForma = (forma) => {
    const el = {
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
      seccionId: seccionActivaId,
      texto: "",
      fontSize: 24,
      fontFamily: "sans-serif",
      fontWeight: "normal",
      fontStyle: "normal",
      colorTexto: "#000000",
      align: "center",
    };
    if (forma.figura === "line") {
      el.points = [0, 0, 100, 0];
      el.strokeWidth = 2;
    } else if (forma.figura === "circle") {
      el.radius = 50;
    } else if (forma.figura === "triangle") {
      el.radius = 60;
    }
    window.dispatchEvent(new CustomEvent("insertar-elemento", { detail: el }));
  };


  const ItemIcono = ({ src, id }) => (
    <div
      key={id}
      className="w-14 h-14 rounded-xl bg-white border border-gray-200 hover:ring-2 hover:ring-purple-400 
               flex items-center justify-center shadow-sm cursor-pointer select-none"
      onMouseDown={(e) => {
        e.preventDefault(); // 👈 evita que robe foco o selección de texto
        const payload = {
          id: `icono-${Date.now()}`,
          tipo: "icono",
          src,
          x: 100,
          y: 100,
          width: 100,
          height: 100,
          scaleX: 1,
          scaleY: 1,
          rotation: 0,
          seccionId: seccionActivaId,
        };
        console.log("🟣 Insertar icono → dispatch:", payload);
        window.dispatchEvent(new CustomEvent("insertar-elemento", { detail: payload }));
      }}
    >
      <div
        className="w-10 h-10 bg-center bg-no-repeat bg-contain"
        style={{ backgroundImage: `url(${src})` }}
      />
    </div>
  );

  const ItemForma = ({ forma }) => (
    <div
      key={forma.id}
      className="w-14 h-14 rounded-xl bg-white border border-gray-200 hover:ring-2 hover:ring-purple-400 
               flex items-center justify-center shadow-sm cursor-pointer select-none"
      onMouseDown={(e) => {
        e.preventDefault();
        const payload = {
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
          seccionId: seccionActivaId,
        };

        if (forma.figura === "line") {
          payload.points = [0, 0, 100, 0];
          payload.strokeWidth = 2;
        } else if (forma.figura === "circle") {
          payload.radius = 50;
        } else if (forma.figura === "triangle") {
          payload.radius = 60;
        }

        console.log("🔷 Insertar forma → dispatch:", payload);
        window.dispatchEvent(new CustomEvent("insertar-elemento", { detail: payload }));
      }}
    >
      {/* Preview de la forma */}
      {forma.figura === "rect" && <div className="w-8 h-8 bg-black" />}
      {forma.figura === "circle" && <div className="w-8 h-8 rounded-full bg-black" />}
      {forma.figura === "line" && <div className="w-8 h-[2px] bg-black" />}
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
  );




  // ——————————————————————— Infinite scroll en “iconos”
  useEffect(() => {
    if (verTodo !== "iconos") return;
    if (!loadMoreRef.current) return;
    const sentinel = loadMoreRef.current;
    const rootEl = scrollRef.current || null;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting) && !cargando && hayMas) {
          cargarMas();
        }
      },
      { root: rootEl, rootMargin: "200px", threshold: 0.01 }
    );
    obs.observe(sentinel);
    return () => obs.disconnect();
  }, [verTodo, cargando, hayMas, cargarMas]);

  // ——————————————————————— Vista “Ver todo”
  if (verTodo) {
    const lista = verTodo === "populares" ? populares : iconos;
    const tituloCategoria =
      verTodo === "populares" ? "Íconos populares" : "Íconos & GIFs";

    return (
      <div className="flex flex-col h-full px-2 pt-1 -mt-1">
        {/* Header fijo */}
        <div className="flex items-center gap-2 flex-none sticky top-0 z-10 bg-white/80 backdrop-blur-sm py-1">
          <button
            className="p-1 rounded-lg hover:bg-zinc-100 transition"
            onClick={() => setVerTodo(null)}
            title="Volver"
          >
            <ChevronLeft className="w-5 h-5 text-zinc-700" />
          </button>
          <div className="text-sm font-semibold text-purple-700">{tituloCategoria}</div>
        </div>

        {/* Cuerpo scrollable */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto pr-1">
          <div className="grid grid-cols-3 gap-2">
            {lista.map((it) => {
              const src = it?.src;
              if (!src) return null;
              return <ItemIcono key={it.id || src} id={it.id || src} src={src} />;
            })}
          </div>

          {verTodo === "iconos" && (
            <>
              {cargando && (
                <div className="flex items-center justify-center py-3">
                  <div className="h-5 w-5 rounded-full border-2 border-zinc-300 border-t-purple-500 animate-spin" />
                </div>
              )}
              {hayMas && <div ref={loadMoreRef} className="h-6" />}
            </>
          )}
        </div>
      </div>
    );
  }

  // ——————————————————————— Vista principal
  return (
    <div className="flex flex-col gap-4 px-2 pt-1 h-full">

      {/* 🟪 Formas básicas */}
      <div>
        <div className="flex justify-between items-center px-1">
          <span className="text-xs text-purple-700 uppercase tracking-wider font-semibold">
            Formas básicas
          </span>
        </div>
        <div className="flex gap-2 px-1 overflow-x-auto py-2 scroll-horizontal">
          {formas.map((forma) => (
            <ItemForma key={forma.id} forma={forma} />
          ))}
        </div>
      </div>

      <hr className="border-purple-700/20 my-1 mx-2" />

      {/* ⭐ Íconos populares */}
      <div>
        <div className="flex justify-between items-center px-1">
          <span className="text-sm text-purple-700 font-semibold mb-1">Íconos populares</span>
          <button
            className="text-xs underline text-purple-700 hover:text-purple-800"
            onClick={() => setVerTodo("populares")}
          >
            Ver todo
          </button>
        </div>
        <div className="relative">
          <div className="flex gap-2 px-1 overflow-x-auto scrollbar-hide py-2 scroll-horizontal">
            {populares.map((icono) => {
              if (!icono?.src) return null;
              return <ItemIcono key={`pop-${icono.id || icono.src}`} id={icono.id || icono.src} src={icono.src} />;
            })}
          </div>
          <FlechaScroll direccion="left" />
          <FlechaScroll direccion="right" />
        </div>
      </div>

      <hr className="border-purple-700/20 my-1 mx-2" />

      {/* 🟣 Íconos & GIFs */}
      <div>
        <div className="flex justify-between items-center px-1">
          <span className="text-sm text-purple-700 font-semibold mb-1">Íconos & GIFs</span>
          <button
            className="text-xs underline text-purple-700 hover:text-purple-800"
            onClick={() => setVerTodo("iconos")}
          >
            Ver todo
          </button>
        </div>
        <div className="relative">
          <div className="flex gap-2 px-1 overflow-x-auto scrollbar-hide py-2 scroll-horizontal">
            {iconos.map((icono) => {
              if (!icono?.src) return null;
              return <ItemIcono key={icono.id || icono.src} id={icono.id || icono.src} src={icono.src} />;
            })}
            {cargando &&
              [...Array(3)].map((_, i) => (
                <div key={i} className="w-14 h-14 rounded-xl bg-gray-200 animate-pulse shadow flex-shrink-0" />
              ))}
          </div>
          <FlechaScroll direccion="left" />
          <FlechaScroll direccion="right" />
        </div>
      </div>
    </div>
  );

}
