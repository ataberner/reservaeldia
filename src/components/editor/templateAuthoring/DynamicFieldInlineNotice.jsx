import { useEffect, useMemo } from "react";
import { ArrowRight, X } from "lucide-react";

export default function DynamicFieldInlineNotice({
  notice,
  anchorRef,
  isMobile = false,
  onGoToField,
  onClose,
}) {
  useEffect(() => {
    if (!notice) return undefined;
    const onKeyDown = (event) => {
      if (event.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [notice, onClose]);

  const desktopPosition = useMemo(() => {
    const rect = anchorRef?.current?.getBoundingClientRect?.();
    if (!rect) return { left: 16, top: 16 };
    const width = 340;
    const left = Math.max(12, Math.min(rect.left - width + rect.width, window.innerWidth - width - 12));
    const top = Math.max(12, Math.min(rect.bottom + 10, window.innerHeight - 150));
    return { left, top };
  }, [anchorRef, notice]);

  if (!notice) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed z-[120] border border-[#d7c4f3] bg-white p-3 text-[#3f2d55] shadow-xl motion-reduce:transition-none ${
        isMobile
          ? "inset-x-3 bottom-[max(12px,env(safe-area-inset-bottom))] rounded-2xl"
          : "w-[340px] rounded-xl"
      }`}
      style={isMobile ? undefined : desktopPosition}
      data-preserve-canvas-selection="true"
    >
      <button
        type="button"
        onClick={onClose}
        className="absolute right-1 top-1 flex h-10 w-10 items-center justify-center rounded-full text-[#6f5b82] hover:bg-[#f5effd] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#773dbe]"
        aria-label="Cerrar aviso"
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
      <p className="pr-9 text-sm font-semibold">
        Este texto se edita desde los datos de la invitación ·
      </p>
      <button
        type="button"
        onClick={onGoToField}
        className="mt-2 inline-flex min-h-10 items-center gap-1.5 rounded-lg px-2 text-sm font-semibold text-[#6f3bc0] hover:bg-[#f5effd] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#773dbe]"
      >
        Ir al campo
        <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}
