import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import React, { act } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createRoot } from "react-dom/client";
import * as model from "../../domain/providers/directoryModel.js";

const require = createRequire(import.meta.url);
const functionRequire = createRequire(new URL("../../../functions/package.json", import.meta.url));
const ts = functionRequire("typescript");
const { JSDOM } = functionRequire("jsdom");
const css = new Proxy({}, { get: (_object, key) => String(key) });
const moduleDefault = (value) => ({ __esModule: true, default: value });
const imageStub = moduleDefault(({ image }) => React.createElement("div", { "data-image-id": image?.id || "none" }, image ? "Foto aprobada" : "Sin fotografía"));
function compile(relative, adapters = {}) {
  const code = ts.transpileModule(readFileSync(new URL(relative, import.meta.url), "utf8"), { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const module = { exports: {} };
  new Function("require", "module", "exports", code)((name) => {
    if (name.endsWith(".module.css")) return moduleDefault(css);
    if (name === "@/domain/providers/directoryModel") return model;
    if (name === "next/link") return moduleDefault(({ children, ...props }) => React.createElement("a", props, children));
    if (Object.hasOwn(adapters, name)) return adapters[name];
    return require(name);
  }, module, module.exports);
  return module.exports;
}
const catalog = { categories: [{ id: "salones-fiestas", nombre: "Salones", tipo: "lugar" }, { id: "foto-video", nombre: "Fotografía", tipo: "profesional" }], services: [{ id: "foto", nombre: "Fotografía de bodas" }], features: [] };
const content = { nombre: "Negocio aprobado", categoriaPrincipalId: "foto-video", descripcionCorta: "Descripción aprobada", descripcion: "Equipo sintético", ubicacion: { ciudad: "Rosario", provincia: "Santa Fe", direccion: "PRIVATE_HOME" }, cobertura: ["Rosario"], servicios: ["foto"], precio: { modalidad: "consultar" }, imagenes: { portada: null, logo: null, galeria: [] }, contratacion: { incluye: "Fotos", reserva: "" }, contacto: { email: "synthetic@example.test", whatsapp: "+541155550000" }, propietario: { userId: "PRIVATE_UID" }, notasInternas: "PRIVATE_NOTE", fuente: { origen: "PRIVATE_SOURCE" } };

test("shared cards and approved detail render real approved content, unknowns and no canonical private fields", () => {
  const Card = compile("./ProviderDirectoryCard.jsx", { "./ProviderDirectoryImage": imageStub }).default;
  const cardHtml = renderToStaticMarkup(React.createElement(Card, { provider: { id: "test business", approvedRevision: 3, ...content }, kind: "profesional", catalog }));
  assert.match(cardHtml, /proveedor\/\?id=test%20business/);
  assert.match(cardHtml, /Sin fotografía/); assert.match(cardHtml, /Consultar presupuesto/);
  assert.doesNotMatch(cardHtml, /PRIVATE_|Guardar|rating|disponibilidad/i);
  const Detail = compile("./ProviderDirectoryDetail.jsx", { "./ProviderDirectoryImage": imageStub, "./MarketplaceHeader": moduleDefault(() => null), "./ProviderDirectoryResults": { ProviderDirectoryStatus: () => null }, "./useProviderDirectory": moduleDefault(() => null) }).ProviderDirectoryContent;
  const html = renderToStaticMarkup(React.createElement(Detail, { provider: { id: "p1", approvedRevision: 3, content }, catalog, onContact() {} }));
  assert.match(html, /Ficha aprobada del negocio/); assert.match(html, /Consultar por WhatsApp/); assert.match(html, /Escribir por correo/);
  assert.match(html, /Zonas de cobertura/); assert.match(html, /Fotografía de bodas/);
  assert.doesNotMatch(html, /PRIVATE_|Cómo se reserva|Ver ubicación verificada/);
  const venueHtml = renderToStaticMarkup(React.createElement(Detail, { provider: { id: "p2", approvedRevision: 3, content: { ...content, categoriaPrincipalId: "salones-fiestas", ubicacion: { ciudad: "Rosario" }, espacio: { capacidadMinima: null, capacidadMaxima: null, cubierto: null, aireLibre: null } } }, catalog, onContact() {} }));
  assert.match(venueHtml, /Capacidad sin informar/); assert.match(venueHtml, /Espacio cubierto<\/dt><dd>Sin informar/);
});

async function withHook(props, api, exercise) {
  const dom = new JSDOM("<!doctype html><div id='root'></div>", { url: "http://localhost/", pretendToBeVisual: true });
  const previous = { window: globalThis.window, document: globalThis.document, act: globalThis.IS_REACT_ACT_ENVIRONMENT };
  globalThis.window = dom.window; globalThis.document = dom.window.document; globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const Hook = compile("./useProviderDirectory.js", { "@/domain/providers/directoryApi": { providerDirectoryRequest: api } }).default;
  let state;
  function Harness(values) { state = Hook(values); return null; }
  const root = createRoot(dom.window.document.getElementById("root"));
  try {
    await act(async () => root.render(React.createElement(Harness, props)));
    await exercise({ state: () => state, render: async (next) => act(async () => root.render(React.createElement(Harness, next))) });
  } finally {
    await act(async () => root.unmount()); dom.window.close();
    globalThis.window = previous.window; globalThis.document = previous.document; globalThis.IS_REACT_ACT_ENVIRONMENT = previous.act;
  }
}

test("closed beta never loads catalog or providers", async () => {
  const operations = [];
  await withHook({ kind: "lugar", userUid: "super" }, async (operation) => { operations.push(operation); return { enabled: false }; }, async ({ state }) => {
    assert.equal(state().status, "closed"); assert.deepEqual(state().items, []); assert.deepEqual(operations, ["access"]);
  });
});

test("query error keeps real filters and reset visible without leaking prior cards; detail offers a return route", () => {
  const Results = compile("./ProviderDirectoryResults.jsx", { "./ProviderDirectoryCard": moduleDefault(() => React.createElement("div", { "data-provider-card": true })) });
  const state = { status: "invalid", message: "Búsqueda inválida", catalog, filters: { ...model.EMPTY_DIRECTORY_FILTERS }, setFilters() {}, search() {}, reload() {}, busy: false, items: [{ id: "stale" }] };
  const html = renderToStaticMarkup(React.createElement(React.Fragment, null, React.createElement(Results.ProviderDirectoryFilters, { state, kind: "lugar" }), React.createElement(Results.default, { state, kind: "lugar" })));
  assert.match(html, /Nombre o descripción/); assert.match(html, /Limpiar filtros/); assert.doesNotMatch(html, /data-provider-card/);
  const detail = renderToStaticMarkup(React.createElement(Results.ProviderDirectoryStatus, { state, backToDirectory: true }));
  assert.match(detail, /href="\/lugares\/"/); assert.match(detail, /href="\/profesionales\/"/);
  const correcting = renderToStaticMarkup(React.createElement(Results.ProviderDirectoryStatus, { state: { ...state, busy: true, message: "" } }));
  assert.match(correcting, /Actualizando directorio privado…/); assert.doesNotMatch(correcting, /<p><\/p>/);
});

test("real hook searches approved filters, follows empty pages with cursor and clears data on denial", async () => {
  const requests = []; let deny = false;
  await withHook({ kind: "lugar", userUid: "super" }, async (operation, data) => {
    requests.push({ operation, data });
    if (operation === "access") return { enabled: true };
    if (operation === "catalog") return catalog;
    if (deny) throw { code: "functions/permission-denied" };
    return data.cursor ? { items: [{ id: "approved" }], nextCursor: null } : { items: [], nextCursor: "continue" };
  }, async ({ state }) => {
    assert.equal(state().nextCursor, "continue");
    await act(async () => state().search({ search: " fotos ", categoryId: "salones-fiestas", location: " Rosario ", minCapacity: "150" }));
    assert.deepEqual(requests.at(-1).data, { kind: "lugar", search: "fotos", categoryId: "salones-fiestas", location: "Rosario", minCapacity: 150, cursor: null, pageSize: 12 });
    await act(async () => state().paginate(1));
    assert.equal(state().page, 2); assert.equal(state().items[0].id, "approved");
    deny = true; await act(async () => state().reload());
    assert.equal(state().status, "forbidden"); assert.deepEqual(state().items, []);
  });
});

test("contact revalidates exact approval and clears paused content instead of using stale channels", async () => {
  let revision = 3; let paused = false;
  await withHook({ id: "p1", userUid: "super" }, async (operation) => {
    if (operation === "access") return { enabled: true };
    if (operation === "catalog") return catalog;
    if (paused) throw { code: "functions/not-found" };
    return { id: "p1", approvedRevision: revision, content: structuredClone(content) };
  }, async ({ state }) => {
    let contact; await act(async () => { contact = await state().verifyContact(); });
    assert.equal(contact.email, "synthetic@example.test");
    revision = 4; await act(async () => { contact = await state().verifyContact(); });
    assert.equal(contact, null); assert.match(state().message, /se actualizó/);
    paused = true; await act(async () => { contact = await state().verifyContact(); });
    assert.equal(contact, null); assert.equal(state().provider, null); assert.equal(state().status, "unavailable");
  });
});

test("venue discovery reads access/catalog first and queries guests/region only after submitting", async () => {
  const requests = [];
  await withHook({ kind: "lugar", userUid: "super", deferInitialList: true }, async (operation, data) => {
    requests.push({ operation, data });
    if (operation === "access") return { enabled: true };
    if (operation === "catalog") return catalog;
    return { items: [{ id: "approved" }], nextCursor: data.cursor ? null : "page-two" };
  }, async ({ state }) => {
    assert.deepEqual(requests.map(({ operation }) => operation), ["access", "catalog"]);
    assert.equal(state().status, "ready");
    await act(async () => state().search({ ...model.EMPTY_DIRECTORY_FILTERS, guests: "150", regionId: "gba-norte" }));
    assert.equal(requests.at(-1).data.guests, 150);
    assert.equal(requests.at(-1).data.regionId, "gba-norte");
    assert.equal(state().appliedFilters.guests, 150);
    await act(async () => state().paginate(1));
    assert.equal(requests.at(-1).data.cursor, "page-two");
    assert.equal(state().page, 2);
    await act(async () => state().search({ ...model.EMPTY_DIRECTORY_FILTERS, guests: "80", regionId: "caba" }));
    assert.equal(requests.at(-1).data.cursor, null);
    assert.equal(state().page, 1);
    await act(async () => state().reload());
    assert.equal(requests.at(-1).operation, "list");
    assert.equal(requests.at(-1).data.regionId, "caba");
  });
});

test("a superseded venue search cannot replace a more recent region or result", async () => {
  let resolveOld;
  await withHook({ kind: "lugar", userUid: "super", deferInitialList: true }, async (operation, data) => {
    if (operation === "access") return { enabled: true };
    if (operation === "catalog") return catalog;
    if (data.regionId === "gba-norte") return new Promise((resolve) => { resolveOld = resolve; });
    return { items: [{ id: "current-caba" }], nextCursor: null };
  }, async ({ state }) => {
    await act(async () => { void state().search({ ...model.EMPTY_DIRECTORY_FILTERS, guests: "150", regionId: "gba-norte" }); });
    await act(async () => state().search({ ...model.EMPTY_DIRECTORY_FILTERS, guests: "80", regionId: "caba" }));
    await act(async () => resolveOld({ items: [{ id: "stale-norte" }], nextCursor: "stale" }));
    assert.deepEqual(state().items, [{ id: "current-caba" }]);
    assert.equal(state().appliedFilters.regionId, "caba");
    assert.equal(state().nextCursor, null);
  });
});

test("an old-account response cannot populate the next account view", async () => {
  let resolveOld; let listCount = 0;
  await withHook({ kind: "profesional", userUid: "first" }, async (operation) => {
    if (operation === "access") return { enabled: true };
    if (operation === "catalog") return catalog;
    listCount += 1;
    if (listCount === 1) return new Promise((resolve) => { resolveOld = resolve; });
    throw { code: "functions/permission-denied" };
  }, async ({ state, render }) => {
    await render({ kind: "profesional", userUid: "second" });
    assert.equal(state().status, "forbidden");
    await act(async () => resolveOld({ items: [{ id: "old-secret" }], nextCursor: null }));
    assert.deepEqual(state().items, []); assert.equal(state().status, "forbidden");
  });
});

test("detail route rejects unresolved, ordinary/admin, signout and failed roles while preserving normal login", () => {
  let session = { user: null, checking: true, failed: false };
  let role = { loadingAdminAccess: false, isSuperAdmin: false, adminAccessError: null };
  const Route = compile("../../pages/proveedor.jsx", {
    react: { ...React, useState: () => [session, () => {}], useEffect() {} },
    "next/head": moduleDefault(({ children }) => children), "next/dynamic": moduleDefault(() => () => React.createElement("div", { "data-approved-detail": true })),
    "firebase/auth": { onAuthStateChanged() {} }, "@/firebase": { auth: {} }, "@/hooks/useAdminAccess": { useAdminAccess: () => role },
  }).default;
  const render = () => renderToStaticMarkup(React.createElement(Route));
  assert.doesNotMatch(render(), /data-approved-detail/);
  for (const user of [null, { uid: "ordinary" }, { uid: "admin" }]) { session = { user, checking: false, failed: false }; assert.doesNotMatch(render(), /data-approved-detail/); }
  session.user = null; assert.match(render(), /href="\/\?auth=login"/);
  session.user = { uid: "super" }; role.isSuperAdmin = true; assert.match(render(), /data-approved-detail/);
  role.loadingAdminAccess = true; assert.doesNotMatch(render(), /data-approved-detail/);
  role.loadingAdminAccess = false; role.adminAccessError = "failure"; assert.doesNotMatch(render(), /data-approved-detail/);
  assert.match(render(), /noindex, nofollow, noarchive/); assert.doesNotMatch(render(), /canonical|application\/ld\+json/);
});

test("media adapter requests only approved image IDs with Bearer, revision and no cache", async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  const auth = { currentUser: { getIdToken: async () => "synthetic-token" } };
  globalThis.fetch = async (url, options) => { requests.push({ url: new URL(url), options }); return { ok: true, blob: async () => "synthetic-bytes" }; };
  try {
    const api = compile("../../domain/providers/directoryApi.js", { "firebase/functions": { httpsCallable: () => async () => ({ data: {} }) }, "../../firebase.js": { auth, functions: {}, firebaseEnvironment: { functionsBaseUrl: "http://localhost:5001/demo-test/us-central1" } } });
    assert.equal(await api.readDirectoryImage("p1", "photo1", 7), "synthetic-bytes");
    assert.deepEqual([...requests[0].url.searchParams.entries()], [["providerId", "p1"], ["imageId", "photo1"], ["approvedRevision", "7"]]);
    assert.equal(requests[0].options.cache, "no-store"); assert.equal(requests[0].options.headers.Authorization, "Bearer synthetic-token");
    assert.equal(requests[0].url.searchParams.has("storagePath"), false);
    auth.currentUser = null; await assert.rejects(api.readDirectoryImage("p1", "photo1", 7), /Iniciá sesión/);
    assert.equal(requests.length, 1);
  } finally { globalThis.fetch = originalFetch; }
});

test("image view revokes private blob URLs when approval changes and when unmounted", async () => {
  const dom = new JSDOM("<!doctype html><div id='root'></div>", { url: "http://localhost/" });
  const previous = { window: globalThis.window, document: globalThis.document, act: globalThis.IS_REACT_ACT_ENVIRONMENT, create: URL.createObjectURL, revoke: URL.revokeObjectURL };
  globalThis.window = dom.window; globalThis.document = dom.window.document; globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  let sequence = 0; const revoked = []; const reads = [];
  URL.createObjectURL = () => `blob:synthetic-${++sequence}`; URL.revokeObjectURL = (value) => revoked.push(value);
  const Image = compile("./ProviderDirectoryImage.jsx", { "@/domain/providers/directoryApi": { readDirectoryImage: async (...args) => { reads.push(args); return new Blob(["synthetic"]); } } }).default;
  const root = createRoot(dom.window.document.getElementById("root"));
  try {
    await act(async () => root.render(React.createElement(Image, { providerId: "p1", approvedRevision: 1, image: { id: "im1", alt: "Sintética" } })));
    assert.match(dom.window.document.querySelector("img").src, /blob:synthetic-1/);
    await act(async () => root.render(React.createElement(Image, { providerId: "p1", approvedRevision: 2, image: { id: "im2", alt: "Sintética" } })));
    assert.equal(reads[0][3].aborted, true); assert.deepEqual(revoked, ["blob:synthetic-1"]);
    assert.equal(reads[1][2], 2); assert.match(dom.window.document.querySelector("img").src, /blob:synthetic-2/);
    await act(async () => root.unmount()); assert.deepEqual(revoked, ["blob:synthetic-1", "blob:synthetic-2"]);
  } finally {
    dom.window.close(); globalThis.window = previous.window; globalThis.document = previous.document; globalThis.IS_REACT_ACT_ENVIRONMENT = previous.act; URL.createObjectURL = previous.create; URL.revokeObjectURL = previous.revoke;
  }
});
