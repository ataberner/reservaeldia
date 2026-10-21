import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const require = createRequire(import.meta.url);
const ROOT = fileURLToPath(new URL("../../../../", import.meta.url));
const OUTPUT = path.join(ROOT, ".local-isolation/konva-hit-draw-browser");

async function buildProbe() {
  const entry = path.join(OUTPUT, "entry.mjs");
  const source = (name) => JSON.stringify(path.join(ROOT, "src/components/editor/canvasEditor", name).replaceAll("\\", "/"));
  writeFileSync(entry, `
import Konva from "konva";
import { createKonvaLayerHitDraw } from ${source("konvaLayerHitDraw.js")};
import { activateImageLayerPerf, deactivateImageLayerPerf } from ${source("imageLayerPerf.js")};
import { activateKonvaLayerFreeze, deactivateKonvaLayerFreeze } from ${source("konvaLayerFreeze.js")};

// Explicit draw boundaries make pixel assertions deterministic. This is a
// functional browser check, not a timing or full-editor interaction benchmark.
Konva.autoDrawEnabled = false;
Konva.hitOnDragEnabled = false;
let activeStage = null;
function fixture(kind = "rect") {
  activeStage?.destroy();
  const stage = new Konva.Stage({ container: "app", width: 320, height: 240 });
  activeStage = stage;
  const layer = new Konva.Layer({ name: "main" });
  stage.add(layer);
  let node;
  if (kind === "image") {
    const image = document.createElement("canvas");
    image.width = 40; image.height = 30;
    image.getContext("2d").fillRect(0, 0, 40, 30);
    node = new Konva.Image({ image, id: "active", x: 20, y: 20, width: 40, height: 30, draggable: true });
  } else {
    node = new Konva.Rect({ id: "active", x: 20, y: 20, width: 40, height: 30, fill: "#7463cd", draggable: true });
  }
  layer.add(node);
  const calls = wrap(layer);
  stage.draw();
  return { stage, layer, node, calls };
}
function wrap(layer) {
  const counts = { original: 0 };
  const original = layer.drawHit;
  layer.drawHit = createKonvaLayerHitDraw(layer, function (...args) {
    counts.original++;
    return original.apply(this, args);
  });
  return counts;
}
function pixel(layer, x, y) {
  return Array.from(layer.getHitCanvas().getContext().getImageData(x, y, 1, 1).data);
}
function hit(stage, x, y) { return stage.getIntersection({ x, y })?.id() || null; }
function begin(stage, node) {
  stage.setPointersPositions({ clientX: node.x() + 10, clientY: node.y() + 10 });
  node.startDrag();
}
window.konvaHitProbe = { Konva, fixture, wrap, pixel, hit, begin, activateImageLayerPerf,
  deactivateImageLayerPerf, activateKonvaLayerFreeze, deactivateKonvaLayerFreeze };
`);
  const webpackPackage = require("next/dist/compiled/webpack/webpack");
  webpackPackage.init();
  const compiler = webpackPackage.webpack({
    mode: "development", target: "web", devtool: false, entry,
    output: { path: OUTPUT, filename: "probe.js" },
    resolve: { extensions: [".js", ".mjs"], alias: { "@": path.join(ROOT, "src") } },
    optimization: { minimize: false },
  });
  try {
    await new Promise((resolve, reject) => compiler.run((error, stats) => {
      if (error) return reject(error);
      if (stats.hasErrors()) return reject(new Error(stats.toString({ all: false, errors: true })));
      const modules = stats.toJson({ all: false, modules: true }).modules || [];
      assert.ok(!modules.some((module) => /node_modules[\\/](firebase|firebase-admin|@firebase)[\\/]/.test(module.name || "")), "pixel probe must remain offline");
      resolve();
    }));
  } finally {
    await new Promise((resolve, reject) => compiler.close((error) => error ? reject(error) : resolve()));
  }
}

