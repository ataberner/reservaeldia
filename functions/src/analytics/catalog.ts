export type MetricCatalogItem = {
  key: string;
  label: string;
  dashboardBlock: "executive" | "product" | "channel";
  definition: string;
  whyItMatters: string;
  formula: string;
  sourceOfTruth: string;
  technicalOwner: string;
  businessOwner: string;
  version: string;
  backfillRules: string;
  unit: "count" | "ratio" | "duration_seconds";
};

export const BUSINESS_METRIC_CATALOG: Record<string, MetricCatalogItem> = {
  published_invitations: {
    key: "published_invitations",
    label: "Invitaciones publicadas",
    dashboardBlock: "executive",
    definition:
      "Cantidad de invitaciones unicas cuya primera publicacion real ocurrio dentro del periodo analizado.",
    whyItMatters:
      "Mide el output real del producto y es la senal mas directa de valor entregado y conversion a uso publico.",
    formula:
      "COUNT(DISTINCT invitacionId) donde analyticsInvitations.firstPublishedAt cae dentro del periodo.",
    sourceOfTruth:
      "analyticsInvitations.firstPublishedAt + analyticsDaily/analyticsWeekly/analyticsMonthly.executive.publishedInvitations",
    technicalOwner: "analytics-platform",
    businessOwner: "product",
    version: "1.0.0",
    backfillRules: "full_rebuild",
    unit: "count",
  },
  activation_rate_created: {
    key: "activation_rate_created",
    label: "Activation Rate (creacion)",
    dashboardBlock: "executive",
    definition:
      "Porcentaje de usuarios registrados en un periodo que ya crearon su primera invitacion.",
    whyItMatters:
      "Mide que tan rapido el producto logra llevar al usuario desde el registro al primer uso real.",
    formula:
      "usuarios registrados en el periodo con firstInvitationCreatedAt / usuarios registrados en el periodo.",
    sourceOfTruth:
      "analyticsUsers + analyticsDaily/analyticsWeekly/analyticsMonthly.executive.activation + analyticsCohorts",
    technicalOwner: "analytics-platform",
    businessOwner: "growth",
    version: "1.0.0",
    backfillRules: "full_rebuild",
    unit: "ratio",
  },
  activation_rate_published: {
    key: "activation_rate_published",
    label: "Activation Rate (publicacion)",
    dashboardBlock: "executive",
    definition:
      "Porcentaje de usuarios registrados en un periodo que ya publicaron su primera invitacion.",
    whyItMatters:
      "Mide la conversion desde registro hasta valor visible para invitados, que es el hito comercial mas fuerte.",
    formula:
      "usuarios registrados en el periodo con firstInvitationPublishedAt / usuarios registrados en el periodo.",
    sourceOfTruth:
      "analyticsUsers + analyticsDaily/analyticsWeekly/analyticsMonthly.executive.activation + analyticsCohorts",
    technicalOwner: "analytics-platform",
    businessOwner: "growth",
    version: "1.0.0",
    backfillRules: "full_rebuild",
    unit: "ratio",
  },
  ttfv_create_avg_seconds: {
    key: "ttfv_create_avg_seconds",
    label: "TTFV creacion promedio",
    dashboardBlock: "product",
    definition:
      "Tiempo promedio entre el registro y la primera invitacion creada, medido solo sobre usuarios que alcanzaron ese hito.",
    whyItMatters:
      "Detecta friccion de onboarding y muestra cuan rapido el usuario logra su primer resultado util.",
    formula:
      "AVG(firstInvitationCreatedAt - registeredAt) para usuarios activados por creacion.",
    sourceOfTruth:
      "analyticsUsers.timeToFirstCreateSeconds + analyticsDaily/analyticsWeekly/analyticsMonthly.executive.ttfv + analyticsCohorts",
    technicalOwner: "analytics-platform",
    businessOwner: "product",
    version: "1.0.0",
    backfillRules: "full_rebuild",
    unit: "duration_seconds",
  },
  ttfv_create_p50_seconds: {
    key: "ttfv_create_p50_seconds",
    label: "TTFV creacion mediana",
    dashboardBlock: "product",
    definition:
      "Tiempo mediano entre registro y primera invitacion creada sobre usuarios que alcanzaron ese hito.",
    whyItMatters:
      "Reduce el sesgo de outliers y muestra la experiencia tipica real del usuario.",
    formula:
      "P50(firstInvitationCreatedAt - registeredAt) para usuarios activados por creacion.",
    sourceOfTruth:
      "analyticsUsers.timeToFirstCreateSeconds + analyticsDaily/analyticsWeekly/analyticsMonthly.executive.ttfv + analyticsCohorts",
    technicalOwner: "analytics-platform",
    businessOwner: "product",
    version: "1.0.0",
    backfillRules: "full_rebuild",
    unit: "duration_seconds",
  },
  ttfv_publish_avg_seconds: {
    key: "ttfv_publish_avg_seconds",
    label: "TTFV publicacion promedio",
    dashboardBlock: "product",
    definition:
      "Tiempo promedio entre registro y primera invitacion publicada, medido solo sobre usuarios que llegaron a publicar.",
    whyItMatters:
      "Refleja el tiempo total hasta la primera entrega publica del valor principal del producto.",
    formula:
      "AVG(firstInvitationPublishedAt - registeredAt) para usuarios activados por publicacion.",
    sourceOfTruth:
      "analyticsUsers.timeToFirstPublishSeconds + analyticsDaily/analyticsWeekly/analyticsMonthly.executive.ttfv + analyticsCohorts",
    technicalOwner: "analytics-platform",
    businessOwner: "product",
    version: "1.0.0",
    backfillRules: "full_rebuild",
    unit: "duration_seconds",
  },
  ttfv_publish_p50_seconds: {
    key: "ttfv_publish_p50_seconds",
    label: "TTFV publicacion mediana",
    dashboardBlock: "product",
    definition:
      "Tiempo mediano entre registro y primera invitacion publicada sobre usuarios que llegaron a publicar.",
    whyItMatters:
      "Permite entender la experiencia tipica de conversion completa evitando que pocos casos extremos distorsionen la lectura.",
    formula:
      "P50(firstInvitationPublishedAt - registeredAt) para usuarios activados por publicacion.",
    sourceOfTruth:
      "analyticsUsers.timeToFirstPublishSeconds + analyticsDaily/analyticsWeekly/analyticsMonthly.executive.ttfv + analyticsCohorts",
    technicalOwner: "analytics-platform",
    businessOwner: "product",
    version: "1.0.0",
    backfillRules: "full_rebuild",
    unit: "duration_seconds",
  },
};
