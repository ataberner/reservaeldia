import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import * as model from "./venueMapModel.js";

const require = createRequire(import.meta.url);
const functionRequire = createRequire(new URL("../../../functions/package.json", import.meta.url));
const ts = functionRequire("typescript");
const { JSDOM } = functionRequire("jsdom");
function compileMap(onBaseRender = () => {}, onDynamic = () => {}) {
  const source = readFileSync(new URL("./VenueResultsMap.jsx", import.meta.url), "utf8");
  const code = ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const module = { exports: {} };
  new Function("require", "module", "exports", code)((name) => {
    if (name.endsWith(".module.css")) return { __esModule: true, default: new Proxy({}, { get: (_object, key) => String(key) }) };
    if (name === "./venueMapModel") return model;
    if (name === "next/dynamic") return { __esModule: true, default: (_load, options) => {
      assert.equal(options.ssr, false, "The WebGL runtime and its worker must stay out of SSR");
      onDynamic(options);
      return (props) => {
        if (typeof window === "undefined") return null;
        onBaseRender(props);
        return React.createElement("div", { "data-map-base": true, "data-view": JSON.stringify(props.view), "data-attempt": props.attempt });
      };
    } };
    return require(name);
  }, module, module.exports);
  return module.exports.default;
}
const venue = (id, latitud, longitud) => ({ id, approvedRevision: 1, nombre: `Lugar ${id}`, ubicacion: { ciudad: "Rosario", provincia: "Santa Fe", coordenadas: { latitud, longitud } } });

test("map only consumes finite coordinates from an approved directory projection", () => {
  const points = model.venueMapPoints([venue("yes", -32.95, -60.65), venue("nan", NaN, -60), venue("outside", 95, -60), venue("string", "-32", -60),
    { ...venue("draft", -32, -60), approvedRevision: 0 }, { id: "unknown", approvedRevision: 1, ubicacion: { ciudad: "Rosario" } }]);
  assert.deepEqual(points.map((point) => point.id), ["yes"]);
  assert.equal(points[0].location, "Rosario, Santa Fe");
  assert.equal(model.venueMapPoints([{ id: "nested", approvedRevision: 3, content: venue("nested", -32, -60) }]).length, 1);
});

test("Mercator projection round-trips supported Argentina coordinates", () => {
  for (const point of [{ lat: -34.6, lng: -58.4 }, { lat: -54.8, lng: -68.3 }, { lat: -22.1, lng: -65.6 }]) {
    const result = model.mapUnproject(model.mapProject(point, 11), 11);
    assert.ok(Math.abs(result.lat - point.lat) < 1e-8);
    assert.ok(Math.abs(result.lng - point.lng) < 1e-8);
  }
});

test("fit includes all points without fabricating markers and zoom remains bounded", () => {
  const points = model.venueMapPoints([venue("north", -22.1, -65.6), venue("south", -54.8, -68.3)]);
  const view = model.fitVenueMap(points, 600, 600);
  const center = model.mapProject(view, view.zoom);
  for (const point of points) {
    const pixel = model.mapProject(point, view.zoom);
    assert.ok(Math.abs(pixel.x - center.x) < 300);
    assert.ok(Math.abs(pixel.y - center.y) < 300);
  }
  assert.deepEqual(model.fitVenueMap([], 600, 600), model.ARGENTINA_MAP_VIEW);
  assert.equal(model.fitVenueMap([points[0]], 600, 600).zoom, 13);
});

test("pan moves the map and exact overlapping businesses remain accessible in one group", () => {
  const shifted = model.panMap(model.ARGENTINA_MAP_VIEW, 80, -80);
  assert.ok(shifted.lng > model.ARGENTINA_MAP_VIEW.lng);
  assert.ok(shifted.lat > model.ARGENTINA_MAP_VIEW.lat);
  const groups = model.groupVenueMapPoints(model.venueMapPoints([venue("a", -34.6, -58.4), venue("b", -34.6, -58.4), venue("c", -32, -60)]));
  assert.equal(groups.length, 2); assert.deepEqual(groups[0].points.map((point) => point.id), ["a", "b"]);
});

test("nearby markers cluster by current zoom without overlap, lost businesses or fabricated coordinates", () => {
  const origin = model.mapProject({ lat: -34.6, lng: -58.4 }, 12);
  const points = [0, 35, 70, 200].map((offset, index) => ({ id: `near-${index}`, name: `Lugar ${index}`,
    ...model.mapUnproject({ x: origin.x + offset, y: origin.y }, 12) }));
  const groups = model.groupVenueMapPoints(points, 12);
  assert.equal(groups.length, 2, "A chain of overlapping click targets is one selectable group");
  assert.equal(groups[0].points.length, 3);
  assert.equal(groups[0].sameLocation, false);
  assert.deepEqual(groups.flatMap((group) => group.points.map((point) => point.id)), points.map((point) => point.id));
  for (const group of groups) {
    assert.ok(points.some((point) => point.lat === group.lat && point.lng === group.lng), "Every anchor remains a real approved coordinate");
  }
  const positions = groups.map((group) => model.mapProject(group, 12));
  assert.ok(Math.abs(positions[0].x - positions[1].x) >= 48 || Math.abs(positions[0].y - positions[1].y) >= 48);
  assert.equal(model.groupVenueMapPoints(points, 14).length, 4, "Zooming in separates spatial groups without removing any business");
  assert.equal(model.groupVenueMapPoints(points).length, 4, "Omitted zoom retains exact-coordinate grouping compatibility");
});

