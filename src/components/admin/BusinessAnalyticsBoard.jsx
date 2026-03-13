import { useEffect, useMemo, useState } from "react";
import { useBusinessAnalytics } from "@/hooks/useBusinessAnalytics";

const SERIES_OPTIONS = [
  { key: "daily", label: "Diario" },
  { key: "weekly", label: "Semanal" },
  { key: "monthly", label: "Mensual" },
  { key: "annual", label: "Anual" },
];

const DISTRIBUTION_LABELS = {
  under_1h: "< 1h",
  from_1h_to_under_24h: "1h a < 24h",
  from_1d_to_under_7d: "1d a < 7d",
  from_7d_to_under_30d: "7d a < 30d",
  from_30d_or_more: ">= 30d",
  notReached: "No alcanzado",
};

function formatNumber(value) {
  return new Intl.NumberFormat("es-AR").format(Number(value || 0));
}

function formatPercent(value) {
  return new Intl.NumberFormat("es-AR", {
    style: "percent",
    maximumFractionDigits: 1,
  }).format(Number(value || 0));
}

function formatCurrency(value) {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

function formatDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds === null) return "Sin dato";
  if (seconds < 3600) {
    return `${Math.max(1, Math.round(seconds / 60))} min`;
  }
  if (seconds < 86400) {
    return `${(seconds / 3600).toFixed(1)} h`;
  }
  return `${(seconds / 86400).toFixed(1)} d`;
}

function formatDateKeyLabel(value) {
  if (typeof value !== "string" || !value.trim()) return "sin fecha";
  const parsed = new Date(`${value.trim()}T12:00:00.000Z`);
  if (!Number.isFinite(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(parsed);
}

function isDateKey(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value.trim());
}

function getDateKeyDiffInDays(fromDate, toDate) {
  const from = new Date(`${fromDate}T12:00:00.000Z`);
  const to = new Date(`${toDate}T12:00:00.000Z`);
  if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime())) return Number.NaN;
  return Math.round((to.getTime() - from.getTime()) / 86400000);
}

function buildRangeValidationMessage(fromDate, toDate) {
  if (!isDateKey(fromDate) || !isDateKey(toDate)) {
    return "Completa ambas fechas en formato valido.";
  }

  const diffDays = getDateKeyDiffInDays(fromDate, toDate);
  if (!Number.isFinite(diffDays)) {
    return "No se pudo interpretar el rango de fechas.";
  }
  if (diffDays < 0) {
    return "La fecha Desde no puede ser mayor que la fecha Hasta.";
  }
  if (diffDays + 1 > 365) {
    return "El rango maximo permitido es de 365 dias.";
  }

  return "";
}

function getMetric(data, key) {
  return data?.metricCatalog?.[key] || null;
}

function MetricTooltip({ metric }) {
  if (!metric) return null;

  return (
    <div className="group relative inline-flex">
      <span className="inline-flex h-5 w-5 cursor-help items-center justify-center rounded-full border border-slate-300 bg-white text-[11px] font-semibold text-slate-600">
        i
      </span>
      <div className="pointer-events-none absolute left-1/2 top-7 z-20 hidden w-72 -translate-x-1/2 rounded-xl border border-slate-200 bg-slate-950 p-3 text-left text-xs text-slate-100 shadow-2xl group-hover:block">
        <p className="font-semibold text-white">{metric.label}</p>
        <p className="mt-2 text-slate-200">{metric.definition}</p>
        <p className="mt-2 text-slate-300">Por que importa: {metric.whyItMatters}</p>
        <p className="mt-2 text-slate-300">Formula: {metric.formula}</p>
        <p className="mt-2 text-slate-400">Fuente de datos: {metric.sourceOfTruth}</p>
      </div>
    </div>
  );
}

