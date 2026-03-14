import { useCallback, useEffect, useState } from "react";
import { listTemplates } from "@/domain/templates/service";

export function useDashboardHomeTemplates({ tipo }) {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    const loadTemplates = async () => {
      if (!tipo) {
        setTemplates([]);
        setLoading(false);
        setError("");
        return;
      }

      setLoading(true);
      setError("");
      try {
        const items = await listTemplates({ tipo });
        if (cancelled) return;
        setTemplates(Array.isArray(items) ? items : []);
      } catch (loadError) {
        if (cancelled) return;
        setTemplates([]);
        setError(loadError?.message || "No se pudieron cargar las plantillas.");
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void loadTemplates();

    return () => {
      cancelled = true;
    };
  }, [tipo]);

  const removeTemplate = useCallback((templateId) => {
    const safeTemplateId = String(templateId || "").trim();
    if (!safeTemplateId) return;

    setTemplates((previous) =>
      previous.filter((template) => String(template?.id || "").trim() !== safeTemplateId)
    );
  }, []);

  return {
    templates,
    loading,
    error,
    removeTemplate,
  };
}
