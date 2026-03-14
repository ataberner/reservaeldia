import DashboardCardTrashButton from "@/components/DashboardCardTrashButton";
import TemplateCardShell from "@/components/templates/TemplateCardShell";

export default function DashboardTemplateCard({
  template,
  onSelectTemplate,
  isSuperAdmin = false,
  onRequestDelete,
  eager = false,
}) {
  const templateId = String(template?.id || "").trim();
  const title = template?.nombre || "Plantilla";

  return (
    <TemplateCardShell
      title={title}
      imageSrc={template?.portada || "/placeholder.jpg"}
      imageAlt={`Vista previa de ${title}`}
      onClick={() => {
        if (!templateId) return;
        onSelectTemplate?.(template);
      }}
      actionLabel="ver invitacion"
      eager={eager}
      deleteControl={
        isSuperAdmin ? (
          <DashboardCardTrashButton
            title="Mover plantilla a papelera"
            ariaLabel={`Mover plantilla ${title} a papelera`}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onRequestDelete?.(template);
            }}
          />
        ) : null
      }
    />
  );
}
