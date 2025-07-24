import { useEffect, useState } from 'react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { db } from '@/firebase';

export default function BorradoresGrid() {
  const [borradores, setBorradores] = useState([]);
  const auth = getAuth();

  // 🔄 Cargar borradores desde Firestore
  useEffect(() => {
    const fetchBorradores = async () => {
      const user = auth.currentUser;
      if (!user) return;

      const q = query(
        collection(db, 'borradores'),
        where('userId', '==', user.uid)
      );

      const snapshot = await getDocs(q);
      const docs = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      setBorradores(docs);
    };

    fetchBorradores();
  }, []);

  // 🗑️ Borrar borrador desde función Cloud
  const borrarBorrador = async (slug) => {
    const confirmado = window.confirm(`¿Seguro que querés borrar "${slug}"?`);
    if (!confirmado) return;

    try {
      const functions = getFunctions();
      const borrar = httpsCallable(functions, 'borrarBorrador');
      await borrar({ slug });

      setBorradores((prev) => prev.filter((b) => b.slug !== slug));
      alert('✅ Borrador eliminado correctamente');
    } catch (error) {
      console.error("❌ Error al borrar borrador:", error);
      alert("No se pudo borrar el borrador.");
    }
  };

  if (!borradores.length) return <p className="text-gray-500">Aún no tenés borradores.</p>;

  return (
  <div className="mt-8">
    <h2 className="text-xl font-bold mb-4">Tus borradores</h2>

    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-5">
      {borradores.map((borrador) => (
        <div
          key={borrador.slug}
          className="bg-white border rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-all duration-200 max-w-sm mx-auto"
        >
          <div className="w-full h-52 bg-gray-100 overflow-hidden">
            <img
              src={borrador.thumbnailUrl || "/placeholder.jpg"}
              alt={`Vista previa de ${borrador.nombre}`}
              className="w-full h-full object-cover object-top"
            />
          </div>



          <div className="p-4">
            <h3 className="text-md font-semibold text-gray-800 truncate">{borrador.nombre || borrador.slug}</h3>
            <p className="text-xs text-gray-500 mt-1">
              Última edición:{" "}
              {borrador.ultimaEdicion?.seconds
                ? new Date(borrador.ultimaEdicion.seconds * 1000).toLocaleDateString()
                : "Sin fecha"}
            </p>

            <div className="flex gap-2 mt-4">
              <button
                className="bg-purple-600 text-white text-xs px-3 py-1 rounded hover:bg-purple-700 transition"
                onClick={() => {
                  const detalle = {
                    slug: borrador.slug || borrador.id,
                    editor: borrador.editor || "iframe",
                  };
                  window.dispatchEvent(new CustomEvent("abrir-borrador", { detail: detalle }));
                }}
              >
                Editar
              </button>

              <button
                className="bg-red-100 text-red-600 text-xs px-3 py-1 rounded hover:bg-red-200 transition"
                onClick={() => borrarBorrador(borrador.slug)}
              >
                Borrar
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  </div>
);

}
