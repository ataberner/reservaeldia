import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import * as model from "./venueMapModel.js";
import * as style from "./venueMapStyle.js";

const require = createRequire(import.meta.url);
const functionRequire = createRequire(new URL("../../../functions/package.json", import.meta.url));
const ts = functionRequire("typescript");
const { JSDOM } = functionRequire("jsdom");
function compileBase(loadRuntime) {
  const source = readFileSync(new URL("./VenueMapBase.jsx", import.meta.url), "utf8");
  const code = ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const module = { exports: {} };
  new Function("require", "module", "exports", code)((name) => {
    if (name.endsWith(".module.css")) return { __esModule: true, default: { base: "base" } };
    if (name === "./venueMapModel") return model;
    if (name === "./venueMapStyle") return style;
    if (name === "./venueMapRuntime") return { loadVenueMapRuntime: loadRuntime };
    return require(name);
  }, module, module.exports);
  return module.exports.default;
}

function fakeRuntime() {
  const maps = [];
  class Map {
    constructor(options) {
      this.options = options; this.jumps = []; this.resizeCount = 0; this.removed = false; this.handlers = new globalThis.Map();
      this.canvas = options.container.ownerDocument.createElement("canvas"); options.container.append(this.canvas); maps.push(this);
    }
    on(event, callback) { this.handlers.set(event, callback); }
    off(event) { this.handlers.delete(event); }
    getCanvas() { return this.canvas; }
    resize() { this.resizeCount += 1; }
    jumpTo(camera) { this.jumps.push(camera); }
    remove() { this.removed = true; this.canvas.remove(); }
  }
  return { Map, maps };
}
const mapStyle = { version: 8, sources: {}, layers: [{ id: "name", type: "symbol", layout: { "text-field": ["get", "name"] } }] };
const flush = () => new Promise((resolve) => setImmediate(resolve));
async function withDom(callback) {
  const dom = new JSDOM("<!doctype html><div id='root'></div>", { url: "https://reservaeldia.test/lugares/?private-search=hidden", pretendToBeVisual: true });
  const previous = { window: globalThis.window, document: globalThis.document, fetch: globalThis.fetch, act: globalThis.IS_REACT_ACT_ENVIRONMENT };
  globalThis.window = dom.window; globalThis.document = dom.window.document; globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const root = createRoot(dom.window.document.getElementById("root"));
  try { await callback(root, dom); } finally {
    await act(async () => root.unmount()); dom.window.close();
    globalThis.window = previous.window; globalThis.document = previous.document; globalThis.fetch = previous.fetch; globalThis.IS_REACT_ACT_ENVIRONMENT = previous.act;
  }
}

test("server rendering never imports the map SDK or starts map requests", () => {
  const Base = compileBase(() => { throw new Error("Server import"); });
  const html = renderToStaticMarkup(React.createElement(Base, { view: model.ARGENTINA_MAP_VIEW, width: 600, height: 500 }));
  assert.match(html, /aria-hidden="true"/);
  assert.doesNotMatch(html, /https:|<script|<img|canvas/);
});

