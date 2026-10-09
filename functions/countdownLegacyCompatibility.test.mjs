import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { existsSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import { JSDOM } from "jsdom";
import { COUNTDOWN_PRESETS } from "../src/config/countdownPresets.js";
import { resolveCountdownLayoutMetrics } from "../shared/countdownLayoutContract.js";
import { buildPreviewFrameSrcDoc } from "../src/components/preview/previewFrameRuntime.js";

const require = createRequire(import.meta.url);
const { generarHTMLDesdeObjetos } = require("./lib/utils/generarHTMLDesdeObjetos.js");
const { generarHTMLDesdeSecciones } = require("./lib/utils/generarHTMLDesdeSecciones.js");
const NOW = Date.parse("2030-06-15T12:00:00.000Z");
const TARGET = "2030-06-17T15:04:05.000Z";
const SECTIONS = [{ id: "legacy-section", orden: 0, altoModo: "fijo", altura: 680, fondo: "#ffffff" }];
const VALUES = { days: "02", hours: "03", minutes: "04", seconds: "05" };

function countdown(overrides = {}) {
  return {
    id: "legacy-countdown", tipo: "countdown", seccionId: SECTIONS[0].id,
    fechaObjetivo: TARGET, x: 210, y: 100, width: 380, height: 120,
    fontFamily: "Arial, sans-serif", padZero: true,
    ...overrides,
  };
}

function parseCountdown(object) {
  const dom = new JSDOM(generarHTMLDesdeObjetos([object], SECTIONS));
  return { dom, root: dom.window.document.querySelector("[data-countdown]") };
}

function metric(node, property) {
  const declaration = String(node.getAttribute("style")).split(";")
    .map((part) => part.trim()).find((part) => part.startsWith(`${property}:`));
  const value = declaration?.match(/\*\s*(-?[\d.]+)px\)/);
  assert.ok(value, `${property} must retain a scaled authored metric: ${declaration}`);
  return Number(value[1]);
}

function assertLayout(root, object) {
  const layout = resolveCountdownLayoutMetrics(object);
  assert.equal(root.dataset.countdownContract, "v1");
  assert.equal(root.dataset.mobileCluster, "isolated");
  assert.equal(root.hasAttribute("data-countdown-v2"), false);
  assert.equal(root.dataset.units, layout.visibleUnits.join(","));
  assert.equal(metric(root, "width"), layout.containerW);
  assert.equal(metric(root, "height"), layout.containerH);
  const units = [...root.querySelectorAll(".cd-chip[data-unit]")];
  assert.deepEqual(units.map((node) => node.dataset.unit), layout.visibleUnits);
  units.forEach((node, index) => {
    const expected = layout.unitLayouts[index];
    for (const [property, key] of [["left", "x"], ["top", "y"], ["width", "width"], ["height", "height"]]) {
      assert.equal(metric(node, property), expected[key], `${object.id}: ${expected.unit} ${property}`);
    }
  });
  const separators = [...root.querySelectorAll(".cd-separator")];
  assert.equal(separators.length, layout.separatorLayouts.length);
  separators.forEach((node, index) => {
    assert.equal(node.textContent, layout.separatorText);
    assert.equal(node.getAttribute("aria-hidden"), "true");
    for (const [property, key] of [["left", "x"], ["top", "y"], ["width", "width"]]) {
      assert.equal(metric(node, property), layout.separatorLayouts[index][key]);
    }
  });
  return layout;
}

for (const preset of COUNTDOWN_PRESETS) {
  test(`legacy preset ${preset.id} preserves its snapshot and shared unit/separator geometry`, () => {
    const object = countdown({ ...preset.props, presetId: preset.id });
    const before = structuredClone(object);
    const { dom, root } = parseCountdown(object);
    try {
      assertLayout(root, object);
      assert.equal(root.dataset.preset, preset.id);
      assert.equal(root.querySelectorAll(".cd-lab").length, object.showLabels === false ? 0 : 4);
      assert.deepEqual(object, before, "rendering must not migrate the stored object or preset");
      assert.equal(Object.hasOwn(object, "countdownSchemaVersion"), false);
    } finally { dom.window.close(); }
  });
}

