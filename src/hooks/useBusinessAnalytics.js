import { useCallback, useEffect, useState } from "react";
import {
  getAnalyticsErrorMessage,
  getBusinessAnalyticsOverview,
  getBusinessAnalyticsRawExportStatus,
  rebuildBusinessAnalytics,
  requestBusinessAnalyticsRawExport,
} from "@/domain/analytics/service";

const ANALYTICS_TIMEZONE = "America/Argentina/Buenos_Aires";

function isDateKey(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value.trim());
}

function getTodayDateKey() {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: ANALYTICS_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(new Date());
}

function addDaysToDateKey(dateKey, days) {
  const baseDate = new Date(`${dateKey}T12:00:00.000Z`);
  if (!Number.isFinite(baseDate.getTime())) {
    return dateKey;
  }

  baseDate.setUTCDate(baseDate.getUTCDate() + Number(days || 0));
  return baseDate.toISOString().slice(0, 10);
}

function getDefaultAnalyticsRange() {
  const toDate = getTodayDateKey();
  return {
    fromDate: addDaysToDateKey(toDate, -90),
    toDate,
  };
}

export function useBusinessAnalytics({ enabled = true } = {}) {
  const [filters, setFilters] = useState(() => getDefaultAnalyticsRange());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(Boolean(enabled));
  const [error, setError] = useState("");
  const [lastRebuildResult, setLastRebuildResult] = useState(null);
  const [exportJob, setExportJob] = useState(null);
  const [exportError, setExportError] = useState("");

  const rebuildJob = data?.rebuildJob || null;
  const rebuildStatus = rebuildJob?.status || "";
  const rebuilding = rebuildStatus === "queued" || rebuildStatus === "running";
  const exportStatus = exportJob?.status || "";
  const exporting = exportStatus === "queued" || exportStatus === "running";

  const load = useCallback(async ({ silent = false, suppressError = false, overrideFilters = null } = {}) => {
    if (!enabled) return null;

    const activeFilters = overrideFilters || filters;

    if (!silent) {
      setLoading(true);
      setError("");
    }

    try {
      const nextData = await getBusinessAnalyticsOverview(activeFilters);
      setData(nextData);
      return nextData;
    } catch (loadError) {
      if (!suppressError) {
        setError(
          getAnalyticsErrorMessage(
            loadError,
            "No se pudo cargar el panel de analytics."
          )
        );
      }
      return null;
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }, [enabled, filters]);

  const rebuild = useCallback(async () => {
    if (!enabled) return null;

    setError("");

    try {
      const result = await rebuildBusinessAnalytics();
      setLastRebuildResult(result);
      setData((currentData) => ({
        ...(currentData || {}),
        rebuildJob: {
          ...(currentData?.rebuildJob || {}),
          status: result?.status || "queued",
          requestedAt:
            result?.requestedAt ||
            currentData?.rebuildJob?.requestedAt ||
            new Date().toISOString(),
          error: null,
        },
      }));
      void load({ silent: true, suppressError: true });
      return result;
    } catch (rebuildError) {
      const refreshedData = await load({ silent: true, suppressError: true });
      const fallbackStatus = refreshedData?.rebuildJob?.status || "";

      if (fallbackStatus === "queued" || fallbackStatus === "running") {
        const inferredResult = {
          ok: true,
          enqueued: fallbackStatus === "queued",
          status: fallbackStatus,
          inferredFromJobState: true,
        };
        setLastRebuildResult(inferredResult);
        return inferredResult;
      }

      setError(
        getAnalyticsErrorMessage(
          rebuildError,
          "No se pudo reconstruir el historico de analytics."
        )
      );
      return null;
    }
  }, [enabled, load]);

  const applyFilters = useCallback((nextFilters = {}) => {
    const normalized = {
      fromDate: isDateKey(nextFilters?.fromDate) ? nextFilters.fromDate.trim() : filters.fromDate,
      toDate: isDateKey(nextFilters?.toDate) ? nextFilters.toDate.trim() : filters.toDate,
    };

    setFilters(normalized);
    setExportJob(null);
    setExportError("");
  }, [filters.fromDate, filters.toDate]);

  const resetFilters = useCallback(() => {
    const defaults = getDefaultAnalyticsRange();
    setFilters(defaults);
    setExportJob(null);
    setExportError("");
  }, []);

  const refreshRawExportStatus = useCallback(async (exportIdOverride = "") => {
    if (!enabled) return null;

    const exportId =
      (typeof exportIdOverride === "string" && exportIdOverride.trim()) ||
      (typeof exportJob?.exportId === "string" ? exportJob.exportId.trim() : "");
    if (!exportId) return null;

    try {
      const status = await getBusinessAnalyticsRawExportStatus({ exportId });
      setExportJob(status);
      return status;
    } catch (statusError) {
      setExportError(
        getAnalyticsErrorMessage(
          statusError,
          "No se pudo obtener el estado de la exportacion raw."
        )
      );
      return null;
    }
  }, [enabled, exportJob?.exportId]);

  const requestRawExport = useCallback(async () => {
    if (!enabled) return null;

    setExportError("");

    try {
      const result = await requestBusinessAnalyticsRawExport({
        fromDate: filters.fromDate,
        toDate: filters.toDate,
        format: "csv",
      });
      setExportJob(result);
      return result;
    } catch (requestError) {
      setExportError(
        getAnalyticsErrorMessage(
          requestError,
          "No se pudo solicitar la exportacion raw."
        )
      );
      return null;
    }
  }, [enabled, filters.fromDate, filters.toDate]);

  const downloadRawExport = useCallback(async () => {
    const latestStatus = await refreshRawExportStatus();
    const downloadUrl = latestStatus?.downloadUrl || exportJob?.downloadUrl || "";

    if (!downloadUrl) {
      setExportError("La exportacion todavia no esta lista para descargar.");
      return null;
    }

    if (typeof window !== "undefined") {
      window.open(downloadUrl, "_blank", "noopener,noreferrer");
    }

    return latestStatus || exportJob;
  }, [exportJob, refreshRawExportStatus]);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }

    load({ overrideFilters: filters });
  }, [enabled, filters, load]);

  useEffect(() => {
    if (!enabled || !rebuilding) return undefined;

    const intervalId = window.setInterval(() => {
      load({ silent: true, suppressError: true });
    }, 5000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [enabled, load, rebuilding]);

  useEffect(() => {
    if (!enabled || !exporting) return undefined;

    const intervalId = window.setInterval(() => {
      void refreshRawExportStatus();
    }, 5000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [enabled, exporting, refreshRawExportStatus]);

  return {
    data,
    loading,
    error,
    rebuilding,
    rebuildJob,
    lastRebuildResult,
    filters,
    exportJob,
    exporting,
    exportError,
    refresh: load,
    rebuild,
    applyFilters,
    resetFilters,
    requestRawExport,
    refreshRawExportStatus,
    downloadRawExport,
  };
}
