import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import React from "react";
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
};
const compiled = { exports: {} };
new Function("require", "module", "exports", code)(
  (id) => Object.hasOwn(adapters, id) ? adapters[id] : require(id),
  compiled, compiled.exports
);

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
