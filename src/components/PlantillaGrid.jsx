// src/components/PlantillaGrid.jsx

import { useState } from "react";
import { functions } from "@/firebase"; // según cómo tengas configurado tu alias
import { httpsCallable } from "firebase/functions";
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
    <div className="grid grid-cols-2 gap-4">
      {(plantillas || []).map((p) => (
        <div key={p.id} className="border p-4 rounded shadow">
                {p.portada && (
                <img
                  src={p.portada}
                  alt={`Vista previa de ${p.nombre}`}
                  className="mb-2 rounded shadow w-full h-40 object-cover"
                />
              )}

          <h3 className="text-lg font-semibold">{p.nombre}</h3>
          <button
 onClick={async () => {
  const slug = await crearCopia(p);
  if (slug) onSeleccionarPlantilla(slug); // 👈 solo pasás el slug
}}

>
  {loadingId === p.id ? "Copiando..." : "Usar esta plantilla"}
</button>

        </div>
      ))}
    </div>
  );
}