test("one passive renderer follows camera and size, releases resources, and retries errors", async () => withDom(async (root, dom) => {
  const runtime = fakeRuntime();
  let imports = 0; const requests = []; let errors = 0;
  globalThis.fetch = async (url, options) => { requests.push({ url, options }); return { ok: true, json: async () => mapStyle }; };
  const Base = compileBase(async () => { imports += 1; return runtime; });
  let props = { view: model.ARGENTINA_MAP_VIEW, width: 0, height: 0, onError: () => { errors += 1; } };
  const render = async (changes = {}) => { props = { ...props, ...changes }; await act(async () => { root.render(React.createElement(Base, props)); await flush(); }); };
  await render(); assert.equal(imports, 0); assert.equal(requests.length, 0);
  await render({ width: 600, height: 500 });
  assert.equal(imports, 1); assert.equal(runtime.maps.length, 1); assert.equal(requests.length, 1);
  assert.equal(requests[0].url, style.VENUE_MAP_STYLE_URL);
  assert.equal(requests[0].options.credentials, "omit"); assert.equal(requests[0].options.referrerPolicy, "origin");
  const map = runtime.maps[0];
  assert.equal(map.options.interactive, false); assert.equal(map.options.trackResize, false); assert.equal(map.options.renderWorldCopies, false);
  assert.deepEqual(map.options.center, [-64, -38.4]); assert.equal(map.options.zoom, 3);
  assert.equal(map.options.attributionControl, false); assert.equal(map.getCanvas().tabIndex, -1);
  assert.equal(map.options.transformRequest("https://tiles.openfreemap.org/planet").credentials, "omit");
  await render({ view: { lat: -34.6, lng: -58.4, zoom: 13 }, width: 700 });
  assert.equal(runtime.maps.length, 1); assert.equal(map.resizeCount, 1);
  assert.deepEqual(map.jumps.at(-1), { center: [-58.4, -34.6], zoom: 12, bearing: 0, pitch: 0 });
  await act(async () => map.handlers.get("error")()); assert.equal(errors, 1);
  const staleError = map.handlers.get("error");
  await render({ attempt: 1 });
  assert.equal(map.removed, true); assert.equal(requests[0].options.signal.aborted, true); assert.equal(runtime.maps.length, 2);
  staleError(); assert.equal(errors, 1, "Disposed renderer cannot report a late error into the retry");
  assert.equal(dom.window.document.querySelectorAll("canvas").length, 1);
  await act(async () => root.unmount());
  assert.equal(runtime.maps[1].removed, true); assert.equal(requests[1].options.signal.aborted, true);
}));

test("failed styles remain recoverable without opening another map origin", async () => withDom(async (root) => {
  let errors = 0; let succeed = false;
  const runtime = fakeRuntime();
  globalThis.fetch = async () => ({ ok: succeed, json: async () => mapStyle });
  const Base = compileBase(async () => runtime);
  const props = { view: model.ARGENTINA_MAP_VIEW, width: 600, height: 500, onError: () => { errors += 1; } };
  await act(async () => { root.render(React.createElement(Base, props)); await flush(); });
  assert.equal(errors, 1); assert.equal(runtime.maps.length, 0);
  succeed = true;
  await act(async () => { root.render(React.createElement(Base, { ...props, attempt: 1 })); await flush(); });
  assert.equal(runtime.maps.length, 1);
}));

test("a WebGL startup failure is reported and retry can mount a new renderer", async () => withDom(async (root, dom) => {
  let errors = 0; let succeed = false;
  const runtime = fakeRuntime();
  globalThis.fetch = async () => ({ ok: true, json: async () => mapStyle });
  const Base = compileBase(async () => succeed ? runtime : { Map: class { constructor({ container }) {
    container.append(container.ownerDocument.createElement("canvas"));
    throw new Error("WebGL unavailable");
  } } });
  const props = { view: model.ARGENTINA_MAP_VIEW, width: 600, height: 500, onError: () => { errors += 1; } };
  await act(async () => { root.render(React.createElement(Base, props)); await flush(); });
  assert.equal(errors, 1); assert.equal(runtime.maps.length, 0);
  assert.equal(dom.window.document.querySelectorAll("canvas").length, 0, "Partial SDK initialization cannot leave an orphan canvas");
  succeed = true;
  await act(async () => { root.render(React.createElement(Base, { ...props, attempt: 1 })); await flush(); });
  assert.equal(runtime.maps.length, 1);
  assert.equal(dom.window.document.querySelectorAll("canvas").length, 1);
}));

test("unmount aborts a pending style and never creates a late WebGL canvas", async () => withDom(async (root) => {
  let resolveStyle; let signal; let errors = 0;
  const runtime = fakeRuntime();
  globalThis.fetch = (_url, options) => { signal = options.signal; return new Promise((resolve) => { resolveStyle = resolve; }); };
  const Base = compileBase(async () => runtime);
  await act(async () => { root.render(React.createElement(Base, { view: model.ARGENTINA_MAP_VIEW, width: 600, height: 500, onError: () => { errors += 1; } })); await flush(); });
  await act(async () => root.unmount()); assert.equal(signal.aborted, true);
  await act(async () => { resolveStyle({ ok: true, json: async () => mapStyle }); await flush(); });
  assert.equal(runtime.maps.length, 0); assert.equal(errors, 0);
}));
