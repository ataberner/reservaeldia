import { useEffect, useRef, useState } from 'react';
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
import EditorIssueBanner from "@/components/editor/diagnostics/EditorIssueBanner";
import {
  consumeInterruptedEditorSession,
  clearPendingEditorIssue,
  installGlobalEditorIssueHandlers,
  pushEditorBreadcrumb,
  readPendingEditorIssue,
  startEditorSessionWatchdog,
} from "@/lib/monitoring/editorIssueReporter";
const CanvasEditor = dynamic(() => import("@/components/CanvasEditor"), {
  ssr: false, // disable server-side rendering for editor
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

function trimText(value, max = 1000) {
  if (value === null || typeof value === "undefined") return null;
  const text = String(value ?? "");
  if (text.length <= max) return text;
  return `${text.slice(0, max)}...`;
}

function buildReportForTransport(report) {
  if (!report || typeof report !== "object") return {};

  const runtime = report.runtime && typeof report.runtime === "object"
    ? {
        href: report.runtime.href || null,
        path: report.runtime.path || null,
        query: report.runtime.query || null,
        userAgent: trimText(report.runtime.userAgent, 400),
        language: report.runtime.language || null,
        platform: report.runtime.platform || null,
        viewport: report.runtime.viewport || null,
        memory: report.runtime.memory || null,
      }
    : null;

  const breadcrumbs = Array.isArray(report.breadcrumbs)
    ? report.breadcrumbs.slice(-30).map((item) => ({
        at: item?.at || null,
        event: trimText(item?.event, 120),
        detail: trimText(item?.detail, 800),
      }))
    : [];

  return {
    id: trimText(report.id, 120),
    occurredAt: trimText(report.occurredAt, 80),
    source: trimText(report.source, 180),
    severity: trimText(report.severity, 40),
    slug: trimText(report.slug, 180),
    name: trimText(report.name, 120),
    message: trimText(report.message, 2000),
    stack: trimText(report.stack, 12000),
    detail: trimText(report.detail, 12000),
    runtime,
    breadcrumbs,
    fingerprint: trimText(report.fingerprint, 180),
  };
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
  const [editorIssueReport, setEditorIssueReport] = useState(null);
  const [sendingIssueReport, setSendingIssueReport] = useState(false);
  const [issueSendError, setIssueSendError] = useState("");
  const [sentIssueId, setSentIssueId] = useState(null);
  const attemptedAutoSendRef = useRef(new Set());
  const router = useRouter();
  const { loadingAdminAccess, isSuperAdmin, canManageSite } =
    useAdminAccess(usuario);


  // Sync ?slug=... with local state (always Konva)
  useEffect(() => {
    if (!router.isReady) return;

    const slugParam = router.query?.slug;
    const slugURL = typeof slugParam === "string" ? slugParam : null;

    if (slugURL) {
      if (slugInvitacion !== slugURL) {
        setSlugInvitacion(slugURL);
      }
      if (modoEditor !== "konva") {
        setModoEditor("konva");
      }
      setVista((prev) => (prev === "editor" ? prev : "editor"));
      return;
    }

    if (slugInvitacion) {
      setSlugInvitacion(null);
    }
    if (modoEditor) {
      setModoEditor(null);
    }
    setVista((prev) => (prev === "editor" ? "home" : prev));
  }, [router.isReady, router.query?.slug]);

  useEffect(() => {
    pushEditorBreadcrumb("dashboard-mounted", {});

    const teardownGlobal = installGlobalEditorIssueHandlers();
    const onIssueCaptured = (event) => {
      const report = event?.detail || null;
      if (!report) return;
      setEditorIssueReport(report);
      setIssueSendError("");
      setSentIssueId(null);
    };

    window.addEventListener("editor-issue-captured", onIssueCaptured);

    const pending = readPendingEditorIssue();
    if (pending) {
      setEditorIssueReport(pending);
    }

    return () => {
      teardownGlobal?.();
      window.removeEventListener("editor-issue-captured", onIssueCaptured);
    };
  }, []);

  useEffect(() => {
    if (!router.isReady) return;
    const slugQuery = typeof router.query?.slug === "string" ? router.query.slug : null;
    consumeInterruptedEditorSession({ currentSlug: slugQuery });
  }, [router.isReady, router.query?.slug]);

  useEffect(() => {
    if (!slugInvitacion) return;
    pushEditorBreadcrumb("editor-open", {
      slug: slugInvitacion,
      vista,
      modoEditor,
    });
  }, [slugInvitacion, vista, modoEditor]);

  useEffect(() => {
    if (!slugInvitacion) return undefined;
    const stopWatchdog = startEditorSessionWatchdog({
      slug: slugInvitacion,
      context: {
        vista,
        modoEditor,
      },
    });
    return () => {
      stopWatchdog("editor-unmounted");
    };
  }, [slugInvitacion]);

  const handleDismissEditorIssue = () => {
    clearPendingEditorIssue();
    setEditorIssueReport(null);
    setIssueSendError("");
    setSentIssueId(null);
  };

  const handleCopyEditorIssue = async () => {
    if (!editorIssueReport) return;
    const payload = JSON.stringify(editorIssueReport, null, 2);
    try {
      await navigator.clipboard.writeText(payload);
      alert("Reporte copiado al portapapeles.");
    } catch {
      alert(payload);
    }
  };

  const handleSendEditorIssue = async (reportOverride = null) => {
    const reportToSend = reportOverride || editorIssueReport;
    if (!reportToSend || sendingIssueReport) return;

    setSendingIssueReport(true);
    setIssueSendError("");

    try {
      const reportClientIssueCallable = httpsCallable(cloudFunctions, "reportClientIssue");
      const transportReport = buildReportForTransport(reportToSend);
      const result = await reportClientIssueCallable({
        report: transportReport,
      });
      const issueId = result?.data?.issueId || null;
      if (issueId) {
        setSentIssueId(issueId);
      }
      if (!reportOverride || reportOverride === editorIssueReport) {
        clearPendingEditorIssue();
      }
      pushEditorBreadcrumb("issue-report-sent", {
        issueId: issueId || null,
        source: reportToSend?.source || null,
      });
    } catch (error) {
      setIssueSendError(getErrorMessage(error, "No se pudo enviar el reporte."));
      pushEditorBreadcrumb("issue-report-send-error", {
        source: reportToSend?.source || null,
        message: getErrorMessage(error, "No se pudo enviar el reporte."),
      });
    } finally {
      setSendingIssueReport(false);
    }
  };

  useEffect(() => {
    if (!editorIssueReport) return;

    const reportKey =
      editorIssueReport.id ||
      `${editorIssueReport.fingerprint || "no-fingerprint"}:${editorIssueReport.occurredAt || "no-time"}`;

    if (attemptedAutoSendRef.current.has(reportKey)) return;
    attemptedAutoSendRef.current.add(reportKey);

    handleSendEditorIssue(editorIssueReport);
  }, [editorIssueReport]);


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
        alert("No se encontro el borrador");
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

      // Debug summary of objects by section/type in the draft
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

      // Import HTML generation function
      const { generarHTMLDesdeSecciones } = await import("../../functions/src/utils/generarHTMLDesdeSecciones");
      const htmlGenerado = generarHTMLDesdeSecciones(secciones, objetosBase);

      // DEBUG: inspect countdown props
      try {
        const cds = (objetosBase || []).filter(o => o?.tipo === "countdown");
      } catch (e) {
      }

      setHtmlVistaPrevia(htmlGenerado);
    } catch (error) {
      console.error("Error generando vista previa:", error);
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

  

  // Load templates by type
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

  // Listen custom event to open a draft
  useEffect(() => {

    const handleAbrirBorrador = (e) => {
      const { slug, editor } = e.detail;
      if (!slug) return;

      // Safe fallback: only "iframe" keeps iframe mode, otherwise Konva.
      const editorNormalizado = editor === "iframe" ? "iframe" : "konva";
      pushEditorBreadcrumb("abrir-borrador-evento", {
        slug,
        editor: editorNormalizado,
      });

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
      router.replace(
        { pathname: "/dashboard", query: { slug } },
        undefined,
        { shallow: true }
      );
    };


    window.addEventListener("abrir-borrador", handleAbrirBorrador);
    return () => {
      window.removeEventListener("abrir-borrador", handleAbrirBorrador);
    };


  }, [router]);


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
        const hasGoogleProvider = providerIds.includes("google.com");
        const hasOnlyPasswordProvider = hasPasswordProvider && !hasGoogleProvider;

        if (hasOnlyPasswordProvider && user.emailVerified !== true) {
          await signOut(auth);
          if (!mounted) return;
          setShowProfileCompletion(false);
          setUsuario(null);
          setCheckingAuth(false);
          router.replace("/?authNotice=email-not-verified");
          return;
        }

        try {
          await user.getIdToken();
          let result;
          try {
            result = await getMyProfileStatusCallable({});
          } catch {
            await user.getIdToken(true);
            await new Promise((resolve) => setTimeout(resolve, 700));
            result = await getMyProfileStatusCallable({});
          }
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
    alert("No tenes permisos para acceder al tablero de gestion.");
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
      {editorIssueReport && (
        <EditorIssueBanner
          report={editorIssueReport}
          sending={sendingIssueReport}
          sendError={issueSendError}
          sentIssueId={sentIssueId}
          onDismiss={handleDismissEditorIssue}
          onCopy={handleCopyEditorIssue}
          onSend={handleSendEditorIssue}
        />
      )}
   

      {/* HOME view (selector, templates, drafts) */}
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
                      pushEditorBreadcrumb("abrir-plantilla", {
                        slug,
                        plantillaId: plantilla?.id || null,
                        editor: plantilla?.editor || null,
                      });

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
                      router.replace(
                        { pathname: "/dashboard", query: { slug } },
                        undefined,
                        { shallow: true }
                      );
                    } catch (error) {
                      alert("Error al copiar la plantilla");
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

      {/* PUBLISHED view */}
      {!slugInvitacion && vista === "publicadas" && (
        <div className="w-full px-4 pb-8">
          <PublicadasGrid usuario={usuario} />
        </div>
      )}



      {/* Invitation editor */}
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