test("legacy units honor order, decimal gaps, and centered/grid/vertical/editorial layouts", () => {
  for (const distribution of ["centered", "grid", "vertical", "editorial"]) {
    const object = countdown({
      countdownSchemaVersion: 1, visibleUnits: ["seconds", "days", "hours"],
      distribution, gap: 27.5, separator: "::", separatorColor: "#773dbe",
      fontSize: 27, chipWidth: 46, paddingX: 8,
    });
    const { dom, root } = parseCountdown(object);
    try { assertLayout(root, object); } finally { dom.window.close(); }
  }
});

test("legacy target aliases, identity, labels, and paint overrides remain intact", () => {
  for (const sourceField of ["fechaObjetivo", "targetISO", "fechaISO"]) {
    const object = countdown({
      fechaObjetivo: undefined, [sourceField]: TARGET, countdownSchemaVersion: 1,
      labels: { dias: "Días propios", horas: "Hs", min: "M", seg: "S" },
      colorTexto: "#123456", color: "#abcdef", fontWeight: 500,
      chipBackground: "#fedcba", boxBg: "#000000", chipBorder: "#654321", chipRadius: 13,
      boxShadow: true, rotation: 9, scaleX: 1.2, scaleY: 1.2,
    });
    const before = structuredClone(object);
    const { dom, root } = parseCountdown(object);
    try {
      assert.equal(root.dataset.target, TARGET);
      assert.equal(root.dataset.countdownTargetSource, sourceField);
      assert.equal(root.dataset.countdownContract, "v1");
      assert.deepEqual([...root.querySelectorAll(".cd-lab")].map((node) => node.textContent), Object.values(object.labels));
      assert.match(root.querySelector(".cd-val").getAttribute("style"), /#123456/);
      assert.match(root.querySelector(".cd-val").getAttribute("style"), /font-weight:\s*500/);
      const chipStyle = root.querySelector(".cd-chip").getAttribute("style");
      assert.match(chipStyle, /#fedcba/);
      assert.match(chipStyle, /#654321/);
      assert.match(chipStyle, /13px/);
      assert.match(chipStyle, /box-shadow:\s*0/);
      assert.deepEqual(object, before);
    } finally { dom.window.close(); }
  }
});

test("legacy labels and separators remain escaped as text", () => {
  const object = countdown({
    separator: "<img src=x>",
    labels: { dias: "<script>alert(1)</script>", horas: "Horas", min: "Min", seg: "Seg" },
  });
  const { dom, root } = parseCountdown(object);
  try {
    assert.equal(root.querySelectorAll("script,img").length, 0);
    assert.equal(root.querySelector(".cd-lab").textContent, object.labels.dias);
    assert.equal(root.querySelector(".cd-separator").textContent, object.separator);
  } finally { dom.window.close(); }
});

function createClockHarness(objects, historicalMarkup = "") {
  const html = generarHTMLDesdeSecciones(SECTIONS, objects, null, {});
  const source = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)]
    .map((match) => match[1]).find((script) => script.includes("function diffParts(target)"));
  assert.ok(source, "generated HTML must include the real countdown runtime");
  const dom = new JSDOM(historicalMarkup || generarHTMLDesdeObjetos(objects, SECTIONS));
  let now = NOW;
  let tick;
  class FrozenDate extends Date {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return now; }
  }
  runInNewContext(source, {
    document: dom.window.document,
    window: { __COUNTDOWN_ANIMATIONS_ENABLED: false },
    Date: FrozenDate,
    setInterval(callback) { tick = callback; return 1; },
  });
  dom.window.document.dispatchEvent(new dom.window.Event("DOMContentLoaded"));
  return {
    dom,
    values: () => [...dom.window.document.querySelectorAll(".cd-val")].map((node) => node.textContent),
    advance(timestamp) { now = timestamp; tick(); },
  };
}

