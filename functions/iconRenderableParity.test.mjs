import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { JSDOM } from "jsdom";

import { requireBuiltModule } from "./testUtils/requireBuiltModule.mjs";

const require = createRequire(import.meta.url);
const { buildIconSvgDataUrl } = require("../shared/iconRenderableContract.cjs");
const { generarHTMLDesdeObjetos } = requireBuiltModule(
  "lib/utils/generarHTMLDesdeObjetos.js"
);
const { validatePreparedPublicationRenderState } = requireBuiltModule(
  "lib/render/prepareRenderPayload.js"
);

function canonicalIconObject(overrides = {}) {
  const svgText = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 20" preserveAspectRatio="xMidYMid meet"><g transform="translate(2 0)"><rect width="12" height="20" fill="currentColor"/><circle cx="28" cy="10" r="8" fill="#ffcc00" stroke="#222"/></g></svg>';
  const iconRender = {
    schemaVersion: 1,
    contractId: "icon_svg_snapshot_v1",
    mediaType: "image/svg+xml",
    svgText,
    viewBox: "0 0 40 20",
    viewBoxWidth: 40,
    viewBoxHeight: 20,
    colorMode: "currentColor",
    geometryCount: 2,
    bytes: Buffer.byteLength(svgText),
    hashSha256: createHash("sha256").update(svgText).digest("hex"),
  };
  return {
    id: "icon-canonical",
    tipo: "icono",
    formato: "svg",
    iconRender,
    colorizable: true,
    color: "#7c3aed",
    seccionId: "section-1",
    x: 10,
    y: 20,
    width: 160,
    height: 100,
    ...overrides,
  };
}

test("generated preview/publish HTML consumes the same canonical SVG data URL as the editor contract", () => {
  const icon = canonicalIconObject();
  const html = generarHTMLDesdeObjetos(
    [icon],
    [{ id: "section-1", altoModo: "fijo", altura: 600 }]
  );
  const dom = new JSDOM(`<body>${html}</body>`);
  const image = dom.window.document.querySelector("img.icono-svg-canonico");
  assert.ok(image);
  assert.equal(image.getAttribute("src"), buildIconSvgDataUrl(icon.iconRender, icon.color));
  assert.match(image.getAttribute("style") || "", /object-fit:\s*contain/);
  assert.match(decodeURIComponent(image.getAttribute("src") || ""), /fill="#7c3aed"/);
  assert.match(decodeURIComponent(image.getAttribute("src") || ""), /fill="#ffcc00"/);
});

test("legacy tipo icono paths remains rendered through the compatibility adapter", () => {
  const html = generarHTMLDesdeObjetos(
    [{
      id: "icon-paths-legacy",
      tipo: "icono",
      formato: "svg",
      paths: [{ d: "M0 0h24v24H0z" }],
      viewBox: "0 0 24 24",
      color: "#111827",
      seccionId: "section-1",
      x: 0,
      y: 0,
      width: 24,
      height: 24,
    }],
    [{ id: "section-1", altoModo: "fijo", altura: 600 }]
  );
  assert.match(html, /<svg[^>]*class="objeto"/);
  assert.match(html, /<path d="M0 0h24v24H0z"/);
  assert.doesNotMatch(html, /icono-svg-canonico/);
});

test("publish validation blocks corrupt canonical snapshots and empty legacy SVG", () => {
  const section = { id: "section-1", altoModo: "fijo", altura: 600 };
  const corruptCanonical = canonicalIconObject({
    id: "corrupt-canonical",
    iconRender: { schemaVersion: 1 },
  });
  const emptyLegacy = {
    id: "empty-legacy",
    tipo: "icono",
    formato: "svg",
    paths: [],
    seccionId: "section-1",
  };
  const validation = validatePreparedPublicationRenderState({
    rawObjetos: [corruptCanonical, emptyLegacy],
    rawSecciones: [section],
    objetosFinales: [corruptCanonical, emptyLegacy],
    seccionesFinales: [section],
  });
  assert.equal(validation.canPublish, false);
  assert.ok(validation.blockers.some((entry) => entry.code === "icon-svg-canonical-invalid"));
  assert.ok(validation.blockers.some((entry) => entry.code === "icon-svg-geometry-missing"));
});
