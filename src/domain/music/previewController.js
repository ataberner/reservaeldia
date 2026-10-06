// One panel owns one controller. Audio is created only by a user preview action.
export function createMusicPreviewController({ createAudio, onChange = () => {} }) {
  let audio = null;
  let activeId = null;
  let generation = 0;
  let disposed = false;
  let playbackRequested = false;

  function stop() {
    generation += 1;
    playbackRequested = false;
    if (audio) {
      audio.onended = null;
      audio.onerror = null;
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
    }
    audio = null;
    activeId = null;
    if (!disposed) onChange({ id: null, status: "idle" });
  }

  async function toggle(resource, volume = 0.35) {
    if (disposed || !resource?.id || !resource?.url) return;
    if (activeId === resource.id && audio && (playbackRequested || !audio.paused)) {
      generation += 1;
      playbackRequested = false;
      audio.pause();
      onChange({ id: activeId, status: "paused" });
      return;
    }
    if (activeId !== resource.id || !audio) {
      stop();
      audio = createAudio();
      activeId = resource.id;
      audio.preload = "none";
      audio.src = resource.url;
      audio.volume = volume;
      audio.onended = () => {
        playbackRequested = false;
        onChange({ id: activeId, status: "paused" });
      };
      audio.onerror = () => {
        playbackRequested = false;
        onChange({ id: activeId, status: "error" });
      };
    }
    const currentAudio = audio;
    const currentId = activeId;
    const token = ++generation;
    playbackRequested = true;
    onChange({ id: currentId, status: "loading" });
    try {
      await currentAudio.play();
      if (token !== generation || disposed) {
        if (audio !== currentAudio || !playbackRequested) currentAudio.pause();
        return;
      }
      onChange({ id: currentId, status: "playing" });
    } catch {
      if (token === generation && !disposed) {
        playbackRequested = false;
        onChange({ id: currentId, status: "error" });
      }
    }
  }

  return {
    toggle,
    stop,
    dispose() { disposed = true; stop(); },
  };
}
