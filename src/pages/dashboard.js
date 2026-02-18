import { useEffect, useState } from 'react';
import { collection, query, where, doc, getDoc, getDocs } from 'firebase/firestore';
import { db, functions as cloudFunctions } from '../firebase';
import { getAuth, onAuthStateChanged, signOut } from 'firebase/auth';
import { useRouter } from "next/router";
import DashboardLayout from '../components/DashboardLayout';
import TipoSelector from '../components/TipoSelector';
import PlantillaGrid from '../components/PlantillaGrid';
import BorradoresGrid from '@/components/BorradoresGrid';
import ModalVistaPrevia from '@/components/ModalVistaPrevia';
import PublicadasGrid from "@/components/PublicadasGrid";
import { httpsCallable } from "firebase/functions";
import dynamic from "next/dynamic";
import { useAdminAccess } from "@/hooks/useAdminAccess";
import SiteManagementBoard from "@/components/admin/SiteManagementBoard";
import ProfileCompletionModal from "@/lib/components/ProfileCompletionModal";
import ChunkErrorBoundary from "@/components/ChunkErrorBoundary";
const CanvasEditor = dynamic(() => import("@/components/CanvasEditor"), {
  ssr: false, // 💡 desactiva server-side rendering
  loading: () => <p className="p-4 text-sm text-gray-500">Cargando editor...</p>,
});

function splitDisplayName(displayName) {
  const clean = typeof displayName === "string"
    ? displayName.trim().replace(/\s+/g, " ")
    : "";

  if (!clean) return { nombre: "", apellido: "" };

  const parts = clean.split(" ");
  if (parts.length === 1) return { nombre: parts[0], apellido: "" };

  return {
    nombre: parts[0],
    apellido: parts.slice(1).join(" "),
  };
}

