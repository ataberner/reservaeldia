import { useEffect, useState, useRef } from 'react';
import { collection, query, where, doc, getDoc, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { getAuth, onAuthStateChanged } from 'firebase/auth';
import { useRouter } from "next/router";
import DashboardLayout from '../components/DashboardLayout';
import TipoSelector from '../components/TipoSelector';
import PlantillaGrid from '../components/PlantillaGrid';
import BorradoresGrid from '@/components/BorradoresGrid';
import ModalVistaPrevia from '@/components/ModalVistaPrevia';
import PublicadasGrid from "@/components/PublicadasGrid";
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
  const [menuAbierto, setMenuAbierto] = useState(false);
  const menuRef = useRef(null);
  const [vista, setVista] = useState("home");
  const router = useRouter();
  const [esAdmin, setEsAdmin] = useState(false);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuAbierto(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);


  // 🔗 Sincronizar ?slug=... con el estado (siempre usar Konva)
  useEffect(() => {
    if (!router.isReady) return;

    const { slug } = router.query;
    const slugURL = typeof slug === "string" ? slug : null;

    if (slugURL) {
      setSlugInvitacion(slugURL);
      setModoEditor("konva"); // Siempre Konva
      setVista("editor");
    } else {
      // Si no hay slug y no estás editando nada, volvemos a "home"
      if (!slugInvitacion) {
        setVista("home");
      }
    }
  }, [router.isReady, router.query, slugInvitacion]);


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

      // 👇 DEBUG: ver qué props tiene cada countdown
      try {
        const cds = (objetosBase || []).filter(o => o?.tipo === "countdown");
      } catch (e) {
      }

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
      setVista("editor");
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
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setUsuario(user);

        // ✅ DEBUG TEMPORAL: ver claims del usuario logueado
        try {
          const token = await user.getIdTokenResult(true); // fuerza refresh
          setEsAdmin(token.claims?.admin === true);
          } catch (e) {
          console.log("❌ Error leyendo claims:", e);
        }
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
    <DashboardLayout
      mostrarMiniToolbar={!!slugInvitacion}
      seccionActivaId={seccionActivaId}
      modoSelector={!slugInvitacion && vista === "home"}
      slugInvitacion={slugInvitacion}
      setSlugInvitacion={setSlugInvitacion}
      setModoEditor={setModoEditor}
      zoom={zoom}
      toggleZoom={toggleZoom}
      historialExternos={historialExternos}
      futurosExternos={futurosExternos}
      generarVistaPrevia={generarVistaPrevia}
      usuario={usuario}
      vista={vista}
      onCambiarVista={setVista}
      ocultarSidebar={vista === "publicadas"}
    >
   

      {/* 🔹 Vista HOME (selector, plantillas, borradores) */}
      {!slugInvitacion && vista === "home" && (
        <div className="w-full px-4 pb-8">
          <TipoSelector onSeleccionarTipo={setTipoSeleccionado} />
          {tipoSeleccionado && (
            <>
              {loading ? (
                <p className="text-gray-500">Cargando plantillas...</p>
              ) : (
                <PlantillaGrid
                  plantillas={plantillas}
                  onPlantillaBorrada={(plantillaId) => {
                    setPlantillas((prev) => prev.filter((p) => p.id !== plantillaId));
                  }}
                  onSeleccionarPlantilla={async (slug, plantilla) => {
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
                      setVista("editor");
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
        </div>
      )}

      {/* 🔹 Vista PUBLICADAS */}
      {!slugInvitacion && vista === "publicadas" && (
        <div className="w-full px-4 pb-8">
          <PublicadasGrid usuario={usuario} />
        </div>
      )}



      {/* Editor de invitación */}
      {slugInvitacion && (
        <>
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
                    ? { transform: `scale(0.8)`, transformOrigin: "top center", width: "800px" }
                    : { width: "100%" }),
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
