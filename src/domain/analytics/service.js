import { httpsCallable } from "firebase/functions";
import { functions } from "@/firebase";

function getErrorMessage(error, fallback) {
  const code = typeof error?.code === "string" ? error.code.trim().toLowerCase() : "";
  const message =
    error?.message ||
    error?.details?.message ||
    error?.details ||
    fallback;

  if (code === "functions/permission-denied" || code === "permission-denied") {
    return "Solo superadmin puede acceder a analytics del negocio.";
  }

  if (code === "functions/invalid-argument" || code === "invalid-argument") {
    return typeof message === "string" && message.trim()
      ? message
      : "Revisa el rango de fechas de analytics.";
  }

  if (code === "functions/not-found" || code === "not-found") {
    return typeof message === "string" && message.trim()
      ? message
      : "No se encontro la exportacion solicitada.";
  }

  if (
    code === "functions/internal" ||
    code === "internal" ||
    code === "functions/unavailable" ||
    code === "unavailable"
  ) {
    return "No se pudo cargar analytics del negocio. Si acabas de implementar esta funcionalidad, primero despliega Cloud Functions y luego reconstruye el historico.";
  }

  if (
    code === "functions/deadline-exceeded" ||
    code === "deadline-exceeded"
  ) {
    return "La operacion tardo demasiado. Si la reconstruccion ya entro en cola, el panel la mostrara automaticamente en unos segundos.";
  }

  return typeof message === "string" ? message : fallback;
}

export async function getBusinessAnalyticsOverview({ fromDate, toDate } = {}) {
  const callable = httpsCallable(functions, "getBusinessAnalyticsOverviewV1");
  const result = await callable({
    fromDate: fromDate || null,
    toDate: toDate || null,
  });
  return result?.data || {};
}

export async function rebuildBusinessAnalytics() {
  const callable = httpsCallable(functions, "adminRebuildBusinessAnalyticsV1");
  const result = await callable({});
  return result?.data || {};
}

export async function requestBusinessAnalyticsRawExport({ fromDate, toDate, format = "csv" } = {}) {
  const callable = httpsCallable(functions, "requestBusinessAnalyticsRawExportV1");
  const result = await callable({
    fromDate: fromDate || null,
    toDate: toDate || null,
    format,
  });
  return result?.data || {};
}

export async function getBusinessAnalyticsRawExportStatus({ exportId } = {}) {
  const callable = httpsCallable(functions, "getBusinessAnalyticsRawExportStatusV1");
  const result = await callable({
    exportId: exportId || null,
  });
  return result?.data || {};
}

export { getErrorMessage as getAnalyticsErrorMessage };
