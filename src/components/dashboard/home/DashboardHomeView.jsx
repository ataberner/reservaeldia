import { useCallback, useEffect } from "react";
import DashboardDraftRailSection from "@/components/dashboard/home/DashboardDraftRailSection";
import DashboardHomeHero from "@/components/dashboard/home/DashboardHomeHero";
import DashboardPublicationRailSection from "@/components/dashboard/home/DashboardPublicationRailSection";
import DashboardSectionShell from "@/components/dashboard/home/DashboardSectionShell";
import DashboardTemplateRailSection from "@/components/dashboard/home/DashboardTemplateRailSection";
import { useDashboardDrafts } from "@/hooks/useDashboardDrafts";
import { useDashboardHomeConfig } from "@/hooks/useDashboardHomeConfig";
import { useDashboardHomeSections } from "@/hooks/useDashboardHomeSections";
import { useDashboardHomeTemplates } from "@/hooks/useDashboardHomeTemplates";
import { useDashboardPublications } from "@/hooks/useDashboardPublications";

const TEMPLATE_COLLECTIONS_ANCHOR_ID = "dashboard-home-template-collections";

export default function DashboardHomeView({
  usuario,
  tipoInvitacion,
  isSuperAdmin = false,
  onSelectTemplate,
  onReadyChange,
}) {
  const userUid = usuario?.uid || "";
  const {
    drafts,
    loading: loadingDrafts,
    error: draftsError,
    removeDraft,
  } = useDashboardDrafts({ userUid });
  const {
    publications,
    loading: loadingPublications,
    error: publicationsError,
    refresh: refreshPublications,
  } = useDashboardPublications({ userUid });
  const {
    templates,
    loading: loadingTemplates,
    error: templatesError,
    removeTemplate,
  } = useDashboardHomeTemplates({ tipo: tipoInvitacion });
  const {
    config,
    loading: loadingConfig,
    error: configError,
  } = useDashboardHomeConfig();
  const {
    sections,
    heroTargetId,
    hasTemplateSections,
  } = useDashboardHomeSections({
    drafts,
    publications,
    templates,
    config,
  });

  useEffect(() => {
    const ready =
      !loadingDrafts &&
      !loadingPublications &&
      !loadingTemplates &&
      !loadingConfig;
    onReadyChange?.(ready);
  }, [
    loadingConfig,
    loadingDrafts,
    loadingPublications,
    loadingTemplates,
    onReadyChange,
  ]);

  const handleCreateInvitation = useCallback(() => {
    if (typeof document === "undefined") return;
    const targetId = heroTargetId || TEMPLATE_COLLECTIONS_ANCHOR_ID;
    const node = document.getElementById(targetId);
    if (!node) return;
    node.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }, [heroTargetId]);

  const hasCollectionLoadError = Boolean(configError || templatesError);
  const safeSections = Array.isArray(sections) ? sections : [];

  return (
    <div className="mx-auto w-full max-w-7xl space-y-8">
      <DashboardHomeHero onCreateInvitation={handleCreateInvitation} />

      {hasCollectionLoadError ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {configError || templatesError}
        </div>
      ) : null}

      {safeSections
        .filter(
          (section) =>
            section?.kind === "publications" || section?.kind === "drafts"
        )
        .map((section) => {
          if (section.kind === "publications") {
            return (
              <DashboardPublicationRailSection
                key={section.id}
                items={section.items}
                error={publicationsError}
                onRefresh={refreshPublications}
              />
            );
          }

          return (
            <DashboardDraftRailSection
              key={section.id}
              items={section.items}
              error={draftsError}
              onDraftRemoved={removeDraft}
            />
          );
        })}

      <div id={TEMPLATE_COLLECTIONS_ANCHOR_ID} className="space-y-8">
        {safeSections
          .filter(
            (section) =>
              section?.kind === "featured_templates" ||
              section?.kind === "template_category"
          )
          .map((section) => (
            <DashboardTemplateRailSection
              key={section.id}
              anchorId={section.anchorId}
              title={section.title}
              description={section.description}
              tagLabel={section.tagLabel}
              items={section.items}
              isSuperAdmin={isSuperAdmin}
              onSelectTemplate={onSelectTemplate}
              onTemplateRemoved={removeTemplate}
            />
          ))}

        {!hasTemplateSections && !loadingTemplates && !loadingConfig ? (
          <DashboardSectionShell
            title="Colecciones editoriales en preparacion"
            description="Este dashboard se organiza desde Gestion del sitio con etiquetas editoriales existentes. Cuando haya colecciones activas, apareceran aqui."
            eyebrow="Explorar plantillas"
          >
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/75 px-5 py-8 text-sm text-slate-600">
              Aun no hay categorias editoriales activas para mostrar en el dashboard.
            </div>
          </DashboardSectionShell>
        ) : null}
      </div>
    </div>
  );
}