test("empty hit-canvas reuse preserves real Konva hit pixels and selection", {
  skip: process.env.KONVA_HIT_DRAW_BROWSER !== "1" ? "Set KONVA_HIT_DRAW_BROWSER=1 for the offline Konva pixel regression." : false,
  timeout: 120_000,
}, async (t) => {
  assert.equal(process.versions.node.split(".")[0], "20", "use the declared Node 20 runtime");
  mkdirSync(OUTPUT, { recursive: true });
  await buildProbe();
  const { default: puppeteer } = await import("puppeteer");
  const chrome = process.env.CHROME_EXECUTABLE_PATH || path.join(ROOT, ".local-isolation/tool-cache/browser/chrome/win64-138.0.7204.157/chrome-win64/chrome.exe");
  assert.ok(existsSync(chrome), "use an already prepared Chromium; do not download a browser");
  const browser = await puppeteer.launch({ headless: true, executablePath: chrome, pipe: true,
    args: ["--disable-background-networking", "--host-resolver-rules=MAP * ~NOTFOUND"] });
  t.after(() => browser.close());
  const page = await browser.newPage();
  const errors = [], outbound = [], evidence = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setRequestInterception(true);
  page.on("request", (request) => {
    if (/^(data:|about:)/.test(request.url())) request.continue();
    else { outbound.push(request.url()); request.abort(); }
  });
  await page.setContent('<!doctype html><body style="margin:0"><div id="app"></div></body>');
  await page.addScriptTag({ path: path.join(OUTPUT, "probe.js") });
  await page.waitForFunction(() => Boolean(window.konvaHitProbe));
  const record = (name, value) => { evidence.push({ name, ...value }); return value; };
  try {
    await t.test("native drag clears old pixels once and release paints the new selectable pose", async () => {
      const result = record("native-drag", await page.evaluate(() => {
        const p = window.konvaHitProbe, { stage, layer, node, calls } = p.fixture();
        const initial = p.pixel(layer, 30, 30), initialHit = p.hit(stage, 30, 30);
        p.begin(stage, node);
        const dragging = node.isDragging(), eligible = layer.shouldDrawHit();
        const beforeFirst = calls.original;
        layer.drawHit();
        const afterFirst = calls.original, cleared = p.pixel(layer, 30, 30);
        node.position({ x: 140, y: 100 });
        for (let index = 0; index < 5; index++) layer.drawHit();
        const afterRepeated = calls.original, movedDuringDrag = p.pixel(layer, 150, 110);
        node.stopDrag();
        layer.drawHit();
        return { initial, initialHit, dragging, eligible, beforeFirst, afterFirst, cleared, afterRepeated,
          movedDuringDrag, oldAfterRelease: p.pixel(layer, 30, 30), newAfterRelease: p.pixel(layer, 150, 110),
          finalHit: p.hit(stage, 150, 110), oldHit: p.hit(stage, 30, 30), finalDragging: node.isDragging() };
      }));
      assert.equal(result.initial[3], 255);
      assert.equal(result.initialHit, "active");
      assert.equal(result.dragging, true);
      assert.equal(result.eligible, false);
      assert.equal(result.afterFirst, result.beforeFirst + 1);
      assert.equal(result.cleared[3], 0);
      assert.equal(result.afterRepeated, result.afterFirst);
      assert.equal(result.movedDuringDrag[3], 0);
      assert.equal(result.oldAfterRelease[3], 0);
      assert.equal(result.newAfterRelease[3], 255);
      assert.equal(result.finalHit, "active");
      assert.equal(result.oldHit, null);
      assert.equal(result.finalDragging, false);
    });

    await t.test("eligible layer with non-listening children clears once and restores child hit eligibility", async () => {
      const result = record("ineligible-children", await page.evaluate(() => {
        const p = window.konvaHitProbe, { stage, layer, node, calls } = p.fixture();
        node.listening(false);
        const layerEligible = layer.shouldDrawHit();
        layer.drawHit();
        const first = calls.original, oldPixel = p.pixel(layer, 30, 30);
        layer.drawHit(); layer.drawHit();
        const repeated = calls.original;
        node.position({ x: 100, y: 80 }); node.listening(true); layer.drawHit();
        return { layerEligible, first, repeated, oldPixel, newPixel: p.pixel(layer, 110, 90),
          oldAfterRestore: p.pixel(layer, 30, 30), newHit: p.hit(stage, 110, 90) };
      }));
      assert.equal(result.layerEligible, true);
      assert.equal(result.oldPixel[3], 0);
      assert.equal(result.repeated, result.first);
      assert.equal(result.newPixel[3], 255);
      assert.equal(result.oldAfterRestore[3], 0);
      assert.equal(result.newHit, "active");
    });

    await t.test("stage resize invalidates empty evidence and later hit drawing uses the resized bitmap", async () => {
      const result = record("resize", await page.evaluate(() => {
        const p = window.konvaHitProbe, { stage, layer, node, calls } = p.fixture();
        node.listening(false); layer.drawHit(); layer.drawHit();
        const beforeResize = calls.original;
        stage.size({ width: 500, height: 360 });
        layer.drawHit();
        const afterResize = calls.original;
        layer.drawHit();
        const afterRepeated = calls.original, clearPixel = p.pixel(layer, 430, 290);
        node.position({ x: 420, y: 280 }); node.listening(true); layer.drawHit();
        return { beforeResize, afterResize, afterRepeated, clearPixel,
          width: layer.getHitCanvas().getWidth(), height: layer.getHitCanvas().getHeight(),
          newPixel: p.pixel(layer, 430, 290), newHit: p.hit(stage, 430, 290) };
      }));
      assert.ok(result.afterResize > result.beforeResize);
      assert.equal(result.afterRepeated, result.afterResize);
      assert.equal(result.clearPixel[3], 0);
      assert.deepEqual([result.width, result.height], [500, 360]);
      assert.equal(result.newPixel[3], 255);
      assert.equal(result.newHit, "active");
    });

    await t.test("image lift and real image instrumentation preserve hits after returning to the main layer", async () => {
      const result = record("image-lift", await page.evaluate(() => {
        const p = window.konvaHitProbe, { stage, layer, node, calls } = p.fixture("image");
        const overlay = new p.Konva.Layer({ name: "overlay" }); stage.add(overlay);
        const overlayCalls = p.wrap(overlay);
        node.moveTo(overlay);
        p.activateImageLayerPerf(node, { elementId: "active", tipo: "imagen", sourceMp: 0.01, displayMp: 0.001 });
        const instrumented = overlay.__canvasImageDragPerfInstrumented === true;
        layer.drawHit(); overlay.drawHit();
        const oldMain = p.pixel(layer, 30, 30), lifted = p.pixel(overlay, 30, 30);
        p.begin(stage, node); overlay.drawHit();
        const first = overlayCalls.original, cleared = p.pixel(overlay, 30, 30);
        node.position({ x: 170, y: 130 }); overlay.drawHit(); overlay.drawHit();
        const repeated = overlayCalls.original;
        node.stopDrag(); p.deactivateImageLayerPerf(node, "active");
        node.moveTo(layer); stage.draw();
        return { instrumented, oldMain, lifted, first, repeated, cleared,
          overlayAfterReturn: p.pixel(overlay, 180, 140), finalPixel: p.pixel(layer, 180, 140),
          finalHit: p.hit(stage, 180, 140), mainOriginalCalls: calls.original, activePayloadCleared: overlay.__canvasActiveImageDragPerf === null };
      }));
      assert.equal(result.instrumented, true);
      assert.equal(result.oldMain[3], 0);
      assert.equal(result.lifted[3], 255);
      assert.equal(result.cleared[3], 0);
      assert.equal(result.repeated, result.first);
      assert.equal(result.overlayAfterReturn[3], 0);
      assert.equal(result.finalPixel[3], 255);
      assert.equal(result.finalHit, "active");
      assert.equal(result.activePayloadCleared, true);
    });

    await t.test("real layer freeze preserves its bitmap and thaw restores the guarded draw owner", async () => {
      const result = record("freeze-thaw", await page.evaluate(() => {
        const p = window.konvaHitProbe, { stage, layer, node, calls } = p.fixture("image");
        const owner = layer.drawHit, before = calls.original;
        p.activateKonvaLayerFreeze(layer);
        node.position({ x: 130, y: 100 }); layer.drawHit();
        const whileFrozen = calls.original, frozenOld = p.pixel(layer, 30, 30), frozenNew = p.pixel(layer, 140, 110);
        p.deactivateKonvaLayerFreeze(layer, { batchDraw: false });
        const restoredOwner = layer.drawHit === owner;
        layer.drawHit();
        return { before, whileFrozen, frozenOld, frozenNew, restoredOwner,
          oldAfterThaw: p.pixel(layer, 30, 30), newAfterThaw: p.pixel(layer, 140, 110),
          finalHit: p.hit(stage, 140, 110), listening: layer.listening(), frozenStateCleared: !layer.__canvasFreezeState };
      }));
      assert.equal(result.whileFrozen, result.before);
      assert.equal(result.frozenOld[3], 255);
      assert.equal(result.frozenNew[3], 0);
      assert.equal(result.restoredOwner, true);
      assert.equal(result.oldAfterThaw[3], 0);
      assert.equal(result.newAfterThaw[3], 255);
      assert.equal(result.finalHit, "active");
      assert.equal(result.listening, true);
      assert.equal(result.frozenStateCleared, true);
    });
    assert.deepEqual(errors, []);
    assert.deepEqual(outbound, []);
  } finally {
    writeFileSync(path.join(OUTPUT, "evidence.json"), JSON.stringify({ node: process.version, browser: await browser.version(),
      boundary: "Konva hit bitmap pixel reads and getIntersection with real helper/adapters; no React shell, Firebase, performance or physical presentation assertion.",
      evidence, errors, outbound }, null, 2));
  }
});
