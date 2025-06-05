import { useEffect, useState } from "react";
import { collection, getDocs, doc, updateDoc } from "firebase/firestore";
import { db } from "@/firebase";
import { getAuth, onAuthStateChanged } from "firebase/auth";
import SubirIcono from "@/components/SubirIcono";

export default function AdminIconos() {
  const [iconos, setIconos] = useState([]);
  const [verSoloPopulares, setVerSoloPopulares] = useState(false);


  
  useEffect(() => {
    const auth = getAuth();
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (!user) {
        console.log("🚫 Usuario no logueado");
        return;
      }

      console.log("✅ Usuario logueado con UID:", user.uid);

      const fetchIconos = async () => {
        try {
          const snap = await getDocs(collection(db, "iconos"));
          const data = snap.docs.map(doc => ({
            id: doc.id,
            ref: doc.ref,
            ...doc.data(),
            categoriaTemp: doc.data().categoria || "",
            keywordsTemp: (doc.data().keywords || []).join(", "),
            popularTemp: doc.data().popular || false,
            guardando: false,
            mensaje: null
          }));
          console.log("🧱 Datos procesados:", data);
          setIconos(data);
        } catch (error) {
          console.error("❌ Error al traer documentos:", error.message);
        }
      };


      fetchIconos();
    });

    return () => unsubscribe();
  }, []);

 const guardarCambios = async (id) => {
    setIconos((prev) =>
      prev.map((i) => (i.id === id ? { ...i, guardando: true, mensaje: null } : i))
    );

    const icono = iconos.find((i) => i.id === id);
    try {
      await updateDoc(icono.ref, {
        categoria: icono.categoriaTemp.trim(),
        popular: icono.popularTemp,
        keywords: icono.keywordsTemp
          .split(",")
          .map((k) => k.trim())
          .filter((k) => k.length > 0),
      });

      setIconos((prev) =>
        prev.map((i) =>
          i.id === id
            ? { ...i, guardando: false, mensaje: "✅ Guardado correctamente" }
            : i
        )
      );
    } catch (e) {
      setIconos((prev) =>
        prev.map((i) =>
          i.id === id ? { ...i, guardando: false, mensaje: "❌ Error al guardar" } : i
        )
      );
    }
  };

  return (

     <div className="p-6">
      <SubirIcono />
    
    



  <div className="min-h-screen bg-gray-50 p-6">
    <h1 className="text-2xl font-bold mb-2">Configuración de íconos</h1>
    <p className="text-sm text-gray-600 mb-6">Total: {iconos.length}</p>

    <button
  onClick={() => setVerSoloPopulares(!verSoloPopulares)}
  className="text-sm mb-4 px-3 py-1 bg-purple-100 text-purple-800 rounded hover:bg-purple-200 transition"
>
  {verSoloPopulares ? "Ver todos" : "Ver solo populares"}
</button>


    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
      {iconos
  .filter((icono) => !verSoloPopulares || icono.popularTemp)
  .map((icono) => (

        <div key={icono.id} className="bg-white rounded shadow p-4 flex gap-4 items-start">
  <img
    src={icono.url}
    alt={`icono-${icono.id}`}
    className="w-20 h-20 object-contain bg-gray-100 rounded"
  />

  <div className="flex-1 text-sm space-y-2">
    <p className="text-gray-600"><strong>ID:</strong> {icono.id}</p>

    {/* Categoría */}
    <div>
      <label className="font-semibold">Categoría:</label>
      <input
        type="text"
        className="border px-2 py-1 w-full rounded"
        value={icono.categoriaTemp}
        onChange={(e) =>
          setIconos((prev) =>
            prev.map((i) =>
              i.id === icono.id ? { ...i, categoriaTemp: e.target.value } : i
            )
          )
        }
      />
    </div>

    {/* Keywords */}
    <div>
      <label className="font-semibold">Keywords (separadas por coma):</label>
      <input
        type="text"
        className="border px-2 py-1 w-full rounded"
        value={icono.keywordsTemp}
        onChange={(e) =>
          setIconos((prev) =>
            prev.map((i) =>
              i.id === icono.id ? { ...i, keywordsTemp: e.target.value } : i
            )
          )
        }
      />
    </div>

    {/* Popular */}
    <label className="flex items-center gap-2">
      <input
        type="checkbox"
        checked={icono.popularTemp}
        onChange={(e) =>
          setIconos((prev) =>
            prev.map((i) =>
              i.id === icono.id ? { ...i, popularTemp: e.target.checked } : i
            )
          )
        }
      />
      Popular
    </label>

    {/* Botón de guardar */}
    <button
      className="bg-purple-600 text-white px-4 py-1 rounded hover:bg-purple-700 disabled:opacity-50"
      disabled={icono.guardando}
      onClick={() => guardarCambios(icono.id)}
    >
      {icono.guardando ? "Guardando..." : "Guardar cambios"}
    </button>

    {icono.mensaje && (
      <p className="text-xs mt-1 text-gray-500">{icono.mensaje}</p>
    )}
  </div>
</div>


      ))}
    </div>
    </div>
  </div>
);
}