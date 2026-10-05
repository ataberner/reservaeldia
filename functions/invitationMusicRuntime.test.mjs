import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { JSDOM, VirtualConsole } from "jsdom";
import { buildPreviewFrameSrcDoc } from "../src/components/preview/previewFrameRuntime.js";

const require = createRequire(import.meta.url);
const { generarHTMLDesdeSecciones } = require("./lib/utils/generarHTMLDesdeSecciones.js");
const { generarInvitationMusicRuntimeHTML } = require("./lib/utils/generarInvitationMusicRuntime.js");
const MUSIC = { enabled: true, track: { source: "catalog", id: "platform-demo" }, volume: 0.35, loop: true };
const RESOURCE = { url: "https://music.invalid/test.mp3", id: "platform-demo", source: "catalog" };
const SECTIONS = [{ id: "hero", orden: 1, altoModo: "fijo", altura: 800 }];
const OBJECTS = [
  { id: "title", tipo: "texto", texto: "Nos casamos", seccionId: "hero", x: 40, y: 40, width: 300, height: 60, fontFamily: "Arial", fontSize: 32, motionEffect: "reveal" },
  { id: "countdown", tipo: "countdown", countdownSchemaVersion: 2, seccionId: "hero", x: 40, y: 160, width: 300, height: 130, fechaObjetivo: "2035-11-20T20:00:00.000Z", targetISO: "2035-11-20T20:00:00.000Z", entryAnimation: "fadeUp", tickAnimation: "pulse", frameAnimation: "rotateSlow", motionEffect: "pulse" },
];

function generatedHtml(options = {}) {
  return generarHTMLDesdeSecciones(SECTIONS, OBJECTS, null, { music: MUSIC, musicResource: RESOURCE, ...options });
}

