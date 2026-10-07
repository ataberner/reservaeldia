import { useCallback, useEffect, useState } from "react";
import { getDashboardHomeConfig } from "@/domain/dashboard/service";
import { createDashboardAuthRecovery } from "@/lib/auth/dashboardAuthRecovery";
import { isTransientDashboardReadError } from "@/domain/dashboard/readRecovery";

export function useDashboardHomeConfig(startupRecoveryGeneration = 0) {
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshTick, setRefreshTick] = useState(0);
  const [recoveryState, setRecoveryState] = useState("idle");
  const [resolvedGeneration, setResolvedGeneration] = useState(null);

  const refresh = useCallback(() => {
    setRefreshTick((previous) => previous + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let recovery;

    const loadConfig = async () => {
      setLoading(true);
      setError("");
      setRecoveryState("idle");

      try {
        recovery = createDashboardAuthRecovery({
          task: getDashboardHomeConfig,
          shouldRetry: isTransientDashboardReadError,
          isCurrent: () => !cancelled,
          onStateChange: setRecoveryState,
        });
        const outcome = await recovery.promise;
        if (cancelled || outcome.status !== "success") return;
        const nextConfig = outcome.value;
        setConfig(nextConfig || null);
      } catch (loadError) {
        if (cancelled) return;
        setConfig(null);
        setError(
          loadError?.message || "No se pudo cargar la configuracion editorial del dashboard."
        );
      } finally {
        if (!cancelled) {
          setLoading(false);
          setResolvedGeneration(startupRecoveryGeneration);
          setRecoveryState("idle");
        }
      }
    };

    void loadConfig();

    return () => {
      cancelled = true;
      recovery?.cancel();
    };
  }, [refreshTick, startupRecoveryGeneration]);

  return {
    config,
    loading: loading || resolvedGeneration !== startupRecoveryGeneration,
    error,
    recoveryState,
    refresh,
  };
}
