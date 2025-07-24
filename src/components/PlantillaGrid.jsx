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
    const generarPreview = httpsCallable(functions, "generarPreviewBorrador");

    const slug = `${generarSlug(plantilla.nombre)}-${Date.now()}`;

    const result = await copiarPlantilla({ plantillaId: plantilla.id, slug });
    console.log("✅ Resultado:", result.data);

    // 🔥 Generar thumbnail automáticamente
    await generarPreview({ slug });

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
                <div className="mb-2 w-full h-48 overflow-hidden rounded shadow border border-gray-200">
  <img
    src={`https://firebasestorage.googleapis.com/v0/b/reservaeldia-7a440.appspot.com/o/plantillas%2F${p.id}%2Fpreview.png?alt=media`}
    alt={`Preview de ${p.nombre}`}
    className="w-full h-full object-cover"
    loading="lazy"
  />
</div>

              )}

          <h3 className="text-lg font-semibold">{p.nombre}</h3>
          <button
 onClick={async () => {
  const slug = await crearCopia(p);
  if (slug) onSeleccionarPlantilla(slug, p);
}}

>
  {loadingId === p.id ? "Copiando..." : "Usar esta plantilla"}
</button>

        </div>
      ))}
    </div>
  );
}
