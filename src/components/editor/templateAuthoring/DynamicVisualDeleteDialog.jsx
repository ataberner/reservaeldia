import { useEffect, useId, useMemo, useRef, useState } from "react";
import { AlertCircle, EyeOff, Loader2 } from "lucide-react";
import { createPortal } from "react-dom";

const DESKTOP_DIALOG_WIDTH = 340;
const DESKTOP_DIALOG_HEIGHT = 212;
const VIEWPORT_MARGIN = 12;
const ANCHOR_GAP = 12;

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

function normalizeAnchorRect(anchorRect) {
  if (!anchorRect || typeof anchorRect !== "object") return null;

  const left = Number(anchorRect.left);
  const top = Number(anchorRect.top);
  const width = Number(anchorRect.width);
  const height = Number(anchorRect.height);
  const right = Number(anchorRect.right);
  const bottom = Number(anchorRect.bottom);

  if (!Number.isFinite(left) || !Number.isFinite(top)) return null;

  const safeWidth = Number.isFinite(width) ? Math.max(0, width) : 0;
  const safeHeight = Number.isFinite(height) ? Math.max(0, height) : 0;

  return {
    left,
    top,
    right: Number.isFinite(right) ? right : left + safeWidth,
    bottom: Number.isFinite(bottom) ? bottom : top + safeHeight,
  };
}

export function computeDynamicVisualDeleteDialogPosition(
  anchorRect,
  viewport = {}
) {
  const viewportWidth = Number(viewport.width);
  const viewportHeight = Number(viewport.height);
  const safeWidth = Number.isFinite(viewportWidth)
    ? Math.max(0, viewportWidth)
    : DESKTOP_DIALOG_WIDTH + VIEWPORT_MARGIN * 2;
  const safeHeight = Number.isFinite(viewportHeight)
    ? Math.max(0, viewportHeight)
    : DESKTOP_DIALOG_HEIGHT + VIEWPORT_MARGIN * 2;
  const anchor = normalizeAnchorRect(anchorRect);

  if (!anchor) {
    return {
      left: clamp(
        (safeWidth - DESKTOP_DIALOG_WIDTH) / 2,
        VIEWPORT_MARGIN,
        safeWidth - DESKTOP_DIALOG_WIDTH - VIEWPORT_MARGIN
      ),
      top: clamp(
        (safeHeight - DESKTOP_DIALOG_HEIGHT) / 2,
        VIEWPORT_MARGIN,
        safeHeight - DESKTOP_DIALOG_HEIGHT - VIEWPORT_MARGIN
      ),
    };
  }

  const fitsOnRight =
    anchor.right + ANCHOR_GAP + DESKTOP_DIALOG_WIDTH + VIEWPORT_MARGIN <=
    safeWidth;
  const preferredLeft = fitsOnRight
    ? anchor.right + ANCHOR_GAP
    : anchor.left - DESKTOP_DIALOG_WIDTH - ANCHOR_GAP;

  return {
    left: clamp(
      preferredLeft,
      VIEWPORT_MARGIN,
      safeWidth - DESKTOP_DIALOG_WIDTH - VIEWPORT_MARGIN
    ),
    top: clamp(
      anchor.top,
      VIEWPORT_MARGIN,
      safeHeight - DESKTOP_DIALOG_HEIGHT - VIEWPORT_MARGIN
    ),
  };
}

function getFocusableElements(container) {
  if (!container) return [];

  return Array.from(
    container.querySelectorAll(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )
  ).filter((element) => element.getAttribute("aria-hidden") !== "true");
}

function normalizeFieldLabels(fieldLabels) {
  return Array.from(
    new Set(
      (Array.isArray(fieldLabels) ? fieldLabels : [])
        .map((label) => String(label || "").trim())
        .filter(Boolean)
    )
  );
}

function formatFieldLabels(fieldLabels) {
  const quotedLabels = fieldLabels.map((label) => `“${label}”`);
  if (quotedLabels.length <= 1) return quotedLabels[0] || "";
  if (quotedLabels.length === 2) return quotedLabels.join(" y ");
  return `${quotedLabels.slice(0, -1).join(", ")} y ${quotedLabels.at(-1)}`;
}

export function buildDynamicVisualDeleteDescription(fieldLabels) {
  const labels = normalizeFieldLabels(fieldLabels);
  if (labels.length === 1) {
    return `Vas a quitar ${formatFieldLabels(labels)} de la invitación. La información seguirá guardada. Si querés recuperarla, buscá ese campo en el panel de datos y tocá “Volver a insertar”.`;
  }
  if (labels.length > 1) {
    return `Vas a quitar ${formatFieldLabels(labels)} de la invitación. La información seguirá guardada. Si querés recuperarla, buscá cada campo en el panel de datos y tocá “Volver a insertar”.`;
  }
  return "Vas a quitar este contenido de la invitación. La información seguirá guardada. Si querés recuperarla, buscá el campo en el panel de datos y tocá “Volver a insertar”.";
}

