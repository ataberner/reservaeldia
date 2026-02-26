import { Trash2 } from "lucide-react";

export default function DashboardCardTrashButton({
  title = "Mover a papelera",
  ariaLabel,
  isPending = false,
  isDeleting = false,
  disabled = false,
  placement = "floating",
  className = "",
  onClick,
}) {
  const pending = isPending || isDeleting;
  const isDisabled = disabled || pending;
  const isInline = placement === "inline";
  const positionClass = isInline
    ? "relative z-20"
    : "absolute right-2 top-2 z-20";

  return (
    <button
      type="button"
      className={`group/trash ${positionClass} inline-flex h-7 w-7 items-center justify-center rounded-[10px] border border-[#f7c9d0]/95 bg-gradient-to-br from-[#fff5f7]/95 via-[#ffe3e8]/95 to-[#ffd2db]/95 text-[#a13a4b] shadow-[0_8px_18px_rgba(161,58,75,0.2)] backdrop-blur transition-all duration-200 hover:-translate-y-0.5 hover:scale-[1.04] hover:border-[#efb2be] hover:text-[#8c2f40] hover:shadow-[0_12px_22px_rgba(161,58,75,0.28)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b33b52] focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-70 ${className}`}
      onClick={onClick}
      disabled={isDisabled}
      title={title}
      aria-label={ariaLabel || title}
    >
      {pending ? (
        <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-[#a13a4b]/75 border-t-transparent" />
      ) : (
        <Trash2 className="h-3.5 w-3.5 transition-transform duration-200 group-hover/trash:scale-[1.08] group-focus-visible/trash:scale-[1.08]" />
      )}
    </button>
  );
}
