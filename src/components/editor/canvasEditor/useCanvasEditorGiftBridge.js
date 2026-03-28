import { useCallback, useEffect } from "react";
import { createDefaultGiftConfig, normalizeGiftConfig } from "@/domain/gifts/config";
import {
  EDITOR_BRIDGE_EVENTS,
} from "@/lib/editorBridgeContracts";

export default function useCanvasEditorGiftBridge({
  giftsConfig,
  setGiftsConfig,
}) {
  const abrirPanelRegalos = useCallback(() => {
    setGiftsConfig((prev) =>
      prev
        ? normalizeGiftConfig(prev, { forceEnabled: false })
        : createDefaultGiftConfig()
    );

    window.dispatchEvent(new CustomEvent(EDITOR_BRIDGE_EVENTS.GIFT_PANEL_OPEN));
  }, [setGiftsConfig]);

  useEffect(() => {
    const handleGiftConfigUpdate = (event) => {
      const nextConfig = event?.detail?.config;
      if (!nextConfig || typeof nextConfig !== "object") return;
      setGiftsConfig(normalizeGiftConfig(nextConfig, { forceEnabled: false }));
    };

    window.addEventListener(EDITOR_BRIDGE_EVENTS.GIFT_CONFIG_UPDATE, handleGiftConfigUpdate);
    return () =>
      window.removeEventListener(EDITOR_BRIDGE_EVENTS.GIFT_CONFIG_UPDATE, handleGiftConfigUpdate);
  }, [setGiftsConfig]);

  useEffect(() => {
    const normalized = giftsConfig
      ? normalizeGiftConfig(giftsConfig, { forceEnabled: false })
      : createDefaultGiftConfig();

    // Compatibility boundary: old and new gift globals must stay mirrored.
    window._giftsConfigActual = normalized;
    window._giftConfigActual = normalized;
    window.dispatchEvent(
      new CustomEvent(EDITOR_BRIDGE_EVENTS.GIFT_CONFIG_CHANGED, {
        detail: { config: normalized },
      })
    );
  }, [giftsConfig]);

  return {
    abrirPanelRegalos,
  };
}
