import useMisImagenes from "@/hooks/useMisImagenes";
import { useState, useEffect, useRef } from "react";
import { Trash2, Heart, Star, Smile } from "lucide-react";


export default function GaleriaDeImagenes({
  imagenes = [],           // ✅ Siempre será array aunque no llegue nada
  imagenesEnProceso = [],  // ✅ Igual para imágenes en proceso
  cargarImagenes,
  cargando,
  seccionActivaId,
  borrarImagen,
  hayMas,
  onInsertar,
  onSeleccionadasChange
}) {


  const [seleccionadas, setSeleccionadas] = useState([]);
  const [modoSeleccion, setModoSeleccion] = useState(false);
  const galeriaRef = useRef(null);


    useEffect(() => {
    if (typeof onSeleccionadasChange === "function") {
        onSeleccionadasChange(seleccionadas.length);
    }
    }, [seleccionadas]);

    useEffect(() => {
  const galeria = galeriaRef.current;
  if (!galeria) return;

  const onScroll = () => {
    if (
      galeria.scrollTop + galeria.clientHeight >= galeria.scrollHeight - 50 &&
      !cargando && hayMas
    ) {
      cargarImagenes(false); // carga más
    }
  };

  galeria.addEventListener("scroll", onScroll);
  return () => galeria.removeEventListener("scroll", onScroll);
}, [cargando, hayMas]);

  useEffect(() => {
    cargarImagenes(true);
  }, []);

  const toggleSeleccion = (id) => {
    setSeleccionadas((prev) =>
      prev.includes(id) ? prev.filter((imgId) => imgId !== id) : [...prev, id]
    );
    setModoSeleccion(true);
  };

  const borrarSeleccionadas = async () => {
    if (!confirm("¿Borrar las imágenes seleccionadas?")) return;
    for (let id of seleccionadas) {
      const img = imagenes.find((i) => i.id === id);
      if (img) await borrarImagen(img);
    }
    setSeleccionadas([]);
    setModoSeleccion(false);
  };

  return (
<div className="relative w-full">
     <div
  ref={galeriaRef}
  className="grid grid-cols-2 sm:grid-cols-3 gap-2 overflow-y-auto flex-1 min-h-0 p-2 w-full"
>

    {imagenesEnProceso.map((nombre) => (
  <div
    key={nombre}
    className="relative bg-gray-200 rounded shadow animate-pulse w-full aspect-square flex items-center justify-center text-xs text-gray-500"
  >
    Cargando...
  </div>
))}


     {imagenes.map((img) => {
  const estaSeleccionada = seleccionadas.includes(img.id);

  return (
  <div
  key={img.id}
  className="relative bg-white rounded shadow overflow-hidden cursor-pointer hover:scale-105 transition w-full aspect-square group"
  onClick={() => {
    if (modoSeleccion) {
      toggleSeleccion(img.id);
    } else {
      console.log("🧪 imagen completa:", img);
      console.log("🧪 typeof img.url:", typeof img.url);
      console.log("🧪 valor img.url:", img.url);

      if (typeof img.url !== "string") {
        alert("❌ img.url no es string, es: " + typeof img.url);
        return;
      }

      onInsertar({
        id: `img-${Date.now()}`,
        tipo: "imagen",
        src: img.url,
        x: 100,
        y: 100,
        seccionId: seccionActivaId,
        width: Math.min(300, img.ancho),
        height: (Math.min(300, img.ancho) * img.alto) / img.ancho,
      });
    }
  }}
>

      <img
        src={img.thumbnailUrl || img.url}
        alt={img.nombre}
        className="w-full h-full object-cover"
      />

      {/* Casilla de selección */}
      <div
        onClick={(e) => {
          e.stopPropagation();
          toggleSeleccion(img.id);
        }}
        className={`absolute top-1 left-1 w-5 h-5 rounded-sm border border-white text-xs font-bold flex items-center justify-center z-10
          transition-opacity duration-200
          ${
            estaSeleccionada
              ? "bg-purple-600 text-white opacity-100"
              : "bg-yellow-300 text-black opacity-0 group-hover:opacity-100 hover:opacity-100"
          }
        `}
      >
        {estaSeleccionada && "✔"}
      </div>
    </div>
  );
})}


      </div>

      {/* Ventana flotante */}
      {seleccionadas.length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-white text-purple-800 rounded shadow-md p-3 flex gap-4 z-50">
          <button
            onClick={borrarSeleccionadas}
            className="text-red-600 font-semibold hover:underline"
          >
            🗑️ Eliminar
          </button>
          <button
            onClick={() => {
              setSeleccionadas([]);
              setModoSeleccion(false);
            }}
            className="text-gray-500 hover:underline"
          >
            ❌ Cancelar
          </button>
        </div>
      )}
    </div>
  );
}
