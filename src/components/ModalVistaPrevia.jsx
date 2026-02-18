import { useEffect, useRef, useState } from "react";
import { Monitor, Smartphone, X } from "lucide-react";

const MOBILE_VIEWPORT_WIDTH = 390;
const MOBILE_VIEWPORT_HEIGHT = 844;
const DESKTOP_VIEWPORT_WIDTH = 1280;
const DESKTOP_VIEWPORT_HEIGHT = 820;

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function PreviewFrame({
  htmlContent,
  iframeKey,
  iframeTitle,
  scale,
  viewportWidth,
  viewportHeight,
  scaledWidth,
  scaledHeight,
}) {
  return (
    <div
      className="overflow-hidden bg-white"
      style={{
        width: scaledWidth,
        height: scaledHeight,
      }}
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
            title={iframeTitle}
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
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-fuchsia-600 border-t-transparent" />
              <span className="text-sm">Generando vista previa...</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function ModalVistaPrevia({ visible, onClose, htmlContent, publicUrl }) {
  const [iframeKey, setIframeKey] = useState(0);
  const [windowHeight, setWindowHeight] = useState(820);
  const [windowWidth, setWindowWidth] = useState(0);
  const [stageWidth, setStageWidth] = useState(0);
  const stageRef = useRef(null);

  useEffect(() => {
    if (!visible) return;
    setIframeKey((k) => k + 1);
  }, [visible]);

  useEffect(() => {
    if (!visible || typeof document === "undefined" || typeof window === "undefined") return;

    const previousOverflow = document.body.style.overflow;
    const onKeyDown = (event) => {
      if (event.key === "Escape") onClose?.();
    };
    const onResize = () => {
      setWindowHeight(window.innerHeight || 820);
      setWindowWidth(window.innerWidth || 0);
    };

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

  const previewUrl = String(publicUrl || "").trim() || "https://reservaeldia.com.ar/i/....";

  const safeStageWidth = Math.max(stageWidth || windowWidth - 64, 320);
  const sideBySide = safeStageWidth >= 1020 || windowWidth >= 1240;

  const desktopWidthBudget = sideBySide
    ? Math.max(560, safeStageWidth - 300)
    : Math.max(320, safeStageWidth - 28);
  const desktopHeightBudget = sideBySide
    ? Math.max(280, windowHeight - 280)
    : Math.max(260, windowHeight - 430);

  const desktopScale = clamp(
    Math.min(
      1,
      desktopWidthBudget / DESKTOP_VIEWPORT_WIDTH,
      desktopHeightBudget / DESKTOP_VIEWPORT_HEIGHT
    ),
    0.2,
    1
  );

  const desktopScaledWidth = Math.round(DESKTOP_VIEWPORT_WIDTH * desktopScale);
  const desktopScaledHeight = Math.round(DESKTOP_VIEWPORT_HEIGHT * desktopScale);

  const mobileWidthBudget = sideBySide
    ? Math.min(350, Math.max(220, safeStageWidth * 0.3))
    : Math.min(420, Math.max(220, safeStageWidth - 56));
  const mobileHeightBudget = sideBySide
    ? Math.max(280, windowHeight - 360)
    : Math.max(280, windowHeight - 410);

  const mobileScale = clamp(
    Math.min(
      1,
      mobileWidthBudget / MOBILE_VIEWPORT_WIDTH,
      mobileHeightBudget / MOBILE_VIEWPORT_HEIGHT
    ),
    0.32,
    1
  );

  const mobileScaledWidth = Math.round(MOBILE_VIEWPORT_WIDTH * mobileScale);
  const mobileScaledHeight = Math.round(MOBILE_VIEWPORT_HEIGHT * mobileScale);

  const overlayPhone = sideBySide && safeStageWidth >= 1220;
  const phoneOffsetX = overlayPhone ? Math.round(Math.min(120, desktopScaledWidth * 0.18)) : 0;
  const phoneOffsetY = overlayPhone ? Math.round(Math.min(120, desktopScaledHeight * 0.24)) : 0;

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-sm">
      <div className="flex h-full w-full items-center justify-center p-2 sm:p-5">
        <div className="flex h-full w-full max-w-[1540px] flex-col overflow-hidden rounded-2xl border border-slate-700/80 bg-slate-950 text-white shadow-[0_40px_120px_rgba(2,6,23,0.75)]">
          <div className="flex items-center justify-between gap-3 border-b border-slate-700/80 bg-slate-950/90 px-3 py-3 sm:px-4">
            <div className="min-w-0">
              <p className="text-sm font-semibold sm:text-base">Vista previa</p>
              <p className="truncate text-[11px] text-slate-300 sm:text-xs">{previewUrl}</p>
            </div>

            <div className="flex items-center gap-2">
              <div className="hidden items-center gap-2 text-[11px] text-slate-300 sm:flex">
                <span className="inline-flex items-center gap-1 rounded-md border border-slate-600 bg-slate-900/80 px-2 py-1">
                  <Monitor className="h-3.5 w-3.5" />
                  Escritorio
                </span>
                <span className="inline-flex items-center gap-1 rounded-md border border-slate-600 bg-slate-900/80 px-2 py-1">
                  <Smartphone className="h-3.5 w-3.5" />
                  Movil
                </span>
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

          <div
            ref={stageRef}
            className="flex-1 overflow-auto px-2 py-4 sm:px-5 sm:py-8"
            style={{
              background:
                "radial-gradient(circle at 12% 0%, rgba(56,189,248,0.18), rgba(2,6,23,0.96) 40%), radial-gradient(circle at 86% 90%, rgba(251,146,60,0.15), rgba(2,6,23,0.2) 42%)",
            }}
          >
            <div
              className={`mx-auto flex max-w-[1400px] ${
                sideBySide ? "items-end justify-center gap-8" : "flex-col items-center gap-6"
              }`}
            >
              <div className="relative">
                <div className="absolute -inset-5 rounded-[34px] bg-sky-400/20 blur-2xl" />

                <div className="relative rounded-[28px] border border-slate-600/70 bg-slate-900/90 p-4 shadow-[0_35px_85px_rgba(2,6,23,0.65)]">
                  <div className="mb-3 flex items-center justify-between">
                    <div className="flex items-center gap-2 px-1">
                      <span className="h-2.5 w-2.5 rounded-full bg-red-400/90" />
                      <span className="h-2.5 w-2.5 rounded-full bg-amber-400/90" />
                      <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/90" />
                    </div>
                    <span className="inline-flex items-center gap-1 rounded-md border border-slate-600 bg-slate-900/80 px-2 py-1 text-[10px] text-slate-300">
                      <Monitor className="h-3 w-3" />
                      Escritorio
                    </span>
                  </div>

                  <div
                    className="mx-auto overflow-hidden rounded-xl border border-slate-400/70 bg-white shadow-xl"
                    style={{ width: desktopScaledWidth, height: desktopScaledHeight }}
                  >
                    <PreviewFrame
                      htmlContent={htmlContent}
                      iframeKey={`desktop-${iframeKey}`}
                      iframeTitle="Vista previa escritorio"
                      scale={desktopScale}
                      viewportWidth={DESKTOP_VIEWPORT_WIDTH}
                      viewportHeight={DESKTOP_VIEWPORT_HEIGHT}
                      scaledWidth={desktopScaledWidth}
                      scaledHeight={desktopScaledHeight}
                    />
                  </div>
                </div>

                <div className="mx-auto h-3 w-44 rounded-b-xl bg-slate-700/90" />
                <div className="mx-auto mt-1 h-2 w-64 rounded-full bg-slate-800/90" />
              </div>

              <div
                className="relative"
                style={overlayPhone ? { marginLeft: -phoneOffsetX, marginTop: phoneOffsetY } : undefined}
              >
                <div className="absolute -inset-4 rounded-[42px] bg-fuchsia-400/20 blur-2xl" />

                <div className="relative rounded-[38px] border-[10px] border-slate-900 bg-slate-950 p-2.5 shadow-[0_30px_70px_rgba(2,6,23,0.7)]">
                  <div className="mb-2 flex items-center justify-center gap-2">
                    <span className="h-1.5 w-14 rounded-full bg-slate-700" />
                    <span className="h-1.5 w-1.5 rounded-full bg-slate-600" />
                  </div>

                  <div
                    className="overflow-hidden rounded-[26px] border border-slate-700 bg-white"
                    style={{ width: mobileScaledWidth, height: mobileScaledHeight }}
                  >
                    <PreviewFrame
                      htmlContent={htmlContent}
                      iframeKey={`mobile-${iframeKey}`}
                      iframeTitle="Vista previa movil"
                      scale={mobileScale}
                      viewportWidth={MOBILE_VIEWPORT_WIDTH}
                      viewportHeight={MOBILE_VIEWPORT_HEIGHT}
                      scaledWidth={mobileScaledWidth}
                      scaledHeight={mobileScaledHeight}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="border-t border-slate-700 px-3 py-2 text-[11px] text-slate-300 sm:px-4 sm:text-xs">
            Vista escritorio ({DESKTOP_VIEWPORT_WIDTH}px) y movil ({MOBILE_VIEWPORT_WIDTH}px)
          </div>
        </div>
      </div>
    </div>
  );
}
