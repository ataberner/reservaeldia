import { useEffect, useId, useMemo } from "react";
import { AlertTriangle, Trash2, X } from "lucide-react";
import { createPortal } from "react-dom";

function toNonEmptyString(value, fallback) {
  const normalized = String(value || "").trim();
  return normalized || fallback;
}

export default function ConfirmDeleteItemModal({
  isOpen,
  itemTypeLabel = "elemento",
  itemName = "",
  isDeleting = false,
  dialogTitle,
  dialogDescription,
  warningText,
  confirmButtonText,
  confirmingButtonText,
  onCancel,
  onConfirm,
}) {
  const dialogId = useId();
  const titleId = `${dialogId}-title`;
  const descriptionId = `${dialogId}-description`;

  const safeItemType = useMemo(() => toNonEmptyString(itemTypeLabel, "elemento"), [itemTypeLabel]);
  const safeItemName = useMemo(() => toNonEmptyString(itemName, "sin nombre"), [itemName]);
  const resolvedTitle = useMemo(
    () => toNonEmptyString(dialogTitle, `Eliminar ${safeItemType}`),
    [dialogTitle, safeItemType]
  );
  const resolvedDescription = useMemo(
    () =>
      toNonEmptyString(
        dialogDescription,
        `Se eliminara "${safeItemName}".`
      ),
    [dialogDescription, safeItemName]
  );
  const resolvedWarningText = useMemo(
    () => toNonEmptyString(warningText, "Esta accion no se puede deshacer."),
    [warningText]
  );
  const resolvedConfirmButtonText = useMemo(
    () => toNonEmptyString(confirmButtonText, `Eliminar ${safeItemType}`),
    [confirmButtonText, safeItemType]
  );
  const resolvedConfirmingButtonText = useMemo(
    () => toNonEmptyString(confirmingButtonText, "Eliminando..."),
    [confirmingButtonText]
  );

  useEffect(() => {
    if (!isOpen) return undefined;

    const html = document.documentElement;
    const body = document.body;
    const scrollRoot = document.querySelector('[data-dashboard-scroll-root="true"]');

    const previousHtmlOverflow = html.style.overflow;
    const previousOverflow = document.body.style.overflow;
    const previousBodyTouchAction = body.style.touchAction;
    const previousRootOverflow = scrollRoot?.style.overflow;
    const previousRootOverscroll = scrollRoot?.style.overscrollBehavior;
    const previousRootTouchAction = scrollRoot?.style.touchAction;

    const onKeyDown = (event) => {
      if (event.key === "Escape" && !isDeleting) {
        onCancel?.();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    html.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    body.style.touchAction = "none";
    if (scrollRoot) {
      scrollRoot.style.overflow = "hidden";
      scrollRoot.style.overscrollBehavior = "none";
      scrollRoot.style.touchAction = "none";
    }

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      html.style.overflow = previousHtmlOverflow;
      document.body.style.overflow = previousOverflow;
      body.style.touchAction = previousBodyTouchAction;
      if (scrollRoot) {
        scrollRoot.style.overflow = previousRootOverflow || "";
        scrollRoot.style.overscrollBehavior = previousRootOverscroll || "";
        scrollRoot.style.touchAction = previousRootTouchAction || "";
      }
    };
  }, [isOpen, isDeleting, onCancel]);

  if (!isOpen || typeof document === "undefined") return null;

  const modalContent = (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-[#1f1238]/58 p-4 backdrop-blur-[3px]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !isDeleting) {
          onCancel?.();
        }
      }}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className="relative w-full max-w-md overflow-hidden rounded-[26px] border border-[#e6daf8] bg-white text-slate-800 shadow-[0_34px_86px_rgba(45,24,88,0.34)]"
      >
        <div
          className="pointer-events-none absolute inset-0"
          aria-hidden="true"
        >
          <div className="absolute -left-24 -top-20 h-44 w-44 rounded-full bg-[#e8d8ff]/75 blur-3xl" />
          <div className="absolute -right-24 -bottom-20 h-44 w-44 rounded-full bg-[#d7e7ff]/65 blur-3xl" />
        </div>

        <div className="relative border-b border-[#ece4fb] bg-gradient-to-r from-white via-[#faf6ff] to-[#f4f8ff] px-4 pb-3 pt-3.5">
          <button
            type="button"
            onClick={onCancel}
            disabled={isDeleting}
            className="absolute right-3 top-3 inline-flex h-7 w-7 items-center justify-center rounded-lg border border-[#dfd3f4] bg-white text-[#6f3bc0] transition hover:bg-[#f5edff] disabled:cursor-not-allowed disabled:opacity-60"
            aria-label="Cerrar modal"
          >
            <X className="h-3.5 w-3.5" />
          </button>

          <div className="flex items-start gap-2.5 pr-8">
            <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#ffeaf1] via-[#ffe6ee] to-[#ffdce8] text-[#b4235b] shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_8px_18px_rgba(180,35,91,0.2)]">
              <AlertTriangle className="h-4 w-4" />
            </div>
            <div>
              <h2 id={titleId} className="text-sm font-semibold text-slate-900">
                {resolvedTitle}
              </h2>
              <p id={descriptionId} className="mt-0.5 text-xs text-slate-600">
                {resolvedDescription}
              </p>
            </div>
          </div>
        </div>

        <div className="relative px-4 py-3">
          <div className="rounded-xl border border-[#f2d3df] bg-gradient-to-r from-[#fff8fb] via-[#fff5fa] to-[#fff1f7] px-3 py-2.5 text-xs text-[#7f3654]">
            {resolvedWarningText}
          </div>
        </div>

        <div className="relative flex items-center justify-end gap-2 px-4 pb-4">
          <button
            type="button"
            onClick={onCancel}
            disabled={isDeleting}
            className="rounded-xl border border-[#d9ccef] bg-white px-3.5 py-2 text-xs font-medium text-slate-700 transition hover:bg-[#f8f3ff] disabled:cursor-not-allowed disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isDeleting}
            className="inline-flex items-center gap-1.5 rounded-xl border border-[#d4b2d1] bg-gradient-to-r from-[#cf3d75] via-[#bb3468] to-[#a92f5f] px-3.5 py-2 text-xs font-semibold text-white shadow-[0_14px_28px_rgba(170,47,95,0.32)] transition hover:from-[#c2366c] hover:via-[#ad2f61] hover:to-[#9a2956] disabled:cursor-not-allowed disabled:opacity-80"
          >
            {isDeleting ? (
              <>
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/80 border-t-transparent" />
                {resolvedConfirmingButtonText}
              </>
            ) : (
              <>
                <Trash2 className="h-4 w-4" />
                {resolvedConfirmButtonText}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
