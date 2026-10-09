import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const require = createRequire(import.meta.url);
const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const SUPPORT = fileURLToPath(new URL("./testSupport/", import.meta.url));

async function buildProbe(outputDirectory) {
  const webpackPackage = require("next/dist/compiled/webpack/webpack");
  webpackPackage.init();
  const compiler = webpackPackage.webpack({
    mode: "development", target: "web", devtool: false,
    entry: path.join(SUPPORT, "googleMapTransformerBrowser.mjs"),
    output: { path: outputDirectory, filename: "probe.js" },
    optimization: { minimize: false },
    resolve: {
      extensions: [".js", ".jsx", ".mjs"],
      alias: {
        "@/domain/countdownAudit/runtime$": path.join(SUPPORT, "googleMapTransformerAuditStub.js"),
        "@": path.join(ROOT, "src"),
      },
    },
    module: { rules: [{ test: /\.jsx$/, exclude: /node_modules/, use: path.join(SUPPORT, "googleMapTransformerJsxLoader.cjs") }] },
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

function near(actual, expected, label, tolerance = 1.1) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: expected ${expected}, got ${actual}`);
}

test("real map Transformer mouse and touch gestures clamp each axis and stay usable after commit", {
  skip: process.env.MAP_TRANSFORMER_BROWSER !== "1" ? "Set MAP_TRANSFORMER_BROWSER=1 for offline mouse and touch regression." : false,
  timeout: 180_000,
}, async (t) => {
  const outputDirectory = path.join(ROOT, ".local-isolation/map-transformer-regression");
  mkdirSync(outputDirectory, { recursive: true });
  await buildProbe(outputDirectory);
  t.diagnostic("Offline Transformer bundle compiled.");
  const { default: puppeteer } = await import("puppeteer");
  const chrome = path.join(ROOT, ".local-isolation/tool-cache/browser/chrome/win64-138.0.7204.157/chrome-win64/chrome.exe");
  const browser = await puppeteer.launch({
    headless: true,
    ...(existsSync(chrome) ? { executablePath: chrome } : {}),
    args: ["--no-sandbox", "--disable-background-networking", "--disable-gpu"],
  });
  t.after(() => browser.close());
  let page = await browser.newPage();
  const errors = [];
  const outbound = [];
  const evidence = [];
  const mount = async (viewport) => {
    await page.setViewport(viewport);
    await page.setRequestInterception(true);
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("request", (request) => {
      if (/^(data:|about:)/.test(request.url())) request.continue();
      else { outbound.push(request.url()); request.abort(); }
    });
    await page.setContent('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><body style="margin:0;background:white"><div id="app"></div></body>');
    await page.addScriptTag({ path: path.join(outputDirectory, "probe.js") });
    await page.waitForFunction(() => {
      const state = globalThis.googleMapTransformerProbe?.snapshot();
      return state?.hasImage && state.transformer?.nodes.length === 1;
    });
  };
  await mount({ width: 1120, height: 860, deviceScaleFactor: 1 });
  const snapshot = () => page.evaluate(() => globalThis.googleMapTransformerProbe.snapshot());
  const settle = () => page.evaluate(async () => {
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    await new Promise((resolve) => setTimeout(resolve, 80));
  });
  const record = async (label) => { const state = await snapshot(); evidence.push({ label, ...state }); return state; };
  const reset = async (patch = {}) => {
    await page.evaluate((value) => globalThis.googleMapTransformerProbe.reset(value), patch);
    await settle();
  };
  const press = async (name) => {
    const state = await snapshot();
    const point = state.anchors[name];
    assert.ok(point?.visible, `${name} must be visible and interactive`);
    await page.mouse.move(point.x, point.y);
    await page.mouse.down();
    return { point, angle: state.object.rotation * Math.PI / 180, scaleX: state.screenScaleX, scaleY: state.screenScaleY };
  };
  const move = async (gesture, dx, dy) => {
    const { point, angle, scaleX, scaleY } = gesture;
    await page.mouse.move(
      point.x + (dx * Math.cos(angle) - dy * Math.sin(angle)) * scaleX,
      point.y + (dx * Math.sin(angle) + dy * Math.cos(angle)) * scaleY,
      { steps: 8 }
    );
    await settle();
  };
  const release = async (label = "mouse-release", dispatch = () => page.mouse.up()) => {
    await page.evaluate(() => globalThis.googleMapTransformerProbe.startReleaseCapture());
    await dispatch();
    const samples = await page.evaluate(() => globalThis.googleMapTransformerProbe.finishReleaseCapture());
    evidence.push({ label: `${label}-release-paints`, samples });
    const paints = samples.filter((sample) => sample.kind === "paint" && sample.target);
    assert.ok(paints.length > 0, `${label} must observe an actual Layer.drawScene after commit`);
    assert.ok(samples.filter((sample) => sample.kind === "frame").length >= 3, `${label} observes successive animation frames`);
    for (const [index, paint] of paints.entries()) {
      near(paint.image.width, paint.target.width, `${label} paint${index} image width`, 0.01);
      near(paint.image.height, paint.target.height, `${label} paint${index} image height`, 0.01);
      assert.equal(paint.border?.visible, true, `${label} paint${index} keeps the selected border visible`);
      near(paint.border.width, paint.target.width, `${label} paint${index} border width`, 0.01);
      near(paint.border.height, paint.target.height, `${label} paint${index} border height`, 0.01);
      near(paint.border.transform[4], paint.target.x, `${label} paint${index} border x`, 0.01);
      near(paint.border.transform[5], paint.target.y, `${label} paint${index} border y`, 0.01);
    }
    await settle();
  };
  const assertCommitted = (state, label) => {
    near(state.node.scaleX, 1, `${label} scaleX`, 0.0001);
    near(state.node.scaleY, 1, `${label} scaleY`, 0.0001);
    near(state.node.width, state.object.width, `${label} reconciled width`, 0.0001);
    near(state.node.height, state.object.height, `${label} reconciled height`, 0.0001);
    near(state.transformer.width, state.object.width, `${label} transformer width`);
    near(state.transformer.height, state.object.height, `${label} transformer height`);
    assert.equal(state.transformer.isTransforming, false);
    assert.equal(state.runtimeResizeActive, false, `${label} releases the runtime resize guard`);
  };

  try {
    const initial = await record("initial");
    assert.deepEqual(initial.transformer.enabledAnchors, ["bottom-right"]);

    // This was the reported freeze: an invalid height must not veto width.
    let gesture = await press("bottom-right");
    await move(gesture, -50, -70);
    let state = await record("corner-height-at-min");
    near(state.node.visibleWidth, 311, "width while height clamps");
    near(state.node.visibleHeight, 200, "minimum height");
    await move(gesture, -90, -90);
    state = await record("corner-continue-width-below-height-min");
    near(state.node.visibleWidth, 271, "continuing width with invalid height");
    near(state.node.visibleHeight, 200, "height remains clamped");
    await move(gesture, -90, 60);
    state = await record("corner-recover-height");
    near(state.node.visibleWidth, 271, "width after recovering height");
    near(state.node.visibleHeight, 280, "recovered height");
    await release();
    assertCommitted(await record("corner-final"), "corner");

    await reset();
    gesture = await press("bottom-right"); await move(gesture, 100, 0); await release("horizontal-corner");
    state = await record("horizontal-corner-final");
    near(state.object.width, 461, "horizontal corner width"); near(state.object.height, 220, "horizontal corner preserves height");
    assertCommitted(state, "horizontal corner");
    gesture = await press("bottom-right"); await move(gesture, 0, 80); await release("vertical-corner");
    state = await record("vertical-corner-final");
    near(state.object.width, 461, "vertical corner preserves width"); near(state.object.height, 300, "vertical corner height");
    assertCommitted(state, "vertical corner");
    gesture = await press("bottom-right"); await move(gesture, 40, 20); await release();
    state = await record("repeated-corner-final");
    near(state.object.width, 501, "repeated width"); near(state.object.height, 320, "repeated height");
    assertCommitted(state, "repeated corner");
    assert.equal(state.events.filter((event) => event.kind === "final").length, 3);

    await reset({ x: 700, width: 300, height: 250 });
    gesture = await press("bottom-right");
    await move(gesture, 150, 30);
    const edge = await record("right-stage-edge");
    assert.ok(edge.node.rect.x + edge.node.rect.width <= 1101, "map remains within the right edge");
    await move(gesture, 220, 90);
    state = await record("right-edge-continue-height");
    assert.ok(state.node.rect.x + state.node.rect.width <= 1101);
    assert.ok(state.node.visibleHeight > edge.node.visibleHeight + 40, "height keeps moving after width reaches the stage edge");
    await release();
    assertCommitted(await record("right-edge-final"), "stage edge");

    await reset({ x: 230, y: 180, width: 320, height: 260, rotation: 25 });
    gesture = await press("bottom-right"); await move(gesture, 60, 30); await release();
    state = await record("rotated-final");
    near(state.object.width, 380, "rotated width", 2); near(state.object.height, 290, "rotated height", 2);
    near(state.object.rotation, 25, "rotation preserved", 0.001);
    assertCommitted(state, "rotated");

    await reset();
    await page.evaluate(() => globalThis.googleMapTransformerProbe.setCssZoom(0.65));
    await settle();
    gesture = await press("bottom-right"); await move(gesture, 100, 0); await release("css-zoom");
    state = await record("css-zoom-width-final");
    near(state.object.width, 461, "CSS zoom width", 2); near(state.object.height, 220, "CSS zoom preserves height");
    assertCommitted(state, "CSS zoom");

    await reset({ width: 400, height: 300, scaleX: 0.5, scaleY: 0.5 });
    gesture = await press("bottom-right"); await move(gesture, 40, 0);
    state = await record("legacy-scale-width-preview");
    assert.ok(state.node.visibleWidth > 225, "legacy height below minimum does not freeze width growth");
    await release();
    state = await record("legacy-scale-final");
    near(state.object.width, 240, "legacy final width", 2); near(state.object.height, 200, "legacy final minimum height");
    assertCommitted(state, "legacy scale");
    gesture = await press("bottom-right"); await move(gesture, 40, 0); await release("legacy-repeated");
    state = await record("legacy-repeated-final");
    near(state.object.width, 280, "legacy repeated width", 2);
    assertCommitted(state, "legacy repeated");

    await page.screenshot({ path: path.join(outputDirectory, "desktop-final.png") });

    // Use browser-dispatched touch input and the component's explicit mobile
    // mode. The map retains only its historical corner handle.
    await page.close();
    page = await browser.newPage();
    await mount({ width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
    const touch = await page.createCDPSession();
    for (const [name, dx, dy] of [["bottom-right", 40, 0], ["bottom-right", 0, 40], ["bottom-right", 40, 40]]) {
      await reset({ width: 200, height: 200 });
      await page.evaluate(() => {
        globalThis.googleMapTransformerProbe.setMobile(true);
        globalThis.googleMapTransformerProbe.setCssZoom(0.5);
      });
      await settle();
      state = await record(`mobile-${name}-before`);
      assert.equal(state.isMobile, true);
      assert.deepEqual(state.transformer.enabledAnchors, ["bottom-right"]);
      const point = state.anchors[name];
      assert.ok(point.visible);
      await touch.send("Input.dispatchTouchEvent", {
        type: "touchStart", touchPoints: [{ x: point.x, y: point.y, id: 1, radiusX: 1, radiusY: 1 }],
      });
      await settle();
      const pressed = await record(`mobile-${name}-pressed`);
      assert.equal(pressed.transformer.activeAnchor, name, `${name} touch must select its own anchor, not a neighbor`);
      for (let step = 1; step <= 8; step += 1) {
        await touch.send("Input.dispatchTouchEvent", {
          type: "touchMove", touchPoints: [{
            x: point.x + dx * state.screenScaleX * step / 8,
            y: point.y + dy * state.screenScaleY * step / 8,
            id: 1, radiusX: 1, radiusY: 1,
          }],
        });
      }
      await release(`mobile-corner-${dx}-${dy}`, () => touch.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] }));
      state = await record(`mobile-${name}-final`);
      near(state.object.width, 200 + dx, `${name} mobile width`, 2);
      near(state.object.height, 200 + dy, `${name} mobile height`, 2);
      assertCommitted(state, `mobile ${name}`);
    }
    await touch.detach();
    await page.screenshot({ path: path.join(outputDirectory, "mobile-final.png") });
    assert.deepEqual(errors, [], "real Transformer scene must not throw");
    assert.deepEqual(outbound, [], "the synthetic scene must not request remote resources");
  } finally {
    writeFileSync(path.join(outputDirectory, "evidence.json"), JSON.stringify({ evidence, errors, outbound }, null, 2));
  }
});
