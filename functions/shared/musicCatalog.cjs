const { normalizeMusicConfig, MUSIC_FEATURE_AVAILABILITY } = require("./musicConfig.cjs");

// Platform-owned public assets; never accept a URL/path supplied by a draft.
// This existing repository MP3 is a test track, not a licensed production catalog.
const MUSIC_CATALOG = Object.freeze([
  Object.freeze({
    id: "platform-demo",
    title: "Perfect",
    artist: "Ed Sheeran",
    audioReference: "/assets/musica.mp3",
    active: true,
  }),
]);

function listAvailableMusicTracks() {
  return MUSIC_FEATURE_AVAILABILITY.catalog
    ? MUSIC_CATALOG.filter((track) => track.active).map((track) => ({ ...track })) : [];
}

function resolveMusicResource(rawConfig, { publicBaseUrl } = {}) {
  const config = normalizeMusicConfig(rawConfig);
  if (!config.enabled || config.track?.source !== "catalog") return null;
  const track = listAvailableMusicTracks().find((entry) => entry.id === config.track.id);
  if (!track || !/^\/assets\/[a-zA-Z0-9/_.-]+\.mp3$/.test(track.audioReference) ||
      track.audioReference.split("/").includes("..")) return null;
  let base;
  try { base = new URL(publicBaseUrl); } catch { return null; }
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(base.hostname);
  if ((base.protocol !== "https:" && !(local && base.protocol === "http:")) ||
      base.username || base.password) return null;
  return {
    source: "catalog", id: track.id, title: track.title, artist: track.artist,
    url: new URL(track.audioReference, base.origin).href,
  };
}

module.exports = { MUSIC_CATALOG, listAvailableMusicTracks, resolveMusicResource };
