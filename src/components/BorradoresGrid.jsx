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
  <div className="mt-12">
    <h2 className="text-xl font-bold mb-6 text-center">Tus borradores</h2>

    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6 gap-6 justify-center">
      {borradores.map((b) => (
        <div
          key={b.slug}
          className="bg-white border rounded-xl overflow-hidden shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all duration-300"
        >
          {/* Imagen cuadrada */}
          <div className="aspect-square bg-gray-100 overflow-hidden">
            <img
              src={b.thumbnailUrl || "/placeholder.jpg"}
              alt={`Vista previa de ${b.nombre || b.slug}`}
              className="w-full h-full object-cover object-top transition-transform duration-300 hover:scale-105"
            />
          </div>

          {/* Nombre y botones */}
          <div className="p-2 flex flex-col items-center text-center">
            <h3 className="text-xs sm:text-sm font-medium text-gray-700 truncate w-full">
              {b.nombre || b.slug}
            </h3>

            <div className="flex gap-2 mt-2">
              <button
                className="bg-purple-600 text-white text-xs px-3 py-1.5 rounded-full hover:bg-purple-700 transition"
                onClick={() => {
                  const detalle = {
                    slug: b.slug || b.id,
                    // Los borradores del dashboard deben abrir en el editor Konva por defecto.
                    editor: b.editor || "konva",
                  };
                  window.dispatchEvent(new CustomEvent("abrir-borrador", { detail: detalle }));
                }}
              >
                Editar
              </button>

              <button
                className="bg-red-100 text-red-600 text-xs px-3 py-1.5 rounded-full hover:bg-red-200 transition"
                onClick={() => borrarBorrador(b.slug)}
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
