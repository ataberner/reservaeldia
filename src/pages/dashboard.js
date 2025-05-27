import { useEffect, useState } from 'react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { getAuth, onAuthStateChanged } from 'firebase/auth';
import DashboardLayout from '../components/DashboardLayout';
import TipoSelector from '../components/TipoSelector';
import PlantillaGrid from '../components/PlantillaGrid';
import BorradoresGrid from '@/components/BorradoresGrid';
import { getFunctions, httpsCallable } from "firebase/functions";
import dynamic from "next/dynamic";
const CanvasEditor = dynamic(() => import("@/components/CanvasEditor"), {
  ssr: false, // 💡 desactiva server-side rendering
});


export default function Dashboard() {
  const [tipoSeleccionado, setTipoSeleccionado] = useState(null);
  const [slugInvitacion, setSlugInvitacion] = useState(null);
  const [plantillas, setPlantillas] = useState([]);
  const [loading, setLoading] = useState(false);
  const [urlIframe, setUrlIframe] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [usuario, setUsuario] = useState(null);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [modoEditor, setModoEditor] = useState(null);


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
  const { slug, editor } = e.detail;

  setSlugInvitacion(slug);

  if (editor === "konva") {
    setModoEditor("konva");
  } else {
    const url = `https://us-central1-reservaeldia-7a440.cloudfunctions.net/verInvitacion?slug=${slug}`;
    setUrlIframe(url);
    setModoEditor("iframe");
  }
};


    window.addEventListener("abrir-borrador", handleAbrirBorrador);
    return () => {
      window.removeEventListener("abrir-borrador", handleAbrirBorrador);
    };

    
  }, []);
  useEffect(() => {
  const auth = getAuth();
  const unsubscribe = onAuthStateChanged(auth, (user) => {
    if (user) {
      setUsuario(user);
    } else {
      // Si querés redirigir al index si no está logueado:
      window.location.href = "/";
    }
    setCheckingAuth(false);
  });

  return () => unsubscribe();
}, []);
  
if (checkingAuth) return <p>Cargando...</p>;
if (!usuario) return null; // Seguridad por si no se redirige

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
  onSeleccionarPlantilla={async (slug, plantilla) => {
    const confirmar = confirm(`¿Querés usar la plantilla: ${plantilla.nombre}?`);
    if (!confirmar) return;

    try {
      const functions = getFunctions();
      const copiarPlantilla = httpsCallable(functions, "copiarPlantilla");

       const res = await copiarPlantilla({ plantillaId: plantilla.id, slug });

      if (plantilla.editor === "konva") {
        setModoEditor("konva");
        setSlugInvitacion(slug);
      } else {
        const url = `https://us-central1-reservaeldia-7a440.cloudfunctions.net/verInvitacion?slug=${slug}`;
        setModoEditor("iframe");
        setSlugInvitacion(slug);
        setUrlIframe(url);
      }
    } catch (error) {
      alert("❌ Error al copiar la plantilla");
      console.error(error);
    }
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
    {/* Barra superior de acciones */}
    <div className="flex justify-between items-center flex-wrap gap-3 mb-6 bg-white p-4 rounded shadow-sm border border-gray-200">
      {/* Botón volver */}
      <button
        onClick={() => {
          setSlugInvitacion(null);
          setModoEditor(null);
        }}
        className="flex items-center gap-2 px-3 py-1.5 text-sm bg-gray-100 text-gray-800 rounded hover:bg-gray-200 transition"
      >
        ← Volver al menú
      </button>

      {/* Zoom */}
      <div className="relative group">
        <button
          onClick={toggleZoom}
          className="flex items-center gap-2 px-3 py-1.5 text-sm bg-white text-gray-800 border border-gray-300 rounded-full shadow hover:bg-gray-100 transition"
        >
          <span className="text-base">{zoom === 1 ? "➖" : "➕"}</span>
          <span className="text-sm font-medium">{zoom === 1 ? "100%" : "50%"}</span>
        </button>
        <div className="absolute top-full mt-1 left-1/2 -translate-x-1/2 bg-black text-white text-xs rounded px-2 py-1 opacity-0 group-hover:opacity-100 transition whitespace-nowrap z-10">
          {zoom === 1 ? "Alejar al 50%" : "Acercar al 100%"}
        </div>
      </div>

      {/* Generar invitación */}
      <button
        onClick={async () => {
          const confirmar = confirm("¿Querés publicar esta invitación?");
          if (!confirmar) return;

          const functions = await import("firebase/functions").then((mod) =>
            mod.getFunctions()
          );
          const publicarInvitacion = await import("firebase/functions").then((mod) =>
            mod.httpsCallable(functions, "publicarInvitacion")
          );

          try {
            const result = await publicarInvitacion({ slug: slugInvitacion });
            const urlFinal = result.data?.url;
            if (urlFinal) window.open(urlFinal, "_blank");
          } catch (error) {
            alert("❌ Error al publicar la invitación.");
            console.error(error);
          }
        }}
        className="px-4 py-2 bg-[#773dbe] text-white rounded hover:bg-purple-700 transition text-sm"
      >
        Generar invitación
      </button>
    </div>

    {/* Editor */}
    {modoEditor === "konva" && (
      <CanvasEditor slug={slugInvitacion} />
    )}

    {modoEditor === "iframe" && (
      <div
        className="flex justify-center items-start"
        style={{
          backgroundColor: zoom < 1 ? "#e5e5e5" : "transparent",
          padding: zoom < 1 ? "60px 0" : "0",
          overflow: "auto",
          borderRadius: "16px",
        }}
      >
        <div
          style={{
            ...(zoom < 1
              ? {
                  transform: `scale(0.8)`,
                  transformOrigin: "top center",
                  width: "800px",
                }
              : {
                  width: "100%",
                }),
          }}
        >
          <iframe
            src={urlIframe}
            width="100%"
            height="1000"
            style={{
              border: "none",
              borderRadius: "16px",
              pointerEvents: "auto",
              display: "block",
            }}
          />
        </div>
      </div>
    )}
  </>
)}



    </DashboardLayout>
  );
}
