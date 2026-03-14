import { useState } from "react";
import ConfirmDeleteItemModal from "@/components/ConfirmDeleteItemModal";
import DashboardCardTrashButton from "@/components/DashboardCardTrashButton";
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
    <article className="group relative overflow-hidden rounded-2xl border border-gray-200/90 bg-white shadow-[0_2px_8px_rgba(15,23,42,0.06)] transition-all duration-300 ease-out hover:-translate-y-0.5 hover:border-white hover:ring-1 hover:ring-white hover:shadow-[0_16px_30px_rgba(111,59,192,0.16)] focus-within:-translate-y-0.5 focus-within:border-white focus-within:ring-1 focus-within:ring-white focus-within:shadow-[0_16px_30px_rgba(111,59,192,0.16)]">
      <a
        href={`/dashboard?slug=${encodeURIComponent(draft?.slug || "")}`}
        className="block rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6f3bc0] focus-visible:ring-offset-2"
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
            className="h-full w-full object-cover object-top transition-transform duration-500 ease-out group-hover:scale-[1.03] group-focus-within:scale-[1.03] motion-reduce:transition-none"
            loading="lazy"
            decoding="async"
            fetchPriority="auto"
            onError={() => {
              if (imageIndex >= previewCandidates.length - 1) return;
              setImageIndex((previous) => previous + 1);
            }}
          />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#2d1a4a]/18 via-transparent to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100 group-focus-within:opacity-100 motion-reduce:transition-none" />
        </div>

        <div className="p-3">
          <h3
            className="truncate text-sm font-semibold text-gray-800 transition-colors duration-200 group-hover:text-[#4d2b86] group-focus-within:text-[#4d2b86]"
            title={draft?.nombre || draft?.slug || "Borrador"}
          >
            {draft?.nombre || draft?.slug || "Borrador"}
          </h3>
          {draft?.updatedLabel ? (
            <p className="mt-1 text-[11px] text-gray-500">
              Actualizado: {draft.updatedLabel}
            </p>
          ) : null}
          <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#6f3bc0] transition-all duration-200 group-hover:translate-x-0.5 group-hover:text-[#5a2daa] group-focus-within:translate-x-0.5 group-focus-within:text-[#5a2daa]">
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
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
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
