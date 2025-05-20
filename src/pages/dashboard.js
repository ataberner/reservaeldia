import { useEffect, useState } from 'react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../firebase';

import DashboardLayout from '../components/DashboardLayout';
import TipoSelector from '../components/TipoSelector';
import PlantillaGrid from '../components/PlantillaGrid';
import BorradoresGrid from '@/components/BorradoresGrid';

export default function Dashboard() {
  const [tipoSeleccionado, setTipoSeleccionado] = useState(null);
  const [slugInvitacion, setSlugInvitacion] = useState(null);
  const [plantillas, setPlantillas] = useState([]);
  const [loading, setLoading] = useState(false);
  const [urlIframe, setUrlIframe] = useState(null);


  // 🔄 Cargar plantillas por tipo
  useEffect(() => {
    const fetchPlantillas = async () => {
      if (!tipoSeleccionado) return;

      setLoading(true);
      try {
        const q = query(
          collection(db, 'plantillas'),
          where('tipo', '==', tipoSeleccionado)
        );
        console.log("Intentando cargar plantillas...");
        const snapshot = await getDocs(q);
        const datos = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
        }));
        setPlantillas(datos);
      } catch (err) {
        console.error('Error al cargar plantillas:', err);
        setPlantillas([]);
      } finally {
        setLoading(false);
      }
    };

    fetchPlantillas();
  }, [tipoSeleccionado]);

    // 👂 Escuchar evento personalizado para abrir un borrador
  useEffect(() => {
    const handleAbrirBorrador = (e) => {
      const { slug } = e.detail;
      const url = `https://us-central1-reservaeldia-7a440.cloudfunctions.net/verInvitacion?slug=${slug}`;
      setSlugInvitacion(slug);
      setUrlIframe(url);
    };

    window.addEventListener("abrir-borrador", handleAbrirBorrador);
    return () => {
      window.removeEventListener("abrir-borrador", handleAbrirBorrador);
    };
  }, []);
  
  return (
     <DashboardLayout>
      {!slugInvitacion && (
        <>
          <TipoSelector onSeleccionarTipo={setTipoSeleccionado} />
          {tipoSeleccionado && (
            <>
              {loading ? (
                <p className="text-gray-500">Cargando plantillas...</p>
              ) : (
               <PlantillaGrid
  plantillas={plantillas}
  onSeleccionarPlantilla={(slug) => {
    const url = `https://us-central1-reservaeldia-7a440.cloudfunctions.net/verInvitacion?slug=${slug}`;
    setUrlIframe(url);         // ✅ Esta es la nueva URL para el iframe
    setSlugInvitacion(slug);   // (si querés usar slug más adelante)
  }}
/>

              )}
            </>
          )}
          <BorradoresGrid />
        </>
      )}

          {slugInvitacion && (
              <>
                <button
                  onClick={() => setSlugInvitacion(null)}
                  className="mb-4 px-4 py-2 bg-gray-300 rounded hover:bg-gray-400"
                >
                  ← Volver al selector
                </button>

                <div style={{ border: '1px solid #ccc', borderRadius: '16px', overflow: 'hidden' }}>
                  {urlIframe && (
                    <>
                      
                      <iframe
                        src={urlIframe}
                        width="100%"
                        height="1000"
                        style={{ border: 'none', borderRadius: '16px' }}
                      />
                    </>
                  )}
                </div>
              </>
          )}

    </DashboardLayout>
  );
}
