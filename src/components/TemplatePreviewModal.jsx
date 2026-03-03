import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2, Star, X } from "lucide-react";
import { resolveTemplatePreviewSource } from "@/domain/templates/preview";
import TemplateEventForm from "@/components/templates/TemplateEventForm";
import {
  buildPreviewOperationsForField,
  buildPreviewPatchMessage,
} from "@/domain/templates/previewLivePatch";

function toText(value, fallback = "") {
  const safe = String(value || "").trim();
  return safe || fallback;
}

function toList(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
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
  const inputPatchTimersRef = useRef({});
  const [previewUrlFailed, setPreviewUrlFailed] = useState(false);
  const status = toText(previewStatus?.status, previewHtml ? "ready" : "idle");
  const errorMessage = toText(
    previewStatus?.error,
    "No se pudo cargar la vista previa de esta plantilla."
  );

  const title = toText(metadata?.title, toText(template?.nombre, "Plantilla"));
  const badges = toList(metadata?.badges);
  const features = toList(metadata?.features);
  const categories = toList(metadata?.categories);
  const rating = Number(metadata?.rating);
  const safeRating = Number.isFinite(rating) ? rating.toFixed(1) : "4.8";
  const popularity = toText(metadata?.popularity, "96% recomendada");
  const previewSource = resolveTemplatePreviewSource(template);
  const previewUrl = previewSource.mode === "url" ? previewSource.previewUrl : null;
  const hasPreviewUrl = Boolean(previewUrl);
  const usePreviewUrl = hasPreviewUrl && !previewUrlFailed;
  const fieldsCount = Array.isArray(template?.fieldsSchema) ? template.fieldsSchema.length : 0;
  const defaultsCount =
    template?.defaults && typeof template.defaults === "object"
      ? Object.keys(template.defaults).length
      : 0;
  const hasGalleryRules = Boolean(
    template?.galleryRules &&
    typeof template.galleryRules === "object" &&
    Object.keys(template.galleryRules).length > 0
  );
  const shouldShowGeneratedPreview = status === "ready" && Boolean(previewHtml);
  const shouldShowPreviewUrl = usePreviewUrl && !shouldShowGeneratedPreview && status !== "loading";
  const canPatchPreview = shouldShowGeneratedPreview;

  useEffect(() => {
    setPreviewUrlFailed(false);
  }, [previewUrl]);

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
    if (!visible || typeof document === "undefined") return undefined;

    const onKeyDown = (event) => {
      if (event.key !== "Escape" || openingEditor) return;
      onClose?.();
    };

    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("keydown", onKeyDown);
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

  if (!visible || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[10000] bg-[#160a2b]/66 backdrop-blur-[2px]"
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
      <div className="h-full w-full p-0 sm:p-4">
        <div
          ref={modalPanelRef}
          className="relative mx-auto flex h-full w-full max-w-[980px] flex-col overflow-hidden bg-[#f7f4ff] shadow-[0_28px_90px_rgba(15,23,42,0.34)] sm:h-[94vh] sm:rounded-[26px]"
        >
          <button
            type="button"
            onClick={onClose}
            disabled={openingEditor}
            className="absolute right-3 z-20 inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/76 text-slate-700 shadow-[0_8px_24px_rgba(15,23,42,0.18)] backdrop-blur-md transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 disabled:cursor-not-allowed disabled:opacity-50 sm:hidden"
            style={{ top: "max(0.75rem, env(safe-area-inset-top))" }}
            aria-label="Cerrar modal"
          >
            <X className="h-4 w-4" />
          </button>

          <div className="flex-1 overflow-y-auto px-3 pb-5 pt-3 sm:px-5 sm:pb-6 sm:pt-4">
            <div className="relative overflow-hidden">
              <div className="h-[42dvh] max-h-[50vh] min-h-[220px] bg-white sm:h-[46vh]">
                {shouldShowPreviewUrl ? (
                  <iframe
                    src={previewUrl}
                    sandbox="allow-scripts allow-same-origin"
                    title={`Vista previa de ${title}`}
                    className="h-full w-full border-0"
                    onError={() => setPreviewUrlFailed(true)}
                  />
                ) : null}

                {shouldShowGeneratedPreview ? (
                  <iframe
                    ref={previewFrameRef}
                    srcDoc={previewHtml}
                    sandbox="allow-scripts"
                    title={`Vista previa de ${title}`}
                    className="h-full w-full border-0"
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
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-b from-transparent via-[#f7f4ff]/80 to-[#f7f4ff]" />
            </div>

            <div className="-mt-8 space-y-2 px-0.5 text-xs sm:text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <p className="mr-1 text-sm font-semibold text-slate-900 sm:text-base">{title}</p>
                {badges.map((badge) => (
                  <span
                    key={badge}
                    className="rounded-full bg-[#efe8fb] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.05em] text-[#6f3bc0]"
                  >
                    {badge}
                  </span>
                ))}
                <span className="inline-flex items-center gap-1 rounded-full bg-[#fff6da] px-2 py-0.5 font-semibold text-[#8a6410]">
                  <Star className="h-3.5 w-3.5 fill-current" />
                  {safeRating}
                </span>
                <span className="rounded-full bg-[#edf4ff] px-2 py-0.5 text-[#1f4e9f]">{popularity}</span>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {features.map((feature) => (
                  <span
                    key={feature}
                    className="rounded-full bg-[#f0e9fb] px-2 py-0.5 text-[11px] font-medium text-[#5d2f9f]"
                  >
                    {feature}
                  </span>
                ))}
                {(categories.length ? categories : ["Evento"]).map((category) => (
                  <span
                    key={category}
                    className="rounded-full bg-white/70 px-2 py-0.5 text-[11px] text-slate-700"
                  >
                    {category}
                  </span>
                ))}
              </div>

              <TemplateEventForm
                template={template}
                formState={formState}
                onFormStateChange={onFormStateChange}
                onLiveFieldUpdate={handleLiveFieldUpdate}
                onSaveAndOpen={onOpenEditorWithChanges}
                onOpenWithoutChanges={onOpenEditorWithoutChanges}
                openingEditor={openingEditor}
              />

              <p className="pt-2 text-[11px] text-slate-500">
                Cerrar modal: tecla Esc o click fuera del contenido. Campos: {fieldsCount}. Defaults: {defaultsCount}.
                {hasGalleryRules ? " Incluye reglas de galeria." : ""}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
