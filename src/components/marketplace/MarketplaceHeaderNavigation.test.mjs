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
const nextLink = moduleDefault(({ children, onClick, ...props }) => React.createElement("a", {
  ...props, "data-client-link": "true", onClick: (event) => { onClick?.(event); event.preventDefault(); },
}, children));

function compile(relative, adapters = {}) {
  const code = ts.transpileModule(readFileSync(new URL(relative, import.meta.url), "utf8"), {
    compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const module = { exports: {} };
  new Function("require", "module", "exports", code)((name) => {
    if (Object.hasOwn(adapters, name)) return adapters[name];
    if (name.endsWith(".module.css")) return moduleDefault(css);
    if (name === "next/link") return nextLink;
    if (name === "@/domain/providers/directoryModel") return model;
    return require(name);
  }, module, module.exports);
  return module.exports;
}

const Header = compile("../appHeader/AppHeader.jsx").default;
const props = {
  variant: "dashboard", logo: { href: "/dashboard/" },
  navItems: [{ key: "venues", label: "Lugares", href: "/lugares/" }],
  actions: [{ key: "help", label: "Ayuda", href: "/preguntas-frecuentes/" }],
  userMenu: { name: "Cuenta de prueba", email: "synthetic@example.test", initials: "C", items: [
    { key: "dashboard", label: "Mis invitaciones", href: "/dashboard/" },
    { key: "external", label: "Ayuda externa", href: "https://example.test/", target: "_blank", rel: "noopener noreferrer" },
  ] },
};

async function withHeader(values, exercise) {
  const dom = new JSDOM("<!doctype html><div id='root'></div>", { url: "http://localhost/lugares/", pretendToBeVisual: true });
  const previous = { window: globalThis.window, document: globalThis.document, act: globalThis.IS_REACT_ACT_ENVIRONMENT };
  globalThis.window = dom.window; globalThis.document = dom.window.document; globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const root = createRoot(dom.window.document.getElementById("root"));
  try {
    await act(async () => root.render(React.createElement(Header, values)));
    const click = async (element, options = {}) => {
      let prevented;
      const observe = (event) => { prevented = event.defaultPrevented; event.preventDefault(); };
      // Cancel only the browser's final navigation in this offline DOM fixture.
      dom.window.document.addEventListener("click", observe, { once: true });
      await act(async () => element.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true, cancelable: true, ...options })));
      return prevented;
    };
    await exercise({ document: dom.window.document, click });
  } finally {
    await act(async () => root.unmount()); dom.window.close();
    globalThis.window = previous.window; globalThis.document = previous.document; globalThis.IS_REACT_ACT_ENVIRONMENT = previous.act;
  }
}

test("document navigation preserves header markup while default consumers retain Next links", () => {
  const current = renderToStaticMarkup(React.createElement(Header, props));
  const native = renderToStaticMarkup(React.createElement(Header, { ...props, documentNavigation: true }));
  assert.match(current, /data-client-link="true"/);
  assert.doesNotMatch(native, /data-client-link/);
  assert.equal(current.replaceAll(' data-client-link="true"', ""), native);
});

test("document links keep browser default navigation for ordinary and modified clicks", async () => {
  await withHeader({ ...props, documentNavigation: true }, async ({ document, click }) => {
    for (const options of [{}, { ctrlKey: true }, { metaKey: true }, { shiftKey: true }]) {
      assert.equal(await click(document.querySelector('a[aria-label="Reserva el Día"]'), options), false);
    }
    await click(document.querySelector('button[aria-label="Abrir menu de usuario"]'));
    const menuLink = document.querySelector('[role="menuitem"][href="/dashboard/"]');
    assert.equal(menuLink.tagName, "A");
    assert.equal(menuLink.hasAttribute("data-client-link"), false);
    const external = document.querySelector('[role="menuitem"][href="https://example.test/"]');
    assert.equal(external.target, "_blank"); assert.equal(external.rel, "noopener noreferrer");
    assert.equal(await click(menuLink), false);
    await click(document.querySelector('button[aria-label="Abrir menu"]'));
    const mobile = document.querySelector('[aria-label="Menu mobile"]');
    assert.equal(mobile.querySelectorAll("a[data-client-link]").length, 0);
    assert.equal(await click(mobile.querySelector('a[href="/dashboard"]')), false);
  });
});

test("default header still delegates logo and action navigation to Next", async () => {
  await withHeader(props, async ({ document, click }) => {
    assert.equal(await click(document.querySelector('a[aria-label="Reserva el Día"]')), true);
    assert.equal(await click(document.querySelector('a[href="/preguntas-frecuentes/"]')), true);
  });
});

test("marketplace opts into document links and opens the current dashboard document", () => {
  let received;
  const Marketplace = compile("./MarketplaceHeader.jsx", { "@/components/appHeader/AppHeader": moduleDefault((values) => { received = values; return null; }) }).default;
  renderToStaticMarkup(React.createElement(Marketplace, { user: { displayName: "Cuenta de prueba" }, current: "venues" }));
  assert.equal(received.documentNavigation, true);
  assert.equal(received.navItems.find((item) => item.key === "venues").current, true);
  const destinations = [], previous = globalThis.window;
  try {
    globalThis.window = { location: { assign: (destination) => destinations.push(destination) } };
    received.actions.find((action) => action.key === "my-invitations").onClick();
    assert.deepEqual(destinations, ["/dashboard/"]);
  } finally { globalThis.window = previous; }
});

test("approved detail returns to either directory with a native anchor", () => {
  const Detail = compile("./ProviderDirectoryDetail.jsx", {
    "./ProviderDirectoryImage": moduleDefault(() => null), "./MarketplaceHeader": moduleDefault(() => null),
    "./ProviderDirectoryResults": { ProviderDirectoryStatus: () => null }, "./useProviderDirectory": moduleDefault(() => null),
  }).ProviderDirectoryContent;
  const catalog = { categories: [{ id: "venue", tipo: "lugar" }, { id: "professional", tipo: "profesional" }], services: [], features: [] };
  for (const [categoryId, route] of [["venue", "/lugares/"], ["professional", "/profesionales/"]]) {
    const html = renderToStaticMarkup(React.createElement(Detail, { provider: { id: "synthetic", approvedRevision: 1, content: { categoriaPrincipalId: categoryId, nombre: "Ficha sintética", imagenes: {} } }, catalog }));
    assert.match(html, new RegExp(`<a href="${route}" class="back"`));
    assert.doesNotMatch(html, /data-client-link/);
  }
});