function getErrorMessage(error, fallback) {
  const message =
    error?.message ||
    error?.details?.message ||
    error?.details ||
    fallback;

  return typeof message === "string" ? message : fallback;
}



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
  const [vista, setVista] = useState("home");
  const [showProfileCompletion, setShowProfileCompletion] = useState(false);
  const [profileInitialValues, setProfileInitialValues] = useState({
    nombre: "",
    apellido: "",
    fechaNacimiento: "",
  });
  const router = useRouter();
  const { loadingAdminAccess, isSuperAdmin, canManageSite } =
    useAdminAccess(usuario);


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
      const previewDebug = (() => {
        try {
          const qp = new URLSearchParams(window.location.search || "");
          return qp.get("previewDebug") === "1";
        } catch (_e) {
          return false;
        }
      })();

      // Debug de distribución real de objetos por sección/tipo en el borrador
      try {
        const resumen = {};
        objetosBase.forEach((o) => {
          const sec = String(o?.seccionId || "sin-seccion");
          if (!resumen[sec]) resumen[sec] = { total: 0, tipos: {} };
          resumen[sec].total += 1;
          const t = String(o?.tipo || "sin-tipo");
          resumen[sec].tipos[t] = (resumen[sec].tipos[t] || 0) + 1;
        });
        const vw = window.innerWidth || document.documentElement.clientWidth || 0;
        const vh = window.innerHeight || document.documentElement.clientHeight || 0;
        const dpr = window.devicePixelRatio || 1;
        const ua = navigator.userAgent || "";
        const mobileUA = /Android|iPhone|iPad|iPod|Mobile/i.test(ua);
        const mobileViewport = vw <= 767;
        const desktopMobilePreview = mobileViewport && !mobileUA;

        const filas = Object.keys(resumen)
          .sort((a, b) => {
            const ta = resumen[a]?.total || 0;
            const tb = resumen[b]?.total || 0;
            if (tb !== ta) return tb - ta;
            return a.localeCompare(b);
          })
          .map((secId) => {
            const item = resumen[secId] || { total: 0, tipos: {} };
            const tiposTxt = Object.keys(item.tipos || {})
              .sort()
              .map((tipo) => `${tipo}:${item.tipos[tipo]}`)
              .join(", ");
            return `${secId} | total=${item.total} | tipos=${tiposTxt || "-"}`;
          });

        const header =
          `[PREVIEW] objetos por seccion (abierto)\n` +
          `viewport=${vw}x${vh} dpr=${Number(dpr).toFixed(2)} ` +
          `mobileViewport=${mobileViewport} desktopMobilePreview=${desktopMobilePreview} mobileUA=${mobileUA}\n` +
          `secciones=${Object.keys(resumen).length} objetos=${objetosBase.length}`;

        if (previewDebug) {
          console.log(`${header}\n${filas.join("\n")}`);
        }
      } catch (e) {
        if (previewDebug) {
          console.warn("[PREVIEW] no se pudo armar resumen de objetos", e);
        }
      }

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

  const handleCompleteProfile = async (payload) => {
    const upsertUserProfileCallable = httpsCallable(cloudFunctions, "upsertUserProfile");

    try {
      await upsertUserProfileCallable({
        ...payload,
        source: "profile-completion",
      });

      const auth = getAuth();
      if (auth.currentUser) {
        await auth.currentUser.reload();
      }

      setShowProfileCompletion(false);
    } catch (error) {
      throw new Error(
        getErrorMessage(error, "No se pudo actualizar tu perfil.")
      );
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
      if (!slug) return;

      // Fallback seguro: salvo que venga explícitamente "iframe", abrimos Konva.
      const editorNormalizado = editor === "iframe" ? "iframe" : "konva";

      setSlugInvitacion(slug);

      if (editorNormalizado === "konva") {
        setUrlIframe(null);
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
    const getMyProfileStatusCallable = httpsCallable(
      cloudFunctions,
      "getMyProfileStatus"
    );
    let mounted = true;

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      (async () => {
        if (!mounted) return;
        setCheckingAuth(true);

        if (!user) {
          if (!mounted) return;
          setShowProfileCompletion(false);
          setUsuario(null);
          setCheckingAuth(false);
          return;
        }

        const providerIds = (user.providerData || [])
          .map((provider) => provider?.providerId)
          .filter(Boolean);
        const hasPasswordProvider = providerIds.includes("password");

        if (hasPasswordProvider && user.emailVerified !== true) {
          await signOut(auth);
          if (!mounted) return;
          setShowProfileCompletion(false);
          setUsuario(null);
          setCheckingAuth(false);
          router.replace("/?authNotice=email-not-verified");
          return;
        }

        try {
          const result = await getMyProfileStatusCallable({});
          const statusData = result?.data || {};

          if (statusData.profileComplete !== true) {
            const fallbackNames = splitDisplayName(
              statusData?.profile?.nombreCompleto || user.displayName || ""
            );

            setProfileInitialValues({
              nombre: statusData?.profile?.nombre || fallbackNames.nombre || "",
              apellido: statusData?.profile?.apellido || fallbackNames.apellido || "",
              fechaNacimiento: statusData?.profile?.fechaNacimiento || "",
              nombreCompleto:
                statusData?.profile?.nombreCompleto || user.displayName || "",
            });
            setShowProfileCompletion(true);
          } else {
            setShowProfileCompletion(false);
          }

          setUsuario(user);
        } catch (error) {
          console.error("Error validando estado de perfil:", error);
          await signOut(auth);
          if (!mounted) return;
          setShowProfileCompletion(false);
          setUsuario(null);
          router.replace("/?authNotice=profile-check-failed");
        } finally {
          if (mounted) {
            setCheckingAuth(false);
          }
        }
      })();
    });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, [router]);

  useEffect(() => {
    if (checkingAuth || slugInvitacion) return;
    if (vista !== "gestion") return;
    if (loadingAdminAccess) return;
    if (canManageSite) return;

    setVista("home");
    alert("No tenés permisos para acceder al tablero de gestión.");
  }, [
    canManageSite,
    checkingAuth,
    loadingAdminAccess,
    slugInvitacion,
    vista,
  ]);


  if (checkingAuth) return <p>Cargando...</p>;
  if (!usuario) return null; // Seguridad por si no se redirige

  return (
    <>
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
      ocultarSidebar={vista === "publicadas" || vista === "gestion"}
      canManageSite={canManageSite}
      isSuperAdmin={isSuperAdmin}
      loadingAdminAccess={loadingAdminAccess}
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
                      const copiarPlantilla = httpsCallable(
                        cloudFunctions,
                        "copiarPlantilla"
                      );
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
      {!slugInvitacion && vista === "gestion" && (
        <div className="w-full px-4 pb-8">
          <SiteManagementBoard
            canManageSite={canManageSite}
            isSuperAdmin={isSuperAdmin}
            loadingAdminAccess={loadingAdminAccess}
          />
        </div>
      )}

      {slugInvitacion && (
        <>
          {modoEditor !== "iframe" && (
            <ChunkErrorBoundary>
              <CanvasEditor
                slug={slugInvitacion}
                zoom={zoom}
                onHistorialChange={setHistorialExternos}
                onFuturosChange={setFuturosExternos}
                userId={usuario?.uid}
                secciones={[]}
              />
            </ChunkErrorBoundary>
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

      <ProfileCompletionModal
        visible={showProfileCompletion}
        mandatory
        title="Completa tu perfil"
        subtitle="Para seguir usando la app necesitamos nombre, apellido y fecha de nacimiento."
        initialValues={profileInitialValues}
        submitLabel="Guardar y continuar"
        onSubmit={handleCompleteProfile}
      />
    </>
  );
}