test("v1 declared units tick by identity and freeze at zero after expiration", () => {
  const harness = createClockHarness([countdown({ visibleUnits: ["seconds", "days"] })]);
  try {
    assert.deepEqual(harness.values(), ["05", "02"]);
    harness.advance(NOW + 1000);
    assert.deepEqual(harness.values(), ["04", "02"]);
    harness.advance(Date.parse(TARGET) + 1);
    assert.deepEqual(harness.values(), ["00", "00"]);
  } finally { harness.dom.window.close(); }
});

test("v1 runtime retains positional fallback for previously generated four-unit markup", () => {
  const markup = `<div data-countdown data-countdown-contract="v1" data-target="${TARGET}">${"<span class='cd-val'>00</span>".repeat(4)}</div>`;
  const harness = createClockHarness([countdown()], markup);
  try {
    assert.deepEqual(harness.values(), ["02", "03", "04", "05"]);
    harness.advance(Date.parse(TARGET));
    assert.deepEqual(harness.values(), ["00", "00", "00", "00"]);
  } finally { harness.dom.window.close(); }
});

test("missing, invalid, and expired targets stay at zero in both countdown schemas", () => {
  for (const countdownSchemaVersion of [1, 2]) {
    for (const fechaObjetivo of [undefined, "not-a-date", "2029-01-01T00:00:00.000Z"]) {
      const harness = createClockHarness([countdown({ countdownSchemaVersion, fechaObjetivo, visibleUnits: ["seconds", "days"] })]);
      try { assert.deepEqual(harness.values(), ["00", "00"]); } finally { harness.dom.window.close(); }
    }
  }
});

test("modern declared units retain their order and running clock", () => {
  const harness = createClockHarness([countdown({ countdownSchemaVersion: 2, visibleUnits: ["seconds", "days"] })]);
  try {
    assert.deepEqual(harness.values(), ["05", "02"]);
    harness.advance(NOW + 1000);
    assert.deepEqual(harness.values(), ["04", "02"]);
  } finally { harness.dom.window.close(); }
});

