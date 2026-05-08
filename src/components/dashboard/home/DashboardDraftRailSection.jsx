import { useState } from "react";
import ConfirmDeleteItemModal from "@/components/ConfirmDeleteItemModal";
import DashboardCardTrashButton from "@/components/DashboardCardTrashButton";
import {
  DASHBOARD_HOME_ERROR_PANEL_CLASS,
  DASHBOARD_INVITATION_CARD_CLASS,
  DASHBOARD_INVITATION_CARD_MEDIA_CLASS,
  DASHBOARD_INVITATION_CARD_TITLE_CLASS,
} from "@/components/dashboard/dashboardStyleClasses";
import DashboardSectionShell from "@/components/dashboard/home/DashboardSectionShell";
import HorizontalRail from "@/components/dashboard/home/HorizontalRail";
import { moveDraftToTrash } from "@/domain/drafts/service";

const DRAFT_CARD_WIDTH_CLASS = "w-[220px] shrink-0 sm:w-[236px] lg:w-[248px]";

function DraftRailCard({ draft, onRequestDelete }) {
  const [imageIndex, setImageIndex] = useState(0);
  const previewCandidates = Array.isArray(draft?.previewCandidates) ? draft.previewCandidates : [];
  const previewSrc = previewCandidates[imageIndex] || "/placeholder.jpg";

  const handleOpen = () => {
    if (typeof window === "undefined") return;
    window.dispatchEvent(
      new CustomEvent("abrir-borrador", {
        detail: {
          slug: draft?.slug,
          editor: "konva",
        },
      })
    );
  };

  return (
    <article className={DASHBOARD_INVITATION_CARD_CLASS}>
      <a
        href={`/dashboard?slug=${encodeURIComponent(draft?.slug || "")}`}
        className="block rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6f3bc0] focus-visible:ring-offset-0"
        onClick={(event) => {
          event.preventDefault();
          handleOpen();
        }}
        aria-label={`Abrir borrador ${draft?.nombre || draft?.slug || "sin nombre"}`}
      >
        <div className="relative aspect-square overflow-hidden bg-gray-100">
          <img
            src={previewSrc}
            alt={`Vista previa de ${draft?.nombre || draft?.slug || "borrador"}`}
            className={DASHBOARD_INVITATION_CARD_MEDIA_CLASS}
            loading="lazy"
            decoding="async"
            fetchPriority="auto"
            onError={() => {
              if (imageIndex >= previewCandidates.length - 1) return;
              setImageIndex((previous) => previous + 1);
            }}
          />
        </div>

        <div className="p-3">
          <h3
            className={DASHBOARD_INVITATION_CARD_TITLE_CLASS}
            title={draft?.nombre || draft?.slug || "Borrador"}
          >
            {draft?.nombre || draft?.slug || "Borrador"}
          </h3>
          {draft?.updatedLabel ? (
            <p className="mt-1 text-[11px] text-gray-500">
              Actualizado: {draft.updatedLabel}
            </p>
          ) : null}
          <p className="dashboard-invitation-card__action mt-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#6f3bc0]">
            Abrir borrador
          </p>
        </div>
      </a>

      <DashboardCardTrashButton
        title="Mover borrador a papelera"
        ariaLabel={`Mover borrador ${draft?.nombre || draft?.slug || "sin nombre"} a papelera`}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onRequestDelete?.(draft);
        }}
      />
    </article>
  );
}

export default function DashboardDraftRailSection({
  items,
  error = "",
  onDraftRemoved,
}) {
  const safeItems = Array.isArray(items) ? items : [];
  const [deletingSlug, setDeletingSlug] = useState("");
  const [draftPendingDelete, setDraftPendingDelete] = useState(null);

  if (!safeItems.length && !error) return null;

  const handleConfirmDelete = async () => {
    const slug = String(draftPendingDelete?.slug || "").trim();
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

  return (
    <>
      <DashboardSectionShell
        title="Borradores"
        description="Retoma invitaciones en proceso y sigue justo donde las dejaste."
        eyebrow="Tu espacio"
      >
        {error ? (
          <div className={DASHBOARD_HOME_ERROR_PANEL_CLASS}>
            {error}
          </div>
        ) : (
          <HorizontalRail>
            {safeItems.map((draft) => (
              <div key={draft.slug} className={DRAFT_CARD_WIDTH_CLASS}>
                <DraftRailCard draft={draft} onRequestDelete={setDraftPendingDelete} />
              </div>
            ))}
          </HorizontalRail>
        )}
      </DashboardSectionShell>

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
    </>
  );
}
