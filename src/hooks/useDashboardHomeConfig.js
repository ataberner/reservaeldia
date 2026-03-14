import { useCallback, useEffect, useState } from "react";
import { getDashboardHomeConfig } from "@/domain/dashboard/service";

export function useDashboardHomeConfig() {
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshTick, setRefreshTick] = useState(0);

  const refresh = useCallback(() => {
    setRefreshTick((previous) => previous + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadConfig = async () => {
      setLoading(true);
      setError("");

      try {
        const nextConfig = await getDashboardHomeConfig();
        if (cancelled) return;
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
        }
      }
    };

    void loadConfig();

    return () => {
      cancelled = true;
    };
  }, [refreshTick]);

  return {
    config,
    loading,
    error,
    refresh,
  };
}
