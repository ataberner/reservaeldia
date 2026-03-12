import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2, X } from "lucide-react";
import { resolveTemplatePreviewSource } from "@/domain/templates/preview";
import TemplateEventForm from "@/components/templates/TemplateEventForm";
import {
  buildPreviewOperationsForField,
  buildPreviewPatchMessage,
} from "@/domain/templates/previewLivePatch";

const TEMPLATE_PREVIEW_VIEWPORT_WIDTH = 1280;
const TEMPLATE_PREVIEW_VIEWPORT_HEIGHT = 820;

function toText(value, fallback = "") {
  const safe = String(value || "").trim();
  return safe || fallback;
}

function toList(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function TemplatePreviewViewport({
  iframeRef,
  src,
  srcDoc,
  sandbox,
  title,
  onError,
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

  const widthBudget = Math.max(stageWidth, 240);
  const scale = clamp(widthBudget / TEMPLATE_PREVIEW_VIEWPORT_WIDTH, 0.16, 1);
  const scaledWidth = Math.round(TEMPLATE_PREVIEW_VIEWPORT_WIDTH * scale);
  const scaledHeight = Math.round(TEMPLATE_PREVIEW_VIEWPORT_HEIGHT * scale);

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
            width: TEMPLATE_PREVIEW_VIEWPORT_WIDTH,
            height: TEMPLATE_PREVIEW_VIEWPORT_HEIGHT,
            transform: `scale(${scale})`,
            transformOrigin: "top left",
          }}
        >
          <iframe
            ref={iframeRef}
            src={src}
            srcDoc={srcDoc}
            sandbox={sandbox}
            title={title}
            className="block h-full w-full border-0"
            onError={onError}
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
  formState,
  onFormStateChange,
  openingEditor = false,
}) {
  const modalPanelRef = useRef(null);
  const previewFrameRef = useRef(null);
  const formRef = useRef(null);
  const inputPatchTimersRef = useRef({});
  const [mode, setMode] = useState("collapsed");
  const [previewUrlFailed, setPreviewUrlFailed] = useState(false);
  const status = toText(previewStatus?.status, previewHtml ? "ready" : "idle");
  const errorMessage = toText(
    previewStatus?.error,
    "No se pudo cargar la vista previa de esta plantilla."
  );

  const title = toText(metadata?.title, toText(template?.nombre, "Plantilla"));
  const badges = toList(metadata?.badges).filter((badge) => toText(badge).toLowerCase() !== "top");
  const features = toList(metadata?.features);
  const categories = toList(metadata?.categories);
  const previewSource = resolveTemplatePreviewSource(template);
  const previewUrl = previewSource.mode === "url" ? previewSource.previewUrl : null;
  const hasPreviewUrl = Boolean(previewUrl);
  const usePreviewUrl = hasPreviewUrl && !previewUrlFailed;
  const shouldShowGeneratedPreview = status === "ready" && Boolean(previewHtml);
  const shouldShowPreviewUrl = usePreviewUrl && !shouldShowGeneratedPreview && status !== "loading";
  const canPatchPreview = shouldShowGeneratedPreview;
  const isExpanded = mode === "expanded";

  useEffect(() => {
    setPreviewUrlFailed(false);
  }, [previewUrl]);

  useEffect(() => {
    setMode("collapsed");
  }, [template?.id, visible]);

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
    (operations) => {
      if (!canPatchPreview) return;
      if (!Array.isArray(operations) || operations.length === 0) return;
      const frameWindow = previewFrameRef.current?.contentWindow;
      if (!frameWindow) return;

      frameWindow.postMessage(buildPreviewPatchMessage(operations), "*");
    },
    [canPatchPreview]
  );

  const handleLiveFieldUpdate = useCallback(
    ({ fieldKey, value, phase }) => {
      const key = toText(fieldKey);
      if (!key || !phase) return;

      const operations = buildPreviewOperationsForField({
        template,
        fieldKey: key,
        value,
        phase,
      });
      if (!operations.length) return;

      if (phase === "input") {
        if (inputPatchTimersRef.current[key]) {
          clearTimeout(inputPatchTimersRef.current[key]);
        }
        inputPatchTimersRef.current[key] = setTimeout(() => {
          postPreviewOperations(operations);
          delete inputPatchTimersRef.current[key];
        }, 180);
        return;
      }

      postPreviewOperations(operations);
    },
    [postPreviewOperations, template]
  );

  const handlePrimaryAction = useCallback(() => {
    if (isExpanded) {
      formRef.current?.submitChanges?.();
      return;
    }

    onOpenEditorWithoutChanges?.();
  }, [isExpanded, onOpenEditorWithoutChanges]);

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
      <div className="flex h-[100dvh] w-full justify-center px-0 sm:px-4">
        <div
          ref={modalPanelRef}
          tabIndex={-1}
          className="relative flex h-[100dvh] w-full max-w-[980px] flex-col overflow-hidden border-x border-white/10 bg-[linear-gradient(180deg,#fbf8ff_0%,#f4eeff_100%)] shadow-[0_20px_60px_rgba(0,0,0,0.25)]"
        >
          <button
            type="button"
            onClick={onClose}
            disabled={openingEditor}
            className="absolute right-3 z-30 inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/76 text-slate-700 shadow-[0_8px_24px_rgba(15,23,42,0.18)] backdrop-blur-md transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 disabled:cursor-not-allowed disabled:opacity-50 sm:right-4"
            style={{ top: "max(0.75rem, env(safe-area-inset-top))" }}
            aria-label="Cerrar modal"
          >
            <X className="h-4 w-4" />
          </button>

          <div className="flex min-h-0 flex-1 flex-col">
            <div
              className="relative min-h-[280px] overflow-hidden bg-white transition-[flex-basis] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] sm:min-h-[320px]"
              style={{ flexBasis: isExpanded ? "50%" : "100%" }}
            >
              <div className="absolute inset-0 bg-white">
                {shouldShowPreviewUrl ? (
                  <TemplatePreviewViewport
                    src={previewUrl}
                    sandbox="allow-scripts allow-same-origin"
                    title={`Vista previa de ${title}`}
                    onError={() => setPreviewUrlFailed(true)}
                  />
                ) : null}

                {shouldShowGeneratedPreview ? (
                  <TemplatePreviewViewport
                    srcDoc={previewHtml}
                    sandbox="allow-scripts"
                    title={`Vista previa de ${title}`}
                    iframeRef={previewFrameRef}
                  />
                ) : null}

                {!shouldShowPreviewUrl && (status === "idle" || status === "loading") && (
                  <div className="flex h-full items-center justify-center bg-slate-50">
                    <div className="flex items-center gap-2 text-sm text-slate-600">
                      <Loader2 className="h-4 w-4 animate-spin text-[#6f3bc0]" />
                      Cargando vista previa...
                    </div>
                  </div>
                )}

                {!shouldShowPreviewUrl && status === "error" && (
                  <div className="flex h-full items-center justify-center bg-[#fcfbff] px-6 text-center">
                    <p className="max-w-xl text-sm text-rose-600">{errorMessage}</p>
                  </div>
                )}

                {!shouldShowPreviewUrl && status === "ready" && !previewHtml ? (
                  <div className="flex h-full items-center justify-center bg-[#fcfbff] px-6 text-center">
                    <p className="max-w-xl text-sm text-rose-600">
                      No se pudo cargar la vista previa de esta plantilla.
                    </p>
                  </div>
                ) : null}
              </div>
              <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-[#120822]/24 via-transparent to-transparent sm:h-28" />
              <div
                className={`pointer-events-none absolute inset-x-0 bottom-0 transition-[height,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                  isExpanded
                    ? "h-36 bg-gradient-to-b from-transparent via-[#f7f1ff]/78 to-[#f7f1ff] opacity-100 sm:h-40"
                    : "h-28 bg-gradient-to-b from-transparent via-[#fbf8ff]/72 to-[#fbf8ff] opacity-100 sm:h-32"
                }`}
              />

              <div className="absolute inset-x-0 bottom-0 z-10 px-3 pb-3 sm:px-5 sm:pb-5">
                <div
                  className="relative overflow-hidden rounded-[22px] border border-white/28 bg-[linear-gradient(135deg,rgba(255,255,255,0.34)_0%,rgba(255,255,255,0.14)_52%,rgba(255,255,255,0.08)_100%)] p-3 shadow-[0_24px_54px_rgba(15,23,42,0.18)] backdrop-blur-[18px] sm:p-4"
                  style={{ borderTop: "1px solid rgba(0,0,0,0.06)" }}
                >
                  <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.42),transparent_42%),linear-gradient(180deg,rgba(255,255,255,0.08),transparent_55%)]" />
                  <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-white/55" />
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                    <div className="relative min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="mr-auto text-sm font-semibold text-slate-900 sm:text-base">{title}</p>
                        {badges.map((badge) => (
                          <span
                            key={badge}
                            className="rounded-full border border-white/35 bg-white/26 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.05em] text-[#5f3596] backdrop-blur-md"
                          >
                            {badge}
                          </span>
                        ))}
                      </div>

                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {features.map((feature) => (
                          <span
                            key={feature}
                            className="rounded-full border border-white/30 bg-white/20 px-2 py-0.5 text-[11px] font-medium text-[#5d2f9f] backdrop-blur-md"
                          >
                            {feature}
                          </span>
                        ))}
                        {(categories.length ? categories : ["Evento"]).map((category) => (
                          <span
                            key={category}
                            className="rounded-full border border-white/28 bg-white/18 px-2 py-0.5 text-[11px] text-slate-700 backdrop-blur-md"
                          >
                            {category}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="relative flex flex-wrap gap-2 lg:justify-end">
                      <button
                        type="button"
                        onClick={() => setMode(isExpanded ? "collapsed" : "expanded")}
                        disabled={openingEditor}
                        className="inline-flex min-h-9 items-center justify-center rounded-lg border border-white/40 bg-white/18 px-3.5 py-2 text-[13px] font-semibold text-[#5f3596] shadow-[inset_0_1px_0_rgba(255,255,255,0.38)] transition hover:bg-white/30 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {isExpanded ? "Ocultar personalizacion" : "Personalizar datos del evento"}
                      </button>

                      <button
                        type="button"
                        onClick={handlePrimaryAction}
                        disabled={openingEditor}
                        className="inline-flex min-h-9 items-center justify-center rounded-lg bg-[linear-gradient(135deg,rgba(130,72,203,0.92)_0%,rgba(115,62,191,0.9)_52%,rgba(99,52,173,0.88)_100%)] px-3.5 py-2 text-[13px] font-semibold text-white shadow-[0_12px_26px_rgba(111,59,192,0.28),inset_0_1px_0_rgba(255,255,255,0.22)] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-70"
                      >
                        {openingEditor
                          ? "Creando borrador..."
                          : isExpanded
                            ? "Crear invitacion"
                            : "Editar plantilla"}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

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
                onSaveAndOpen={onOpenEditorWithChanges}
                openingEditor={openingEditor}
                mode={mode}
              />
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
