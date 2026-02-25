import { Trash2, X } from "lucide-react";

export default function DashboardCardDeleteButton({
  title,
  ariaLabel,
  isDeleting = false,
  disabled = false,
  onClick,
}) {
  const isDisabled = disabled || isDeleting;

  return (
    <button
      type="button"
      className="absolute right-2 top-2 z-20 inline-flex h-7 w-7 items-center justify-center rounded-[10px] border border-[#ead9fa]/95 bg-gradient-to-br from-[#fff6fb]/95 via-[#f7f1ff]/95 to-[#f1ecff]/95 text-[#8f3363] shadow-[0_8px_18px_rgba(84,45,145,0.16)] backdrop-blur transition-all duration-200 hover:-translate-y-0.5 hover:scale-[1.04] hover:border-[#dcc2f8] hover:text-[#742f8f] hover:shadow-[0_12px_22px_rgba(90,52,156,0.22)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6f3bc0] focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-70 [&_.icon-trash]:pointer-events-none [&_.icon-trash]:scale-75 [&_.icon-trash]:opacity-0 [&_.icon-trash]:transition-all [&_.icon-trash]:duration-200 [&_.icon-x]:transition-all [&_.icon-x]:duration-200 [&:focus-visible_.icon-trash]:scale-100 [&:focus-visible_.icon-trash]:opacity-100 [&:focus-visible_.icon-x]:scale-75 [&:focus-visible_.icon-x]:rotate-12 [&:focus-visible_.icon-x]:opacity-0 [&:hover_.icon-trash]:scale-100 [&:hover_.icon-trash]:opacity-100 [&:hover_.icon-x]:scale-75 [&:hover_.icon-x]:rotate-12 [&:hover_.icon-x]:opacity-0"
      onClick={onClick}
      disabled={isDisabled}
      title={title}
      aria-label={ariaLabel || title}
    >
      {isDeleting ? (
        <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-[#8f3363]/70 border-t-transparent" />
      ) : (
        <>
          <X className="icon-x h-3.5 w-3.5" />
          <Trash2 className="icon-trash absolute h-3.5 w-3.5 text-[#742f8f]" />
        </>
      )}
    </button>
  );
}
