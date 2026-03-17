// src/components/ModalCrearSeccion.jsx
import { useState, useEffect } from "react";
import usePlantillasDeSeccion from "@/hooks/usePlantillasDeSeccion";
import { subirImagenPublica } from "@/utils/imagenes";
import { ALTURAS_SECCIONES } from "functions/src/models/dimensionesBase";
import { normalizeSectionBackgroundModel } from "@/domain/sections/backgrounds";

function renderTemplatePreview(plantilla) {
  const backgroundModel = normalizeSectionBackgroundModel(plantilla, {
    sectionHeight: plantilla?.altura || 400,
  });
  const previewScale = 0.2;

  return (
    <div className="preview w-40 h-24 relative rounded overflow-hidden border text-[8px] bg-white">
      <div
        className="absolute inset-0"
        style={{
          background: backgroundModel.base.fondo || "#ffffff",
          backgroundImage:
            backgroundModel.base.fondoTipo === "imagen" && backgroundModel.base.fondoImagen
              ? `url(${backgroundModel.base.fondoImagen})`
              : undefined,
          backgroundSize: "cover",
          backgroundPosition: "center",
          backgroundRepeat: "no-repeat",
        }}
      />

      {backgroundModel.decoraciones.map((decoracion) => (
        <img
          key={`${plantilla?.id || plantilla?.nombre || "plantilla"}-${decoracion.id}`}
          src={decoracion.src}
          alt=""
          className="pointer-events-none absolute object-contain"
          style={{
            left: decoracion.x * previewScale,
            top: decoracion.y * previewScale,
            width: decoracion.width * previewScale,
            height: decoracion.height * previewScale,
            transform: `rotate(${decoracion.rotation || 0}deg)`,
            transformOrigin: "top left",
          }}
        />
      ))}

      {plantilla?.objetos?.map((obj, i) =>
        obj.tipo === "texto" ? (
          <div
            key={i}
            className="absolute truncate"
            style={{
              top: (obj.y || 0) * previewScale,
              left: (obj.x || 0) * previewScale,
              fontSize: (obj.fontSize || 12) * previewScale,
              color: obj.color || "#000",
              fontFamily: obj.fontFamily || "sans-serif",
            }}
          >
            {obj.texto}
          </div>
        ) : null
      )}
    </div>
  );
}

export default function ModalCrearSeccion({ visible, onClose, onConfirm }) {
  const [modo, setModo] = useState("vacia"); // "vacia" o "plantilla"
  const [altura, setAltura] = useState(400); // Valor por defecto: Media
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
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-lg p-6 w-full max-w-4xl max-h-[90vh] overflow-y-auto">
        <div className="mb-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Crear nueva sección</h2>
          <p className="text-sm text-gray-600">
            Las secciones son los "bloques" de tu invitación. Cada sección puede tener diferente tamaño y contenido.
          </p>
        </div>

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
            <label className="block text-sm font-medium text-gray-700 mb-3">Tamaño de la sección</label>
        
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-3 gap-3 mb-4">
              {ALTURAS_SECCIONES.map((opcion) => (
                <div
                  key={opcion.px}
                  onClick={() => setAltura(opcion.px)}
                  className={`relative border-2 p-3 rounded-lg cursor-pointer transition-all duration-200 ${
                    altura === opcion.px 
                      ? "border-purple-500 bg-purple-50 shadow-md" 
                      : "border-gray-200 hover:border-purple-300 hover:bg-purple-25"
                  }`}
                >
                  {/* Preview visual centrado */}
                  <div className="flex justify-center mb-3">
                    <div className="w-16 h-20 bg-gradient-to-b from-gray-50 to-gray-100 border-2 border-gray-200 rounded overflow-hidden shadow-sm">
                      <div 
                        className={`w-full transition-all duration-300 ${
                          altura === opcion.px 
                            ? "bg-gradient-to-b from-purple-400 to-purple-500" 
                            : "bg-gradient-to-b from-purple-300 to-purple-400"
                        }`}
                        style={{ height: `${Math.min((opcion.px / 800) * 100, 100)}%` }}
                      />
                    </div>
                  </div>
                  
                  {/* Información centrada */}
                  <div className="text-center">
                    <div className="font-semibold text-sm text-gray-900 mb-1">{opcion.label}</div>
                    <div className={`text-xs px-2 py-1 rounded-full font-medium mb-2 inline-block ${
                      altura === opcion.px 
                        ? "bg-purple-100 text-purple-700" 
                        : "bg-gray-100 text-gray-600"
                    }`}>
                      {opcion.px}px
                    </div>
                    <div className="text-xs text-gray-600">{opcion.descripcion}</div>
                  </div>
                  
                  {/* Checkmark en esquina */}
                  {altura === opcion.px && (
                    <div className="absolute top-2 right-2 w-5 h-5 bg-purple-500 rounded-full flex items-center justify-center">
                      <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Información contextual */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4 text-blue-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div className="text-sm text-blue-700">
                  <strong>Alturas en píxeles:</strong> Las secciones mantienen su tamaño exacto. Una sección de 800px será consistente entre el editor y el resultado final.
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Color de fondo</label>
                <input
                  type="color"
                  value={fondo}
                  onChange={(e) => setFondo(e.target.value)}
                  className="w-full border rounded px-3 py-2 h-12"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tipo (opcional)</label>
                <input
                  type="text"
                  value={tipo}
                  onChange={(e) => setTipo(e.target.value)}
                  placeholder="hero, galeria, etc"
                  className="w-full border rounded px-3 py-2"
                />
              </div>
            </div>
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
                      {renderTemplatePreview(p)}
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
                const backgroundModel = normalizeSectionBackgroundModel(plantillaSeleccionada, {
                  sectionHeight: plantillaSeleccionada.altura || 400,
                });
                onConfirm({
                  id: `sec-${Date.now()}`,
                  altura: plantillaSeleccionada.altura,
                  fondo: plantillaSeleccionada.fondo || "#ffffff",
                  fondoTipo: plantillaSeleccionada.fondoTipo || null,
                  fondoImagen: plantillaSeleccionada.fondoImagen || null,
                  fondoImagenOffsetX: Number.isFinite(
                    Number(plantillaSeleccionada.fondoImagenOffsetX)
                  )
                    ? Number(plantillaSeleccionada.fondoImagenOffsetX)
                    : 0,
                  fondoImagenOffsetY: Number.isFinite(
                    Number(plantillaSeleccionada.fondoImagenOffsetY)
                  )
                    ? Number(plantillaSeleccionada.fondoImagenOffsetY)
                    : 0,
                  tipo: plantillaSeleccionada.tipo || "custom",
                  altoModo: plantillaSeleccionada.altoModo || "fijo",
                  alturaFijoBackup: Number.isFinite(
                    Number(plantillaSeleccionada.alturaFijoBackup)
                  )
                    ? Number(plantillaSeleccionada.alturaFijoBackup)
                    : null,
                  decoracionesFondo: {
                    items: backgroundModel.decoraciones,
                  },
                  objetos: (plantillaSeleccionada.objetos || []).map(obj => ({
                    ...obj,
                    seccionId: `sec-${Date.now()}`
                  })),
                  desdePlantilla: true
                });
              } else {
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
