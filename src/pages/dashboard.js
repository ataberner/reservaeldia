import { useEffect, useState } from 'react';
import { useRouter } from "next/router";
import DashboardLayout from '../components/DashboardLayout';
import DashboardHomeView from "@/components/dashboard/home/DashboardHomeView";
import DashboardTrashSection from "@/components/DashboardTrashSection";
import ModalVistaPrevia from '@/components/ModalVistaPrevia';
import TemplatePreviewModal from "@/components/TemplatePreviewModal";
import PublicationCheckoutModal from "@/components/payments/PublicationCheckoutModal";
import PublicadasGrid from "@/components/PublicadasGrid";
import dynamic from "next/dynamic";
import { useAdminAccess } from "@/hooks/useAdminAccess";
import { useDashboardAuthGate } from "@/hooks/useDashboardAuthGate";
import { useDashboardEditorIssues } from "@/hooks/useDashboardEditorIssues";
import { useDashboardEditorRoute } from "@/hooks/useDashboardEditorRoute";
import { useDashboardPreviewController } from "@/hooks/useDashboardPreviewController";
import { useDashboardStartupLoaders } from "@/hooks/useDashboardStartupLoaders";
import { useDashboardTemplateModal } from "@/hooks/useDashboardTemplateModal";
import SiteManagementBoard from "@/components/admin/SiteManagementBoard";
import ProfileCompletionModal from "@/lib/components/ProfileCompletionModal";
import ChunkErrorBoundary from "@/components/ChunkErrorBoundary";
import EditorIssueBanner from "@/components/editor/diagnostics/EditorIssueBanner";
import EditorStartupLoader from "@/components/editor/EditorStartupLoader";
import { pushEditorBreadcrumb } from "@/lib/monitoring/editorIssueReporter";
import { applyDefaultEditorConsoleDebugFlags } from "@/lib/monitoring/editorConsoleDebugFlags";
const CanvasEditor = dynamic(() => import("@/components/CanvasEditor"), {
  ssr: false, // disable server-side rendering for editor
  loading: () => <p className="p-4 text-sm text-gray-500">Cargando editor...</p>,
});
const DEFAULT_TIPO_INVITACION = "boda";

applyDefaultEditorConsoleDebugFlags();

