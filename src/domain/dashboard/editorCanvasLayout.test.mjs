import test from "node:test";
import assert from "node:assert/strict";

import {
  DASHBOARD_EDITOR_CANVAS_GAP_PX,
  DASHBOARD_EDITOR_CANVAS_INITIAL_INSET_LEFT_PX,
  DASHBOARD_SIDEBAR_DESKTOP_NAV_WIDTH_PX,
  DASHBOARD_SIDEBAR_DESKTOP_PANEL_LEFT_PX,
  DASHBOARD_SIDEBAR_DESKTOP_PANEL_WIDTH_PX,
  SECTION_DESIGN_PANEL_CANVAS_INSET_RIGHT_PX,
  SECTION_DESIGN_PANEL_DESKTOP_WIDTH_PX,
  createDashboardSidebarPanelLayout,
  createInitialEditorSidebarPanelLayout,
  resolveEditorCanvasAvailableBounds,
  resolveEditorCanvasSidebarInsetLeft,
  resolveEditorSidebarAutoOpenDraftKey,
  resolveSectionDesignCanvasInsetRight,
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
      navigationRight: DASHBOARD_SIDEBAR_DESKTOP_NAV_WIDTH_PX,
      panelLeft: DASHBOARD_SIDEBAR_DESKTOP_PANEL_LEFT_PX,
      panelWidth: DASHBOARD_SIDEBAR_DESKTOP_PANEL_WIDTH_PX,
      panelRight:
        DASHBOARD_SIDEBAR_DESKTOP_PANEL_LEFT_PX +
        DASHBOARD_SIDEBAR_DESKTOP_PANEL_WIDTH_PX,
      botonActivo: "detalles",
    }
  );
});

test("canvas sidebar inset reserves the visible desktop navigation and expanded panel", () => {
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
    DASHBOARD_SIDEBAR_DESKTOP_NAV_WIDTH_PX +
      DASHBOARD_EDITOR_CANVAS_GAP_PX
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

test("section design panel uses one narrower width authority and desktop-only canvas inset", () => {
  assert.equal(SECTION_DESIGN_PANEL_DESKTOP_WIDTH_PX, 376);
  assert.ok(
    SECTION_DESIGN_PANEL_DESKTOP_WIDTH_PX <
      DASHBOARD_SIDEBAR_DESKTOP_PANEL_WIDTH_PX
  );
  assert.equal(
    resolveSectionDesignCanvasInsetRight({
      open: true,
      isMobileViewport: false,
    }),
    SECTION_DESIGN_PANEL_CANVAS_INSET_RIGHT_PX
  );
  assert.equal(
    resolveSectionDesignCanvasInsetRight({
      open: true,
      isMobileViewport: true,
    }),
    0
  );
  assert.equal(resolveSectionDesignCanvasInsetRight({ open: false }), 0);
});

test("canvas center is derived from the unobscured interval between navigation and design panel", () => {
  const viewportWidth = 1440;
  const leftInset =
    DASHBOARD_SIDEBAR_DESKTOP_NAV_WIDTH_PX +
    DASHBOARD_EDITOR_CANVAS_GAP_PX;
  const rightInset = SECTION_DESIGN_PANEL_CANVAS_INSET_RIGHT_PX;
  const bounds = resolveEditorCanvasAvailableBounds({
    viewportWidth,
    leftInset,
    rightInset,
  });

  assert.deepEqual(bounds, {
    left: leftInset,
    right: viewportWidth - rightInset,
    width: viewportWidth - leftInset - rightInset,
    center: leftInset + (viewportWidth - leftInset - rightInset) / 2,
  });
  assert.ok(bounds.left > DASHBOARD_SIDEBAR_DESKTOP_NAV_WIDTH_PX);
  assert.ok(
    bounds.right <
      viewportWidth - SECTION_DESIGN_PANEL_DESKTOP_WIDTH_PX
  );
});
