import { useEffect, useMemo, useState } from "react";
import { listTemplates } from "@/domain/templates/service";
import styles from "./LandingTemplateShowcase.module.css";

const PREFERRED_TAG_ORDER = ["populares", "boda"];

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeTagSlug(value) {
  return normalizeText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeTags(value) {
  if (!Array.isArray(value)) return [];

  const seen = new Set();
  return value
    .map((tag) => normalizeText(tag))
    .filter(Boolean)
    .filter((tag) => {
      const slug = normalizeTagSlug(tag);
      if (!slug || seen.has(slug)) return false;
      seen.add(slug);
      return true;
    });
}

function compareTagSections(left, right) {
  const leftIndex = PREFERRED_TAG_ORDER.indexOf(left.tagSlug);
  const rightIndex = PREFERRED_TAG_ORDER.indexOf(right.tagSlug);

  if (leftIndex !== -1 || rightIndex !== -1) {
    if (leftIndex === -1) return 1;
    if (rightIndex === -1) return -1;
    return leftIndex - rightIndex;
  }

  return left.tagLabel.localeCompare(right.tagLabel, "es");
}

function getTemplateSectionTitlePrefix(section) {
  if (section?.tagSlug === "populares") return "Invitaciones ";
  return "Invitaciones de ";
}

function buildTemplateTagSections(templates) {
  const grouped = new Map();

  (Array.isArray(templates) ? templates : []).forEach((template) => {
    normalizeTags(template?.tags).forEach((tagLabel) => {
      const tagSlug = normalizeTagSlug(tagLabel);
      if (!tagSlug) return;

      const section = grouped.get(tagSlug) || {
        tagSlug,
        tagLabel,
        items: [],
      };
      section.items.push(template);
      grouped.set(tagSlug, section);
    });
  });

  return Array.from(grouped.values())
    .filter((section) => section.items.length > 0)
    .sort(compareTagSections);
}

function TemplateRail({ section, onUseTemplate, onPreviewTemplate }) {
  return (
    <section
      className={styles.railSection}
      aria-labelledby={`landing-template-section-${section.tagSlug}`}
    >
      <h2
        id={`landing-template-section-${section.tagSlug}`}
        className={styles.railTitle}
      >
        <span className={styles.railTitleBase}>
          {getTemplateSectionTitlePrefix(section)}
        </span>
        <span className={styles.railTitleAccent}>{section.tagLabel}</span>
      </h2>

      <div className={styles.railViewport}>
        <div className={styles.railTrack}>
          {section.items.map((template, index) => (
            <article
              key={`${section.tagSlug}-${template?.id || template?.slug || index}`}
              className={styles.templateCard}
            >
              <button
                type="button"
                className={styles.previewButton}
                onClick={() => onPreviewTemplate?.(template)}
                aria-label={`Ver vista previa de ${template?.nombre || "plantilla"}`}
              >
                <img
                  src={template?.portada || "/placeholder.jpg"}
                  alt={`Vista previa de ${template?.nombre || "plantilla"}`}
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
                <h3 className={styles.cardTitle} title={template?.nombre || "Plantilla"}>
                  {template?.nombre || "Plantilla"}
                </h3>

                <div className={styles.cardActions}>
                  <button
                    type="button"
                    className={styles.useButton}
                    onClick={() => onUseTemplate?.(template)}
                  >
                    Usar plantilla
                  </button>
                  <span className={styles.actionDivider} aria-hidden="true" />
                  <button
                    type="button"
                    className={styles.previewAction}
                    onClick={() => onPreviewTemplate?.(template)}
                  >
                    Vista previa
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function TemplatePreviewDialog({ template, onClose, onUseTemplate }) {
  useEffect(() => {
    if (!template || typeof window === "undefined") return undefined;

    const handleKeyDown = (event) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onClose?.();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose, template]);

  if (!template) return null;

  const title = template?.nombre || "Plantilla";

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
            src={template?.portada || "/placeholder.jpg"}
            alt={`Vista previa ampliada de ${title}`}
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
          <button
            type="button"
            className={styles.previewModalUse}
            onClick={() => {
              onClose?.();
              onUseTemplate?.(template);
            }}
          >
            Usar plantilla
          </button>
        </div>
      </div>
    </div>
  );
}

export default function LandingTemplateShowcase({
  tipo = "boda",
  onUseTemplate,
}) {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [previewTemplate, setPreviewTemplate] = useState(null);

  useEffect(() => {
    let cancelled = false;

    const loadTemplates = async () => {
      setLoading(true);
      setError("");

      try {
        const items = await listTemplates({ tipo });
        if (cancelled) return;
        setTemplates(Array.isArray(items) ? items : []);
      } catch (loadError) {
        if (cancelled) return;
        setTemplates([]);
        setError(loadError?.message || "No se pudieron cargar las plantillas.");
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void loadTemplates();

    return () => {
      cancelled = true;
    };
  }, [tipo]);

  const sections = useMemo(() => buildTemplateTagSections(templates), [templates]);

  if (loading) {
    return (
      <section id="plantillas" className={styles.root} aria-busy="true">
        <div className={styles.inner}>
          <div className={styles.loadingState}>Cargando plantillas...</div>
        </div>
      </section>
    );
  }

  if (error || sections.length === 0) {
    return (
      <section id="plantillas" className={styles.root}>
        <div className={styles.inner}>
          <div className={styles.emptyState}>
            {error || "Pronto vas a poder explorar nuevas plantillas."}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section id="plantillas" className={styles.root}>
      <div className={styles.inner}>
        {sections.map((section) => (
          <TemplateRail
            key={section.tagSlug}
            section={section}
            onUseTemplate={onUseTemplate}
            onPreviewTemplate={setPreviewTemplate}
          />
        ))}
      </div>

      <TemplatePreviewDialog
        template={previewTemplate}
        onClose={() => setPreviewTemplate(null)}
        onUseTemplate={onUseTemplate}
      />
    </section>
  );
}
