// src/components/PlantillaGrid.jsx

import { useState } from "react";
import { functions } from "@/firebase"; // según cómo tengas configurado tu alias
import { getFunctions, httpsCallable } from "firebase/functions";
const generarSlug = (texto) => {
  return texto
    .normalize("NFD")                     // separa letras y tildes
    .replace(/[\u0300-\u036f]/g, "")     // elimina tildes
    .replace(/ñ/g, "n")                  // reemplaza ñ por n
    .replace(/[^a-zA-Z0-9\s]/g, "")      // elimina caracteres especiales
    .trim()                              // quita espacios al principio y final
    .toLowerCase()                       // todo minúsculas
    .replace(/\s+/g, "-");               // espacios por guiones
};


export default function PlantillaGrid({ plantillas, onSeleccionarPlantilla }) {
  const [loading, setLoading] = useState(false);
  const [loadingId, setLoadingId] = useState(null);

const crearCopia = async (plantilla) => {
  setLoadingId(plantilla.id);
  try {
    const functions = getFunctions();
    const copiarPlantilla = httpsCallable(functions, "copiarPlantilla");
    

    const slug = `${generarSlug(plantilla.nombre)}-${Date.now()}`;

    const result = await copiarPlantilla({ plantillaId: plantilla.id, slug });
    console.log("✅ Resultado:", result.data);

  
    return result.data.slug;
  } catch (error) {
    console.error("❌ Error:", error);
    return null;
  } finally {
    setLoadingId(null);
  }
};



  return (
  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-5 mt-8">
    {plantillas.map((p) => (
  <div
    key={p.id}
    className="w-[300px] bg-white border rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-all duration-200"
  >
    <div className="w-full h-[340px] bg-gray-100 overflow-hidden">
      <img
        src={p.portada || "/placeholder.jpg"}
        alt={`Vista previa de ${p.nombre}`}
        className="w-full h-full object-cover object-top"
      />
    </div>

    <div className="p-3">
      <h3 className="text-sm font-semibold text-gray-800 truncate text-center">{p.nombre}</h3>
      <div className="flex justify-center mt-3">
        <button
          onClick={async () => {
            const slug = await crearCopia(p);
            if (slug) onSeleccionarPlantilla(slug, p);
          }}
          className="bg-purple-600 text-white text-xs px-3 py-2 rounded hover:bg-purple-700 transition"
          disabled={loadingId === p.id}
        >
          {loadingId === p.id ? "Copiando..." : "Usar esta plantilla"}
        </button>
      </div>
    </div>
  </div>
))}

  </div>
);

}
