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

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {borradores.map((borrador) => (
          <div
            key={borrador.slug}
            className="border rounded-lg overflow-hidden shadow hover:shadow-lg transition bg-white"
          >
            <img
              src="/assets/img/placeholder-600x400-3.jpg"
              alt="Vista previa"
              className="w-full h-48 object-cover"
            />

            <div className="p-4">
              <h3 className="text-lg font-semibold truncate">{borrador.slug}</h3>
              <p className="text-sm text-gray-600">
                Última edición:{' '}
                {borrador.ultimaEdicion?.seconds
                  ? new Date(borrador.ultimaEdicion.seconds * 1000).toLocaleDateString()
                  : 'Sin fecha'}
              </p>

              <div className="flex gap-3 mt-4 text-sm">
                <a
                  href={`/borradores/${borrador.slug}/index.html`}
                  target="_blank"
                  className="text-blue-600 hover:underline"
                >
                  Ver
                </a>

                <button
                    className="text-green-600 hover:underline text-sm"
                    onClick={() =>
                        window.dispatchEvent(new CustomEvent('abrir-borrador', { detail: borrador }))
                    }
                    >
                    Editar
                    </button>
                    
                <button
                  className="text-red-600 hover:underline"
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