function MetricCard({ title, metric, value, detail, accent = "emerald" }) {
  const accentMap = {
    emerald: "from-emerald-500 to-teal-500",
    amber: "from-amber-500 to-orange-500",
    blue: "from-sky-500 to-indigo-500",
    rose: "from-rose-500 to-fuchsia-500",
  };

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
            <MetricTooltip metric={metric} />
          </div>
          <div className={`mt-3 inline-flex rounded-full bg-gradient-to-r px-3 py-1 text-[11px] font-semibold text-white ${accentMap[accent] || accentMap.emerald}`}>
            KPI
          </div>
        </div>
      </div>
      <p className="mt-4 text-3xl font-bold tracking-tight text-slate-950">{value}</p>
      {detail ? <p className="mt-2 text-sm text-slate-500">{detail}</p> : null}
    </article>
  );
}

function SeriesChart({ title, metric, points, getValue, formatValue }) {
  const maxValue = Math.max(
    1,
    ...(Array.isArray(points) ? points.map((point) => Number(getValue(point) || 0)) : [0])
  );

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
        <MetricTooltip metric={metric} />
      </div>
      <div className="mt-4 flex h-44 items-end gap-2">
        {Array.isArray(points) && points.length > 0 ? (
          points.map((point) => {
            const value = Number(getValue(point) || 0);
            const height = `${Math.max(8, Math.round((value / maxValue) * 100))}%`;
            return (
              <div key={point.periodKey} className="flex min-w-0 flex-1 flex-col items-center gap-2">
                <span className="text-[11px] font-semibold text-slate-700">
                  {formatValue(value)}
                </span>
                <div className="flex h-full w-full items-end rounded-xl bg-slate-100 p-1">
                  <div
                    className="w-full rounded-lg bg-gradient-to-t from-emerald-500 to-teal-400"
                    style={{ height }}
                  />
                </div>
                <span className="truncate text-[10px] text-slate-500">{point.periodKey}</span>
              </div>
            );
          })
        ) : (
          <div className="flex h-full w-full items-center justify-center text-sm text-slate-500">
            Todavia no hay datos suficientes.
          </div>
        )}
      </div>
    </section>
  );
}

