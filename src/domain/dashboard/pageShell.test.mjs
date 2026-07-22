import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  buildDashboardCanvasEditorProps,
  buildDashboardLayoutProps,
  buildDashboardPageViewState,
  buildDashboardPreviewGateState,
} from "./pageShell.js";

function readSource(relativeUrl) {
  return readFileSync(new URL(relativeUrl, import.meta.url), "utf8");
}

test("page view state preserves current dashboard branch precedence", () => {
  assert.deepEqual(
    buildDashboardPageViewState({
      slugInvitacion: null,
      vista: "home",
      isResolvingEditorRoute: false,
      isSuperAdmin: false,
      legacyDraftNotice: {
        title: "Legacy",
      },
      adminDraftView: {
        enabled: true,
        status: "loading",
      },
    }),
    {
      hasActiveEditor: false,
      isHomeView: true,
      showLegacyDraftNotice: true,
      showAdminDraftLoadingNotice: true,
      showPublicationsView: false,
      showTrashView: false,
      showManagementView: false,
      showEditorView: false,
    }
  );

  assert.deepEqual(
    buildDashboardPageViewState({
      slugInvitacion: null,
      vista: "home",
      isResolvingEditorRoute: true,
      isSuperAdmin: false,
    }),
    {
      hasActiveEditor: false,
      isHomeView: false,
      showLegacyDraftNotice: false,
      showAdminDraftLoadingNotice: false,
      showPublicationsView: false,
      showTrashView: false,
      showManagementView: false,
      showEditorView: false,
    }
  );

  assert.deepEqual(
    buildDashboardPageViewState({
      slugInvitacion: "draft-1",
      vista: "gestion",
      isResolvingEditorRoute: false,
      isSuperAdmin: true,
    }),
    {
      hasActiveEditor: true,
      isHomeView: false,
      showLegacyDraftNotice: false,
      showAdminDraftLoadingNotice: false,
      showPublicationsView: false,
      showTrashView: false,
      showManagementView: false,
      showEditorView: true,
    }
  );
});

test("layout prop shaping preserves current shell flags and display-name fallback order", () => {
  const setSlugInvitacion = () => {};
  const setModoEditor = () => {};
  const toggleZoom = () => {};
  const generarVistaPrevia = () => {};
  const setVista = () => {};
  const ensureDraftFlushBeforeCriticalAction = () => {};
  const handleOpenTemplateSession = () => {};
  const onAssistantTourPreferenceChange = () => {};

  const props = buildDashboardLayoutProps({
    slugInvitacion: null,
    setSlugInvitacion,
    setModoEditor,
    zoom: 0.8,
    toggleZoom,
    historialExternos: ["a", "b"],
    futurosExternos: ["c"],
    generarVistaPrevia,
    usuario: {
      uid: "user-1",
    },
    vista: "home",
    setVista,
    canManageSite: true,
    isSuperAdmin: false,
    loadingAdminAccess: false,
    isEditorReadOnly: false,
    isResolvingEditorRoute: false,
    shouldRenderHomeStartupLoader: true,
    editorPreloadState: {
      slug: "draft-1",
      status: "done",
    },
    editorRuntimeState: {
      slug: "draft-1",
      status: "running",
    },
    showEditorStartupLoader: true,
    shouldRenderEditorStartupLoader: true,
    isEditorStartupLoaderExiting: false,
    templatePreviewModalVisible: false,
    adminDraftView: {
      draftName: "",
    },
    templateWorkspaceView: {
      draftName: "Template workspace",
    },
    editorSession: {
      kind: "draft",
      id: "draft-1",
    },
    ensureDraftFlushBeforeCriticalAction,
    handleOpenTemplateSession,
    seccionActivaId: null,
    assistantTourEditorReady: true,
    assistantTourPreferencesLoaded: true,
    assistantTourOptOut: false,
    assistantTourSaving: true,
    onAssistantTourPreferenceChange,
    assistantTourPreviewOpen: true,
  });

  assert.deepEqual(props, {
    mostrarMiniToolbar: false,
    seccionActivaId: null,
    modoSelector: true,
    slugInvitacion: null,
    setSlugInvitacion,
    setModoEditor,
    zoom: 0.8,
    toggleZoom,
    historialExternos: ["a", "b"],
    futurosExternos: ["c"],
    generarVistaPrevia,
    usuario: {
      uid: "user-1",
    },
    vista: "home",
    onCambiarVista: setVista,
    ocultarSidebar: false,
    canManageSite: true,
    isSuperAdmin: false,
    loadingAdminAccess: false,
    lockMainScroll: true,
    editorPreloadState: {
      slug: "draft-1",
      status: "done",
    },
    editorRuntimeState: {
      slug: "draft-1",
      status: "running",
    },
    showEditorStartupLoader: true,
    shouldRenderEditorStartupLoader: true,
    isEditorStartupLoaderExiting: false,
    editorReadOnly: false,
    draftDisplayName: "Template workspace",
    editorSession: {
      kind: "draft",
      id: "draft-1",
    },
    templateSessionMeta: {
      draftName: "Template workspace",
    },
    ensureEditorFlushBeforeAction: ensureDraftFlushBeforeCriticalAction,
    onOpenTemplateSession: handleOpenTemplateSession,
    assistantTourEditorReady: true,
    assistantTourPreferencesLoaded: true,
    assistantTourOptOut: false,
    assistantTourSaving: true,
    onAssistantTourPreferenceChange,
    assistantTourPreviewOpen: true,
  });

  assert.equal(
    buildDashboardLayoutProps({
      vista: "publicadas",
      isEditorReadOnly: false,
      isResolvingEditorRoute: false,
    }).ocultarSidebar,
    true
  );

  assert.equal(
    buildDashboardLayoutProps({
      slugInvitacion: "draft-1",
      vista: "editor",
      isEditorReadOnly: true,
      adminDraftView: {
        draftName: "Admin name",
      },
      templateWorkspaceView: {
        draftName: "Template name",
      },
    }).draftDisplayName,
    "Admin name"
  );
});

