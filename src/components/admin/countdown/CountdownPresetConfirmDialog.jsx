import { useEffect, useRef } from "react";

export default function CountdownPresetConfirmDialog({
  confirmation,
  busy = false,
  onCancel,
  onConfirm,
}) {
  const cancelRef = useRef(null);
  const dialogRef = useRef(null);

  useEffect(() => {
    if (!confirmation) return undefined;
    const previousFocus = document.activeElement;
    cancelRef.current?.focus();
    const handleKeyDown = (event) => {
      if (event.key === "Escape" && !busy) onCancel?.();
      if (event.key !== "Tab") return;
      const focusable = Array.from(
        dialogRef.current?.querySelectorAll(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        ) || []
      );
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      previousFocus?.focus?.();
    };
  }, [busy, confirmation, onCancel]);

  if (!confirmation) return null;
  const destructive = confirmation.tone === "danger";

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/45 p-4"
      role="presentation"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target && !busy) onCancel?.();
      }}
    >
      <section
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="countdown-confirm-title"
        aria-describedby="countdown-confirm-description"
        className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl"
      >
        <h2
          id="countdown-confirm-title"
          className="text-base font-semibold text-slate-950"
        >
          {confirmation.title}
        </h2>
        <p
          id="countdown-confirm-description"
          className="mt-2 text-sm leading-6 text-slate-600"
        >
          {confirmation.description}
        </p>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="min-h-11 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 outline-none hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-violet-500 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className={`min-h-11 rounded-lg px-4 py-2 text-sm font-semibold text-white outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-50 ${
              destructive
                ? "bg-rose-700 hover:bg-rose-800 focus-visible:ring-rose-600"
                : "bg-violet-700 hover:bg-violet-800 focus-visible:ring-violet-600"
            }`}
          >
            {busy ? "Procesando…" : confirmation.confirmLabel || "Confirmar"}
          </button>
        </div>
      </section>
    </div>
  );
}
