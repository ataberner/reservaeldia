// src/pages/admin/iconos.jsx

import { useEffect, useState } from "react";
import { collection, getDocs, updateDoc } from "firebase/firestore";
import { db } from "@/firebase";
import { getAuth, onAuthStateChanged } from "firebase/auth";
import SubirIcono from "@/components/SubirIcono";

function getExtensionFromIcon(icono) {
  const raw = (icono?.nombre || icono?.url || "").toString();
  const clean = raw.split("?")[0].split("#")[0].toLowerCase();
  const ext = clean.split(".").pop();

  if (ext === "jpeg") return "jpg";
  return ext || "unknown";
}

export default function AdminIconos() {
  const [iconos, setIconos] = useState([]);
  const [verSoloPopulares, setVerSoloPopulares] = useState(false);
  const [filtroFormato, setFiltroFormato] = useState("todos"); // todos | svg | png | jpg | webp | ...

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
          const data = snap.docs.map((d) => {
            const base = {
              id: d.id,
              ref: d.ref,
              ...d.data(),
              categoriaTemp: d.data().categoria || "",
              keywordsTemp: (d.data().keywords || []).join(", "),
              popularTemp: d.data().popular || false,
              guardando: false,
              mensaje: null,
            };

            return {
              ...base,
              formato: getExtensionFromIcon(base),
            };
          });

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
    if (!icono?.ref) {
      setIconos((prev) =>
        prev.map((i) =>
          i.id === id ? { ...i, guardando: false, mensaje: "❌ No se encontró el documento" } : i
        )
      );
      return;
    }

    try {
      await updateDoc(icono.ref, {
        categoria: (icono.categoriaTemp || "").trim(),
        popular: !!icono.popularTemp,
        keywords: (icono.keywordsTemp || "")
          .split(",")
          .map((k) => k.trim())
          .filter((k) => k.length > 0),
      });

      setIconos((prev) =>
        prev.map((i) =>
          i.id === id ? { ...i, guardando: false, mensaje: "✅ Guardado correctamente" } : i
        )
      );
    } catch (e) {
      console.error(e);
      setIconos((prev) =>
        prev.map((i) =>
          i.id === id ? { ...i, guardando: false, mensaje: "❌ Error al guardar" } : i
        )
      );
    }
  };

  const iconosFiltrados = iconos
    .filter((icono) => (!verSoloPopulares ? true : !!icono.popularTemp))
    .filter((icono) => {
      if (filtroFormato === "todos") return true;
      const ext = (icono.formato || getExtensionFromIcon(icono)).toLowerCase();
      return ext === filtroFormato;
    });

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <SubirIcono />

      <h1 className="text-2xl font-bold mb-2">Configuración de íconos</h1>
      <p className="text-sm text-gray-600 mb-4">
        Total: {iconos.length} · Mostrando: {iconosFiltrados.length}
      </p>

      {/* ✅ Barra de filtros (arriba del grid) */}
      <div className="sticky top-0 z-10 bg-gray-50 py-3 mb-4 border-b">
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setVerSoloPopulares((v) => !v)}
            className="text-sm px-3 py-1 bg-purple-100 text-purple-800 rounded hover:bg-purple-200 transition"
          >
            {verSoloPopulares ? "Ver todos" : "Ver solo populares"}
          </button>

          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600">Formato:</span>
            <select
              value={filtroFormato}
              onChange={(e) => setFiltroFormato(e.target.value)}
              className="text-sm border px-3 py-1 rounded bg-white"
            >
              <option value="todos">Todos</option>
              <option value="svg">SVG</option>
              <option value="png">PNG</option>
              <option value="jpg">JPG</option>
              <option value="webp">WEBP</option>
              <option value="gif">GIF</option>
              <option value="unknown">Otros</option>
            </select>
          </div>
        </div>
      </div>

      {/* ✅ Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
        {iconosFiltrados.map((icono) => (
          <div key={icono.id} className="bg-white rounded shadow p-4 flex gap-4 items-start">
            <img
              src={icono.url}
              alt={`icono-${icono.id}`}
              className="w-20 h-20 object-contain bg-gray-100 rounded"
            />

            <div className="flex-1 text-sm space-y-2">
              <p className="text-gray-600">
                <strong>ID:</strong> {icono.id}
              </p>

              <p className="text-gray-600">
                <strong>Formato:</strong>{" "}
                {(icono.formato || getExtensionFromIcon(icono)).toUpperCase()}
              </p>

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
                  checked={!!icono.popularTemp}
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

              {/* Guardar */}
              <button
                className="bg-purple-600 text-white px-4 py-1 rounded hover:bg-purple-700 disabled:opacity-50"
                disabled={!!icono.guardando}
                onClick={() => guardarCambios(icono.id)}
              >
                {icono.guardando ? "Guardando..." : "Guardar cambios"}
              </button>

              {icono.mensaje && <p className="text-xs mt-1 text-gray-500">{icono.mensaje}</p>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
