import { useState } from "react";
import { Image as ImageIcon, Pencil } from "lucide-react";
import ConfirmDeleteItemModal from "@/components/ConfirmDeleteItemModal";
import DashboardCardPauseButton from "@/components/DashboardCardPauseButton";
import DashboardCardTrashButton from "@/components/DashboardCardTrashButton";
import DashboardSectionShell from "@/components/dashboard/home/DashboardSectionShell";
import HorizontalRail from "@/components/dashboard/home/HorizontalRail";
import { transitionPublishedInvitationState } from "@/domain/publications/service";
import { toMs } from "@/domain/publications/state";

const PUBLICATION_CARD_WIDTH_CLASS = "w-[240px] shrink-0 sm:w-[256px] lg:w-[270px]";

function formatDate(value) {
  const ms = toMs(value);
  if (!ms) return "Sin fecha";

  return new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(ms));
}

function StatusBadge({ label }) {
  const clsByLabel = {
    Activa: "border border-emerald-200 bg-emerald-50 text-emerald-700",
    Pausada: "border border-amber-200 bg-amber-50 text-amber-700",
    Finalizada: "border border-slate-300 bg-slate-100 text-slate-700",
  };

  const cls = clsByLabel[label] || "border border-slate-300 bg-slate-100 text-slate-700";
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold ${cls}`}>
      {label}
    </span>
  );
}

function PublicationRailCard({
  item,
  pendingActionKey,
  onRunTransition,
  onRequestMoveToTrash,
}) {
  const editUrl = item?.borradorSlug
    ? `/dashboard?slug=${encodeURIComponent(item.borradorSlug)}`
    : "";
  const canOpenPublicLink = Boolean(item?.url) && item?.isActive;
  const statusDateLabel = item?.isFinalized ? "Finalizada" : "Vigente hasta";
  const statusDateValue = item?.isFinalized ? item?.finalizadaEn : item?.expiresAt;

  const trashKey = `${item?.publicSlug}:move_to_trash`;
  const lifecycleAction = item?.isPaused ? "resume" : item?.isActive ? "pause" : "";
  const lifecycleActionKey = lifecycleAction ? `${item?.publicSlug}:${lifecycleAction}` : "";
  const isLifecyclePending = lifecycleActionKey
    ? pendingActionKey === lifecycleActionKey
    : false;
  const isTrashPending = pendingActionKey === trashKey;
  const hasTopActions =
    item?.source === "active" &&
    !item?.isFinalized &&
    (item?.isActive || item?.isPaused);

  return (
    <article
      className={`group relative overflow-hidden rounded-2xl border border-gray-200/90 bg-white shadow-[0_2px_8px_rgba(15,23,42,0.06)] transition-all duration-300 ease-out hover:-translate-y-0.5 hover:border-white hover:ring-1 hover:ring-white hover:shadow-[0_16px_30px_rgba(111,59,192,0.16)] focus-visible:-translate-y-0.5 focus-visible:border-white focus-visible:ring-1 focus-visible:ring-white focus-visible:shadow-[0_16px_30px_rgba(111,59,192,0.16)] ${
        item?.isPaused ? "bg-amber-50/35" : ""
      } ${canOpenPublicLink ? "cursor-pointer" : ""}`}
      onClick={() => {
        if (!canOpenPublicLink) return;
        window.open(item.url, "_blank", "noopener,noreferrer");
      }}
      onKeyDown={(event) => {
        if (!canOpenPublicLink) return;
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        window.open(item.url, "_blank", "noopener,noreferrer");
      }}
      role={canOpenPublicLink ? "link" : undefined}
      tabIndex={canOpenPublicLink ? 0 : undefined}
    >
      {hasTopActions ? (
        <div className="absolute right-2 top-2 z-20 flex items-center gap-1.5">
          {lifecycleAction ? (
            <DashboardCardPauseButton
              mode={item?.isPaused ? "resume" : "pause"}
              title={item?.isPaused ? "Reanudar invitacion" : "Pausar invitacion"}
              ariaLabel={`${item?.isPaused ? "Reanudar" : "Pausar"} ${item?.nombre || "invitacion"}`}
              isPending={isLifecyclePending}
              disabled={Boolean(pendingActionKey && !isLifecyclePending)}
              onClick={(event) => {
                event.stopPropagation();
                onRunTransition?.(item, lifecycleAction);
              }}
            />
          ) : null}

          {item?.isPaused ? (
            <DashboardCardTrashButton
              title="Mover a papelera"
              ariaLabel={`Mover ${item?.nombre || "invitacion"} a papelera`}
              isPending={isTrashPending}
              disabled={Boolean(pendingActionKey && !isTrashPending)}
              placement="inline"
              onClick={(event) => {
                event.stopPropagation();
                onRequestMoveToTrash?.(item);
              }}
            />
          ) : null}
        </div>
      ) : null}

      <div className="relative aspect-square overflow-hidden border-b border-gray-100 bg-gray-100">
        {item?.portada ? (
          <img
            src={item.portada}
            alt={`Portada de ${item?.nombre || "invitacion"}`}
            className={`h-full w-full object-cover object-top transition-transform duration-500 ease-out group-hover:scale-[1.03] motion-reduce:transition-none ${
              item?.isPaused ? "opacity-80 saturate-[0.9]" : ""
            }`}
            loading="lazy"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-gray-400">
            <ImageIcon className="h-7 w-7" />
          </div>
        )}
      </div>

      <div className="space-y-2 p-3">
        <div className="flex items-start justify-between gap-2">
          <h3 className="truncate text-sm font-semibold text-gray-800" title={item?.nombre || "Invitacion"}>
            {item?.nombre || "Invitacion"}
          </h3>
          <StatusBadge label={item?.statusLabel || "Activa"} />
        </div>

        <div className="text-[11px] text-gray-500">
          {statusDateLabel}: {formatDate(statusDateValue)}
        </div>

        <div className="flex flex-wrap gap-2">
          {editUrl ? (
            <a
              href={editUrl}
              onClick={(event) => event.stopPropagation()}
              className="inline-flex items-center gap-1 rounded-lg border border-[#ddd2f5] px-2.5 py-1.5 text-xs font-medium text-[#6f3bc0] hover:bg-[#f7f2ff]"
            >
              <Pencil className="h-3.5 w-3.5" />
              Editar invitacion
            </a>
          ) : null}
        </div>
      </div>
    </article>
  );
}

export default function DashboardPublicationRailSection({
  items,
  error = "",
  onRefresh,
}) {
  const safeItems = Array.isArray(items) ? items : [];
  const [actionError, setActionError] = useState("");
  const [pendingActionKey, setPendingActionKey] = useState("");
  const [trashPendingItem, setTrashPendingItem] = useState(null);

  if (!safeItems.length && !error) return null;

  const runTransition = async (item, action) => {
    if (!item?.publicSlug || pendingActionKey) return false;

    const actionKey = `${item.publicSlug}:${action}`;
    setPendingActionKey(actionKey);
    setActionError("");

    try {
      await transitionPublishedInvitationState({
        slug: item.publicSlug,
        action,
      });
      onRefresh?.();
      return true;
    } catch (transitionError) {
      const message =
        transitionError?.message || "No se pudo actualizar el estado de la invitacion.";
      setActionError(
        typeof message === "string"
          ? message
          : "No se pudo actualizar el estado de la invitacion."
      );
      return false;
    } finally {
      setPendingActionKey("");
    }
  };

  const confirmMoveToTrash = async () => {
    if (!trashPendingItem?.publicSlug) return;
    const moved = await runTransition(trashPendingItem, "move_to_trash");
    if (moved) {
      setTrashPendingItem(null);
    }
  };

  return (
    <>
      <DashboardSectionShell
        title="Publicadas"
        description="Gestiona tus invitaciones activas, pausadas y revisa las finalizadas."
        eyebrow="Tu espacio"
      >
        {error || actionError ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error || actionError}
          </div>
        ) : (
          <HorizontalRail>
            {safeItems.map((item) => (
              <div key={`${item.source}-${item.id}`} className={PUBLICATION_CARD_WIDTH_CLASS}>
                <PublicationRailCard
                  item={item}
                  pendingActionKey={pendingActionKey}
                  onRunTransition={runTransition}
                  onRequestMoveToTrash={setTrashPendingItem}
                />
              </div>
            ))}
          </HorizontalRail>
        )}
      </DashboardSectionShell>

      <ConfirmDeleteItemModal
        isOpen={Boolean(trashPendingItem)}
        itemTypeLabel="invitacion"
        itemName={trashPendingItem?.nombre || trashPendingItem?.publicSlug}
        isDeleting={
          Boolean(trashPendingItem?.publicSlug) &&
          pendingActionKey === `${trashPendingItem?.publicSlug}:move_to_trash`
        }
        dialogTitle="Mover invitacion a papelera"
        dialogDescription={`"${trashPendingItem?.nombre || trashPendingItem?.publicSlug || "Esta invitacion"}" se movera a papelera.`}
        warningText="Dejara de aparecer en publicadas. Podras restaurarla luego como pausada."
        confirmButtonText="Mover a papelera"
        confirmingButtonText="Moviendo..."
        onCancel={() => {
          if (
            trashPendingItem?.publicSlug &&
            pendingActionKey === `${trashPendingItem.publicSlug}:move_to_trash`
          ) {
            return;
          }
          setTrashPendingItem(null);
        }}
        onConfirm={confirmMoveToTrash}
      />
    </>
  );
}
