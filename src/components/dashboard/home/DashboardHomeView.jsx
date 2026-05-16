import { useCallback, useEffect } from "react";
import DashboardLandingCarouselSections from "@/components/dashboard/home/DashboardLandingCarouselSections";
import DashboardPublicationSummarySection from "@/components/dashboard/home/DashboardPublicationSummarySection";
import LandingFeatureDetails from "@/components/landing/LandingFeatureDetails";
import LandingFooter from "@/components/landing/LandingFooter";
import LandingHero from "@/components/landing/LandingHero";
import LandingHowItWorks from "@/components/landing/LandingHowItWorks";
import LandingPricing from "@/components/landing/LandingPricing";
import LandingShareSection from "@/components/landing/LandingShareSection";
import { useDashboardDrafts } from "@/hooks/useDashboardDrafts";
import { useDashboardHomeConfig } from "@/hooks/useDashboardHomeConfig";
import { useDashboardHomeSections } from "@/hooks/useDashboardHomeSections";
import { useDashboardHomeTemplates } from "@/hooks/useDashboardHomeTemplates";
import { useDashboardPublications } from "@/hooks/useDashboardPublications";

const TEMPLATE_COLLECTIONS_ANCHOR_ID = "dashboard-home-template-collections";

const DASHBOARD_FOOTER_NAV_ITEMS = [
  { label: "Inicio", href: "/dashboard" },
  { label: "Invitaciones", href: `#${TEMPLATE_COLLECTIONS_ANCHOR_ID}` },
  { label: "Preguntas Frecuentes", href: "#preguntas-frecuentes" },
  { label: "Cómo funciona", href: "#dashboard-como-funciona" },
  { label: "Contacto", href: "#dashboard-contacto" },
];

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

      <div className="mt-[10px]">
        <LandingHowItWorks id="dashboard-como-funciona" />
      </div>

      <LandingPricing id="dashboard-precios" />

      <LandingFeatureDetails
        titleId="dashboard-funcionalidades-title"
        blendWithShareBackground
      />

      <LandingShareSection
        titleId="dashboard-compartir-title"
        ctaHref={`#${heroTargetId || TEMPLATE_COLLECTIONS_ANCHOR_ID}`}
        onCtaClick={handleCreateInvitation}
      />

      <LandingFooter
        id="dashboard-contacto"
        navItems={DASHBOARD_FOOTER_NAV_ITEMS}
      />
    </div>
  );
}
