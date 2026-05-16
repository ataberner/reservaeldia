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
import {
  buildDashboardCanvasEditorProps,
  buildDashboardLayoutProps,
  buildDashboardPageViewState,
  buildDashboardPreviewGateState,
} from "@/domain/dashboard/pageShell";
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
  const tipoSeleccionado = DEFAULT_TIPO_INVITACION;
  const [zoom, setZoom] = useState(0.8);
  const [historialExternos, setHistorialExternos] = useState([]);
  const [futurosExternos, setFuturosExternos] = useState([]);
  const [focusedPublicSlug, setFocusedPublicSlug] = useState("");
  const pageViewState = buildDashboardPageViewState({
    slugInvitacion,
    vista,
    isResolvingEditorRoute,
    isSuperAdmin,
    legacyDraftNotice,
    adminDraftView,
  });
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
    isHomeView: pageViewState.isHomeView,
    homeResetKey: tipoSeleccionado,
  });
  const previewGateState = buildDashboardPreviewGateState({
    isTemplateEditorSession,
    mostrarCheckoutPublicacion,
  });
  const toggleZoom = () => {
    setZoom((prev) => (prev === 1 ? 0.8 : 1));
  };
  const handleOpenPublicationResponses = (publicSlug) => {
    const safePublicSlug = String(publicSlug || "").trim();
    if (safePublicSlug) {
      setFocusedPublicSlug(safePublicSlug);
    }
    setVista("publicadas");
  };
  const layoutProps = buildDashboardLayoutProps({
    slugInvitacion,
    setSlugInvitacion,
    setModoEditor,
    zoom,
    toggleZoom,
    historialExternos,
    futurosExternos,
    generarVistaPrevia,
    usuario,
    vista,
    setVista,
    canManageSite,
    isSuperAdmin,
    loadingAdminAccess,
    isEditorReadOnly,
    isResolvingEditorRoute,
    shouldRenderHomeStartupLoader,
    templatePreviewModalVisible: templatePreviewModalProps.visible,
    adminDraftView,
    templateWorkspaceView,
    editorSession,
    ensureDraftFlushBeforeCriticalAction,
    handleOpenTemplateSession,
    seccionActivaId: null,
  });
  const canvasEditorProps = buildDashboardCanvasEditorProps({
    slugInvitacion,
    editorSession,
    zoom,
    setHistorialExternos,
    setFuturosExternos,
    usuarioUid: usuario?.uid,
    handleEditorStartupStatusChange,
    canManageSite,
    isAdminReadOnlyView,
    isEditorReadOnly,
    adminDraftView,
    templateWorkspaceView,
  });

  // Page-level event bridge: open a draft from external dashboard actions.
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

  // Page-level access guard: only superadmin can keep the management view.
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
      <DashboardLayout {...layoutProps}>
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
      {pageViewState.showLegacyDraftNotice && (
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
      {pageViewState.showAdminDraftLoadingNotice && (
          <div className="mx-4 mt-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 shadow-sm sm:mx-6 lg:mx-8">
            Cargando vista administrativa del borrador...
          </div>
        )}

      {pageViewState.showRouteResolvingView && (
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
      {pageViewState.isHomeView && (
        <div className="relative w-full bg-white">
          {shouldRenderHomeStartupLoader && (
            <div
              className={
                "absolute inset-0 z-20 flex items-start justify-center bg-gradient-to-b from-white/85 via-white/65 to-white/35 pt-20 backdrop-blur-[1.5px] transition-all duration-300 ease-out " +
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
            onOpenPublicationResponses={handleOpenPublicationResponses}
            onReadyChange={handleHomeViewReadyChange}
          />
          </div>
        </div>
      )}

      {/* PUBLISHED view */}
      {pageViewState.showPublicationsView && (
        <div className="w-full px-4 pb-8">
          <PublicadasGrid
            usuario={usuario}
            focusPublicSlug={focusedPublicSlug}
          />
        </div>
      )}

      {pageViewState.showTrashView && (
        <div className="w-full px-4 pb-8">
          <DashboardTrashSection usuario={usuario} />
        </div>
      )}



      {/* Invitation editor */}
      {pageViewState.showManagementView && (
        <div className="w-full px-4 pb-8">
          <SiteManagementBoard
            isSuperAdmin={isSuperAdmin}
            loadingAdminAccess={loadingAdminAccess}
          />
        </div>
      )}

      {pageViewState.showEditorView && (
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
                <CanvasEditor {...canvasEditorProps} />
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
        showPublishActions={previewGateState.canPublishFromPreview}
        publishing={false}
        publishError={publicacionVistaPreviaError}
        publishSuccess={publicacionVistaPreviaOk}
        publishedUrl={urlPublicadaReciente}
        checkoutVisible={previewGateState.previewCheckoutVisible}
        publishValidation={publishValidationResult}
        publishValidationPending={publishValidationPending}
      />


      </DashboardLayout>

      <PublicationCheckoutModal
        visible={previewGateState.checkoutModalVisible}
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
