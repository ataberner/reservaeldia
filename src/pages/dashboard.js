import { useEffect, useState } from 'react';
import { collection, query, where, doc, getDoc, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { getAuth, onAuthStateChanged } from 'firebase/auth';
import DashboardLayout from '../components/DashboardLayout';
import TipoSelector from '../components/TipoSelector';
import PlantillaGrid from '../components/PlantillaGrid';
import BorradoresGrid from '@/components/BorradoresGrid';
import ModalVistaPrevia from '@/components/ModalVistaPrevia'; 

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
  const [zoom, setZoom] = useState(0.8);
  const [secciones, setSecciones] = useState([]);
  const [seccionActivaId, setSeccionActivaId] = useState(null);
  const [usuario, setUsuario] = useState(null);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [modoEditor, setModoEditor] = useState(null);
  const [historialExternos, setHistorialExternos] = useState([]);
  const [futurosExternos, setFuturosExternos] = useState([]);
  const [mostrarVistaPrevia, setMostrarVistaPrevia] = useState(false);
const [htmlVistaPrevia, setHtmlVistaPrevia] = useState(null);

  


const toggleZoom = () => {
  setZoom((prev) => (prev === 1 ? 0.8 : 1));
    };

const generarVistaPrevia = async () => {
  try {
    setHtmlVistaPrevia(null); // Reset del contenido
    setMostrarVistaPrevia(true); // Abrir modal primero
    
    // Generar HTML para vista previa
    const ref = doc(db, "borradores", slugInvitacion);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      alert("❌ No se encontró el borrador");
      setMostrarVistaPrevia(false);
      return;
    }

    const data = snap.data();
    const objetosBase = data?.objetos || [];
    const secciones = data?.secciones || [];

    // Importar función de generación HTML
    const { generarHTMLDesdeSecciones } = await import("../../functions/src/utils/generarHTMLDesdeSecciones");
    const htmlGenerado = generarHTMLDesdeSecciones(secciones, objetosBase);
    
    setHtmlVistaPrevia(htmlGenerado);
  } catch (error) {
    console.error("❌ Error generando vista previa:", error);
    alert("No se pudo generar la vista previa");
    setMostrarVistaPrevia(false);
  }
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


  // cuando hay cambios en secciones
useEffect(() => {
  if (!seccionActivaId && secciones.length > 0) {
    setSeccionActivaId(secciones[0].id);
  }
}, [secciones]);


  useEffect(() => {
  const auth = getAuth();
  const unsubscribe = onAuthStateChanged(auth, (user) => {
    if (user) {
      setUsuario(user);
    } else {
      setUsuario(null);
    }
    setCheckingAuth(false);
  });

  return () => unsubscribe();
}, []);
  
if (checkingAuth) return <p>Cargando...</p>;
if (!usuario) return null; // Seguridad por si no se redirige

  return (
     <DashboardLayout mostrarMiniToolbar={!!slugInvitacion} seccionActivaId={seccionActivaId}>

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
<div className="fixed top-0 left-0 right-0 z-40 mb-6 flex items-center flex-wrap gap-3 bg-white p-3 shadow-lg border-b border-gray-200">
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
     <div className="flex gap-2 items-center">
  {/* Botón Deshacer */}
  <div className="relative group">
    <div className="inline-block">
    <button
  onClick={() => {
    console.log("🔘 Botón deshacer clickeado");
    
    // Método 1: Llamar función directa (preferido)
    if (window.canvasEditor?.deshacer) {
      window.canvasEditor.deshacer();
    } else {
      // Método 2: Fallback con evento
      console.log("⚠️ Usando fallback de evento");
      const e = new KeyboardEvent('keydown', {
        key: 'z',
        ctrlKey: true,
        bubbles: true
      });
      document.dispatchEvent(e);
    }
  }}
  disabled={historialExternos.length <= 1}
  className={`px-3 py-2 rounded-full transition-all duration-200 flex items-center gap-1 ${
    historialExternos.length <= 1
      ? "bg-gray-200 text-gray-400 cursor-not-allowed"
      : "bg-white hover:bg-gray-100 text-purple-700 shadow hover:shadow-md"
  }`}
>
  <span>⟲</span>
  {historialExternos.length > 1 && (
    <span className="text-xs bg-purple-100 text-purple-600 px-1 rounded-full min-w-[16px] text-center">
      {historialExternos.length - 1}
    </span>
  )}
</button>
</div>

    {/* Tooltip mejorado */}
    <div className="absolute top-full mt-2 left-1/2 -translate-x-1/2 bg-black text-white text-xs rounded px-2 py-1 opacity-0 group-hover:opacity-100 transition pointer-events-none">
      Deshacer ({historialExternos.length - 1} disponibles)<br />
      <span className="text-gray-300">Ctrl + Z</span>
    </div>
  </div>

  {/* Botón Rehacer */}
  <div className="relative group">
   <button
  onClick={() => {
    console.log("🔘 Botón rehacer clickeado");
    
    // Método 1: Llamar función directa (preferido)
    if (window.canvasEditor?.rehacer) {
      window.canvasEditor.rehacer();
    } else {
      // Método 2: Fallback con evento
      console.log("⚠️ Usando fallback de evento");
      const e = new KeyboardEvent('keydown', {
        key: 'y',
        ctrlKey: true,
        bubbles: true
      });
      document.dispatchEvent(e);
    }
  }}
  disabled={futurosExternos.length === 0}
  className={`px-3 py-2 rounded-full transition-all duration-200 flex items-center gap-1 ${
    futurosExternos.length === 0
      ? "bg-gray-200 text-gray-400 cursor-not-allowed"
      : "bg-white hover:bg-gray-100 text-purple-700 shadow hover:shadow-md"
  }`}
>
  <span>⟳</span>
  {futurosExternos.length > 0 && (
    <span className="text-xs bg-green-100 text-green-600 px-1 rounded-full min-w-[16px] text-center">
      {futurosExternos.length}
    </span>
  )}
</button>

    {/* Tooltip mejorado */}
    <div className="absolute top-full mt-2 left-1/2 -translate-x-1/2 bg-black text-white text-xs rounded px-2 py-1 opacity-0 group-hover:opacity-100 transition pointer-events-none">
      Rehacer ({futurosExternos.length} disponibles)<br />
      <span className="text-gray-300">Ctrl + Y</span>
    </div>
  </div>
</div>


{/* Guardar como plantilla */}
<button
  onClick={async () => {
    const nombre = prompt("¿Qué nombre querés darle a la nueva plantilla?");
    if (!nombre) return;

    try {
      const ref = doc(db, "borradores", slugInvitacion);
      const snap = await getDoc(ref);
      if (!snap.exists()) throw new Error("No se encontró el borrador");

      const data = snap.data();

      const id = nombre.toLowerCase().replace(/\s+/g, "-") + "-" + Date.now();

      const functions = getFunctions();
      const crearPlantilla = httpsCallable(functions, "crearPlantilla");

      await crearPlantilla({
        id,
        datos: {
          nombre,
          tipo: "boda",
          portada: "https://reservaeldia.com.ar/img/previews/boda-parallax.jpg",
          editor: "konva",
          objetos: data.objetos,
        },
      });

      alert("✅ La plantilla se guardó correctamente.");
    } catch (error) {
      console.error("❌ Error al guardar plantilla:", error);
      alert("Ocurrió un error al guardar la plantilla.");
    }
  }}
  className="px-4 py-2 bg-purple-100 text-purple-800 rounded hover:bg-purple-200 transition text-sm"
>
  Guardar como plantilla
</button>



     {/* Vista previa y Generar invitación */}
<div className="flex gap-3 ml-auto">
  <button
    onClick={generarVistaPrevia}
    className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition text-sm flex items-center gap-2"
  >
    Vista previa
  </button>

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
</div>

    {/* Editor */}
    {modoEditor === "konva" && (
      <CanvasEditor 
        slug={slugInvitacion} 
        zoom={zoom} 
        onHistorialChange={setHistorialExternos} 
        onFuturosChange={setFuturosExternos}
        userId={usuario?.uid}
        secciones={[]}
      />
    )}

    {modoEditor === "iframe" && (
      <div
        className="flex justify-center items-start"
        style={{
          backgroundColor: zoom < 1 ? "#e5e5e5" : "transparent",
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



{/* Modal de vista previa */}
<ModalVistaPrevia
  visible={mostrarVistaPrevia}
  onClose={() => {
    setMostrarVistaPrevia(false);
    setHtmlVistaPrevia(null);
  }}
  htmlContent={htmlVistaPrevia}
  slug={slugInvitacion}
/>


    </DashboardLayout>
  );
}
