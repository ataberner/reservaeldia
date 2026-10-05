// Offline Chromium regression of the actual generated invitation, no Firebase calls.
// Run after Functions build: node scripts/checkMusicBrowser.mjs
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
assert.ok(fs.existsSync(executablePath), "Prepare the pinned local Chromium first");
const output = path.join(root, ".local-isolation", "music-browser-" + Date.now());
fs.mkdirSync(output, { recursive: true });
const sections = [
  { id: "hero", orden: 1, altoModo: "fijo", altura: 850, fondo: "#faf5f0", fondoColor: "#faf5f0" },
  { id: "details", orden: 2, altoModo: "fijo", altura: 850, fondo: "#efe6df", fondoColor: "#efe6df" },
];
const objects = [
  { id: "title", tipo: "texto", texto: "Clara & Mateo", seccionId: "hero", x: 100, y: 130, width: 580, height: 90, fontFamily: "Georgia", fontSize: 54, color: "#5d445f", align: "center", motionEffect: "reveal" },
  { id: "subtitle", tipo: "texto", texto: "Nos casamos", seccionId: "hero", x: 220, y: 250, width: 340, height: 50, fontFamily: "Arial", fontSize: 28, color: "#8c747c", align: "center", motionEffect: "zoom" },
  { id: "date", tipo: "texto", texto: "20 de noviembre de 2035", seccionId: "hero", x: 200, y: 340, width: 380, height: 40, fontFamily: "Arial", fontSize: 20, color: "#8c747c", align: "center", motionEffect: "draw" },
  { id: "countdown", tipo: "countdown", countdownSchemaVersion: 2, seccionId: "hero", x: 200, y: 460, width: 380, height: 130, fechaObjetivo: "2035-11-20T20:00:00.000Z", targetISO: "2035-11-20T20:00:00.000Z", entryAnimation: "fadeUp", tickAnimation: "pulse", frameAnimation: "rotateSlow", motionEffect: "pulse" },
  { id: "below", tipo: "texto", texto: "Te esperamos", seccionId: "details", x: 200, y: 130, width: 380, height: 80, fontFamily: "Georgia", fontSize: 40, color: "#5d445f", align: "center", motionEffect: "reveal" },
];
const music = { enabled: true, track: { source: "catalog", id: "platform-demo" }, volume: .35, loop: true };
let audioRequests = 0;
const server = http.createServer((req, res) => {
  if (req.url === "/audio.mp3") {
    audioRequests++;
    res.writeHead(200, { "Content-Type": "audio/mpeg", "Content-Length": fs.statSync(path.join(root, "public/assets/musica.mp3")).size });
    fs.createReadStream(path.join(root, "public/assets/musica.mp3")).pipe(res);
  } else { res.writeHead(404); res.end(); }
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const origin = "http://127.0.0.1:" + server.address().port;
const browser = await puppeteer.launch({ executablePath, headless: true, userDataDir: path.join(output, "profile"), args: ["--no-sandbox", "--disable-background-networking", "--disable-component-update", "--no-first-run"] });
const results = [];
try {
  for (const surface of [
    { name: "published-desktop", width: 1280, height: 900 },
    { name: "published-mobile", width: 390, height: 844 },
    { name: "preview-desktop", width: 1280, height: 900, preview: "desktop" },
    { name: "preview-mobile-mockup", width: 390, height: 844, preview: "mobile", previewSurface: "paired-mobile" },
    { name: "preview-mobile-focused", width: 390, height: 844, preview: "mobile", previewSurface: "mobile-preview-focused" },
  ]) {
    const page = await browser.newPage();
    await page.setViewport({ width: surface.width, height: surface.height, isMobile: surface.width < 500, deviceScaleFactor: 1 });
    await page.setRequestInterception(true);
    page.on("request", request => {
      const url = request.url();
      if (url.startsWith(origin) || url.startsWith("data:") || url.startsWith("about:")) void request.continue();
      else void request.abort();
    });
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    const html = generarHTMLDesdeSecciones(sections, objects, null, {
      isPreview: !!surface.preview, music,
      musicResource: { source: "catalog", id: "platform-demo", url: origin + "/audio.mp3" },
    });
    const source = surface.preview ? buildPreviewFrameSrcDoc(html, {
      previewViewport: surface.preview, layoutMode: "parity", previewSurface: surface.previewSurface || "paired-desktop",
    }) : html;
    await page.setContent(source, { waitUntil: "load" });
    await page.waitForFunction(() => !document.getElementById("inv-loader"));
    await page.evaluate(() => {
      window.__musicProbe = { invitation: document.querySelector(".inv"), title: document.querySelector('[data-obj-id="title"]'), entries: 0 };
      window.addEventListener("invitation-entry-resolved", () => window.__musicProbe.entries++);
    });
    await new Promise(resolve => setTimeout(resolve, 1200));
    assert.equal(audioRequests, 0, "Gate must not request MP3");
    const pending = await page.evaluate(() => ({
      pending: document.body.dataset.invitationEntry,
      count: document.querySelectorAll(".inv").length,
      reveal: document.querySelector('[data-obj-id="title"]').classList.contains("mefx-reveal-on"),
      countdown: document.querySelector("[data-countdown]").classList.contains("cdv2-entry-up"),
      blur: getComputedStyle(document.querySelector(".inv")).filter,
      gate: document.getElementById("invitation-entry-gate").getBoundingClientRect().toJSON(),
    }));
    assert.equal(pending.pending, "pending");
    assert.equal(pending.count, 1);
    assert.equal(pending.reveal, false);
    assert.equal(pending.countdown, false);
    assert.match(pending.blur, /blur/);
    assert.ok(pending.gate.width <= surface.width + 1);
    await page.screenshot({ path: path.join(output, surface.name + "-gate.png") });
    await page.click("#invitation-enter-silent");
    await page.waitForFunction(() => document.querySelector('[data-obj-id="title"]').classList.contains("mefx-reveal-on"));
    await new Promise(resolve => setTimeout(resolve, 950));
    const entered = await page.evaluate(() => ({
      same: window.__musicProbe.invitation === document.querySelector(".inv") && window.__musicProbe.title === document.querySelector('[data-obj-id="title"]'),
      entries: window.__musicProbe.entries,
      blur: getComputedStyle(document.querySelector(".inv")).filter,
      controlHidden: document.getElementById("invitation-music-control").hidden,
      countdown: document.querySelector("[data-countdown]").classList.contains("cdv2-entry-up"),
    }));
    assert.equal(entered.same, true);
    assert.equal(entered.entries, 1);
    assert.equal(entered.blur, "none");
    assert.equal(entered.controlHidden, true);
    assert.equal(entered.countdown, true);
    assert.equal(audioRequests, 0);
    await page.screenshot({ path: path.join(output, surface.name + "-entered.png") });
    await page.evaluate(() => window.scrollTo(0, 900));
    await page.waitForFunction(() => document.querySelector('[data-obj-id="below"]').classList.contains("mefx-reveal-on"));
    assert.deepEqual(errors, [], surface.name + " runtime errors");
    results.push({ surface: surface.name, pending, entered, runtimeErrors: errors });
    await page.close();
  }
  // Actual MP3 decode/play using a user gesture, including pause/resume and teardown.
  const page = await browser.newPage();
  await page.setRequestInterception(true);
  page.on("request", req => req.url().startsWith(origin) || req.url().startsWith("data:") ? req.continue() : req.abort());
  await page.setContent(generarHTMLDesdeSecciones(sections, objects, null, {
    music, musicResource: { source: "catalog", id: "platform-demo", url: origin + "/audio.mp3" },
  }), { waitUntil: "load" });
  await page.waitForFunction(() => !document.getElementById("inv-loader"));
  assert.equal(audioRequests, 0);
  await page.click("#invitation-enter-music");
  await page.waitForFunction(() => document.getElementById("invitation-music-control").dataset.playing === "true", { timeout: 15000 });
  await page.click("#invitation-music-control");
  await page.waitForFunction(() => document.getElementById("invitation-music-control").dataset.playing === "false");
  await page.click("#invitation-music-control");
  await page.waitForFunction(() => document.getElementById("invitation-music-control").dataset.playing === "true");
  await page.evaluate(() => window.__invitationMusicRuntime.dispose());
  assert.equal(await page.$eval("#invitation-music-control", node => node.dataset.playing), "false");
  assert.ok(audioRequests >= 1);
  results.push({ actualMp3: true, playPauseResumeCleanup: true, audioRequests });
  await page.close();

  // The paired preview uses two real scaled iframe documents, as the modal does.
  const host = await browser.newPage();
  await host.setViewport({ width: 1280, height: 900 });
  await host.setRequestInterception(true);
  host.on("request", req => req.url().startsWith(origin) || req.url().startsWith("data:") || req.url().startsWith("about:") ? req.continue() : req.abort());
  const pairedBase = generarHTMLDesdeSecciones(sections, objects, null, { isPreview: true, music,
    musicResource: { source: "catalog", id: "platform-demo", url: origin + "/audio.mp3" } });
  const desktopSource = buildPreviewFrameSrcDoc(pairedBase, { previewViewport: "desktop", layoutMode: "parity", previewSurface: "paired-desktop" });
  const mobileSource = buildPreviewFrameSrcDoc(pairedBase, { previewViewport: "mobile", layoutMode: "parity", previewSurface: "paired-mobile" });
  await host.setContent('<div style="display:flex;gap:30px"><div style="width:700px;height:550px;overflow:hidden"><iframe id="desktop" sandbox="allow-scripts allow-same-origin" style="width:1280px;height:900px;zoom:.54;border:0"></iframe></div><div style="width:190px;height:415px;overflow:hidden;border:6px solid #ddd;border-radius:24px"><iframe id="mobile" sandbox="allow-scripts allow-same-origin" style="width:390px;height:844px;zoom:.48;border:0"></iframe></div></div>');
  await host.evaluate(({ desktopSource, mobileSource }) => {
    document.getElementById("desktop").srcdoc = desktopSource;
    document.getElementById("mobile").srcdoc = mobileSource;
  }, { desktopSource, mobileSource });
  const desktopFrame = await (await host.$("#desktop")).contentFrame();
  const mobileFrame = await (await host.$("#mobile")).contentFrame();
  for (const frame of [desktopFrame, mobileFrame]) {
    await frame.waitForFunction(() => document.querySelector("#invitation-entry-gate") && !document.querySelector("#inv-loader"));
    assert.equal(await frame.$eval("body", node => node.dataset.invitationEntry), "pending");
  }
  await host.screenshot({ path: path.join(output, "paired-iframe-gates.png") });
  async function clickScaled(frame, frameSelector, buttonSelector) {
    const outer = await host.$eval(frameSelector, node => { const r = node.getBoundingClientRect(); return { left: r.left, top: r.top, width: r.width }; });
    const inner = await frame.$eval(buttonSelector, node => { const r = node.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, width: window.innerWidth }; });
    const scale = outer.width / inner.width;
    await host.mouse.click(outer.left + inner.x * scale, outer.top + inner.y * scale);
    assert.equal(await frame.$eval("body", node => node.dataset.invitationEntry), "resolved", "trusted pointer must hit gate inside scaled iframe");
  }
  await clickScaled(desktopFrame, "#desktop", "#invitation-enter-music");
  await desktopFrame.waitForFunction(() => document.getElementById("invitation-music-control").dataset.playing === "true");
  await clickScaled(mobileFrame, "#mobile", "#invitation-enter-music");
  await mobileFrame.waitForFunction(() => document.getElementById("invitation-music-control").dataset.playing === "true");
  await desktopFrame.waitForFunction(() => document.getElementById("invitation-music-control").dataset.playing === "false");
  // Closing preview explicitly disposes the document before removing the iframe.
  await host.evaluate(() => {
    for (const frame of document.querySelectorAll("iframe")) {
      frame.contentWindow.__invitationMusicRuntime.dispose();
      frame.remove();
    }
  });
  await host.evaluate(source => {
    const frame = document.createElement("iframe");
    frame.id = "reopened"; frame.srcdoc = source;
    document.body.appendChild(frame);
  }, mobileSource);
  const reopened = await (await host.$("#reopened")).contentFrame();
  await reopened.waitForFunction(() => document.querySelector("#invitation-entry-gate") && !document.querySelector("#inv-loader"));
  assert.equal(await reopened.$eval("body", node => node.dataset.invitationEntry), "pending");
  results.push({ pairedScaledIframes: true, exclusivePlayback: true, reopenGate: true });
  await host.close();

  fs.writeFileSync(path.join(output, "results.json"), JSON.stringify({ chromium: revision, results }, null, 2));
  console.log(JSON.stringify({ ok: true, output, surfaces: 5, pairedScaledIframes: true, actualMp3: true }));
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
