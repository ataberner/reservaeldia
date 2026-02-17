import { useEffect, useMemo } from "react";
import { AlertTriangle, Trash2 } from "lucide-react";

export default function ConfirmDeleteImagesModal({
  isOpen,
  selectedCount = 0,
  isDeleting = false,
  onCancel,
  onConfirm,
}) {
  useEffect(() => {
    if (!isOpen) return undefined;

    const previousOverflow = document.body.style.overflow;
    const onKeyDown = (event) => {
      if (event.key === "Escape" && !isDeleting) {
        onCancel?.();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen, isDeleting, onCancel]);

  const countLabel = useMemo(() => {
    const count = Number.isFinite(selectedCount) ? Math.max(0, selectedCount) : 0;
    return count === 1 ? "1 imagen" : `${count} imagenes`;
  }, [selectedCount]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[9999] bg-slate-900/60 backdrop-blur-[2px] flex items-center justify-center p-4"
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
        aria-labelledby="delete-images-title"
        aria-describedby="delete-images-description"
        className="w-full max-w-md rounded-2xl border border-slate-200 bg-white shadow-2xl overflow-hidden"
      >
        <div className="px-5 pt-5 pb-4 border-b border-slate-100">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-100 text-red-600 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h2 id="delete-images-title" className="text-base font-semibold text-slate-900">
                Borrar imagenes seleccionadas
              </h2>
              <p id="delete-images-description" className="mt-1 text-sm text-slate-600">
                Se van a eliminar <span className="font-medium text-slate-800">{countLabel}</span>.
              </p>
            </div>
          </div>
        </div>

        <div className="px-5 py-4">
          <p className="text-sm text-slate-600">
            Esta accion no se puede deshacer.
          </p>
        </div>

        <div className="px-5 pb-5 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={isDeleting}
            className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 text-sm font-medium hover:bg-slate-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isDeleting}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700 transition-colors disabled:opacity-80 disabled:cursor-not-allowed"
          >
            {isDeleting ? (
              <>
                <span className="w-4 h-4 rounded-full border-2 border-white/80 border-t-transparent animate-spin" />
                Borrando...
              </>
            ) : (
              <>
                <Trash2 className="w-4 h-4" />
                Eliminar
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