test("offline browser preserves legacy geometry and clocks in desktop/mobile preview and publish", {
  skip: process.env.COUNTDOWN_LEGACY_BROWSER !== "1" ? "Set COUNTDOWN_LEGACY_BROWSER=1 for offline Chromium verification." : false,
  timeout: 120_000,
}, async (t) => {
  const { default: puppeteer } = await import("puppeteer");
  const isolatedChrome = fileURLToPath(new URL("../.local-isolation/tool-cache/browser/chrome/win64-138.0.7204.157/chrome-win64/chrome.exe", import.meta.url));
  const browser = await puppeteer.launch({
    headless: true,
    ...(existsSync(isolatedChrome) ? { executablePath: isolatedChrome } : {}),
    args: ["--no-sandbox", "--disable-gpu", "--disable-background-networking"],
  });
  t.after(() => browser.close());
  const artifactDirectory = fileURLToPath(new URL("../.local-isolation/countdown-compat/", import.meta.url));
  mkdirSync(artifactDirectory, { recursive: true });
  const objects = ["neon", "ocean"].map((presetId, index) => countdown({
    ...COUNTDOWN_PRESETS.find((preset) => preset.id === presetId).props,
    id: presetId, presetId, y: 80 + index * 190, fontFamily: "Arial, sans-serif",
  }));
  objects.push(countdown({ id: "reordered", y: 460, visibleUnits: ["seconds", "days"], separator: ":", gap: 27.5 }));
  const frozenClock = `<script>Date.now=function(){return ${NOW}};window.__COUNTDOWN_ANIMATIONS_ENABLED=false;</script>`;
  for (const { width, mode } of [
    { width: 1280, mode: "fijo" }, { width: 390, mode: "fijo" },
    { width: 1280, mode: "pantalla" }, { width: 390, mode: "pantalla" },
  ]) {
    const sections = SECTIONS.map((section) => ({ ...section, altoModo: mode }));
    const renderObjects = objects.map((object, index) => ({ ...object, yNorm: 0.1 + index * 0.3 }));
    const snapshots = [];
    for (const isPreview of [false, true]) {
      const page = await browser.newPage();
      try {
        await page.setViewport({ width, height: 844, deviceScaleFactor: 1, isMobile: width < 768 });
        await page.setRequestInterception(true);
        page.on("request", (request) => {
          if (/^(data:|about:)/.test(request.url())) request.continue();
          else request.abort();
        });
        const errors = [];
        page.on("pageerror", (error) => errors.push(error.message));
        let html = generarHTMLDesdeSecciones(sections, renderObjects, null, { isPreview });
        html = html.replace(/<head([^>]*)>/i, `<head$1>${frozenClock}`);
        let target = page;
        if (isPreview) {
          await page.setContent(`<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body style="margin:0"><iframe id="preview" style="display:block;border:0;width:${width}px;height:844px"></iframe></body></html>`);
          const srcDoc = buildPreviewFrameSrcDoc(html, { previewViewport: width < 768 ? "mobile" : "desktop", layoutMode: "parity" });
          await page.$eval("#preview", (iframe, source) => { iframe.srcdoc = source; }, srcDoc);
          target = await (await page.$("#preview")).contentFrame();
        } else {
          await page.setContent(html, { waitUntil: "domcontentloaded" });
        }
        await target.waitForFunction(() => globalThis.document.querySelector(".cd-val")?.textContent === "02");
        await target.evaluate(async () => {
          await globalThis.document.fonts.ready;
          await new Promise((resolve) => setTimeout(resolve, 2000));
        });
        const snapshot = await target.evaluate(() => [...globalThis.document.querySelectorAll("[data-countdown]")].map((root) => {
          const bounds = root.getBoundingClientRect();
          const geometry = (node) => {
            const rect = node.getBoundingClientRect();
            return { x: rect.left - bounds.left, y: rect.top - bounds.top, width: rect.width, height: rect.height };
          };
          return {
            width: bounds.width, height: bounds.height,
            left: bounds.left, right: bounds.right,
            units: [...root.querySelectorAll(".cd-chip")].map((node) => ({ ...geometry(node), unit: node.dataset.unit, value: node.querySelector(".cd-val").textContent })),
            separators: [...root.querySelectorAll(".cd-separator")].map(geometry),
          };
        }));
        assert.deepEqual(errors, [], "no generated-runtime errors");
        assert.equal(snapshot.length, objects.length);
        snapshot.forEach((actual, objectIndex) => {
          const expected = resolveCountdownLayoutMetrics(objects[objectIndex]);
          const scale = actual.width / expected.containerW;
          assert.ok(actual.left >= -1 && actual.right <= width + 1, "countdown remains within the viewport");
          assert.equal(actual.units.length, expected.unitLayouts.length);
          actual.units.forEach((unit, index) => {
            assert.equal(unit.unit, expected.unitLayouts[index].unit);
            assert.equal(unit.value, VALUES[unit.unit]);
            for (const property of ["x", "y", "width", "height"]) {
              assert.ok(Math.abs(unit[property] - expected.unitLayouts[index][property] * scale) < 1, `${width} ${objects[objectIndex].id} ${unit.unit} ${property}`);
            }
          });
          assert.equal(actual.separators.length, expected.separatorLayouts.length);
          actual.separators.forEach((separator, index) => {
            for (const property of ["x", "y", "width"]) {
              assert.ok(Math.abs(separator[property] - expected.separatorLayouts[index][property] * scale) < 1, `${width} separator ${property}`);
            }
          });
        });
        snapshots.push(snapshot);
        await page.screenshot({ path: `${artifactDirectory}/${isPreview ? "preview" : "publish"}-${mode}-${width}.png`, fullPage: true });
      } finally { await page.close(); }
    }
    snapshots[0].forEach((publish, index) => {
      const preview = snapshots[1][index];
      for (const property of ["width", "height"]) assert.ok(Math.abs(publish[property] - preview[property]) < 1, `${width} preview/publish ${property}`);
      publish.units.forEach((unit, unitIndex) => {
        for (const property of ["x", "y", "width", "height"]) assert.ok(Math.abs(unit[property] - preview.units[unitIndex][property]) < 1, `${width} preview/publish unit ${property}`);
      });
    });
  }
});
