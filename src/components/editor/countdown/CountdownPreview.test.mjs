import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import swc from "next/dist/build/swc/index.js";
import * as countdownUtils from "./countdownUtils.js";
import * as previewScale from "./countdownPreviewScale.js";
import * as renderModel from "../../../domain/countdownPresets/renderModel.js";
import * as frameGeometry from "../../../domain/countdownPresets/frameGeometry.js";
import * as renderContract from "../../../../shared/renderContractPolicy.js";
import { COUNTDOWN_PRESETS } from "../../../config/countdownPresets.js";

const require = createRequire(import.meta.url);
const { JSDOM } = require("../../../../functions/node_modules/jsdom");
const source = readFileSync(new URL("./CountdownPreview.jsx", import.meta.url), "utf8");
const { code } = await swc.transform(source, {
  filename: "CountdownPreview.jsx",
  jsc: {
    parser: { syntax: "ecmascript", jsx: true },
    transform: { react: { runtime: "automatic" } },
  },
  module: { type: "commonjs" },
});
const adapters = {
  "./countdownUtils": countdownUtils,
  "./countdownPreviewScale": previewScale,
  "@/domain/countdownPresets/renderModel": renderModel,
  "@/domain/countdownPresets/frameGeometry": frameGeometry,
  "../../../../shared/renderContractPolicy.js": renderContract,
  "@/domain/countdownObservability/telemetry": {
    recordCountdownRenderTelemetry: () => {},
    recordCountdownAssetLoadError: () => {},
  },
};
const compiled = { exports: {} };
new Function("require", "module", "exports", code)(
  (id) => Object.hasOwn(adapters, id) ? adapters[id] : require(id),
  compiled,
  compiled.exports
);
const CountdownPreview = compiled.exports.default;
const NOW = Date.parse("2030-01-01T00:00:00.000Z");
const TARGET = "2030-01-02T02:03:04.000Z";

function withPreview(preset, inspect, props = {}) {
  const before = structuredClone(preset);
  const html = renderToStaticMarkup(React.createElement(CountdownPreview, {
    targetISO: TARGET,
    preset,
    live: false,
    ...props,
  }));
  const dom = new JSDOM(html);
  try {
    inspect(dom.window.document);
    assert.deepEqual(preset, before, "preview must not migrate or mutate its preset");
  } finally {
    dom.window.close();
  }
}

function units(document) {
  return [...document.querySelectorAll("div.absolute.flex.items-center")];
}

function separators(document) {
  return [...document.querySelectorAll("span.pointer-events-none.absolute.font-bold")];
}

function assertLayout(document, preset) {
  const layout = renderModel.resolveCountdownLayoutMetrics(preset);
  assert.deepEqual(units(document).map((element) => ({
    x: Number.parseFloat(element.style.left),
    y: Number.parseFloat(element.style.top),
    width: Number.parseFloat(element.style.width),
    height: Number.parseFloat(element.style.height),
  })), layout.unitLayouts.map(({ x, y, width, height }) => ({ x, y, width, height })));
  assert.deepEqual(separators(document).map((element) => ({
    x: Number.parseFloat(element.style.left),
    y: Number.parseFloat(element.style.top),
    width: Number.parseFloat(element.style.width),
    text: element.textContent,
  })), layout.separatorLayouts.map(({ x, y, width }) => ({
    x, y, width, text: layout.separatorText,
  })));
}

test("v1 preview renders shared units and geometry, preserving legacy styles, labels and time", (t) => {
  t.mock.method(Date, "now", () => NOW);
  const preset = Object.freeze({
    countdownSchemaVersion: 1,
    visibleUnits: Object.freeze(["hours", "seconds"]),
    labels: Object.freeze({ horas: "h pendientes", seg: "s pendientes" }),
    labelTransform: "uppercase",
    width: 310,
    height: 140,
    fontFamily: "Georgia",
    fontSize: 27,
    fontWeight: 500,
    labelSize: 13,
    color: "#000000",
    colorTexto: "#123456",
    labelColor: "#654321",
    boxBg: "#ffffff",
    chipBackground: "#abcdef",
    boxBorder: "#000000",
    chipBorder: "#fedcba",
    boxRadius: 8,
    chipRadius: 15,
    boxShadow: true,
    separator: "::",
    separatorColor: "#ee2233",
    gap: 7.5,
    padZero: true,
  });
  withPreview(preset, (document) => {
    assertLayout(document, preset);
    assert.deepEqual(units(document).map((element) => [...element.querySelectorAll("span")].map((span) => span.textContent)), [
      ["02", "h pendientes"], ["04", "s pendientes"],
    ]);
    const chip = units(document)[0].firstElementChild;
    assert.equal(chip.style.background, "rgb(171, 205, 239)");
    assert.equal(chip.style.borderColor, "rgb(254, 220, 186)");
    assert.equal(chip.style.borderRadius, "15px");
    assert.match(chip.style.boxShadow, /0 2px 6px/);
    const number = chip.querySelector("span");
    assert.equal(number.style.color, "rgb(18, 52, 86)");
    assert.equal(number.style.fontFamily, "Georgia");
    assert.equal(number.style.fontSize, "27px");
    assert.equal(number.style.fontWeight, "500");
    assert.equal(number.style.lineHeight, "1");
    assert.equal(chip.querySelectorAll("span")[1].style.lineHeight, "1.05");
    assert.equal(chip.style.padding, "6px 8px");
    assert.equal(separators(document)[0].style.color, "rgb(238, 34, 51)");
    assert.equal(separators(document)[0].style.fontWeight, "500");
  });
});

