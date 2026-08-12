import { useEffect, useMemo, useRef, useState } from "react";
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
import { buildPreviewPublishNoticePresentation } from "@/domain/dashboard/previewValidationPresentation";
import {
  computeModalVistaPreviaLayout,
  computeModalVistaPreviaSingleViewportLayout,
  DESKTOP_VIEWPORT_HEIGHT,
  DESKTOP_VIEWPORT_WIDTH,
  MOBILE_VIEWPORT_HEIGHT,
  MOBILE_VIEWPORT_WIDTH,
  PREVIEW_MODAL_VIEWPORTS,
} from "@/components/preview/modalVistaPreviaLayout";
import {
  applyPreviewFrameScale,
  buildPreviewFrameSrcDoc,
  observePreviewFrameReadiness,
  observePreviewFrameTiming,
  PREVIEW_FRAME_SCROLL_AUTHORITIES,
  resolvePreviewFrameLayoutMode,
} from "@/components/preview/previewFrameRuntime";
import {
  markPreviewTimingSurfaceReady,
  recordPreviewTimingStage,
  setPreviewTimingExpectedSurfaces,
} from "@/domain/dashboard/previewTiming";
import PreviewPublishNoticeLayer from "@/components/preview/PreviewPublishNoticeLayer";
import PreviewLoadingPresentation from "@/components/preview/PreviewLoadingPresentation";

const SECONDARY_TOOLBAR_BUTTON_CLASS =
  "inline-flex h-10 items-center justify-center gap-1.5 rounded-full border border-[#ddd2f5] bg-white/90 px-3 text-sm font-medium text-[#6f3bc0] shadow-[0_8px_20px_rgba(15,23,42,0.05)] transition hover:bg-[#f4ecff] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#dfcaf8]";

const ICON_TOOLBAR_BUTTON_CLASS =
  "inline-flex h-10 w-10 items-center justify-center rounded-full border border-[#ddd2f5] bg-white/92 text-[#6f3bc0] shadow-[0_8px_20px_rgba(15,23,42,0.05)] transition hover:bg-[#f4ecff] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#dfcaf8]";

const MOBILE_VIEWPORT_TOGGLE_OPTIONS = [
  {
    value: PREVIEW_MODAL_VIEWPORTS.MOBILE,
    label: "Movil",
    Icon: Smartphone,
  },
  {
    value: PREVIEW_MODAL_VIEWPORTS.DESKTOP,
    label: "Desktop",
    Icon: Monitor,
  },
];

const PREVIEW_FRAME_TIMING_LABELS = Object.freeze({
  "iframe-runtime-bootstrap": "Bootstrap runtime del iframe",
  "dom-content-loaded": "Iframe DOMContentLoaded",
  "critical-resources-loaded": "Recursos criticos cargados",
  "critical-fonts-ready": "Fuentes criticas listas",
  "critical-fonts-error": "Error cargando fuentes criticas",
  "critical-image-ready": "Imagen critica lista",
  "runtime-initialization-start": "Inicio runtime invitacion",
  "runtime-initialized": "Runtime invitacion inicializado",
  "invitation-runtime-ready": "Evento invitation-runtime-ready",
  "invitation-runtime-failed": "Error runtime invitacion",
  "invitation-loader-hidden-emitted":
    "Emision invitation-loader-hidden",
});

function readPreviewPerformanceNow() {
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now();
  }
  return 0;
}