test("no-coordinate state remains honest and server markup does not prefetch maps", () => {
  const html = renderToStaticMarkup(React.createElement(compileMap(() => assert.fail("SSR must not render the map base")), { items: [{ id: "a", approvedRevision: 1, nombre: "Sin coordenadas" }] }));
  assert.match(html, /Ubicaciones por confirmar/); assert.match(html, /OpenStreetMap/);
  assert.doesNotMatch(html, /tile\.openstreetmap|<img|href="\/proveedor/);
});

test("map chunk loading is quiet and a failed download offers retry", () => {
  let options;
  compileMap(undefined, (value) => { options = value; });
  assert.equal(options.loading({ error: null }), null);
  let retries = 0;
  const fallback = options.loading({ error: new Error("chunk unavailable"), retry: () => { retries += 1; } });
  const html = renderToStaticMarkup(fallback);
  assert.match(html, /role="status"/);
  assert.match(html, /No pudimos cargar el mapa/);
  assert.match(html, /Reintentar/);
  fallback.props.children.find((child) => child?.type === "button").props.onClick();
  assert.equal(retries, 1);
});

test("real map supports zoom, fit, keyboard, selection and grouped detail links without remote effects", async () => {
  const dom = new JSDOM("<!doctype html><div id='root'></div>", { url: "http://localhost/", pretendToBeVisual: true });
  const previous = { window: globalThis.window, document: globalThis.document, act: globalThis.IS_REACT_ACT_ENVIRONMENT };
  globalThis.window = dom.window; globalThis.document = dom.window.document; globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  dom.window.HTMLElement.prototype.getBoundingClientRect = () => ({ width: 600, height: 550, left: 0, top: 0, right: 600, bottom: 550 });
  const root = createRoot(dom.window.document.getElementById("root"));
  try {
    let selection;
    const items = [venue("a", -34.6, -58.4), venue("b", -34.6, -58.4)];
    await act(async () => root.render(React.createElement(compileMap(), { items, onSelect: (id) => { selection = id; } })));
    const button = (label) => dom.window.document.querySelector(`button[aria-label="${label}"]`);
    const camera = () => dom.window.document.querySelector("[data-map-base]").getAttribute("data-view");
    const initial = camera();
    await act(async () => button("Acercar mapa").click()); assert.notEqual(camera(), initial);
    await act(async () => button("Alejar mapa").click()); assert.equal(camera(), initial);
    const map = dom.window.document.querySelector(".canvas");
    await act(async () => map.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })));
    assert.notEqual(camera(), initial);
    await act(async () => dom.window.document.querySelector(".fit").click()); assert.equal(camera(), initial);
    await act(async () => button("Ver 2 lugares en esta ubicación").click()); assert.equal(selection, "a");
    const links = [...dom.window.document.querySelectorAll('.popup a')].map((link) => link.getAttribute("href"));
    assert.deepEqual(links, ["/proveedor/?id=a", "/proveedor/?id=b"]);
    assert.match(dom.window.document.querySelector(".attribution").textContent, /OpenFreeMap.*OpenMapTiles.*OpenStreetMap/);
    await act(async () => button("Cerrar lugar en el mapa").click()); assert.equal(dom.window.document.querySelector(".popup"), null);
  } finally {
    await act(async () => root.unmount()); dom.window.close();
    globalThis.window = previous.window; globalThis.document = previous.document; globalThis.IS_REACT_ACT_ENVIRONMENT = previous.act;
  }
});

test("external map selection, missing locations and tile retry cannot retain a prior page popup", async () => {
  const dom = new JSDOM("<!doctype html><div id='root'></div>", { url: "http://localhost/", pretendToBeVisual: true });
  const previous = { window: globalThis.window, document: globalThis.document, act: globalThis.IS_REACT_ACT_ENVIRONMENT };
  globalThis.window = dom.window; globalThis.document = dom.window.document; globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  dom.window.HTMLElement.prototype.getBoundingClientRect = () => ({ width: 600, height: 550, left: 0, top: 0, right: 600, bottom: 550 });
  const root = createRoot(dom.window.document.getElementById("root"));
  let baseProps;
  const Map = compileMap((props) => { baseProps = props; });
  try {
    const items = [venue("selected", -34.6, -58.4), venue("other", -34.7, -58.5)];
    await act(async () => root.render(React.createElement(Map, { items, selectedId: "selected" })));
    assert.equal(dom.window.document.querySelector(".popup a").getAttribute("href"), "/proveedor/?id=selected");
    assert.deepEqual(Object.keys(baseProps).sort(), ["attempt", "height", "onError", "view", "width"], "No provider record is given to the external base renderer");
    const firstAttempt = baseProps.attempt;
    await act(async () => baseProps.onError());
    assert.match(dom.window.document.querySelector(".error").textContent, /No pudimos cargar parte del mapa/);
    await act(async () => dom.window.document.querySelector(".error button").click());
    assert.equal(dom.window.document.querySelector(".error"), null);
    assert.equal(baseProps.attempt, firstAttempt + 1, "Retry recreates the base without embedding private data");
    await act(async () => root.render(React.createElement(Map, { items: [{ id: "unknown", approvedRevision: 1, nombre: "Sin coordenadas" }], selectedId: "selected" })));
    assert.equal(dom.window.document.querySelector(".popup"), null);
    assert.equal(dom.window.document.querySelector(".marker"), null);
    assert.match(dom.window.document.querySelector(".empty").textContent, /Ubicaciones por confirmar/);
    assert.equal(dom.window.document.querySelector('a[href^="/proveedor/"]'), null);
  } finally {
    await act(async () => root.unmount()); dom.window.close();
    globalThis.window = previous.window; globalThis.document = previous.document; globalThis.IS_REACT_ACT_ENVIRONMENT = previous.act;
  }
});
