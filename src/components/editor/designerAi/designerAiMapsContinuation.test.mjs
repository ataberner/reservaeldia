import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { act } from "react";
import { mountPanel, ledger, contract } from "./testSupport/panelHarness.mjs";
import { templateDraft } from "./testSupport/conversationRegressionFixture.mjs";
import { applyEventGooglePlaceSelection } from "../../../domain/eventDetails/locationAuthoring.js";
import service from "../../../../functions/lib/designerAi/service.js";
import { withDesignerAiGuidedContinuation } from "../../../domain/editor/designerAiGuidedConversation.js";

const location = { placeId: "synthetic-selected-place", displayName: "Salón de prueba", formattedAddress: "Calle Ejemplo 123", lat: -34, lng: -58 };
const staleReply = "Perfecto, el lugar quedó guardado. ¿Querés indicarme la dirección manualmente? Y, si ya la tienen definida, ¿hasta qué hora dura el evento?";
const action = (type, args) => ({ type, arguments: args });

// Exercise the real owner/verification/persistence path; only Places UI and the
// provider are synthetic. The returned copy reproduces the observed bad reply.
function SelectionControl({ phase, onSelectionApplied, onCancel }) {
  const [error, setError] = React.useState("");
  return React.createElement("section", { "data-designer-ai-location-control": phase },
    React.createElement("button", { onClick: async () => {
      try {
        const selected = await applyEventGooglePlaceSelection({ targetWindow: window, feature: phase, googlePlace: location });
        if (await onSelectionApplied(selected) === false) throw new Error("Selection is not verified");
      } catch (failure) { setError(failure.message); }
    } }, "Seleccionar resultado"),
    React.createElement("button", { onClick: onCancel }, "Cancelar selección"),
    error ? React.createElement("p", { role: "alert" }, error) : null);
}

