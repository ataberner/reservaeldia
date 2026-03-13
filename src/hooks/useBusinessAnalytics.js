import { useCallback, useEffect, useState } from "react";
import {
  getAnalyticsErrorMessage,
  getBusinessAnalyticsOverview,
  rebuildBusinessAnalytics,
} from "@/domain/analytics/service";

export function useBusinessAnalytics({ enabled = true } = {}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(Boolean(enabled));
  const [error, setError] = useState("");
  const [lastRebuildResult, setLastRebuildResult] = useState(null);

  const rebuildJob = data?.rebuildJob || null;
  const rebuildStatus = rebuildJob?.status || "";
  const rebuilding = rebuildStatus === "queued" || rebuildStatus === "running";

  const load = useCallback(async ({ silent = false, suppressError = false } = {}) => {
    if (!enabled) return null;

    if (!silent) {
      setLoading(true);
    }
    if (!silent) {
      setError("");
    }

    try {
      const nextData = await getBusinessAnalyticsOverview();
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
  }, [enabled]);

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

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }

    load();
  }, [enabled, load]);

  useEffect(() => {
    if (!enabled) return undefined;
    if (!rebuilding) return undefined;

    const intervalId = window.setInterval(() => {
      load({ silent: true, suppressError: true });
    }, 5000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [enabled, load, rebuilding]);

  return {
    data,
    loading,
    error,
    rebuilding,
    rebuildJob,
    lastRebuildResult,
    refresh: load,
    rebuild,
  };
}
