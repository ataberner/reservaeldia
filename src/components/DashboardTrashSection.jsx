import { useEffect, useMemo, useState } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { Image as ImageIcon, RotateCcw } from "lucide-react";
import { db } from "@/firebase";
import {
  computeTrashPurgeAt,
  getPublicationStatus,
  PUBLICATION_STATES,
  resolvePublicationDates,
  toMs as publicationToMs,
} from "@/domain/publications/state";
import { transitionPublishedInvitationState } from "@/domain/publications/service";
import {
  computeDraftTrashPurgeAt,
  DRAFT_STATES,
  resolveDraftTrashDates,
  toMs as draftToMs,
} from "@/domain/drafts/state";
import { getDraftPreviewCandidates } from "@/domain/drafts/preview";
import { restoreDraftFromTrash } from "@/domain/drafts/service";

const TRASH_CARD_GRID_CLASS =
  "grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 md:grid-cols-4 xl:grid-cols-6";

const TRASH_ITEM_TYPES = Object.freeze({
  PUBLICATION: "publication",
  DRAFT: "draft",
});

function formatDate(value) {
  const ms =
    publicationToMs(value) > 0 ? publicationToMs(value) : draftToMs(value);
  if (!ms) return "Sin fecha";
  return new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(ms));
}

function getPreview(item) {
  const options = [
    item?.portada,
    item?.thumbnailUrl,
    item?.thumbnailurl,
    item?.thumbnail_url,
  ].filter((value) => typeof value === "string" && value.trim());

  return options[0] || "";
}

