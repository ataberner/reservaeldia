const CARD_CLASS =
  "group relative overflow-hidden rounded-2xl border border-gray-200/90 bg-white shadow-[0_2px_8px_rgba(15,23,42,0.06)] transition-all duration-300 ease-out hover:-translate-y-0.5 hover:border-white hover:ring-1 hover:ring-white hover:shadow-[0_16px_30px_rgba(111,59,192,0.16)] focus-within:-translate-y-0.5 focus-within:border-white focus-within:ring-1 focus-within:ring-white focus-within:shadow-[0_16px_30px_rgba(111,59,192,0.16)]";

export default function TemplateCardShell({
  title,
  imageSrc,
  imageAlt,
  onClick,
  actionLabel = "",
  onImageSettled,
  eager = false,
  disabled = false,
  deleteControl = null,
  imageOverlay = null,
  summary = null,
  footer = null,
  bottomActions = null,
}) {
  return (
    <article className={CARD_CLASS}>
      {deleteControl}

      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className="block w-full rounded-2xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6f3bc0] focus-visible:ring-offset-2 disabled:cursor-not-allowed"
        aria-label={title ? `Abrir plantilla ${title}` : "Abrir plantilla"}
      >
        <div className="relative aspect-square overflow-hidden bg-gray-100">
          <img
            src={imageSrc || "/placeholder.jpg"}
            alt={imageAlt || title || "Vista previa de plantilla"}
            className="h-full w-full object-cover object-top transition-transform duration-500 ease-out group-hover:scale-[1.03] group-focus-within:scale-[1.03] motion-reduce:transition-none"
            loading={eager ? "eager" : "lazy"}
            decoding="async"
            fetchPriority={eager ? "high" : "auto"}
            onLoad={onImageSettled}
            onError={(event) => {
              const img = event.currentTarget;
              if (img.dataset.fallbackApplied === "1") {
                onImageSettled?.();
                return;
              }
              img.dataset.fallbackApplied = "1";
              img.src = "/placeholder.jpg";
            }}
          />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#2d1a4a]/18 via-transparent to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100 group-focus-within:opacity-100 motion-reduce:transition-none" />
          {imageOverlay}
        </div>

        <div className="space-y-3 p-3">
          <div>
            <h3
              className="truncate text-sm font-semibold text-gray-800 transition-colors duration-200 group-hover:text-[#4d2b86] group-focus-within:text-[#4d2b86]"
              title={title}
            >
              {title || "Plantilla"}
            </h3>
            {summary}
          </div>

          {footer ? (
            footer
          ) : actionLabel ? (
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#6f3bc0] transition-all duration-200 group-hover:translate-x-0.5 group-hover:text-[#5a2daa] group-focus-within:translate-x-0.5 group-focus-within:text-[#5a2daa]">
              {actionLabel}
            </p>
          ) : null}
        </div>
      </button>

      {bottomActions ? (
        <div className="border-t border-gray-100 px-3 pb-3 pt-2">
          {bottomActions}
        </div>
      ) : null}
    </article>
  );
}
