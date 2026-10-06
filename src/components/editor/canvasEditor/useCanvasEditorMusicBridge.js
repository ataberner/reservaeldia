import { useEffect } from "react";
import { normalizeMusicConfig } from "../../../../shared/musicConfig.js";
import { EDITOR_BRIDGE_EVENTS } from "@/lib/editorBridgeContracts";

export default function useCanvasEditorMusicBridge({ musicConfig, setMusicConfig, canEditMusic }) {
  useEffect(() => {
    const update = (event) => {
      if (!canEditMusic || !event?.detail?.config) return;
      setMusicConfig(normalizeMusicConfig(event.detail.config));
    };
    window.addEventListener(EDITOR_BRIDGE_EVENTS.MUSIC_CONFIG_UPDATE, update);
    return () => window.removeEventListener(EDITOR_BRIDGE_EVENTS.MUSIC_CONFIG_UPDATE, update);
  }, [canEditMusic, setMusicConfig]);

  useEffect(() => {
    window.dispatchEvent(new CustomEvent(EDITOR_BRIDGE_EVENTS.MUSIC_CONFIG_CHANGED, {
      detail: { config: normalizeMusicConfig(musicConfig) },
    }));
  }, [musicConfig]);
}