function DistributionCard({ title, metric, distribution }) {
  const total = Object.values(distribution || {}).reduce(
    (accumulator, value) => accumulator + Number(value || 0),
    0
  );

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
        <MetricTooltip metric={metric} />
      </div>
      <div className="mt-4 space-y-3">
        {Object.entries(DISTRIBUTION_LABELS).map(([key, label]) => {
          const value = Number(distribution?.[key] || 0);
          const width = total > 0 ? `${Math.max((value / total) * 100, value > 0 ? 8 : 0)}%` : "0%";
          return (
            <div key={key} className="space-y-1">
              <div className="flex items-center justify-between gap-3 text-xs text-slate-600">
                <span>{label}</span>
                <span className="font-semibold text-slate-800">{formatNumber(value)}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-gradient-to-r from-sky-500 to-indigo-500" style={{ width }} />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function CohortHeatmap({ cohorts }) {
  const maxColumns = 6;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <h3 className="text-sm font-semibold text-slate-800">Cohortes de publicacion y pago</h3>
      <div className="mt-4 overflow-x-auto">
        <table className="min-w-full border-separate border-spacing-y-2 text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-[0.12em] text-slate-500">
              <th className="pr-4">Cohorte</th>
              <th className="pr-4">Usuarios</th>
              <th className="pr-4">Act. publicacion</th>
              <th className="pr-4">Publican</th>
              <th className="pr-4">Clientes pagos</th>
              <th className="pr-4">Conv. pago</th>
              {Array.from({ length: maxColumns }).map((_, index) => (
                <th key={index} className="pr-3">{`M${index}`}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(cohorts || []).map((cohort) => (
              <tr key={cohort.cohortMonth} className="rounded-xl bg-slate-50 text-slate-700">
                <td className="whitespace-nowrap rounded-l-xl px-3 py-3 font-semibold text-slate-900">
                  {cohort.cohortMonth}
                </td>
                <td className="px-3 py-3">{formatNumber(cohort.users)}</td>
                <td className="px-3 py-3">{formatPercent(cohort.activationPublishedRate)}</td>
                <td className="px-3 py-3">{formatNumber(cohort.usersWhoPublished)}</td>
                <td className="px-3 py-3">{formatNumber(cohort.payingUsers)}</td>
                <td className="px-3 py-3">{formatPercent(cohort.paymentConversionRate)}</td>
                {Array.from({ length: maxColumns }).map((_, index) => {
                  const period = (cohort.periods || []).find(
                    (item) => Number(item.periodIndex) === index
                  );
                  const rate = Number(period?.paymentConversionRate || 0);
                  const backgroundAlpha = Math.min(0.12 + rate * 0.75, 0.92);

                  return (
                    <td key={index} className="px-1 py-3">
                      <div
                        className="rounded-lg px-2 py-2 text-center text-xs font-semibold text-slate-900"
                        style={{
                          backgroundColor: `rgba(16, 185, 129, ${backgroundAlpha})`,
                        }}
                      >
                        {period ? formatPercent(rate) : "-"}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function TemplateTable({ templates }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <h3 className="text-sm font-semibold text-slate-800">Plantillas con mas publicaciones</h3>
      <div className="mt-4 overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-[0.12em] text-slate-500">
              <th className="pb-3 pr-4">Plantilla</th>
              <th className="pb-3 pr-4">Creadas</th>
              <th className="pb-3 pr-4">Publicadas</th>
              <th className="pb-3 pr-4">Pagos</th>
              <th className="pb-3 pr-4">Ingresos</th>
              <th className="pb-3">Conversion</th>
            </tr>
          </thead>
          <tbody>
            {(templates || []).map((template) => {
              const created = Number(template.createdInvitations || 0);
              const published = Number(template.publishedInvitations || 0);
              const payments = Number(template.paymentsApproved || 0);
              const revenue = Number(template.revenueTotalArs || 0);
              const conversion = created > 0 ? published / created : 0;

              return (
                <tr key={template.templateId} className="border-b border-slate-100 text-slate-700">
                  <td className="py-3 pr-4 font-medium text-slate-900">
                    {template.templateName || template.templateId}
                  </td>
                  <td className="py-3 pr-4">{formatNumber(created)}</td>
                  <td className="py-3 pr-4">{formatNumber(published)}</td>
                  <td className="py-3 pr-4">{formatNumber(payments)}</td>
                  <td className="py-3 pr-4">{formatCurrency(revenue)}</td>
                  <td className="py-3">{formatPercent(conversion)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default function BusinessAnalyticsBoard() {
  const [seriesView, setSeriesView] = useState("monthly");
  const [draftFromDate, setDraftFromDate] = useState("");
  const [draftToDate, setDraftToDate] = useState("");
  const [rangeError, setRangeError] = useState("");
  const {
    data,
    loading,
    error,
    rebuilding,
    rebuildJob,
    filters,
    exportJob,
    exporting,
    exportError,
    refresh,
    rebuild,
    applyFilters,
    resetFilters,
    requestRawExport,
    downloadRawExport,
  } = useBusinessAnalytics();

  useEffect(() => {
    setDraftFromDate(filters?.fromDate || "");
    setDraftToDate(filters?.toDate || "");
    setRangeError("");
  }, [filters?.fromDate, filters?.toDate]);

  const appliedRange = data?.appliedRange || filters || {};
  const series = data?.series?.[seriesView] || [];
  const newUsersMetricKey =
    seriesView === "daily"
      ? "new_users_daily"
      : seriesView === "weekly"
        ? "new_users_weekly"
        : seriesView === "monthly"
          ? "new_users_monthly"
          : "new_users_annual";
  const revenueMetricKey =
    seriesView === "daily"
      ? "revenue_daily"
      : seriesView === "weekly"
        ? "revenue_weekly"
        : seriesView === "monthly"
          ? "revenue_monthly"
          : "revenue_annual";
  const summary = data?.summary || {};
  const topTemplates = data?.templates?.topPublished || [];
  const rebuildStatus = rebuildJob?.status || "";
  const rebuildStage = rebuildJob?.stage || "";
  const rebuildCounters = rebuildJob?.counters || {};
  const rebuildFinishedAt = rebuildJob?.finishedAt || "";
  const exportStatus = exportJob?.status || "";
  const rebuildButtonLabel =
    rebuildStatus === "queued"
      ? "Rebuild en cola"
      : rebuildStatus === "running"
        ? "Reconstruyendo..."
        : "Reconstruir historico";
  const exportButtonLabel =
    exportStatus === "queued" || exportStatus === "running"
      ? "Exportando..."
      : exportStatus === "succeeded"
        ? "Descargar CSV"
        : "Exportar raw CSV";
  const rangeDescription = `Rango activo: ${formatDateKeyLabel(appliedRange?.fromDate)} a ${formatDateKeyLabel(appliedRange?.toDate)}.`;

  const executiveCards = useMemo(
    () => [
      {
        title: "Usuarios registrados",
        metric: getMetric(data, "total_registered_users"),
        value: formatNumber(summary?.users?.totalRegisteredUsers),
        detail: `${formatNumber(summary?.users?.newUsers)} nuevos en el rango seleccionado`,
        accent: "blue",
      },
      {
        title: "Nuevos usuarios",
        metric: getMetric(data, "new_users_monthly"),
        value: formatNumber(summary?.users?.newUsers),
        detail: `Rango anterior: ${formatNumber(summary?.users?.previousNewUsers)}`,
        accent: "amber",
      },
      {
        title: "Invitaciones publicadas",
        metric: getMetric(data, "published_invitations"),
        value: formatNumber(summary?.publishedInvitations?.value),
        detail: `${formatNumber(summary?.publishedInvitations?.cumulativeValue)} acumuladas al cierre de ${formatDateKeyLabel(appliedRange?.toDate)}`,
        accent: "emerald",
      },
      {
        title: "Usuarios que publican",
        metric: getMetric(data, "users_who_published"),
        value: formatNumber(summary?.users?.usersWhoPublished),
        detail: `${formatPercent(summary?.users?.publishedInvitationsPerUser)} invitaciones publicadas por usuario registrado`,
        accent: "emerald",
      },
      {
        title: "Clientes pagos",
        metric: getMetric(data, "paying_users"),
        value: formatNumber(summary?.payments?.payingUsers),
        detail: `${formatNumber(summary?.payments?.paymentsApproved)} pagos aprobados en el rango`,
        accent: "rose",
      },
      {
        title: "Ingresos",
        metric: getMetric(data, revenueMetricKey),
        value: formatCurrency(summary?.payments?.revenue),
        detail: `${formatCurrency(summary?.payments?.totalRevenue)} acumulados al cierre. Ticket promedio ${formatCurrency(summary?.payments?.averageOrderValue)}`,
        accent: "amber",
      },
      {
        title: "Conversion a pago",
        metric: getMetric(data, "payment_conversion_rate"),
        value: formatPercent(summary?.conversion?.paymentConversionRate),
        detail: `${formatNumber(summary?.conversion?.payingUsers)} clientes pagos sobre ${formatNumber(summary?.conversion?.usersWhoPublished)} usuarios que publicaron`,
        accent: "blue",
      },
    ],
    [appliedRange?.toDate, data, revenueMetricKey, summary]
  );

  const handleApplyFilters = () => {
    const validationMessage = buildRangeValidationMessage(draftFromDate, draftToDate);
    if (validationMessage) {
      setRangeError(validationMessage);
      return;
    }

    setRangeError("");
    applyFilters({
      fromDate: draftFromDate,
      toDate: draftToDate,
    });
  };

  const handleResetFilters = () => {
    setRangeError("");
    resetFilters();
  };

  const handleExportAction = async () => {
    if (exportStatus === "succeeded") {
      await downloadRawExport();
      return;
    }

    await requestRawExport();
  };

  if (loading) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-sm text-slate-600">Cargando analytics del negocio...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-xl font-semibold text-slate-900">Analytics del negocio</h2>
              <p className="mt-1 text-sm text-slate-600">
                Usuarios, publicaciones y monetizacion calculados desde eventos canonicos y agregados ejecutivos.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => refresh()}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Actualizar
              </button>
              <button
                type="button"
                onClick={rebuild}
                disabled={rebuilding}
                className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {rebuildButtonLabel}
              </button>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="grid gap-4 xl:grid-cols-[1fr_1fr_auto_auto_auto] xl:items-end">
              <label className="space-y-2">
                <span className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Desde</span>
                <input
                  type="date"
                  value={draftFromDate}
                  onChange={(event) => setDraftFromDate(event.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm outline-none transition focus:border-slate-400"
                />
              </label>
              <label className="space-y-2">
                <span className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Hasta</span>
                <input
                  type="date"
                  value={draftToDate}
                  onChange={(event) => setDraftToDate(event.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm outline-none transition focus:border-slate-400"
                />
              </label>
              <button
                type="button"
                onClick={handleApplyFilters}
                className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
              >
                Aplicar
              </button>
              <button
                type="button"
                onClick={handleResetFilters}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
              >
                Limpiar
              </button>
              <button
                type="button"
                onClick={handleExportAction}
                disabled={exporting}
                className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {exportButtonLabel}
              </button>
            </div>
            <p className="mt-3 text-sm text-slate-600">
              {rangeDescription} El export raw usa exactamente este mismo rango.
            </p>
          </div>
        </div>

        {error ? (
          <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </div>
        ) : null}
        {rangeError ? (
          <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {rangeError}
          </div>
        ) : null}
        {exportError ? (
          <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {exportError}
          </div>
        ) : null}
        {rebuildStatus === "queued" || rebuildStatus === "running" ? (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            {rebuildStatus === "queued"
              ? "La reconstruccion historica fue encolada. El sistema la procesara en background."
              : `Reconstruccion en progreso. Etapa actual: ${rebuildStage || "procesando"}. Registros ${formatNumber(rebuildCounters?.registro_usuario)}, borradores ${formatNumber(rebuildCounters?.invitacion_creada)}, publicaciones ${formatNumber(rebuildCounters?.invitacion_publicada)}, pagos ${formatNumber(rebuildCounters?.pago_aprobado)}.`}
          </div>
        ) : null}
        {rebuildStatus === "failed" ? (
          <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            La reconstruccion historica fallo. {rebuildJob?.error || "Revisa logs de Functions."}
          </div>
        ) : null}
        {rebuildStatus === "succeeded" ? (
          <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            Reconstruccion finalizada{rebuildFinishedAt ? ` (${new Date(rebuildFinishedAt).toLocaleString("es-AR")})` : ""}. Eventos sembrados: registro {formatNumber(rebuildCounters?.registro_usuario)}, borradores {formatNumber(rebuildCounters?.invitacion_creada)}, publicaciones {formatNumber(rebuildCounters?.invitacion_publicada)}, pagos {formatNumber(rebuildCounters?.pago_aprobado)}.
          </div>
        ) : null}
        {exportStatus === "queued" || exportStatus === "running" ? (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            {exportStatus === "queued"
              ? "La exportacion raw fue encolada. El sistema la procesara en background."
              : "La exportacion raw se esta generando. El estado se actualiza automaticamente."}
          </div>
        ) : null}
        {exportStatus === "failed" ? (
          <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            La exportacion raw fallo. {exportJob?.error || "Revisa logs de Functions."}
          </div>
        ) : null}
        {exportStatus === "succeeded" ? (
          <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            Exportacion raw lista. {formatNumber(exportJob?.rowCount)} filas generadas para el rango actual. Usa “Descargar CSV” para abrirla en Excel.
          </div>
        ) : null}
      </div>

      <section className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">Metricas ejecutivas</h3>
            <p className="text-sm text-slate-600">
              Bloque principal para crecimiento, publicaciones y monetizacion dentro del rango seleccionado.
            </p>
          </div>
          <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
            {SERIES_OPTIONS.map((option) => (
              <button
                key={option.key}
                type="button"
                onClick={() => setSeriesView(option.key)}
                className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
                  seriesView === option.key
                    ? "bg-slate-900 text-white"
                    : "text-slate-600 hover:bg-slate-50"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
          {executiveCards.map((card) => (
            <MetricCard key={card.title} {...card} />
          ))}
        </div>

        <div className="grid gap-4 xl:grid-cols-3">
          <SeriesChart
            title="Evolucion de nuevos usuarios"
            metric={getMetric(data, newUsersMetricKey)}
            points={series}
            getValue={(point) => point?.executive?.users?.newUsers}
            formatValue={(value) => formatNumber(value)}
          />
          <SeriesChart
            title="Evolucion de invitaciones publicadas"
            metric={getMetric(data, "published_invitations")}
            points={series}
            getValue={(point) => point?.executive?.publishedInvitations?.count}
            formatValue={(value) => formatNumber(value)}
          />
          <SeriesChart
            title="Evolucion de ingresos"
            metric={getMetric(data, revenueMetricKey)}
            points={series}
            getValue={(point) => point?.executive?.payments?.revenue}
            formatValue={(value) => formatCurrency(value)}
          />
        </div>
      </section>

      <section className="space-y-4">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">Metricas de producto</h3>
          <p className="text-sm text-slate-600">Time To First Value para usuarios registrados dentro del rango activo.</p>
        </div>

        <div className="grid gap-4 lg:grid-cols-4">
          <MetricCard
            title="TTFV creacion promedio"
            metric={getMetric(data, "ttfv_create_avg_seconds")}
            value={formatDuration(summary?.ttfvCreate?.avgSeconds)}
            detail="Tiempo medio hasta la primera invitacion creada."
            accent="rose"
          />
          <MetricCard
            title="TTFV creacion mediana"
            metric={getMetric(data, "ttfv_create_p50_seconds")}
            value={formatDuration(summary?.ttfvCreate?.p50Seconds)}
            detail="Experiencia tipica de activacion por creacion."
            accent="rose"
          />
          <MetricCard
            title="TTFV publicacion promedio"
            metric={getMetric(data, "ttfv_publish_avg_seconds")}
            value={formatDuration(summary?.ttfvPublish?.avgSeconds)}
            detail="Tiempo medio hasta la primera publicacion."
            accent="blue"
          />
          <MetricCard
            title="TTFV publicacion mediana"
            metric={getMetric(data, "ttfv_publish_p50_seconds")}
            value={formatDuration(summary?.ttfvPublish?.p50Seconds)}
            detail="Experiencia tipica de publicacion."
            accent="blue"
          />
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          <DistributionCard
            title="Distribucion TTFV creacion"
            metric={getMetric(data, "ttfv_create_avg_seconds")}
            distribution={summary?.ttfvCreate?.distribution}
          />
          <DistributionCard
            title="Distribucion TTFV publicacion"
            metric={getMetric(data, "ttfv_publish_avg_seconds")}
            distribution={summary?.ttfvPublish?.distribution}
          />
        </div>
      </section>

      <section className="space-y-4">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">Canal invitacion</h3>
          <p className="text-sm text-slate-600">Performance por plantilla dentro del rango seleccionado.</p>
        </div>
        <TemplateTable templates={topTemplates} />
      </section>

      <CohortHeatmap cohorts={data?.cohorts || []} />
    </div>
  );
}
