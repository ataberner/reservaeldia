import { useEffect, useState } from "react";
import { collection, query, where, getDocs } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { getFunctions, httpsCallable } from "firebase/functions";
import { db } from "@/firebase";

const HOME_READY_THUMBNAIL_TARGET = 2;
const THUMBNAIL_SETTLE_TIMEOUT_MS = 900;

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

export default function BorradoresGrid({
  mostrarTitulo = true,
  emptyMessage = "Aun no tienes borradores.",
  onReadyChange,
}) {
  const [borradores, setBorradores] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [thumbnailsSettledBySlug, setThumbnailsSettledBySlug] = useState({});

  const markThumbnailSettled = (slug) => {
    setThumbnailsSettledBySlug((prev) => {
      if (!slug || prev[slug]) return prev;
      return { ...prev, [slug]: true };
    });
  };

  useEffect(() => {
    let mounted = true;

    const fetchBorradores = async () => {
      const user = getAuth().currentUser;
      if (!user) {
        if (mounted) setCargando(false);
        return;
      }

      try {
        const q = query(collection(db, "borradores"), where("userId", "==", user.uid));
        const snapshot = await getDocs(q);

        const docs = snapshot.docs
          .map((doc) => ({ id: doc.id, ...doc.data() }))
          .sort((a, b) => {
            const aTime = toMs(a.updatedAt || a.fechaActualizacion || a.creadoEn || a.createdAt);
            const bTime = toMs(b.updatedAt || b.fechaActualizacion || b.creadoEn || b.createdAt);
            return bTime - aTime;
          });

        if (mounted) setBorradores(docs);
      } catch (error) {
        console.error("Error cargando borradores:", error);
        if (mounted) setBorradores([]);
      } finally {
        if (mounted) setCargando(false);
      }
    };

    fetchBorradores();

    return () => {
      mounted = false;
    };
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

  const borrarBorrador = async (slug) => {
    const confirmado = window.confirm(`Seguro que quieres borrar \"${slug}\"?`);
    if (!confirmado) return;

    try {
      const functions = getFunctions();
      const borrar = httpsCallable(functions, "borrarBorrador");
      await borrar({ slug });

      setBorradores((prev) => prev.filter((b) => (b.slug || b.id) !== slug));
      alert("Borrador eliminado correctamente.");
    } catch (error) {
      console.error("Error al borrar borrador:", error);
      alert("No se pudo borrar el borrador.");
    }
  };

  if (cargando) {
    return (
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={`skeleton-draft-${index}`}
            className="overflow-hidden rounded-xl border border-gray-200 bg-white"
          >
            <div className="aspect-square animate-pulse bg-gray-100" />
            <div className="space-y-2 p-3">
              <div className="h-3 animate-pulse rounded bg-gray-100" />
              <div className="h-8 animate-pulse rounded-full bg-gray-100" />
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

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6">
        {borradores.map((borrador, index) => {
          const slug = borrador.slug || borrador.id;
          const nombre = borrador.nombre || slug;
          const previewCandidates = getBorradorPreviewCandidates(borrador);
          const previewSrc = previewCandidates[0] || "/placeholder.jpg";
          const fecha = formatFecha(
            borrador.updatedAt || borrador.fechaActualizacion || borrador.creadoEn || borrador.createdAt
          );

          return (
            <article
              key={slug}
              className="group overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"
            >
              <div className="relative aspect-square overflow-hidden bg-gray-100">
                <img
                  src={previewSrc}
                  alt={`Vista previa de ${nombre}`}
                  className="h-full w-full object-cover object-top transition-transform duration-300 group-hover:scale-[1.02]"
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
              </div>

              <div className="p-3">
                <h3 className="truncate text-sm font-semibold text-gray-800" title={nombre}>
                  {nombre}
                </h3>
                {fecha && <p className="mt-1 text-[11px] text-gray-500">Actualizado: {fecha}</p>}

                <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                  <button
                    className="w-full rounded-full border border-[#6f3bc0] bg-gradient-to-r from-[#6f3bc0] via-[#7a44ce] to-[#6c57c8] px-2.5 py-1.5 text-[11px] font-semibold text-white transition hover:from-[#6232ae] hover:via-[#6f3bc0] hover:to-[#5f4ab5] sm:flex-1 sm:px-3 sm:py-2 sm:text-xs"
                    onClick={() => {
                      const detail = {
                        slug,
                        editor: borrador.editor || "konva",
                      };
                      window.dispatchEvent(new CustomEvent("abrir-borrador", { detail }));
                    }}
                  >
                    Editar
                  </button>

                  <button
                    className="w-full rounded-full border border-[#efd9e5] bg-gradient-to-r from-[#fff8fb] to-[#fff3f7] px-2.5 py-1.5 text-[11px] font-semibold text-[#9b3b67] transition hover:from-[#fdeff6] hover:to-[#fce7f2] sm:w-auto sm:px-3 sm:py-2 sm:text-xs"
                    onClick={() => borrarBorrador(slug)}
                  >
                    Borrar
                  </button>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
