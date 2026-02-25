// src/components/PlantillaGrid.jsx
import { useEffect, useState } from "react";
import { getFunctions, httpsCallable } from "firebase/functions";
import ConfirmDeleteItemModal from "@/components/ConfirmDeleteItemModal";
import DashboardCardDeleteButton from "@/components/DashboardCardDeleteButton";

const HOME_READY_THUMBNAIL_TARGET = 2;
const THUMBNAIL_SETTLE_TIMEOUT_MS = 900;
const DASHBOARD_CARD_GRID_CLASS =
  "grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 md:grid-cols-4 xl:grid-cols-6";

const generarSlug = (texto) => {
  return String(texto || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9\s]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-");
};

export default function PlantillaGrid({
  plantillas,
  onSeleccionarPlantilla,
  onPlantillaBorrada,
  isSuperAdmin = false,
  onReadyChange,
}) {
  const [loadingId, setLoadingId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [templatePendingDelete, setTemplatePendingDelete] = useState(null);
  const [thumbnailsSettledById, setThumbnailsSettledById] = useState({});

  const markThumbnailSettled = (plantillaId) => {
    setThumbnailsSettledById((prev) => {
      if (!plantillaId || prev[plantillaId]) return prev;
      return { ...prev, [plantillaId]: true };
    });
  };

  useEffect(() => {
    setThumbnailsSettledById({});
  }, [plantillas]);

  useEffect(() => {
    if (typeof onReadyChange !== "function") return;
    const total = Array.isArray(plantillas) ? plantillas.length : 0;
    const settled = Object.keys(thumbnailsSettledById).length;
    const readyTarget = Math.min(total, HOME_READY_THUMBNAIL_TARGET);
    onReadyChange(total === 0 || settled >= readyTarget);
  }, [onReadyChange, plantillas, thumbnailsSettledById]);

  useEffect(() => {
    if (!Array.isArray(plantillas) || plantillas.length === 0) return;
    if (typeof window === "undefined") return;

    const pendingCriticalIds = plantillas
      .slice(0, HOME_READY_THUMBNAIL_TARGET)
      .map((plantilla) => plantilla?.id)
      .filter(Boolean)
      .filter((plantillaId) => !thumbnailsSettledById[plantillaId]);

    if (!pendingCriticalIds.length) return;

    const timeoutId = window.setTimeout(() => {
      setThumbnailsSettledById((prev) => {
        let changed = false;
        const next = { ...prev };
        pendingCriticalIds.forEach((plantillaId) => {
          if (!next[plantillaId]) {
            next[plantillaId] = true;
            changed = true;
          }
        });
        return changed ? next : prev;
      });
    }, THUMBNAIL_SETTLE_TIMEOUT_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [plantillas, thumbnailsSettledById]);

  const borrarPlantilla = async () => {
    const plantillaId = templatePendingDelete?.id;
    if (!plantillaId || deletingId) return;

    setDeletingId(plantillaId);
    try {
      const functions = getFunctions();
      const borrar = httpsCallable(functions, "borrarPlantilla");
      await borrar({ plantillaId });
      onPlantillaBorrada?.(plantillaId);
      setTemplatePendingDelete(null);
    } catch (error) {
      console.error("Error borrando plantilla:", error);
      alert("No se pudo borrar la plantilla.");
    } finally {
      setDeletingId(null);
    }
  };

  const crearCopia = async (plantilla) => {
    setLoadingId(plantilla.id);
    try {
      const functions = getFunctions();
      const copiarPlantilla = httpsCallable(functions, "copiarPlantilla");

      const slug = `${generarSlug(plantilla.nombre)}-${Date.now()}`;
      const result = await copiarPlantilla({ plantillaId: plantilla.id, slug });
      return result?.data?.slug || null;
    } catch (error) {
      console.error("Error copiando plantilla:", error);
      return null;
    } finally {
      setLoadingId(null);
    }
  };

  if (!Array.isArray(plantillas) || plantillas.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50/70 px-4 py-8 text-center text-sm text-gray-500">
        No encontramos plantillas para esta categoria.
      </div>
    );
  }

  return (
    <>
      <div className={DASHBOARD_CARD_GRID_CLASS}>
        {plantillas.map((plantilla, index) => {
          const nombrePlantilla = plantilla.nombre || "Plantilla";
          const isLoadingCurrent = loadingId === plantilla.id;

          return (
            <article
              key={plantilla.id}
              className="group relative overflow-hidden rounded-2xl border border-gray-200/90 bg-white shadow-[0_2px_8px_rgba(15,23,42,0.06)] transition-all duration-300 ease-out hover:-translate-y-0.5 hover:border-[#d9c8f5] hover:shadow-[0_14px_28px_rgba(111,59,192,0.14)] focus-within:-translate-y-0.5 focus-within:border-[#d9c8f5] focus-within:shadow-[0_14px_28px_rgba(111,59,192,0.14)]"
            >
              {isSuperAdmin && (
                <DashboardCardDeleteButton
                  title="Borrar plantilla"
                  ariaLabel={`Borrar plantilla ${nombrePlantilla}`}
                  isDeleting={deletingId === plantilla.id}
                  disabled={Boolean(deletingId && deletingId !== plantilla.id)}
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    setTemplatePendingDelete({
                      id: plantilla.id,
                      nombre: nombrePlantilla,
                    });
                  }}
                />
              )}

              <button
                type="button"
                onClick={async () => {
                  const slug = await crearCopia(plantilla);
                  if (slug) onSeleccionarPlantilla(slug, plantilla);
                }}
                disabled={isLoadingCurrent}
                className="block w-full rounded-2xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6f3bc0] focus-visible:ring-offset-2 disabled:cursor-not-allowed"
                aria-label={`Usar plantilla ${nombrePlantilla}`}
              >
                <div className="relative aspect-square overflow-hidden bg-gray-100">
                  <img
                    src={plantilla.portada || "/placeholder.jpg"}
                    alt={`Vista previa de ${nombrePlantilla}`}
                    className="h-full w-full object-cover object-top transition-transform duration-500 ease-out group-hover:scale-[1.03] group-focus-within:scale-[1.03] motion-reduce:transition-none"
                    loading={index < HOME_READY_THUMBNAIL_TARGET ? "eager" : "lazy"}
                    decoding="async"
                    fetchPriority={index < 2 ? "high" : "auto"}
                    onLoad={() => {
                      markThumbnailSettled(plantilla.id);
                    }}
                    onError={(event) => {
                      const img = event.currentTarget;
                      if (img.dataset.fallbackApplied === "1") {
                        markThumbnailSettled(plantilla.id);
                        return;
                      }
                      img.dataset.fallbackApplied = "1";
                      img.src = "/placeholder.jpg";
                    }}
                  />
                  <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#2d1a4a]/18 via-transparent to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100 group-focus-within:opacity-100 motion-reduce:transition-none" />
                </div>

                <div className="p-3">
                  <h3
                    className="truncate text-sm font-semibold text-gray-800 transition-colors duration-200 group-hover:text-[#4d2b86] group-focus-within:text-[#4d2b86]"
                    title={nombrePlantilla}
                  >
                    {nombrePlantilla}
                  </h3>
                  <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#6f3bc0] transition-all duration-200 group-hover:translate-x-0.5 group-hover:text-[#5a2daa] group-focus-within:translate-x-0.5 group-focus-within:text-[#5a2daa]">
                    {isLoadingCurrent ? "Creando borrador..." : "Usar plantilla"}
                  </p>
                </div>
              </button>
            </article>
          );
        })}
      </div>

      <ConfirmDeleteItemModal
        isOpen={Boolean(templatePendingDelete)}
        itemTypeLabel="plantilla"
        itemName={templatePendingDelete?.nombre}
        isDeleting={Boolean(deletingId)}
        onCancel={() => {
          if (deletingId) return;
          setTemplatePendingDelete(null);
        }}
        onConfirm={borrarPlantilla}
      />
    </>
  );
}