// src/components/ModalCrearSeccion.jsx
import { useState, useEffect } from "react";
import usePlantillasDeSeccion from "@/hooks/usePlantillasDeSeccion";
import { subirImagenPublica } from "@/utils/imagenes";

export default function ModalCrearSeccion({ visible, onClose, onConfirm }) {
  const [modo, setModo] = useState("vacia"); // "vacia" o "plantilla"
  const [altura, setAltura] = useState(100);
  const [fondo, setFondo] = useState("#ffffff");
  const [tipo, setTipo] = useState("");
  const [plantillaSeleccionada, setPlantillaSeleccionada] = useState(null);

  const { plantillas, cargando, refrescar } = usePlantillasDeSeccion();


  useEffect(() => {
  if (visible && modo === "plantilla") {
    console.log("🔁 Refrescando plantillas de sección");
    refrescar();
  }
}, [modo, visible]);


  if (!visible) return null;


    const handleGuardarComoPlantilla = async (seccion, objetos) => {
    // Si hay imágenes, subirlas a storage público y actualizar src
    const objetosFinales = await Promise.all(
      objetos.map(async (obj) => {
        if (obj.tipo === "imagen" && obj.src && obj.src.startsWith("user_uploads/")) {
          const nuevaUrl = await subirImagenPublica(obj.src);
          return { ...obj, src: nuevaUrl };
        }
        return obj;
      })
    );

    const plantilla = {
      nombre: prompt("Nombre de la plantilla:"),
      altura: seccion.altura,
      fondo: seccion.fondo,
      tipo: seccion.tipo,
      objetos: objetosFinales
    };

    // Guardar en Firestore
    const ref = collection(db, "plantillas_secciones");
    await addDoc(ref, plantilla);
    await refrescar(); // 🔁 recarga las plantillas sin necesidad de refrescar la página
    alert("✅ Plantilla guardada correctamente");
  };


   return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center">
      <div className="bg-white rounded-lg shadow-lg p-6 w-full max-w-md">
        <h2 className="text-xl font-semibold mb-4">Crear nueva sección</h2>

        <div className="mb-4 flex gap-4">
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="modo"
              value="vacia"
              checked={modo === "vacia"}
              onChange={() => setModo("vacia")}
            />
            Sección vacía
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="modo"
              value="plantilla"
              checked={modo === "plantilla"}
              onChange={() => setModo("plantilla")}
            />
            Usar plantilla
          </label>
        </div>

        {modo === "vacia" && (
          <>
            <label className="block text-sm font-medium text-gray-700 mb-1">Altura (px)</label>
        
<select
  value={altura}
  onChange={(e) => setAltura(Number(e.target.value))}
  className="w-full mb-4 border rounded px-3 py-2"
>
  {[
    { px: 150, label: "Compacta (150px)", descripcion: "Ideal para headers y navegación" },
    { px: 200, label: "Pequeña (200px)", descripcion: "Contenido básico" },
    { px: 300, label: "Media (300px)", descripcion: "Contenido estándar" },
    { px: 400, label: "Mediana-Grande (400px)", descripcion: "Sección con más contenido" },
    { px: 500, label: "Grande (500px)", descripcion: "Sección destacada" },
    { px: 600, label: "Muy Grande (600px)", descripcion: "Galería o contenido extenso" },
    { px: 800, label: "Pantalla completa (800px)", descripcion: "Hero section principal" }
  ].map((opcion) => (
    <option key={opcion.px} value={opcion.px}>
      {opcion.label} - {opcion.descripcion}
    </option>
  ))}
</select>

            <label className="block text-sm font-medium text-gray-700 mb-1">Color de fondo</label>
            <input
              type="color"
              value={fondo}
              onChange={(e) => setFondo(e.target.value)}
              className="w-full mb-4 border rounded px-3 py-2 h-12"
            />

            <label className="block text-sm font-medium text-gray-700 mb-1">Tipo (opcional)</label>
            <input
              type="text"
              value={tipo}
              onChange={(e) => setTipo(e.target.value)}
              placeholder="hero, galeria, etc"
              className="w-full mb-4 border rounded px-3 py-2"
            />
          </>
        )}

        {modo === "plantilla" && (
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {cargando ? (
              <p className="text-sm text-gray-500 italic">Cargando plantillas...</p>
            ) : plantillas.length === 0 ? (
              <p className="text-sm text-gray-500 italic">No hay plantillas disponibles.</p>
            ) : (
              plantillas.map((p) => (
                <label
                  key={p.id}
                  className={`block border px-3 py-2 rounded cursor-pointer ${plantillaSeleccionada?.id === p.id ? "border-purple-500 bg-purple-50" : "hover:bg-gray-100"}`}
                >
                  <div className="flex gap-3 items-start">
                    <input
                      type="radio"
                      name="plantilla"
                      value={p.id}
                      checked={plantillaSeleccionada?.id === p.id}
                      onChange={() => setPlantillaSeleccionada(p)}
                      className="mt-1"
                    />
                    <div>
                      <div className="font-medium mb-1">{p.nombre}</div>
                      <div className="preview w-40 h-24 relative rounded overflow-hidden border text-[8px]">
                        <div
                          className="absolute inset-0"
                          style={{ backgroundColor: p.fondo }}
                        >
                          {p.objetos?.map((obj, i) =>
                            obj.tipo === "texto" ? (
                              <div
                                key={i}
                                className="absolute truncate"
                                style={{
                                  top: (obj.y || 0) * 0.2,
                                  left: (obj.x || 0) * 0.2,
                                  fontSize: (obj.fontSize || 12) * 0.2,
                                  color: obj.color || "#000",
                                  fontFamily: obj.fontFamily || "sans-serif"
                                }}
                              >
                                {obj.texto}
                              </div>
                            ) : null
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </label>
              ))
            )}
          </div>
        )}

        <div className="flex justify-end gap-2 mt-6">
          <button
  onClick={onClose}
  className="px-4 py-2 rounded bg-gray-100 hover:bg-gray-200"
>
  Cancelar
</button>

          <button
            onClick={() => {
             if (modo === "plantilla" && plantillaSeleccionada) {
              console.log("🧪 Altura seleccionada:", altura); // 👈 agregá esto
              onConfirm({
                id: `sec-${Date.now()}`,
                altura: plantillaSeleccionada.altura,
                fondo: plantillaSeleccionada.fondo || "#ffffff",
                tipo: plantillaSeleccionada.tipo || "custom",
                objetos: (plantillaSeleccionada.objetos || []).map(obj => ({
                  ...obj,
                  seccionId: `sec-${Date.now()}`
                })),
                desdePlantilla: true
              });
            }

              else {
                onConfirm({
                id: `sec-${Date.now()}`,
                altura,
                fondo,
                tipo,
              });
              }
              onClose();
             
            }}
            className="px-4 py-2 rounded bg-purple-600 text-white hover:bg-purple-700"
          >
            Crear sección
          </button>
        </div>
      </div>
    </div>
  );
}
