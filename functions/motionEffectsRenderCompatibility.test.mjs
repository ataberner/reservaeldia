import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { JSDOM } from "jsdom";

const require = createRequire(import.meta.url);
const { generarHTMLDesdeObjetos } = require("./lib/utils/generarHTMLDesdeObjetos.js");
const { generarMotionEffectsRuntimeHTML } = require(
  "./lib/utils/generarMotionEffectsRuntime.js"
);

const SECTIONS = [
  { id: "details", orden: 1, altoModo: "fijo", altura: 600 },
];

test("standalone shapes and Google maps expose their assigned motion effect", () => {
  const previousApiKey = process.env.GOOGLE_MAPS_EMBED_API_KEY;
  process.env.GOOGLE_MAPS_EMBED_API_KEY = "test-key";

  try {
    const html = generarHTMLDesdeObjetos(
      [
        {
          id: "shape",
          tipo: "forma",
          figura: "star",
          seccionId: "details",
          x: 20,
          y: 20,
          width: 80,
          height: 80,
          motionEffect: "reveal",
        },
        {
          id: "map",
          tipo: "mapa-google",
          seccionId: "details",
          x: 20,
          y: 140,
          width: 361,
          height: 220,
          googlePlaceId: "place-1",
          mostrarMapa: true,
          motionEffect: "reveal",
        },
      ],
      SECTIONS
    );
    const dom = new JSDOM(`<body>${html}</body>`);
    const shape = dom.window.document.querySelector('[data-obj-id="shape"]');
    const map = dom.window.document.querySelector('[data-obj-id="map"]');

    assert.equal(shape?.getAttribute("data-type"), "shape");
    assert.equal(shape?.getAttribute("data-motion"), "reveal");
    assert.equal(map?.getAttribute("data-type"), "mapa-google");
    assert.equal(map?.getAttribute("data-motion"), "reveal");
  } finally {
    if (previousApiKey === undefined) {
      delete process.env.GOOGLE_MAPS_EMBED_API_KEY;
    } else {
      process.env.GOOGLE_MAPS_EMBED_API_KEY = previousApiKey;
    }
  }
});

test("group children retain motion data and functional CTA discoverability", () => {
  const html = generarHTMLDesdeObjetos(
    [
      {
        id: "group",
        tipo: "grupo",
        seccionId: "details",
        anclaje: "content",
        x: 20,
        y: 20,
        width: 320,
        height: 160,
        children: [
          {
            id: "title",
            tipo: "texto",
            x: 0,
            y: 0,
            width: 240,
            height: 40,
            texto: "Celebremos",
            motionEffect: "reveal",
          },
          {
            id: "cta",
            tipo: "rsvp-boton",
            x: 0,
            y: 80,
            width: 220,
            height: 54,
            texto: "Confirmar asistencia",
            motionEffect: "rsvp",
          },
        ],
      },
    ],
    SECTIONS
  );
  const dom = new JSDOM(`<body>${html}</body>`);
  const title = dom.window.document.querySelector('[data-group-child-id="title"]');
  const cta = dom.window.document.querySelector('[data-group-child-id="cta"]');

  assert.equal(title?.classList.contains("group-child-root"), true);
  assert.equal(title?.classList.contains("objeto"), false);
  assert.equal(title?.getAttribute("data-motion"), "reveal");
  assert.equal(title?.hasAttribute("data-obj-id"), false);
  assert.equal(cta?.getAttribute("data-motion"), "rsvp");
  assert.equal(cta?.getAttribute("data-cta-state"), "ready");
  assert.equal(cta?.hasAttribute("data-rsvp-open"), true);
});

test("grouped shapes and Google maps keep their individual motion markers", () => {
  const previousApiKey = process.env.GOOGLE_MAPS_EMBED_API_KEY;
  process.env.GOOGLE_MAPS_EMBED_API_KEY = "test-key";

  try {
    const html = generarHTMLDesdeObjetos(
      [
        {
          id: "visual-group",
          tipo: "grupo",
          seccionId: "details",
          anclaje: "content",
          x: 20,
          y: 20,
          width: 420,
          height: 240,
          children: [
            {
              id: "shape-child",
              tipo: "forma",
              figura: "star",
              x: 0,
              y: 0,
              width: 80,
              height: 80,
              motionEffect: "reveal",
            },
            {
              id: "map-child",
              tipo: "mapa-google",
              x: 100,
              y: 0,
              width: 300,
              height: 220,
              googlePlaceId: "place-1",
              mostrarMapa: true,
              motionEffect: "reveal",
            },
          ],
        },
      ],
      SECTIONS
    );
    const dom = new JSDOM(`<body>${html}</body>`);
    const shape = dom.window.document.querySelector(
      '[data-group-child-id="shape-child"]'
    );
    const map = dom.window.document.querySelector('[data-group-child-id="map-child"]');

    assert.equal(shape?.getAttribute("data-type"), "shape");
    assert.equal(shape?.getAttribute("data-motion"), "reveal");
    assert.equal(map?.getAttribute("data-type"), "mapa-google");
    assert.equal(map?.getAttribute("data-motion"), "reveal");
    assert.equal(map?.classList.contains("group-child-root"), true);
    assert.equal(map?.hasAttribute("data-obj-id"), false);
  } finally {
    if (previousApiKey === undefined) {
      delete process.env.GOOGLE_MAPS_EMBED_API_KEY;
    } else {
      process.env.GOOGLE_MAPS_EMBED_API_KEY = previousApiKey;
    }
  }
});

test("motion runtime discovers and activates grouped child roots", async () => {
  const runtime = generarMotionEffectsRuntimeHTML();
  const dom = new JSDOM(
    `<!doctype html><html><body>
      <div class="group-child-root" data-group-child-id="title" data-type="text" data-motion="reveal">Hola</div>
      <div class="group-child-root" data-group-child-id="cta" data-type="rsvp" data-motion="rsvp">Confirmar</div>
      <div class="group-child-root" data-group-child-id="countdown" data-type="countdown" data-motion="pulse">
        <div class="cd-chip">00</div>
      </div>
      ${runtime}
    </body></html>`,
    {
      pretendToBeVisual: true,
      runScripts: "dangerously",
    }
  );

  await new Promise((resolve) => setTimeout(resolve, 80));
  const child = dom.window.document.querySelector('[data-group-child-id="title"]');
  const cta = dom.window.document.querySelector('[data-group-child-id="cta"]');
  const countdownChip = dom.window.document.querySelector(
    '[data-group-child-id="countdown"] .cd-chip'
  );
  const cssRules = Array.from(dom.window.document.styleSheets).flatMap((sheet) =>
    Array.from(sheet.cssRules || [])
  );
  const rsvpRule = cssRules.find((rule) =>
    String(rule.selectorText || "").includes('[data-type="rsvp"].mefx-rsvp')
  );
  const countdownChipRule = cssRules.find((rule) =>
    String(rule.selectorText || "") === '[data-type="countdown"].mefx-pulse .cd-chip'
  );

  assert.equal(child?.classList.contains("mefx-reveal-init"), true);
  assert.equal(child?.classList.contains("mefx-reveal-on"), true);
  assert.equal(cta?.classList.contains("mefx-rsvp"), true);
  assert.equal(cta?.matches(rsvpRule?.selectorText || "__missing__"), true);
  assert.match(String(rsvpRule?.style?.animation || ""), /mefxRsvp/);
  assert.equal(countdownChip?.matches(countdownChipRule?.selectorText || "__missing__"), true);
  assert.match(
    String(countdownChipRule?.style?.animation || ""),
    /mefxPulseCountdownChip/
  );
  dom.window.close();
});
