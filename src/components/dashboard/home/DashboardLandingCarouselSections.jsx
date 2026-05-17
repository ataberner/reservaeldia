import { useEffect, useState } from "react";
import ConfirmDeleteItemModal from "@/components/ConfirmDeleteItemModal";
import { DASHBOARD_HOME_ERROR_PANEL_CLASS } from "@/components/dashboard/dashboardStyleClasses";
import {
  LandingTemplateCarouselBlock,
  LandingTemplateCarouselRail,
  LandingTemplatePreviewDialog,
} from "@/components/landing/LandingTemplateCarouselPrimitives";
import landingStyles from "@/components/landing/LandingTemplateShowcase.module.css";
import { moveDraftToTrash } from "@/domain/drafts/service";
import { transitionPublishedInvitationState } from "@/domain/publications/service";

function normalizeText(value) {
  return String(value || "").trim();
}

function firstImageSource(values = []) {
  return (
    (Array.isArray(values) ? values : [])
      .map((value) => normalizeText(value))
      .find(Boolean) || "/placeholder.jpg"
  );
}

function resolvePublicationImage(item) {
  return firstImageSource([
    item?.portada,
    ...(Array.isArray(item?.previewCandidates) ? item.previewCandidates : []),
  ]);
}

function resolveDraftImage(draft) {
  return firstImageSource(
    Array.isArray(draft?.previewCandidates) ? draft.previewCandidates : []
  );
}

function resolveTemplateImage(template) {
  return firstImageSource([template?.portada]);
}

function openUrl(url) {
  const safeUrl = normalizeText(url);
  if (!safeUrl || typeof window === "undefined") return;
  window.open(safeUrl, "_blank", "noopener,noreferrer");
}

function openDraft(draft) {
  const slug = normalizeText(draft?.slug);
  if (!slug || typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent("abrir-borrador", {
      detail: {
        slug,
        editor: "konva",
      },
    })
  );
}

function getTemplateTitleBase(section) {
  if (section?.tagSlug === "populares") return "Invitaciones ";
  return "Invitaciones de ";
}

function SectionError({ children }) {
  if (!children) return null;
  return <div className={DASHBOARD_HOME_ERROR_PANEL_CLASS}>{children}</div>;
}

const INVITATION_FILTERS = [
  { id: "all", label: "Todas" },
  { id: "published", label: "Publicadas" },
  { id: "drafts", label: "Borradores" },
];

function resolveInvitationSortMs(row) {
  return Number(row?.sortMs || row?.updatedAtMs || row?.publishedMs || 0);
}

function InvitationFilterChips({
  selectedFilter,
  onSelectFilter,
  publicationCount,
  draftCount,
}) {
  const counts = {
    all: publicationCount + draftCount,
    published: publicationCount,
    drafts: draftCount,
  };

  return (
    <div className={landingStyles.filterChips} aria-label="Filtrar invitaciones">
      {INVITATION_FILTERS.map((filter) => {
        const isSelected = selectedFilter === filter.id;
        const isDisabled = filter.id !== "all" && counts[filter.id] === 0;
        return (
          <button
            key={filter.id}
            type="button"
            data-filter-chip={filter.id}
            className={`${landingStyles.filterChip} ${
              isSelected ? landingStyles.filterChipSelected : ""
            }`}
            onClick={() => {
              if (isDisabled) return;
              onSelectFilter(filter.id);
            }}
            aria-pressed={isSelected}
            disabled={isDisabled}
          >
            {filter.label}
          </button>
        );
      })}
    </div>
  );
}

