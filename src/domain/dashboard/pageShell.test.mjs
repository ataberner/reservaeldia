import test from "node:test";
import assert from "node:assert/strict";

import {
  buildDashboardCanvasEditorProps,
  buildDashboardLayoutProps,
  buildDashboardPageViewState,
  buildDashboardPreviewGateState,
} from "./pageShell.js";

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
      showRouteResolvingView: false,
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
      showRouteResolvingView: true,
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
      showRouteResolvingView: false,
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
