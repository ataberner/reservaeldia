import test from "node:test";
import assert from "node:assert/strict";
import { mountPanel, ledger } from "./testSupport/panelHarness.mjs";
import { templateDraft, manualDecision, manualLocation } from "./testSupport/conversationRegressionFixture.mjs";
import service from "../../../../functions/lib/designerAi/service.js";

const action = (type, args) => ({ type, arguments: args });
const preservedText = "Elegante sport";
const deferred = { intent: "clarify", assistantMessage: "Lo dejamos para más adelante.", actions: [],
  controlRequest: null, resolutions: [{ leafId: "event.dress_code.enabled", status: "deferred_by_user", rule: null }] };
const disabled = { intent: "apply", assistantMessage: "Dress Code desactivado.",
  // Template text is hidden from the model; disabling must preserve it anyway.
  actions: [action("event.set_dress_code", { enabled: false, value: "" })],
  controlRequest: null, resolutions: [] };
const textRequested = { intent: "clarify", assistantMessage: "Falta indicar el texto.", actions: [],
  controlRequest: null, resolutions: [{ leafId: "event.dress_code.value", status: "needs_clarification", rule: null }],
  clarification: { leafId: "event.dress_code.value", kind: "missing_value" } };

async function mountAtDressCodeChoice({ enabled = false, respond, failMetadata } = {}) {
  const draft = templateDraft();
  draft.authoring.defaults.event_dress_code = preservedText;
  draft.render.eventDetails.dressCode = { enabled };
  const run = await mountPanel({ savedDraft: draft, failMetadata, respond: (payload, index) => {
    if (index === 1) return { assistantMessage: "Hola.", entryGreeting: "Hola." };
    if (index === 2) return { intent: "apply", assistantMessage: "Listo.", actions: [
      action("event.set_people", { primaryName: "Ana", secondaryName: "Luz" }),
      action("event.set_mode", { mode: "single" }),
      action("event.set_datetime", { phase: "ceremony", date: "2027-08-24", startTime: "20:00", endTime: null }),
      ...manualLocation,
    ], resolutions: [manualDecision] };
    return service.validateDesignerAiModelResult(respond(payload, index - 2), payload.capabilitySnapshot);
  } });
  await run.until(() => run.messages().length === 1);
  await run.send("Somos Ana y Luz. Un único evento el 24/08/2027 a las 20 en Salón de prueba, Calle Ejemplo 123. Sin Maps.");
  assert.equal(ledger.buildDesignerAiConversationBrief(run.snapshot()).nextStep.kind, "dress_code_enabled");
  assert.match(run.messages().at(-1).content, /¿Quieren incluir Dress Code\? Si es así, ¿cuál\?/);
  return run;
}

for (const message of ["Formal", "Sí, Formal", "No"]) {
  test(`the unified Dress Code question accepts one complete answer: ${message}`, async () => {
    const enabled = message !== "No";
    const run = await mountAtDressCodeChoice({ respond: () => ({ intent: "apply", assistantMessage: "Formal guardado.",
      actions: [action("event.set_dress_code", { enabled, value: enabled ? "Formal" : "" })], controlRequest: null, resolutions: [] }) });
    try {
      const before = run.writes.length;
      await run.send(message);
      assert.deepEqual(run.snapshot().values.dressCode, { enabled, value: enabled ? "Formal" : preservedText });
      assert.equal(run.writes.length, before + 1);
      assert.equal(ledger.buildDesignerAiConversationBrief(run.snapshot()).nextStep.kind, "rsvp_enabled");
      assert.equal(run.messages().at(-1).content, "Listo, actualizado. ¿Quieren que los invitados confirmen asistencia desde la invitación?");
      assert.doesNotMatch(run.messages().at(-1).content, /Formal|Dress Code/);
    } finally { await run.close(); }
  });
}

