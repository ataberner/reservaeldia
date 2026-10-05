import { useEffect, useRef, useState } from "react";
import { Check, Music2, Pause, Play } from "lucide-react";
import { normalizeMusicConfig } from "../../shared/musicConfig.js";
import { listAvailableMusicTracks, resolveMusicResource } from "../../shared/musicCatalog.js";
import { firebaseEnvironment } from "@/firebase";
import { readEditorRenderSnapshot } from "@/lib/editorSnapshotAdapter";
import { EDITOR_BRIDGE_EVENTS } from "@/lib/editorBridgeContracts";
import { createMusicPreviewController } from "@/domain/music/previewController";
import styles from "./MiniToolbarTabRegalos.module.css";

export default function MiniToolbarTabMusica({ active = true }) {
  const [config, setConfig] = useState(() => normalizeMusicConfig(readEditorRenderSnapshot()?.music));
  const [preview, setPreview] = useState({ id: null, status: "idle" });
  const controllerRef = useRef(null);
  const tracks = listAvailableMusicTracks();
  const selectedTrack = tracks.find((track) => config.track?.source === "catalog" && track.id === config.track.id);

  useEffect(() => {
    const controller = createMusicPreviewController({ createAudio: () => new Audio(), onChange: setPreview });
    controllerRef.current = controller;
    const sync = (event) => setConfig(normalizeMusicConfig(event.detail?.config));
    const stop = () => controller.stop();
    window.addEventListener(EDITOR_BRIDGE_EVENTS.MUSIC_CONFIG_CHANGED, sync);
    window.addEventListener(EDITOR_BRIDGE_EVENTS.PREVIEW_OPEN, stop);
    return () => {
      window.removeEventListener(EDITOR_BRIDGE_EVENTS.MUSIC_CONFIG_CHANGED, sync);
      window.removeEventListener(EDITOR_BRIDGE_EVENTS.PREVIEW_OPEN, stop);
      controller.dispose();
      controllerRef.current = null;
    };
  }, []);

  useEffect(() => { if (!active) controllerRef.current?.stop(); }, [active]);

  function update(patch) {
    const next = normalizeMusicConfig({ ...config, ...patch });
    setConfig(next);
    window.dispatchEvent(new CustomEvent(EDITOR_BRIDGE_EVENTS.MUSIC_CONFIG_UPDATE, { detail: { config: next } }));
  }

  function previewTrack(track) {
    if (!active) return;
    const resource = resolveMusicResource({ ...config, enabled: true, track: { source: "catalog", id: track.id } }, {
      publicBaseUrl: firebaseEnvironment.publicBaseUrl,
    });
    void controllerRef.current?.toggle(resource, config.volume);
  }

  function selectTrack(track) {
    if (selectedTrack?.id === track.id) return;
    const keepListening = preview.status === "playing" || preview.status === "loading";
    controllerRef.current?.stop();
    update({ track: { source: "catalog", id: track.id } });
    if (keepListening) previewTrack(track);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 py-3">
      <section className={styles.activationPanel}>
        <div className={styles.activationHeader}>
          <h3 className={styles.activationTitle}>Música</h3>
          <button type="button" role="switch" aria-checked={config.enabled}
            aria-label={config.enabled ? "Desactivar música" : "Activar música"}
            onClick={() => { if (config.enabled) controllerRef.current?.stop(); update({ enabled: !config.enabled }); }}
            className={`${styles.activationSwitch} ${config.enabled ? styles.activationSwitchOn : ""}`}>
            <span className={styles.activationSwitchThumb} aria-hidden="true" />
          </button>
        </div>
      </section>
      <div className="min-h-0 space-y-3 overflow-y-auto px-4 pb-4">
        <p className="text-sm leading-relaxed text-slate-600">Elegí la canción que acompañará tu invitación. Tus invitados podrán entrar con o sin música.</p>
        {config.enabled && !selectedTrack && (
          <p role="status" className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            Seleccioná una canción disponible para activar la música en la invitación.
          </p>
        )}
        {!config.enabled && selectedTrack && <p className="text-xs text-slate-500">Tu selección se conserva al volver a activar Música.</p>}
        <h4 className="text-xs font-semibold uppercase tracking-wide text-[#692b9a]">Catálogo</h4>
        {tracks.length === 0 && <p className="text-sm text-slate-500">Todavía no hay canciones disponibles.</p>}
        <div role="radiogroup" aria-label="Canción de la invitación" className="space-y-2">
          {tracks.map((track) => {
            const selected = selectedTrack?.id === track.id;
            const playing = preview.id === track.id && (preview.status === "playing" || preview.status === "loading");
            return (
              <div key={track.id} className={`flex items-center gap-2 rounded-xl border p-3 ${selected ? "border-[#cdaee5] bg-[#f6effb]" : "border-slate-200 bg-white"}`}>
                <button type="button" role="radio" aria-checked={selected}
                  onClick={() => selectTrack(track)}
                  className="flex min-w-0 flex-1 items-center gap-3 rounded-lg text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#692b9a]">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-[#692b9a]" aria-hidden="true">
                    {selected ? <Check size={18} /> : <Music2 size={18} />}
                  </span>
                  <span className="min-w-0"><span className="block break-words text-sm font-semibold text-slate-800">{track.title}</span><span className="block text-xs text-slate-500">{track.artist}</span>{selected && <span className="block text-xs font-medium text-[#692b9a]">Seleccionada</span>}</span>
                </button>
                <button type="button" aria-label={`${playing ? "Pausar" : "Escuchar"} ${track.title}`}
                  onClick={() => previewTrack(track)}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[#ded0ea] bg-white text-[#692b9a] transition hover:bg-[#eee2f7] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#692b9a]">
                  {playing ? <Pause size={17} aria-hidden="true" /> : <Play size={17} aria-hidden="true" />}
                </button>
              </div>
            );
          })}
        </div>
        {preview.status === "error" && <p role="status" className="text-xs text-rose-700">No se pudo reproducir la canción. Podés volver a intentarlo.</p>}
      </div>
    </div>
  );
}
