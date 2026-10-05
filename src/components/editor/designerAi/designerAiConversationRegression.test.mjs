import test from "node:test";
import assert from "node:assert/strict";
import { mountPanel, ledger } from "./testSupport/panelHarness.mjs";
import { productionConversation, templateDraft, manualLocation, manualDecision } from "./testSupport/conversationRegressionFixture.mjs";
import service from "../../../../functions/lib/designerAi/service.js";

for (const variant of [
  { name: "production unknown place / RSVP no / gifts no" },
  { name: "known place", placeKnown: true },
  { name: "short date dd/mm/aa without extra clarification", shortDate: true },
  { name: "unknown place / RSVP yes / gifts no", rsvp: true },
  { name: "combined time and deferral / RSVP yes / gift list", rsvp: true, gifts: true, combinedTime: true },
]) {
  test(`production conversation regression: ${variant.name}`, async () => {
    const fixture = productionConversation(variant);
    const draft = templateDraft();
    const fields = structuredClone(draft.authoring.fieldsSchema);
    let run = await mountPanel({ savedDraft: draft, respond: async (payload, index) => {
      const step = fixture[index - 1];
      const result = service.validateDesignerAiModelResult({ intent: step.actions?.length ? "apply" : "clarify", assistantMessage: step.assistantMessage, actions: step.actions || [], resolutions: step.resolutions || [], controlRequest: null }, payload.capabilitySnapshot);
      return { ...result };
    } });
    try {
      await run.until(() => run.messages().length === 1);
      for (const step of fixture.slice(1)) {
        await run.send(step.user);
        assert.equal(run.messages().some((m) => m.intent === "error"), false, step.user + ": " + run.messages().at(-1).content);
        assert.doesNotMatch(run.messages().at(-1).content, /guardé \d cambios|Nombre de la invitación actualizado|Ceremonia ·/);
        if (step.user === "es el 24 de diceimbre") assert.match(run.messages().at(-1).content, /año/);
        if (step.user === "2026" || step.user === "24/12/26" || step.user === "es a las 20:00") {
          assert.equal(run.render().objetos.find((o) => o.id === "date-view").texto, "24|12|26");
          assert.equal(run.snapshot().values.ceremony.date, "2026-12-24");
        }
        if (step.user === "Si, es cocktail" || step.user === "ok") {
          assert.match(run.messages().at(-1).content, /confirmen asistencia/);
          assert.equal(ledger.buildDesignerAiConversationBrief(run.snapshot()).nextBlock.id, "rsvp");
        }
        if (step.actions?.some((a) => a.type === "rsvp.set_enabled")) {
          assert.match(run.messages().at(-1).content, /regalos/);
          assert.equal(ledger.buildDesignerAiConversationBrief(run.snapshot()).nextBlock.id, "gifts");
        }
      }
      const state = run.snapshot();
      assert.equal(state.ledger.guidedFlow.completion.complete, true);
      assert.equal(state.ledger.leaves.find((leaf) => leaf.id === "event.ceremony.end_time").status, "pending");
      assert.equal(state.ledger.guidedFlow.leafIds.includes("event.ceremony.end_time"), false);
      assert.doesNotMatch(run.messages().map((m) => m.content).join("\n"), /¿[^?]*(hora termina|hasta qué hora|hora de fin)/);
      assert.equal(run.exportPersistedDraft().conversation.usage.guidedFlowCompleted, true);
      assert.equal(run.messages().filter((m) => m.guidedCompletion).length, 1);
      assert.equal(run.render().objetos.find((o) => o.id === "time-view").texto, "20.00 hs.");
      assert.deepEqual(run.authoring.fieldsSchema, fields);
      assert.equal(state.values.rsvp.enabled, variant.rsvp === true);
      if (!variant.placeKnown) {
        assert.equal(state.ledger.leaves.find((l) => l.id === "event.ceremony.address").status, "deferred_by_user");
        assert.ok(state.ledger.completion.unresolvedLeafIds.includes("event.ceremony.address"));
        assert.match(run.messages().at(-1).content, /pendiente.*lugar del evento/);
      }
      assert.match(run.messages().at(-1).content, /sidebar.*pedirme cualquier cambio/);
      await run.click("Ver vista previa");
      assert.equal(run.previews(), 1);
      const saved = run.exportPersistedDraft();
      await run.close(); run = null;
      run = await mountPanel({ savedDraft: saved, respond: async (payload, index) => {
        assert.equal(payload.capabilitySnapshot.conversation.mode, "editing");
        return index === 1 ? { assistantMessage: "Seguimos ajustando." }
          : { ...service.validateDesignerAiModelResult({ intent: "apply", assistantMessage: "Actualicé el lugar del evento.", actions: manualLocation, resolutions: [manualDecision], controlRequest: null }, payload.capabilitySnapshot) };
      } });
      await run.until(() => run.messages().length === 1);
      await run.send("Ya definimos el lugar: Salón de prueba, Calle Ejemplo 123. Sin Maps.");
      assert.equal(run.snapshot().values.ceremony.address, "Calle Ejemplo 123");
      assert.equal(run.snapshot().ledger.leaves.find((l) => l.id === "event.ceremony.address").status, "resolved_from_user");
      assert.equal(run.messages().some((m) => m.guidedCompletion), false);
      assert.equal(run.messages().at(-1).content, "Actualicé el lugar del evento.");
    } finally { await run?.close(); }
  });
}
