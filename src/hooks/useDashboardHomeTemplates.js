import { useCallback, useEffect, useState } from "react";
import { listTemplates } from "@/domain/templates/service";
import { createDashboardAuthRecovery } from "@/lib/auth/dashboardAuthRecovery";
import { isTransientDashboardReadError } from "@/domain/dashboard/readRecovery";

export function useDashboardHomeTemplates({ tipo, startupRecoveryGeneration = 0 }) {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [recoveryState, setRecoveryState] = useState("idle");
  const [resolvedScope, setResolvedScope] = useState(null);
  const scope = JSON.stringify([tipo, startupRecoveryGeneration]);

  useEffect(() => {
    let cancelled = false;
    let recovery;

    const loadTemplates = async () => {
      if (!tipo) {
        setTemplates([]);
        setLoading(false);
        setError("");
        setRecoveryState("idle");
        setResolvedScope(scope);
        return;
      }

      setLoading(true);
      setError("");
      setRecoveryState("idle");
      try {
        recovery = createDashboardAuthRecovery({
          task: () => listTemplates({ tipo, source: "server" }),
          shouldRetry: isTransientDashboardReadError,
          isCurrent: () => !cancelled,
          onStateChange: setRecoveryState,
        });
        const outcome = await recovery.promise;
        if (cancelled || outcome.status !== "success") return;
        const items = outcome.value;
        setTemplates(Array.isArray(items) ? items : []);
      } catch (loadError) {
        if (cancelled) return;
        setTemplates([]);
        setError(loadError?.message || "No se pudieron cargar las plantillas.");
      } finally {
        if (!cancelled) {
          setLoading(false);
          setResolvedScope(scope);
          setRecoveryState("idle");
        }
      }
    };

    void loadTemplates();

    return () => {
      cancelled = true;
      recovery?.cancel();
    };
  }, [tipo, startupRecoveryGeneration, scope]);

  const removeTemplate = useCallback((templateId) => {
    const safeTemplateId = String(templateId || "").trim();
    if (!safeTemplateId) return;

    setTemplates((previous) =>
      previous.filter((template) => String(template?.id || "").trim() !== safeTemplateId)
    );
  }, []);

  return {
    templates: resolvedScope === scope ? templates : [],
    loading: loading || resolvedScope !== scope,
    error,
    recoveryState,
    removeTemplate,
  };
}
