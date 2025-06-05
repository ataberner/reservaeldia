// src/components/SubirIcono.jsx
import { useState } from "react";
import { storage, db } from "@/firebase";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";

export default function SubirIcono() {
  const [archivo, setArchivo] = useState(null);
  const [categoria, setCategoria] = useState("");
  const [keywords, setKeywords] = useState("");
  const [popular, setPopular] = useState(false);
  const [subiendo, setSubiendo] = useState(false);
  const [mensaje, setMensaje] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!archivo) return alert("Seleccioná un archivo.");

    setSubiendo(true);
    setMensaje("");

    try {
      // Ruta en Storage
      const storageRef = ref(storage, `iconos/${archivo.name}`);
      await uploadBytes(storageRef, archivo);

      const url = await getDownloadURL(storageRef);

      // Guardamos en Firestore
      await addDoc(collection(db, "iconos"), {
        nombre: archivo.name,
        url,
        categoria: categoria.trim(),
        keywords: keywords.split(",").map(k => k.trim()).filter(k => k.length > 0),
        popular,
        creado: serverTimestamp(),
      });

      setMensaje("✅ Ícono subido correctamente.");
      setArchivo(null);
      setCategoria("");
      setKeywords("");
      setPopular(false);
    } catch (error) {
      console.error("❌ Error al subir:", error);
      setMensaje("❌ Hubo un error al subir el ícono.");
    }

    setSubiendo(false);
  };

  return (
    <form onSubmit={handleSubmit} className="bg-white p-6 rounded shadow space-y-4">
      <h2 className="text-lg font-bold">Subir nuevo ícono</h2>

      <input type="file" accept=".png,.svg" onChange={(e) => setArchivo(e.target.files[0])} />

      <input
        type="text"
        className="w-full border px-3 py-1 rounded"
        placeholder="Categoría"
        value={categoria}
        onChange={(e) => setCategoria(e.target.value)}
      />

      <input
        type="text"
        className="w-full border px-3 py-1 rounded"
        placeholder="Keywords (coma separadas)"
        value={keywords}
        onChange={(e) => setKeywords(e.target.value)}
      />

      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={popular}
          onChange={(e) => setPopular(e.target.checked)}
        />
        Popular
      </label>

      <button
        type="submit"
        disabled={subiendo}
        className="bg-purple-600 text-white px-4 py-2 rounded hover:bg-purple-700 disabled:opacity-50"
      >
        {subiendo ? "Subiendo..." : "Subir ícono"}
      </button>

      {mensaje && <p className="text-sm text-gray-700">{mensaje}</p>}
    </form>
  );
}
