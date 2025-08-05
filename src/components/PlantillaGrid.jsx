// src/components/PlantillaGrid.jsx
import { useState } from "react";
import { getFunctions, httpsCallable } from "firebase/functions";

// 🔹 Genera slug limpio para Firebase/URLs
const generarSlug = (texto) => {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ñ/g, "n")
    .replace(/[^a-zA-Z0-9\s]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-");
};

export default function PlantillaGrid({ plantillas, onSeleccionarPlantilla }) {
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
  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6 gap-6 mt-8">
    {plantillas.map((p) => (
      <div
        key={p.id}
        className="bg-white border rounded-xl overflow-hidden shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all duration-300"
      >
        {/* Imagen cuadrada exacta */}
        <div className="aspect-square bg-gray-100 overflow-hidden">
          <img
            src={p.portada || "/placeholder.jpg"}
            alt={`Vista previa de ${p.nombre}`}
            className="w-full h-full object-cover object-top transition-transform duration-300 hover:scale-105"
          />
        </div>

        {/* Nombre y botón */}
        <div className="p-2 flex flex-col items-center text-center">
          <h3 className="text-xs sm:text-sm font-medium text-gray-700 truncate w-full">
            {p.nombre}
          </h3>
          <button
            onClick={async () => {
              const slug = await crearCopia(p);
              if (slug) onSeleccionarPlantilla(slug, p);
            }}
            disabled={loadingId === p.id}
            className="mt-2 bg-purple-600 text-white text-xs px-4 py-1.5 rounded-full hover:bg-purple-700 transition"
          >
            {loadingId === p.id ? "Copiando..." : "Usar esta plantilla"}
          </button>
        </div>
      </div>
    ))}
  </div>
);







}
