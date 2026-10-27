import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import swc from "next/dist/build/swc/index.js";
import * as invitationTypes from "../../domain/invitationTypes.js";

const require = createRequire(import.meta.url);
const { JSDOM } = require("../../../functions/node_modules/jsdom");
const { code } = await swc.transform(readFileSync(new URL("./CreateUserDraftModal.jsx", import.meta.url), "utf8"), {
  filename: "CreateUserDraftModal.jsx",
  jsc: { parser: { syntax: "ecmascript", jsx: true }, transform: { react: { runtime: "automatic" } } },
  module: { type: "commonjs" },
});

async function fixture({ copy, templates = [{ id: "template-1", nombre: "Magnolia" }], loading = false, error = "" } = {}) {
  const dom = new JSDOM("<main></main>", { url: "http://localhost/" });
  const previous = { window: globalThis.window, document: globalThis.document, act: globalThis.IS_REACT_ACT_ENVIRONMENT };
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  dom.window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  dom.window.HTMLDialogElement.prototype.close = function () { this.open = false; };
  const calls = { copies: [], created: [], closed: 0, categories: [] };
  const dependencies = {
    "@/components/templates/TemplateCardShell": { __esModule: true, default: ({ title, onClick, disabled, actionLabel }) =>
      React.createElement("button", { onClick, disabled }, `${title}: ${actionLabel}`) },
    "@/hooks/useDashboardHomeTemplates": { useDashboardHomeTemplates: ({ tipo }) => {
      calls.categories.push(tipo);
      return { templates, loading, error };
    } },
    "@/domain/invitationTypes": invitationTypes,
    "@/domain/templates/service": {
      buildDraftSlug: () => `draft-${calls.copies.length + 1}`,
      createDraftFromTemplate: async payload => {
        calls.copies.push(payload);
        return copy ? copy(payload) : { slug: payload.requestedSlug };
      },
    },
  };
  const compiled = { exports: {} };
  new Function("require", "module", "exports", code)(
    id => Object.hasOwn(dependencies, id) ? dependencies[id] : require(id), compiled, compiled.exports
  );
  const root = createRoot(dom.window.document.querySelector("main"));
  await act(async () => root.render(React.createElement(compiled.exports.default, {
    owner: { uid: "target-owner", email: "target@example.invalid" },
    onClose: () => { calls.closed++; },
    onCreated: result => calls.created.push(result),
  })));
  return {
    calls, document: dom.window.document,
    button(text) { return [...dom.window.document.querySelectorAll("button")].find(button => button.textContent === text); },
    async click(button) { await act(async () => button.click()); },
    async close() {
      await act(async () => root.unmount());
      dom.window.close();
      globalThis.window = previous.window;
      globalThis.document = previous.document;
      globalThis.IS_REACT_ACT_ENVIRONMENT = previous.act;
    },
  };
}

test("template selection requires confirmation and creates for the displayed owner", async () => {
  const f = await fixture();
  try {
    assert.ok(f.document.querySelector("dialog").open);
    assert.match(f.document.body.textContent, /target@example.invalid/);
    assert.equal(f.button("Crear borrador").disabled, true);
    await f.click(f.button("Magnolia: Seleccionar"));
    assert.deepEqual(f.calls.copies, []);
    assert.equal(f.button("Crear borrador").disabled, false);
    await f.click(f.button("Crear borrador"));
    assert.deepEqual(f.calls.copies, [{ templateId: "template-1", templateName: "Magnolia",
      ownerUid: "target-owner", requestedSlug: "draft-1" }]);
    assert.deepEqual(f.calls.created, [{ ownerUid: "target-owner", slug: "draft-1" }]);
  } finally { await f.close(); }
});

test("pending creation prevents duplicate submissions and closing the selector", async () => {
  let resolve;
  const f = await fixture({ copy: () => new Promise(done => { resolve = done; }) });
  try {
    await f.click(f.button("Magnolia: Seleccionar"));
    await f.click(f.button("Crear borrador"));
    assert.equal(f.button("Creando...").disabled, true);
    assert.equal(f.button("Cancelar").disabled, true);
    await f.click(f.button("Creando..."));
    const cancel = new f.document.defaultView.Event("cancel", { cancelable: true });
    await act(async () => f.document.querySelector("dialog").dispatchEvent(cancel));
    assert.equal(cancel.defaultPrevented, true);
    assert.equal(f.calls.closed, 0);
    assert.equal(f.calls.copies.length, 1);
    await act(async () => resolve({ slug: "draft-1" }));
    assert.equal(f.calls.created.length, 1);
  } finally { await f.close(); }
});

test("retry after failure preserves the same draft id and selected owner", async () => {
  let attempts = 0;
  const f = await fixture({ copy: async payload => {
    if (++attempts === 1) throw new Error("No se pudo confirmar la creación");
    return { slug: payload.requestedSlug };
  } });
  try {
    await f.click(f.button("Magnolia: Seleccionar"));
    await f.click(f.button("Crear borrador"));
    assert.match(f.document.querySelector('[role="alert"]').textContent, /No se pudo confirmar/);
    assert.deepEqual(f.calls.created, []);
    await f.click(f.button("Crear borrador"));
    assert.deepEqual(f.calls.copies[0], f.calls.copies[1]);
    assert.equal(f.calls.created.length, 1);
  } finally { await f.close(); }
});

test("empty and failed catalog states cannot create a draft", async () => {
  for (const state of [{ templates: [] }, { error: "Catálogo no disponible" }, { loading: true }]) {
    const f = await fixture(state);
    try {
      assert.equal(f.button("Crear borrador").disabled, true);
      await f.click(f.button("Crear borrador"));
      assert.deepEqual(f.calls.copies, []);
      await f.click(f.button("Cancelar"));
      assert.equal(f.calls.closed, 1);
    } finally { await f.close(); }
  }
});
