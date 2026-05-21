import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2, X } from "lucide-react";
import { resolveTemplatePreviewRuntimeState } from "@/domain/templates/preview";
import { captureCountdownAuditFromHtmlString } from "@/domain/countdownAudit/runtime";
import TemplateEventForm from "@/components/templates/TemplateEventForm";
import {
  buildPreviewOperationsForField,
  buildPreviewPatchMessage,
  resolvePreviewScrollTargetsForField,
} from "@/domain/templates/previewLivePatch";
import { syncPreviewFrameAndCaptureTextPositions } from "@/domain/templates/previewTextPositionSnapshot";
import { logTemplateDraftDebug } from "@/domain/templates/draftPersonalizationDebug";
import {
  applyPreviewFrameScale,
  buildPreviewFrameSrcDoc,
  resolvePreviewFrameLayoutMode,
} from "@/components/preview/previewFrameRuntime";

const TEMPLATE_PREVIEW_VIEWPORT_WIDTH = 1280;
const TEMPLATE_PREVIEW_VIEWPORT_HEIGHT = 820;
const TEMPLATE_PREVIEW_MOBILE_VIEWPORT_WIDTH = 390;
const TEMPLATE_PREVIEW_MOBILE_VIEWPORT_HEIGHT = 844;
const TEMPLATE_PREVIEW_ACTION_PANEL_BOTTOM_GAP = 20;
const TEMPLATE_PREVIEW_ACTION_PANEL_SCROLL_BUFFER = 24;
const TEMPLATE_PREVIEW_ACTION_PANEL_FALLBACK_HEIGHT = 116;
const TEMPLATE_PREVIEW_SCROLL_SPACER_ID = "template-preview-modal-scroll-spacer";
const SITE_PRIMARY_BUTTON_CLASS =
  "inline-flex h-10 min-w-[132px] items-center justify-center rounded-[33px] border border-transparent bg-gradient-to-r from-[#692B9A] to-[#F39F5F] px-5 text-sm font-semibold text-white shadow-none transition-all duration-200 hover:brightness-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#F39F5F]/40 disabled:cursor-not-allowed disabled:opacity-70";

