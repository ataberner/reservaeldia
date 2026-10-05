// Invitation-wide authored state. Resource URLs belong to the catalog resolver.
const MUSIC_CONFIG_VERSION = 1;
const MUSIC_FEATURE_AVAILABILITY = Object.freeze({ editor: true, catalog: true, user: false });

function createDefaultMusicConfig() {
  return { version: MUSIC_CONFIG_VERSION, enabled: false, track: null, volume: 0.35, loop: true };
}

function normalizeMusicConfig(value) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const track = source.track;
  const id = typeof track?.id === "string" ? track.id.trim() : "";
  const validTrack = track && ["catalog", "user"].includes(track.source) &&
    /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(id);
  return {
    version: MUSIC_CONFIG_VERSION,
    enabled: source.enabled === true,
    track: validTrack ? { source: track.source, id } : null,
    volume: typeof source.volume === "number" && Number.isFinite(source.volume)
      ? Math.min(1, Math.max(0, source.volume)) : 0.35,
    loop: source.loop !== false,
  };
}

module.exports = { MUSIC_CONFIG_VERSION, MUSIC_FEATURE_AVAILABILITY, createDefaultMusicConfig, normalizeMusicConfig };
