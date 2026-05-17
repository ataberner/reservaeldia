import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import TemplatePreviewModal from "@/components/TemplatePreviewModal";
import {
  listTemplates,
  preparePublicTemplatePreview,
} from "@/domain/templates/service";
import { normalizeTemplateMetadata } from "@/domain/templates/metadata";
import {
  LandingTemplateCarouselBlock,
  LandingTemplateCarouselRail,
} from "./LandingTemplateCarouselPrimitives";
import styles from "./LandingTemplateShowcase.module.css";

const PREFERRED_TAG_ORDER = ["populares", "boda"];
const TEMPLATE_VISUAL_PREVIEW_AUTHORITY = "template-visual";
const EMPTY_TEMPLATE_PREVIEW_MODAL = Object.freeze({
  visible: false,
  template: null,
  metadata: {},
  previewHtml: "",
  previewStatus: {
    status: "idle",
    error: "",
    previewAuthority: TEMPLATE_VISUAL_PREVIEW_AUTHORITY,
  },
});

function normalizeText(value) {
  return String(value || "").trim();
}

function createTemplatePreviewStatus(status, error = "") {
  return {
    status: normalizeText(status) || "idle",
    error: normalizeText(error),
    previewAuthority: TEMPLATE_VISUAL_PREVIEW_AUTHORITY,
  };
}

function getErrorMessage(error, fallback) {
  const message = normalizeText(error?.message || error);
  return message || fallback;
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildCoverPreviewHtml(template) {
  const imageSrc = normalizeText(template?.portada);
  if (!imageSrc) return "";

  const title = normalizeText(template?.nombre) || "Plantilla";
  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <style>
    html,
    body {
      width: 100%;
      height: 100%;
      margin: 0;
      background: #fbf7f9;
      overflow: hidden;
    }

    body {
      display: flex;
      align-items: flex-start;
      justify-content: center;
      font-family: "DM Sans", Arial, sans-serif;
    }

    img {
      display: block;
      width: auto;
      max-width: 100%;
      height: 100%;
      object-fit: contain;
      object-position: top center;
    }
  </style>
</head>
<body>
  <img src="${escapeHtml(imageSrc)}" alt="${escapeHtml(title)}" />
</body>
</html>`;
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
  const [previewModal, setPreviewModal] = useState(EMPTY_TEMPLATE_PREVIEW_MODAL);
  const previewRequestRef = useRef(0);

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

  const closeTemplatePreview = useCallback(() => {
    previewRequestRef.current += 1;
    setPreviewModal(EMPTY_TEMPLATE_PREVIEW_MODAL);
  }, []);

  const openTemplatePreview = useCallback(async (template) => {
    const safeTemplate = template && typeof template === "object" ? template : null;
    const templateId = normalizeText(safeTemplate?.id || safeTemplate?.slug);
    if (!safeTemplate || !templateId) return;

    const requestId = previewRequestRef.current + 1;
    previewRequestRef.current = requestId;

    setPreviewModal({
      visible: true,
      template: safeTemplate,
      metadata: normalizeTemplateMetadata(safeTemplate),
      previewHtml: "",
      previewStatus: createTemplatePreviewStatus("loading"),
    });

    try {
      const { previewHtml } = await preparePublicTemplatePreview({ templateId });
      if (previewRequestRef.current !== requestId) return;

      setPreviewModal({
        visible: true,
        template: safeTemplate,
        metadata: normalizeTemplateMetadata(safeTemplate),
        previewHtml,
        previewStatus: createTemplatePreviewStatus("ready"),
      });
    } catch (previewError) {
      if (previewRequestRef.current !== requestId) return;

      const fallbackHtml = buildCoverPreviewHtml(safeTemplate);
      if (fallbackHtml) {
        setPreviewModal({
          visible: true,
          template: safeTemplate,
          metadata: normalizeTemplateMetadata(safeTemplate),
          previewHtml: fallbackHtml,
          previewStatus: createTemplatePreviewStatus("ready"),
        });
        return;
      }

      setPreviewModal((current) => ({
        ...current,
        previewHtml: "",
        previewStatus: createTemplatePreviewStatus(
          "error",
          getErrorMessage(
            previewError,
            "No se pudo cargar la vista previa de esta plantilla."
          )
        ),
      }));
    }
  }, []);

  const handlePreviewUseTemplate = useCallback(
    (template) => {
      closeTemplatePreview();
      onUseTemplate?.(template);
    },
    [closeTemplatePreview, onUseTemplate]
  );

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
          onImageClick={openTemplatePreview}
          primaryAction={(template) => ({
            label: "Usar plantilla",
            onClick: () => onUseTemplate?.(template),
          })}
          secondaryAction={(template) => ({
            label: "Vista previa",
            onClick: () => openTemplatePreview(template),
          })}
        />
      ))}

      <TemplatePreviewModal
        visible={previewModal.visible}
        template={previewModal.template}
        metadata={previewModal.metadata}
        previewHtml={previewModal.previewHtml}
        previewStatus={previewModal.previewStatus}
        onClose={closeTemplatePreview}
        onUseTemplate={handlePreviewUseTemplate}
        actionMode="landing"
        useTemplateLabel="Usar plantilla"
      />
    </LandingTemplateCarouselBlock>
  );
}
