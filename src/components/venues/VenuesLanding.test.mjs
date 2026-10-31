import test, { after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import React, { act } from "react";
import * as model from "../../domain/providers/directoryModel.js";

const require = createRequire(import.meta.url);
const functionRequire = createRequire(new URL("../../../functions/package.json", import.meta.url));
const ts = functionRequire("typescript");
const { JSDOM } = functionRequire("jsdom");
const dom = new JSDOM("<!doctype html><body></body>", { url: "http://localhost/lugares/", pretendToBeVisual: true });
const previous = { window: globalThis.window, document: globalThis.document, raf: globalThis.requestAnimationFrame, act: globalThis.IS_REACT_ACT_ENVIRONMENT };
globalThis.window = dom.window; globalThis.document = dom.window.document;
globalThis.requestAnimationFrame = (callback) => { callback(); return 1; };
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { createRoot } = await import("react-dom/client");
after(() => { dom.window.close(); globalThis.window = previous.window; globalThis.document = previous.document; globalThis.requestAnimationFrame = previous.raf; globalThis.IS_REACT_ACT_ENVIRONMENT = previous.act; });
const css = new Proxy({}, { get: (_object, key) => String(key) });
const moduleDefault = (value) => ({ __esModule: true, default: value });
function compile(relative, adapters = {}) {
  const code = ts.transpileModule(readFileSync(new URL(relative, import.meta.url), "utf8"), { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const module = { exports: {} };
  new Function("require", "module", "exports", code)((name) => {
    if (name.endsWith(".module.css")) return moduleDefault(css);
    if (name === "@/domain/providers/directoryModel") return model;
    if (Object.hasOwn(adapters, name)) return adapters[name];
    return require(name);
  }, module, module.exports);
  return module.exports;
}
const catalog = { categories: [{ id: "salones-fiestas", nombre: "Salones de fiestas", tipo: "lugar" }, { id: "quintas", nombre: "Quintas", tipo: "lugar" }, { id: "foto-video", nombre: "Fotografía", tipo: "profesional" }], regions: [{ id: "ar", nombre: "Toda Argentina", group: "Argentina" }, { id: "caba", nombre: "CABA", group: "Buenos Aires y alrededores" }, { id: "gba-norte", nombre: "Gran Buenos Aires · Zona norte", group: "Buenos Aires y alrededores" }, { id: "provincia:AR-B", nombre: "Buenos Aires", group: "Provincias" }], services: [], features: [] };
const item = { id: "synthetic-approved", approvedRevision: 7, nombre: "Lugar sintético aprobado", categoriaPrincipalId: "salones-fiestas", ubicacion: { ciudad: "Tigre", provincia: "Buenos Aires", coordenadas: { latitud: -34.42, longitud: -58.58 } }, espacio: { capacidadMinima: 50, capacidadMaxima: 200 }, descripcionCorta: "Una ficha sintética", precio: { modalidad: "consultar" }, portada: null };
const Form = compile("./VenueSearchForm.jsx").default;
const Card = compile("./VenueResultCard.jsx", { "../marketplace/ProviderDirectoryImage": moduleDefault(() => React.createElement("span", null, "Sin fotografía")) }).default;
const status = compile("../marketplace/ProviderDirectoryResults.jsx", { "./ProviderDirectoryCard": moduleDefault(() => null) });
async function harness({ list = async () => ({ items: [item], nextCursor: null }), enabled = true, failure = null } = {}, exercise) {
  const requests = [];
  const Hook = compile("../marketplace/useProviderDirectory.js", { "@/domain/providers/directoryApi": { providerDirectoryRequest: async (operation, data) => {
    requests.push({ operation, data });
    if (failure) throw failure;
    if (operation === "access") return { enabled };
    if (operation === "catalog") return catalog;
    return list(data);
  } } }).default;
  const Header = ({ user, current }) => React.createElement("header", { "data-existing-header": current }, user.uid);
  const Map = ({ items, selectedId }) => React.createElement("div", { "data-map-items": items.map(entry => entry.id).join(","), "data-selected": selectedId || "" }, "Mapa sintético");
  const Landing = compile("./VenuesLanding.jsx", { "../marketplace/MarketplaceHeader": moduleDefault(Header), "../marketplace/useProviderDirectory": moduleDefault(Hook), "../marketplace/ProviderDirectoryResults": status, "./VenueResultsMap": moduleDefault(Map), "./VenueResultCard": moduleDefault(Card), "./VenueSearchForm": moduleDefault(Form) }).default;
  const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
  const select = async (selector, value) => act(async () => { const node = host.querySelector(selector); assert.ok(node, selector); node.value = value; node.dispatchEvent(new dom.window.Event("change", { bubbles: true })); });
  const input = async (selector, value) => act(async () => { const node = host.querySelector(selector); assert.ok(node, selector); Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value").set.call(node, value); node.dispatchEvent(new dom.window.Event("input", { bubbles: true })); });
  const click = async (label) => act(async () => { const node = [...host.querySelectorAll("button")].find(button => (button.getAttribute("aria-label") || button.textContent.trim()) === label); assert.ok(node, label); node.click(); });
  const search = async () => { assert.equal(host.querySelector("form").checkValidity(), true); await click("Buscar lugares"); };
  try { await act(async () => root.render(React.createElement(Landing, { user: { uid: "superadmin-fixture" } }))); await exercise({ host, requests, select, input, click, search }); }
  finally { await act(async () => root.unmount()); host.remove(); }
}

test("venue welcome retains the header and waits for guests and Argentina region before listing", async () => {
  await harness({}, async ({ host, requests, input, select, search }) => {
    assert.deepEqual(requests.map(request => request.operation), ["access", "catalog"]);
    assert.equal(host.querySelector("[data-existing-header]").getAttribute("data-existing-header"), "venues");
    assert.match(host.textContent, /El lugar donde empieza su historia/);
    assert.equal(host.querySelector('[aria-label="Resultados de lugares"]'), null);
    assert.equal(host.querySelector("input[name='search']"), null, "The welcome form only asks for the initial venue criteria");
    assert.equal(host.querySelector("input[name='guests']").required, true);
    assert.equal(host.querySelector("select[name='region']").required, true);
    assert.equal(host.querySelector("form").checkValidity(), false);
    assert.doesNotMatch(host.querySelector("select[name='category']").textContent, /Fotografía/);
    await input("input[name='guests']", "150"); await select("select[name='region']", "ar"); await search();
    assert.equal(requests.at(-1).data.guests, 150); assert.equal(requests.at(-1).data.regionId, "ar");
    assert.equal(requests.at(-1).data.kind, "lugar"); assert.equal(requests.at(-1).data.cursor, null);
    assert.equal(host.querySelector("#venues-title"), null);
    assert.match(host.querySelector('[aria-label="Resultados de lugares"]').textContent, /Lugar sintético aprobado/);
    const results = host.querySelector('section[aria-label="Resultados de lugares"]');
    const list = results.querySelector('[role="region"][aria-label="Lista de lugares"]');
    assert.equal(results.tabIndex, 0, "The full-width results scrollport is keyboard reachable");
    const resultColumn = list.parentElement;
    assert.ok(resultColumn.contains(host.querySelector("h1")), "The title belongs to the results column");
    assert.ok(resultColumn.querySelector('[role="status"]'), "The result status stays with its list");
    assert.equal(resultColumn.contains(results.querySelector("aside")), false, "The title and status do not take space above the map column");
    const compactForm = host.querySelector("#venue-search");
    const nameSearch = host.querySelector("input[name='search']");
    assert.ok(compactForm.contains(nameSearch), "Name search is inside the compact search form");
    assert.equal(resultColumn.contains(nameSearch), false, "Name search does not occupy the results toolbar");
    assert.deepEqual([...compactForm.querySelectorAll("input, select, button[type='submit']")].map(node => node.name || node.type), ["category", "guests", "region", "search", "submit"], "The compact form orders region, name and submit consecutively");
    assert.equal(host.querySelector("[data-map-items]").getAttribute("data-map-items"), item.id);
    assert.equal(host.querySelector("[data-existing-header]").getAttribute("data-existing-header"), "venues");
  });
});

test("category shortcut selects a real category and guest constraints reject empty, zero and fractions", async () => {
  await harness({}, async ({ host, requests, click, input, select }) => {
    await click("Quintas");
    assert.equal(host.querySelector("select[name='category']").value, "quintas");
    assert.equal(document.activeElement, host.querySelector("input[name='guests']"));
    assert.equal(requests.some(request => request.operation === "list"), false);
    await select("select[name='region']", "ar");
    for (const value of ["", "0", "1.5", "100001"]) { await input("input[name='guests']", value); assert.equal(host.querySelector("form").checkValidity(), false, value); }
    await input("input[name='guests']", "1"); assert.equal(host.querySelector("form").checkValidity(), true);
  });
});

test("compact venue cards retain essential facts and link to the full description without repeating it", async () => {
  const priced = { ...item, id: "synthetic-priced", nombre: "Quinta con un nombre comercial deliberadamente largo para conservar íntegro", precio: { modalidad: "desde", importe: 150000, moneda: "ARS", unidad: "evento" } };
  await harness({ list: async () => ({ items: [item, priced], nextCursor: null }) }, async ({ host, input, select, search }) => {
    await input("input[name='guests']", "150"); await select("select[name='region']", "ar"); await search();
    for (const provider of [item, priced]) {
      const card = host.querySelector(`#venue-${provider.id}`);
      const title = card.querySelector("h2 a");
      assert.equal(title.textContent, provider.nombre, "The complete business name remains available");
      assert.equal(title.getAttribute("href"), `/proveedor/?id=${provider.id}`, "The title opens the approved detail");
      assert.ok(card.textContent.includes("Salones de fiestas"));
      assert.ok(card.textContent.includes("Tigre, Buenos Aires"));
      assert.ok(card.textContent.includes("50–200 personas"));
      assert.ok(card.textContent.includes(provider === item ? "Consultar presupuesto" : model.directoryPrice(priced.precio)));
      assert.equal(card.textContent.includes(provider.descripcionCorta), false, "The compact card leaves descriptive text to the detail");
      assert.ok(card.querySelector(`button[aria-label="Ubicar ${provider.nombre} en el mapa"]`), "The existing map action remains accessible");
    }
  });
});

test("pagination uses applied filters and a changed search restarts at page one", async () => {
  await harness({ list: async data => ({ items: [{ ...item, id: data.cursor ? "second" : item.id }], nextCursor: data.cursor ? null : "cursor-page-two" }) }, async ({ host, requests, input, select, search, click }) => {
    await input("input[name='guests']", "150"); await select("select[name='region']", "ar"); await search();
    const results = host.querySelector('section[aria-label="Resultados de lugares"]');
    const cards = results.querySelector('[role="region"][aria-label="Lista de lugares"]');
    results.scrollTop = 600;
    await click("Siguiente"); assert.equal(requests.at(-1).data.cursor, "cursor-page-two"); assert.match(host.textContent, /Página 2/);
    assert.equal(results.scrollTop, 0, "The next page resets the full-width results scrollport");
    assert.equal(cards.scrollTop, 0, "The cards do not own a nested scroll offset");
    results.scrollTop = 350;
    await select("select[name='region']", "gba-norte"); await input("input[type='search']", "Jardín"); await search();
    assert.equal(requests.at(-1).data.cursor, null); assert.equal(requests.at(-1).data.regionId, "gba-norte"); assert.equal(requests.at(-1).data.search, "Jardín");
    assert.equal(results.scrollTop, 0, "A new search resets the full-width results scrollport");
    assert.equal(cards.scrollTop, 0, "Searching leaves the non-scrolling cards column untouched");
    assert.match(host.textContent, /Página 1/); assert.equal(host.querySelector("input[type='search']").form.id, "venue-search");
    await click("Ubicar Lugar sintético aprobado en el mapa");
    assert.equal(host.querySelector("[data-selected]").getAttribute("data-selected"), item.id);
    const switchMap = [...host.querySelectorAll('[aria-label="Vista de resultados"] button')].find(button => button.textContent === "Mapa");
    assert.equal(switchMap.getAttribute("aria-pressed"), "true");
    await click("Volver al inicio"); assert.equal(host.querySelector("input[name='guests']").value, "150"); assert.equal(host.querySelector("select[name='region']").value, "gba-norte");
  });
});

test("empty results and query errors are distinct and never leave stale markers", async () => {
  let shouldFail = false;
  await harness({ list: async () => { if (shouldFail) throw { code: "functions/unavailable" }; return { items: [], nextCursor: null }; } }, async ({ host, input, select, search, click }) => {
    await input("input[name='guests']", "150"); await select("select[name='region']", "ar"); await search();
    assert.match(host.textContent, /Todavía no encontramos ese lugar/); assert.equal(host.querySelector("[data-map-items]").getAttribute("data-map-items"), "");
    await click("Revisar mi búsqueda"); assert.equal(document.activeElement, host.querySelector("select[name='category']"));
    shouldFail = true; await search(); assert.match(host.querySelector('[role="alert"]').textContent, /No pudimos cargar/); assert.doesNotMatch(host.textContent, /Todavía no encontramos ese lugar/);
    assert.equal(host.querySelector("[data-map-items]").getAttribute("data-map-items"), "");
    shouldFail = false; await click("Volver a intentar"); assert.match(host.textContent, /Todavía no encontramos ese lugar/);
  });
});

test("closed or unauthorized directory cannot expose the search form or fetch provider pages", async () => {
  for (const options of [{ enabled: false }, { failure: { code: "functions/permission-denied" } }]) {
    await harness(options, async ({ host, requests }) => {
      assert.equal(host.querySelector("form"), null); assert.equal(host.querySelector("[data-map-items]"), null);
      assert.equal(requests.some(request => request.operation === "list"), false);
      assert.doesNotMatch(host.textContent, /Lugar sintético aprobado/);
    });
  }
});
