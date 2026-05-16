import { useCallback, useEffect } from "react";
import DashboardLandingCarouselSections from "@/components/dashboard/home/DashboardLandingCarouselSections";
import DashboardPublicationSummarySection from "@/components/dashboard/home/DashboardPublicationSummarySection";
import LandingHero from "@/components/landing/LandingHero";
import { useDashboardDrafts } from "@/hooks/useDashboardDrafts";
import { useDashboardHomeConfig } from "@/hooks/useDashboardHomeConfig";
import { useDashboardHomeSections } from "@/hooks/useDashboardHomeSections";
import { useDashboardHomeTemplates } from "@/hooks/useDashboardHomeTemplates";
import { useDashboardPublications } from "@/hooks/useDashboardPublications";

const TEMPLATE_COLLECTIONS_ANCHOR_ID = "dashboard-home-template-collections";

export default function DashboardHomeView({
  usuario,
  tipoInvitacion,
  onSelectTemplate,
  onOpenPublicationResponses,
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
  } = useDashboardPublications({ userUid });
  const {
    templates,
    loading: loadingTemplates,
    error: templatesError,
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

  const safeSections = Array.isArray(sections) ? sections : [];

  return (
    <div className="w-full">
      <LandingHero
        ctaHref={`#${heroTargetId || TEMPLATE_COLLECTIONS_ANCHOR_ID}`}
        onCtaClick={handleCreateInvitation}
      />

      <div className="mx-auto w-full max-w-7xl">
        <DashboardPublicationSummarySection
          publications={publications}
          loading={loadingPublications}
          onOpenResponses={onOpenPublicationResponses}
        />
      </div>

      <DashboardLandingCarouselSections
        rootId={TEMPLATE_COLLECTIONS_ANCHOR_ID}
        sections={safeSections}
        draftsError={draftsError}
        publicationsError={publicationsError}
        templatesError={templatesError}
        configError={configError}
        loadingTemplates={loadingTemplates}
        loadingConfig={loadingConfig}
        hasTemplateSections={hasTemplateSections}
        onDraftRemoved={removeDraft}
        onOpenPublicationResponses={onOpenPublicationResponses}
        onSelectTemplate={onSelectTemplate}
      />
    </div>
  );
}
