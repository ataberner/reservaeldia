import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import React, { act } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createRoot } from "react-dom/client";
import * as form from "../../../domain/providers/adminForm.js";

const require = createRequire(import.meta.url);
const functionRequire = createRequire(new URL("../../../../functions/package.json", import.meta.url));
const ts = functionRequire("typescript");
const { JSDOM } = functionRequire("jsdom");
const css = new Proxy({}, { get: (_object, key) => String(key) });
function compile(relative, adapters = {}) {
  const source = readFileSync(new URL(relative, import.meta.url), "utf8");
  const code = ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const module = { exports: {} };
  new Function("require", "module", "exports", code)((name) => {
    if (name.endsWith(".module.css")) return { __esModule: true, default: css };
    if (name === "@/domain/providers/adminForm") return form;
    if (Object.hasOwn(adapters, name)) return adapters[name];
    return require(name);
  }, module, module.exports);
  return module.exports;
}
const photosStub = { __esModule: true, default: () => null, PrivateProviderImage: () => React.createElement("div", { "data-private-image": true }) };
const catalog = {
  categories: [{ id: "salones-fiestas", nombre: "Salones de fiestas", tipo: "lugar" }, { id: "foto-video", nombre: "Foto y video", tipo: "profesional" }, { id: "alianzas", nombre: "Alianzas", tipo: "profesional" }],
  services: [{ id: "foto", nombre: "Fotografía", categoriaIds: ["foto-video"] }], features: [],
};

test("admin initialization keeps a loading status after access resolves and preserves closed/error states", () => {
  let state = { access: null, catalog: null, busy: true };
  const Admin = compile("./ProviderDirectoryAdmin.jsx", {
    "./useProviderAdmin": { __esModule: true, default: () => state },
    "./ProviderFields": { __esModule: true, default: () => null, Field: () => null },
    "./ProviderPreview": { __esModule: true, default: () => null },
  }).default;
  const render = () => renderToStaticMarkup(React.createElement(Admin));
  assert.match(render(), /role="status">Validando acceso a la beta/);
  state.access = { enabled: true };
  const loading = render();
  assert.match(loading, /role="status">Preparando categorías y fichas/);
  assert.doesNotMatch(loading, /Validando acceso|Crear ficha|No hay fichas/);
  state.access = { enabled: false };
  const closed = render();
  assert.match(closed, /Beta privada cerrada/);
  assert.doesNotMatch(closed, /Preparando categorías y fichas/);
  state = { ...state, access: { enabled: true }, busy: false, error: "No se pudo cargar el catálogo." };
  const failed = render();
  assert.match(failed, /role="alert"/);
  assert.match(failed, /No se pudo cargar el catálogo/);
  assert.match(failed, /Recargar versión actual/);
  assert.doesNotMatch(failed, /Preparando categorías y fichas|Crear ficha/);
});

test("V1 fields adapt venue/professional sections without requiring fabricated details", () => {
  const Fields = compile("./ProviderFields.jsx", { "./ProviderPhotos": photosStub }).default;
  function render(category) {
    return renderToStaticMarkup(React.createElement(Fields, { draft: { ...form.emptyProviderDraft(), categoriaPrincipalId: category }, catalog, setField() {}, setInternalNotes() {}, internalNotes: "" }));
  }
  const venue = render("salones-fiestas");
  assert.match(venue, /Dirección del establecimiento/);
  assert.match(venue, /Capacidad mínima/);
  assert.match(venue, /Sin confirmar/);
  assert.doesNotMatch(venue, /Zonas de cobertura/);
  const professional = render("foto-video");
  assert.match(professional, /Zonas de cobertura/);
  assert.match(professional, /Fotografía/);
  assert.doesNotMatch(professional, /Dirección del establecimiento|Capacidad mínima/);
  assert.match(render("alianzas"), /todavía no tiene servicios específicos/);
});

