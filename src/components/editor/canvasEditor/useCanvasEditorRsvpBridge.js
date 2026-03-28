import { useCallback, useEffect } from "react";
import { createDefaultRsvpConfig, normalizeRsvpConfig } from "@/domain/rsvp/config";
import {
  EDITOR_BRIDGE_EVENTS,
} from "@/lib/editorBridgeContracts";

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
      new CustomEvent(EDITOR_BRIDGE_EVENTS.RSVP_PANEL_OPEN, {
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

    window.addEventListener(EDITOR_BRIDGE_EVENTS.RSVP_CONFIG_UPDATE, handleRsvpConfigUpdate);
    return () =>
      window.removeEventListener(EDITOR_BRIDGE_EVENTS.RSVP_CONFIG_UPDATE, handleRsvpConfigUpdate);
  }, [setRsvpConfig]);

  useEffect(() => {
    const normalized = rsvpConfig
      ? normalizeRsvpConfig(rsvpConfig, { forceEnabled: false })
      : createDefaultRsvpConfig("minimal");

    // Compatibility boundary: the RSVP sidebar still reads this window global/event pair.
    window._rsvpConfigActual = normalized;
    window.dispatchEvent(
      new CustomEvent(EDITOR_BRIDGE_EVENTS.RSVP_CONFIG_CHANGED, {
        detail: { config: normalized },
      })
    );
  }, [rsvpConfig]);

  return {
    abrirPanelRsvp,
  };
}