function PreviewIframeDocument({
  htmlContent,
  iframeTitle,
  previewViewport,
  previewLayoutMode,
  previewSurface = "",
  scrollAuthority = PREVIEW_FRAME_SCROLL_AUTHORITIES.DOCUMENT,
  previewTimingSessionId = "",
  timingSurface = "",
  onMount,
  onLoad,
  loading = false,
  style,
}) {
  const iframeRef = useRef(null);
  const onMountRef = useRef(onMount);
  onMountRef.current = onMount;
  const srcDocResult = useMemo(() => {
    const transformStartedAt = previewTimingSessionId
      ? readPreviewPerformanceNow()
      : 0;
    const srcDoc = buildPreviewFrameSrcDoc(htmlContent, {
        previewViewport,
        layoutMode: previewLayoutMode,
        previewSurface,
        scrollAuthority,
        previewTiming: previewTimingSessionId
          ? {
              sessionId: previewTimingSessionId,
              surface: timingSurface,
            }
          : null,
      });
    return {
      srcDoc,
      transformDurationMs: previewTimingSessionId
        ? readPreviewPerformanceNow() - transformStartedAt
        : 0,
    };
  }, [
    htmlContent,
    previewLayoutMode,
    previewSurface,
    previewTimingSessionId,
    previewViewport,
    scrollAuthority,
    timingSurface,
  ]);

  useEffect(() => {
    if (!previewTimingSessionId || !srcDocResult.srcDoc) return;
    recordPreviewTimingStage(previewTimingSessionId, {
      stage: "build-preview-frame-srcdoc",
      label: "Transformacion buildPreviewFrameSrcDoc",
      durationMs: srcDocResult.transformDurationMs,
      source: "react",
      viewport: previewViewport,
      surface: timingSurface,
      htmlBytes: String(srcDocResult.srcDoc || "").length,
      recordKey: `build-preview-frame-srcdoc:${timingSurface}`,
    });
  }, [
    previewTimingSessionId,
    previewViewport,
    srcDocResult,
    timingSurface,
  ]);

  useEffect(() => {
    if (!iframeRef.current || !srcDocResult.srcDoc) return;
    onMountRef.current?.(iframeRef.current);
  }, [srcDocResult.srcDoc]);

  return (
    <iframe
      ref={iframeRef}
      srcDoc={srcDocResult.srcDoc}
      sandbox="allow-scripts allow-same-origin"
      title={iframeTitle}
      onLoad={onLoad}
      aria-hidden={loading ? "true" : undefined}
      tabIndex={loading ? -1 : undefined}
      style={style}
    />
  );
}

