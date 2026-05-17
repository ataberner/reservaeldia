import { useEffect } from "react";
import styles from "./LandingTemplateShowcase.module.css";

function normalizeText(value) {
  return String(value || "").trim();
}

function resolveAction(action, item) {
  const resolved = typeof action === "function" ? action(item) : action;
  if (!resolved) return null;
  if (typeof resolved === "string") {
    const label = normalizeText(resolved);
    return label ? { label } : null;
  }
  if (typeof resolved !== "object") return null;

  const label = normalizeText(resolved.label);
  if (!label) return null;

  return {
    label,
    onClick: typeof resolved.onClick === "function" ? resolved.onClick : null,
    disabled: resolved.disabled === true,
    ariaLabel: normalizeText(resolved.ariaLabel),
    tone: normalizeText(resolved.tone),
  };
}

function resolveImageSrc(value) {
  const src = normalizeText(value);
  return src || "/placeholder.jpg";
}

export function LandingTemplateCarouselBlock({
  id = "",
  children,
  ariaBusy = false,
  variant = "default",
}) {
  const rootClassName =
    variant === "dashboard"
      ? `${styles.root} ${styles.rootWhite} ${styles.rootDashboard}`
      : variant === "white"
        ? `${styles.root} ${styles.rootWhite}`
        : styles.root;

  return (
    <section
      id={id || undefined}
      className={rootClassName}
      aria-busy={ariaBusy || undefined}
    >
      <div className={styles.inner}>{children}</div>
    </section>
  );
}

export function LandingTemplateCarouselRail({
  sectionId,
  titleBase,
  titleAccent,
  items,
  getItemKey,
  getTitle,
  getImageSrc,
  getImageAlt,
  onImageClick,
  primaryAction,
  secondaryAction,
  tertiaryAction,
  headerAddon = null,
  renderWhenEmpty = false,
}) {
  const safeItems = Array.isArray(items) ? items : [];
  if (!safeItems.length && !renderWhenEmpty) return null;

  const safeSectionId = normalizeText(sectionId) || "landing-template-carousel";
  const titleId = `${safeSectionId}-title`;

  return (
    <section
      id={safeSectionId}
      className={styles.railSection}
      aria-labelledby={titleId}
    >
      <div className={styles.railHeader}>
        <h2 id={titleId} className={styles.railTitle}>
          <span className={styles.railTitleBase}>{titleBase}</span>
          {titleAccent ? (
            <span className={styles.railTitleAccent}>{titleAccent}</span>
          ) : null}
        </h2>
        {headerAddon}
      </div>

      <div className={styles.railViewport}>
        <div className={styles.railTrack}>
          {safeItems.map((item, index) => {
            const title = normalizeText(getTitle?.(item, index)) || "Plantilla";
            const imageSrc = resolveImageSrc(getImageSrc?.(item, index));
            const imageAlt =
              normalizeText(getImageAlt?.(item, index)) ||
              `Vista previa de ${title}`;
            const primary = resolveAction(primaryAction, item);
            const secondary = resolveAction(secondaryAction, item);
            const tertiary = resolveAction(tertiaryAction, item);
            const actions = [primary, secondary, tertiary].filter(Boolean);
            const hasActions = actions.length > 0;
            const itemKey =
              normalizeText(getItemKey?.(item, index)) ||
              normalizeText(item?.id || item?.slug || item?.publicSlug) ||
              String(index);

            return (
              <article key={`${safeSectionId}-${itemKey}`} className={styles.templateCard}>
                <button
                  type="button"
                  className={styles.previewButton}
                  onClick={() => onImageClick?.(item)}
                  aria-label={`Ver vista previa de ${title}`}
                >
                  <img
                    src={imageSrc}
                    alt={imageAlt}
                    className={styles.previewImage}
                    loading={index === 0 ? "eager" : "lazy"}
                    decoding="async"
                    fetchPriority={index === 0 ? "high" : "auto"}
                    onError={(event) => {
                      const image = event.currentTarget;
                      if (image.dataset.fallbackApplied === "1") return;
                      image.dataset.fallbackApplied = "1";
                      image.src = "/placeholder.jpg";
                    }}
                  />
                </button>

                <div className={styles.cardCopy}>
                  <h3 className={styles.cardTitle} title={title}>
                    {title}
                  </h3>

                  {hasActions ? (
                    <div
                      className={styles.cardActions}
                      data-action-count={actions.length}
                    >
                      {actions.map((action, actionIndex) => (
                        <span
                          key={`${itemKey}-action-${actionIndex}`}
                          className={styles.cardActionItem}
                        >
                          {actionIndex > 0 ? (
                            <span
                              className={styles.actionDivider}
                              aria-hidden="true"
                            />
                          ) : null}
                          <button
                            type="button"
                            className={`${actionIndex === 0 ? styles.useButton : styles.previewAction} ${
                              action.tone === "danger" ? styles.dangerAction : ""
                            }`}
                            onClick={() => action.onClick?.(item)}
                            disabled={action.disabled}
                            aria-label={action.ariaLabel || undefined}
                          >
                            {action.label}
                          </button>
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export function LandingTemplatePreviewDialog({
  item,
  onClose,
  onUse,
  getTitle,
  getImageSrc,
  getImageAlt,
  useLabel = "Usar plantilla",
}) {
  useEffect(() => {
    if (!item || typeof window === "undefined") return undefined;

    const handleKeyDown = (event) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onClose?.();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose, item]);

  if (!item) return null;

  const title = normalizeText(getTitle?.(item)) || "Plantilla";
  const imageSrc = resolveImageSrc(getImageSrc?.(item));
  const imageAlt =
    normalizeText(getImageAlt?.(item)) || `Vista previa ampliada de ${title}`;

  return (
    <div
      className={styles.previewModalBackdrop}
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose?.();
        }
      }}
    >
      <div
        className={styles.previewModal}
        role="dialog"
        aria-modal="true"
        aria-labelledby="landing-template-preview-title"
      >
        <button
          type="button"
          className={styles.previewModalClose}
          onClick={onClose}
          aria-label="Cerrar vista previa"
        >
          x
        </button>

        <div className={styles.previewModalImageFrame}>
          <img
            src={imageSrc}
            alt={imageAlt}
            className={styles.previewModalImage}
            onError={(event) => {
              const image = event.currentTarget;
              if (image.dataset.fallbackApplied === "1") return;
              image.dataset.fallbackApplied = "1";
              image.src = "/placeholder.jpg";
            }}
          />
        </div>

        <div className={styles.previewModalFooter}>
          <h3 id="landing-template-preview-title" className={styles.previewModalTitle}>
            {title}
          </h3>
          {onUse ? (
            <button
              type="button"
              className={styles.previewModalUse}
              onClick={() => {
                onClose?.();
                onUse?.(item);
              }}
            >
              {useLabel}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
