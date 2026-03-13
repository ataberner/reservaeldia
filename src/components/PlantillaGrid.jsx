// src/components/PlantillaGrid.jsx
import { useEffect, useState } from "react";
import ConfirmDeleteItemModal from "@/components/ConfirmDeleteItemModal";
import DashboardCardTrashButton from "@/components/DashboardCardTrashButton";
import TemplateCardShell from "@/components/templates/TemplateCardShell";
import { moveTemplateToTrash } from "@/domain/templates/adminService";

const HOME_READY_THUMBNAIL_TARGET = 2;
const THUMBNAIL_SETTLE_TIMEOUT_MS = 900;
const DASHBOARD_CARD_GRID_CLASS =
  "grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 md:grid-cols-4 xl:grid-cols-6";

export default function PlantillaGrid({
  plantillas,
  onSelectTemplate,
  onPlantillaBorrada,
  isSuperAdmin = false,
  onReadyChange,
}) {
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

  const moverPlantillaAPapelera = async () => {
    const plantillaId = templatePendingDelete?.id;
    if (!plantillaId || deletingId) return;

    setDeletingId(plantillaId);
    try {
      await moveTemplateToTrash({ templateId: plantillaId });
      onPlantillaBorrada?.(plantillaId);
      setTemplatePendingDelete(null);
    } catch (error) {
      console.error("Error moviendo plantilla a papelera:", error);
      alert(error?.message || "No se pudo mover la plantilla a papelera.");
    } finally {
      setDeletingId(null);
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

          return (
            <TemplateCardShell
              key={plantilla.id}
              title={nombrePlantilla}
              imageSrc={plantilla.portada || "/placeholder.jpg"}
              imageAlt={`Vista previa de ${nombrePlantilla}`}
              onClick={() => {
                onSelectTemplate?.(plantilla);
              }}
              actionLabel="ver invitacion"
              eager={index < HOME_READY_THUMBNAIL_TARGET}
              onImageSettled={() => {
                markThumbnailSettled(plantilla.id);
              }}
              deleteControl={
                isSuperAdmin ? (
                  <DashboardCardTrashButton
                    title="Mover plantilla a papelera"
                    ariaLabel={`Mover plantilla ${nombrePlantilla} a papelera`}
                    isPending={deletingId === plantilla.id}
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
                ) : null
              }
            />
          );
        })}
      </div>

      <ConfirmDeleteItemModal
        isOpen={Boolean(templatePendingDelete)}
        itemTypeLabel="plantilla"
        itemName={templatePendingDelete?.nombre}
        isDeleting={Boolean(deletingId)}
        dialogTitle="Mover plantilla a papelera"
        dialogDescription={`"${templatePendingDelete?.nombre || "Esta plantilla"}" se movera a papelera.`}
        warningText="Dejara de estar disponible en el dashboard y podra restaurarse desde la gestion interna."
        confirmButtonText="Mover a papelera"
        confirmingButtonText="Moviendo..."
        onCancel={() => {
          if (deletingId) return;
          setTemplatePendingDelete(null);
        }}
        onConfirm={moverPlantillaAPapelera}
      />
    </>
  );
}
