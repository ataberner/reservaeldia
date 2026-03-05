import { useCallback, useEffect } from "react";
import { createDefaultRsvpConfig, normalizeRsvpConfig } from "@/domain/rsvp/config";

export default function useCanvasEditorRsvpBridge({
  rsvpConfig,
  setRsvpConfig,
}) {
  const abrirPanelRsvp = useCallback((options = {}) => {
    const forcePresetSelection = options?.forcePresetSelection === true;
    setRsvpConfig((prev) =>
      prev
        ? normalizeRsvpConfig(prev, { forceEnabled: false })
        : createDefaultRsvpConfig("minimal")
    );
    window.dispatchEvent(
      new CustomEvent("abrir-panel-rsvp", {
        detail: { forcePresetSelection },
      })
    );
  }, [setRsvpConfig]);

  useEffect(() => {
    const handleRsvpConfigUpdate = (event) => {
      const nextConfig = event?.detail?.config;
      if (!nextConfig || typeof nextConfig !== "object") return;
      setRsvpConfig(normalizeRsvpConfig(nextConfig, { forceEnabled: false }));
    };

    window.addEventListener("rsvp-config-update", handleRsvpConfigUpdate);
    return () => window.removeEventListener("rsvp-config-update", handleRsvpConfigUpdate);
  }, [setRsvpConfig]);

  useEffect(() => {
    const normalized = rsvpConfig
      ? normalizeRsvpConfig(rsvpConfig, { forceEnabled: false })
      : createDefaultRsvpConfig("minimal");

    window._rsvpConfigActual = normalized;
    window.dispatchEvent(
      new CustomEvent("rsvp-config-changed", {
        detail: { config: normalized },
      })
    );
  }, [rsvpConfig]);

  return {
    abrirPanelRsvp,
  };
}
