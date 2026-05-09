import useViewportScale from "@/hooks/useViewportScale";

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
    wrapperBaseWidthZoom08: 1220,
    fitBoost: 1.2,
    zoomVisualBoost: 1.15,
    suspendResizeSync,
    debug: false,
  });
}

