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
