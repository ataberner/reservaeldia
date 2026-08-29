import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./DesignerAiLocationControl.jsx", import.meta.url), "utf8");

test("inline control reuses the Places and event-location owners", () => {
  assert.match(source, /fetchGooglePlaceSuggestions/);
  assert.match(source, /fetchGooglePlaceDetailsFromPrediction/);
  assert.match(source, /applyEventGooglePlaceSelection/);
  assert.match(source, /onSelectionApplied/);
  assert.doesNotMatch(source, /placeId:\s*["'`]/);
});

test("inline control contains only location selection and explicit cancellation", () => {
  assert.match(source, /role="combobox"/);
  assert.match(source, /role="listbox"/);
  assert.match(source, /elegí explícitamente el resultado correcto/);
  assert.match(source, /Cancelar búsqueda en Google Maps/);
  assert.doesNotMatch(source, /Dress Code|Regalos|RSVP|Hora de inicio|type="date"/);
});

test("inline control is width-safe, touchable and scrolls its own results", () => {
  assert.match(source, /min-h-11/);
  assert.match(source, /min-w-0 max-w-full/);
  assert.match(source, /overflow-y-auto overflow-x-hidden/);
  assert.match(source, /overscroll-contain/);
});
