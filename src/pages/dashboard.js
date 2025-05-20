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
  const [zoom, setZoom] = useState(1);

const toggleZoom = () => {
  setZoom((prev) => (prev === 1 ? 0.5 : 1));
};



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
   <div className="flex items-center gap-3 mb-6">
  {/* Botón volver */}
  <button
    onClick={() => setSlugInvitacion(null)}
    className="flex items-center gap-2 px-3 py-1.5 text-sm bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300 transition"
  >
    ← Volver al menú
  </button>

  {/* Botón de zoom */}
  <div className="relative group">
    <button
      onClick={toggleZoom}
      className="flex items-center gap-2 px-3 py-1.5 text-sm bg-white text-gray-800 border border-gray-300 rounded-full shadow hover:bg-gray-100 transition"
    >
      <span className="text-base">{zoom === 1 ? '➖' : '➕'}</span>
      <span className="text-sm font-medium">{zoom === 1 ? '100%' : '50%'}</span>
    </button>
    {/* Tooltip */}
    <div className="absolute top-full mt-1 left-1/2 -translate-x-1/2 bg-black text-white text-xs rounded px-2 py-1 opacity-0 group-hover:opacity-100 transition whitespace-nowrap z-10">
      {zoom === 1 ? 'Alejar al 50%' : 'Acercar al 100%'}
    </div>
  </div>
</div>


    {/* Contenedor con zoom */}
    <div
  className="flex justify-center items-start"
  style={{
    backgroundColor: zoom < 1 ? '#e5e5e5' : 'transparent',
    padding: zoom < 1 ? '60px 0' : '0',
    overflow: 'auto',
    borderRadius: '16px',
  }}
>
  <div
    style={{
      ...(zoom < 1
        ? {
            transform: `scale(0.8)`,
            transformOrigin: 'top center',
            width: '800px',
          }
        : {
            width: '100%',
          }),
    }}
  >
    <iframe
      src={urlIframe}
      width="100%"
      height="1000"
      style={{
        border: 'none',
        borderRadius: '16px',
        pointerEvents: 'auto',
        display: 'block',
      }}
    />
  </div>
</div>

  </>
)}


    </DashboardLayout>
  );
}