for (const enabled of [false, true]) {
  test(`yes without Dress Code text preserves inherited data and asks for text after reload (enabled: ${enabled})`, async () => {
    // Cover the recovered missing resolution as well as a complete proposal.
    let run = await mountAtDressCodeChoice({ enabled,
      respond: () => enabled ? textRequested : { ...textRequested, resolutions: [] } });
    try {
      const writesBefore = run.writes.length;
      const metadataBefore = run.metadataWrites();
      await run.send("Si");
      assert.equal(run.messages().at(-1).content, "¿Qué Dress Code quieren indicar?");
      assert.equal(run.writes.length, writesBefore);
      assert.equal(run.metadataWrites(), metadataBefore + 1);
      assert.deepEqual(run.snapshot().values.dressCode, { enabled, value: preservedText });
      assert.equal(run.snapshot().ledger.leaves.find((leaf) => leaf.id === "event.dress_code.enabled").status, "pending");
      assert.equal(run.snapshot().ledger.leaves.find((leaf) => leaf.id === "event.dress_code.value").status, "needs_clarification");
      const persisted = run.exportPersistedDraft();
      await run.close();
      run = await mountPanel({ savedDraft: persisted, respond: (payload, index) => index === 1
        ? { assistantMessage: "Hola de nuevo.", entryGreeting: "Hola de nuevo." }
        : service.validateDesignerAiModelResult({ intent: "apply", assistantMessage: "Listo.",
          actions: [action("event.set_dress_code", { enabled: true, value: "Cocktail" })],
          controlRequest: null, resolutions: [] }, payload.capabilitySnapshot) });
      await run.until(() => run.messages().length === 1);
      assert.equal(run.messages().at(-1).content, "Hola de nuevo. ¿Qué Dress Code quieren indicar?");
      assert.deepEqual(run.snapshot().values.dressCode, { enabled, value: preservedText });
      await run.send("Cocktail");
      assert.deepEqual(run.snapshot().values.dressCode, { enabled: true, value: "Cocktail" });
      assert.equal(ledger.buildDesignerAiConversationBrief(run.snapshot()).nextStep.kind, "rsvp_enabled");
      assert.match(run.messages().at(-1).content, /^Listo, actualizado\. ¿Quieren que los invitados/);
      assert.doesNotMatch(run.messages().at(-1).content, /Cocktail/);
      assert.equal(run.writes.length, 1);
    } finally { await run.close(); }
  });
}

for (const nextChoice of ["reject", "defer"]) {
  test(`a pending Dress Code text request accepts a later ${nextChoice} without clearing its inherited text`, async () => {
    let run = await mountAtDressCodeChoice({ enabled: true, respond: (_, index) => index === 1 ? textRequested
      : nextChoice === "reject" ? disabled
      : { ...textRequested, resolutions: [{ leafId: "event.dress_code.value", status: "deferred_by_user", rule: null }], clarification: null } });
    try {
      await run.send("Si");
      const writesBefore = run.writes.length;
      await run.send(nextChoice === "reject" ? "Mejor no queremos mostrar Dress Code." : "Todavía no sabemos cuál, lo decidimos después.");
      assert.equal(ledger.buildDesignerAiConversationBrief(run.snapshot()).nextStep.kind, "rsvp_enabled");
      assert.deepEqual(run.snapshot().values.dressCode, { enabled: nextChoice !== "reject", value: preservedText });
      assert.equal(run.writes.length, writesBefore + (nextChoice === "reject" ? 1 : 0));
      assert.doesNotMatch(run.messages().at(-1).content, /¿Quieren incluir Dress Code|¿Qué Dress Code/);
      const persisted = run.exportPersistedDraft();
      assert.equal(run.snapshot().ledger.leaves.find((leaf) => leaf.id === "event.dress_code.value").status,
        nextChoice === "reject" ? "not_applicable_by_dependency" : "deferred_by_user");
      await run.close();
      run = await mountPanel({ savedDraft: persisted, respond: () => ({ assistantMessage: "Hola.", entryGreeting: "Hola." }) });
      await run.until(() => run.messages().length === 1);
      assert.equal(ledger.buildDesignerAiConversationBrief(run.snapshot()).nextStep.kind, "rsvp_enabled");
      assert.doesNotMatch(run.messages().at(-1).content, /Dress Code/);
    } finally { await run.close(); }
  });
}

test("a failed save of the Dress Code text request neither enables the feature nor survives reload as a choice", async () => {
  let failMetadata = false;
  let run = await mountAtDressCodeChoice({ respond: () => textRequested, failMetadata: () => failMetadata });
  try {
    const writesBefore = run.writes.length;
    failMetadata = true;
    await run.send("Si");
    assert.equal(run.messages().at(-1).intent, "error");
    assert.equal(run.writes.length, writesBefore);
    const persisted = run.exportPersistedDraft();
    assert.deepEqual(run.snapshot().values.dressCode, { enabled: false, value: preservedText });
    await run.close();
    run = await mountPanel({ savedDraft: persisted, respond: () => ({ assistantMessage: "Hola.", entryGreeting: "Hola." }) });
    await run.until(() => run.messages().length === 1);
    assert.equal(ledger.buildDesignerAiConversationBrief(run.snapshot()).nextStep.kind, "dress_code_enabled");
  } finally { await run.close(); }
});