function toText(value, fallback = "") {
  const safe = String(value || "").trim();
  return safe || fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function applyTemplatePreviewScrollSpacer(iframe, insetPixels) {
  const frameDocument = iframe?.contentDocument;
  const safeInset = Math.max(0, Math.ceil(Number(insetPixels) || 0));
  if (!frameDocument?.body || safeInset <= 0) return;

  const invitationRoot = frameDocument.querySelector(".inv") || frameDocument.body;
  let spacer = frameDocument.getElementById(TEMPLATE_PREVIEW_SCROLL_SPACER_ID);
  if (!spacer) {
    spacer = frameDocument.createElement("div");
    spacer.id = TEMPLATE_PREVIEW_SCROLL_SPACER_ID;
    spacer.setAttribute("aria-hidden", "true");
  }

  if (spacer.parentNode !== invitationRoot) {
    invitationRoot.appendChild(spacer);
  }

  spacer.style.cssText = [
    "display: block",
    "width: 100%",
    `height: ${safeInset}px`,
    "min-height: 0",
    "flex: 0 0 auto",
    "position: relative",
    "left: auto",
    "top: auto",
    "transform: none",
    "background: transparent",
    "pointer-events: none",
    "visibility: hidden",
  ].join(";");
  frameDocument.documentElement.style.scrollPaddingBottom = `${safeInset}px`;
  frameDocument.body.style.scrollPaddingBottom = `${safeInset}px`;
}

function TemplatePreviewViewport({
  iframeRef,
  src,
  srcDoc,
  sandbox,
  title,
  onError,
  onLoad,
  overlayHeight = 0,
}) {
  const stageRef = useRef(null);
  const [stageWidth, setStageWidth] = useState(0);
  const [stageHeight, setStageHeight] = useState(0);

  useEffect(() => {
    const node = stageRef.current;
    if (!node) return undefined;

    const measure = () => {
      setStageWidth(node.clientWidth || 0);
      setStageHeight(node.clientHeight || 0);
    };

    measure();

    if (typeof ResizeObserver === "function") {
      const observer = new ResizeObserver((entries) => {
        const rect = entries?.[0]?.contentRect;
        if (!rect) {
          measure();
          return;
        }
        setStageWidth(rect.width || 0);
        setStageHeight(rect.height || 0);
      });
      observer.observe(node);
      return () => observer.disconnect();
    }

    if (typeof window !== "undefined") {
      window.addEventListener("resize", measure);
      return () => window.removeEventListener("resize", measure);
    }

    return undefined;
  }, []);

  const previewLayoutMode = resolvePreviewFrameLayoutMode();
  const isMobileHost = stageWidth > 0 && stageWidth < 640;
  const previewViewport = isMobileHost ? "mobile" : "desktop";
  const viewportWidth = isMobileHost
    ? TEMPLATE_PREVIEW_MOBILE_VIEWPORT_WIDTH
    : TEMPLATE_PREVIEW_VIEWPORT_WIDTH;
  const viewportHeight = isMobileHost
    ? TEMPLATE_PREVIEW_MOBILE_VIEWPORT_HEIGHT
    : TEMPLATE_PREVIEW_VIEWPORT_HEIGHT;
  const widthBudget = Math.max(stageWidth, 240);
  const scale = isMobileHost
    ? clamp(widthBudget / viewportWidth, 0.42, 1)
    : clamp(widthBudget / viewportWidth, 0.16, 1);
  const scaledWidth = Math.round(viewportWidth * scale);
  const scaledHeight = Math.round(viewportHeight * scale);
  const overlayHeightForScroll =
    overlayHeight > 0 ? overlayHeight : TEMPLATE_PREVIEW_ACTION_PANEL_FALLBACK_HEIGHT;
  const bottomScrollInset = Math.ceil(
    (overlayHeightForScroll +
      TEMPLATE_PREVIEW_ACTION_PANEL_BOTTOM_GAP +
      TEMPLATE_PREVIEW_ACTION_PANEL_SCROLL_BUFFER) /
      scale
  );
  const resolvedSrcDoc = srcDoc
    ? buildPreviewFrameSrcDoc(srcDoc, {
        previewViewport: "",
        layoutMode: previewLayoutMode,
      })
    : srcDoc;

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe?.contentDocument) return;
    applyPreviewFrameScale(
      { target: iframe },
      scale,
      previewViewport,
      {
        layoutMode: previewLayoutMode,
        dispatchMobileScrollEvent: false,
      }
    );
    applyTemplatePreviewScrollSpacer(iframe, bottomScrollInset);
  }, [bottomScrollInset, iframeRef, previewLayoutMode, previewViewport, scale]);

  return (
    <div
      ref={stageRef}
      className="flex h-full w-full items-start justify-center overflow-hidden"
    >
      <div
        className="overflow-hidden bg-white"
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
          <iframe
            ref={iframeRef}
            src={src}
            srcDoc={resolvedSrcDoc}
            sandbox={sandbox}
            scrolling="yes"
            title={title}
            className="block h-full w-full border-0"
            style={{ WebkitOverflowScrolling: "touch" }}
            onError={onError}
            onLoad={(event) => {
              applyPreviewFrameScale(
                event,
                scale,
                previewViewport,
                {
                  layoutMode: previewLayoutMode,
                  dispatchMobileScrollEvent: false,
                }
              );
              applyTemplatePreviewScrollSpacer(event.currentTarget, bottomScrollInset);
              onLoad?.({
                event,
                scale,
                previewViewport,
              });
            }}
          />
        </div>
      </div>
    </div>
  );
}