async function waitUntil(predicate, message) {
  const deadline = Date.now() + 2500;
  while (!predicate()) {
    if (Date.now() > deadline) assert.fail(message);
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

function openInvitation(t, { html = generatedHtml(), playResult = "success", viewport = 1280, peerHost = null, reducedMotion = false } = {}) {
  const state = { audio: [], playCalls: 0, pauseCalls: 0, io: [], countdownIntervals: 0, entryEvents: 0, runtimeErrors: [] };
  const virtualConsole = new VirtualConsole();
  virtualConsole.on("jsdomError", (error) => state.runtimeErrors.push(error));
  const dom = new JSDOM(html, {
    url: "https://invitation.invalid/",
    pretendToBeVisual: true,
    runScripts: "dangerously",
    virtualConsole,
    beforeParse(window) {
      Object.defineProperty(window, "innerWidth", { value: viewport, configurable: true });
      window.matchMedia = (query) => ({ matches: reducedMotion && query.includes("prefers-reduced-motion"), addListener() {}, removeListener() {} });
      if (peerHost) Object.defineProperty(window, "parent", { value: peerHost });
      window.scrollTo = () => {};
      window.requestAnimationFrame = (callback) => window.setTimeout(callback, 0);
      window.cancelAnimationFrame = (id) => window.clearTimeout(id);
      const setInterval = window.setInterval.bind(window);
      window.setInterval = (callback, duration) => {
        if (duration === 1000) state.countdownIntervals++;
        return setInterval(callback, duration);
      };
      window.IntersectionObserver = class {
        constructor(callback) { this.callback = callback; this.targets = new Set(); state.io.push(this); }
        observe(target) { this.targets.add(target); }
        unobserve(target) { this.targets.delete(target); }
        disconnect() { this.targets.clear(); }
        enter() { this.callback(Array.from(this.targets, (target) => ({ target, isIntersecting: true }))); }
      };
      window.Audio = class extends window.EventTarget {
        constructor() { super(); this.paused = true; this.currentTime = 0; state.audio.push(this); }
        play() {
          state.playCalls++;
          if (playResult === "throw") throw new Error("play blocked");
          if (playResult === "reject") return Promise.reject(new Error("play blocked"));
          if (playResult === "pending") return new Promise(() => {});
          this.paused = false;
          this.dispatchEvent(new window.Event("playing"));
          return Promise.resolve();
        }
        pause() { state.pauseCalls++; this.paused = true; this.dispatchEvent(new window.Event("pause")); }
        removeAttribute(name) { if (name === "src") this.src = ""; }
        load() { this.loadedAfterDispose = true; }
      };
      window.addEventListener("invitation-entry-resolved", () => state.entryEvents++);
    },
  });
  t.after(() => { dom.window.__invitationMusicRuntime?.dispose(); dom.window.close(); });
  return { dom, window: dom.window, document: dom.window.document, state };
}

for (const [name, music, musicResource] of [
  ["legacy", undefined, undefined],
  ["OFF preserves selection", { ...MUSIC, enabled: false }, RESOURCE],
  ["missing/invalid track", MUSIC, null],
]) {
  test(`${name}: no gate and no audio, existing effects still start`, async (t) => {
    const ctx = openInvitation(t, { html: generatedHtml({ music, musicResource }) });
    assert.equal(ctx.document.getElementById("invitation-entry-gate"), null);
    assert.equal(ctx.window.__invitationMusicRuntime, undefined);
    assert.equal(ctx.state.audio.length, 0);
    await waitUntil(() => ctx.state.io.length > 0, "legacy motion did not boot");
    ctx.state.io[0].enter();
    await waitUntil(() => ctx.document.querySelector('[data-obj-id="title"]').classList.contains("mefx-reveal-on"), "legacy reveal did not activate");
    assert.equal(ctx.state.countdownIntervals, 1);
    assert.deepEqual(ctx.state.runtimeErrors, []);
  });
}

for (const [name, previewViewport] of [["published", null], ["desktop preview", "desktop"], ["mobile paired preview", "mobile"], ["mobile focused preview", "focused"]]) {
  for (const withMusic of [true, false]) {
    test(`${name}: ${withMusic ? "with music" : "silent"} preserves one DOM and starts effects once after gate`, async (t) => {
      let html = generatedHtml({ isPreview: !!previewViewport });
      if (previewViewport) html = buildPreviewFrameSrcDoc(html, {
        previewViewport: previewViewport === "focused" ? "mobile" : previewViewport,
        layoutMode: "parity",
        previewSurface: previewViewport === "focused" ? "mobile-preview-focused" : `paired-${previewViewport}`,
      });
      const ctx = openInvitation(t, { html, viewport: previewViewport?.includes("mobile") || previewViewport === "focused" ? 390 : 1280 });
      const { document, state, window } = ctx;
      const invitation = document.querySelector(".inv");
      const title = document.querySelector('[data-obj-id="title"]');
      const countdown = document.querySelector('[data-countdown]');
      await waitUntil(() => !document.getElementById("inv-loader"), "loader must finish while entry gate waits");
      await new Promise((resolve) => setTimeout(resolve, 60));
      assert.equal(document.querySelectorAll(".inv").length, 1);
      assert.equal(document.body.getAttribute("data-invitation-entry"), "pending");
      assert.equal(invitation.hasAttribute("inert"), true);
      assert.equal(state.audio.length, 0, "no MP3/audio allocation before explicit choice");
      assert.equal(state.io.length, 0, "observer must not consume intersections behind blur");
      assert.equal(state.countdownIntervals, 0, "countdown timeline must not start behind blur");
      assert.equal(title.classList.contains("mefx-reveal-on"), false);
      assert.equal(countdown.classList.contains("cdv2-entry-up"), false);
      assert.equal(countdown.classList.contains("mefx-pulse"), false);
      document.getElementById(withMusic ? "invitation-enter-music" : "invitation-enter-silent").click();
      await waitUntil(() => state.io.length === 1, "entry did not start observer");
      state.io[0].enter();
      await waitUntil(() => title.classList.contains("mefx-reveal-on"), "entry effect did not run");
      assert.equal(document.querySelector(".inv"), invitation);
      assert.equal(document.querySelector('[data-obj-id="title"]'), title);
      assert.equal(invitation.hasAttribute("inert"), false);
      assert.equal(state.entryEvents, 1);
      assert.equal(state.countdownIntervals, 1);
      assert.equal(countdown.classList.contains("cdv2-entry-up"), true);
      assert.equal(countdown.classList.contains("mefx-pulse"), true);
      assert.equal(state.playCalls, withMusic ? 1 : 0);
      assert.equal(document.getElementById("invitation-music-control").hidden, !withMusic);
      if (withMusic) {
        assert.equal(state.audio[0].preload, "none");
        assert.equal(state.audio[0].volume, 0.35);
        assert.equal(state.audio[0].loop, true);
      }
      window.__invitationMusicRuntime.resolveWithoutMusic();
      document.getElementById("invitation-enter-music").click();
      await new Promise((resolve) => setTimeout(resolve, 20));
      assert.equal(state.entryEvents, 1);
      assert.equal(state.io.length, 1);
      assert.equal(state.countdownIntervals, 1);
      assert.equal(state.playCalls, withMusic ? 1 : 0);
      assert.deepEqual(state.runtimeErrors, []);
    });
  }
}

for (const playResult of ["reject", "throw", "pending"]) {
  test(`audio ${playResult}: access and effects never wait for playback`, async (t) => {
    const { document, state } = openInvitation(t, { playResult });
    await waitUntil(() => !document.getElementById("inv-loader"), "loader did not finish");
    document.getElementById("invitation-enter-music").click();
    assert.equal(document.body.getAttribute("data-invitation-entry"), "resolved");
    assert.equal(document.getElementById("invitation-entry-gate").hidden, true);
    await waitUntil(() => state.io.length === 1, "audio failure blocked effects");
    assert.equal(state.entryEvents, 1);
    assert.equal(state.playCalls, 1);
    assert.notEqual(document.getElementById("invitation-music-control").getAttribute("data-playing"), "true");
  });
}

test("floating control pauses/resumes one audio without restarting scroll or DOM; dispose stops it", async (t) => {
  const { document, window, state } = openInvitation(t);
  const invitation = document.querySelector(".inv");
  document.getElementById("invitation-enter-music").click();
  const audio = state.audio[0];
  const control = document.getElementById("invitation-music-control");
  audio.currentTime = 27;
  control.click();
  assert.equal(audio.paused, true);
  assert.equal(control.getAttribute("data-playing"), "false");
  control.click();
  assert.equal(state.audio.length, 1);
  assert.equal(audio.currentTime, 27);
  assert.equal(control.getAttribute("data-playing"), "true");
  assert.equal(document.querySelector(".inv"), invitation);
  window.__invitationMusicRuntime.dispose();
  assert.equal(audio.paused, true);
  assert.equal(audio.src, "");
  assert.equal(audio.loadedAfterDispose, true);
  control.click();
  assert.equal(state.playCalls, 2);
});

test("each preview opening gets a new unresolved gate, independent of previous choice", async (t) => {
  const first = openInvitation(t);
  first.document.getElementById("invitation-enter-music").click();
  first.window.__invitationMusicRuntime.dispose();
  const second = openInvitation(t);
  assert.equal(second.document.body.getAttribute("data-invitation-entry"), "pending");
  assert.equal(second.state.audio.length, 0);
  assert.equal(first.state.audio[0].paused, true);
});

test("share-image entry uses the same silent lifecycle without allocating audio", async (t) => {
  const { window, state, document } = openInvitation(t);
  const invitation = document.querySelector(".inv");
  window.__invitationMusicRuntime.resolveWithoutMusic();
  await waitUntil(() => state.io.length === 1, "share capture did not start effects");
  assert.equal(document.body.getAttribute("data-invitation-entry"), "resolved");
  assert.equal(document.querySelector(".inv"), invitation);
  assert.equal(state.audio.length, 0);
});

test("runtime serialization rejects unsafe URL schemes and cannot close its script", () => {
  assert.equal(generarInvitationMusicRuntimeHTML(MUSIC, { ...RESOURCE, url: "javascript:alert(1)" }), "");
  const html = generarInvitationMusicRuntimeHTML(MUSIC, { ...RESOURCE, url: "https://music.invalid/</script><script>alert(1)</script>" });
  assert.equal((html.match(/<script>/g) || []).length, 1);
  assert.equal((html.match(/<\/script>/g) || []).length, 1);
});


test("paired mockups never play simultaneously and remove host listeners on dispose", async (t) => {
  const host = new JSDOM("<!doctype html><html><body></body></html>");
  t.after(() => host.window.close());
  const desktop = openInvitation(t, { peerHost: host.window });
  const mobile = openInvitation(t, { peerHost: host.window, viewport: 390 });
  desktop.document.getElementById("invitation-enter-music").click();
  mobile.document.getElementById("invitation-enter-music").click();
  assert.equal(desktop.state.audio[0].paused, true);
  assert.equal(mobile.state.audio[0].paused, false);
  desktop.document.getElementById("invitation-music-control").click();
  assert.equal(mobile.state.audio[0].paused, true);
  assert.equal(desktop.state.audio[0].paused, false);
  mobile.window.__invitationMusicRuntime.dispose();
  const previousPauses = mobile.state.pauseCalls;
  host.window.dispatchEvent(new host.window.CustomEvent("invitation-music-play", { detail: desktop.window }));
  assert.equal(mobile.state.pauseCalls, previousPauses);
});

test("Escape enters silently and reduced-motion fallback still waits for the gate", async (t) => {
  const { document, window, state } = openInvitation(t, { reducedMotion: true });
  await waitUntil(() => !document.getElementById("inv-loader"), "loader did not finish");
  const title = document.querySelector('[data-obj-id="title"]');
  assert.equal(title.classList.contains("mefx-reveal-on"), false);
  document.getElementById("invitation-entry-gate").dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape" }));
  await waitUntil(() => title.classList.contains("mefx-reveal-on"), "reduced motion entry did not run");
  assert.equal(state.playCalls, 0);
  assert.equal(state.io.length, 0);
  assert.equal(state.entryEvents, 1);
});
