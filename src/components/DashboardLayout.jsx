// src/components/DashboardLayout.jsx
import { useCallback, useEffect, useRef, useState } from "react";
import DashboardHeader from "./DashboardHeader";
import DashboardSidebar from "./DashboardSidebar";
import { logAssistantTourDebug } from "@/components/editor/assistantTour/assistantTourDebug";
import { corregirURLsInvalidas } from "@/utils/corregirImagenes";

export default function DashboardLayout({
  children,
  slugInvitacion,
  setSlugInvitacion,
  setModoEditor,
  zoom,
  toggleZoom,
  historialExternos,
  futurosExternos,
  generarVistaPrevia,
  usuario,
  mostrarMiniToolbar,
  seccionActivaId,
  modoSelector = false,
  vista,
  onCambiarVista,
  ocultarSidebar = false,
  canManageSite,
  isSuperAdmin,
  loadingAdminAccess,
  lockMainScroll = false,
  editorReadOnly = false,
  draftDisplayName = "",
  editorSession = null,
  templateSessionMeta = null,
  ensureEditorFlushBeforeAction = null,
  onOpenTemplateSession = null,
  assistantTourEditorReady = false,
  assistantTourPreferencesLoaded = false,
  assistantTourOptOut = false,
  assistantTourSaving = false,
  onAssistantTourPreferenceChange = null,
  assistantTourPreviewOpen = false,
}) {
  useEffect(() => {
    corregirURLsInvalidas(); // Corrige URLs invalidas al entrar
  }, []);

  const assistantTourOpeningRef = useRef({
    draftKey: "",
    openingIndex: 0,
    openingKey: "",
  });
  const assistantTourRestoreRequestRef = useRef(null);
  const assistantTourRestartSequenceRef = useRef(0);
  const [assistantTourRestartKey, setAssistantTourRestartKey] = useState(0);
  const assistantTourDraftKey = String(
    slugInvitacion ||
      editorSession?.slug ||
      editorSession?.id ||
      ""
  ).trim();

  if (assistantTourOpeningRef.current.draftKey !== assistantTourDraftKey) {
    assistantTourOpeningRef.current = {
      draftKey: assistantTourDraftKey,
      openingIndex: assistantTourOpeningRef.current.openingIndex + 1,
      openingKey: assistantTourDraftKey
        ? `${assistantTourDraftKey}:${assistantTourOpeningRef.current.openingIndex + 1}`
        : "",
    };
  }

  const handleAssistantTourPreferenceChange = useCallback(
    (patch) => {
      if (typeof onAssistantTourPreferenceChange !== "function") {
        return Promise.reject(
          new Error("assistant-tour-preference-handler-unavailable")
        );
      }

      if (patch?.assistantTourOptOut !== false) {
        return onAssistantTourPreferenceChange(patch);
      }

      if (assistantTourRestoreRequestRef.current) {
        return assistantTourRestoreRequestRef.current;
      }

      const restoreRequest = Promise.resolve(
        onAssistantTourPreferenceChange(patch)
      )
        .then((savedPreferences) => {
          if (savedPreferences?.assistantTourOptOut !== false) {
            throw new Error("assistant-tour-restore-not-confirmed");
          }

          assistantTourRestartSequenceRef.current += 1;
          setAssistantTourRestartKey(
            assistantTourRestartSequenceRef.current
          );
          return savedPreferences;
        })
        .finally(() => {
          if (assistantTourRestoreRequestRef.current === restoreRequest) {
            assistantTourRestoreRequestRef.current = null;
          }
        });

      assistantTourRestoreRequestRef.current = restoreRequest;
      return restoreRequest;
    },
    [onAssistantTourPreferenceChange]
  );
  const resolvedAssistantTourPreferenceChange =
    typeof onAssistantTourPreferenceChange === "function"
      ? handleAssistantTourPreferenceChange
      : null;

  // Runtime-sensitive shell contract: header/sidebar/editor overlays consume
  // this CSS variable, so keep it in sync with DashboardHeader.
  const headerHeight = "var(--dashboard-header-height, 52px)";
  const shellBackgroundClass = "bg-white";
  const mainBaseClass = modoSelector
    ? "absolute left-0 right-0 min-w-0 bg-white"
    : "min-w-0 flex-1 bg-white px-2 pb-2 pt-2 sm:px-4 sm:pb-4 sm:pt-3";
  const mainScrollClass = lockMainScroll
    ? "overflow-hidden"
    : "overflow-x-hidden overflow-y-auto";
  const mainStyle = modoSelector
    ? {
        top: headerHeight,
        height: `calc(100vh - ${headerHeight})`,
        transform: "translateZ(0)",
        zIndex: 0,
      }
    : {
        marginTop: headerHeight,
        height: `calc(100vh - ${headerHeight})`,
      };

  if (lockMainScroll) {
    mainStyle.overscrollBehavior = "none";
    mainStyle.touchAction = "none";
  }
  const sidebarInstanceKey = slugInvitacion
    ? `editor-sidebar:${slugInvitacion}`
    : "dashboard-sidebar";

  useEffect(() => {
    logAssistantTourDebug("layout-opening-state", () => ({
      slugInvitacion,
      assistantTourDraftKey,
      sidebarInstanceKey,
      openingKey: assistantTourOpeningRef.current.openingKey,
      openingIndex: assistantTourOpeningRef.current.openingIndex,
      editorSession: {
        id: editorSession?.id || "",
        slug: editorSession?.slug || "",
        kind: editorSession?.kind || "",
      },
      assistantTourEditorReady,
      assistantTourPreferencesLoaded,
      assistantTourOptOut,
      assistantTourRestartKey,
      assistantTourPreviewOpen,
    }));
  }, [
    assistantTourDraftKey,
    assistantTourEditorReady,
    assistantTourOptOut,
    assistantTourPreferencesLoaded,
    assistantTourRestartKey,
    assistantTourPreviewOpen,
    editorSession?.id,
    editorSession?.kind,
    editorSession?.slug,
    sidebarInstanceKey,
    slugInvitacion,
  ]);

  return (
    <div className={`relative flex h-screen overflow-hidden ${shellBackgroundClass}`}>
      {/* Barra superior */}
      <DashboardHeader
        slugInvitacion={slugInvitacion}
        setSlugInvitacion={setSlugInvitacion}
        setModoEditor={setModoEditor}
        zoom={zoom}
        toggleZoom={toggleZoom}
        historialExternos={historialExternos}
        futurosExternos={futurosExternos}
        generarVistaPrevia={generarVistaPrevia}
        usuario={usuario}
        vistaActual={vista}
        onCambiarVista={onCambiarVista}
        canManageSite={canManageSite}
        isSuperAdmin={isSuperAdmin}
        loadingAdminAccess={loadingAdminAccess}
        editorReadOnly={editorReadOnly}
        draftDisplayName={draftDisplayName}
        editorSession={editorSession}
        templateSessionMeta={templateSessionMeta}
        ensureEditorFlushBeforeAction={ensureEditorFlushBeforeAction}
        onOpenTemplateSession={onOpenTemplateSession}
        assistantTourPreferencesLoaded={assistantTourPreferencesLoaded}
        assistantTourOptOut={assistantTourOptOut}
        assistantTourSaving={assistantTourSaving}
        onAssistantTourPreferenceChange={resolvedAssistantTourPreferenceChange}
      />

      {/* Sidebar */}
      {!ocultarSidebar && (
        <DashboardSidebar
          key={sidebarInstanceKey}
          slugInvitacion={slugInvitacion}
          generarVistaPrevia={generarVistaPrevia}
          modoSelector={modoSelector}
          mostrarMiniToolbar={mostrarMiniToolbar}
          seccionActivaId={seccionActivaId}
          historialExternos={historialExternos}
          futurosExternos={futurosExternos}
          editorReadOnly={editorReadOnly}
          canManageSite={canManageSite}
          editorSession={editorSession}
          templateSessionMeta={templateSessionMeta}
          userUid={usuario?.uid || ""}
          assistantTourEditorReady={assistantTourEditorReady}
          assistantTourPreferencesLoaded={assistantTourPreferencesLoaded}
          assistantTourOptOut={assistantTourOptOut}
          assistantTourSaving={assistantTourSaving}
          onAssistantTourPreferenceChange={resolvedAssistantTourPreferenceChange}
          assistantTourPreviewOpen={assistantTourPreviewOpen}
          assistantTourOpeningKey={assistantTourOpeningRef.current.openingKey}
          assistantTourRestartKey={assistantTourRestartKey}
        />
      )}

      {/* Area principal */}
      {/* Runtime-sensitive hook: ConfirmDeleteItemModal locks this scroll root. */}
      <main
        data-dashboard-scroll-root="true"
        className={`${mainBaseClass} ${mainScrollClass}`}
        style={mainStyle}
      >
        {children}
      </main>
    </div>
  );
}
