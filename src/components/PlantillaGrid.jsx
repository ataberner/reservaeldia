// src/components/PlantillaGrid.jsx

import { useState } from "react";
import { functions } from "@/firebase"; // según cómo tengas configurado tu alias
import { httpsCallable } from "firebase/functions";

export default function PlantillaGrid({ plantillas, onSeleccionarPlantilla }) {
  const [loading, setLoading] = useState(false);

  const crearCopia = async (plantilla) => {
  setLoading(true);
  try {
    const copiarPlantilla = httpsCallable(functions, "copiarPlantilla");
    const slug = `${plantilla.nombre.toLowerCase().replace(/\s+/g, "-")}-${Date.now()}`;

    const result = await copiarPlantilla({
      plantillaId: plantilla.id,
      slug
    });

    console.log("✅ Resultado:", result.data);
    return result.data.slug; // ← ✅ devolvemos el slug
  } catch (error) {
    console.error("❌ Error:", error);
    alert("Hubo un problema al copiar la plantilla");
    return null;
  } finally {
    setLoading(false);
  }
};


  return (
    <div className="grid grid-cols-2 gap-4">
      {(plantillas || []).map((p) => (
        <div key={p.id} className="border p-4 rounded shadow">
          <h3 className="text-lg font-semibold">{p.nombre}</h3>
          <button
  onClick={async () => {
    const slugUsado = await crearCopia(p); // vamos a retornar el slug
    if (onSeleccionarPlantilla && slugUsado) {
      onSeleccionarPlantilla(slugUsado);
    }
  }}
                >
            {loading ? "Copiando..." : "Usar esta plantilla"}
          </button>
        </div>
      ))}
    </div>
  );
}
