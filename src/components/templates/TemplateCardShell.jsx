import {
  DASHBOARD_INVITATION_CARD_CLASS,
  DASHBOARD_INVITATION_CARD_MEDIA_CLASS,
  DASHBOARD_INVITATION_CARD_TITLE_CLASS,
} from "@/components/dashboard/dashboardStyleClasses";

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
    <article className={DASHBOARD_INVITATION_CARD_CLASS}>
      {deleteControl}

      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className="block w-full rounded-2xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6f3bc0] focus-visible:ring-offset-0 disabled:cursor-not-allowed"
        aria-label={title ? `Abrir plantilla ${title}` : "Abrir plantilla"}
      >
        <div className="relative aspect-square overflow-hidden bg-gray-100">
          <img
            src={imageSrc || "/placeholder.jpg"}
            alt={imageAlt || title || "Vista previa de plantilla"}
            className={DASHBOARD_INVITATION_CARD_MEDIA_CLASS}
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
          <div className="dashboard-invitation-card__overlay pointer-events-none absolute inset-0 bg-gradient-to-t from-[#2d1a4a]/18 via-transparent to-transparent motion-reduce:transition-none" />
          {imageOverlay}
        </div>

        <div className="space-y-3 p-3">
          <div>
            <h3
              className={DASHBOARD_INVITATION_CARD_TITLE_CLASS}
              title={title}
            >
              {title || "Plantilla"}
            </h3>
            {summary}
          </div>

          {footer ? (
            footer
          ) : actionLabel ? (
            <p className="dashboard-invitation-card__action text-[11px] font-semibold uppercase tracking-[0.08em] text-[#6f3bc0]">
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
