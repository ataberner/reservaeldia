import { useEffect, useMemo, useState } from "react";
import { collection, getDocs, limit, orderBy, query, where } from "firebase/firestore";
import {
  Image as ImageIcon,
  Pencil,
} from "lucide-react";
import { db } from "@/firebase";
import DashboardCardPauseButton from "@/components/DashboardCardPauseButton";
import DashboardCardTrashButton from "@/components/DashboardCardTrashButton";
import {
  getPublicationStatus,
  resolvePublicationDates,
  toMs,
} from "@/domain/publications/state";
import { transitionPublishedInvitationState } from "@/domain/publications/service";

const HOME_PUBLICATIONS_LIMIT = 10;
const PUBLICADAS_CARD_GRID_CLASS =
  "grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 md:grid-cols-4 xl:grid-cols-6";

function isPermissionDeniedError(error) {
  const code = String(error?.code || "").toLowerCase();
  return code === "permission-denied" || code.includes("permission-denied");
}

function formatDate(value) {
  const ms = toMs(value);
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

function resolveEditableDraftSlug(data) {
  const candidates = [data?.borradorSlug, data?.borradorId, data?.draftSlug];
  for (const value of candidates) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return "";
}

function buildActiveItem(docItem, nowMs) {
  const data = docItem.data() || {};
  const status = getPublicationStatus(data, nowMs);
  const dates = resolvePublicationDates(data);
  const sortMs =
    toMs(data.enPapeleraAt) ||
    toMs(data.ultimaPublicacionEn) ||
    toMs(data.updatedAt) ||
    toMs(data.createdAt) ||
    toMs(dates.publishedAt);

  return {
    id: docItem.id,
    source: "active",
    publicSlug: docItem.id,
    nombre: data.nombre || data.slug || docItem.id,
    portada: getPreview(data),
    url: status.isActive ? String(data.urlPublica || "").trim() : "",
    borradorSlug: resolveEditableDraftSlug(data),
    statusLabel: status.label,
    isActive: status.isActive,
    isPaused: status.isPaused,
    isTrashed: status.isTrashed,
    isFinalized: status.isFinalized,
    publishedAt: dates.publishedAt,
    expiresAt: dates.expiresAt,
    pausedAt: dates.pausedAt,
    trashedAt: dates.trashedAt,
    sortMs,
  };
}

function buildHistoryItem(docItem) {
  const data = docItem.data() || {};
  const dates = resolvePublicationDates(data);
  const sortMs =
    toMs(data.finalizadaEn) || toMs(data.updatedAt) || toMs(data.createdAt) || 0;

  return {
    id: docItem.id,
    source: "history",
    publicSlug:
      (typeof data.sourceSlug === "string" && data.sourceSlug.trim()) ||
      (typeof data.slug === "string" && data.slug.trim()) ||
      "",
    nombre: data.nombre || data.slug || "(sin nombre)",
    portada: getPreview(data),
    url: "",
    borradorSlug: resolveEditableDraftSlug(data),
    statusLabel: "Finalizada",
    isActive: false,
    isPaused: false,
    isTrashed: false,
    isFinalized: true,
    publishedAt: dates.publishedAt || null,
    expiresAt: dates.expiresAt || null,
    pausedAt: null,
    trashedAt: null,
    finalizadaEn: data.finalizadaEn || null,
    sortMs,
  };
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

export default function DashboardPublicadasSection({ usuario, onReadyChange }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [pendingActionKey, setPendingActionKey] = useState("");
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    let mounted = true;

    const fetchPublicaciones = async () => {
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
        const nowMs = Date.now();
        const activeQuery = query(
          collection(db, "publicadas"),
          where("userId", "==", usuario.uid),
          orderBy("publicadaEn", "desc"),
          limit(HOME_PUBLICATIONS_LIMIT)
        );

        const historyQuery = query(
          collection(db, "publicadas_historial"),
          where("userId", "==", usuario.uid),
          limit(HOME_PUBLICATIONS_LIMIT)
        );

        const [activeResult, historyResult] = await Promise.allSettled([
          getDocs(activeQuery),
          getDocs(historyQuery),
        ]);

        if (activeResult.status !== "fulfilled") {
          throw activeResult.reason;
        }

        const activeSnap = activeResult.value;
        const historySnap =
          historyResult.status === "fulfilled"
            ? historyResult.value
            : null;

        if (historyResult.status === "rejected" && !isPermissionDeniedError(historyResult.reason)) {
          throw historyResult.reason;
        }

        const activeItems = activeSnap.docs
          .map((docItem) => buildActiveItem(docItem, nowMs))
          .filter((item) => !item.isTrashed);

        const historyItems = historySnap ? historySnap.docs.map(buildHistoryItem) : [];
        const merged = [...activeItems, ...historyItems]
          .sort((a, b) => b.sortMs - a.sortMs)
          .slice(0, HOME_PUBLICATIONS_LIMIT);

        if (!mounted) return;
        setItems(merged);
      } catch (fetchError) {
        if (!mounted) return;
        setItems([]);
        setError(fetchError?.message || "No se pudieron cargar tus publicaciones.");
      } finally {
        if (mounted) setLoading(false);
      }
    };

    fetchPublicaciones();
    return () => {
      mounted = false;
    };
  }, [usuario?.uid, refreshTick]);

  useEffect(() => {
    if (typeof onReadyChange !== "function") return;
    onReadyChange(!loading);
  }, [loading, onReadyChange]);

  const cards = useMemo(() => items, [items]);

  const runTransition = async (item, action) => {
    if (!item?.publicSlug || pendingActionKey) return;
    if (action === "move_to_trash") {
      const confirmed = window.confirm(
        "La invitacion se movera a la papelera y saldra de publicadas. Podras restaurarla luego como pausada."
      );
      if (!confirmed) return;
    }

    const actionKey = `${item.publicSlug}:${action}`;
    setPendingActionKey(actionKey);
    setActionError("");

    try {
      await transitionPublishedInvitationState({
        slug: item.publicSlug,
        action,
      });
      setRefreshTick((prev) => prev + 1);
    } catch (transitionError) {
      const message =
        transitionError?.message || "No se pudo actualizar el estado de la invitacion.";
      setActionError(typeof message === "string" ? message : "No se pudo actualizar el estado de la invitacion.");
    } finally {
      setPendingActionKey("");
    }
  };

  return (
    <section className="rounded-2xl border border-[#dbe6f6] bg-gradient-to-br from-white via-[#f6f9ff] to-[#eef5ff] p-4 sm:p-6">
      <p className="text-xs font-medium uppercase tracking-[0.14em] text-gray-500">
        Publicadas
      </p>
      <h2 className="mt-1 text-2xl font-semibold text-gray-900">Invitaciones publicadas</h2>
      <p className="mt-1 text-sm text-gray-600">
        Gestiona tus invitaciones activas, pausadas y revisa las finalizadas.
      </p>

      {actionError ? (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {actionError}
        </div>
      ) : null}

      <div className="mt-5">
        {loading ? (
          <div className={PUBLICADAS_CARD_GRID_CLASS}>
            {Array.from({ length: 4 }).map((_, index) => (
              <div
                key={`skeleton-publicada-${index}`}
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
        ) : error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        ) : cards.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50/70 px-4 py-8 text-center text-sm text-gray-600">
            Todavia no tenes publicaciones activas ni finalizadas.
          </div>
        ) : (
          <div className={PUBLICADAS_CARD_GRID_CLASS}>
            {cards.map((item) => {
              const editUrl = item.borradorSlug
                ? `/dashboard?slug=${encodeURIComponent(item.borradorSlug)}`
                : "";
              const canOpenPublicLink = Boolean(item.url) && item.isActive;
              const statusDateLabel = item.isFinalized ? "Finalizada" : "Vigente hasta";
              const statusDateValue = item.isFinalized ? item.finalizadaEn : item.expiresAt;

              const pauseKey = `${item.publicSlug}:pause`;
              const resumeKey = `${item.publicSlug}:resume`;
              const trashKey = `${item.publicSlug}:move_to_trash`;
              const lifecycleAction = item.isPaused ? "resume" : item.isActive ? "pause" : "";
              const lifecycleActionKey = lifecycleAction
                ? `${item.publicSlug}:${lifecycleAction}`
                : "";
              const isLifecyclePending = lifecycleActionKey
                ? pendingActionKey === lifecycleActionKey
                : false;
              const isTrashPending = pendingActionKey === trashKey;
              const hasTopActions =
                item.source === "active" &&
                !item.isFinalized &&
                (item.isActive || item.isPaused);

              return (
                <article
                  key={`${item.source}-${item.id}`}
                  className={`group relative overflow-hidden rounded-2xl border border-gray-200/90 bg-white shadow-[0_2px_8px_rgba(15,23,42,0.06)] transition-all duration-300 ease-out hover:-translate-y-0.5 hover:border-[#d9c8f5] hover:shadow-[0_14px_28px_rgba(111,59,192,0.14)] ${
                    item.isPaused ? "bg-amber-50/35" : ""
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
                          mode={item.isPaused ? "resume" : "pause"}
                          title={item.isPaused ? "Reanudar invitacion" : "Pausar invitacion"}
                          ariaLabel={`${item.isPaused ? "Reanudar" : "Pausar"} ${item.nombre}`}
                          isPending={isLifecyclePending}
                          disabled={Boolean(pendingActionKey && !isLifecyclePending)}
                          onClick={(event) => {
                            event.stopPropagation();
                            runTransition(item, lifecycleAction);
                          }}
                        />
                      ) : null}

                      {item.isPaused ? (
                        <DashboardCardTrashButton
                          title="Mover a papelera"
                          ariaLabel={`Mover ${item.nombre} a papelera`}
                          isPending={isTrashPending}
                          disabled={Boolean(pendingActionKey && !isTrashPending)}
                          placement="inline"
                          onClick={(event) => {
                            event.stopPropagation();
                            runTransition(item, "move_to_trash");
                          }}
                        />
                      ) : null}
                    </div>
                  ) : null}

                  <div className="relative aspect-square overflow-hidden border-b border-gray-100 bg-gray-100">
                    {item.portada ? (
                      <img
                        src={item.portada}
                        alt={`Portada de ${item.nombre}`}
                        className={`h-full w-full object-cover object-top transition-transform duration-500 ease-out group-hover:scale-[1.03] motion-reduce:transition-none ${
                          item.isPaused ? "opacity-80 saturate-[0.9]" : ""
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
                      <h3 className="truncate text-sm font-semibold text-gray-800" title={item.nombre}>
                        {item.nombre}
                      </h3>
                      <StatusBadge label={item.statusLabel} />
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
            })}
          </div>
        )}
      </div>
    </section>
  );
}