test("v1 flip previews preserve their historical chip dividers and authored color", (t) => {
  t.mock.method(Date, "now", () => NOW);
  for (const flipDividerColor of [undefined, "#123456"]) {
    const preset = Object.freeze({
      countdownSchemaVersion: 1,
      layout: "flip",
      visibleUnits: Object.freeze(["days", "seconds"]),
      flipDividerColor,
      separator: ":",
    });
    withPreview(preset, (document) => {
      assertLayout(document, preset);
      assert.equal(separators(document).length, 1);
      const dividers = [...document.querySelectorAll("span.border-dashed")];
      assert.equal(dividers.length, 2);
      for (const divider of dividers) {
        assert.equal(divider.getAttribute("aria-hidden"), "true");
        assert.equal(divider.style.borderColor, flipDividerColor ? "rgb(18, 52, 86)" : "rgb(229, 231, 235)");
        assert.ok(divider.classList.contains("top-1/2"));
      }
    });
  }
});

test("minimal and v2 previews do not gain legacy flip dividers", (t) => {
  t.mock.method(Date, "now", () => NOW);
  for (const preset of [
    { countdownSchemaVersion: 1, layout: "minimal" },
    { countdownSchemaVersion: 1, layout: "flip", presetId: "legacy-minimal" },
    { countdownSchemaVersion: 2, layout: "flip", fontWeight: 500 },
  ]) {
    withPreview({ ...preset, separator: ":" }, (document) => {
      assert.equal(document.querySelectorAll("span.border-dashed").length, 0);
      if (preset.countdownSchemaVersion === 2) {
        assert.equal(separators(document)[0].style.fontWeight, "");
        assert.ok(separators(document)[0].classList.contains("font-bold"));
      }
    });
  }
});

test("every bundled legacy preset uses shared selector geometry and authored separators", (t) => {
  t.mock.method(Date, "now", () => NOW);
  for (const { id, props } of COUNTDOWN_PRESETS) {
    const preset = Object.freeze({ ...props, presetId: id, countdownSchemaVersion: 1, tamanoBase: 320 });
    withPreview(preset, (document) => {
      assertLayout(document, preset);
      assert.equal(units(document).length, 4, id);
      assert.equal(units(document)[0].querySelector("span").style.fontSize, `${props.fontSize}px`, id);
      assert.equal(separators(document).length, props.separator ? 3 : 0, id);
      assert.equal(document.querySelectorAll("img").length, 0, id);
    });
  }
});

test("unversioned minimal, hidden labels and expired v1 layouts keep compatible data", (t) => {
  t.mock.method(Date, "now", () => NOW);
  for (const distribution of ["centered", "vertical", "grid", "editorial"]) {
    const preset = Object.freeze({
      presetId: "legacy-minimal",
      visibleUnits: Object.freeze(["days", "minutes", "seconds"]),
      distribution,
      showLabels: false,
      fontSize: 26,
      padZero: true,
      separator: "/",
    });
    withPreview(preset, (document) => {
      assertLayout(document, preset);
      for (const unit of units(document)) {
        assert.equal(unit.firstElementChild.style.background, "transparent");
        assert.equal(unit.firstElementChild.style.borderStyle, "");
        assert.deepEqual([...unit.querySelectorAll("span")].map((span) => span.textContent), ["00"]);
      }
    }, { targetISO: "2029-01-01T00:00:00.000Z", size: "md" });
    assert.equal(Object.hasOwn(preset, "countdownSchemaVersion"), false);
  }
});

test("v2 preview retains modern paint, labels, geometry and PNG frame behavior", (t) => {
  t.mock.method(Date, "now", () => NOW);
  const preset = Object.freeze({
    countdownSchemaVersion: 2,
    visibleUnits: Object.freeze(["days", "hours"]),
    layoutType: "multiUnit",
    distribution: "grid",
    color: "#123456",
    colorTexto: "#ffffff",
    boxBg: "#abcdef",
    chipBackground: "#ffffff",
    boxBorder: "#fedcba",
    boxRadius: 12,
    chipRadius: 30,
    frameSvgUrl: "https://assets.example.test/frame.png",
    frameAssetType: "png",
    frameColorMode: "currentColor",
    frameScale: 1.5,
    padZero: true,
  });
  withPreview(preset, (document) => {
    assertLayout(document, preset);
    assert.deepEqual(units(document).map((unit) => unit.textContent), ["01DIAS", "02HORAS"]);
    const chip = units(document)[0].firstElementChild;
    assert.equal(chip.style.background, "rgb(171, 205, 239)");
    assert.equal(chip.style.borderRadius, "12px");
    assert.equal(chip.querySelector("span").style.color, "rgb(18, 52, 86)");
    const frames = [...document.querySelectorAll("img")];
    assert.equal(frames.length, 2);
    for (const frame of frames) {
      assert.ok(frame.classList.contains("object-contain"));
      assert.equal(frame.style.transform, "scale(1.5)");
    }
  });
});

test("legacy previews retain their existing frame-free compatibility rendering", (t) => {
  t.mock.method(Date, "now", () => NOW);
  const preset = Object.freeze({
    countdownSchemaVersion: 1,
    frameSvgUrl: "https://assets.example.test/unavailable-frame.svg",
    frameScale: 3,
    frameColorMode: "currentColor",
  });
  withPreview(preset, (document) => {
    assert.equal(document.querySelectorAll("img").length, 0);
    assert.equal(document.querySelectorAll("span[style*='mask-image']").length, 0);
    const layout = renderModel.resolveCountdownLayoutMetrics(preset);
    const viewport = document.body.firstElementChild.firstElementChild;
    assert.equal(Number.parseFloat(viewport.style.width), layout.containerW);
    assert.equal(Number.parseFloat(viewport.style.height), layout.containerH);
  });
});
