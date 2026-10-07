import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import React, { act } from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { createRoot } from "react-dom/client";
import * as icons from "lucide-react";
import * as publicationState from "../../domain/publications/state.js";
import * as publicSlug from "../../lib/publicSlug.js";

const require = createRequire(import.meta.url);
const ts = require("../../../functions/node_modules/typescript");
const { JSDOM } = require("../../../functions/node_modules/jsdom");

function loadModule(relativePath, dependencies) {
  const { outputText } = ts.transpileModule(
    readFileSync(new URL(relativePath, import.meta.url), "utf8"),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }
  );
  const module = { exports: {} };
  new Function("require", "module", "exports", outputText)((id) => {
    if (id === "react") return React;
    if (id === "react/jsx-runtime") return jsxRuntime;
    if (Object.hasOwn(dependencies, id)) return dependencies[id];
    throw new Error(`Unmocked dependency: ${id}`);
  }, module, module.exports);
  return module.exports;
}

async function mountSuccess(t, overrides = {}) {
  const listeners = [];
  const calls = [];
  let transition = async () => ({ data: { estado: "publicada_activa" } });
  const service = loadModule("../../domain/publications/service.js", {
    "@/firebase": { db: {}, functions: {} },
    "./state.js": publicationState,
    "firebase/functions": { httpsCallable: (_, name) => async (input) => {
      assert.equal(name, "transitionPublishedInvitationState");
      calls.push(input);
      return transition(input);
    } },
    "firebase/firestore": {
      doc: (_, collection, slug) => ({ collection, slug }),
      onSnapshot: (ref, options, onNext, onError) => {
        assert.equal(ref.collection, "publicadas");
        assert.equal(options.includeMetadataChanges, true);
        const listener = { ref, onNext, onError, closed: false };
        listeners.push(listener);
        return () => { listener.closed = true; };
      },
    },
  });
  const hook = loadModule("../../hooks/usePublicationAvailability.js", {
    "../domain/publications/service.js": service,
    "../lib/publicSlug.js": publicSlug,
  }).default;
  const Component = loadModule("./PublicationSuccessState.jsx", {
    "lucide-react": icons,
    "@/hooks/usePublicationAvailability": { default: hook, __esModule: true },
  }).default;
  const dom = new JSDOM("<div id='root'></div>", { url: "https://local.test" });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const root = createRoot(document.getElementById("root"));
  let props = { operation: "update", publicUrl: "https://reservaeldia.com.ar/i/mi-slug", ...overrides };
  const render = async (patch = {}) => {
    props = { ...props, ...patch };
    await act(async () => root.render(React.createElement(Component, props)));
  };
  t.after(async () => {
    await act(async () => root.unmount());
    assert.ok(listeners.every((listener) => listener.closed));
    dom.window.close();
    delete globalThis.window;
    delete globalThis.document;
    delete globalThis.IS_REACT_ACT_ENVIRONMENT;
  });
  await render();
  return {
    calls, listeners, render,
    setTransition: (callback) => { transition = callback; },
    button: (label) => [...document.querySelectorAll("button")].find((button) => button.textContent.trim() === label),
    openLink: () => document.querySelector("a"),
    text: () => document.body.textContent,
    emit: async (data, { cached = false, listener = listeners.at(-1) } = {}) => {
      await act(async () => listener.onNext({ exists: () => data !== null,
        data: () => data, metadata: { fromCache: cached } }));
    },
    error: async () => { await act(async () => listeners.at(-1).onError(new Error("unavailable"))); },
  };
}