test("preview renders permitted data and neutral category art, no internal canonical fields", () => {
  const Preview = compile("./ProviderPreview.jsx", { "./ProviderPhotos": photosStub }).default;
  const content = {
    ...form.emptyProviderDraft(), nombre: "Foto sintética", categoriaPrincipalId: "foto-video", cobertura: ["Rosario"],
    ubicacion: { ciudad: "Rosario", provincia: "Santa Fe", pais: "Argentina", direccionCompleta: "DIRECCION_PRIVADA" },
    propietario: { userId: "UID_PRIVADO" }, internalNotes: "NOTA_PRIVADA", fuente: { origen: "ORIGEN_PRIVADO" },
  };
  const html = renderToStaticMarkup(React.createElement(Preview, { content, catalog, revision: 4, version: "revisión", providerId: "synthetic" }));
  assert.match(html, /Sin fotografía/);
  assert.match(html, /Consultar presupuesto/);
  assert.match(html, /Rosario/);
  assert.match(html, /Santa Fe/);
  assert.doesNotMatch(html, /DIRECCION_PRIVADA|UID_PRIVADO|NOTA_PRIVADA|ORIGEN_PRIVADO/);
  assert.doesNotMatch(html, /href="(?:mailto:|https:\/\/wa)/);
});

function providerFixture() {
  return {
    id: "synthetic", revision: 7, contentRevision: 4,
    draft: { ...form.emptyProviderDraft(), nombre: "Negocio guardado" },
    approved: { revision: 2, content: { nombre: "Nombre aprobado" }, approvedAt: "2026-10-25T12:00:00.000Z" },
    review: { status: "en_revision", revision: 4, content: { nombre: "Revisión enviada" }, reason: null },
    publication: { state: "publicada", pauseSource: null }, owner: { userId: null }, internalNotes: "", history: [],
  };
}

async function withAdminList(api, exercise) {
  const dom = new JSDOM("<!doctype html><div id='root'></div>", { url: "http://localhost/" });
  const previous = { window: globalThis.window, document: globalThis.document, act: globalThis.IS_REACT_ACT_ENVIRONMENT };
  globalThis.window = dom.window; globalThis.document = dom.window.document; globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  let state;
  const requests = [];
  const Hook = compile("./useProviderAdmin.js", { "@/domain/providers/adminApi": { async providerAdminRequest(operation, data) {
    requests.push({ operation, data });
    if (operation === "access") return { enabled: true };
    if (operation === "catalog") return catalog;
    return api(operation, data);
  } } }).default;
  function Harness() { state = Hook(); return null; }
  const root = createRoot(dom.window.document.getElementById("root"));
  try {
    await act(async () => root.render(React.createElement(Harness)));
    await exercise({ state: () => state, requests });
  } finally {
    await act(async () => root.unmount()); dom.window.close();
    globalThis.window = previous.window; globalThis.document = previous.document; globalThis.IS_REACT_ACT_ENVIRONMENT = previous.act;
  }
}

test("admin search retries the failed query after resetting pagination, not a prior successful query", async () => {
  let rejectSearch = true;
  await withAdminList(async (_operation, data) => {
    if (data.search === "second" && rejectSearch) throw new Error("Synthetic network failure");
    return { items: [{ id: data.cursor ? "page-two" : "first" }], nextCursor: "cursor-first" };
  }, async ({ state, requests }) => {
    await act(async () => state().setFilters((filters) => ({ ...filters, search: "first", pending: "false" })));
    await act(async () => state().search());
    await act(async () => state().paginate(1));
    assert.equal(state().page, 2);
    await act(async () => state().setFilters((filters) => ({ ...filters, search: "second" })));
    await act(async () => state().search());
    assert.equal(state().page, 1);
    assert.deepEqual(state().items, []);
    assert.equal(state().nextCursor, null);
    rejectSearch = false;
    await act(async () => state().setFilters((filters) => ({ ...filters, search: "not submitted" })));
    await act(async () => state().reload());
    assert.equal(requests.at(-1).data.search, "second");
    assert.equal(state().filters.search, "second");
    assert.equal(requests.at(-1).data.pending, false);
    assert.equal(requests.at(-1).data.cursor, null);
    assert.equal(state().page, 1);
    const requestCount = requests.length;
    await act(async () => state().paginate(-1));
    assert.equal(requests.length, requestCount);
  });
});

test("admin pending searches remove previous rows and late success/error cannot replace the current result", async () => {
  const deferred = {};
  await withAdminList(async (_operation, data) => {
    if (!data.search) return { items: [{ id: "initial" }], nextCursor: "initial-cursor" };
    return new Promise((resolve, reject) => { deferred[data.search] = { resolve, reject }; });
  }, async ({ state }) => {
    let first; let second;
    await act(async () => state().setFilters((filters) => ({ ...filters, search: "first" })));
    await act(async () => { first = state().search(); });
    assert.equal(state().busy, true);
    assert.deepEqual(state().items, []);
    assert.equal(state().nextCursor, null);
    await act(async () => state().setFilters((filters) => ({ ...filters, search: "second" })));
    await act(async () => { second = state().search(); });
    await act(async () => { deferred.second.resolve({ items: [{ id: "newest" }], nextCursor: null }); await second; });
    await act(async () => { deferred.first.resolve({ items: [{ id: "obsolete" }], nextCursor: "obsolete-cursor" }); await first; });
    assert.deepEqual(state().items, [{ id: "newest" }]);
    assert.equal(state().nextCursor, null);
    let third; let fourth;
    await act(async () => state().setFilters((filters) => ({ ...filters, search: "third" })));
    await act(async () => { third = state().search(); });
    await act(async () => state().setFilters((filters) => ({ ...filters, search: "fourth" })));
    await act(async () => { fourth = state().search(); });
    await act(async () => { deferred.fourth.resolve({ items: [{ id: "final" }], nextCursor: null }); await fourth; });
    await act(async () => { deferred.third.reject(new Error("obsolete error")); await third; });
    assert.deepEqual(state().items, [{ id: "final" }]);
    assert.equal(state().error, "");
    assert.equal(state().busy, false);
  });
});

test("admin return refreshes applied filters, keeping the page until a successful mutation resets it", async () => {
  await withAdminList(async (operation, data) => {
    if (operation === "list") return { items: [{ id: "synthetic" }], nextCursor: "cursor-first" };
    if (["get", "save", "archive"].includes(operation)) return { provider: providerFixture() };
    if (operation === "create") return { provider: { ...providerFixture(), id: "new-nonmatching" } };
    throw new Error(`Unexpected operation ${operation}`);
  }, async ({ state, requests }) => {
    await act(async () => state().setFilters((filters) => ({ ...filters, search: "saved", city: "Rosario", publication: "borrador" })));
    await act(async () => state().search());
    await act(async () => state().paginate(1));
    await act(async () => state().open("synthetic"));
    await act(async () => state().back());
    assert.equal(requests.at(-1).data.cursor, "cursor-first");
    assert.equal(state().page, 2);
    await act(async () => state().setFilters((filters) => ({ ...filters, search: "not submitted" })));
    await act(async () => state().open("synthetic"));
    await act(async () => state().setField("nombre", "Saved updated name"));
    await act(async () => state().save());
    await act(async () => state().back());
    assert.equal(requests.at(-1).data.cursor, null);
    assert.equal(requests.at(-1).data.search, "saved");
    assert.equal(requests.at(-1).data.city, "Rosario");
    assert.equal(requests.at(-1).data.publication, "borrador");
    assert.equal(state().filters.search, "saved");
    assert.equal(state().page, 1);
    await act(async () => state().paginate(1));
    await act(async () => state().open("synthetic"));
    await act(async () => state().transition("archive", "Synthetic archive"));
    await act(async () => state().back());
    assert.equal(requests.at(-1).data.cursor, null);
    assert.equal(state().page, 1);
    await act(async () => state().paginate(1));
    await act(async () => state().create());
    await act(async () => state().save());
    await act(async () => state().back());
    assert.equal(requests.at(-1).data.cursor, null);
    assert.equal(requests.at(-1).data.search, "saved");
    assert.equal(state().page, 1);
    assert.deepEqual(state().items, [{ id: "synthetic" }]);
  });
});

test("admin list distinguishes loading and errors from a completed empty search", () => {
  const List = compile("./ProviderDirectoryAdmin.jsx", {
    "./useProviderAdmin": { __esModule: true, default: () => null },
    "./ProviderFields": { __esModule: true, default: () => null, Field: () => null },
    "./ProviderPreview": { __esModule: true, default: () => null },
  }).ProviderList;
  const state = { filters: {}, setFilters() {}, catalog, busy: true, items: [{ id: "stale", nombre: "STALE_NAME" }], page: 1, nextCursor: null, listStatus: "loading", error: "" };
  const render = () => renderToStaticMarkup(React.createElement(List, { state, onOpen() {}, onCreate() {} }));
  assert.match(render(), /Cargando fichas/);
  assert.doesNotMatch(render(), /STALE_NAME|No hay coincidencias|1 fichas/);
  Object.assign(state, { busy: false, listStatus: "error", error: "Synthetic failure", items: [] });
  assert.doesNotMatch(render(), /No hay coincidencias|Sin coincidencias/);
  Object.assign(state, { listStatus: "ready", error: "" });
  assert.match(render(), /No hay coincidencias/);
  // A malformed/obsolete cursor must not turn a completed empty result into
  // instructions to walk storage blocks. Valid backend pages contain matches.
  state.nextCursor = "obsolete-cursor";
  const empty = render();
  assert.doesNotMatch(empty, /Sin coincidencias en esta página|Hay más registros|continuar con estos filtros/);
  assert.match(empty, /<button[^>]*disabled=""[^>]*>Siguiente<\/button>/);
});

test("admin search capacity failures explain the bounded query without exposing internal errors", () => {
  const message = form.providerErrorMessage({ code: "functions/resource-exhausted", message: "PRIVATE_BUDGET_DETAIL" });
  assert.match(message, /límite.*búsqueda|búsqueda.*límite/i);
  assert.match(message, /Volvé a intentarlo; si persiste, contactá a soporte/);
  assert.doesNotMatch(message, /PRIVATE_/);
});

test("real hook sends exact revisions and retains local draft after concurrent-write rejection", async () => {
  const dom = new JSDOM("<!doctype html><div id='root'></div>", { url: "http://localhost/" });
  const previous = { window: globalThis.window, document: globalThis.document, act: globalThis.IS_REACT_ACT_ENVIRONMENT };
  globalThis.window = dom.window; globalThis.document = dom.window.document; globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  let state;
  const requests = [];
  const provider = providerFixture();
  const useProviderAdmin = compile("./useProviderAdmin.js", {
    "@/domain/providers/adminApi": { async providerAdminRequest(operation, data) {
      requests.push({ operation, data });
      if (operation === "access") return { enabled: true };
      if (operation === "catalog") return catalog;
      if (operation === "list") return { items: [], nextCursor: null };
      if (operation === "get" || operation === "approve") return { provider: structuredClone(provider) };
      if (operation === "preview") return { content: { nombre: "Revisión enviada" }, revision: 4, private: true };
      if (operation === "save") throw Object.assign(new Error("conflict"), { code: "functions/aborted" });
      throw new Error(`Unexpected operation ${operation}`);
    } },
  }).default;
  function Harness() { state = useProviderAdmin(); return null; }
  const root = createRoot(dom.window.document.getElementById("root"));
  try {
    await act(async () => root.render(React.createElement(Harness)));
    await act(async () => state.open("synthetic"));
    await act(async () => state.showPreview("review"));
    assert.equal(state.reviewedRevision, 4);
    await act(async () => state.transition("approve"));
    assert.deepEqual(requests.find((entry) => entry.operation === "approve").data, { id: "synthetic", expectedRevision: 7, reviewRevision: 4, reason: "" });
    await act(async () => state.setField("nombre", "Mi cambio local"));
    await act(async () => state.save());
    assert.equal(state.draft.nombre, "Mi cambio local");
    assert.equal(state.provider.approved.content.nombre, "Nombre aprobado");
    assert.equal(state.dirty, true);
    assert.match(state.error, /Tus cambios siguen en pantalla/);
    assert.equal(requests.find((entry) => entry.operation === "save").data.expectedRevision, 7);
    await act(async () => state.setFilters((filters) => ({ ...filters, search: "negocio", pending: "true" })));
    await act(async () => state.search());
    assert.equal(requests.at(-1).data.pending, true);
    assert.equal(requests.at(-1).data.search, "negocio");
    provider.versionToken = "synthetic-legacy-version";
    provider.revision = 0;
    await act(async () => state.open("synthetic"));
    await act(async () => state.setField("nombre", "Edición del importado"));
    await act(async () => state.save());
    assert.equal(requests.at(-1).data.expectedVersionToken, "synthetic-legacy-version");
    assert.equal(requests.at(-1).data.expectedRevision, 0);
  } finally {
    await act(async () => root.unmount()); dom.window.close();
    globalThis.window = previous.window; globalThis.document = previous.document; globalThis.IS_REACT_ACT_ENVIRONMENT = previous.act;
  }
});

test("admin route fails closed for visitor, ordinary user/admin, unresolved role and auth errors", () => {
  let session = { user: null, checking: true, failed: false };
  let role = { loadingAdminAccess: false, isSuperAdmin: false, adminAccessError: null };
  const Route = compile("../../../pages/admin/proveedores.jsx", {
    react: { ...React, useState: () => [session, (next) => { session = next; }], useEffect() {} },
    "next/head": { __esModule: true, default: ({ children }) => children },
    "firebase/auth": { onAuthStateChanged() { throw new Error("SSR must not subscribe"); } },
    "@/firebase": { auth: {} },
    "@/hooks/useAdminAccess": { useAdminAccess: () => role },
    "@/components/admin/providers/ProviderDirectoryAdmin": { __esModule: true, default: () => React.createElement("div", { "data-provider-admin": true }) },
  }).default;
  const render = () => renderToStaticMarkup(React.createElement(Route));
  assert.doesNotMatch(render(), /data-provider-admin/);
  for (const user of [null, { uid: "ordinary" }, { uid: "admin" }]) {
    session = { user, checking: false, failed: false };
    role = { ...role, isAdmin: true, isSuperAdmin: false };
    assert.doesNotMatch(render(), /data-provider-admin/);
  }
  session.user = { uid: "super" };
  role.isSuperAdmin = "true";
  assert.doesNotMatch(render(), /data-provider-admin/);
  role.isSuperAdmin = true; role.loadingAdminAccess = true;
  assert.doesNotMatch(render(), /data-provider-admin/);
  role.loadingAdminAccess = false;
  assert.match(render(), /data-provider-admin/);
  role.adminAccessError = "synthetic failure";
  assert.doesNotMatch(render(), /data-provider-admin/);
});
