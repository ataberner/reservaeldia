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

export async function getBusinessAnalyticsOverview() {
  const callable = httpsCallable(functions, "getBusinessAnalyticsOverviewV1");
  const result = await callable({});
  return result?.data || {};
}

export async function rebuildBusinessAnalytics() {
  const callable = httpsCallable(functions, "adminRebuildBusinessAnalyticsV1");
  const result = await callable({});
  return result?.data || {};
}

export { getErrorMessage as getAnalyticsErrorMessage };
