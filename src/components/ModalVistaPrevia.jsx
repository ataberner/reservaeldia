import { useEffect, useRef, useState } from "react";
import {
  ExternalLink,
  Link2,
  Maximize2,
  Monitor,
  RefreshCw,
  Smartphone,
  X,
} from "lucide-react";
import { captureCountdownAuditFromHtmlString } from "@/domain/countdownAudit/runtime";
import {
  computeModalVistaPreviaLayout,
  DESKTOP_VIEWPORT_HEIGHT,
  DESKTOP_VIEWPORT_WIDTH,
  MOBILE_VIEWPORT_HEIGHT,
  MOBILE_VIEWPORT_WIDTH,
} from "@/components/preview/modalVistaPreviaLayout";
import PublishValidationSummary from "@/components/preview/PublishValidationSummary";

const SECONDARY_TOOLBAR_BUTTON_CLASS =
  "inline-flex h-10 items-center justify-center gap-1.5 rounded-full border border-[#ddd2f5] bg-white/90 px-3 text-sm font-medium text-[#6f3bc0] shadow-[0_8px_20px_rgba(15,23,42,0.05)] transition hover:bg-[#f4ecff] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#dfcaf8]";

const ICON_TOOLBAR_BUTTON_CLASS =
  "inline-flex h-10 w-10 items-center justify-center rounded-full border border-[#ddd2f5] bg-white/92 text-[#6f3bc0] shadow-[0_8px_20px_rgba(15,23,42,0.05)] transition hover:bg-[#f4ecff] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#dfcaf8]";

function applyPreviewFrameScale(event, scale, previewViewport = "") {
  const safeScale = Number(scale);
  const frameDocument = event?.target?.contentDocument;
  const frameWindow = event?.target?.contentWindow;
  if (!frameDocument || !Number.isFinite(safeScale) || safeScale <= 0) return;

  const scaleValue = String(safeScale);
  const viewportValue = String(previewViewport || "").trim().toLowerCase();
  frameDocument.documentElement?.setAttribute?.("data-preview-scale", scaleValue);
  frameDocument.body?.setAttribute?.("data-preview-scale", scaleValue);
  if (viewportValue) {
    frameDocument.documentElement?.setAttribute?.("data-preview-viewport", viewportValue);
    frameDocument.body?.setAttribute?.("data-preview-viewport", viewportValue);
  }

  try {
    frameDocument.documentElement.style.scrollbarWidth = "none";
    frameDocument.documentElement.style.msOverflowStyle = "none";
    frameDocument.body.style.scrollbarWidth = "none";
    frameDocument.body.style.msOverflowStyle = "none";
    if (viewportValue === "mobile") {
      frameDocument.documentElement.style.height = "auto";
      frameDocument.documentElement.style.minHeight = "100%";
      frameDocument.documentElement.style.overflowX = "hidden";
      frameDocument.documentElement.style.overflowY = "auto";
      frameDocument.documentElement.style.overscrollBehavior = "contain";
      frameDocument.documentElement.style.overscrollBehaviorY = "contain";
      frameDocument.documentElement.style.scrollBehavior = "auto";
      frameDocument.body.style.height = "auto";
      frameDocument.body.style.minHeight = "100%";
      frameDocument.body.style.overflowX = "hidden";
      frameDocument.body.style.overflowY = "hidden";
      frameDocument.body.style.overscrollBehavior = "none";
      frameDocument.body.style.overscrollBehaviorY = "none";
    }

    const styleId = "preview-frame-hide-scrollbars";
    let styleNode = frameDocument.getElementById(styleId);
    if (!styleNode) {
      styleNode = frameDocument.createElement("style");
      styleNode.id = styleId;
      styleNode.textContent = `
        html[data-preview-viewport="mobile"] {
          height: auto !important;
          min-height: 100% !important;
          overflow-x: hidden !important;
          overflow-y: auto !important;
          overscroll-behavior: contain !important;
          overscroll-behavior-y: contain !important;
          scroll-behavior: auto !important;
        }
        body[data-preview-viewport="mobile"] {
          height: auto !important;
          min-height: 100% !important;
          overflow-x: hidden !important;
          overflow-y: hidden !important;
          overscroll-behavior: none !important;
          overscroll-behavior-y: none !important;
        }
        html::-webkit-scrollbar,
        body::-webkit-scrollbar {
          display: none !important;
          width: 0 !important;
          height: 0 !important;
        }
      `;
      frameDocument.head?.appendChild(styleNode);
    }
  } catch (_error) {
    // noop
  }

  try {
    if (frameWindow) {
      frameWindow.__previewScale = safeScale;
      frameWindow.__previewViewportKind = viewportValue;
      frameWindow.dispatchEvent(new frameWindow.Event("preview:mobile-scroll:enable"));
    }
  } catch (_error) {
    // noop
  }

  if (!frameWindow?.requestAnimationFrame) return;
  frameWindow.requestAnimationFrame(() => {
    try {
      frameWindow.dispatchEvent(new frameWindow.Event("resize"));
    } catch (_error) {
      // noop
    }
  });
}

