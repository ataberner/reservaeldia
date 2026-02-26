import { useEffect, useState } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { getFunctions, httpsCallable } from "firebase/functions";
import { db } from "@/firebase";
import ConfirmDeleteItemModal from "@/components/ConfirmDeleteItemModal";
import DashboardCardDeleteButton from "@/components/DashboardCardDeleteButton";

const HOME_READY_THUMBNAIL_TARGET = 2;
const THUMBNAIL_SETTLE_TIMEOUT_MS = 900;
const DASHBOARD_CARD_GRID_CLASS =
  "grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 md:grid-cols-4 xl:grid-cols-6";

const DRAFT_PREVIEW_KEYS = [
  "thumbnailUrl",
  "thumbnailurl",
  "thumbnail_url",
  "portada",
  "previewUrl",
  "previewurl",
];

function toMs(value) {
  if (!value) return 0;
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = new Date(value).getTime();
    return Number.isFinite(parsed) ? parsed : 0;
  }
  if (typeof value === "object" && typeof value.toDate === "function") {
    const parsed = value.toDate();
    return parsed instanceof Date ? parsed.getTime() : 0;
  }
  if (typeof value === "object" && typeof value.seconds === "number") {
    return value.seconds * 1000;
  }
  return 0;
}

function formatFecha(value) {
  const ms = toMs(value);
  if (!ms) return "";
  const date = new Date(ms);
  return new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function toNonEmptyString(value) {
  if (typeof value !== "string") return "";
  return value.trim();
}

function isImageSrc(value) {
  if (!value) return false;
  return (
    /^https?:\/\//i.test(value) ||
    /^data:image\//i.test(value) ||
    /^blob:/i.test(value) ||
    value.startsWith("/")
  );
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

function getBorradorPreviewCandidates(borrador) {
  const candidates = [];

  for (const key of DRAFT_PREVIEW_KEYS) {
    const candidate = toNonEmptyString(borrador?.[key]);
    if (isImageSrc(candidate) && !candidates.includes(candidate)) {
      candidates.push(candidate);
    }
  }

  if (!candidates.includes("/placeholder.jpg")) {
    candidates.push("/placeholder.jpg");
  }

  return candidates;
}

function getLifecycleState(borrador) {
  const explicitState = toNonEmptyString(borrador?.publicationLifecycle?.state).toLowerCase();
  if (explicitState === "draft" || explicitState === "published" || explicitState === "finalized") {
    return explicitState;
  }

  const hasPublicSlug = Boolean(toNonEmptyString(borrador?.slugPublico));
  return hasPublicSlug ? "published" : "draft";
}

function isVisibleDraft(borrador) {
  return getLifecycleState(borrador) === "draft";
}

function getDraftLastUpdatedValue(borrador) {
  return (
    borrador?.ultimaEdicion ||
    borrador?.updatedAt ||
    borrador?.fechaActualizacion ||
    borrador?.creadoEn ||
    borrador?.createdAt ||
    borrador?.publicationLifecycle?.lastPublishedAt ||
    null
  );
}

function getDraftThumbnailVersionValue(borrador) {
  return (
    borrador?.thumbnailUpdatedAt ||
    getDraftLastUpdatedValue(borrador)
  );
}

export default function BorradoresGrid({
  mostrarTitulo = true,
  emptyMessage = "Aun no tienes borradores.",
  onReadyChange,
}) {
  const [borradores, setBorradores] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [deletingSlug, setDeletingSlug] = useState(null);
  const [draftPendingDelete, setDraftPendingDelete] = useState(null);
  const [thumbnailsSettledBySlug, setThumbnailsSettledBySlug] = useState({});

  const markThumbnailSettled = (slug) => {
    setThumbnailsSettledBySlug((prev) => {
      if (!slug || prev[slug]) return prev;
      return { ...prev, [slug]: true };
    });
  };

  useEffect(() => {
    const user = getAuth().currentUser;
    if (!user) {
      setBorradores([]);
      setCargando(false);
      return () => {};
    }

    const q = query(collection(db, "borradores"), where("userId", "==", user.uid));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const docs = snapshot.docs
          .map((docItem) => ({ id: docItem.id, ...docItem.data() }))
          .filter((draft) => isVisibleDraft(draft))
          .sort((a, b) => {
            const aTime = toMs(getDraftLastUpdatedValue(a));
            const bTime = toMs(getDraftLastUpdatedValue(b));
            return bTime - aTime;
          });

        setBorradores(docs);
        setCargando(false);
      },
      (error) => {
        console.error("Error cargando borradores:", error);
        setBorradores([]);
        setCargando(false);
      }
    );

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    setThumbnailsSettledBySlug({});
  }, [borradores]);

  useEffect(() => {
    if (typeof onReadyChange !== "function") return;

    const total = Array.isArray(borradores) ? borradores.length : 0;
    const settled = Object.keys(thumbnailsSettledBySlug).length;
    const readyTarget = Math.min(total, HOME_READY_THUMBNAIL_TARGET);
    const ready = !cargando && (total === 0 || settled >= readyTarget);
    onReadyChange(ready);
  }, [borradores, cargando, onReadyChange, thumbnailsSettledBySlug]);

  useEffect(() => {
    if (cargando) return;
    if (!Array.isArray(borradores) || borradores.length === 0) return;
    if (typeof window === "undefined") return;

    const pendingCriticalSlugs = borradores
      .slice(0, HOME_READY_THUMBNAIL_TARGET)
      .map((borrador) => borrador?.slug || borrador?.id)
      .filter(Boolean)
      .filter((slug) => !thumbnailsSettledBySlug[slug]);

    if (!pendingCriticalSlugs.length) return;

    const timeoutId = window.setTimeout(() => {
      setThumbnailsSettledBySlug((prev) => {
        let changed = false;
        const next = { ...prev };
        pendingCriticalSlugs.forEach((slug) => {
          if (!next[slug]) {
            next[slug] = true;
            changed = true;
          }
        });
        return changed ? next : prev;
      });
    }, THUMBNAIL_SETTLE_TIMEOUT_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [borradores, cargando, thumbnailsSettledBySlug]);

  const borrarBorrador = async () => {
    const slug = draftPendingDelete?.slug;
    if (!slug || deletingSlug) return;
    setDeletingSlug(slug);
    try {
      const functions = getFunctions();
      const borrar = httpsCallable(functions, "borrarBorrador");
      await borrar({ slug });

      setBorradores((prev) => prev.filter((b) => (b.slug || b.id) !== slug));
      setDraftPendingDelete(null);
    } catch (error) {
      console.error("Error al borrar borrador:", error);
      alert("No se pudo borrar el borrador.");
    } finally {
      setDeletingSlug(null);
    }
  };

  if (cargando) {
    return (
      <div className={DASHBOARD_CARD_GRID_CLASS}>
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={`skeleton-draft-${index}`}
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
    );
  }

  if (!borradores.length) {
    return (
      <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50/70 px-4 py-8 text-center text-sm text-gray-600">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className={mostrarTitulo ? "mt-2" : ""}>
      {mostrarTitulo && (
        <h2 className="mb-4 text-xl font-semibold text-gray-900">Tus borradores</h2>
      )}

      <div className={DASHBOARD_CARD_GRID_CLASS}>
        {borradores.map((borrador, index) => {
          const slug = borrador.slug || borrador.id;
          const nombre = borrador.nombre || slug;
          const href = `/dashboard?slug=${encodeURIComponent(slug)}`;
          const previewVersion = toMs(getDraftThumbnailVersionValue(borrador));
          const previewCandidates = getBorradorPreviewCandidates(borrador).map((candidate) =>
            appendCacheBust(candidate, previewVersion)
          );
          const previewSrc = previewCandidates[0] || "/placeholder.jpg";
          const fecha = formatFecha(getDraftLastUpdatedValue(borrador));

          return (
            <article
              key={slug}
              className="group relative overflow-hidden rounded-2xl border border-gray-200/90 bg-white shadow-[0_2px_8px_rgba(15,23,42,0.06)] transition-all duration-300 ease-out hover:-translate-y-0.5 hover:border-[#d9c8f5] hover:shadow-[0_14px_28px_rgba(111,59,192,0.14)] focus-within:-translate-y-0.5 focus-within:border-[#d9c8f5] focus-within:shadow-[0_14px_28px_rgba(111,59,192,0.14)]"
            >
              <a
                href={href}
                className="block rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6f3bc0] focus-visible:ring-offset-2"
                onClick={(event) => {
                  event.preventDefault();
                  const detail = {
                    slug,
                    editor: borrador.editor || "konva",
                  };
                  window.dispatchEvent(new CustomEvent("abrir-borrador", { detail }));
                }}
                aria-label={`Abrir borrador ${nombre}`}
              >
                <div className="relative aspect-square overflow-hidden bg-gray-100">
                  <img
                    src={previewSrc}
                    alt={`Vista previa de ${nombre}`}
                    className="h-full w-full object-cover object-top transition-transform duration-500 ease-out group-hover:scale-[1.03] group-focus-within:scale-[1.03] motion-reduce:transition-none"
                    loading={index < HOME_READY_THUMBNAIL_TARGET ? "eager" : "lazy"}
                    decoding="async"
                    fetchPriority={index < 2 ? "high" : "auto"}
                    data-preview-index="0"
                    onLoad={() => {
                      markThumbnailSettled(slug);
                    }}
                    onError={(event) => {
                      const img = event.currentTarget;
                      const currentIndex = Number.parseInt(img.dataset.previewIndex || "0", 10);
                      const nextIndex = currentIndex + 1;
                      if (nextIndex >= previewCandidates.length) {
                        markThumbnailSettled(slug);
                        return;
                      }
                      img.dataset.previewIndex = String(nextIndex);
                      img.src = previewCandidates[nextIndex];
                    }}
                  />
                  <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#2d1a4a]/18 via-transparent to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100 group-focus-within:opacity-100 motion-reduce:transition-none" />
                </div>

                <div className="p-3">
                  <h3
                    className="truncate text-sm font-semibold text-gray-800 transition-colors duration-200 group-hover:text-[#4d2b86] group-focus-within:text-[#4d2b86]"
                    title={nombre}
                  >
                    {nombre}
                  </h3>
                  {fecha && <p className="mt-1 text-[11px] text-gray-500">Actualizado: {fecha}</p>}
                  <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#6f3bc0] transition-all duration-200 group-hover:translate-x-0.5 group-hover:text-[#5a2daa] group-focus-within:translate-x-0.5 group-focus-within:text-[#5a2daa]">
                    Abrir borrador
                  </p>
                </div>
              </a>

              <DashboardCardDeleteButton
                title="Borrar borrador"
                ariaLabel={`Borrar borrador ${nombre}`}
                isDeleting={deletingSlug === slug}
                disabled={Boolean(deletingSlug && deletingSlug !== slug)}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  setDraftPendingDelete({ slug, nombre });
                }}
              />
            </article>
          );
        })}
      </div>

      <ConfirmDeleteItemModal
        isOpen={Boolean(draftPendingDelete)}
        itemTypeLabel="borrador"
        itemName={draftPendingDelete?.nombre || draftPendingDelete?.slug}
        isDeleting={Boolean(deletingSlug)}
        onCancel={() => {
          if (deletingSlug) return;
          setDraftPendingDelete(null);
        }}
        onConfirm={borrarBorrador}
      />
    </div>
  );
}