export default function Dashboard() {
  const router = useRouter();
  const {
    usuario,
    checkingAuth,
    showProfileCompletion,
    profileInitialValues,
    handleCompleteProfile,
  } = useDashboardAuthGate({ router });
  const { loadingAdminAccess, isSuperAdmin, canManageSite } =
    useAdminAccess(usuario);
  const {
    slugInvitacion,
    setSlugInvitacion,
    modoEditor,
    setModoEditor,
    vista,
    setVista,
    legacyDraftNotice,
    setLegacyDraftNotice,
    adminDraftView,
    templateWorkspaceView,
    editorSession,
    isAdminReadOnlyView,
    isTemplateWorkspaceReadOnly,
    isEditorReadOnly,
    isTemplateEditorSession,
    requestedRouteSlug,
    isResolvingEditorRoute,
    pendingEditorRouteLabel,
    handleOpenTemplateSession,
    abrirBorradorEnEditor,
  } = useDashboardEditorRoute({
    router,
    checkingAuth,
    loadingAdminAccess,
    usuarioUid: usuario?.uid,
    isSuperAdmin,
    canManageSite,
  });
  const {
    openTemplateModal,
    templatePreviewModalProps,
  } = useDashboardTemplateModal({
    userUid: usuario?.uid,
    openDraftInEditor: abrirBorradorEnEditor,
  });
  const {
    editorIssueReport,
    sendingIssueReport,
    issueSendError,
    sentIssueId,
    handleDismissEditorIssue,
    handleCopyEditorIssue,
    handleSendEditorIssue,
  } = useDashboardEditorIssues({
    routerReady: router.isReady,
    querySlug: requestedRouteSlug,
    activeSlug: slugInvitacion,
    vista,
    modoEditor,
  });
  const {
    mostrarVistaPrevia,
    htmlVistaPrevia,
    urlPublicaVistaPrevia,
    slugPublicoVistaPrevia,
    publicacionVistaPreviaError,
    publicacionVistaPreviaOk,
    publishValidationResult,
    publishValidationPending,
    urlPublicadaReciente,
    mostrarCheckoutPublicacion,
    operacionCheckoutPublicacion,
    previewDisplayUrl,
    ensureDraftFlushBeforeCriticalAction,
    generarVistaPrevia,
    publicarDesdeVistaPrevia,
    handleCheckoutPublished,
    closePreview,
    closeCheckout,
  } = useDashboardPreviewController({
    slugInvitacion,
    modoEditor,
    editorSession,
  });
  const [tipoSeleccionado, setTipoSeleccionado] = useState(DEFAULT_TIPO_INVITACION);
  const [zoom, setZoom] = useState(0.8);
  const [secciones, setSecciones] = useState([]);
  const [seccionActivaId, setSeccionActivaId] = useState(null);
  const [historialExternos, setHistorialExternos] = useState([]);
  const [futurosExternos, setFuturosExternos] = useState([]);
  const isHomeView = !slugInvitacion && vista === "home" && !isResolvingEditorRoute;
  const {
    editorPreloadState,
    editorRuntimeState,
    shouldMountCanvasEditor,
    showEditorStartupLoader,
    shouldRenderEditorStartupLoader,
    isEditorStartupLoaderExiting,
    showHomeStartupLoader,
    shouldRenderHomeStartupLoader,
    isHomeStartupLoaderExiting,
    handleEditorStartupStatusChange,
    handleHomeViewReadyChange,
  } = useDashboardStartupLoaders({
    slugInvitacion,
    isHomeView,
    homeResetKey: tipoSeleccionado,
  });

  const toggleZoom = () => {
    setZoom((prev) => (prev === 1 ? 0.8 : 1));
  };

  // Listen custom event to open a draft
  useEffect(() => {

    const handleAbrirBorrador = (e) => {
      const { slug } = e.detail;
      if (!slug) return;

      pushEditorBreadcrumb("abrir-borrador-evento", {
        slug,
        editor: "konva",
      });
      void abrirBorradorEnEditor(slug);
    };


    window.addEventListener("abrir-borrador", handleAbrirBorrador);
    return () => {
      window.removeEventListener("abrir-borrador", handleAbrirBorrador);
    };


  }, [abrirBorradorEnEditor]);


  // cuando hay cambios en secciones
  useEffect(() => {
    if (!seccionActivaId && secciones.length > 0) {
      setSeccionActivaId(secciones[0].id);
    }
  }, [secciones]);
  useEffect(() => {
    if (checkingAuth || slugInvitacion) return;
    if (vista !== "gestion") return;
    if (loadingAdminAccess) return;
    if (isSuperAdmin) return;

    setVista("home");
    alert("Solo superadmin puede acceder al tablero de gestion.");
  }, [
    checkingAuth,
    isSuperAdmin,
    loadingAdminAccess,
    slugInvitacion,
    vista,
  ]);


  if (checkingAuth) return null;
  if (!usuario) return null; // Seguridad por si no se redirige

  return (
    <>
      <DashboardLayout
      mostrarMiniToolbar={!!slugInvitacion && !isEditorReadOnly}
      seccionActivaId={seccionActivaId}
      modoSelector={!slugInvitacion && vista === "home" && !isResolvingEditorRoute}
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
      ocultarSidebar={
        vista === "publicadas" ||
        vista === "papelera" ||
        vista === "gestion" ||
        isEditorReadOnly ||
        isResolvingEditorRoute
      }
      canManageSite={canManageSite}
      isSuperAdmin={isSuperAdmin}
      loadingAdminAccess={loadingAdminAccess}
      lockMainScroll={
        shouldRenderHomeStartupLoader || templatePreviewModalProps.visible
      }
      editorReadOnly={isEditorReadOnly}
      draftDisplayName={adminDraftView.draftName || templateWorkspaceView.draftName || ""}
      editorSession={editorSession}
      templateSessionMeta={templateWorkspaceView}
      ensureEditorFlushBeforeAction={ensureDraftFlushBeforeCriticalAction}
      onOpenTemplateSession={handleOpenTemplateSession}
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
      {legacyDraftNotice && !slugInvitacion && (
        <div className="mx-4 mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 shadow-[0_10px_28px_rgba(180,120,24,0.08)] sm:mx-6 lg:mx-8">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{legacyDraftNotice.title}</p>
              <p className="mt-1 text-amber-800/90">{legacyDraftNotice.body}</p>
            </div>
            <button
              type="button"
              onClick={() => setLegacyDraftNotice(null)}
              className="rounded-lg border border-amber-300 bg-white/80 px-3 py-1.5 text-xs font-semibold text-amber-900 transition hover:bg-white"
            >
              Cerrar
            </button>
          </div>
        </div>
      )}
      {!slugInvitacion &&
        adminDraftView.enabled &&
        adminDraftView.status === "loading" && (
          <div className="mx-4 mt-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 shadow-sm sm:mx-6 lg:mx-8">
            Cargando vista administrativa del borrador...
          </div>
        )}

      {isResolvingEditorRoute && (
        <div className="mx-4 mt-4 flex min-h-[280px] items-center justify-center rounded-[28px] border border-slate-200 bg-white shadow-[0_12px_36px_rgba(15,23,42,0.06)] sm:mx-6 lg:mx-8">
          <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
            <div className="relative flex h-11 w-11 items-center justify-center">
              <span className="absolute inset-0 animate-ping rounded-full border border-[#6f3bc0]/25" />
              <span className="h-10 w-10 animate-spin rounded-full border-2 border-slate-300/80 border-t-[#6f3bc0]" />
            </div>
            <p className="text-sm font-semibold text-slate-800">
              {pendingEditorRouteLabel}
            </p>
            <p className="max-w-md text-sm text-slate-500">
              Estamos preparando el canvas para evitar el salto visual del dashboard antes de entrar al editor.
            </p>
          </div>
        </div>
      )}
   

      {/* HOME view (selector oculto + bloques de borradores y plantillas) */}
      {isHomeView && (
        <div className="relative w-full px-4 pb-10 pt-4 sm:px-6 lg:px-8">
          {shouldRenderHomeStartupLoader && (
            <div
              className={
                "absolute inset-0 z-20 flex items-start justify-center rounded-2xl bg-gradient-to-b from-gray-50/80 via-gray-50/55 to-gray-50/30 pt-20 backdrop-blur-[1.5px] transition-all duration-300 ease-out " +
                (isHomeStartupLoaderExiting
                  ? "pointer-events-none opacity-0 backdrop-blur-0"
                  : "opacity-100")
              }
            >
              <div
                className={
                  "flex flex-col items-center gap-3 text-gray-600 transition-all duration-300 ease-out will-change-transform " +
                  (isHomeStartupLoaderExiting
                    ? "opacity-0 translate-y-7 scale-90 blur-[1.5px]"
                    : "opacity-100 translate-y-0 scale-100 blur-0")
                }
              >
                <div className="relative flex h-11 w-11 items-center justify-center">
                  <span className="absolute inset-0 animate-ping rounded-full border border-[#6f3bc0]/25" />
                  <span className="h-10 w-10 animate-spin rounded-full border-2 border-gray-300/80 border-t-[#6f3bc0]" />
                </div>
                <p className="text-sm font-medium tracking-[0.01em] text-gray-600/95">Afinando los detalles...</p>
              </div>
            </div>
          )}

          <div
            className={
              showHomeStartupLoader
                ? "pointer-events-none opacity-0"
                : "opacity-100 transition-opacity duration-200"
            }
          >
          <DashboardHomeView
            usuario={usuario}
            tipoInvitacion={tipoSeleccionado}
            isSuperAdmin={isSuperAdmin}
            onSelectTemplate={openTemplateModal}
            onReadyChange={handleHomeViewReadyChange}
          />
          </div>
        </div>
      )}

      {/* PUBLISHED view */}
      {!slugInvitacion && vista === "publicadas" && (
        <div className="w-full px-4 pb-8">
          <PublicadasGrid usuario={usuario} />
        </div>
      )}

      {!slugInvitacion && vista === "papelera" && (
        <div className="w-full px-4 pb-8">
          <DashboardTrashSection usuario={usuario} />
        </div>
      )}



      {/* Invitation editor */}
      {!slugInvitacion && vista === "gestion" && isSuperAdmin && (
        <div className="w-full px-4 pb-8">
          <SiteManagementBoard
            isSuperAdmin={isSuperAdmin}
            loadingAdminAccess={loadingAdminAccess}
          />
        </div>
      )}

      {slugInvitacion && (
        <ChunkErrorBoundary>
          <div className={shouldMountCanvasEditor ? "relative" : ""}>
            {shouldMountCanvasEditor && (
              <div
                className={
                  "transform-gpu transition-all duration-[920ms] ease-[cubic-bezier(0.22,1,0.36,1)] will-change-transform " +
                  (showEditorStartupLoader
                    ? "pointer-events-none opacity-0 scale-[0.985] blur-[3px]"
                    : "opacity-100 scale-100 blur-0")
                }
                aria-hidden={showEditorStartupLoader ? "true" : undefined}
              >
                <CanvasEditor
                  slug={slugInvitacion}
                  editorSession={editorSession}
                  zoom={zoom}
                  onHistorialChange={setHistorialExternos}
                  onFuturosChange={setFuturosExternos}
                  userId={usuario?.uid}
                  secciones={[]}
                  onStartupStatusChange={handleEditorStartupStatusChange}
                  canManageSite={canManageSite && !isAdminReadOnlyView}
                  readOnly={isEditorReadOnly}
                  initialDraftData={isAdminReadOnlyView ? adminDraftView.draftData : null}
                  initialEditorData={
                    isAdminReadOnlyView
                      ? adminDraftView.draftData
                      : templateWorkspaceView.initialData || null
                  }
                />
              </div>
            )}

            {shouldRenderEditorStartupLoader && (
              <div className={shouldMountCanvasEditor ? "absolute inset-0 z-10" : ""}>
                <div
                  className={
                    "w-full transform-gpu transition-all duration-[920ms] ease-[cubic-bezier(0.22,1,0.36,1)] will-change-transform " +
                    (isEditorStartupLoaderExiting
                      ? "pointer-events-none opacity-0 translate-y-10 scale-[1.03] blur-[2.5px]"
                      : "opacity-100 translate-y-0 scale-100 blur-0")
                  }
                >
                <EditorStartupLoader
                  preloadState={editorPreloadState}
                  runtimeState={editorRuntimeState}
                />
                </div>
              </div>
            )}
          </div>
        </ChunkErrorBoundary>
      )}



      <TemplatePreviewModal {...templatePreviewModalProps} />

      {/* Modal de vista previa */}
      <ModalVistaPrevia
        visible={mostrarVistaPrevia}
        onClose={closePreview}
        htmlContent={htmlVistaPrevia}
        publicUrl={urlPublicaVistaPrevia}
        previewDisplayUrl={previewDisplayUrl}
        onPublish={publicarDesdeVistaPrevia}
        showPublishActions={!isTemplateEditorSession}
        publishing={false}
        publishError={publicacionVistaPreviaError}
        publishSuccess={publicacionVistaPreviaOk}
        publishedUrl={urlPublicadaReciente}
        checkoutVisible={!isTemplateEditorSession && mostrarCheckoutPublicacion}
        publishValidation={publishValidationResult}
        publishValidationPending={publishValidationPending}
      />


      </DashboardLayout>

      <PublicationCheckoutModal
        visible={!isTemplateEditorSession && mostrarCheckoutPublicacion}
        onClose={closeCheckout}
        draftSlug={slugInvitacion}
        operation={operacionCheckoutPublicacion}
        currentPublicSlug={slugPublicoVistaPrevia || ""}
        currentPublicUrl={urlPublicaVistaPrevia || ""}
        onPublished={handleCheckoutPublished}
      />

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
