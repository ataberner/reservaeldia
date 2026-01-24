import { useState, useEffect, useRef } from "react";

export default function TipoSelector({ onSeleccionarTipo }) {
  const [tipoSeleccionado, setTipoSeleccionado] = useState("boda");

  const tipos = [
    { id: "boda", nombre: "Boda", img: "/assets/img/selector/boda1.png" },
    { id: "cumple", nombre: "Cumpleaños", img: "/assets/img/selector/cumpleanos1.png" },
    { id: "ceremonia", nombre: "Ceremonia", img: "/assets/img/selector/religioso.png" },
  ];

  const containerRef = useRef(null);
  const itemRefs = useRef({});

  const manejarSeleccion = (id) => {
    setTipoSeleccionado(id);
    onSeleccionarTipo(id);
  };

  // Selecciona Boda por defecto al cargar
  useEffect(() => {
    manejarSeleccion("boda");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ✅ Auto-centrado SOLO en mobile (cuando cambia la selección)
  useEffect(() => {
    const cont = containerRef.current;
    const el = itemRefs.current[tipoSeleccionado];
    if (!cont || !el) return;

    // Solo aplicar en pantallas menores a md (Tailwind md = 768px)
    const isMobile = typeof window !== "undefined" && window.innerWidth < 768;
    if (!isMobile) return;

    // Calcular cuánto mover para que el item quede centrado
    const contRect = cont.getBoundingClientRect();
    const elRect = el.getBoundingClientRect();
    const delta = (elRect.left - contRect.left) - (contRect.width / 2) + (elRect.width / 2);

    cont.scrollBy({ left: delta, behavior: "smooth" });
  }, [tipoSeleccionado]);

  return (
    <div className="flex flex-col items-center mt-12 pb-4 w-full">
      <h2 className="text-2xl font-bold text-gray-800 mb-4 text-center px-4">
        ¿Qué tipo de invitación querés hacer?
      </h2>

      {/* ✅ Mobile: scroll horizontal / ✅ Desktop: grid fijo */}
      <div
        ref={containerRef}
        className="
          w-full max-w-5xl
          flex gap-4 overflow-x-auto px-3 py-3
          md:grid md:grid-cols-3 md:gap-6 md:overflow-x-visible md:px-0
        "
        style={{
          WebkitOverflowScrolling: "touch",
          scrollbarWidth: "none",   // Firefox
          msOverflowStyle: "none",  // Edge viejo
        }}
      >
        {tipos.map((tipo) => {
          const activo = tipoSeleccionado === tipo.id;

          return (
            <button
              key={tipo.id}
              ref={(node) => {
                if (node) itemRefs.current[tipo.id] = node;
              }}
              type="button"
              onClick={() => manejarSeleccion(tipo.id)}
              className={`
  relative flex-shrink-0
  w-72 h-32 sm:w-80 sm:h-36
  md:w-full md:h-32 lg:h-36
  rounded-2xl overflow-hidden
  transition-all duration-200
  active:scale-[0.98]
  ${activo
                  ? "ring-4 ring-[#773dbe] shadow-lg"
                  : "shadow-md hover:shadow-lg"}
`}

            >
              {/* Imagen de fondo */}
              <img
                src={tipo.img}
                alt={tipo.nombre}
                className="absolute inset-0 w-full h-full object-cover"
                draggable={false}
              />

              {/* Overlay (mejor legibilidad del texto) */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/25 to-transparent" />

              {/* Texto */}
              <div className="relative z-10 h-full w-full flex items-end justify-center pb-4 px-4">
                <span className="text-white text-xl md:text-xl lg:text-2xl font-extrabold tracking-wide drop-shadow">
                  {tipo.nombre}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
