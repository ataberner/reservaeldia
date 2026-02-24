// src/components/PlantillaGrid.jsx
import { useEffect, useState } from "react";
import { getFunctions, httpsCallable } from "firebase/functions";

const HOME_READY_THUMBNAIL_TARGET = 2;
const THUMBNAIL_SETTLE_TIMEOUT_MS = 900;

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

  const borrarPlantilla = async (plantillaId) => {
    const confirmar = confirm("Seguro que quieres borrar esta plantilla? Esta accion no se puede deshacer.");
    if (!confirmar) return;

    setDeletingId(plantillaId);
    try {
      const functions = getFunctions();
      const borrar = httpsCallable(functions, "borrarPlantilla");
      await borrar({ plantillaId });
      onPlantillaBorrada?.(plantillaId);
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
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6">
      {plantillas.map((plantilla, index) => (
        <article
          key={plantilla.id}
          className="group relative overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"
        >
          {isSuperAdmin && (
            <button
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                borrarPlantilla(plantilla.id);
              }}
              disabled={deletingId === plantilla.id}
              title="Borrar plantilla"
              className="absolute right-2 top-2 z-20 h-7 w-7 rounded-full border border-gray-200 bg-white/95 text-gray-600 shadow-sm transition hover:bg-white hover:text-red-600 disabled:opacity-60"
            >
              {deletingId === plantilla.id ? "..." : "x"}
            </button>
          )}

          <div className="relative aspect-square overflow-hidden bg-gray-100">
            <img
              src={plantilla.portada || "/placeholder.jpg"}
              alt={`Vista previa de ${plantilla.nombre}`}
              className="h-full w-full object-cover object-top transition-transform duration-300 group-hover:scale-[1.02]"
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
          </div>

          <div className="p-3">
            <h3 className="truncate text-sm font-semibold text-gray-800" title={plantilla.nombre || "Plantilla"}>
              {plantilla.nombre || "Plantilla"}
            </h3>

            <button
              onClick={async () => {
                const slug = await crearCopia(plantilla);
                if (slug) onSeleccionarPlantilla(slug, plantilla);
              }}
              disabled={loadingId === plantilla.id}
              className="mt-3 w-full rounded-full border border-[#6f3bc0] bg-gradient-to-r from-[#6f3bc0] via-[#7a44ce] to-[#6c57c8] px-2.5 py-1.5 text-[11px] font-semibold text-white transition hover:from-[#6232ae] hover:via-[#6f3bc0] hover:to-[#5f4ab5] disabled:cursor-not-allowed disabled:opacity-70 sm:px-3 sm:py-2 sm:text-xs"
            >
              {loadingId === plantilla.id ? "Creando borrador..." : "Usar plantilla"}
            </button>
          </div>
        </article>
      ))}
    </div>
  );
}
