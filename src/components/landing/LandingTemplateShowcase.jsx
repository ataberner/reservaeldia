import { useEffect, useMemo, useState } from "react";
import { listTemplates } from "@/domain/templates/service";
import {
  LandingTemplateCarouselBlock,
  LandingTemplateCarouselRail,
  LandingTemplatePreviewDialog,
} from "./LandingTemplateCarouselPrimitives";
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
      <LandingTemplateCarouselBlock id="plantillas" ariaBusy>
        <div className={styles.loadingState}>Cargando plantillas...</div>
      </LandingTemplateCarouselBlock>
    );
  }

  if (error || sections.length === 0) {
    return (
      <LandingTemplateCarouselBlock id="plantillas">
        <div className={styles.emptyState}>
          {error || "Pronto vas a poder explorar nuevas plantillas."}
        </div>
      </LandingTemplateCarouselBlock>
    );
  }

  return (
    <LandingTemplateCarouselBlock id="plantillas">
      {sections.map((section) => (
        <LandingTemplateCarouselRail
          key={section.tagSlug}
          sectionId={`landing-template-section-${section.tagSlug}`}
          titleBase={getTemplateSectionTitlePrefix(section)}
          titleAccent={section.tagLabel}
          items={section.items}
          getItemKey={(template, index) => template?.id || template?.slug || index}
          getTitle={(template) => template?.nombre || "Plantilla"}
          getImageSrc={(template) => template?.portada || "/placeholder.jpg"}
          getImageAlt={(template) =>
            `Vista previa de ${template?.nombre || "plantilla"}`
          }
          onImageClick={setPreviewTemplate}
          primaryAction={(template) => ({
            label: "Usar plantilla",
            onClick: () => onUseTemplate?.(template),
          })}
          secondaryAction={(template) => ({
            label: "Vista previa",
            onClick: () => setPreviewTemplate(template),
          })}
        />
      ))}

      <LandingTemplatePreviewDialog
        item={previewTemplate}
        onClose={() => setPreviewTemplate(null)}
        onUse={onUseTemplate}
        getTitle={(template) => template?.nombre || "Plantilla"}
        getImageSrc={(template) => template?.portada || "/placeholder.jpg"}
        getImageAlt={(template) =>
          `Vista previa ampliada de ${template?.nombre || "Plantilla"}`
        }
      />
    </LandingTemplateCarouselBlock>
  );
}
