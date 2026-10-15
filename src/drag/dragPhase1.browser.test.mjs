import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const require = createRequire(import.meta.url);
const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const PHASE2 = process.env.DRAG_PHASE2_BROWSER === "1";
const OUTPUT = path.join(ROOT, PHASE2 ? ".local-isolation/drag-phase2-browser" : ".local-isolation/drag-phase1-browser");
const base = (id, extra = {}) => ({ id, tipo: "forma", figura: "rect", x: 100, y: 100, width: 80, height: 50, seccionId: "s1", ...extra });

async function buildProbe() {
  const webpackPackage = require("next/dist/compiled/webpack/webpack");
  webpackPackage.init();
  const compiler = webpackPackage.webpack({
    mode: "development", target: "web", devtool: false,
    entry: fileURLToPath(new URL("./testSupport/dragPhase1Browser.mjs", import.meta.url)),
    output: { path: OUTPUT, filename: "probe.js" },
    optimization: { minimize: false },
    resolve: { extensions: [".js", ".jsx", ".mjs", ".ts"], alias: { "@": path.join(ROOT, "src") } },
    module: { rules: [{ test: /\.(jsx|ts)$/, exclude: /node_modules/, use: path.join(ROOT, "src/domain/eventDetails/testSupport/googleMapTransformerJsxLoader.cjs") }] },
  });
  try {
    await new Promise((resolve, reject) => compiler.run((error, stats) => {
      if (error) return reject(error);
      if (stats.hasErrors()) return reject(new Error(stats.toString({ all: false, errors: true })));
      const modules = stats.toJson({ all: false, modules: true }).modules || [];
      assert.ok(!modules.some((module) => /node_modules[\\/](firebase|firebase-admin|@firebase)[\\/]/.test(module.name || "")), "offline probe must not bundle Firebase adapters");
      resolve();
    }));
  } finally {
    await new Promise((resolve, reject) => compiler.close((error) => error ? reject(error) : resolve()));
  }
}