function appendCacheBust(url, versionMs) {
  if (!url) return url;
  if (!Number.isFinite(versionMs) || versionMs <= 0) return url;
  if (/^data:image\//i.test(url) || /^blob:/i.test(url)) return url;

  const version = String(Math.trunc(versionMs));
  const joiner = url.includes("?") ? "&" : "?";

  if (/^https?:\/\//i.test(url)) {
    try {
      const parsed = new URL(url);
      parsed.searchParams.set("v", version);
      return parsed.toString();
    } catch {
      return `${url}${joiner}v=${encodeURIComponent(version)}`;
    }
  }

  if (url.startsWith("/")) {
    return `${url}${joiner}v=${encodeURIComponent(version)}`;
  }

  return url;
}

function getDraftThumbnailVersionValue(draft) {
  return (
    draft?.thumbnailUpdatedAt ||
    draft?.updatedAt ||
    draft?.ultimaEdicion ||
    draft?.createdAt ||
    draft?.creado ||
    null
  );
}

function mapTrashedPublication(docItem) {
  const data = docItem.data() || {};
  const status = getPublicationStatus(data);
  const dates = resolvePublicationDates(data);

  return {
    id: docItem.id,
    itemType: TRASH_ITEM_TYPES.PUBLICATION,
    publicSlug: docItem.id,
    nombre: data.nombre || data.slug || docItem.id,
    portada: getPreview(data),
    estado: status.label,
    enPapeleraAt: dates.trashedAt,
    venceAt: dates.expiresAt,
    purgeAt: computeTrashPurgeAt(data),
    borradorSlug:
      (typeof data?.borradorSlug === "string" && data.borradorSlug.trim()) ||
      (typeof data?.borradorId === "string" && data.borradorId.trim()) ||
      (typeof data?.draftSlug === "string" && data.draftSlug.trim()) ||
      "",
    sortMs:
      publicationToMs(dates.trashedAt) ||
      publicationToMs(data.updatedAt) ||
      publicationToMs(data.createdAt),
  };
}

function mapTrashedDraft(docItem) {
  const data = docItem.data() || {};
  const dates = resolveDraftTrashDates(data);
  const purgeAt = computeDraftTrashPurgeAt(data);
  const previewVersion = draftToMs(getDraftThumbnailVersionValue(data));
  const previewCandidates = getDraftPreviewCandidates(data).map((candidate) =>
    appendCacheBust(candidate, previewVersion)
  );

  return {
    id: docItem.id,
    itemType: TRASH_ITEM_TYPES.DRAFT,
    draftSlug: docItem.id,
    nombre: data.nombre || data.slug || docItem.id,
    portada: previewCandidates[0] || "",
    previewCandidates,
    estado: "Borrador en papelera",
    enPapeleraAt: dates.trashedAt,
    purgeAt,
    sortMs:
      draftToMs(dates.trashedAt) ||
      draftToMs(data.updatedAt) ||
      draftToMs(data.ultimaEdicion) ||
      draftToMs(data.createdAt) ||
      draftToMs(data.creado),
  };
}

function getItemPendingKey(item) {
  if (!item) return "";
  if (item.itemType === TRASH_ITEM_TYPES.PUBLICATION) {
    return `publication:${item.publicSlug || ""}`;
  }
  return `draft:${item.draftSlug || ""}`;
}

export default function DashboardTrashSection({ usuario }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [pendingKey, setPendingKey] = useState("");
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    let mounted = true;

    const fetchTrash = async () => {
      if (!usuario?.uid) {
        if (!mounted) return;
        setItems([]);
        setLoading(false);
        setError("");
        return;
      }

      setLoading(true);
      setError("");

      try {
        const publicationTrashQuery = query(
          collection(db, "publicadas"),
          where("userId", "==", usuario.uid),
          where("estado", "==", PUBLICATION_STATES.TRASH)
        );

        const draftTrashQuery = query(
          collection(db, "borradores"),
          where("userId", "==", usuario.uid),
          where("estadoBorrador", "==", DRAFT_STATES.TRASH)
        );

        const [publicationSnap, draftSnap] = await Promise.all([
          getDocs(publicationTrashQuery),
          getDocs(draftTrashQuery),
        ]);

        const publications = publicationSnap.docs.map(mapTrashedPublication);
        const drafts = draftSnap.docs.map(mapTrashedDraft);

        const merged = [...publications, ...drafts].sort(
          (a, b) => b.sortMs - a.sortMs
        );

        if (!mounted) return;
        setItems(merged);
      } catch (fetchError) {
        if (!mounted) return;
        setItems([]);
        setError(fetchError?.message || "No se pudo cargar la papelera.");
      } finally {
        if (mounted) setLoading(false);
      }
    };

    fetchTrash();
    return () => {
      mounted = false;
    };
  }, [usuario?.uid, refreshTick]);

  const cards = useMemo(() => items, [items]);

  const handleRestore = async (item) => {
    const actionKey = getItemPendingKey(item);
    if (!actionKey || pendingKey) return;

    setPendingKey(actionKey);
    setError("");

    try {
      if (item.itemType === TRASH_ITEM_TYPES.PUBLICATION) {
        await transitionPublishedInvitationState({
          slug: item.publicSlug,
          action: "restore_from_trash",
        });
      } else {
        await restoreDraftFromTrash({ slug: item.draftSlug });
      }

      setRefreshTick((prev) => prev + 1);
    } catch (restoreError) {
      const message =
        restoreError?.message || "No se pudo restaurar el elemento.";
      setError(typeof message === "string" ? message : "No se pudo restaurar el elemento.");
    } finally {
      setPendingKey("");
    }
  };

  return (
    <section className="mx-auto mt-6 w-full max-w-7xl rounded-2xl border border-rose-200/70 bg-gradient-to-br from-white via-rose-50/45 to-orange-50/45 p-4 sm:p-6">
      <p className="text-xs font-medium uppercase tracking-[0.14em] text-gray-500">
        Papelera
      </p>
      <h2 className="mt-1 text-2xl font-semibold text-gray-900">Elementos en papelera</h2>
      <p className="mt-1 text-sm text-gray-600">
        Incluye invitaciones publicadas y borradores. Puedes restaurarlos antes de su eliminacion definitiva.
      </p>

      {error ? (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <div className="mt-5">
        {loading ? (
          <div className={TRASH_CARD_GRID_CLASS}>
            {Array.from({ length: 4 }).map((_, index) => (
              <div
                key={`trash-skeleton-${index}`}
                className="overflow-hidden rounded-2xl border border-gray-200 bg-white"
              >
                <div className="aspect-square animate-pulse bg-gray-100" />
                <div className="space-y-2 p-3">
                  <div className="h-3 animate-pulse rounded bg-gray-100" />
                  <div className="h-3 w-24 animate-pulse rounded bg-gray-100" />
                </div>
              </div>
            ))}
          </div>
        ) : cards.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-300 bg-white/70 px-4 py-8 text-center text-sm text-gray-600">
            Tu papelera esta vacia.
          </div>
        ) : (
          <div className={TRASH_CARD_GRID_CLASS}>
            {cards.map((item) => {
              const isPending = pendingKey === getItemPendingKey(item);
              const isDraft = item.itemType === TRASH_ITEM_TYPES.DRAFT;
              const previewCandidates =
                isDraft && Array.isArray(item.previewCandidates)
                  ? item.previewCandidates
                  : [];
              const previewSrc =
                previewCandidates[0] || item.portada || "";

              return (
                <article
                  key={`${item.itemType}-${item.id}`}
                  className="overflow-hidden rounded-2xl border border-rose-200/80 bg-white shadow-[0_2px_8px_rgba(15,23,42,0.06)]"
                >
                  <div className="relative aspect-square overflow-hidden border-b border-rose-100 bg-gray-100">
                    {typeof previewSrc === "string" && previewSrc.trim() ? (
                      <img
                        src={previewSrc}
                        alt={`Portada de ${item.nombre}`}
                        className="h-full w-full object-cover object-top opacity-75 saturate-[0.88]"
                        loading="lazy"
                        data-preview-index="0"
                        onError={(event) => {
                          if (!previewCandidates.length) return;
                          const image = event.currentTarget;
                          const currentIndex = Number.parseInt(
                            image.dataset.previewIndex || "0",
                            10
                          );
                          const nextIndex = currentIndex + 1;
                          if (nextIndex >= previewCandidates.length) return;
                          image.dataset.previewIndex = String(nextIndex);
                          image.src = previewCandidates[nextIndex];
                        }}
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-gray-400">
                        <ImageIcon className="h-7 w-7" />
                      </div>
                    )}
                  </div>

                  <div className="space-y-2 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="truncate text-sm font-semibold text-gray-800" title={item.nombre}>
                        {item.nombre}
                      </h3>
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                          isDraft
                            ? "border border-violet-200 bg-violet-50 text-violet-700"
                            : "border border-rose-200 bg-rose-50 text-rose-700"
                        }`}
                      >
                        {item.estado}
                      </span>
                    </div>

                    <div className="space-y-1 text-[11px] text-gray-600">
                      <p>En papelera: {formatDate(item.enPapeleraAt)}</p>
                      {isDraft ? (
                        <p>Tipo: Borrador sin publicar</p>
                      ) : (
                        <p>Vence: {formatDate(item.venceAt)}</p>
                      )}
                      <p>Eliminacion definitiva: {formatDate(item.purgeAt)}</p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => handleRestore(item)}
                        disabled={isPending}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs font-medium text-emerald-700 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                        {isPending
                          ? "Restaurando..."
                          : isDraft
                            ? "Restaurar borrador"
                            : "Restaurar como pausada"}
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
