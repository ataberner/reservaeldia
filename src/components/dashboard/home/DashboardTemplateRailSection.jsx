import { useState } from "react";
import ConfirmDeleteItemModal from "@/components/ConfirmDeleteItemModal";
import DashboardSectionShell from "@/components/dashboard/home/DashboardSectionShell";
import InfiniteTemplateRail from "@/components/dashboard/home/InfiniteTemplateRail";
import DashboardTemplateCard from "@/components/templates/DashboardTemplateCard";
import { moveTemplateToTrash } from "@/domain/templates/adminService";

export default function DashboardTemplateRailSection({
  anchorId = "",
  title,
  description,
  tagLabel = "",
  items,
  isSuperAdmin = false,
  onSelectTemplate,
  onTemplateRemoved,
}) {
  const safeItems = Array.isArray(items) ? items : [];
  const [deletingId, setDeletingId] = useState("");
  const [templatePendingDelete, setTemplatePendingDelete] = useState(null);

  if (!safeItems.length) return null;

  const handleConfirmDelete = async () => {
    const templateId = String(templatePendingDelete?.id || "").trim();
    if (!templateId || deletingId) return;

    setDeletingId(templateId);
    try {
      await moveTemplateToTrash({ templateId });
      onTemplateRemoved?.(templateId);
      setTemplatePendingDelete(null);
    } catch (error) {
      console.error("Error moviendo plantilla a papelera:", error);
      alert(error?.message || "No se pudo mover la plantilla a papelera.");
    } finally {
      setDeletingId("");
    }
  };

  return (
    <>
      <DashboardSectionShell
        anchorId={anchorId}
        eyebrow="Explorar plantillas"
        title={title}
        description={description}
        aside={
          tagLabel ? (
            <span className="inline-flex rounded-full border border-[#dfcff8] bg-[#faf6ff] px-3 py-1.5 text-xs font-semibold text-[#6f3bc0]">
              {tagLabel}
            </span>
          ) : null
        }
      >
        <InfiniteTemplateRail
          items={safeItems}
          getItemKey={(item) => item?.id || item?.slug || item?.nombre}
          renderItem={(item, index) => (
            <DashboardTemplateCard
              template={item}
              eager={index === 0}
              isSuperAdmin={isSuperAdmin}
              onSelectTemplate={onSelectTemplate}
              onRequestDelete={setTemplatePendingDelete}
            />
          )}
        />
      </DashboardSectionShell>

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
        onConfirm={handleConfirmDelete}
      />
    </>
  );
}
