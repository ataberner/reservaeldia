export const DASHBOARD_SIDEBAR_PANEL_LAYOUT_EVENT =
  "dashboard-sidebar-panel-layout-change";

export const DASHBOARD_SIDEBAR_MOBILE_BREAKPOINT_PX = 768;
export const DASHBOARD_SIDEBAR_DESKTOP_PANEL_LEFT_PX = 197;
export const DASHBOARD_SIDEBAR_DESKTOP_PANEL_WIDTH_PX = 435;
export const DASHBOARD_EDITOR_CANVAS_GAP_PX = 16;
export const DASHBOARD_EDITOR_CANVAS_TRANSITION_MS = 220;

export const DASHBOARD_SIDEBAR_DESKTOP_PANEL_RIGHT_PX =
  DASHBOARD_SIDEBAR_DESKTOP_PANEL_LEFT_PX +
  DASHBOARD_SIDEBAR_DESKTOP_PANEL_WIDTH_PX;

export const DASHBOARD_EDITOR_CANVAS_INITIAL_INSET_LEFT_PX =
  DASHBOARD_SIDEBAR_DESKTOP_PANEL_RIGHT_PX + DASHBOARD_EDITOR_CANVAS_GAP_PX;

function normalizeNumber(value, fallback = 0) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : fallback;
}

export function createDashboardSidebarPanelLayout(detail = {}) {
  const panelLeft = normalizeNumber(
    detail.panelLeft,
    DASHBOARD_SIDEBAR_DESKTOP_PANEL_LEFT_PX
  );
  const panelWidth = normalizeNumber(
    detail.panelWidth,
    DASHBOARD_SIDEBAR_DESKTOP_PANEL_WIDTH_PX
  );
  const defaultPanelRight = panelLeft + panelWidth;
  const pinned = detail.pinned === true;
  const panelRight = pinned
    ? normalizeNumber(detail.panelRight, defaultPanelRight)
    : normalizeNumber(detail.panelRight, defaultPanelRight);
  const offsetLeft = pinned
    ? normalizeNumber(
        detail.offsetLeft,
        panelRight + DASHBOARD_EDITOR_CANVAS_GAP_PX
      )
    : 0;

  return {
    pinned,
    offsetLeft,
    panelLeft,
    panelWidth,
    panelRight,
    botonActivo: pinned ? detail.botonActivo || null : null,
  };
}

export function resolveEditorSidebarAutoOpenDraftKey({
  slugInvitacion = "",
  editorSession = null,
  modoSelector = false,
} = {}) {
  if (modoSelector) return "";

  return String(
    slugInvitacion ||
      editorSession?.slug ||
      editorSession?.id ||
      ""
  ).trim();
}

export function shouldAutoOpenEditorSidebar(options = {}) {
  return Boolean(resolveEditorSidebarAutoOpenDraftKey(options));
}

export function createInitialEditorSidebarPanelLayout({
  shouldPin = false,
  botonActivo = null,
} = {}) {
  if (!shouldPin) {
    return createDashboardSidebarPanelLayout();
  }

  return createDashboardSidebarPanelLayout({
    pinned: true,
    offsetLeft: DASHBOARD_EDITOR_CANVAS_INITIAL_INSET_LEFT_PX,
    panelLeft: DASHBOARD_SIDEBAR_DESKTOP_PANEL_LEFT_PX,
    panelWidth: DASHBOARD_SIDEBAR_DESKTOP_PANEL_WIDTH_PX,
    panelRight: DASHBOARD_SIDEBAR_DESKTOP_PANEL_RIGHT_PX,
    botonActivo,
  });
}

export function resolveEditorCanvasSidebarInsetLeft(
  layoutState = {},
  { isMobileViewport = false, sidebarHidden = false } = {}
) {
  if (sidebarHidden || isMobileViewport || layoutState?.pinned !== true) {
    return 0;
  }

  const offsetLeft = normalizeNumber(layoutState.offsetLeft, 0);
  if (offsetLeft > 0) return Math.max(0, offsetLeft);

  const panelRight = normalizeNumber(
    layoutState.panelRight,
    DASHBOARD_SIDEBAR_DESKTOP_PANEL_RIGHT_PX
  );
  return Math.max(0, panelRight + DASHBOARD_EDITOR_CANVAS_GAP_PX);
}

export function isEditorCanvasMobileViewport(win) {
  if (!win || typeof win.matchMedia !== "function") return false;

  const compactWidth = win.matchMedia("(max-width: 640px)").matches;
  const tabletWidth = win.matchMedia("(max-width: 1024px)").matches;
  const coarsePointer = win.matchMedia("(pointer: coarse)").matches;

  return compactWidth || (coarsePointer && tabletWidth);
}

export function readDashboardSidebarPanelLayout(win) {
  if (!win || !win.__dashboardSidebarPanelLayout) {
    return createDashboardSidebarPanelLayout();
  }

  return createDashboardSidebarPanelLayout(win.__dashboardSidebarPanelLayout);
}
