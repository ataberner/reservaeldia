// Offline latency/regression probe. Run after a fresh Functions build.
// --baseline records the former load-on-click behavior for the same fixture.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer";
import { buildPreviewFrameSrcDoc } from "../src/components/preview/previewFrameRuntime.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const { generarHTMLDesdeSecciones } = require("../functions/lib/utils/generarHTMLDesdeSecciones.js");
const revision = require("puppeteer-core/lib/cjs/puppeteer/revisions.js").PUPPETEER_REVISIONS.chrome;
const browsers = require("@puppeteer/browsers");
const executablePath = browsers.computeExecutablePath({
  cacheDir: path.join(root, ".local-isolation/tool-cache/browser"),
  browser: browsers.Browser.CHROME, buildId: revision,
});
const baseline = process.argv.includes("--baseline");
const output = path.join(root, ".local-isolation", "music-loading-" + (baseline ? "baseline" : "after"));
fs.mkdirSync(output, { recursive: true });
const mp3 = fs.readFileSync(path.join(root, "public/assets/music/transporte.mp3"));
const server = http.createServer((req, res) => {
  const audio = req.url === "/audio.mp3";
  if (!audio && req.url !== "/hero.svg") { res.writeHead(404); res.end(); return; }
  setTimeout(() => {
    if (res.destroyed) return;
    const body = audio ? mp3 : '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="#eadbea"/></svg>';
    res.writeHead(200, { "Content-Type": audio ? "audio/mpeg" : "image/svg+xml", "Cache-Control": "no-store" });
    res.end(body);
  }, audio ? 700 : 1000);
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const origin = "http://127.0.0.1:" + server.address().port;
let browser;
const results = [];
try {
  browser = await puppeteer.launch({ executablePath, headless: true,
    userDataDir: path.join(output, "profile-" + Date.now()),
    args: ["--no-sandbox", "--disable-background-networking", "--disable-component-update", "--no-first-run"],
  });
  for (const preview of [false, true]) {
    for (let run = 0; run < 3; run++) {
      const page = await browser.newPage();
      await page.setViewport({ width: preview ? 390 : 1280, height: 844, isMobile: preview });
      await page.setCacheEnabled(false);
      await page.setRequestInterception(true);
      let audioRequests = 0;
      page.on("request", request => {
        if (request.url() === origin + "/audio.mp3") audioRequests++;
        void (request.url().startsWith(origin + "/") || /^(data:|about:)/.test(request.url()) ? request.continue() : request.abort());
      });
      const errors = [];
      page.on("pageerror", error => errors.push(error.message));
      let html = generarHTMLDesdeSecciones([
        { id: "hero", orden: 1, altoModo: "fijo", altura: 850, fondoTipo: "imagen", fondoImagen: origin + "/hero.svg" },
      ], [], null, {
        isPreview: preview,
        music: { enabled: true, volume: .35, loop: true },
        musicResource: { source: "catalog", id: "test-track", url: origin + "/audio.mp3" },
      });
      // Observe the real media element without changing its preload/play behavior.
      html = html.replace("<head>", `<head><script>
        window.__probe = { start: performance.now(), playing: null, click: null };
        var NativeAudio = window.Audio;
        window.Audio = function(){
          var audio = new NativeAudio();
          window.__probe.audio = audio;
          audio.addEventListener('playing', function(){ window.__probe.playing = performance.now(); });
          return audio;
        };
      </script>`);
      if (preview) html = buildPreviewFrameSrcDoc(html, { previewViewport: "mobile", layoutMode: "parity", previewSurface: "mobile-preview-focused" });
      await page.setContent(html, { waitUntil: "domcontentloaded" });
      await new Promise(resolve => setTimeout(resolve, 350));
      assert.equal(await page.$eval("body", node => node.dataset.loaderReady), "0");
      if (!baseline) assert.ok(audioRequests > 0, "audio must load alongside the critical image");
      try {
        await page.waitForFunction(() => !document.getElementById("inv-loader"));
      } catch (error) {
        console.error(await page.evaluate(() => ({ loader: document.getElementById("inv-loader")?.outerHTML,
          audioReady: window.__probe.audio?.readyState, audioError: window.__probe.audio?.error?.code,
          images: Array.from(document.images, img => ({ src: img.src, complete: img.complete, width: img.naturalWidth })),
        })), errors);
        throw error;
      }
      if (!baseline) assert.ok(await page.evaluate(() => window.__probe.audio.readyState >= 3));
      else assert.equal(audioRequests, 0);
      await page.evaluate(() => {
        window.__probe.gate = performance.now();
        document.getElementById("invitation-enter-music").addEventListener("click", () => { window.__probe.click = performance.now(); });
      });
      await page.click("#invitation-enter-music");
      await page.waitForFunction(() => window.__probe.playing !== null);
      const timing = await page.evaluate(() => ({
        loaderMs: window.__probe.gate - window.__probe.start,
        gestureToAudioMs: window.__probe.playing - window.__probe.click,
        totalMs: window.__probe.playing - window.__probe.start,
      }));
      if (!baseline) assert.ok(timing.gestureToAudioMs < 500, "preloaded audio should not repeat the 700ms request");
      assert.deepEqual(errors, []);
      results.push({ surface: preview ? "preview-mobile" : "published-desktop", run, ...timing });
      await page.close();
    }
  }
  fs.writeFileSync(path.join(output, "results.json"), JSON.stringify({ chromium: revision, baseline, cache: "disabled", audioDelayMs: 700, imageDelayMs: 1000, results }, null, 2));
  console.log(JSON.stringify({ output, results }, null, 2));
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