test("drag: real browser mouse interactions and canonical geometry", {
  skip: process.env.DRAG_PHASE1_BROWSER !== "1" && !PHASE2 ? "Set DRAG_PHASE1_BROWSER=1 or DRAG_PHASE2_BROWSER=1 for the offline React/Konva regression." : false,
  timeout: 180_000,
}, async (t) => {
  assert.equal(process.versions.node.split(".")[0], "20", "run with the project's declared Node 20");
  mkdirSync(OUTPUT, { recursive: true });
  await buildProbe();
  t.diagnostic("Offline React/Konva bundle compiled without Firebase.");
  const { default: puppeteer } = await import("puppeteer");
  const chrome = process.env.CHROME_EXECUTABLE_PATH || path.join(ROOT, ".local-isolation/tool-cache/browser/chrome/win64-138.0.7204.157/chrome-win64/chrome.exe");
  assert.ok(existsSync(chrome), "prepare the repository browser cache first; no automatic download");
  const browser = await puppeteer.launch({
    headless: true, executablePath: chrome, pipe: true,
    args: ["--disable-background-networking", "--disable-gpu", "--host-resolver-rules=MAP * ~NOTFOUND"],
  });
  t.diagnostic("Cached Chromium launched.");
  t.after(() => browser.close());
  const browserVersion = await browser.version();
  const page = await browser.newPage();
  t.diagnostic("Browser page created.");
  await page.setViewport({ width: 850, height: 1250, deviceScaleFactor: 1 });
  const errors = [], outbound = [], evidence = [];
  page.on("pageerror", (error) => { errors.push(error.message); t.diagnostic(error.message); });
  await page.setRequestInterception(true);
  page.on("request", (request) => {
    if (/^(data:|about:)/.test(request.url())) request.continue();
    else { outbound.push(request.url()); request.abort(); }
  });
  await page.setContent('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><body style="margin:0;background:white"><div id="app"></div></body>');
  t.diagnostic("Synthetic page mounted.");
  await page.addScriptTag({ path: path.join(OUTPUT, "probe.js") });
  await page.waitForFunction(() => Boolean(window.dragPhase1Probe));
  const settle = () => page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const snapshot = () => page.evaluate(() => window.dragPhase1Probe.snapshot());
  const reset = async (scene) => { await page.mouse.reset(); await page.evaluate((value) => window.dragPhase1Probe.reset(value), scene); await settle(); };
  const drag = async (id, dx, dy, zoom = 1, release = true, steps = 10) => {
    const state = await snapshot(), point = state.nodes[id].screen;
    await page.mouse.move(point.x, point.y);
    await page.mouse.down();
    // Gallery starts native dragging after its own press-intent threshold; the
    // initial threshold sample is not a movement sample. Cross it horizontally
    // before measuring a requested stage delta (the production behavior stays intact).
    const galleryThreshold = state.objects.find((object) => object.id === id)?.tipo === "galeria" ? 6 : 0;
    if (galleryThreshold) await page.mouse.move(point.x + galleryThreshold, point.y);
    await page.mouse.move(point.x + galleryThreshold + dx * zoom, point.y + dy * zoom, { steps });
    await settle();
    const during = await snapshot();
    if (release) { await page.mouse.up(); await settle(); }
    return during;
  };
  const near = (actual, expected, label, tolerance = 0.1) => assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: ${actual} versus ${expected}`);
  const record = async (label) => { const state = await snapshot(); evidence.push({ label, ...state }); return state; };
  try {
    await t.test("group leader and follower each commit one following individual gesture", async () => {
      for (const id of ["a", "b"]) {
        await reset({ objects: [base("a"), base("b", { x: 300, y: 150 })], selected: ["a", "b"] });
        await drag("a", 30, 40);
        let state = await record(`group-before-individual-${id}`);
        assert.equal(state.commits.length, 2);
        const previous = state.objects.find((object) => object.id === id);
        await page.evaluate((selected) => window.dragPhase1Probe.select([selected]), id);
        await drag(id, 55, 25);
        state = await record(`group-then-individual-${id}`);
        assert.equal(state.commits.length, 3);
        near(state.nodes[id].canonical.x, previous.x + 55, `${id} visual x`);
        near(state.persisted.find((object) => object.id === id).x, previous.x + 55, `${id} persisted x`);
      }
    });
    await t.test("rejected drop restores React, node and persistible pose in fijo/pantalla including text offset", async () => {
      for (const mode of ["fijo", "pantalla"]) for (const type of ["forma", "texto"]) {
        const object = base("rejected", { tipo: type, x: 100, y: 40, ...(mode === "pantalla" ? { yNorm: 0.08 } : {}) });
        await reset({ objects: [object], selected: [object.id], sections: [
          { id: "prefix", altura: 120, orden: 0 },
          { id: "s1", altura: 500, altoModo: mode, orden: 1 },
          { id: "locked", altura: 500, bloqueada: true, orden: 2 },
        ] });
        await drag(object.id, 60, 540);
        const state = await record(`rejected-${mode}-${type}`);
        assert.equal(state.commits.length, 1);
        near(state.nodes[object.id].canonical.x, 100, "restored x");
        near(state.nodes[object.id].canonical.y, 160, "restored stage y");
        assert.equal(state.objects[0].seccionId, "s1");
        near(state.persisted[0].x, 100, "persistible x");
        near(mode === "pantalla" ? state.persisted[0].yNorm * 500 : state.persisted[0].y, 40, "persistible section y");
        assert.deepEqual(state.transformer.nodes, [object.id]);
      }
    });
    await t.test("vertical and inverted zero endpoints snap their painted center to section", async () => {
      for (const points of [[0, 0, 0, 100], [100, 0, 0, 0], [0, 100, 0, 0], [0, 0, 100, 0]]) {
        const centerX = (points[0] + points[2]) / 2;
        await reset({ objects: [base("line", { figura: "line", x: 330 - centerX, y: 180, points })], selected: ["line"], guides: true });
        const during = await drag("line", 66, 30);
        evidence.push({ label: `line-${points.join(",")}`, ...during });
        near(during.nodes.line.rect.x + during.nodes.line.rect.width / 2, 400, "painted line center");
        assert.ok(during.lines.some((line) => line.priority === "seccion" && line.points[0] === 400 && line.points[2] === 400));
      }
    });
    await t.test("real Gallery frame supplies dragged and target guide anchors at CSS zoom", async () => {
      for (const [layout, zoom] of [["two_by_n", 1], ["grid_1x2", 0.6]]) {
        const gallery = base("gallery", { tipo: "galeria", width: 300, height: 40, x: 50, y: 100, currentLayout: layout, defaultLayout: layout, allowedLayouts: [layout], rows: 2, cols: 2, gap: 8, cells: Array.from({ length: 4 }, () => ({ bg: "#ddcaeb" })) });
        await reset({ objects: [gallery], selected: ["gallery"], guides: true, zoom });
        let state = await snapshot();
        const frameHeight = state.nodes.gallery.rect.height;
        assert.ok(frameHeight > gallery.height + 20, "fixture retains stale persisted height");
        const during = await drag("gallery", 45, 500 - frameHeight / 2 - gallery.y - 2, zoom, false);
        evidence.push({ label: `gallery-drag-${layout}`, ...during });
        near(during.nodes.gallery.rect.y + during.nodes.gallery.rect.height / 2, 500, "gallery dragged frame center");
        await page.screenshot({ path: path.join(OUTPUT, `gallery-drag-${layout}.png`) });
        await page.mouse.up();
        await settle();
        await reset({ objects: [gallery, base("target", { x: 570, y: gallery.y + frameHeight / 2 - 25 + 55 })], selected: ["target"], guides: true, zoom });
        // Land near center directly: traversing an edge first legitimately locks
        // that other anchor under the unchanged production hysteresis.
        const targetDuring = await drag("target", -35, -52, zoom, false, 1);
        evidence.push({ label: `gallery-reference-${layout}`, ...targetDuring });
        near(targetDuring.nodes.target.rect.y + targetDuring.nodes.target.rect.height / 2, gallery.y + frameHeight / 2, "target aligns to gallery frame center");
        await page.screenshot({ path: path.join(OUTPUT, `gallery-reference-${layout}.png`) });
        await page.mouse.up();
        await settle();
      }
    });
    if (PHASE2) {
      await t.test("rotated text authority matches live geometry with offsets, scales, parents and stage/CSS transforms", async () => {
        const variants = [
          ...[0, 45, 90, 180, -30].map((rotation) => ({ rotation })),
          { rotation: 45, offsetX: -30, offsetY: 15, scaleX: 1.4, scaleY: 0.6 },
          { rotation: -30, offsetX: 65, offsetY: -20, scaleX: -1.2, scaleY: 1.3, testParent: { x: 70, y: 140, rotation: 25, scaleX: 0.8, scaleY: 1.1 } },
          { rotation: 90, text: "Primera línea\nSegunda línea", height: 80, align: "right", testParent: { x: -20, y: 60, rotation: -15 } },
          { rotation: 0, text: "", width: "auto", height: "auto", offsetX: 35, offsetY: 12, testParent: { x: 70, y: 140, rotation: 25, scaleX: 1.2 } },
          { rotation: 0, testParent: { x: 70, y: 140, rotation: 45 } },
          { rotation: 0, testStageTransform: { x: 25, y: 30 }, testZoom: 1, expectedProjectedBoxLayout: false },
        ];
        for (const [index, variant] of variants.entries()) {
          await reset({ objects: [base("rotated", { tipo: "texto", x: 300, y: 240, width: 200, height: 40, offsetX: 100, ...variant })],
            ...(index >= 6 ? { zoom: variant.testZoom ?? 0.6, stageTransform: variant.testStageTransform ?? { x: 25, y: 30, scaleX: 1.2, scaleY: 0.9 } } : {}) });
          const state = await record(`text-authority-matrix-${index}`);
          for (const key of ["x", "y", "width", "height"]) {
            near(state.nodes.rotated.authority[key], state.nodes.rotated.rect[key], `case${index} ${key}`);
            near(state.nodes.rotated.inlineProjection[key], state.nodes.rotated.viewportRect[key], `case${index} inline ${key}`);
            near(state.nodes.rotated.domMatrixRect[key], state.nodes.rotated.viewportRect[key], `case${index} DOM matrix ${key}`);
          }
          if (variant.testParent && variant.rotation === 0) {
            assert.equal(state.nodes.rotated.overlayBounds.kind, "polygon", "live overlay keeps inherited text rotation");
          }
          if (variant.expectedProjectedBoxLayout !== undefined) {
            assert.equal(state.nodes.rotated.canUseProjectedBoxLayout, variant.expectedProjectedBoxLayout, "stage-only translation selects the complete DOM matrix path");
          }
          if (state.nodes.rotated.overlayBounds?.kind === "polygon") {
            state.nodes.rotated.overlayBounds.points.forEach((point, pointIndex) => {
              near(point, state.nodes.rotated.authorityPoints[pointIndex], `case${index} overlay point${pointIndex}`);
            });
          }
          if (variant.text === "") {
            assert.equal(state.nodes.rotated.measuredSize.width, 0, "empty auto-width Text has a measured zero, not missing geometry");
            assert.equal(state.nodes.rotated.inlineSource, "authoritative-text-rect");
            assert.equal(state.nodes.rotated.inlineTransform.length, 6);
            assert.ok(state.nodes.rotated.inlineTransform.every(Number.isFinite));
            near(state.nodes.rotated.canonical.x, 300, "empty text retains canonical x");
            near(state.nodes.rotated.canonical.y, 240, "empty text retains canonical y");
            assert.equal(state.commits.length, 0, "projection does not write canonical state");
          }
        }
      });
      await t.test("rotated text dragged and used as target shows guides at its painted center", async () => {
        for (const zoom of [1, 0.6]) {
          await reset({ objects: [base("rotated", { tipo: "texto", x: 240, y: 240, width: 200, height: 40, offsetX: 100, rotation: 90 })], selected: ["rotated"], guides: true, zoom });
          const during = await drag("rotated", 76, 30, zoom, false, 1);
          evidence.push({ label: `rotated-text-drag-${zoom}`, ...during });
          near(during.nodes.rotated.rect.x + during.nodes.rotated.rect.width / 2, 400, "rotated painted center at section");
          assert.ok(during.lines.some((line) => line.points[0] === 400 && line.points[2] === 400));
          await page.screenshot({ path: path.join(OUTPUT, `rotated-text-drag-${zoom}.png`) });
          await page.mouse.up(); await settle();
          let ended = await record(`rotated-text-release-${zoom}`);
          assert.equal(ended.lines.length, 0, "release clears guides");
          near(ended.nodes.rotated.authority.x, ended.nodes.rotated.rect.x, "post-commit geometry stays aligned");
          assert.deepEqual(ended.transformer.nodes, ["rotated"]);

          await reset({ objects: [base("rotated", { tipo: "texto", x: 140, y: 180, width: 200, height: 40, offsetX: 100, rotation: 90 }), base("moving", { x: 500, y: 240 })], selected: ["moving"], guides: true, zoom });
          const reference = await drag("moving", -30, -82, zoom, false, 1);
          evidence.push({ label: `rotated-text-reference-${zoom}`, ...reference });
          near(reference.nodes.moving.rect.y + reference.nodes.moving.rect.height / 2, 180, "reference text center");
          assert.ok(reference.lines.some((line) => line.points[1] === 180 && line.points[3] === 180));
          await page.screenshot({ path: path.join(OUTPUT, `rotated-text-reference-${zoom}.png`) });
          await page.mouse.up(); await settle();
          ended = await snapshot();
          assert.equal(ended.lines.length, 0);
        }
      });
      await t.test("cached target position, size and node identity update within and between guide sessions", async () => {
        await reset({ objects: [base("target", { x: 100, y: 150 }), base("moving", { x: 300, y: 350, width: 40, height: 40 })], selected: ["moving"], guides: true });
        await page.evaluate(() => { window.dragPhase1Probe.prepareGuides("moving"); window.dragPhase1Probe.evaluateGuides("moving", { x: 183, y: 151 }); });
        let state = await record("cache-initial-lock");
        near(state.nodes.moving.position.x, 180, "original target edge");
        await page.evaluate(() => { window.dragPhase1Probe.mutateNode("target", { x: 250 }); window.dragPhase1Probe.evaluateGuides("moving", { x: 183, y: 151 }); });
        state = await record("cache-target-moved-lock-release");
        near(state.nodes.moving.position.x, 183, "obsolete target lock is released");
        await page.evaluate(() => window.dragPhase1Probe.evaluateGuides("moving", { x: 333, y: 151 }));
        state = await record("cache-target-moved-new-edge");
        near(state.nodes.moving.position.x, 330, "live moved edge");
        await page.evaluate(() => { window.dragPhase1Probe.clearGuides(); window.dragPhase1Probe.mutateNode("target", { width: 120 }); window.dragPhase1Probe.prepareGuides("moving"); window.dragPhase1Probe.evaluateGuides("moving", { x: 373, y: 151 }); });
        state = await record("cache-new-session-width");
        near(state.nodes.moving.position.x, 370, "width refreshed between sessions");
        const oldNodeId = state.nodes.target.nodeId;
        await page.evaluate(() => { window.dragPhase1Probe.replaceNode("target", { x: 200, width: 100 }); window.dragPhase1Probe.evaluateGuides("moving", { x: 303, y: 151 }); });
        state = await record("cache-replaced-node");
        assert.notEqual(state.nodes.target.nodeId, oldNodeId);
        near(state.nodes.moving.position.x, 300, "new ref with same object id");
        await page.evaluate(() => { window.dragPhase1Probe.mutateNode("target", { visible: false }); window.dragPhase1Probe.evaluateGuides("moving", { x: 303, y: 151 }); });
        state = await record("cache-hidden-target");
        near(state.nodes.moving.position.x, 303, "hidden target does not keep its lock");
        assert.equal(state.lines.length, 0, "hidden only reference leaves no residual guides");
        await page.evaluate(() => window.dragPhase1Probe.clearGuides());
      });
      await t.test("moving a snap target during an actual mouse drag releases its obsolete lock", async () => {
        await reset({ objects: [base("target", { x: 100, y: 150 }), base("moving", { x: 300, y: 151, width: 40, height: 40 })], selected: ["moving"], guides: true });
        const initial = await snapshot();
        const during = await drag("moving", -117, 0, 1, false, 1);
        near(during.nodes.moving.position.x, 180, "mouse drag locks original edge");
        await page.evaluate(() => window.dragPhase1Probe.mutateNode("target", { x: 250 }));
        await page.mouse.move(initial.nodes.moving.screen.x - 116, initial.nodes.moving.screen.y);
        await settle();
        const changed = await record("mouse-drag-target-mutation");
        near(changed.nodes.moving.position.x, 184, "next mouse sample is not held at obsolete edge");
        await page.screenshot({ path: path.join(OUTPUT, "mouse-drag-target-mutation.png") });
        await page.mouse.up(); await settle();
        const ended = await record("mouse-drag-target-mutation-release");
        assert.equal(ended.commits.length, 1);
        near(ended.persisted.find((object) => object.id === "moving").x, 184, "actual release commits final position");
        assert.equal(ended.lines.length, 0);
      });
      await t.test("late local font remeasurement invalidates a target without changing objects", async () => {
        await reset({ objects: [base("font-target", { tipo: "texto", x: 60, y: 150, width: "auto", height: "auto", text: "MMMMMMMM", fontFamily: "Phase2LateFont, monospace", fontSize: 28, offsetX: 0 }), base("moving", { x: 450, y: 350, width: 40, height: 40 })], guides: true });
        await page.evaluate(() => window.dragPhase1Probe.prepareGuides("moving"));
        const before = await record("font-before-load");
        assert.equal(await page.evaluate(() => window.dragPhase1Probe.loadLocalFont("font-target")), "loaded");
        const loaded = await record("font-after-load");
        assert.ok(Math.abs(loaded.nodes["font-target"].rect.width - before.nodes["font-target"].rect.width) > 10, "local font must change actual Konva measurement");
        const edge = loaded.nodes["font-target"].rect.x + loaded.nodes["font-target"].rect.width;
        await page.evaluate((x) => window.dragPhase1Probe.evaluateGuides("moving", { x: x + 3, y: 151 }), edge);
        const aligned = await record("font-after-load-target-alignment");
        near(aligned.nodes.moving.position.x, edge, "guide uses measured font width");
        await page.screenshot({ path: path.join(OUTPUT, "late-font-target.png") });
        await page.evaluate(() => window.dragPhase1Probe.clearGuides());
        assert.equal((await snapshot()).lines.length, 0);
      });
      await t.test("Gallery layout change updates a warmed target in the same guide session", async () => {
        await reset({ objects: [base("gallery", { tipo: "galeria", x: 60, y: 100, width: 300, height: 40, currentLayout: "grid_1x2", allowedLayouts: ["grid_1x2", "grid_2x1"], gap: 8, cells: [{}, {}] }), base("moving", { x: 500, y: 300, width: 40, height: 40 })], guides: true });
        await page.evaluate(() => window.dragPhase1Probe.prepareGuides("moving"));
        const before = await record("gallery-layout-before");
        await page.evaluate(() => window.dragPhase1Probe.changeGalleryLayout("gallery", "grid_2x1"));
        const changed = await record("gallery-layout-after");
        assert.equal(changed.nodes.gallery.nodeId, before.nodes.gallery.nodeId, "layout does not replace root node");
        assert.ok(Math.abs(changed.nodes.gallery.rect.height - before.nodes.gallery.rect.height) > 100);
        const center = changed.nodes.gallery.rect.y + changed.nodes.gallery.rect.height / 2;
        await page.evaluate((y) => window.dragPhase1Probe.evaluateGuides("moving", { x: 500, y: y - 20 + 3 }), center);
        const aligned = await record("gallery-layout-target-alignment");
        near(aligned.nodes.moving.rect.y + aligned.nodes.moving.rect.height / 2, center, "changed Gallery center");
        await page.screenshot({ path: path.join(OUTPUT, "changed-gallery-target.png") });
        await page.evaluate(() => window.dragPhase1Probe.clearGuides());
      });
    }
    assert.deepEqual(errors, []);
    assert.deepEqual(outbound, []);
    await page.screenshot({ path: path.join(OUTPUT, "final-scene.png") });
  } finally {
    writeFileSync(path.join(OUTPUT, "evidence.json"), JSON.stringify({ node: process.versions.node, browser: browserVersion, errors, outbound, evidence }, null, 2));
  }
});
