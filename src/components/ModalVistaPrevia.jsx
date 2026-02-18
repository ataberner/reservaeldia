import { useEffect, useRef, useState } from "react";
import { Monitor, Smartphone, X } from "lucide-react";

const MOBILE_VIEWPORT_WIDTH = 390;
const MOBILE_VIEWPORT_HEIGHT = 844;
const DESKTOP_VIEWPORT_WIDTH = 1280;
const DESKTOP_VIEWPORT_HEIGHT = 820;

export default function ModalVistaPrevia({ visible, onClose, htmlContent, slug }) {
  const [previewMode, setPreviewMode] = useState("desktop");
  const [iframeKey, setIframeKey] = useState(0);
  const [windowHeight, setWindowHeight] = useState(820);
  const [stageWidth, setStageWidth] = useState(0);
  const stageRef = useRef(null);

  useEffect(() => {
    if (!visible || typeof window === "undefined") return;
    setPreviewMode(window.innerWidth <= 768 ? "mobile" : "desktop");
    setIframeKey((k) => k + 1);
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    setIframeKey((k) => k + 1);
  }, [previewMode, visible]);

  useEffect(() => {
    if (!visible || typeof document === "undefined" || typeof window === "undefined") return;

    const previousOverflow = document.body.style.overflow;
    const onKeyDown = (event) => {
      if (event.key === "Escape") onClose?.();
    };
    const onResize = () => setWindowHeight(window.innerHeight || 820);

    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", onResize);
    onResize();

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", onResize);
    };
  }, [visible, onClose]);

  useEffect(() => {
    if (!visible || typeof window === "undefined") return;
    const target = stageRef.current;
    if (!target) return;

    setStageWidth(target.clientWidth || 0);

    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      const nextWidth = entries?.[0]?.contentRect?.width || 0;
      setStageWidth(nextWidth);
    });
    observer.observe(target);

    return () => observer.disconnect();
  }, [visible]);

  const isMobilePreview = previewMode === "mobile";
  const viewportWidth = isMobilePreview ? MOBILE_VIEWPORT_WIDTH : DESKTOP_VIEWPORT_WIDTH;
  const preferredHeight = isMobilePreview ? MOBILE_VIEWPORT_HEIGHT : DESKTOP_VIEWPORT_HEIGHT;
  const viewportHeight = Math.max(420, Math.min(preferredHeight, windowHeight - 220));
  const availableWidth = Math.max(0, stageWidth - 24);
  const scale =
    !availableWidth || availableWidth >= viewportWidth
      ? 1
      : Math.max(0.2, availableWidth / viewportWidth);

  const scaledWidth = Math.round(viewportWidth * scale);
  const scaledHeight = Math.round(viewportHeight * scale);
  const previewUrl = slug
    ? `https://reservaeldia.com.ar/i/${slug}`
    : "https://reservaeldia.com.ar/i/";

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-[9999] bg-black/75 backdrop-blur-sm">
      <div className="flex h-full w-full items-center justify-center p-2 sm:p-6">
        <div className="flex h-full w-full max-w-[1400px] flex-col overflow-hidden rounded-2xl border border-slate-700 bg-slate-950 text-white shadow-2xl">
          <div className="flex items-center justify-between gap-3 border-b border-slate-700 px-3 py-3 sm:px-4">
            <div className="min-w-0">
              <p className="text-sm font-semibold sm:text-base">Vista previa</p>
              <p className="truncate text-[11px] text-slate-300 sm:text-xs">{previewUrl}</p>
            </div>

            <div className="flex items-center gap-2">
              <div className="inline-flex rounded-lg border border-slate-600 bg-slate-900 p-1">
                <button
                  type="button"
                  onClick={() => setPreviewMode("desktop")}
                  className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs sm:px-3 sm:text-sm ${
                    !isMobilePreview
                      ? "bg-white text-slate-900"
                      : "text-slate-200 hover:bg-slate-800"
                  }`}
                >
                  <Monitor className="h-3.5 w-3.5" />
                  Escritorio
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewMode("mobile")}
                  className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs sm:px-3 sm:text-sm ${
                    isMobilePreview
                      ? "bg-white text-slate-900"
                      : "text-slate-200 hover:bg-slate-800"
                  }`}
                >
                  <Smartphone className="h-3.5 w-3.5" />
                  Mobile
                </button>
              </div>

              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-slate-600 p-2 text-slate-200 hover:bg-slate-800"
                aria-label="Cerrar vista previa"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div ref={stageRef} className="flex-1 overflow-auto bg-slate-900 p-2 sm:p-5">
            <div className="mx-auto" style={{ width: scaledWidth, height: scaledHeight }}>
              <div
                className="overflow-hidden rounded-xl border border-slate-300 bg-white shadow-xl"
                style={{ width: scaledWidth, height: scaledHeight }}
              >
                <div
                  style={{
                    width: viewportWidth,
                    height: viewportHeight,
                    transform: `scale(${scale})`,
                    transformOrigin: "top left",
                  }}
                >
                  {htmlContent ? (
                    <iframe
                      key={iframeKey}
                      srcDoc={htmlContent}
                      sandbox="allow-scripts allow-same-origin"
                      title="Vista previa"
                      style={{
                        width: "100%",
                        height: "100%",
                        border: "none",
                        display: "block",
                      }}
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center bg-slate-50">
                      <div className="flex items-center gap-3 text-slate-600">
                        <div className="h-5 w-5 animate-spin rounded-full border-2 border-purple-600 border-t-transparent" />
                        <span className="text-sm">Generando vista previa...</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="border-t border-slate-700 px-3 py-2 text-[11px] text-slate-300 sm:px-4 sm:text-xs">
            {isMobilePreview
              ? `Modo mobile (${MOBILE_VIEWPORT_WIDTH}px)`
              : `Modo escritorio (${DESKTOP_VIEWPORT_WIDTH}px)`}
          </div>
        </div>
      </div>
    </div>
  );
}