export default function DashboardLandingCarouselSections({
  rootId,
  sections,
  draftsError = "",
  publicationsError = "",
  templatesError = "",
  configError = "",
  loadingTemplates = false,
  loadingConfig = false,
  hasTemplateSections = false,
  onDraftRemoved,
  onOpenPublicationResponses,
  onPublicationsRefresh,
  onSelectTemplate,
}) {
  const safeSections = Array.isArray(sections) ? sections : [];
  const [deletingSlug, setDeletingSlug] = useState("");
  const [draftPendingDelete, setDraftPendingDelete] = useState(null);
  const [publicationTrashPendingItem, setPublicationTrashPendingItem] =
    useState(null);
  const [pendingPublicationActionKey, setPendingPublicationActionKey] =
    useState("");
  const [publicationActionError, setPublicationActionError] = useState("");
  const [previewTemplate, setPreviewTemplate] = useState(null);
  const [invitationFilter, setInvitationFilter] = useState("all");

  const publicationItems = safeSections
    .filter((section) => section?.kind === "publications")
    .flatMap((section) => (Array.isArray(section?.items) ? section.items : []));
  const draftItems = safeSections
    .filter((section) => section?.kind === "drafts")
    .flatMap((section) => (Array.isArray(section?.items) ? section.items : []));
  const invitationItems = [
    ...publicationItems.map((item) => ({
      kind: "published",
      item,
      sortMs: resolveInvitationSortMs(item),
    })),
    ...draftItems.map((item) => ({
      kind: "draft",
      item,
      sortMs: resolveInvitationSortMs(item),
    })),
  ].sort((left, right) => right.sortMs - left.sortMs);
  const filteredInvitationItems = invitationItems.filter((row) => {
    if (invitationFilter === "published") return row.kind === "published";
    if (invitationFilter === "drafts") return row.kind === "draft";
    return true;
  });
  const hasInvitationItems = invitationItems.length > 0;

  useEffect(() => {
    if (invitationFilter === "published" && publicationItems.length === 0) {
      setInvitationFilter("all");
    }
    if (invitationFilter === "drafts" && draftItems.length === 0) {
      setInvitationFilter("all");
    }
  }, [draftItems.length, invitationFilter, publicationItems.length]);

  const hasErrors = Boolean(
    draftsError || publicationsError || templatesError || configError
  );
  const shouldShowTemplateEmpty =
    !hasTemplateSections && !loadingTemplates && !loadingConfig;
  const shouldRender =
    safeSections.length > 0 || hasErrors || shouldShowTemplateEmpty;

  if (!shouldRender) return null;

  const handleConfirmDelete = async () => {
    const slug = normalizeText(draftPendingDelete?.slug);
    if (!slug || deletingSlug) return;

    setDeletingSlug(slug);
    try {
      await moveDraftToTrash({ slug });
      onDraftRemoved?.(slug);
      setDraftPendingDelete(null);
    } catch (deleteError) {
      console.error("Error al mover borrador a papelera:", deleteError);
      alert(deleteError?.message || "No se pudo mover el borrador a papelera.");
    } finally {
      setDeletingSlug("");
    }
  };

  const handlePublicationTransition = async (item, action) => {
    const publicSlug = normalizeText(item?.publicSlug);
    const safeAction = normalizeText(action);
    if (!publicSlug || !safeAction || pendingPublicationActionKey) return false;

    const actionKey = `${publicSlug}:${safeAction}`;
    setPendingPublicationActionKey(actionKey);
    setPublicationActionError("");

    try {
      await transitionPublishedInvitationState({
        slug: publicSlug,
        action: safeAction,
      });
      onPublicationsRefresh?.();
      return true;
    } catch (transitionError) {
      const message =
        transitionError?.message ||
        "No se pudo actualizar el estado de la invitacion.";
      setPublicationActionError(
        typeof message === "string"
          ? message
          : "No se pudo actualizar el estado de la invitacion."
      );
      return false;
    } finally {
      setPendingPublicationActionKey("");
    }
  };

  const handleConfirmPublicationTrash = async () => {
    if (!publicationTrashPendingItem?.publicSlug) return;
    const moved = await handlePublicationTransition(
      publicationTrashPendingItem,
      "move_to_trash"
    );
    if (moved) {
      setPublicationTrashPendingItem(null);
    }
  };

  const renderSection = (section) => {
    const safeItems = Array.isArray(section?.items) ? section.items : [];
    if (!safeItems.length) return null;

    if (section?.kind === "publications" || section?.kind === "drafts") {
      return null;
    }

    if (
      section?.kind === "featured_templates" ||
      section?.kind === "template_category"
    ) {
      return (
        <LandingTemplateCarouselRail
          key={section.id}
          sectionId={section.anchorId || section.id}
          titleBase={getTemplateTitleBase(section)}
          titleAccent={section.tagLabel || section.title || "plantillas"}
          items={safeItems}
          getItemKey={(template, index) => template?.id || template?.slug || index}
          getTitle={(template) => template?.nombre || "Plantilla"}
          getImageSrc={resolveTemplateImage}
          getImageAlt={(template) =>
            `Vista previa de ${template?.nombre || "plantilla"}`
          }
          onImageClick={setPreviewTemplate}
          primaryAction={(template) => ({
            label: "Usar plantilla",
            onClick: () => onSelectTemplate?.(template),
          })}
          secondaryAction={(template) => ({
            label: "Vista previa",
            onClick: () => setPreviewTemplate(template),
          })}
        />
      );
    }

    return null;
  };

  return (
    <>
      <LandingTemplateCarouselBlock id={rootId} variant="dashboard">
        <SectionError>{configError || templatesError}</SectionError>
        <SectionError>{publicationsError}</SectionError>
        <SectionError>{publicationActionError}</SectionError>
        <SectionError>{draftsError}</SectionError>

        {hasInvitationItems ? (
          <LandingTemplateCarouselRail
            sectionId="dashboard-invitations"
            titleBase="Mis invitaciones"
            titleAccent=""
            items={filteredInvitationItems}
            renderWhenEmpty
            headerAddon={
              <InvitationFilterChips
                selectedFilter={invitationFilter}
                onSelectFilter={setInvitationFilter}
                publicationCount={publicationItems.length}
                draftCount={draftItems.length}
              />
            }
            getItemKey={(row) => {
              if (row.kind === "published") {
                return `published-${row.item?.source || "publication"}-${row.item?.id || row.item?.publicSlug}`;
              }
              return `draft-${row.item?.slug || row.item?.id}`;
            }}
            getTitle={(row) => {
              if (row.kind === "published") {
                return row.item?.nombre || row.item?.publicSlug || "Invitacion";
              }
              return row.item?.nombre || row.item?.slug || "Borrador";
            }}
            getImageSrc={(row) =>
              row.kind === "published"
                ? resolvePublicationImage(row.item)
                : resolveDraftImage(row.item)
            }
            getImageAlt={(row) =>
              row.kind === "published"
                ? `Portada de ${row.item?.nombre || "invitacion"}`
                : `Vista previa de ${row.item?.nombre || row.item?.slug || "borrador"}`
            }
            onImageClick={(row) => {
              if (row.kind === "published") {
                openUrl(row.item?.url);
                return;
              }
              openDraft(row.item);
            }}
            primaryAction={(row) => {
              if (row.kind === "published") {
                return {
                  label: "Ver respuestas",
                  onClick: () =>
                    onOpenPublicationResponses?.(
                      row.item?.publicSlug || row.item?.id
                    ),
                };
              }
              return {
                label: "Abrir borrador",
                onClick: () => openDraft(row.item),
              };
            }}
            secondaryAction={(row) => {
              if (row.kind === "published") {
                const item = row.item || {};
                const publicSlug = normalizeText(item.publicSlug);
                const action = item.isPaused ? "resume" : item.isActive ? "pause" : "";
                if (item.source !== "active" || item.isFinalized || !publicSlug || !action) {
                  return null;
                }

                return {
                  label: item.isPaused ? "Publicar" : "Pausar",
                  onClick: () => handlePublicationTransition(item, action),
                  disabled: Boolean(pendingPublicationActionKey),
                  ariaLabel: `${item.isPaused ? "Publicar" : "Pausar"} ${
                    item.nombre || "invitacion"
                  }`,
                };
              }
              return {
                label: "Eliminar",
                onClick: () => setDraftPendingDelete(row.item),
              };
            }}
            tertiaryAction={(row) => {
              if (row.kind !== "published") return null;

              const item = row.item || {};
              const publicSlug = normalizeText(item.publicSlug);
              if (
                item.source !== "active" ||
                item.isFinalized ||
                !item.isPaused ||
                !publicSlug
              ) {
                return null;
              }

              return {
                label: "Eliminar",
                onClick: () => setPublicationTrashPendingItem(item),
                disabled: Boolean(pendingPublicationActionKey),
                ariaLabel: `Eliminar ${item.nombre || "invitacion"}`,
                tone: "danger",
              };
            }}
          />
        ) : null}

        {safeSections.map(renderSection)}

        {shouldShowTemplateEmpty ? (
          <div className={landingStyles.emptyState}>
            Aun no hay categorias editoriales activas para mostrar en el dashboard.
          </div>
        ) : null}
      </LandingTemplateCarouselBlock>

      <LandingTemplatePreviewDialog
        item={previewTemplate}
        onClose={() => setPreviewTemplate(null)}
        onUse={onSelectTemplate}
        getTitle={(template) => template?.nombre || "Plantilla"}
        getImageSrc={resolveTemplateImage}
        getImageAlt={(template) =>
          `Vista previa ampliada de ${template?.nombre || "Plantilla"}`
        }
      />

      <ConfirmDeleteItemModal
        isOpen={Boolean(draftPendingDelete)}
        itemTypeLabel="borrador"
        itemName={draftPendingDelete?.nombre || draftPendingDelete?.slug}
        isDeleting={Boolean(deletingSlug)}
        dialogTitle="Mover borrador a papelera"
        dialogDescription={`"${draftPendingDelete?.nombre || draftPendingDelete?.slug || "Este borrador"}" se movera a papelera.`}
        warningText="Podras restaurarlo durante 30 dias antes del borrado definitivo."
        confirmButtonText="Mover a papelera"
        confirmingButtonText="Moviendo..."
        onCancel={() => {
          if (deletingSlug) return;
          setDraftPendingDelete(null);
        }}
        onConfirm={handleConfirmDelete}
      />

      <ConfirmDeleteItemModal
        isOpen={Boolean(publicationTrashPendingItem)}
        itemTypeLabel="invitacion"
        itemName={
          publicationTrashPendingItem?.nombre ||
          publicationTrashPendingItem?.publicSlug
        }
        isDeleting={
          Boolean(publicationTrashPendingItem?.publicSlug) &&
          pendingPublicationActionKey ===
            `${publicationTrashPendingItem.publicSlug}:move_to_trash`
        }
        dialogTitle="Mover invitacion a papelera"
        dialogDescription={`"${publicationTrashPendingItem?.nombre || publicationTrashPendingItem?.publicSlug || "Esta invitacion"}" se movera a papelera.`}
        warningText="Dejara de aparecer en publicadas. Podras restaurarla luego como pausada."
        confirmButtonText="Mover a papelera"
        confirmingButtonText="Moviendo..."
        onCancel={() => {
          if (
            publicationTrashPendingItem?.publicSlug &&
            pendingPublicationActionKey ===
              `${publicationTrashPendingItem.publicSlug}:move_to_trash`
          ) {
            return;
          }
          setPublicationTrashPendingItem(null);
        }}
        onConfirm={handleConfirmPublicationTrash}
      />
    </>
  );
}
