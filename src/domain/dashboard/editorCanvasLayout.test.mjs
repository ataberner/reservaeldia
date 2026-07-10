import test from "node:test";
import assert from "node:assert/strict";

import {
  DASHBOARD_EDITOR_CANVAS_GAP_PX,
  DASHBOARD_EDITOR_CANVAS_INITIAL_INSET_LEFT_PX,
  DASHBOARD_SIDEBAR_DESKTOP_PANEL_LEFT_PX,
  DASHBOARD_SIDEBAR_DESKTOP_PANEL_WIDTH_PX,
  createDashboardSidebarPanelLayout,
  createInitialEditorSidebarPanelLayout,
  resolveEditorCanvasSidebarInsetLeft,
  resolveEditorSidebarAutoOpenDraftKey,
  shouldAutoOpenEditorSidebar,
} from "./editorCanvasLayout.js";

test("editor sidebar auto-open key resolves from the active editor document", () => {
  assert.equal(
    resolveEditorSidebarAutoOpenDraftKey({
      slugInvitacion: "draft-1",
      editorSession: { kind: "draft", id: "draft-2" },
      modoSelector: false,
    }),
    "draft-1"
  );

  assert.equal(
    resolveEditorSidebarAutoOpenDraftKey({
      editorSession: { kind: "template", id: "template-1" },
      modoSelector: false,
    }),
    "template-1"
  );

  assert.equal(
    shouldAutoOpenEditorSidebar({
      slugInvitacion: "draft-1",
      modoSelector: true,
    }),
    false
  );
});

test("initial editor sidebar layout reserves the desktop panel area", () => {
  assert.deepEqual(
    createInitialEditorSidebarPanelLayout({
      shouldPin: true,
      botonActivo: "detalles",
    }),
    {
      pinned: true,
      offsetLeft: DASHBOARD_EDITOR_CANVAS_INITIAL_INSET_LEFT_PX,
      panelLeft: DASHBOARD_SIDEBAR_DESKTOP_PANEL_LEFT_PX,
      panelWidth: DASHBOARD_SIDEBAR_DESKTOP_PANEL_WIDTH_PX,
      panelRight:
        DASHBOARD_SIDEBAR_DESKTOP_PANEL_LEFT_PX +
        DASHBOARD_SIDEBAR_DESKTOP_PANEL_WIDTH_PX,
      botonActivo: "detalles",
    }
  );
});

test("canvas sidebar inset applies only to visible pinned desktop layouts", () => {
  const pinnedLayout = createInitialEditorSidebarPanelLayout({ shouldPin: true });

  assert.equal(
    resolveEditorCanvasSidebarInsetLeft(pinnedLayout, {
      isMobileViewport: false,
      sidebarHidden: false,
    }),
    DASHBOARD_EDITOR_CANVAS_INITIAL_INSET_LEFT_PX
  );

  assert.equal(
    resolveEditorCanvasSidebarInsetLeft(pinnedLayout, {
      isMobileViewport: true,
      sidebarHidden: false,
    }),
    0
  );

  assert.equal(
    resolveEditorCanvasSidebarInsetLeft(pinnedLayout, {
      isMobileViewport: false,
      sidebarHidden: true,
    }),
    0
  );

  assert.equal(
    resolveEditorCanvasSidebarInsetLeft(
      createDashboardSidebarPanelLayout({ pinned: false }),
      { isMobileViewport: false, sidebarHidden: false }
    ),
    0
  );
});

test("canvas sidebar inset can derive from panelRight when offsetLeft is missing", () => {
  const layout = createDashboardSidebarPanelLayout({
    pinned: true,
    panelRight: 680,
    offsetLeft: 0,
  });

  assert.equal(
    resolveEditorCanvasSidebarInsetLeft(layout, {
      isMobileViewport: false,
      sidebarHidden: false,
    }),
    680 + DASHBOARD_EDITOR_CANVAS_GAP_PX
  );
});