// Real interpreter, panel, executor, ledger and saved receipts. The provider and
// editor I/O are synthetic: this tests the boundary, not live-model accuracy.
for (const variant of ["repair", "already disabled", "repeated invalid interpretation", "save failure", "explicit deferral"]) {
  test(`Dress Code answer reaches the persisted draft: ${variant}`, async () => {
    const draft = templateDraft();
    draft.name = "Casamiento Ana y Luz";
    draft.authoring.defaults.event_dress_code = preservedText;
    draft.render.eventDetails.dressCode = { enabled: variant !== "already disabled" };
    let providerCalls = 0, failWrite = false;
    const results = [];
    let run = await mountPanel({ savedDraft: draft, failWrite: () => failWrite, respond: async (payload, index) => {
      if (index === 1) return { assistantMessage: "Hola.", entryGreeting: "Hola." };
      if (index === 2) return { intent: "apply", assistantMessage: "Listo.", actions: [
        action("event.set_people", { primaryName: "Ana", secondaryName: "Luz" }),
        action("event.set_mode", { mode: "single" }),
        action("event.set_datetime", { phase: "ceremony", date: "2027-08-24", startTime: "20:00", endTime: null }),
        ...manualLocation,
      ], resolutions: [manualDecision] };
      const result = await service.interpretDesignerAiChat({ payload, client: { responses: { create: async () => {
        providerCalls++;
        const proposal = variant === "save failure" ? disabled
          : providerCalls === 1 || variant === "repeated invalid interpretation" || variant === "explicit deferral" ? deferred : disabled;
        return { output: [{ type: "function_call", name: "submit_designer_ai_result", arguments: JSON.stringify(proposal) }] };
      } } } });
      results.push(result);
      return result;
    } });
    try {
      await run.until(() => run.messages().length === 1);
      await run.send("Somos Ana y Luz. Un único evento el 24/08/2027 a las 20 en Salón de prueba, Calle Ejemplo 123. Sin Maps.");
      assert.equal(ledger.buildDesignerAiConversationBrief(run.snapshot()).nextStep.kind, "dress_code_enabled");
      assert.match(run.messages().at(-1).content, /¿Quieren incluir Dress Code\?/);
      const writesBeforeAnswer = run.writes.length;
      failWrite = variant === "save failure";
      await run.send(variant === "explicit deferral" ? "Todavía no sabemos, lo decidimos después." : "no");
      const persisted = run.exportPersistedDraft();
      assert.equal(persisted.authoring.defaults.event_dress_code, preservedText);

      if (["repeated invalid interpretation", "save failure"].includes(variant)) {
        assert.equal(providerCalls, variant === "save failure" ? 1 : 2);
        assert.equal(persisted.render.eventDetails.dressCode.enabled, true);
        assert.notEqual(persisted.conversation.resolutions.find(entry => entry.leafId === "event.dress_code.enabled")?.status, "resolved_from_user");
        assert.equal(run.messages().at(-1).intent, "error");
        assert.doesNotMatch(run.messages().at(-1).content, /Listo\. Dress Code desactivado|Lo dejamos para más adelante|¿Quieren que los invitados/);
        if (variant === "save failure") assert.match(run.messages().at(-1).content, /No pude confirmar el guardado/);
        return;
      }
      if (variant === "explicit deferral") {
        assert.equal(providerCalls, 1);
        assert.equal(run.writes.length, writesBeforeAnswer);
        assert.equal(persisted.render.eventDetails.dressCode.enabled, true);
        assert.equal(run.snapshot().ledger.leaves.find(leaf => leaf.id === "event.dress_code.enabled").status, "deferred_by_user");
        assert.match(run.messages().at(-1).content, /Lo dejamos para más adelante/);
        return;
      }

      assert.equal(providerCalls, 2, "one semantic repair, without asking the user to repeat no");
      assert.equal(results.at(-1).repairCount, 1);
      assert.equal(run.writes.length, writesBeforeAnswer + 1);
      assert.equal(persisted.render.eventDetails.dressCode.enabled, false);
      assert.equal(run.snapshot().ledger.leaves.find(leaf => leaf.id === "event.dress_code.enabled").status, "resolved_from_user");
      assert.equal(ledger.buildDesignerAiConversationBrief(run.snapshot()).nextStep.kind, "rsvp_enabled");
      assert.match(run.messages().at(-1).content, /^Listo, actualizado\. ¿Quieren que los invitados/);
      assert.doesNotMatch(run.messages().at(-1).content, /más adelante|¿Quieren incluir Dress Code/);
      await run.close();
      run = await mountPanel({ savedDraft: persisted, respond: () => ({ assistantMessage: "Hola de nuevo." }) });
      await run.until(() => run.messages().length === 1);
      assert.equal(run.snapshot().values.dressCode.enabled, false);
      assert.equal(run.snapshot().values.dressCode.value, preservedText);
      assert.equal(ledger.buildDesignerAiConversationBrief(run.snapshot()).nextStep.kind, "rsvp_enabled");
      assert.doesNotMatch(run.messages().at(-1).content, /incluir Dress Code/);
    } finally { await run.close(); }
  });
}
