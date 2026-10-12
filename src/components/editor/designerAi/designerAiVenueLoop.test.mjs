import test from "node:test";
import assert from "node:assert/strict";
import { act } from "react";
import { mountPanel, ledger } from "./testSupport/panelHarness.mjs";
import { templateDraft } from "./testSupport/conversationRegressionFixture.mjs";
import service from "../../../../functions/lib/designerAi/service.js";

const action = (type, args) => ({ type, arguments: args });
const venueSummary = "No pude interpretar el nombre del lugar. Probá escribiendo «El lugar se llama…».";
const venueAction = action("event.set_location_text", { phase: "ceremony", venueName: "friendly", address: "" });

async function typeWithoutSending(text) {
  const input = document.querySelector("textarea");
  const props = input[Object.keys(input).find(key => key.startsWith("__reactProps"))];
  await act(async () => props.onChange({ target: { value: text } }));
}

test("repeated venue answer exposes the final interpretation error and retries once without losing composed text", async () => {
  let run = await mountPanel({ savedDraft: templateDraft(), respond: (_, index) => {
    if (index === 1) return { assistantMessage: "Hola." };
    if (index === 2) return { actions: [action("event.set_people", { primaryName: "Ana", secondaryName: "Luz" })], assistantMessage: "Listo." };
    if (index === 3) return { actions: [action("event.set_mode", { mode: "single" })], assistantMessage: "Listo." };
    if (index === 4) return { actions: [action("event.set_datetime", { phase: "ceremony", date: "2026-12-24", startTime: "20:00", endTime: null })], assistantMessage: "Fecha guardada." };
    if (index === 5) return { assistantMessage: "¿Friendly es el nombre del lugar?", intent: "clarify", actions: [],
      clarification: { leafId: "event.ceremony.venue_name", kind: "missing_value" },
      resolutions: [{ leafId: "event.ceremony.venue_name", status: "needs_clarification", rule: null }] };
    if (index === 6) throw Object.assign(new Error("Synthetic exhausted interpretation repair"), {
      code: "functions/internal", details: { category: "invalid_model_output", summary: venueSummary,
        retryable: true, referenceId: "synthetic-venue-retry" },
    });
    assert.equal(index, 7, "the panel only retries when the person requests it");
    return { intent: "apply", actions: [venueAction], assistantMessage: "Guardé el lugar." };
  } });
  try {
    await run.until(() => run.messages().length === 1);
    await run.send("Somos Ana y Luz.");
    await run.send("un unico evento");
    await run.send("el 24/12/26 a las 20:00");
    assert.equal(run.snapshot().values.ceremony.date, "2026-12-24");
    assert.equal(run.snapshot().values.ceremony.startTime, "20:00");
    assert.equal(ledger.buildDesignerAiConversationBrief(run.snapshot()).nextStep.kind, "venue_name");
    const priorWrites = run.writes.length;
    let ownerCalls = 0;
    const updateLocation = window.canvasEditor.updateTemplateAuthoringEventLocation;
    window.canvasEditor.updateTemplateAuthoringEventLocation = async (...args) => {
      ownerCalls++;
      return updateLocation(...args);
    };

    await run.send("friendly");
    await run.send("friendly");
    const errorMessage = run.messages().at(-1);
    assert.equal(errorMessage.intent, "error");
    assert.ok(errorMessage.content.includes(venueSummary));
    assert.equal(ownerCalls, 0);
    assert.equal(run.writes.length, priorWrites);
    assert.equal(ledger.buildDesignerAiConversationBrief(run.snapshot()).nextStep.kind, "venue_name");
    const friendlyTurns = () => run.messages().filter(message => message.role === "user" && message.content === "friendly").length;
    assert.equal(friendlyTurns(), 2);

    const composed = "La dirección es Calle Ejemplo 123.";
    await typeWithoutSending(composed);
    await run.click("Reintentar");
    await run.until(() => run.calls.length === 7 && run.messages().at(-1).intent !== "error");
    assert.equal(run.calls.at(-1).message, "friendly");
    assert.deepEqual(run.calls.at(-1).recentTurns, run.calls[5].recentTurns);
    assert.equal(friendlyTurns(), 2, "retry must not append another copy of the user's answer");
    assert.equal(document.querySelector("textarea").value, composed);
    assert.equal(ownerCalls, 1);
    assert.equal(run.writes.length, priorWrites + 1);
    assert.equal(run.snapshot().values.ceremony.venueName, "friendly");
    assert.equal(run.snapshot().ledger.leaves.find(leaf => leaf.id === "event.ceremony.venue_name").status, "resolved_from_user");
    assert.equal(ledger.buildDesignerAiConversationBrief(run.snapshot()).nextStep.kind, "location_method");
    assert.match(run.messages().at(-1).content, /^Listo, actualizado\./);
    assert.doesNotMatch(run.messages().at(-1).content, /Cómo se llama el lugar/);
    const saved = run.exportPersistedDraft();
    assert.equal(saved.authoring.defaults.event_ceremony_venue_name, "friendly");

    await run.close(); run = null;
    run = await mountPanel({ savedDraft: saved, respond: () => ({ assistantMessage: "Seguimos." }) });
    await run.until(() => run.messages().length === 1);
    assert.equal(ledger.buildDesignerAiConversationBrief(run.snapshot()).nextStep.kind, "location_method");
    assert.equal(run.writes.length, 0);
    assert.doesNotMatch(run.messages().at(-1).content, /Cómo se llama el lugar/);
  } finally { await run?.close(); }
});

