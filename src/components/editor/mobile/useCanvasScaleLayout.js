import useViewportScale from "@/hooks/useViewportScale";

// Mobile portrait uses a narrower logical gutter than desktop zoom 0.8.
export const MOBILE_PORTRAIT_WRAPPER_BASE_WIDTH_ZOOM_08 = 1040;

export default function useCanvasScaleLayout({
  contenedorRef,
  zoom,
  baseDesktop = 800,
  suspendResizeSync = false,
}) {
  return useViewportScale({
    contenedorRef,
    zoom,
    baseDesktop,
    baseMobilePortrait: 1000,
    wrapperBaseWidthZoom1: 1000,
    wrapperBaseWidthZoom08: MOBILE_PORTRAIT_WRAPPER_BASE_WIDTH_ZOOM_08,
    fitBoost: 1.2,
    zoomVisualBoost: 1.15,
    suspendResizeSync,
    debug: false,
  });
}