test("editor startup uses one shell-level overlay for sidebar and canvas", () => {
  const layoutSource = readSource("../../components/DashboardLayout.jsx");
  const dashboardSource = readSource("../../pages/dashboard.js");
  const startupHookSource = readSource("../../hooks/useDashboardStartupLoaders.js");
  const editorRouteSource = readSource("../../hooks/useDashboardEditorRoute.js");
  const startupLoaderSource = readSource(
    "../../components/editor/EditorStartupLoader.jsx"
  );
  const combinedSource = [
    layoutSource,
    dashboardSource,
    startupHookSource,
    editorRouteSource,
    startupLoaderSource,
  ].join("\n");

  assert.equal(
    (combinedSource.match(/<EditorStartupLoader\b/g) || []).length,
    1
  );
  assert.match(
    layoutSource,
    /renderEditorStartupOverlay\s*=\s*showEditorStartupLoader\s*\|\|\s*shouldRenderEditorStartupLoader/
  );
  assert.match(
    layoutSource,
    /fixed bottom-0 left-0 right-0 z-\[46\][\s\S]*?style=\{\{ top: headerHeight \}\}/
  );
  assert.match(
    layoutSource,
    /<DashboardSidebar[\s\S]*?assistantTourEditorReady=\{resolvedAssistantTourEditorReady\}/
  );
  assert.match(
    layoutSource,
    /<main[\s\S]*?aria-hidden=\{showEditorStartupLoader \? "true" : undefined\}[\s\S]*?inert=\{showEditorStartupLoader \? true : undefined\}/
  );
  assert.match(
    dashboardSource,
    /showEditorStartupLoader\s*\?\s*"pointer-events-none invisible"\s*:\s*"visible"/
  );
  assert.match(
    dashboardSource,
    /useDashboardStartupLoaders\(\{[\s\S]*?isResolvingEditorRoute,/
  );
  assert.match(
    startupHookSource,
    /showEditorStartupLoaderRaw\s*=\s*isResolvingEditorRoute === true \|\|[\s\S]*?Boolean\(slugInvitacion\) && !editorRuntimeReady/
  );
  assert.doesNotMatch(dashboardSource, /<EditorStartupLoader\b/);
  assert.doesNotMatch(combinedSource, /Abriendo plantilla interna/);
  assert.doesNotMatch(dashboardSource, /showRouteResolvingView/);
  assert.doesNotMatch(startupLoaderSource, /\[preloadState\.slug\]/);
});

test("canvas editor props preserve current read-only and initial-data precedence", () => {
  const setHistorialExternos = () => {};
  const setFuturosExternos = () => {};
  const handleEditorStartupStatusChange = () => {};

  assert.deepEqual(
    buildDashboardCanvasEditorProps({
      slugInvitacion: "draft-1",
      editorSession: {
        kind: "draft",
        id: "draft-1",
      },
      zoom: 1,
      setHistorialExternos,
      setFuturosExternos,
      usuarioUid: "user-1",
      handleEditorStartupStatusChange,
      canManageSite: true,
      isAdminReadOnlyView: true,
      isEditorReadOnly: true,
      adminDraftView: {
        draftData: {
          slug: "draft-1",
        },
      },
      templateWorkspaceView: {
        initialData: {
          slug: "template-1",
        },
      },
    }),
    {
      slug: "draft-1",
      editorSession: {
        kind: "draft",
        id: "draft-1",
      },
      zoom: 1,
      onHistorialChange: setHistorialExternos,
      onFuturosChange: setFuturosExternos,
      userId: "user-1",
      secciones: [],
      onStartupStatusChange: handleEditorStartupStatusChange,
      canManageSite: false,
      readOnly: true,
      initialDraftData: {
        slug: "draft-1",
      },
      initialEditorData: {
        slug: "draft-1",
      },
    }
  );

  assert.equal(
    buildDashboardCanvasEditorProps({
      canManageSite: true,
      isAdminReadOnlyView: false,
      isEditorReadOnly: false,
      templateWorkspaceView: {
        initialData: {
          slug: "template-1",
        },
      },
    }).initialEditorData.slug,
    "template-1"
  );
});

test("preview gate state keeps template sessions from exposing publish and checkout actions", () => {
  assert.deepEqual(
    buildDashboardPreviewGateState({
      isTemplateEditorSession: false,
      mostrarCheckoutPublicacion: true,
    }),
    {
      canPublishFromPreview: true,
      previewCheckoutVisible: true,
      checkoutModalVisible: true,
    }
  );

  assert.deepEqual(
    buildDashboardPreviewGateState({
      isTemplateEditorSession: true,
      mostrarCheckoutPublicacion: true,
    }),
    {
      canPublishFromPreview: false,
      previewCheckoutVisible: false,
      checkoutModalVisible: false,
    }
  );
});