for (const variant of ["new address", "same template address", "clarification", "deferred", "editing", "two phases", "cancel", "write failure", "metadata failure", "continuation failure"]) {
  test(`Maps selection resolves its text leaves and avoids asking again: ${variant}`, async () => {
    const draft = templateDraft();
    const twoPhases = variant === "two phases";
    if (variant === "same template address") Object.assign(draft.authoring.defaults, {
      event_ceremony_venue_address: location.formattedAddress, event_ceremony_venue_name: location.displayName,
    });
    if (twoPhases) {
      draft.authoring.fieldsSchema.push(...draft.authoring.fieldsSchema.filter(field => field.eventDetailsRole.startsWith("ceremony_")).map(field => ({
        ...field, key: field.key.replace("ceremony", "party"), eventDetailsRole: field.eventDetailsRole.replace("ceremony", "party"), applyTargets: [],
      })));
    }
    if (variant === "editing") draft.conversation = { usage: { hasStarted: true, guidedFlowCompleted: true } };
    let failWrite = false, failMetadata = false;
    let run = await mountPanel({ savedDraft: draft, locationControl: SelectionControl,
      failWrite: () => failWrite, failMetadata: () => failMetadata, respond: (payload, index) => {
      if (index === 1) return { assistantMessage: "¿Cómo se llaman?" };
      if (index === 2) return { actions: [action("event.set_people", { primaryName: "Ana", secondaryName: "Luz" })], assistantMessage: "¿Un único evento o ceremonia y fiesta?" };
      if (index === 3) return { actions: [action("event.set_mode", { mode: twoPhases ? "ceremony_party" : "single" }),
        action("event.set_datetime", { phase: "ceremony", date: "2026-12-24", startTime: "20:00", endTime: null })], assistantMessage: "¿Cómo se llama el lugar?" };
      if (index === 4) return { actions: variant === "same template address" ? [] : [action("event.set_location_text", { phase: "ceremony", venueName: location.displayName, address: "" })],
        resolutions: [{ leafId: "event.ceremony.place_selection", status: "needs_clarification", rule: null },
          ...(["clarification", "deferred"].includes(variant) ? [{ leafId: "event.ceremony.address", status: variant === "deferred" ? "deferred_by_user" : "needs_clarification", rule: null }] : [])],
        assistantMessage: "¿Querés buscarlo en Google Maps o cargar la dirección manualmente?" };
      if (variant === "continuation failure") throw new Error("Synthetic empty apply rejection");
      return { assistantMessage: staleReply };
    } });
    try {
      await run.until(() => run.messages().length === 1);
      await run.send("Somos Ana y Luz.");
      await run.send(twoPhases ? "Ceremonia y fiesta. La ceremonia es el 24/12/26 a las 20." : "Solo fiesta, el 24/12/26 a las 20.");
      await run.send("Se llama Salón de prueba.");
      await run.click("Buscar en Google Maps");
      if (variant === "cancel") {
        await run.click("Cancelar selección");
        assert.equal(run.calls.length, 4);
        assert.equal(run.snapshot().values.ceremony.placeSelected, false);
        assert.notEqual(run.snapshot().ledger.leaves.find(leaf => leaf.id === "event.ceremony.address").status, "resolved_by_control");
        return;
      }
      if (["write failure", "metadata failure"].includes(variant)) {
        failWrite = variant === "write failure";
        failMetadata = variant === "metadata failure";
        await act(async () => document.querySelector('[data-designer-ai-location-control] button').click());
        await run.until(() => document.querySelector('[role="alert"]'));
        assert.equal(run.calls.length, 4, "no model continuation before durable confirmation");
        assert.notEqual(run.exportPersistedDraft().conversation.resolutions.find(entry => entry.leafId === "event.ceremony.address")?.status, "resolved_by_control");
        failWrite = false; failMetadata = false;
      }
      await act(async () => document.querySelector('[data-designer-ai-location-control] button').click());
      await run.until(() => run.calls.length === 5 && !document.querySelector("textarea")?.disabled);
      if (variant === "continuation failure") {
        assert.equal(run.messages().at(-1).canRetryContinuation, true);
        await run.click("Continuar recorrido");
        assert.equal(run.calls.length, 5, "recovery derives the next question locally; no repeated empty-apply rejection");
        assert.equal(run.messages().some(message => message.canRetryContinuation), false);
      }
      const state = run.snapshot();
      assert.doesNotMatch(run.messages().at(-1).content, /dirección manual|Y, si/);
      for (const field of ["address", "venue_name", "place_selection"]) {
        assert.equal(state.ledger.leaves.find(leaf => leaf.id === `event.ceremony.${field}`).status, "resolved_by_control", field);
      }
      assert.equal(service.buildDesignerAiModelValues(run.calls.at(-1).capabilitySnapshot).ceremony.address, location.formattedAddress);
      if (variant === "editing") assert.doesNotMatch(run.messages().at(-1).content, /¿|\?/);
      else assert.match(run.messages().at(-1).content, twoPhases ? /¿Qué día es la fiesta\?/ : /¿Quieren incluir Dress Code\?/);
      assert.doesNotMatch(run.messages().at(-1).content, /hasta qué hora|hora termina/);
      if (twoPhases) {
        assert.equal(state.values.party.placeSelected, false);
        assert.ok(ledger.buildDesignerAiConversationBrief(state).unresolvedLeafIds.includes("event.party.address"));
      }
      const saved = run.exportPersistedDraft();
      assert.equal(saved.authoring.defaults.event_ceremony_venue_address, location.formattedAddress);
      assert.equal(saved.conversation.resolutions.find(entry => entry.leafId === "event.ceremony.address").status, "resolved_by_control");
      assert.equal(JSON.stringify(run.calls).includes("synthetic-selected-place"), false);
      await run.close(); run = null;
      run = await mountPanel({ savedDraft: saved, respond: (_, index) => index === 1
        ? { assistantMessage: "Seguimos con los datos pendientes." }
        : { actions: [action("event.set_location_text", { phase: "ceremony", venueName: location.displayName, address: "Otra calle 456" })],
          resolutions: [{ leafId: "event.ceremony.place_selection", status: "resolved_by_rule", rule: "leave_empty" }], assistantMessage: "Actualicé la dirección manualmente." } });
      await run.until(() => run.messages().length === 1);
      assert.equal(run.snapshot().ledger.leaves.find(leaf => leaf.id === "event.ceremony.address").status, "resolved_by_control");
      assert.equal(service.buildDesignerAiModelValues(run.calls[0].capabilitySnapshot).ceremony.address, location.formattedAddress);
      if (variant === "editing") {
        assert.equal(run.calls[0].capabilitySnapshot.conversation.mode, "editing");
        await run.send("Cambiá la dirección manualmente por Otra calle 456, sin Maps.");
        assert.equal(run.snapshot().values.ceremony.address, "Otra calle 456");
        assert.equal(run.snapshot().values.ceremony.placeSelected, false);
        assert.equal(run.snapshot().ledger.leaves.find(leaf => leaf.id === "event.ceremony.address").status, "resolved_from_user");
        assert.equal(run.calls[1].capabilitySnapshot.conversation.mode, "editing");
      }
    } finally { await run?.close(); }
  });
}

test("verified continuation suppresses stale questions without losing ordinary date clarification", () => {
  const values = contract.sanitizeCapabilitySnapshot({ values: { eventMode: "single", ceremony: { date: "" } } }).values;
  const snapshot = { values, conversation: { mode: "guided" }, ledger: ledger.buildDesignerAiLedger({ values, availability: { ceremonyDatetime: true } }) };
  const result = { intent: "clarify", actions: [], resolutions: [] };
  assert.equal(withDesignerAiGuidedContinuation("¿De qué año?", { previousSnapshot: snapshot, snapshot, result }), "¿De qué año?");
  const editing = { ...snapshot, conversation: { mode: "editing" } };
  assert.equal(withDesignerAiGuidedContinuation("¿Querés indicarme la dirección manualmente?", { previousSnapshot: editing, snapshot: editing, result, verifiedContinuation: true }), "Listo.");
});
