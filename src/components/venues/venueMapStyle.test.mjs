import test from "node:test";
import assert from "node:assert/strict";
import { createExpression } from "@maplibre/maplibre-gl-style-spec";
import { mapProject } from "./venueMapModel.js";
import { spanishVenueMapStyle, venueMapCamera, venueMapRequest, VENUE_MAP_STYLE_URL } from "./venueMapStyle.js";

const label = ["coalesce", ["get", "name_en"], ["get", "name"]];
const sourceStyle = () => ({ version: 8, sources: { openmaptiles: { type: "vector", url: "https://tiles.openfreemap.org/planet" } }, layers: [
  { id: "country", type: "symbol", layout: { "text-field": label, "text-size": 14 } },
  { id: "road", type: "symbol", layout: { "text-field": ["to-string", ["get", "ref"]] } },
  { id: "land", type: "fill" },
] });
function evaluate(expression, properties) {
  const compiled = createExpression(expression, "layers[0].layout.text-field");
  assert.equal(compiled.result, "success", JSON.stringify(compiled.value));
  return compiled.value.evaluate({ zoom: 4 }, { properties });
}

test("Spanish labels replace English cartography while preserving road references and input style", () => {
  const input = sourceStyle();
  const snapshot = structuredClone(input);
  const output = spanishVenueMapStyle(input);
  const text = output.layers[0].layout["text-field"];
  // Public tile fields observed in OpenFreeMap, not a label hardcoded by the app.
  const malvinas = { name: "Falkland Islands", name_en: "Falkland Islands", "name:es": "Islas Malvinas" };
  assert.equal(evaluate(text, malvinas), "Islas Malvinas");
  assert.equal(evaluate(text, { name: "Localidad sin traducción" }), "Localidad sin traducción");
  assert.equal(evaluate(text, { name_es: "Argentina", name: "Argentina" }), "Argentina");
  assert.equal(output.layers[0].layout["text-size"], 14);
  assert.deepEqual(output.layers[1], input.layers[1]);
  assert.deepEqual(output.layers[2], input.layers[2]);
  assert.deepEqual(input, snapshot);
  assert.deepEqual(output.projection, { type: "mercator" });
  assert.throws(() => spanishVenueMapStyle({ layers: [] }), /Invalid/);
});

test("token labels translate names and preserve real fallbacks, literals and road references", () => {
  const input = sourceStyle();
  const cases = [
    { text: "{name}", properties: { name: "Rosario" }, expected: "Rosario" },
    { text: "{name}", properties: { name: "Falkland Islands", "name:es": "Islas Malvinas" }, expected: "Islas Malvinas" },
    { text: "Lugar {name} · Ruta {ref}", properties: { name: "Local", "name:es": "Nombre español", ref: 9 }, expected: "Lugar Nombre español · Ruta 9" },
    { text: "Lugar {name} · Ruta {ref}", properties: { name: "Local", ref: "RN 9" }, expected: "Lugar Local · Ruta RN 9" },
    { text: "{name:latin} / {name:latin}", properties: { "name:latin": "Rosario" }, expected: "Rosario / Rosario" },
    { text: "{name:es-AR}", properties: { "name:es-AR": "Nombre regional" }, expected: "Nombre regional" },
    { text: "{name} {ref}", properties: {}, expected: " " },
  ];
  for (const { text, properties, expected } of cases) {
    input.layers[0].layout["text-field"] = text;
    const expression = spanishVenueMapStyle(input).layers[0].layout["text-field"];
    assert.equal(evaluate(expression, properties), expected, text);
    assert.equal(input.layers[0].layout["text-field"], text, "The remote style remains unmodified");
  }
  input.layers[0].layout["text-field"] = "Ruta {ref}";
  assert.equal(spanishVenueMapStyle(input).layers[0].layout["text-field"], "Ruta {ref}", "A reference-only field retains native MapLibre token handling");
});

test("base resource requests omit cookies and full referrer paths for every resource", () => {
  for (const url of [VENUE_MAP_STYLE_URL, "https://tiles.openfreemap.org/planet", "https://tiles.openfreemap.org/planet/latest/4/5/10.pbf",
    "https://tiles.openfreemap.org/fonts/Noto%20Sans%20Regular/0-255.pbf", "https://tiles.openfreemap.org/sprites/ofm_f384/ofm.png"]) {
    assert.deepEqual(venueMapRequest(url), { url, credentials: "omit", referrerPolicy: "origin" });
  }
  for (const url of ["http://tiles.openfreemap.org/planet", "https://another-provider.invalid/tiles", "/private/provider", "data:application/json,{}"]) {
    assert.throws(() => venueMapRequest(url));
  }
});

test("vector camera shares the existing Mercator overlay scale and never acquires provider data", () => {
  for (const zoom of [3, 4, 13, 17]) {
    const view = { lat: -51.8, lng: -59.5, zoom, providerId: "must-not-cross-boundary" };
    const camera = venueMapCamera(view);
    assert.deepEqual(camera, { center: [-59.5, -51.8], zoom: zoom - 1, bearing: 0, pitch: 0 });
    const projected = mapProject(view, zoom);
    const vectorWorldSize = 512 * 2 ** camera.zoom;
    assert.equal(projected.x, (view.lng + 180) / 360 * vectorWorldSize);
    const latitude = view.lat * Math.PI / 180;
    assert.equal(projected.y, (1 - Math.log(Math.tan(latitude) + 1 / Math.cos(latitude)) / Math.PI) / 2 * vectorWorldSize);
  }
});
