import test from "node:test";
import assert from "node:assert/strict";
import { act } from "react";
import { mountPanel, loadComponent, ledger } from "./testSupport/panelHarness.mjs";
import { templateDraft, manualDecision, manualLocation } from "./testSupport/conversationRegressionFixture.mjs";
import useEditorDocumentOperation from "../../../hooks/useEditorDocumentOperation.js";
import * as features from "../../../domain/eventDetails/features.js";
import * as location from "../../../domain/editor/designerAiLocationInteraction.js";
import * as authoring from "../../../domain/eventDetails/locationAuthoring.js";

const action = (type, args) => ({ type, arguments: args });
const nextBlock = snapshot => ledger.buildDesignerAiConversationBrief(snapshot).nextBlock?.id;

// Real panel + real control + location owner + ledger/receipts. Only provider
// responses and editor durable I/O are synthetic; no remote invitation is used.
for (const branch of ["selection", "retry then selection", "failure then manual"]) {
  test(`template names → single party → Places: ${branch}`, async () => {
    let attempts = 0, detailsFetched = 0;
    const noop = () => null;
    const Control = loadComponent(new URL("./DesignerAiLocationControl.jsx", import.meta.url), {
      "@/hooks/useEditorDocumentOperation": useEditorDocumentOperation,
      "lucide-react": { LoaderCircle: noop, MapPin: noop, Search: noop, X: noop },
      "@/domain/eventDetails/features": features,
      "@/domain/editor/designerAiLocationInteraction": location,
      "@/domain/eventDetails/locationAuthoring": authoring,
      "@/domain/eventDetails/googlePlaces": {
        getGoogleMapsApiKey: () => "synthetic",
        createGooglePlacesSessionToken: async () => { if (++attempts === 1 && branch !== "selection") throw new Error("synthetic load failure"); return {}; },
        fetchGooglePlaceSuggestions: async () => [1, 2].map(id => ({ id, label: `Salón de prueba ${id}`, prediction: { id } })),
        fetchGooglePlaceDetailsFromPrediction: async prediction => {
          detailsFetched++;
          return { placeId: `synthetic-place-${prediction.id}`, displayName: "Salón de prueba", formattedAddress: "Calle Ejemplo 123", addressComponents: [], lat: -34.5, lng: -58.4 };
        },
      },
    });
    const draft = templateDraft();
    Object.assign(draft.authoring.defaults, { event_primary_person_name: "Juan", event_secondary_person_name: "María" });
    const run = await mountPanel({ savedDraft: draft, locationControl: Control, respond: (payload, index) => {
      const result = { assistantMessage: "Seguimos.", actions: [], resolutions: [], controlRequest: null };
      if (index === 1) {
        assert.equal(nextBlock(payload.capabilitySnapshot), "names");
        result.assistantMessage = "Para empezar, ¿me compartís los nombres de quienes se casan?";
      } else if (index === 2) {
        result.actions = [action("event.set_people", { primaryName: "Ana", secondaryName: "Luz" })];
      } else if (index === 3) {
        assert.equal(nextBlock(payload.capabilitySnapshot), "event_structure");
        result.actions = [action("event.set_mode", { mode: "single" })];
        result.resolutions = [{ leafId: "event.ceremony.end_time", status: "resolved_by_rule", rule: "optional_end_time_omitted" }];
      } else if (index === 4) {
        assert.equal(nextBlock(payload.capabilitySnapshot), "event_data");
        result.actions = [action("event.set_datetime", { phase: "ceremony", date: "2026-12-24", startTime: "20:00", endTime: null }),
          action("event.set_location_text", { phase: "ceremony", venueName: "Salón de prueba", address: "" })];
        result.controlRequest = { type: "google_place_picker", phase: "ceremony" };
      } else if (branch === "failure then manual") {
        result.actions = manualLocation;
        result.resolutions = [manualDecision];
      } else {
        assert.equal(nextBlock(payload.capabilitySnapshot), "dress_code");
        result.assistantMessage = "¿Quieren incluir Dress Code?";
      }
      return { ...result, intent: result.actions.length || result.controlRequest ? "apply" : "clarify" };
    } });
    try {
      await run.until(() => run.messages().length === 1);
      await run.send("Somos Ana y Luz.");
      assert.match(run.messages().at(-1).content, /ceremonia y fiesta/);
      await run.send("Solo fiesta.");
      await run.send("24 de diciembre de 2026, a las 20. Busquemos Salón de prueba en Google Maps.");
      await run.until(() => document.querySelector('[role="option"]') || document.querySelector('[role="alert"]'));
      assert.equal(detailsFetched, 0);
      assert.equal(run.snapshot().values.ceremony.placeSelected, false);
      if (branch === "failure then manual") {
        assert.match(document.body.textContent, /No pudimos cargar Google Maps/);
        await run.click("Volver al chat");
        assert.equal(document.querySelector('[data-designer-ai-location-control]'), null);
        await run.send("El lugar es Salón de prueba, Calle Ejemplo 123. Lo ingresamos manualmente, sin Maps.");
        assert.equal(detailsFetched, 0);
        assert.equal(run.snapshot().values.ceremony.placeSelected, false);
      } else {
        if (branch === "retry then selection") {
          await run.click("Reintentar");
          await run.until(() => document.querySelectorAll('[role="option"]').length === 2);
          assert.equal(attempts, 2);
        }
        assert.equal(detailsFetched, 0);
        await act(async () => document.querySelectorAll('[role="option"]')[1].click());
        await run.until(() => !document.querySelector('[data-designer-ai-location-control]') && run.calls.length === 5);
        assert.equal(detailsFetched, 1);
        assert.equal(run.snapshot().values.ceremony.placeSelected, true);
      }
      assert.equal(run.snapshot().values.ceremony.address, "Calle Ejemplo 123");
      assert.equal(nextBlock(run.snapshot()), "dress_code");
      assert.match(run.messages().at(-1).content, /Dress Code/);
      assert.equal(run.messages().some(message => message.intent === "error"), false);
      assert.equal(run.exportPersistedDraft().authoring.defaults.event_ceremony_venue_address, "Calle Ejemplo 123");
    } finally { await run.close(); }
  });
}
