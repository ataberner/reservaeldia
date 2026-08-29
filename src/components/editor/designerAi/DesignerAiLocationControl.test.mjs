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

test("location control contains only location selection and an explicit return to chat", () => {
  assert.match(source, /role="combobox"/);
  assert.match(source, /role="listbox"/);
  assert.match(source, /elegí explícitamente el resultado correcto/);
  assert.match(source, /Cerrar Google Maps y volver al chat/);
  assert.match(source, />Volver al chat</);
  assert.doesNotMatch(source, /Dress Code|Regalos|RSVP|Hora de inicio|type="date"/);
});

test("location control fills the available area, stays touchable and scrolls its own results", () => {
  assert.match(source, /min-h-11/);
  assert.match(source, /h-full min-h-0[^"]*min-w-0 max-w-full[^"]*flex-col overflow-hidden/);
  assert.match(source, /min-h-0[^"]*flex-1 overflow-y-auto overflow-x-hidden/);
  assert.match(source, /overflow-y-auto overflow-x-hidden/);
  assert.match(source, /overscroll-contain/);
});
