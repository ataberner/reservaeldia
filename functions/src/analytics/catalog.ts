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
  total_registered_users: {
    key: "total_registered_users",
    label: "Usuarios registrados totales",
    dashboardBlock: "executive",
    definition:
      "Cantidad acumulada de usuarios registrados al cierre del periodo analizado.",
    whyItMatters:
      "Mide el tamano real de la base de usuarios y sirve como denominador estable para conversion y productividad.",
    formula:
      "COUNT(analyticsUsers.userId) donde registeredAt es menor o igual al cierre del periodo.",
    sourceOfTruth:
      "analyticsUsers.registeredAt + analyticsDaily/analyticsWeekly/analyticsMonthly.executive.users.totalRegisteredUsers",
    technicalOwner: "analytics-platform",
    businessOwner: "growth",
    version: "1.0.0",
    backfillRules: "full_rebuild",
    unit: "count",
  },
  new_users_daily: {
    key: "new_users_daily",
    label: "Nuevos usuarios diarios",
    dashboardBlock: "executive",
    definition:
      "Cantidad de usuarios cuyo registro ocurrio dentro del dia analizado.",
    whyItMatters:
      "Permite seguir el ritmo diario de crecimiento y detectar rapidamente cambios en adquisicion.",
    formula:
      "COUNT(analyticsUsers.userId) donde registrationDateKey coincide con el dia del periodo.",
    sourceOfTruth:
      "analyticsUsers.registrationDateKey + analyticsDaily.executive.users.newUsers",
    technicalOwner: "analytics-platform",
    businessOwner: "growth",
    version: "1.0.0",
    backfillRules: "full_rebuild",
    unit: "count",
  },
  new_users_weekly: {
    key: "new_users_weekly",
    label: "Nuevos usuarios semanales",
    dashboardBlock: "executive",
    definition:
      "Cantidad de usuarios cuyo registro ocurrio dentro de la semana analizada.",
    whyItMatters:
      "Resume el crecimiento semanal y reduce el ruido diario para decisiones de marketing y operacion.",
    formula:
      "COUNT(analyticsUsers.userId) donde registrationWeekKey coincide con la semana del periodo.",
    sourceOfTruth:
      "analyticsUsers.registrationWeekKey + analyticsWeekly.executive.users.newUsers",
    technicalOwner: "analytics-platform",
    businessOwner: "growth",
    version: "1.0.0",
    backfillRules: "full_rebuild",
    unit: "count",
  },
  new_users_monthly: {
    key: "new_users_monthly",
    label: "Nuevos usuarios mensuales",
    dashboardBlock: "executive",
    definition:
      "Cantidad de usuarios cuyo registro ocurrio dentro del mes analizado.",
    whyItMatters:
      "Es la lectura principal de crecimiento neto del negocio y permite comparar meses cerrados.",
    formula:
      "COUNT(analyticsUsers.userId) donde registrationMonthKey coincide con el mes del periodo.",
    sourceOfTruth:
      "analyticsUsers.registrationMonthKey + analyticsMonthly.executive.users.newUsers",
    technicalOwner: "analytics-platform",
    businessOwner: "growth",
    version: "1.0.0",
    backfillRules: "full_rebuild",
    unit: "count",
  },
  new_users_annual: {
    key: "new_users_annual",
    label: "Nuevos usuarios anuales",
    dashboardBlock: "executive",
    definition:
      "Cantidad de usuarios cuyo registro ocurrio dentro del ano analizado.",
    whyItMatters:
      "Resume el crecimiento anual y permite comparar el negocio en ventanas ejecutivas mas amplias.",
    formula:
      "SUM(newUsers diarios) agrupados por ano calendario dentro del periodo analizado.",
    sourceOfTruth:
      "analyticsDaily.executive.users.newUsers agrupado anualmente en analytics overview",
    technicalOwner: "analytics-platform",
    businessOwner: "growth",
    version: "1.0.0",
    backfillRules: "full_rebuild",
    unit: "count",
  },
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
  users_who_published: {
    key: "users_who_published",
    label: "Usuarios que publican",
    dashboardBlock: "executive",
    definition:
      "Cantidad acumulada de usuarios que ya publicaron al menos una invitacion al cierre del periodo.",
    whyItMatters:
      "Mide cuantos usuarios cruzaron el hito publico mas relevante del producto.",
    formula:
      "COUNT(DISTINCT userId) donde analyticsUsers.firstInvitationPublishedAt es menor o igual al cierre del periodo.",
    sourceOfTruth:
      "analyticsUsers.firstInvitationPublishedAt + analyticsDaily/analyticsWeekly/analyticsMonthly.executive.users.usersWhoPublished + analyticsCohorts",
    technicalOwner: "analytics-platform",
    businessOwner: "growth",
    version: "1.0.0",
    backfillRules: "full_rebuild",
    unit: "count",
  },
  published_invitations_per_user: {
    key: "published_invitations_per_user",
    label: "Invitaciones publicadas por usuario",
    dashboardBlock: "executive",
    definition:
      "Relacion entre invitaciones publicadas acumuladas y usuarios registrados acumulados al cierre del periodo.",
    whyItMatters:
      "Ayuda a entender si el crecimiento de usuarios se convierte en output real del producto.",
    formula:
      "published_invitations_cumulative / total_registered_users.",
    sourceOfTruth:
      "analyticsInvitations.firstPublishedAt + analyticsUsers.registeredAt + analyticsDaily/analyticsWeekly/analyticsMonthly.executive.users.publishedInvitationsPerUser + analyticsCohorts",
    technicalOwner: "analytics-platform",
    businessOwner: "growth",
    version: "1.0.0",
    backfillRules: "full_rebuild",
    unit: "ratio",
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
  paying_users: {
    key: "paying_users",
    label: "Clientes pagos",
    dashboardBlock: "executive",
    definition:
      "Cantidad acumulada de usuarios con al menos un pago aprobado al cierre del periodo.",
    whyItMatters:
      "Mide el alcance real de la monetizacion y cuantos usuarios convierten en clientes.",
    formula:
      "COUNT(DISTINCT userId) donde analyticsUsers.firstApprovedPaymentAt es menor o igual al cierre del periodo.",
    sourceOfTruth:
      "analyticsUsers.firstApprovedPaymentAt + analyticsDaily/analyticsWeekly/analyticsMonthly.executive.payments.payingUsers + analyticsCohorts",
    technicalOwner: "analytics-platform",
    businessOwner: "finance",
    version: "1.0.0",
    backfillRules: "full_rebuild",
    unit: "count",
  },
  payments_approved: {
    key: "payments_approved",
    label: "Pagos aprobados",
    dashboardBlock: "executive",
    definition:
      "Cantidad de pagos aprobados registrados dentro del periodo analizado.",
    whyItMatters:
      "Mide el volumen transaccional real del negocio y alimenta revenue y ticket promedio.",
    formula:
      "COUNT(pago_aprobado) donde occurredAt cae dentro del periodo.",
    sourceOfTruth:
      "analyticsDaily/analyticsWeekly/analyticsMonthly.executive.payments.paymentsApproved + analyticsCohorts",
    technicalOwner: "analytics-platform",
    businessOwner: "finance",
    version: "1.0.0",
    backfillRules: "full_rebuild",
    unit: "count",
  },
  total_revenue: {
    key: "total_revenue",
    label: "Ingresos totales",
    dashboardBlock: "executive",
    definition:
      "Suma acumulada del monto real abonado de todos los pagos aprobados al cierre del periodo, neto de descuentos.",
    whyItMatters:
      "Es la lectura principal de monetizacion y el total historico que produjo el negocio.",
    formula:
      "SUM(amountArs neto) de pago_aprobado con occurredAt menor o igual al cierre del periodo.",
    sourceOfTruth:
      "analyticsUsers.revenueTotalArs + analyticsInvitations.revenueTotalArs + analyticsDaily/analyticsWeekly/analyticsMonthly.executive.payments.totalRevenue",
    technicalOwner: "analytics-platform",
    businessOwner: "finance",
    version: "1.0.0",
    backfillRules: "full_rebuild",
    unit: "count",
  },
  revenue_daily: {
    key: "revenue_daily",
    label: "Ingresos diarios",
    dashboardBlock: "executive",
    definition:
      "Ingresos reales abonados generados dentro del dia analizado, netos de descuentos.",
    whyItMatters:
      "Permite ver la monetizacion operativa del dia y detectar cambios rapidamente.",
    formula:
      "SUM(amountArs neto) de pago_aprobado donde businessDateKey coincide con el dia del periodo.",
    sourceOfTruth:
      "analyticsDaily.executive.payments.revenue",
    technicalOwner: "analytics-platform",
    businessOwner: "finance",
    version: "1.0.0",
    backfillRules: "full_rebuild",
    unit: "count",
  },
  revenue_weekly: {
    key: "revenue_weekly",
    label: "Ingresos semanales",
    dashboardBlock: "executive",
    definition:
      "Ingresos reales abonados generados dentro de la semana analizada, netos de descuentos.",
    whyItMatters:
      "Entrega una vista ejecutiva estable del negocio sin el ruido diario.",
    formula:
      "SUM(amountArs neto) de pago_aprobado donde businessWeekKey coincide con la semana del periodo.",
    sourceOfTruth:
      "analyticsWeekly.executive.payments.revenue",
    technicalOwner: "analytics-platform",
    businessOwner: "finance",
    version: "1.0.0",
    backfillRules: "full_rebuild",
    unit: "count",
  },
  revenue_monthly: {
    key: "revenue_monthly",
    label: "Ingresos mensuales",
    dashboardBlock: "executive",
    definition:
      "Ingresos reales abonados generados dentro del mes analizado, netos de descuentos.",
    whyItMatters:
      "Es la lectura mensual principal de monetizacion para seguimiento ejecutivo.",
    formula:
      "SUM(amountArs neto) de pago_aprobado donde businessMonthKey coincide con el mes del periodo.",
    sourceOfTruth:
      "analyticsMonthly.executive.payments.revenue",
    technicalOwner: "analytics-platform",
    businessOwner: "finance",
    version: "1.0.0",
    backfillRules: "full_rebuild",
    unit: "count",
  },
  revenue_annual: {
    key: "revenue_annual",
    label: "Ingresos anuales",
    dashboardBlock: "executive",
    definition:
      "Ingresos reales abonados generados dentro del ano analizado, netos de descuentos.",
    whyItMatters:
      "Entrega una vista anual consolidada de monetizacion para lectura ejecutiva y comparacion interanual.",
    formula:
      "SUM(revenue diario neto) agrupado por ano calendario dentro del periodo analizado.",
    sourceOfTruth:
      "analyticsDaily.executive.payments.revenue agrupado anualmente en analytics overview",
    technicalOwner: "analytics-platform",
    businessOwner: "finance",
    version: "1.0.0",
    backfillRules: "full_rebuild",
    unit: "count",
  },
  average_order_value: {
    key: "average_order_value",
    label: "Ticket promedio",
    dashboardBlock: "executive",
    definition:
      "Monto real promedio abonado por pago aprobado dentro del periodo analizado, neto de descuentos.",
    whyItMatters:
      "Permite entender el valor economico promedio de cada transaccion aprobada.",
    formula:
      "revenue_period / payments_approved_period.",
    sourceOfTruth:
      "analyticsDaily/analyticsWeekly/analyticsMonthly.executive.payments.averageOrderValue + analyticsCohorts",
    technicalOwner: "analytics-platform",
    businessOwner: "finance",
    version: "1.0.0",
    backfillRules: "full_rebuild",
    unit: "count",
  },
  payment_conversion_rate: {
    key: "payment_conversion_rate",
    label: "Conversion a pago",
    dashboardBlock: "executive",
    definition:
      "Porcentaje acumulado de usuarios que ya pagaron sobre el total acumulado de usuarios que ya publicaron al cierre del periodo.",
    whyItMatters:
      "Mide la eficiencia comercial del flujo de publicacion hacia monetizacion real.",
    formula:
      "paying_users / users_who_published.",
    sourceOfTruth:
      "analyticsUsers.firstApprovedPaymentAt + analyticsUsers.firstInvitationPublishedAt + analyticsDaily/analyticsWeekly/analyticsMonthly.executive.conversion.paymentConversionRate + analyticsCohorts",
    technicalOwner: "analytics-platform",
    businessOwner: "growth",
    version: "1.0.0",
    backfillRules: "full_rebuild",
    unit: "ratio",
  },
};