test("paused update keeps sharing disabled and resumes only through an explicit owner action", async (t) => {
  const run = await mountSuccess(t);
  assert.match(run.text(), /verificando la disponibilidad/);
  assert.equal(run.openLink(), null);
  assert.equal(run.button("Copiar enlace").disabled, true);
  await run.emit({ estado: "publicada_pausada" });
  assert.match(run.text(), /sigue pausada/);
  assert.doesNotMatch(run.text(), /ya estan visibles/);
  assert.equal(run.openLink(), null);
  assert.deepEqual(run.calls, []);

  let finishResume;
  run.setTransition(() => new Promise((resolve) => { finishResume = resolve; }));
  await act(async () => {
    run.button("Reanudar invitacion").click();
    run.button("Reanudar invitacion").click();
  });
  assert.deepEqual(run.calls, [{ slug: "mi-slug", action: "resume" }]);
  assert.equal(run.button("Reanudando...").disabled, true);
  assert.equal(run.openLink(), null);
  await act(async () => finishResume({ data: { estado: "publicada_activa" } }));
  // A successful mutation is not an optimistic replacement for the observed state.
  assert.equal(run.openLink(), null);
  await run.emit({ estado: "publicada_activa" });
  assert.match(run.text(), /ya estan visibles/);
  assert.equal(run.openLink().href, "https://reservaeldia.com.ar/i/mi-slug");
  assert.equal(run.button("Copiar enlace").disabled, false);
});

test("cached active metadata never advertises a paused invitation as available", async (t) => {
  const run = await mountSuccess(t, { operation: "new" });
  await run.emit({ estado: "publicada_activa" }, { cached: true });
  assert.equal(run.openLink(), null);
  assert.match(run.text(), /verificando la disponibilidad/);
  await run.emit({ estado: "publicada_activa" });
  assert.match(run.text(), /online y lista para compartir/);
  assert.ok(run.openLink());
  await run.emit({ estado: "publicada_pausada" });
  assert.equal(run.openLink(), null);
});

test("an offline read times out with retry and can still recover from the live subscription", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const run = await mountSuccess(t);
  await run.emit({ estado: "publicada_activa" }, { cached: true });
  await act(async () => t.mock.timers.tick(9999));
  assert.match(run.text(), /verificando la disponibilidad/);
  await act(async () => t.mock.timers.tick(1));
  assert.match(run.text(), /no pudimos confirmar/);
  assert.ok(run.button("Volver a verificar"));
  assert.equal(run.openLink(), null);
  assert.equal(run.listeners[0].closed, false);
  await run.emit({ estado: "publicada_activa" });
  assert.ok(run.openLink());
  assert.equal(run.button("Volver a verificar"), undefined);
});

test("missing, trashed, finalized, draft and expired publications do not expose a visit action", async (t) => {
  const run = await mountSuccess(t);
  for (const data of [null, { estado: "papelera" }, { estado: "finalized" },
    { estado: "draft" }, { estado: "publicada_activa", venceAt: "2000-01-01" }]) {
    await run.emit(data);
    assert.equal(run.openLink(), null);
    assert.equal(run.button("Reanudar invitacion"), undefined);
    assert.equal(run.button("Copiar enlace").disabled, true);
    assert.match(run.text(), /no esta disponible para visitantes/);
  }
});

test("read and resume failures preserve the paid success and expose a safe retry", async (t) => {
  const run = await mountSuccess(t);
  await run.error();
  assert.match(run.text(), /Invitacion actualizada/);
  assert.match(run.text(), /no pudimos confirmar/);
  assert.equal(run.openLink(), null);
  await act(async () => run.button("Volver a verificar").click());
  assert.equal(run.listeners[0].closed, true);
  await run.emit({ estado: "publicada_pausada" });
  run.setTransition(async () => { throw new Error("La invitacion ya vencio y no puede reanudarse."); });
  await act(async () => run.button("Reanudar invitacion").click());
  assert.match(document.querySelector('[role="alert"]').textContent, /ya vencio/);
  assert.equal(run.openLink(), null);
  assert.equal(run.button("Reanudar invitacion").disabled, false);
});

test("changing the public slug discards old availability and ignores late callbacks", async (t) => {
  const run = await mountSuccess(t);
  await run.emit({ estado: "publicada_activa" });
  const previousListener = run.listeners[0];
  await run.render({ publicUrl: "https://reservaeldia.com.ar/i/otro-slug" });
  assert.equal(previousListener.closed, true);
  assert.equal(run.openLink(), null);
  await run.emit({ estado: "publicada_activa" }, { listener: previousListener });
  assert.equal(run.openLink(), null);
  await run.emit({ estado: "publicada_pausada" });
  await act(async () => run.button("Reanudar invitacion").click());
  assert.deepEqual(run.calls, [{ slug: "otro-slug", action: "resume" }]);
});
