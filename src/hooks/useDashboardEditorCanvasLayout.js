import { useEffect, useMemo, useState } from "react";
import {
  DASHBOARD_EDITOR_CANVAS_GAP_PX,
  DASHBOARD_EDITOR_CANVAS_TRANSITION_MS,
  DASHBOARD_SIDEBAR_PANEL_LAYOUT_EVENT,
  createDashboardSidebarPanelLayout,
  createInitialEditorSidebarPanelLayout,
  isEditorCanvasMobileViewport,
  readDashboardSidebarPanelLayout,
  resolveEditorCanvasSidebarInsetLeft,
  resolveEditorSidebarAutoOpenDraftKey,
} from "@/domain/dashboard/editorCanvasLayout";
import { getAssistantStep } from "@/domain/editor/assistantMode";

function readIsMobileViewport() {
  if (typeof window === "undefined") return false;
  return isEditorCanvasMobileViewport(window);
}

function resolveInitialLayout({
  editorKey,
  isMobileViewport,
  sidebarHidden,
} = {}) {
  return createInitialEditorSidebarPanelLayout({
    shouldPin: Boolean(editorKey) && !sidebarHidden && !isMobileViewport,
    botonActivo: getAssistantStep(0)?.id || null,
  });
}

export default function useDashboardEditorCanvasLayout({
  slugInvitacion = "",
  editorSession = null,
  modoSelector = false,
  sidebarHidden = false,
} = {}) {
  const currentEditorKey = resolveEditorSidebarAutoOpenDraftKey({
    slugInvitacion,
    editorSession,
    modoSelector,
  });
  const [isMobileViewport, setIsMobileViewport] = useState(readIsMobileViewport);
  const [publishedLayout, setPublishedLayout] = useState(() =>
    typeof window === "undefined"
      ? createDashboardSidebarPanelLayout()
      : readDashboardSidebarPanelLayout(window)
  );
  const [publishedEditorKey, setPublishedEditorKey] = useState("");

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const syncViewport = () => {
      setIsMobileViewport(isEditorCanvasMobileViewport(window));
    };

    syncViewport();

    const mediaQueries = [
      window.matchMedia("(max-width: 640px)"),
      window.matchMedia("(max-width: 1024px)"),
      window.matchMedia("(pointer: coarse)"),
    ];

    mediaQueries.forEach((query) => {
      query.addEventListener?.("change", syncViewport);
    });
    window.addEventListener("resize", syncViewport);
    window.addEventListener("orientationchange", syncViewport);

    return () => {
      mediaQueries.forEach((query) => {
        query.removeEventListener?.("change", syncViewport);
      });
      window.removeEventListener("resize", syncViewport);
      window.removeEventListener("orientationchange", syncViewport);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const syncPublishedLayoutFromSidebar = (event) => {
      const nextLayout = createDashboardSidebarPanelLayout(
        event?.detail || window.__dashboardSidebarPanelLayout || {}
      );
      setPublishedLayout(nextLayout);
      setPublishedEditorKey(currentEditorKey);
    };

    const syncPublishedLayoutFromWindow = () => {
      setPublishedLayout(readDashboardSidebarPanelLayout(window));
    };

    window.addEventListener(
      DASHBOARD_SIDEBAR_PANEL_LAYOUT_EVENT,
      syncPublishedLayoutFromSidebar
    );
    window.addEventListener("resize", syncPublishedLayoutFromWindow);

    return () => {
      window.removeEventListener(
        DASHBOARD_SIDEBAR_PANEL_LAYOUT_EVENT,
        syncPublishedLayoutFromSidebar
      );
      window.removeEventListener("resize", syncPublishedLayoutFromWindow);
    };
  }, [currentEditorKey]);

  const effectiveLayout = useMemo(() => {
    if (!currentEditorKey || sidebarHidden) {
      return createDashboardSidebarPanelLayout();
    }

    if (publishedEditorKey !== currentEditorKey) {
      return resolveInitialLayout({
        editorKey: currentEditorKey,
        isMobileViewport,
        sidebarHidden,
      });
    }

    return publishedLayout;
  }, [
    currentEditorKey,
    isMobileViewport,
    publishedEditorKey,
    publishedLayout,
    sidebarHidden,
  ]);

  const sidebarInsetLeft = resolveEditorCanvasSidebarInsetLeft(effectiveLayout, {
    isMobileViewport,
    sidebarHidden,
  });

  return {
    sidebarInsetLeft,
    sidebarPaddingRight: sidebarInsetLeft ? DASHBOARD_EDITOR_CANVAS_GAP_PX : 0,
    sidebarTransitionMs: DASHBOARD_EDITOR_CANVAS_TRANSITION_MS,
    isMobileViewport,
    sidebarLayout: effectiveLayout,
  };
}
