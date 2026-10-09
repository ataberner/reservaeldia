import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { existsSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const require = createRequire(import.meta.url);
const ROOT = fileURLToPath(new URL("../../../", import.meta.url));

async function buildProbe(outputDirectory) {
  const webpackPackage = require("next/dist/compiled/webpack/webpack");
  webpackPackage.init();
  const compiler = webpackPackage.webpack({
    mode: "development", target: "web", devtool: false,
    entry: fileURLToPath(new URL("./testSupport/googleMapResizeBrowser.mjs", import.meta.url)),
    output: { path: outputDirectory, filename: "probe.js" },
    optimization: { minimize: false },
  });
  try {
    await new Promise((resolve, reject) => compiler.run((error, stats) => {
      if (error) reject(error);
      else if (stats.hasErrors()) reject(new Error(stats.toString({ all: false, errors: true })));
      else resolve();
    }));
  } finally {
    await new Promise((resolve, reject) => compiler.close((error) => error ? reject(error) : resolve()));
  }
}

function syntheticMapResponse(request) {
  const url = new URL(request.url());
  const [width, height] = url.searchParams.get("size").split("x").map(Number);
  const scale = Number(url.searchParams.get("scale"));
  return {
    status: 200, contentType: "image/svg+xml",
    headers: { "access-control-allow-origin": "*" },
    body: `<svg xmlns="http://www.w3.org/2000/svg" width="${width * scale}" height="${height * scale}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="#edf0e7"/><path d="M0 ${height / 3}H${width}M${width / 3} 0V${height}" stroke="white" stroke-width="12"/><circle cx="${width / 2}" cy="${height / 2}" r="9" fill="#bd3f3f"/></svg>`,
  };
}

test("offline React/Konva map resize commits one request and preserves image lifecycle", {
  skip: process.env.MAP_RESIZE_BROWSER !== "1" ? "Set MAP_RESIZE_BROWSER=1 for offline Chromium regression." : false,
  timeout: 120_000,
}, async (t) => {
  const outputDirectory = path.join(ROOT, ".local-isolation/map-resize-regression");
  mkdirSync(outputDirectory, { recursive: true });
  await buildProbe(outputDirectory);
  const { default: puppeteer } = await import("puppeteer");
  const isolatedChrome = path.join(ROOT, ".local-isolation/tool-cache/browser/chrome/win64-138.0.7204.157/chrome-win64/chrome.exe");
  const browser = await puppeteer.launch({
    headless: true,
    ...(existsSync(isolatedChrome) ? { executablePath: isolatedChrome } : {}),
    args: ["--no-sandbox", "--disable-background-networking", "--disable-gpu"],
  });
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.setViewport({ width: 1120, height: 720, deviceScaleFactor: 1 });
  await page.setRequestInterception(true);
  const requests = [];
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    if (request.url().startsWith("https://maps.googleapis.com/maps/api/staticmap?")) requests.push(request);
    else if (/^(about:|data:)/.test(request.url())) request.continue();
    else request.abort();
  });
  await page.setContent('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><body style="margin:0;background:white"><div id="app"></div></body>');
  await page.addScriptTag({ path: path.join(outputDirectory, "probe.js") });
  const snapshot = () => page.evaluate(() => globalThis.mapResizeProbe.snapshot());
  async function waitForRequest(count) {
    const deadline = Date.now() + 10_000;
    while (requests.length < count && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(requests.length, count, "only the expected request is issued; all requests remain intercepted");
  }
  async function finishRequest(index) {
    await requests[index].respond(syntheticMapResponse(requests[index]));
    await page.waitForFunction(() => {
      const state = globalThis.mapResizeProbe.snapshot();
      return state.hasImage && state.imageSource === state.requestedSource;
    });
  }
  await waitForRequest(1);
  await finishRequest(0);
  const initial = await snapshot();
  assert.deepEqual([initial.visibleWidth, initial.visibleHeight], [361, 220]);

  await page.evaluate(async () => {
    for (let frame = 1; frame <= 12; frame++) {
      globalThis.mapResizeProbe.drag(1 + frame / 60, 1 + frame / 120);
      await new Promise((resolve) => globalThis.requestAnimationFrame(resolve));
    }
  });
  assert.equal(requests.length, 1, "drag must issue zero additional Static Maps requests");
  const during = await snapshot();
  assert.deepEqual([during.width, during.height], [361, 220], "authored dimensions stay committed until gesture end");
  assert.ok(Math.abs(during.visibleWidth - 433.2) < 0.001);
  assert.ok(Math.abs(during.visibleHeight - 242) < 0.001);
  assert.equal(during.imageSource, initial.imageSource);

  await page.evaluate(() => globalThis.mapResizeProbe.commit());
  await waitForRequest(2);
  const committed = await snapshot();
  assert.deepEqual([committed.scaleX, committed.scaleY], [1, 1]);
  assert.ok(Math.abs(committed.visibleWidth - 433.2) < 0.001, "size must not be multiplied by the live scale twice");
  assert.ok(Math.abs(committed.visibleHeight - 242) < 0.001);
  assert.deepEqual([committed.imageWidth, committed.imageHeight], [committed.width, committed.height]);
  assert.equal(committed.imageSource, initial.imageSource, "retain the loaded image while replacement is pending");
  await page.screenshot({ path: path.join(outputDirectory, "resized-loading.png") });
  await finishRequest(1);
  const loaded = await snapshot();
  assert.notEqual(loaded.imageSource, initial.imageSource);

  await page.evaluate(() => { globalThis.mapResizeProbe.drag(1.1, 1); globalThis.mapResizeProbe.commit(); });
  await waitForRequest(3);
  await requests[2].abort("failed");
  await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 100)));
  assert.equal((await snapshot()).imageSource, loaded.imageSource, "failed resize replacement retains the same-place image");

  await page.evaluate(() => globalThis.mapResizeProbe.changeLocation());
  await waitForRequest(4);
  assert.equal((await snapshot()).hasImage, false, "another location must never display the preceding map");
  await finishRequest(3);

  await page.evaluate(() => { globalThis.mapResizeProbe.drag(0.01, 0.03); globalThis.mapResizeProbe.commit(); });
  await waitForRequest(5);
  const minimum = await snapshot();
  assert.deepEqual([minimum.width, minimum.height, minimum.visibleWidth, minimum.visibleHeight], [200, 200, 200, 200]);
  assert.equal(minimum.requestedSize, "200x200");
  await finishRequest(4);

  await page.evaluate(() => { globalThis.mapResizeProbe.drag(5, 1.6); globalThis.mapResizeProbe.commit(); });
  await waitForRequest(6);
  const large = await snapshot();
  assert.deepEqual([large.width, large.height], [1000, 320]);
  assert.equal(large.requestedSize, "640x205", "request ceiling scales both axes proportionally");
  await finishRequest(5);
  await page.screenshot({ path: path.join(outputDirectory, "large-loaded.png") });
  assert.deepEqual(errors, [], "the real React/Konva scene has no runtime errors");
  assert.equal(requests.length, 6, "one initial request plus exactly one per committed size/location change");
});