function PreviewFrame({
  htmlContent,
  iframeKey,
  iframeTitle,
  scale,
  viewportWidth,
  viewportHeight,
  scaledWidth,
  scaledHeight,
  onLoad,
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
            onLoad={(event) => {
              onLoad?.({
                event,
                scale,
              });
            }}
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
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-[#773dbe] border-t-transparent" />
              <span className="text-sm">Generando vista previa...</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function PreviewLinkChip({
  text,
  href = "",
  clickable = false,
  className = "",
}) {
  const Component = clickable ? "a" : "div";
  const safeText = String(text || "").trim();

  return (
    <Component
      {...(clickable
        ? {
            href,
            target: "_blank",
            rel: "noreferrer",
          }
        : {})}
      className={`inline-flex h-9 min-w-0 max-w-full items-center gap-2 rounded-full border border-[#e3d8f6] bg-white/84 px-2.5 text-slate-700 shadow-[0_8px_20px_rgba(15,23,42,0.05)] backdrop-blur-sm ${
        clickable
          ? "transition hover:border-[#d4c2f1] hover:bg-[#faf6ff]"
          : ""
      } ${className}`}
      title={safeText}
    >
      <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-[#e7ddfa] bg-[#faf6ff] text-[#6f3bc0]">
        <Link2 className="h-3.5 w-3.5" />
      </span>
      <span className="min-w-0 flex-1 truncate text-[12px] font-medium sm:text-[13px]">
        {safeText}
      </span>
      {clickable ? (
        <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-[#e7ddfa] bg-white text-[#6f3bc0]">
          <ExternalLink className="h-3 w-3" />
        </span>
      ) : null}
    </Component>
  );
}

function DesktopPreviewShell({
  cardWidth,
  cardHeight,
  frameWidth,
  frameHeight,
  htmlContent,
  iframeKey,
  onLoad,
  scale,
  variant = "compact",
  showFrameLabel = false,
}) {
  const isShowcase = variant === "showcase";
  const shellClass = isShowcase
    ? "bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(249,244,255,0.96))] shadow-[0_32px_80px_rgba(111,59,192,0.18)]"
    : variant === "stacked"
      ? "bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(251,248,255,0.96))] shadow-[0_16px_38px_rgba(111,59,192,0.12)]"
      : "bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(250,246,255,0.96))] shadow-[0_22px_52px_rgba(111,59,192,0.14)]";

  return (
    <div className="relative max-w-full" style={{ width: cardWidth, height: cardHeight }}>
      <div
        className={`absolute inset-0 overflow-hidden rounded-[28px] border border-white/75 ${shellClass}`}
      >
        <div className="absolute inset-x-0 top-0 flex h-[28px] items-center justify-between px-3">
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-[#ccb9ef]" />
            <span className="h-2 w-2 rounded-full bg-[#bed8fb]" />
            <span className="h-2 w-2 rounded-full bg-[#caecef]" />
          </div>
          {showFrameLabel ? (
            <span className="rounded-full border border-[#e5daf8] bg-white/82 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-[#6f3bc0]">
              Escritorio
            </span>
          ) : null}
        </div>

        <div
          className="absolute bottom-[6px] left-[6px] right-[6px] top-[28px] overflow-hidden rounded-[18px] border border-[#e4daf7] bg-white"
        >
          <PreviewFrame
            htmlContent={htmlContent}
            iframeKey={iframeKey}
            iframeTitle="Vista previa escritorio"
            scale={scale}
            viewportWidth={DESKTOP_VIEWPORT_WIDTH}
            viewportHeight={DESKTOP_VIEWPORT_HEIGHT}
            scaledWidth={frameWidth}
            scaledHeight={frameHeight}
            onLoad={onLoad}
          />
        </div>
      </div>
    </div>
  );
}

function MobilePreviewShell({
  cardWidth,
  cardHeight,
  frameWidth,
  frameHeight,
  htmlContent,
  iframeKey,
  onLoad,
  scale,
  variant = "compact",
}) {
  const shellClass =
    variant === "showcase"
      ? "shadow-[0_26px_54px_rgba(111,59,192,0.18)]"
      : variant === "stacked"
        ? "shadow-[0_14px_32px_rgba(111,59,192,0.14)]"
        : "shadow-[0_18px_38px_rgba(111,59,192,0.16)]";

  return (
    <div className="relative max-w-full" style={{ width: cardWidth, height: cardHeight }}>
      <div
        className={`absolute inset-0 overflow-hidden rounded-[34px] border border-[#d9cbed] bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(247,242,255,0.96))] ${shellClass}`}
        style={{ borderWidth: 6 }}
      >
        <div className="absolute left-1/2 top-[4px] h-[5px] w-16 -translate-x-1/2 rounded-full bg-[#baa8d8]" />
        <div className="absolute right-[18px] top-[5px] h-[5px] w-[5px] rounded-full bg-[#ab98cb]" />

        <div
          className="absolute bottom-[6px] left-[6px] right-[6px] top-[10px] overflow-hidden rounded-[23px] border border-[#dfd4f1] bg-white"
        >
          <PreviewFrame
            htmlContent={htmlContent}
            iframeKey={iframeKey}
            iframeTitle="Vista previa movil"
            scale={scale}
            viewportWidth={MOBILE_VIEWPORT_WIDTH}
            viewportHeight={MOBILE_VIEWPORT_HEIGHT}
            scaledWidth={frameWidth}
            scaledHeight={frameHeight}
            onLoad={onLoad}
          />
        </div>
      </div>
    </div>
  );
}

export default function ModalVistaPrevia({
  visible,
  onClose,
  htmlContent,
  publicUrl,
  previewDisplayUrl = "",
  onPublish,
  showPublishActions = true,
  publishing = false,
  publishError = "",
  publishSuccess = "",
  publishedUrl = "",
  checkoutVisible = false,
  publishValidation = null,
  publishValidationPending = false,
}) {
  const [iframeKey, setIframeKey] = useState(0);
  const [fullscreenPreview, setFullscreenPreview] = useState(false);
  const [fullscreenIframeKey, setFullscreenIframeKey] = useState(0);
  const [windowHeight, setWindowHeight] = useState(820);
  const [windowWidth, setWindowWidth] = useState(0);
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 });
  const stageRef = useRef(null);

  useEffect(() => {
    if (!visible) return;
    setIframeKey((k) => k + 1);
  }, [visible]);

  useEffect(() => {
    if (visible) return;
    setFullscreenPreview(false);
  }, [visible]);

  useEffect(() => {
    if (!fullscreenPreview) return;
    setFullscreenIframeKey((k) => k + 1);
  }, [fullscreenPreview]);

  useEffect(() => {
    if (!visible || typeof document === "undefined" || typeof window === "undefined") return;

    const previousOverflow = document.body.style.overflow;
    const onKeyDown = (event) => {
      if (event.key !== "Escape") return;
      if (fullscreenPreview) {
        event.preventDefault();
        setFullscreenPreview(false);
        return;
      }
      onClose?.();
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
  }, [visible, onClose, fullscreenPreview]);

  useEffect(() => {
    if (!visible || typeof window === "undefined") return;
    const target = stageRef.current;
    if (!target) return;

    const measure = () => {
      setStageSize({
        width: target.clientWidth || 0,
        height: target.clientHeight || 0,
      });
    };

    measure();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", measure);
      return () => window.removeEventListener("resize", measure);
    }

    const observer = new ResizeObserver((entries) => {
      const rect = entries?.[0]?.contentRect;
      if (!rect) {
        measure();
        return;
      }

      setStageSize({
        width: rect.width || target.clientWidth || 0,
        height: rect.height || target.clientHeight || 0,
      });
    });
    observer.observe(target);

    return () => observer.disconnect();
  }, [visible]);

  const previewUrl =
    String(previewDisplayUrl || "").trim() || "https://reservaeldia.com.ar/i/...";
  const confirmedPublicUrl = String(publishedUrl || publicUrl || "").trim();
  const yaPublicada = Boolean(confirmedPublicUrl);
  const isMobileViewport = windowWidth > 0 ? windowWidth < 768 : false;
  const layout = computeModalVistaPreviaLayout({
    stageWidth: stageSize.width,
    stageHeight: stageSize.height,
    fallbackWidth: Math.max(windowWidth - 32, 320),
    fallbackHeight: Math.max(windowHeight - 180, 380),
  });
  const toolbarInline = layout.toolbarMode === "inline";
  const desktopVariant =
    layout.mode === "showcase-overlap"
      ? "showcase"
      : layout.mode === "stacked-priority"
        ? "stacked"
        : "compact";
  const mobileVariant =
    layout.mode === "showcase-overlap"
      ? "showcase"
      : layout.mode === "stacked-priority"
        ? "stacked"
        : "compact";

  const confirmarPublicacion = () => {
    if (!showPublishActions) return;
    if (typeof onPublish !== "function" || publishing) return;
    onPublish();
  };

  const abrirPantallaCompleta = () => {
    if (!htmlContent) return;
    setFullscreenPreview(true);
  };

  const cerrarPantallaCompleta = () => {
    setFullscreenPreview(false);
  };

  const handleDesktopLoad = ({ event, scale }) => {
    if (!htmlContent) return;
    applyPreviewFrameScale(event, scale, "desktop");
    captureCountdownAuditFromHtmlString(htmlContent, {
      stage: showPublishActions
        ? "draft-preview-desktop"
        : "template-preview-desktop",
      renderer: "dom-generated",
      sourceDocument: "preview-modal",
      viewport: "desktop",
      wrapperScale: scale,
      usesRasterThumbnail: false,
    });
  };

  const handleMobileLoad = ({ event, scale }) => {
    if (!htmlContent) return;
    applyPreviewFrameScale(event, scale, "mobile");
    captureCountdownAuditFromHtmlString(htmlContent, {
      stage: showPublishActions
        ? "draft-preview-mobile"
        : "template-preview-mobile",
      renderer: "dom-generated",
      sourceDocument: "preview-modal",
      viewport: "mobile",
      wrapperScale: scale,
      usesRasterThumbnail: false,
    });
  };

  const desktopPreview = (
    <DesktopPreviewShell
      cardWidth={layout.desktopCardWidth}
      cardHeight={layout.desktopCardHeight}
      frameWidth={layout.desktopFrame.scaledWidth}
      frameHeight={layout.desktopFrame.scaledHeight}
      htmlContent={htmlContent}
      iframeKey={`desktop-${iframeKey}`}
      scale={layout.desktopFrame.scale}
      variant={desktopVariant}
      showFrameLabel={layout.mode !== "stacked-priority"}
      onLoad={handleDesktopLoad}
    />
  );

  const mobilePreview = (
    <MobilePreviewShell
      cardWidth={layout.mobileCardWidth}
      cardHeight={layout.mobileCardHeight}
      frameWidth={layout.mobileFrame.scaledWidth}
      frameHeight={layout.mobileFrame.scaledHeight}
      htmlContent={htmlContent}
      iframeKey={`mobile-${iframeKey}`}
      scale={layout.mobileFrame.scale}
      variant={mobileVariant}
      onLoad={handleMobileLoad}
    />
  );

  if (!visible) return null;
  if (fullscreenPreview) {
    return (
      <div className="fixed inset-0 z-[10000] bg-white">
        <button
          type="button"
          onClick={cerrarPantallaCompleta}
          className="absolute left-1/2 top-3 z-20 inline-flex -translate-x-1/2 items-center justify-center rounded-full border border-[#d9cbed] bg-white/95 p-2 text-[#6f3bc0] shadow-[0_10px_24px_rgba(111,59,192,0.24)] backdrop-blur hover:bg-[#f4ecff] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#dfcaf8]"
          aria-label="Salir de pantalla completa"
          title="Salir de pantalla completa (Esc)"
        >
          <X className="h-4 w-4" />
        </button>

        {htmlContent ? (
          <iframe
            key={`fullscreen-${fullscreenIframeKey}`}
            srcDoc={htmlContent}
            sandbox="allow-scripts allow-same-origin"
            title={
              isMobileViewport
                ? "Vista previa movil en pantalla completa"
                : "Vista previa escritorio en pantalla completa"
            }
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
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-[#773dbe] border-t-transparent" />
              <span className="text-sm">Generando vista previa...</span>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[9999] bg-[rgba(247,244,255,0.68)] backdrop-blur-[6px]">
      <div className="flex h-full w-full items-center justify-center p-2 sm:p-5">
        <div className="flex h-full w-full max-w-[1560px] flex-col overflow-hidden rounded-[30px] border border-[#e9dcfb] bg-[linear-gradient(180deg,#ffffff_0%,#fbf8ff_34%,#f5f9ff_100%)] text-slate-800 shadow-[0_30px_84px_rgba(111,59,192,0.18)]">
          <div className="shrink-0 border-b border-[#e7dcf8]/90 bg-[linear-gradient(180deg,rgba(255,255,255,0.95)_0%,rgba(250,246,255,0.92)_100%)]">
            <div className="px-3 py-2.5 sm:px-4 sm:py-3">
              <div
                className={
                  toolbarInline
                    ? "flex items-center gap-3"
                    : "flex flex-col gap-2.5"
                }
              >
                <div
                  className={
                    toolbarInline
                      ? "flex min-w-0 flex-1 items-center gap-3"
                      : "space-y-1.5"
                  }
                >
                  <span className="inline-flex h-8 shrink-0 items-center rounded-full border border-[#e5d8f8] bg-white/92 px-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#6f3bc0] shadow-[0_6px_18px_rgba(15,23,42,0.04)]">
                    Vista previa
                  </span>

                  {showPublishActions ? (
                    <PreviewLinkChip
                      text={previewUrl}
                      href={confirmedPublicUrl}
                      clickable={yaPublicada}
                      className={
                        toolbarInline
                          ? "min-w-0 max-w-[min(52vw,680px)] flex-1"
                          : "w-full"
                      }
                    />
                  ) : null}
                </div>

                {toolbarInline ? (
                  <div className="flex shrink-0 items-center gap-2">
                    {showPublishActions ? (
                      <button
                        type="button"
                        onClick={confirmarPublicacion}
                        disabled={publishing || !htmlContent || checkoutVisible}
                        className={`inline-flex h-10 items-center justify-center gap-2 rounded-full px-4 text-sm font-semibold text-white transition-all ${
                          publishing || !htmlContent || checkoutVisible
                            ? "cursor-not-allowed bg-[#bda5e6]"
                            : "bg-gradient-to-r from-[#874fce] via-[#7741bf] to-[#6532b2] shadow-[0_14px_26px_rgba(111,59,192,0.28)] ring-1 ring-[#ceb8ef] hover:from-[#7d47c4] hover:via-[#6f3bbc] hover:to-[#5f2ea6] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#dfcaf8] focus-visible:ring-offset-1"
                        }`}
                      >
                        {yaPublicada && !publishing && !checkoutVisible ? (
                          <RefreshCw className="h-4 w-4" />
                        ) : null}
                        {publishing
                          ? yaPublicada
                            ? "Actualizando..."
                            : "Publicando..."
                          : checkoutVisible
                            ? "Checkout abierto"
                            : yaPublicada
                              ? "Actualizar invitacion"
                              : "Publicar invitacion"}
                      </button>
                    ) : null}

                    <button
                      type="button"
                      onClick={abrirPantallaCompleta}
                      disabled={!htmlContent}
                      className={`${SECONDARY_TOOLBAR_BUTTON_CLASS} ${
                        htmlContent
                          ? ""
                          : "cursor-not-allowed border-[#ece4fb] bg-[#fbf9ff] text-[#ab93d2] shadow-none hover:bg-[#fbf9ff]"
                      }`}
                      aria-label="Abrir vista previa en pantalla completa"
                      title={`Abrir vista previa en pantalla completa (${isMobileViewport ? "movil" : "escritorio"})`}
                    >
                      <Maximize2 className="h-4 w-4" />
                      <span>Pantalla completa</span>
                    </button>

                    <button
                      type="button"
                      onClick={onClose}
                      className={ICON_TOOLBAR_BUTTON_CLASS}
                      aria-label="Cerrar vista previa"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    {showPublishActions ? (
                      <button
                        type="button"
                        onClick={confirmarPublicacion}
                        disabled={publishing || !htmlContent || checkoutVisible}
                        className={`inline-flex h-10 w-full items-center justify-center gap-2 rounded-full px-4 text-sm font-semibold text-white transition-all ${
                          publishing || !htmlContent || checkoutVisible
                            ? "cursor-not-allowed bg-[#bda5e6]"
                            : "bg-gradient-to-r from-[#874fce] via-[#7741bf] to-[#6532b2] shadow-[0_14px_26px_rgba(111,59,192,0.26)] ring-1 ring-[#ceb8ef] hover:from-[#7d47c4] hover:via-[#6f3bbc] hover:to-[#5f2ea6] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#dfcaf8] focus-visible:ring-offset-1"
                        }`}
                      >
                        {yaPublicada && !publishing && !checkoutVisible ? (
                          <RefreshCw className="h-4 w-4" />
                        ) : null}
                        {publishing
                          ? yaPublicada
                            ? "Actualizando..."
                            : "Publicando..."
                          : checkoutVisible
                            ? "Checkout abierto"
                            : yaPublicada
                              ? "Actualizar invitacion"
                              : "Publicar invitacion"}
                      </button>
                    ) : null}

                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={abrirPantallaCompleta}
                        disabled={!htmlContent}
                        className={`${SECONDARY_TOOLBAR_BUTTON_CLASS} ${
                          htmlContent
                            ? ""
                            : "cursor-not-allowed border-[#ece4fb] bg-[#fbf9ff] text-[#ab93d2] shadow-none hover:bg-[#fbf9ff]"
                        }`}
                        aria-label="Abrir vista previa en pantalla completa"
                        title={`Abrir vista previa en pantalla completa (${isMobileViewport ? "movil" : "escritorio"})`}
                      >
                        <Maximize2 className="h-4 w-4" />
                        {!layout.isCompactToolbar ? (
                          <span>Pantalla completa</span>
                        ) : null}
                      </button>

                      <button
                        type="button"
                        onClick={onClose}
                        className={ICON_TOOLBAR_BUTTON_CLASS}
                        aria-label="Cerrar vista previa"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {showPublishActions && publishError ? (
                <p className="mt-2 text-[12px] font-medium text-red-600">{publishError}</p>
              ) : null}
              {showPublishActions && publishSuccess ? (
                <p className="mt-2 text-[12px] font-medium text-emerald-700">{publishSuccess}</p>
              ) : null}
              {showPublishActions ? (
                <PublishValidationSummary
                  validation={publishValidation}
                  pending={publishValidationPending}
                />
              ) : null}
            </div>
          </div>

          <div ref={stageRef} className="relative flex-1 min-h-0 overflow-hidden">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_10%_16%,rgba(232,214,255,0.95),rgba(255,255,255,0)_34%),radial-gradient(circle_at_82%_20%,rgba(224,238,255,0.82),rgba(255,255,255,0)_28%),radial-gradient(circle_at_78%_84%,rgba(243,247,255,0.92),rgba(255,255,255,0)_40%),radial-gradient(circle_at_30%_78%,rgba(248,235,255,0.55),rgba(255,255,255,0)_32%)]" />
            <div className="absolute inset-0 bg-[linear-gradient(125deg,rgba(255,255,255,0.9)_0%,rgba(251,247,255,0.72)_46%,rgba(244,248,255,0.78)_100%)]" />
            <div className="absolute inset-x-[12%] bottom-[6%] h-[32%] rounded-full bg-[radial-gradient(ellipse_at_center,rgba(255,255,255,0.7),rgba(255,255,255,0)_72%)] blur-3xl" />

            {layout.mode === "showcase-overlap" ? (
              <div
                className="relative flex h-full items-center justify-center"
                style={{
                  padding: `${layout.stagePaddingY}px ${layout.stagePaddingX}px`,
                }}
              >
                <div className="relative" style={{ width: layout.sceneWidth, height: layout.sceneHeight }}>
                  <div className="absolute -inset-8 rounded-[48px] bg-[radial-gradient(circle_at_22%_22%,rgba(235,220,255,0.56),rgba(255,255,255,0)_54%),radial-gradient(circle_at_86%_82%,rgba(217,233,255,0.48),rgba(255,255,255,0)_52%)] blur-3xl" />
                  <div className="absolute left-0 top-0">{desktopPreview}</div>
                  <div
                    className="absolute"
                    style={{ left: layout.mobileLeft, top: layout.mobileTop }}
                  >
                    {mobilePreview}
                  </div>
                </div>
              </div>
            ) : layout.mode === "dual-column-compact" ? (
              <div
                className="relative grid h-full min-h-0 items-center"
                style={{
                  padding: `${layout.stagePaddingY}px ${layout.stagePaddingX}px`,
                  gap: layout.gap,
                  gridTemplateColumns: `minmax(0,1fr) ${layout.mobileColumnWidth}px`,
                }}
              >
                <div className="flex min-h-0 min-w-0 items-center justify-center">
                  {desktopPreview}
                </div>
                <div className="flex min-h-0 min-w-0 items-center justify-center">
                  {mobilePreview}
                </div>
              </div>
            ) : (
              <div
                className="relative grid h-full min-h-0 justify-items-center"
                style={{
                  padding: `${layout.stagePaddingY}px ${layout.stagePaddingX}px`,
                  gap: layout.gap,
                  gridTemplateRows: `${layout.desktopSlotHeight}px ${layout.mobileSlotHeight}px`,
                }}
              >
                <div className="flex min-h-0 min-w-0 w-full items-center justify-center">
                  {desktopPreview}
                </div>
                <div className="flex min-h-0 min-w-0 w-full items-center justify-center">
                  {mobilePreview}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