function PreviewDocumentSurface({
  htmlContent,
  iframeTitle,
  previewViewport,
  previewLayoutMode,
  onLoad,
  previewSurface = "",
  previewTimingSessionId = "",
  timingSurface = "",
  scrollAuthority = PREVIEW_FRAME_SCROLL_AUTHORITIES.DOCUMENT,
  announceLoading = true,
  iframeStyle,
}) {
  const [readyHtmlContent, setReadyHtmlContent] = useState(null);
  const readinessCleanupRef = useRef(null);
  const timingCleanupRef = useRef(null);
  const frameTimingRef = useRef(null);
  const readyReasonRef = useRef("");
  const frameReady = Boolean(
    htmlContent && readyHtmlContent === htmlContent
  );

  if (htmlContent && frameTimingRef.current?.htmlContent !== htmlContent) {
    frameTimingRef.current = {
      htmlContent,
      startedAt: readPreviewPerformanceNow(),
      mountedAt: null,
      iframeLoadedAt: null,
    };
  } else if (!htmlContent && frameTimingRef.current) {
    frameTimingRef.current = null;
  }

  useEffect(() => {
    const cleanupCurrentReadiness = () => {
      readinessCleanupRef.current?.();
      readinessCleanupRef.current = null;
      timingCleanupRef.current?.();
      timingCleanupRef.current = null;
    };

    cleanupCurrentReadiness();
    return cleanupCurrentReadiness;
  }, [htmlContent, previewTimingSessionId]);

  useEffect(() => {
    if (!frameReady || !previewTimingSessionId) return;
    const surface = timingSurface || previewSurface || previewViewport;
    recordPreviewTimingStage(previewTimingSessionId, {
      stage: "external-loader-hidden",
      label: "Ocultamiento loader externo",
      source: "react",
      viewport: previewViewport,
      surface,
      reason: readyReasonRef.current,
      recordKey: `external-loader-hidden:${surface}`,
    });
    markPreviewTimingSurfaceReady(previewTimingSessionId, {
      surface,
      viewport: previewViewport,
      reason: readyReasonRef.current,
    });
  }, [
    frameReady,
    previewSurface,
    previewTimingSessionId,
    previewViewport,
    timingSurface,
  ]);

  const handleIframeMount = () => {
    const timing = frameTimingRef.current;
    const mountedAt = readPreviewPerformanceNow();
    if (timing?.htmlContent === htmlContent) {
      timing.mountedAt = mountedAt;
    }
    const surface = timingSurface || previewSurface || previewViewport;
    recordPreviewTimingStage(previewTimingSessionId, {
      stage: "iframe-mounted",
      label: "Montaje iframe",
      startedAt: timing?.startedAt,
      completedAt: mountedAt,
      source: "iframe",
      viewport: previewViewport,
      surface,
      recordKey: `iframe-mounted:${surface}`,
    });
  };

  const handleIframeLoad = (event) => {
    const iframe = event.currentTarget;
    const loadedDocument = iframe?.contentDocument || null;
    const timing = frameTimingRef.current;
    const loadedAt = readPreviewPerformanceNow();
    if (timing && timing.htmlContent === htmlContent) {
      timing.iframeLoadedAt = loadedAt;
      const surface = timingSurface || previewSurface || previewViewport;
      recordPreviewTimingStage(previewTimingSessionId, {
        stage: "iframe-load",
        label: "Evento iframe.onload",
        startedAt: timing.mountedAt ?? timing.startedAt,
        completedAt: loadedAt,
        source: "iframe",
        viewport: previewViewport,
        surface,
        htmlBytes: String(htmlContent || "").length,
        recordKey: `iframe-load:${surface}`,
      });
    }

    timingCleanupRef.current?.();
    timingCleanupRef.current = observePreviewFrameTiming(
      iframe,
      (runtimeTiming) => {
        if (
          runtimeTiming?.sessionId !== previewTimingSessionId ||
          iframe?.contentDocument !== loadedDocument
        ) {
          return;
        }
        const runtimeStage = String(runtimeTiming.stage || "runtime-event");
        const surface =
          runtimeTiming.surface ||
          timingSurface ||
          previewSurface ||
          previewViewport;
        recordPreviewTimingStage(previewTimingSessionId, {
          stage: runtimeStage,
          label:
            PREVIEW_FRAME_TIMING_LABELS[runtimeStage] || runtimeStage,
          durationMs: runtimeTiming.durationMs,
          completedAt:
            typeof runtimeTiming.parentAt === "number"
              ? runtimeTiming.parentAt
              : null,
          source: "iframe-runtime",
          viewport: runtimeTiming.viewport || previewViewport,
          surface,
          status: runtimeStage.includes("failed") ||
            runtimeStage.includes("error")
            ? "error"
            : "ok",
          reason: runtimeTiming.detail?.reason || "",
          recordKey: `iframe-runtime:${surface}:${runtimeStage}`,
          detail: {
            ...(runtimeTiming.detail &&
            typeof runtimeTiming.detail === "object"
              ? runtimeTiming.detail
              : {}),
          },
        });
      }
    );

    onLoad?.(event);

    readinessCleanupRef.current?.();
    readinessCleanupRef.current = observePreviewFrameReadiness(
      iframe,
      ({ reason }) => {
        if (iframe?.contentDocument !== loadedDocument) return;
        readyReasonRef.current = reason;
        const surface = timingSurface || previewSurface || previewViewport;
        recordPreviewTimingStage(previewTimingSessionId, {
          stage: "invitation-loader-hidden-received",
          label: "Recepcion invitation-loader-hidden",
          source: "iframe",
          viewport: previewViewport,
          surface,
          reason,
          recordKey: `invitation-loader-hidden-received:${surface}`,
        });
        setReadyHtmlContent(htmlContent);
      }
    );
  };

  return (
    <div
      className="relative h-full w-full bg-white"
      aria-busy={announceLoading && !frameReady ? "true" : undefined}
    >
      {htmlContent ? (
        // The final srcDoc mounts once. The stable outer loader owns presentation until runtime readiness.
        <PreviewIframeDocument
          htmlContent={htmlContent}
          iframeTitle={iframeTitle}
          previewViewport={previewViewport}
          previewLayoutMode={previewLayoutMode}
          previewSurface={previewSurface}
          scrollAuthority={scrollAuthority}
          previewTimingSessionId={previewTimingSessionId}
          timingSurface={timingSurface}
          onMount={handleIframeMount}
          onLoad={handleIframeLoad}
          loading={!frameReady}
          style={{
            width: "100%",
            height: "100%",
            border: "none",
            display: "block",
            ...iframeStyle,
          }}
        />
      ) : null}
      {!frameReady ? (
        <PreviewLoadingPresentation announce={announceLoading} />
      ) : null}
    </div>
  );
}

