import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { loadComponent, mountPanel } from "./testSupport/panelHarness.mjs";
import useEditorDocumentOperation from "../../../hooks/useEditorDocumentOperation.js";
import * as features from "../../../domain/eventDetails/features.js";
import * as location from "../../../domain/editor/designerAiLocationInteraction.js";

const source = readFileSync(new URL("./DesignerAiLocationControl.jsx", import.meta.url), "utf8");

test("E9 real control retries loading with the same query and still requires a human selection", async () => {
  const run = await mountPanel({ respond: async () => ({ assistantMessage: "Seguimos." }) });
  const mount = document.createElement("div");
  document.body.appendChild(mount);
  const root = createRoot(mount);
  let attempts = 0, selections = [], applied = [];
  const noop = () => null;
  const Control = loadComponent(new URL("./DesignerAiLocationControl.jsx", import.meta.url), {
    "@/hooks/useEditorDocumentOperation": useEditorDocumentOperation,
    "lucide-react": { LoaderCircle: noop, MapPin: noop, Search: noop, X: noop },
    "@/domain/eventDetails/features": features,
    "@/domain/editor/designerAiLocationInteraction": location,
    "@/domain/eventDetails/googlePlaces": {
      getGoogleMapsApiKey: () => "synthetic",
      createGooglePlacesSessionToken: async () => { if (++attempts === 1) throw new Error("synthetic"); return {}; },
      fetchGooglePlaceSuggestions: async (query) => { assert.equal(query, "Salón Ejemplo"); return [1, 2].map((id) => ({ id, label: `Salón ${id}`, prediction: { id } })); },
      fetchGooglePlaceDetailsFromPrediction: async (prediction) => { selections.push(prediction.id); return { googlePlaceId: `place-${prediction.id}` }; },
    },
    "@/domain/eventDetails/locationAuthoring": { applyEventGooglePlaceSelection: async ({ googlePlace }) => { applied.push(googlePlace); return googlePlace; } },
  });
  try {
    await act(async () => root.render(React.createElement(Control, { initialQuery: "Salón Ejemplo", onSelectionApplied: () => true })));
    await run.until(() => mount.textContent.includes("No pudimos cargar Google Maps"));
    assert.match(mount.textContent, /manualmente/);
    await act(async () => [...mount.querySelectorAll("button")].find((b) => b.textContent.trim() === "Reintentar").click());
    await run.until(() => mount.querySelectorAll('[role="option"]').length === 2);
    assert.equal(attempts, 2);
    assert.equal(applied.length, 0);
    await act(async () => mount.querySelectorAll('[role="option"]')[1].click());
    assert.deepEqual(selections, [2]);
    assert.deepEqual(applied, [{ googlePlaceId: "place-2" }]);
  } finally { await act(async () => root.unmount()); await run.close(); }
});

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