export default function TemplatePreviewModal({
  visible,
  template,
  metadata,
  previewHtml,
  previewStatus,
  onClose,
  onOpenEditorWithChanges,
  onOpenEditorWithoutChanges,
  onUseTemplate,
  actionMode = "editor",
  useTemplateLabel = "Usar plantilla",
  formState,
  onFormStateChange,
  openingEditor = false,
  showEventCustomization = true,
}) {
  const modalPanelRef = useRef(null);
  const previewFrameRef = useRef(null);
  const previewActionPanelRef = useRef(null);
  const formRef = useRef(null);
  const inputPatchTimersRef = useRef({});
  const [mode, setMode] = useState("collapsed");
  const [previewActionPanelHeight, setPreviewActionPanelHeight] = useState(0);
  const errorMessage = toText(
    previewStatus?.error,
    "No se pudo cargar la vista previa de esta plantilla."
  );

  const title = toText(metadata?.title, toText(template?.nombre, "Plantilla"));
  const previewRuntime = resolveTemplatePreviewRuntimeState({
    template,
    previewHtml,
    previewStatus,
  });
  const isLandingMode = actionMode === "landing";
  const canCustomizeEvent = !isLandingMode && showEventCustomization !== false;
  const shouldShowGeneratedPreview = previewRuntime.shouldShowGeneratedPreview;
  const canPatchPreview = previewRuntime.canPatchPreview;
  const isExpanded = canCustomizeEvent && mode === "expanded";

  useEffect(() => {
    setMode("collapsed");
  }, [template?.id, visible]);

  useEffect(() => {
    if (!canCustomizeEvent && mode !== "collapsed") {
      setMode("collapsed");
    }
  }, [canCustomizeEvent, mode]);

  useEffect(
    () => () => {
      Object.values(inputPatchTimersRef.current).forEach((timerId) => {
        clearTimeout(timerId);
      });
      inputPatchTimersRef.current = {};
    },
    []
  );

  useEffect(() => {
    if (!visible || typeof window === "undefined") return undefined;
    const node = previewActionPanelRef.current;
    if (!node) return undefined;

    const measure = () => {
      setPreviewActionPanelHeight(Math.ceil(node.getBoundingClientRect().height || 0));
    };

    measure();

    if (typeof ResizeObserver === "function") {
      const observer = new ResizeObserver(measure);
      observer.observe(node);
      return () => observer.disconnect();
    }

    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [visible, title, canCustomizeEvent, isLandingMode, isExpanded]);

  useEffect(() => {
    if (!visible || typeof document === "undefined" || typeof window === "undefined") return undefined;

    modalPanelRef.current?.focus?.({ preventScroll: true });

    const onKeyDown = (event) => {
      if (event.key !== "Escape" || openingEditor) return;
      event.preventDefault();
      event.stopPropagation();
      onClose?.();
    };

    window.addEventListener("keydown", onKeyDown, true);

    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
    };
  }, [onClose, openingEditor, visible]);

  const postPreviewOperations = useCallback(
    (operations, options = {}) => {
      if (!canPatchPreview) return;
      if (!Array.isArray(operations) || operations.length === 0) return;
      const frameWindow = previewFrameRef.current?.contentWindow;
      if (!frameWindow) return;

      frameWindow.postMessage(buildPreviewPatchMessage(operations, options), "*");
    },
    [canPatchPreview]
  );

  const handleLiveFieldUpdate = useCallback(
    ({ fieldKey, value, phase }) => {
      const key = toText(fieldKey);
      if (!key || !phase || !canPatchPreview) return;

      const operations = buildPreviewOperationsForField({
        template,
        fieldKey: key,
        value,
        phase,
      });
      if (!operations.length) return;
      const scrollTargets = resolvePreviewScrollTargetsForField(template, key);

      if (phase === "input") {
        if (inputPatchTimersRef.current[key]) {
          clearTimeout(inputPatchTimersRef.current[key]);
        }
        inputPatchTimersRef.current[key] = setTimeout(() => {
          postPreviewOperations(operations, { scrollTargets });
          delete inputPatchTimersRef.current[key];
        }, 180);
        return;
      }

      postPreviewOperations(operations, { scrollTargets });
    },
    [canPatchPreview, postPreviewOperations, template]
  );

  const handlePrimaryAction = useCallback(() => {
    if (isExpanded) {
      formRef.current?.submitChanges?.();
      return;
    }

    onOpenEditorWithoutChanges?.();
  }, [isExpanded, onOpenEditorWithoutChanges]);

  const handleLandingUseTemplate = useCallback(() => {
    onUseTemplate?.(template);
  }, [onUseTemplate, template]);

  const handleSaveAndOpenWithPreview = useCallback(
    async (payload) => {
      let previewTextPositions = null;

      if (canPatchPreview) {
        try {
          previewTextPositions = await syncPreviewFrameAndCaptureTextPositions({
            iframe: previewFrameRef.current,
            template,
            formState,
          });
        } catch (error) {
          logTemplateDraftDebug("preview-sync:error", {
            message: String(error?.message || error || "unknown"),
          });
          previewTextPositions = null;
        }
      }

      onOpenEditorWithChanges?.({
        ...(payload && typeof payload === "object" ? payload : {}),
        previewTextPositions,
      });
    },
    [canPatchPreview, formState, onOpenEditorWithChanges, template]
  );

  if (!visible || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[10000] bg-[rgba(0,0,0,0.35)] backdrop-blur-[4px]"
      onMouseDown={(event) => {
        if (openingEditor) return;
        const panel = modalPanelRef.current;
        const target = event.target;
        if (panel && target instanceof Node && !panel.contains(target)) {
          onClose?.();
        }
      }}
      role="presentation"
    >
      <div className="flex h-[100dvh] w-full items-stretch justify-center px-4 py-0 max-sm:items-center max-sm:px-3 max-sm:py-4">
        <div
          ref={modalPanelRef}
          tabIndex={-1}
          className="relative flex h-[100dvh] max-h-none w-full max-w-[980px] flex-col overflow-hidden rounded-none border-x border-y-0 border-[#692B9A] bg-[linear-gradient(180deg,#fbf8ff_0%,#f4eeff_100%)] shadow-[0_20px_60px_rgba(0,0,0,0.25)] max-sm:h-[calc(100dvh-32px)] max-sm:max-h-[calc(100dvh-32px)] max-sm:rounded-[24px] max-sm:border max-sm:shadow-[0_22px_70px_rgba(0,0,0,0.32)]"
        >
          <button
            type="button"
            onClick={onClose}
            disabled={openingEditor}
            className="absolute right-4 z-30 inline-flex h-11 w-11 items-center justify-center rounded-full border border-[#692B9A]/28 bg-white text-[#262626] shadow-[0_12px_30px_rgba(15,23,42,0.28)] backdrop-blur-md transition hover:bg-[#FAF5FF] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#692B9A]/35 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 sm:right-4 sm:h-9 sm:w-9 sm:border-transparent sm:bg-white/76 sm:text-slate-700 sm:shadow-[0_8px_24px_rgba(15,23,42,0.18)] sm:hover:bg-white sm:focus-visible:ring-white/80 sm:focus-visible:ring-offset-0"
            style={{ top: "max(0.75rem, env(safe-area-inset-top))" }}
            aria-label="Cerrar modal"
          >
            <X className="h-5 w-5 sm:h-4 sm:w-4" />
          </button>

          <div className="flex min-h-0 flex-1 flex-col">
            <div
              className="relative min-h-[280px] overflow-hidden bg-white transition-[flex-basis] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] sm:min-h-[320px]"
              style={{ flexBasis: isExpanded ? "50%" : "100%" }}
            >
              <div className="absolute inset-0 bg-white">
                {shouldShowGeneratedPreview ? (
                  <TemplatePreviewViewport
                    srcDoc={previewHtml}
                    sandbox="allow-scripts allow-same-origin"
                    title={`Vista previa de ${title}`}
                    iframeRef={previewFrameRef}
                    overlayHeight={previewActionPanelHeight}
                    onLoad={({ scale, previewViewport }) => {
                      if (!previewHtml) return;
                      const auditViewport = previewViewport || "desktop";
                      captureCountdownAuditFromHtmlString(previewHtml, {
                        stage: `template-preview-${auditViewport}`,
                        renderer: "dom-generated",
                        sourceDocument: "template-preview-modal",
                        viewport: auditViewport,
                        wrapperScale: scale,
                        usesRasterThumbnail: false,
                      });
                    }}
                  />
                ) : null}

                {previewRuntime.shouldShowLoadingState && (
                  <div className="flex h-full items-center justify-center bg-slate-50">
                    <div className="flex items-center gap-2 text-sm text-slate-600">
                      <Loader2 className="h-4 w-4 animate-spin text-[#6f3bc0]" />
                      Cargando vista previa...
                    </div>
                  </div>
                )}

                {previewRuntime.shouldShowErrorState && (
                  <div className="flex h-full items-center justify-center bg-[#fcfbff] px-6 text-center">
                    <p className="max-w-xl text-sm text-rose-600">{errorMessage}</p>
                  </div>
                )}

                {previewRuntime.shouldShowMissingPreviewState ? (
                  <div className="flex h-full items-center justify-center bg-[#fcfbff] px-6 text-center">
                    <p className="max-w-xl text-sm text-rose-600">
                      No se pudo cargar la vista previa de esta plantilla.
                    </p>
                  </div>
                ) : null}
              </div>
              <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-[#120822]/24 via-transparent to-transparent sm:h-28" />

              <div className="pointer-events-none absolute inset-x-0 bottom-4 z-20 px-4 sm:bottom-5 sm:px-6">
                <div
                  ref={previewActionPanelRef}
                  className="pointer-events-auto relative overflow-hidden rounded-[22px] border border-white/28 bg-[linear-gradient(135deg,rgba(255,255,255,0.34)_0%,rgba(255,255,255,0.14)_52%,rgba(255,255,255,0.08)_100%)] p-3 shadow-[0_24px_54px_rgba(15,23,42,0.18)] backdrop-blur-[18px] sm:p-4"
                >
                  <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.42),transparent_42%),linear-gradient(180deg,rgba(255,255,255,0.08),transparent_55%)]" />
                  <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-white/55" />
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                    <div className="relative min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="mr-auto text-sm font-semibold text-slate-900 sm:text-base">{title}</p>
                      </div>
                    </div>

                    <div className="relative flex flex-wrap gap-2 lg:justify-end">
                      {isLandingMode ? (
                        <button
                          type="button"
                          onClick={handleLandingUseTemplate}
                          disabled={openingEditor}
                          className={SITE_PRIMARY_BUTTON_CLASS}
                        >
                          {useTemplateLabel}
                        </button>
                      ) : (
                        <>
                          {canCustomizeEvent ? (
                            <button
                              type="button"
                              onClick={() => setMode(isExpanded ? "collapsed" : "expanded")}
                              disabled={openingEditor}
                              className="inline-flex min-h-9 items-center justify-center rounded-lg border border-white/40 bg-white/18 px-3.5 py-2 text-[13px] font-semibold text-[#5f3596] shadow-[inset_0_1px_0_rgba(255,255,255,0.38)] transition hover:bg-white/30 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {isExpanded ? "Ocultar personalizacion" : "Personalizar datos del evento"}
                            </button>
                          ) : null}

                          <button
                            type="button"
                            onClick={handlePrimaryAction}
                            disabled={openingEditor}
                            className={SITE_PRIMARY_BUTTON_CLASS}
                          >
                            {openingEditor
                              ? "Creando borrador..."
                              : isExpanded
                                ? "Crear invitacion"
                                : useTemplateLabel}
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {canCustomizeEvent ? (
              <div
                className={`relative overflow-hidden bg-[#f7f1ff] ${
                  isExpanded ? "min-h-0 flex-1" : "basis-0"
                }`}
              >
                <TemplateEventForm
                  ref={formRef}
                  template={template}
                  formState={formState}
                  onFormStateChange={onFormStateChange}
                  onLiveFieldUpdate={handleLiveFieldUpdate}
                  onSaveAndOpen={handleSaveAndOpenWithPreview}
                  openingEditor={openingEditor}
                  mode={mode}
                />
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
