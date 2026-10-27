import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import swc from "next/dist/build/swc/index.js";
import * as invitationView from "../../domain/publications/myInvitationsView.js";

const require = createRequire(import.meta.url);
const { JSDOM } = require("../../../functions/node_modules/jsdom");
const source = readFileSync(new URL("./UsersDirectoryManager.jsx", import.meta.url), "utf8");
const { code } = await swc.transform(source, {
  filename: "UsersDirectoryManager.jsx",
  jsc: { parser: { syntax: "ecmascript", jsx: true }, transform: { react: { runtime: "automatic" } } },
  module: { type: "commonjs" },
});
const adapters = {
  "@/firebase": {},
  "firebase/functions": { httpsCallable: () => { throw new Error("Unexpected Firebase access"); } },
  "@/domain/publications/myInvitationsView": invitationView,
  "@/components/admin/CreateUserDraftModal": { __esModule: true, default: () => null },
};
function compile(overrides = {}, loadedModules = []) {
  const dependencies = { ...adapters, ...overrides };
  const module = { exports: {} };
  new Function("require", "module", "exports", code)(
    (id) => {
      loadedModules.push(id);
      return Object.hasOwn(dependencies, id) ? dependencies[id] : require(id);
    },
    module, module.exports
  );
  return module;
}
const compiled = compile();

export function renderPublications(publications) {
  return renderToStaticMarkup(React.createElement(compiled.exports.PublicationDetailList, { publications }));
}

function publication(overrides = {}) {
  return {
    publicSlug: "invitacion-sintetica",
    nombre: "Invitación de prueba",
    status: "active",
    hasEnabledRsvp: true,
    responseMetrics: { confirmedResponses: 7, declinedResponses: 2 },
    visitMetrics: { status: "ready", totalVisits: 53, uniqueVisits: 31 },
    ...overrides,
  };
}

function metricValues(markup) {
  const dom = new JSDOM(markup);
  try {
    return Object.fromEntries([...dom.window.document.querySelectorAll("div.grid > div")].map((card) =>
      [...card.querySelectorAll("p")].map((paragraph) => paragraph.textContent)
    ));
  } finally {
    dom.window.close();
  }
}

test("published invitations show the four supplied counts, with RSVP gated by enablement", () => {
  for (const status of ["active", "paused", "expired"]) {
    assert.deepEqual(metricValues(renderPublications([publication({ status })])), {
      Confirmaron: "7", "No asistirán": "2", "Visitas únicas": "31", "Visitas totales": "53",
    });
  }
  for (const hasEnabledRsvp of [false, undefined]) {
    assert.deepEqual(metricValues(renderPublications([publication({ hasEnabledRsvp })])), {
      "Visitas únicas": "31", "Visitas totales": "53",
    });
  }
});

test("zero, unavailable history and failed reads remain distinguishable", () => {
  assert.deepEqual(metricValues(renderPublications([publication({
    responseMetrics: { confirmedResponses: 0, declinedResponses: 0 },
    visitMetrics: { status: "ready", totalVisits: 0, uniqueVisits: 0 },
  })])), {
    Confirmaron: "0", "No asistirán": "0", "Visitas únicas": "0", "Visitas totales": "0",
  });
  const history = metricValues(renderPublications([publication({
    status: "expired", visitMetrics: { status: "unavailable" },
  })]));
  assert.equal(history["Visitas únicas"], "Sin datos");
  assert.equal(history["Visitas totales"], "Sin datos");
  for (const visitMetrics of [{ status: "error" }, undefined]) {
    assert.deepEqual(metricValues(renderPublications([publication({ responseMetrics: null, visitMetrics })])), {
      Confirmaron: "—", "No asistirán": "—", "Visitas únicas": "—", "Visitas totales": "—",
    });
  }
});

test("each invitation keeps its own metrics, link and empty state", () => {
  const markup = renderPublications([
    publication(),
    publication({ publicSlug: "otra-invitacion", hasEnabledRsvp: false,
      visitMetrics: { status: "ready", totalVisits: 9, uniqueVisits: 4 } }),
  ]);
  const dom = new JSDOM(markup);
  try {
    const lists = [...dom.window.document.querySelectorAll("div.grid")];
    assert.equal(lists.length, 2);
    assert.equal(lists[0].children.length, 4);
    assert.equal(lists[1].children.length, 2);
    assert.match(lists[1].textContent, /Visitas únicas4Visitas totales9/);
    assert.deepEqual([...dom.window.document.querySelectorAll("a")].map((link) => link.href), [
      "https://reservaeldia.com.ar/i/invitacion-sintetica", "https://reservaeldia.com.ar/i/otra-invitacion",
    ]);
  } finally {
    dom.window.close();
  }
  assert.match(renderPublications([]), /No hay invitaciones publicadas para mostrar/);
});