function PreviewFrame({
  htmlContent,
  iframeTitle,
  scale,
  previewViewport,
  previewLayoutMode,
  viewportWidth,
  viewportHeight,
  scaledWidth,
  scaledHeight,
  onLoad,
  previewSurface = "",
  previewTimingSessionId = "",
  timingSurface = "",
  scrollAuthority = PREVIEW_FRAME_SCROLL_AUTHORITIES.DOCUMENT,
  announceLoading = true,
}) {
  return (
    <div
      className="bg-white"
      style={{
        width: scaledWidth,
        height: scaledHeight,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          width: viewportWidth,
          height: viewportHeight,
          zoom: scale,
        }}
      >
        <PreviewDocumentSurface
          htmlContent={htmlContent}
          iframeTitle={iframeTitle}
          previewViewport={previewViewport}
          previewLayoutMode={previewLayoutMode}
          previewSurface={previewSurface}
          previewTimingSessionId={previewTimingSessionId}
          timingSurface={timingSurface}
          scrollAuthority={scrollAuthority}
          announceLoading={announceLoading}
          onLoad={(event) => {
            onLoad?.({
              event,
              scale,
              previewSurface,
              scrollAuthority,
            });
          }}
        />
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

function MobileViewportToggle({ value, onChange }) {
  return (
    <div
      className="inline-flex shrink-0 items-center rounded-full border border-[#e1d5f4] bg-white/84 p-0.5 shadow-[0_8px_20px_rgba(15,23,42,0.05)]"
      aria-label="Cambiar viewport de vista previa"
      role="group"
    >
      {MOBILE_VIEWPORT_TOGGLE_OPTIONS.map(({ value: optionValue, label, Icon }) => {
        const selected = value === optionValue;

        return (
          <button
            key={optionValue}
            type="button"
            onClick={() => onChange?.(optionValue)}
            aria-pressed={selected}
            aria-label={`Mostrar vista ${label.toLowerCase()}`}
            className={`inline-flex min-h-10 items-center justify-center gap-1.5 rounded-full px-2.5 text-[12px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#dfcaf8] ${
              selected
                ? "bg-[#6f3bc0] text-white shadow-[0_8px_16px_rgba(111,59,192,0.22)]"
                : "bg-transparent text-[#6f3bc0] hover:bg-[#f4ecff]"
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            <span>{label}</span>
          </button>
        );
      })}
    </div>
  );
}

function DesktopPreviewShell({
  cardWidth,
  cardHeight,
  frameWidth,
  frameHeight,
  htmlContent,
  onLoad,
  scale,
  previewLayoutMode,
  variant = "compact",
  showFrameLabel = false,
  announceLoading = true,
  previewTimingSessionId = "",
  timingSurface = "desktop-mockup",
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
            iframeTitle="Vista previa escritorio"
            scale={scale}
            previewViewport="desktop"
            previewLayoutMode={previewLayoutMode}
            viewportWidth={DESKTOP_VIEWPORT_WIDTH}
            viewportHeight={DESKTOP_VIEWPORT_HEIGHT}
            scaledWidth={frameWidth}
            scaledHeight={frameHeight}
            onLoad={onLoad}
            announceLoading={announceLoading}
            previewTimingSessionId={previewTimingSessionId}
            timingSurface={timingSurface}
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
  onLoad,
  scale,
  previewLayoutMode,
  previewSurface = "",
  scrollAuthority = PREVIEW_FRAME_SCROLL_AUTHORITIES.DOCUMENT,
  variant = "compact",
  announceLoading = true,
  previewTimingSessionId = "",
  timingSurface = "mobile-mockup",
}) {
  const shellClass =
    variant === "showcase"
      ? "shadow-[0_26px_54px_rgba(111,59,192,0.18)]"
      : variant === "stacked"
        ? "shadow-[0_14px_32px_rgba(111,59,192,0.14)]"
        : "shadow-[0_18px_38px_rgba(111,59,192,0.16)]";

  return (
    <div
      className="relative max-w-full"
      style={{ width: cardWidth, height: cardHeight }}
    >
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
            iframeTitle="Vista previa movil"
            scale={scale}
            previewViewport="mobile"
            previewLayoutMode={previewLayoutMode}
            viewportWidth={MOBILE_VIEWPORT_WIDTH}
            viewportHeight={MOBILE_VIEWPORT_HEIGHT}
            scaledWidth={frameWidth}
            scaledHeight={frameHeight}
            onLoad={onLoad}
            previewSurface={previewSurface}
            scrollAuthority={scrollAuthority}
            announceLoading={announceLoading}
            previewTimingSessionId={previewTimingSessionId}
            timingSurface={timingSurface}
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
  previewTimingSessionId = "",
  previewTimingType = "draft-authoritative",
  previewTimingTarget = "",
}) {
  const [fullscreenPreview, setFullscreenPreview] = useState(false);
  const [noticePosition, setNoticePosition] = useState(null);
  const [windowHeight, setWindowHeight] = useState(() =>
    typeof window === "undefined" ? 820 : window.innerHeight || 820
  );
  const [windowWidth, setWindowWidth] = useState(() =>
    typeof window === "undefined" ? 0 : window.innerWidth || 0
  );
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 });
  const [mobilePreviewViewport, setMobilePreviewViewport] = useState(
    PREVIEW_MODAL_VIEWPORTS.MOBILE
  );
  const modalPanelRef = useRef(null);
  const publishActionsRef = useRef(null);
  const stageRef = useRef(null);
  const previewLayoutMode = resolvePreviewFrameLayoutMode();
  const previewUrl =
    String(previewDisplayUrl || "").trim() || "https://reservaeldia.com.ar/i/...";
  const confirmedPublicUrl = String(publishedUrl || publicUrl || "").trim();
  const yaPublicada = Boolean(confirmedPublicUrl);
  const isMobileViewport = windowWidth > 0 ? windowWidth < 768 : false;
  const activePreviewViewport = isMobileViewport
    ? mobilePreviewViewport
    : PREVIEW_MODAL_VIEWPORTS.DESKTOP;
  const fullscreenViewport = activePreviewViewport;
  const layout = computeModalVistaPreviaLayout({
    stageWidth: stageSize.width,
    stageHeight: stageSize.height,
    fallbackWidth: Math.max(windowWidth - 32, 320),
    fallbackHeight: Math.max(windowHeight - 180, 380),
  });
  const mobileFocusedLayout = computeModalVistaPreviaSingleViewportLayout({
    stageWidth: stageSize.width,
    stageHeight: stageSize.height,
    fallbackWidth: Math.max(windowWidth - 32, 320),
    fallbackHeight: Math.max(windowHeight - 180, 380),
    viewport: PREVIEW_MODAL_VIEWPORTS.MOBILE,
  });
  const desktopFocusedLayout = computeModalVistaPreviaSingleViewportLayout({
    stageWidth: stageSize.width,
    stageHeight: stageSize.height,
    fallbackWidth: Math.max(windowWidth - 32, 320),
    fallbackHeight: Math.max(windowHeight - 180, 380),
    viewport: PREVIEW_MODAL_VIEWPORTS.DESKTOP,
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
  const publishNoticePresentation = buildPreviewPublishNoticePresentation({
    validation: publishValidation,
    pending: publishValidationPending,
    publishError,
    publishSuccess,
  });

  useEffect(() => {
    if (!visible || !previewTimingSessionId) return;
    const expectedTimingSurfaces = fullscreenPreview
      ? [`fullscreen-${fullscreenViewport}`]
      : isMobileViewport
        ? [
            mobilePreviewViewport === PREVIEW_MODAL_VIEWPORTS.DESKTOP
              ? "desktop-focused"
              : "mobile-focused",
          ]
        : ["desktop-mockup", "mobile-mockup"];
    setPreviewTimingExpectedSurfaces(
      previewTimingSessionId,
      expectedTimingSurfaces
    );
  }, [
    fullscreenPreview,
    fullscreenViewport,
    isMobileViewport,
    mobilePreviewViewport,
    previewTimingSessionId,
    visible,
  ]);

  useEffect(() => {
    if (!visible || !htmlContent || !previewTimingSessionId) return;
    recordPreviewTimingStage(previewTimingSessionId, {
      stage: "react-html-committed",
      label: "Commit HTML definitivo en React",
      source: "react",
      viewport: isMobileViewport ? "mobile" : "desktop",
      htmlBytes: String(htmlContent || "").length,
      recordKey: "react-html-committed",
      detail: {
        previewType: previewTimingType,
        target: String(previewTimingTarget || "").slice(0, 120),
      },
    });
  }, [
    htmlContent,
    isMobileViewport,
    previewTimingSessionId,
    previewTimingTarget,
    previewTimingType,
    visible,
  ]);

  useEffect(() => {
    if (visible) return;
    setFullscreenPreview(false);
    setMobilePreviewViewport(PREVIEW_MODAL_VIEWPORTS.MOBILE);
  }, [visible]);

  useEffect(() => {
    if (!visible || !isMobileViewport) return;
    setMobilePreviewViewport(PREVIEW_MODAL_VIEWPORTS.MOBILE);
  }, [visible, isMobileViewport]);

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
    let frameId = null;

    const commitMeasurement = (width, height) => {
      const nextWidth = width || target.clientWidth || 0;
      const nextHeight = height || target.clientHeight || 0;
      setStageSize((current) =>
        current.width === nextWidth && current.height === nextHeight
          ? current
          : { width: nextWidth, height: nextHeight }
      );
    };

    const scheduleMeasurement = (width, height) => {
      if (frameId !== null) window.cancelAnimationFrame(frameId);
      frameId = window.requestAnimationFrame(() => {
        frameId = null;
        commitMeasurement(width, height);
      });
    };

    commitMeasurement();

    if (typeof ResizeObserver === "undefined") {
      const onResize = () => scheduleMeasurement();
      window.addEventListener("resize", onResize);
      return () => {
        window.removeEventListener("resize", onResize);
        if (frameId !== null) window.cancelAnimationFrame(frameId);
      };
    }

    const observer = new ResizeObserver((entries) => {
      const rect = entries?.[0]?.contentRect;
      scheduleMeasurement(rect?.width, rect?.height);
    });
    observer.observe(target);

    return () => {
      observer.disconnect();
      if (frameId !== null) window.cancelAnimationFrame(frameId);
    };
  }, [visible]);

  useEffect(() => {
    if (!visible || !showPublishActions || typeof window === "undefined") {
      setNoticePosition(null);
      return;
    }

    const modalNode = modalPanelRef.current;
    const actionsNode = publishActionsRef.current;
    if (!modalNode || !actionsNode) {
      setNoticePosition(null);
      return;
    }

    let frameId = null;
    const measure = () => {
      const modalRect = modalNode.getBoundingClientRect();
      const actionsRect = actionsNode.getBoundingClientRect();
      if (!modalRect.width || !actionsRect.width) return;

      const maxWidth = Math.max(168, Math.min(420, modalRect.width - 24));
      const minWidth = Math.min(maxWidth, toolbarInline ? 300 : 260);
      const preferredWidth = Math.max(actionsRect.width, minWidth);
      const nextPosition = {
        top: Math.round(Math.max(actionsRect.bottom - modalRect.top + 10, 8)),
        right: Math.round(Math.max(modalRect.right - actionsRect.right, 12)),
        width: Math.round(Math.min(Math.max(preferredWidth, minWidth), maxWidth)),
      };

      setNoticePosition((current) => {
        if (
          current?.top === nextPosition.top &&
          current?.right === nextPosition.right &&
          current?.width === nextPosition.width
        ) {
          return current;
        }

        return nextPosition;
      });
    };

    const scheduleMeasurement = () => {
      if (frameId !== null) window.cancelAnimationFrame(frameId);
      frameId = window.requestAnimationFrame(() => {
        frameId = null;
        measure();
      });
    };

    scheduleMeasurement();
    const onResize = scheduleMeasurement;
    window.addEventListener("resize", onResize);

    if (typeof ResizeObserver === "undefined") {
      return () => {
        if (frameId !== null) window.cancelAnimationFrame(frameId);
        window.removeEventListener("resize", onResize);
      };
    }

    const observer = new ResizeObserver(scheduleMeasurement);
    observer.observe(modalNode);
    observer.observe(actionsNode);

    return () => {
      if (frameId !== null) window.cancelAnimationFrame(frameId);
      window.removeEventListener("resize", onResize);
      observer.disconnect();
    };
  }, [showPublishActions, toolbarInline, visible]);

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
    applyPreviewFrameScale(event, scale, "desktop", {
      layoutMode: previewLayoutMode,
    });
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

  const handleMobileLoad = ({
    event,
    scale,
    previewSurface = "",
    scrollAuthority = PREVIEW_FRAME_SCROLL_AUTHORITIES.DOCUMENT,
  }) => {
    if (!htmlContent) return;
    applyPreviewFrameScale(event, scale, "mobile", {
      layoutMode: previewLayoutMode,
      previewSurface,
      scrollAuthority,
    });
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
      scale={layout.desktopFrame.scale}
      previewLayoutMode={previewLayoutMode}
      variant={desktopVariant}
      showFrameLabel={layout.mode !== "stacked-priority"}
      onLoad={handleDesktopLoad}
      previewTimingSessionId={previewTimingSessionId}
      timingSurface="desktop-mockup"
    />
  );

  const mobilePreview = (
    <MobilePreviewShell
      cardWidth={layout.mobileCardWidth}
      cardHeight={layout.mobileCardHeight}
      frameWidth={layout.mobileFrame.scaledWidth}
      frameHeight={layout.mobileFrame.scaledHeight}
      htmlContent={htmlContent}
      scale={layout.mobileFrame.scale}
      previewLayoutMode={previewLayoutMode}
      variant={mobileVariant}
      onLoad={handleMobileLoad}
      announceLoading={false}
      previewSurface="mobile-preview-paired"
      scrollAuthority={PREVIEW_FRAME_SCROLL_AUTHORITIES.BODY}
      previewTimingSessionId={previewTimingSessionId}
      timingSurface="mobile-mockup"
    />
  );

  const mobileFocusedPreview = (
    <MobilePreviewShell
      cardWidth={mobileFocusedLayout.cardWidth}
      cardHeight={mobileFocusedLayout.cardHeight}
      frameWidth={mobileFocusedLayout.frame.scaledWidth}
      frameHeight={mobileFocusedLayout.frame.scaledHeight}
      htmlContent={htmlContent}
      scale={mobileFocusedLayout.frame.scale}
      previewLayoutMode={previewLayoutMode}
      variant="showcase"
      onLoad={handleMobileLoad}
      previewSurface="mobile-preview-focused"
      scrollAuthority={PREVIEW_FRAME_SCROLL_AUTHORITIES.BODY}
      previewTimingSessionId={previewTimingSessionId}
      timingSurface="mobile-focused"
    />
  );

  const desktopFocusedPreview = (
    <DesktopPreviewShell
      cardWidth={desktopFocusedLayout.cardWidth}
      cardHeight={desktopFocusedLayout.cardHeight}
      frameWidth={desktopFocusedLayout.frame.scaledWidth}
      frameHeight={desktopFocusedLayout.frame.scaledHeight}
      htmlContent={htmlContent}
      scale={desktopFocusedLayout.frame.scale}
      previewLayoutMode={previewLayoutMode}
      variant="stacked"
      showFrameLabel
      onLoad={handleDesktopLoad}
      previewTimingSessionId={previewTimingSessionId}
      timingSurface="desktop-focused"
    />
  );

  const activeMobileModalPreview =
    mobilePreviewViewport === PREVIEW_MODAL_VIEWPORTS.DESKTOP
      ? desktopFocusedPreview
      : mobileFocusedPreview;
  const activeMobileModalLayout =
    mobilePreviewViewport === PREVIEW_MODAL_VIEWPORTS.DESKTOP
      ? desktopFocusedLayout
      : mobileFocusedLayout;

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

        <PreviewDocumentSurface
          htmlContent={htmlContent}
          iframeTitle={
            fullscreenViewport === PREVIEW_MODAL_VIEWPORTS.MOBILE
              ? "Vista previa movil en pantalla completa"
              : "Vista previa escritorio en pantalla completa"
          }
          previewViewport={fullscreenViewport}
          previewLayoutMode={previewLayoutMode}
          previewSurface={`fullscreen-${fullscreenViewport}`}
          previewTimingSessionId={previewTimingSessionId}
          timingSurface={`fullscreen-${fullscreenViewport}`}
          onLoad={(event) => {
            applyPreviewFrameScale(
              event,
              1,
              fullscreenViewport,
              {
                layoutMode: previewLayoutMode,
              }
            );
          }}
        />
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[9999] bg-[rgba(247,244,255,0.68)] backdrop-blur-[6px]">
      <div className="flex h-full w-full items-center justify-center p-2 sm:p-5">
        <div
          ref={modalPanelRef}
          className="relative flex h-full w-full max-w-[1560px] flex-col overflow-hidden rounded-[30px] border border-[#e9dcfb] bg-[linear-gradient(180deg,#ffffff_0%,#fbf8ff_34%,#f5f9ff_100%)] text-slate-800 shadow-[0_30px_84px_rgba(111,59,192,0.18)]"
        >
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
                  <div
                    ref={publishActionsRef}
                    className="flex shrink-0 items-center gap-2"
                  >
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

                    {isMobileViewport ? (
                      <MobileViewportToggle
                        value={mobilePreviewViewport}
                        onChange={setMobilePreviewViewport}
                      />
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
                      title={`Abrir vista previa en pantalla completa (${
                        activePreviewViewport === PREVIEW_MODAL_VIEWPORTS.MOBILE
                          ? "movil"
                          : "escritorio"
                      })`}
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
                  <div ref={publishActionsRef} className="flex flex-col gap-2">
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
                      {isMobileViewport ? (
                        <MobileViewportToggle
                          value={mobilePreviewViewport}
                          onChange={setMobilePreviewViewport}
                        />
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
                        title={`Abrir vista previa en pantalla completa (${
                          activePreviewViewport === PREVIEW_MODAL_VIEWPORTS.MOBILE
                            ? "movil"
                            : "escritorio"
                        })`}
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
            </div>
          </div>

          {showPublishActions ? (
            <PreviewPublishNoticeLayer
              notices={publishNoticePresentation.notices}
              position={noticePosition}
            />
          ) : null}

          <div ref={stageRef} className="relative flex-1 min-h-0 overflow-hidden">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_10%_16%,rgba(232,214,255,0.95),rgba(255,255,255,0)_34%),radial-gradient(circle_at_82%_20%,rgba(224,238,255,0.82),rgba(255,255,255,0)_28%),radial-gradient(circle_at_78%_84%,rgba(243,247,255,0.92),rgba(255,255,255,0)_40%),radial-gradient(circle_at_30%_78%,rgba(248,235,255,0.55),rgba(255,255,255,0)_32%)]" />
            <div className="absolute inset-0 bg-[linear-gradient(125deg,rgba(255,255,255,0.9)_0%,rgba(251,247,255,0.72)_46%,rgba(244,248,255,0.78)_100%)]" />
            <div className="absolute inset-x-[12%] bottom-[6%] h-[32%] rounded-full bg-[radial-gradient(ellipse_at_center,rgba(255,255,255,0.7),rgba(255,255,255,0)_72%)] blur-3xl" />

            {isMobileViewport ? (
              <div
                className="relative flex h-full min-h-0 items-center justify-center"
                style={{
                  padding: `${activeMobileModalLayout.stagePaddingY}px ${activeMobileModalLayout.stagePaddingX}px`,
                }}
              >
                <div className="flex h-full min-h-0 w-full items-center justify-center">
                  {activeMobileModalPreview}
                </div>
              </div>
            ) : layout.mode === "showcase-overlap" ? (
              <div
                className="relative flex h-full items-center justify-center"
                style={{
                  padding: `${layout.stagePaddingY}px ${layout.stagePaddingX}px`,
                }}
              >
                <div className="relative" style={{ width: layout.sceneWidth, height: layout.sceneHeight }}>
                  <div className="absolute -inset-8 rounded-[48px] bg-[radial-gradient(circle_at_22%_22%,rgba(235,220,255,0.56),rgba(255,255,255,0)_54%),radial-gradient(circle_at_86%_82%,rgba(217,233,255,0.48),rgba(255,255,255,0)_52%)] blur-3xl" />
                  <div className="absolute left-0 top-0 isolate z-0">
                    {desktopPreview}
                  </div>
                  <div
                    className="absolute isolate z-10"
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
