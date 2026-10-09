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
      assert.match(run.messages().at(-1).content, /Dress Code desactivado/);
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
