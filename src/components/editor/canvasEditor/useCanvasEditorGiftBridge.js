import { useCallback, useEffect } from "react";
import { createDefaultGiftConfig, normalizeGiftConfig } from "@/domain/gifts/config";

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

    window.dispatchEvent(new CustomEvent("abrir-panel-regalos"));
  }, [setGiftsConfig]);

  useEffect(() => {
    const handleGiftConfigUpdate = (event) => {
      const nextConfig = event?.detail?.config;
      if (!nextConfig || typeof nextConfig !== "object") return;
      setGiftsConfig(normalizeGiftConfig(nextConfig, { forceEnabled: false }));
    };

    window.addEventListener("gift-config-update", handleGiftConfigUpdate);
    return () => window.removeEventListener("gift-config-update", handleGiftConfigUpdate);
  }, [setGiftsConfig]);

  useEffect(() => {
    const normalized = giftsConfig
      ? normalizeGiftConfig(giftsConfig, { forceEnabled: false })
      : createDefaultGiftConfig();

    window._giftConfigActual = normalized;
    window.dispatchEvent(
      new CustomEvent("gift-config-changed", {
        detail: { config: normalized },
      })
    );
  }, [giftsConfig]);

  return {
    abrirPanelRegalos,
  };
}