test("a repeated venue reply repaired by the service applies once and advances the panel from the fresh ledger", async () => {
  let providerCalls = 0;
  const serviceResults = [];
  const clarification = {
    intent: "clarify", assistantMessage: "¿Friendly es el nombre del lugar?", actions: [], controlRequest: null,
    clarification: { leafId: "event.ceremony.venue_name", kind: "missing_value" },
    resolutions: [{ leafId: "event.ceremony.venue_name", status: "needs_clarification", rule: null }],
  };
  const client = { responses: { create: async () => {
    providerCalls++;
    const result = providerCalls < 3 ? clarification : {
      intent: "apply", assistantMessage: "Guardé el lugar.", actions: [venueAction], controlRequest: null,
      clarification: null, resolutions: [],
    };
    return { _request_id: `synthetic-venue-${providerCalls}`, output: [{
      type: "function_call", name: "submit_designer_ai_result", arguments: JSON.stringify(result),
    }] };
  } } };
  const run = await mountPanel({ savedDraft: { ...templateDraft(), name: "Casamiento Ana y Luz" }, respond: async (payload, index) => {
    if (index === 1) return { assistantMessage: "Hola." };
    if (index === 2) return { actions: [action("event.set_people", { primaryName: "Ana", secondaryName: "Luz" })], assistantMessage: "Listo." };
    if (index === 3) return { actions: [action("event.set_mode", { mode: "single" })], assistantMessage: "Listo." };
    if (index === 4) return { actions: [action("event.set_datetime", { phase: "ceremony", date: "2026-12-24", startTime: "20:00", endTime: null })], assistantMessage: "Fecha guardada." };
    const result = await service.interpretDesignerAiChat({ payload, client });
    serviceResults.push(result);
    return result;
  } });
  try {
    await run.until(() => run.messages().length === 1);
    await run.send("Somos Ana y Luz.");
    await run.send("un unico evento");
    await run.send("el 24/12/26 a las 20:00");
    assert.equal(ledger.buildDesignerAiConversationBrief(run.snapshot()).nextStep.kind, "venue_name");
    const priorWrites = run.writes.length;
    let ownerCalls = 0;
    const updateLocation = window.canvasEditor.updateTemplateAuthoringEventLocation;
    window.canvasEditor.updateTemplateAuthoringEventLocation = async (...args) => {
      ownerCalls++;
      return updateLocation(...args);
    };

    await run.send("friendly");
    assert.equal(providerCalls, 1, "the first interpretation is allowed to request clarification");
    assert.equal(serviceResults[0].repairCount, 0);
    assert.equal(ownerCalls, 0);
    assert.equal(run.writes.length, priorWrites);

    await run.send("friendly");
    assert.equal(providerCalls, 3, "only the stalled repeated answer consumes one repair");
    assert.equal(serviceResults[1].repairCount, 1);
    assert.equal(run.calls.length, 6, "repair is internal to the existing backend request");
    assert.equal(run.messages().filter(message => message.role === "user" && message.content === "friendly").length, 2);
    assert.equal(run.messages().some(message => message.intent === "error"), false);
    assert.equal(ownerCalls, 1);
    assert.equal(run.writes.length, priorWrites + 1);
    assert.equal(run.exportPersistedDraft().authoring.defaults.event_ceremony_venue_name, "friendly");
    assert.equal(run.snapshot().ledger.leaves.find(leaf => leaf.id === "event.ceremony.venue_name").status, "resolved_from_user");
    assert.equal(ledger.buildDesignerAiConversationBrief(run.snapshot()).nextStep.kind, "location_method");
    assert.match(run.messages().at(-1).content, /^Listo, actualizado\./);
    assert.doesNotMatch(run.messages().at(-1).content, /Cómo se llama el lugar/);
  } finally { await run.close(); }
});