export default function DynamicVisualDeleteDialog({
  isOpen,
  anchorRect = null,
  fieldLabels = [],
  isConfirming = false,
  error = "",
  onCancel,
  onConfirm,
  onRestoreFocus,
}) {
  const reactId = useId();
  const titleId = `${reactId}-dynamic-visual-delete-title`;
  const descriptionId = `${reactId}-dynamic-visual-delete-description`;
  const errorId = `${reactId}-dynamic-visual-delete-error`;
  const dialogRef = useRef(null);
  const cancelRef = useRef(null);
  const onCancelRef = useRef(onCancel);
  const onRestoreFocusRef = useRef(onRestoreFocus);
  const isConfirmingRef = useRef(isConfirming);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });

  useEffect(() => {
    onCancelRef.current = onCancel;
    onRestoreFocusRef.current = onRestoreFocus;
    isConfirmingRef.current = isConfirming;
  }, [isConfirming, onCancel, onRestoreFocus]);

  useEffect(() => {
    if (!isOpen || typeof window === "undefined") return undefined;

    const updateViewport = () => {
      setViewport({ width: window.innerWidth, height: window.innerHeight });
    };

    updateViewport();
    window.addEventListener("resize", updateViewport);

    return () => window.removeEventListener("resize", updateViewport);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || typeof document === "undefined") return undefined;

    const previouslyFocused = document.activeElement;
    const focusCancel = () => cancelRef.current?.focus?.({ preventScroll: true });
    const animationFrame = window.requestAnimationFrame(focusCancel);

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        if (!isConfirmingRef.current) onCancelRef.current?.();
        return;
      }

      if (event.key !== "Tab") return;

      const focusable = getFocusableElements(dialogRef.current);
      if (!focusable.length) {
        event.preventDefault();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const activeElement = document.activeElement;

      if (!dialogRef.current?.contains(activeElement)) {
        event.preventDefault();
        first.focus({ preventScroll: true });
      } else if (event.shiftKey && activeElement === first) {
        event.preventDefault();
        last.focus({ preventScroll: true });
      } else if (!event.shiftKey && activeElement === last) {
        event.preventDefault();
        first.focus({ preventScroll: true });
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      window.cancelAnimationFrame(animationFrame);
      document.removeEventListener("keydown", handleKeyDown);

      if (onRestoreFocusRef.current) {
        onRestoreFocusRef.current(previouslyFocused);
      } else if (previouslyFocused?.isConnected) {
        previouslyFocused.focus?.({ preventScroll: true });
      }
    };
  }, [isOpen]);

  const desktopPosition = useMemo(
    () => computeDynamicVisualDeleteDialogPosition(anchorRect, viewport),
    [anchorRect, viewport]
  );
  const description = useMemo(
    () => buildDynamicVisualDeleteDescription(fieldLabels),
    [fieldLabels]
  );

  if (!isOpen || typeof document === "undefined") return null;

  const describedBy = error
    ? `${descriptionId} ${errorId}`
    : descriptionId;

  return createPortal(
    <div
      className="fixed inset-0 z-[10020] bg-slate-950/20 backdrop-blur-[1px] motion-reduce:transition-none"
      role="presentation"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget && !isConfirming) onCancel?.();
      }}
    >
      <div
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={describedBy}
        aria-busy={isConfirming ? "true" : undefined}
        className="fixed inset-x-3 bottom-[max(12px,env(safe-area-inset-bottom))] mx-auto h-fit max-h-[calc(100dvh-24px)] w-auto max-w-[340px] overflow-y-auto rounded-[18px] border border-[#e5d9f5] bg-white p-[14px] text-slate-900 shadow-[0_18px_54px_rgba(45,24,88,0.24)] transition-[transform,opacity] duration-150 motion-reduce:transition-none sm:inset-x-auto sm:bottom-auto sm:left-[var(--dynamic-delete-left)] sm:top-[var(--dynamic-delete-top)] sm:mx-0 sm:w-[340px] sm:shadow-[0_22px_54px_rgba(45,24,88,0.3)]"
        style={{
          "--dynamic-delete-left": `${desktopPosition.left}px`,
          "--dynamic-delete-top": `${desktopPosition.top}px`,
        }}
      >
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <EyeOff
              className="h-4 w-4 shrink-0 text-[#692b9a]"
              aria-hidden="true"
            />
            <h2 id={titleId} className="text-base font-semibold text-slate-950">
              Quitar de la invitación
            </h2>
          </div>
          <p
            id={descriptionId}
            className="mt-1 text-sm leading-5 text-slate-600"
          >
            {description}
          </p>
        </div>

        {error ? (
          <div
            id={errorId}
            role="alert"
            className="mt-3 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{error}</span>
          </div>
        ) : null}

        <div className="mt-3 flex items-center justify-end gap-2">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            disabled={isConfirming}
            className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-xl border border-[#d9ccef] bg-white px-4 py-2 text-sm font-semibold text-slate-700 outline-none transition-colors hover:bg-[#f8f3ff] focus-visible:ring-2 focus-visible:ring-[#773dbe] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isConfirming}
            className="inline-flex min-h-10 min-w-10 items-center justify-center gap-2 rounded-xl bg-[#692b9a] px-4 py-2 text-sm font-semibold text-white outline-none transition-colors hover:bg-[#56217f] focus-visible:ring-2 focus-visible:ring-[#773dbe] focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-70 motion-reduce:transition-none"
          >
            {isConfirming ? (
              <>
                <Loader2
                  className="h-4 w-4 animate-spin motion-reduce:animate-none"
                  aria-hidden="true"
                />
                Quitando…
              </>
            ) : (
              "Quitar"
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