test("creating for the selected user refreshes its drafts and retains read-only editor links", async () => {
  const dom = new JSDOM("<main></main>", { url: "http://localhost/" });
  const previous = { window: globalThis.window, document: globalThis.document, act: globalThis.IS_REACT_ACT_ENVIRONMENT };
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const user = { uid: "selected-owner", email: "owner@example.invalid", metrics: { drafts: 0 } };
  const details = [];
  const owners = [];
  const loadedModules = [];
  const module = compile({
    "firebase/functions": { httpsCallable: (_functions, name) => async (input) => {
      if (name === "getUsersStats") return { data: { totalUsers: 1 } };
      if (name === "listUsersDirectory") return { data: { items: [user] } };
      assert.equal(name, "getUserDirectoryDetail");
      details.push(input);
      const drafts = details.length > 1
        ? [{ slug: "new-draft", nombre: "Nueva invitación", canOpenCanvas: true }]
        : [];
      return { data: { user: { ...user, metrics: { drafts: drafts.length } },
        metrics: { drafts: drafts.length }, drafts, publications: [] } };
    } },
    "@/components/admin/CreateUserDraftModal": { __esModule: true, default: ({ owner, onCreated }) => {
      owners.push(owner.uid);
      return React.createElement("button", {
        onClick: () => onCreated({ ownerUid: owner.uid, slug: "new-draft" }),
      }, "Confirmar creación");
    } },
  }, loadedModules);
  const root = createRoot(dom.window.document.querySelector("main"));
  const button = text => [...dom.window.document.querySelectorAll("button")].find(item => item.textContent === text);
  try {
    await act(async () => root.render(React.createElement(module.exports.default)));
    await act(async () => button("Ver detalle").click());
    assert.match(dom.window.document.body.textContent, /No hay borradores para mostrar/);
    assert.equal(loadedModules.includes("@/components/admin/CreateUserDraftModal"), false);
    await act(async () => button("Crear borrador").click());
    assert.equal(loadedModules.includes("@/components/admin/CreateUserDraftModal"), true);
    assert.deepEqual(owners, [user.uid]);
    await act(async () => button("Confirmar creación").click());
    assert.deepEqual(details, [{ uid: user.uid }, { uid: user.uid }]);
    assert.match(dom.window.document.body.textContent, /Nueva invitación/);
    const editorLinks = [...dom.window.document.querySelectorAll('a[href*="slug="]')];
    assert.equal(editorLinks.length, 2);
    for (const link of editorLinks) {
      const url = new URL(link.href);
      assert.equal(url.searchParams.get("slug"), "new-draft");
      assert.equal(url.searchParams.get("ownerUid"), user.uid);
      assert.equal(url.searchParams.get("adminView"), "1");
      assert.equal(url.searchParams.has("adminEdit"), false);
    }
    assert.equal(button("Confirmar creación"), undefined);
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
    globalThis.window = previous.window;
    globalThis.document = previous.document;
    globalThis.IS_REACT_ACT_ENVIRONMENT = previous.act;
  }
});

test("designer assistance exposes WhatsApp or email only after an explicit request", () => {
  const render = user => renderToStaticMarkup(React.createElement(compiled.exports.DesignAssistanceContact, {user}));
  assert.equal(render({email:"fixture@example.test"}), "");
  assert.equal(render({email:"fixture@example.test",designAssistance:{requested:false,whatsapp:"+5491112345678"}}), "");
  const whatsapp = render({email:"fixture@example.test",designAssistance:{requested:true,whatsapp:"+5491112345678"}});
  assert.match(whatsapp,/https:\/\/wa.me\/5491112345678/);
  assert.match(whatsapp,/Solicitó asistencia de diseño/);
  const email = render({email:"fixture@example.test",designAssistance:{requested:true,whatsapp:null}});
  assert.match(email,/mailto:fixture%40example.test/);
  assert.doesNotMatch(email,/wa.me/);
  assert.doesNotMatch(render({email:"fixture@example.test",designAssistance:{requested:true,whatsapp:"javascript:bad"}}),/javascript:/);
});
