import { useEffect, useState, useRef } from 'react';
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
  const [menuAbierto, setMenuAbierto] = useState(false);
  const menuRef = useRef(null);


  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuAbierto(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);


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
    <DashboardLayout
      mostrarMiniToolbar={!!slugInvitacion}
      seccionActivaId={seccionActivaId}
      modoSelector={!slugInvitacion}
    >

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

      {/* 🔹 Barra superior fija y fina */}
      <div className="fixed top-0 left-0 right-0 z-40 flex items-center justify-between bg-white px-4 py-2 shadow-sm border-b border-gray-200">

        {slugInvitacion ? (
          /* ----------------- 🟣 Modo edición ----------------- */
          <div className="flex items-center gap-2 flex-1">
            {/* Botón volver */}
            <button
              onClick={() => {
                setSlugInvitacion(null);
                setModoEditor(null);
              }}
              className="flex items-center gap-2 px-2 py-1 text-sm bg-gray-100 text-gray-800 rounded hover:bg-gray-200 transition"
            >
              ← Volver
            </button>

            {/* Zoom */}
            <div className="relative group">
              <button
                onClick={toggleZoom}
                className="flex items-center gap-1 px-2 py-1 text-xs bg-white text-gray-800 border border-gray-300 rounded shadow hover:bg-gray-100 transition"
              >
                <span>{zoom === 1 ? "➖" : "➕"}</span>
                <span>{zoom === 1 ? "100%" : "50%"}</span>
              </button>
              <div className="absolute top-full mt-1 left-1/2 -translate-x-1/2 bg-black text-white text-[10px] rounded px-1 py-0.5 opacity-0 group-hover:opacity-100 transition whitespace-nowrap z-10">
                {zoom === 1 ? "Alejar 50%" : "Acercar 100%"}
              </div>
            </div>

            {/* 🔹 Botón Deshacer */}
            <div className="relative group">
              <button
                onClick={() => {
                  if (window.canvasEditor?.deshacer) {
                    window.canvasEditor.deshacer();
                  } else {
                    const e = new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true });
                    document.dispatchEvent(e);
                  }
                }}
                disabled={historialExternos.length <= 1}
                className={`px-2 py-1 rounded-full text-xs transition-all duration-200 flex items-center gap-1 ${historialExternos.length <= 1
                  ? "bg-gray-200 text-gray-400 cursor-not-allowed"
                  : "bg-white hover:bg-gray-100 text-purple-700 shadow hover:shadow-md"
                  }`}
              >
                ⟲
                {historialExternos.length > 1 && (
                  <span className="text-[10px] bg-purple-100 text-purple-600 px-1 rounded-full min-w-[14px] text-center">
                    {historialExternos.length - 1}
                  </span>
                )}
              </button>
              {/* Tooltip */}
              <div className="absolute top-full mt-1 left-1/2 -translate-x-1/2 bg-black text-white text-[10px] rounded px-1 py-0.5 opacity-0 group-hover:opacity-100 transition pointer-events-none">
                Deshacer ({Math.max(historialExternos.length - 1, 0)})
                <br /><span className="text-gray-300">Ctrl+Z</span>
              </div>
            </div>

            {/* 🔹 Botón Rehacer */}
            <div className="relative group">
              <button
                onClick={() => {
                  if (window.canvasEditor?.rehacer) {
                    window.canvasEditor.rehacer();
                  } else {
                    const e = new KeyboardEvent('keydown', { key: 'y', ctrlKey: true, bubbles: true });
                    document.dispatchEvent(e);
                  }
                }}
                disabled={futurosExternos.length === 0}
                className={`px-2 py-1 rounded-full text-xs transition-all duration-200 flex items-center gap-1 ${futurosExternos.length === 0
                  ? "bg-gray-200 text-gray-400 cursor-not-allowed"
                  : "bg-white hover:bg-gray-100 text-purple-700 shadow hover:shadow-md"
                  }`}
              >
                ⟳
                {futurosExternos.length > 0 && (
                  <span className="text-[10px] bg-green-100 text-green-600 px-1 rounded-full min-w-[14px] text-center">
                    {futurosExternos.length}
                  </span>
                )}
              </button>
              {/* Tooltip */}
              <div className="absolute top-full mt-1 left-1/2 -translate-x-1/2 bg-black text-white text-[10px] rounded px-1 py-0.5 opacity-0 group-hover:opacity-100 transition pointer-events-none">
                Rehacer ({futurosExternos.length})
                <br /><span className="text-gray-300">Ctrl+Y</span>
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
                  if (!snap.exists) throw new Error("No se encontró el borrador");

                  const data = snap.data();
                  const id = nombre.toLowerCase().replace(/\s+/g, "-") + "-" + Date.now();

                  // ✅ Capturar imagen del canvas
                  const stage = window.canvasEditor?.stageRef;
                  if (!stage) {
                    alert("❌ El editor no está listo todavía.");
                    return;
                  }

                  const dataURL = stage.toDataURL({ pixelRatio: 2 });
                  const res = await fetch(dataURL);
                  const blob = await res.blob();

                  // ✅ Subir imagen a Firebase Storage
                  const storage = (await import("firebase/storage")).getStorage();
                  const storageRef = (await import("firebase/storage")).ref(
                    storage,
                    `previews/plantillas/${id}.png`
                  );
                  await (await import("firebase/storage")).uploadBytes(storageRef, blob);

                  const portada = await (await import("firebase/storage")).getDownloadURL(storageRef);

                  // ✅ Crear plantilla en Firestore
                  const functions = getFunctions();
                  const crearPlantilla = httpsCallable(functions, "crearPlantilla");

                  await crearPlantilla({
                    id,
                    datos: {
                      nombre,
                      tipo: "boda",
                      portada,
                      editor: "konva",
                      objetos: data.objetos,
                      secciones: data.secciones,
                    },
                  });

                  alert("✅ La plantilla se guardó correctamente.");
                } catch (error) {
                  console.error("❌ Error al guardar plantilla:", error);
                  alert("Ocurrió un error al guardar la plantilla.");
                }
              }}
              className="px-3 py-1 bg-yellow-400 text-gray-800 rounded hover:bg-yellow-500 transition text-xs"
            >
              Guardar plantilla
            </button>



            {/* Botones Vista previa / Generar invitación */}
            <div className="flex gap-2 ml-auto">
              <button
                onClick={generarVistaPrevia}
                className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 transition text-xs flex items-center gap-1"
              >
                Vista previa
              </button>

              <button
                onClick={async () => {
                  const confirmar = confirm("¿Querés publicar esta invitación?");
                  if (!confirmar) return;

                  const functions = await import("firebase/functions").then((mod) => mod.getFunctions());
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
                className="px-3 py-1 bg-[#773dbe] text-white rounded hover:bg-purple-700 transition text-xs"
              >
                Generar
              </button>
            </div>
          </div>
        ) : (
          /* ----------------- 🟢 Vista dashboard ----------------- */
          <div className="flex items-center gap-2 flex-1">
            <img src="/assets/img/logo.png" alt="Logo" className="h-5" />
            <span className="text-xs font-semibold text-gray-700 hidden sm:block">DASHBOARD</span>
          </div>
        )}

        {/* 🔹 Menú usuario siempre visible */}
        <div className="relative ml-2" ref={menuRef}>
          <div
            className="flex items-center gap-1 cursor-pointer rounded-full px-1 py-1 transition-all duration-200 hover:bg-gray-100"
            onClick={() => setMenuAbierto(!menuAbierto)}
          >
            {usuario?.photoURL ? (
              <img
                src={usuario.photoURL}
                alt="Foto de perfil"
                className="w-7 h-7 rounded-full object-cover transition-transform duration-200 hover:scale-105"
                title={usuario.displayName || usuario.email || 'Usuario'}
              />
            ) : (
              <div
                className="w-7 h-7 flex items-center justify-center rounded-full text-white text-xs font-semibold transition-transform duration-200 hover:scale-105"
                style={{ backgroundColor: "#773dbe" }}
                title={usuario?.displayName || usuario?.email || 'Usuario'}
              >
                {usuario?.email?.[0]?.toUpperCase() || "U"}
              </div>
            )}
            <span className="text-gray-600 text-xs">▼</span>
          </div>

          {menuAbierto && (
            <div className="absolute right-0 mt-1 w-36 bg-white border rounded shadow-md py-1 z-50 origin-top-right animate-fade-slide text-xs">
              <button
                onClick={async () => {
                  const { getAuth, signOut } = await import("firebase/auth");
                  const auth = getAuth();
                  await signOut(auth);
                  window.location.href = "/";
                }}
                className="w-full text-left px-3 py-1 hover:bg-gray-100 transition-colors"
              >
                Cerrar sesión
              </button>
            </div>
          )}
        </div>
      </div>




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
