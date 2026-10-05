import test from "node:test";
import assert from "node:assert/strict";
import config from "./musicConfig.cjs";
import catalog from "./musicCatalog.cjs";
const { normalizeMusicConfig, createDefaultMusicConfig } = config;
const { resolveMusicResource, listAvailableMusicTracks } = catalog;
const options = { publicBaseUrl: "http://localhost:3100" };
const selected = { enabled: true, track: { source: "catalog", id: "platform-demo" } };

test("legacy and OFF have no resource; OFF preserves selected identity", () => {
  assert.deepEqual(normalizeMusicConfig(undefined), createDefaultMusicConfig());
  assert.equal(resolveMusicResource(undefined, options), null);
  const off = normalizeMusicConfig({ ...selected, enabled: false });
  assert.equal(off.track.id, "platform-demo");
  assert.equal(resolveMusicResource(off, options), null);
});

test("authored config strips URLs and unknown fields and bounds volume", () => {
  const value = normalizeMusicConfig({
    ...selected, url: "https://evil.example/audio.mp3", volume: 8, loop: false,
    track: { ...selected.track, url: "/not-authority.mp3" },
  });
  assert.deepEqual(value, { version: 1, enabled: true, track: selected.track, volume: 1, loop: false });
  assert.equal(normalizeMusicConfig({ volume: -1 }).volume, 0);
  assert.equal(normalizeMusicConfig({ volume: NaN }).volume, 0.35);
  assert.equal(normalizeMusicConfig({ enabled: "true" }).enabled, false);
  assert.equal(normalizeMusicConfig({ track: { source: "catalog", id: "../audio.mp3" } }).track, null);
});

test("future user identities are preserved but never resolved without ownership support", () => {
  const future = normalizeMusicConfig({ enabled: true, track: { source: "user", id: "my-track" } });
  assert.deepEqual(future.track, { source: "user", id: "my-track" });
  assert.equal(resolveMusicResource(future, options), null);
});

test("catalog resolves only registered active identity through environment public origin", () => {
  assert.equal(listAvailableMusicTracks().length, 1);
  assert.equal(resolveMusicResource(selected, options).url, "http://localhost:3100/assets/musica.mp3");
  assert.equal(resolveMusicResource({ ...selected, track: { source: "catalog", id: "unknown" } }, options), null);
  assert.equal(resolveMusicResource(selected, { publicBaseUrl: "javascript:alert(1)" }), null);
  assert.equal(resolveMusicResource(selected, { publicBaseUrl: "http://remote.example" }), null);
  assert.equal(resolveMusicResource(selected, { publicBaseUrl: "https://user:pass@example.com" }), null);
  assert.equal(resolveMusicResource(selected, { publicBaseUrl: "https://example.com/nested/" }).url,
    "https://example.com/assets/musica.mp3");
});
