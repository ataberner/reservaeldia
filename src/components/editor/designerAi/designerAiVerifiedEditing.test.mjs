import test from "node:test";
import assert from "node:assert/strict";
import { mountPanel } from "./testSupport/panelHarness.mjs";
import rsvpConfig from "../../../../shared/rsvpConfig.cjs";

test("an RSVP question over the active limit is never saved or announced as activated", async () => {
  const run = await mountPanel({ savedDraft: { authoring: { fieldsSchema: [], defaults: {} },
    render: { objetos: [], secciones: [], eventDetails: { mode: "single" }, gifts: { enabled: false },
      rsvp: rsvpConfig.createDefaultRsvpConfig("wedding_complete") },
    conversation: { usage: { hasStarted: true, guidedFlowCompleted: true } } },
    respond: (_payload, index) => index === 1 ? { assistantMessage: "Hola.", entryGreeting: "Hola." }
      : { intent: "apply", assistantMessage: "Pregunta activada.",
        actions: [{ type: "rsvp.set_question_active", arguments: { questionId: "custom_1", active: true } }],
        resolutions: [], controlRequest: null, clarification: null },
  });
  try {
    await run.until(() => run.messages().length === 1);
    await run.send("Activá la primera pregunta personalizada");
    assert.equal(run.exportPersistedDraft().render.rsvp.questions.find(question => question.id === "custom_1").active, false);
    assert.equal(run.writes.length, 0);
    assert.equal(run.messages().at(-1).intent, "error");
    assert.doesNotMatch(run.messages().at(-1).content, /Pregunta activada|Listo/);
  } finally { await run.close(); }
});

for (const variant of ["no_action", "contradictory_action"]) {
  test(`editing never publishes unverified save claims (${variant})`, async () => {
    const run = await mountPanel({ fullFields: true,
      initialConversation: { usage: { hasStarted: true, guidedFlowCompleted: true } },
      respond: (_payload, index) => index === 1 ? { assistantMessage: "Hola.", entryGreeting: "Hola." }
        : { intent: variant === "no_action" ? "clarify" : "apply", assistantMessage: "El horario quedó guardado: 18:00.",
          actions: variant === "no_action" ? [] : [{ type: "event.set_datetime", arguments: { phase: "ceremony", date: null, startTime: "20:00", endTime: null } }],
          resolutions: [], controlRequest: null, clarification: null },
    });
    try {
      await run.until(() => run.messages().length === 1);
      await run.send("Cambiá el horario a las 20:00");
      assert.equal(run.snapshot().values.ceremony.startTime, variant === "no_action" ? "" : "20:00");
      assert.equal(run.writes.length, variant === "no_action" ? 0 : 1);
      assert.equal(run.messages().at(-1).content, variant === "no_action"
        ? "¿Qué dato querés ajustar y qué valor querés usar?" : "Listo, actualizado.");
      assert.doesNotMatch(run.messages().at(-1).content, /18:00/);
    } finally { await run.close(); }
  });
}

test("an ambiguous editing time request asks which phase and writes neither event", async () => {
  const leafId = "event.ceremony.start_time";
  const run = await mountPanel({ fullFields: true,
    initialConversation: { usage: { hasStarted: true, guidedFlowCompleted: true } },
    respond: (_payload, index) => index === 1 ? { assistantMessage: "Hola.", entryGreeting: "Hola." }
      : { intent: "clarify", assistantMessage: "¿A qué hora empieza la ceremonia?", actions: [], controlRequest: null,
        clarification: { leafId, kind: "missing_phase" },
        resolutions: [{ leafId, status: "needs_clarification", rule: null }] },
  });
  try {
    await run.until(() => run.messages().length === 1);
    run.update({ eventDetails: { mode: "ceremony_party" } });
    await run.send("Cambiá el horario");
    assert.equal(run.writes.length, 0);
    assert.equal(run.snapshot().values.ceremony.startTime, "");
    assert.equal(run.snapshot().values.party.startTime, "");
    assert.equal(run.messages().at(-1).content,
      "¿Querés cambiar el horario de inicio de la ceremonia o de la fiesta? Indicame también el nuevo dato.");
  } finally { await run.close(); }
});

test("editing end-time clarification follows a short phase answer without repeating the original request", async () => {
  const run = await mountPanel({ fullFields: true,
    initialConversation: { usage: { hasStarted: true, guidedFlowCompleted: true } },
    respond: (_payload, index) => {
      if (index === 1) return { assistantMessage: "Hola.", entryGreeting: "Hola." };
      const leafId = index === 2 ? "event.ceremony.end_time" : "event.party.end_time";
      return { intent: "clarify", assistantMessage: "Aclarame el dato.", actions: [], controlRequest: null,
        clarification: { leafId, kind: index === 2 ? "missing_phase" : "missing_value" },
        resolutions: [{ leafId, status: "needs_clarification", rule: null }] };
    },
  });
  try {
    await run.until(() => run.messages().length === 1);
    run.update({ eventDetails: { mode: "ceremony_party" } });
    await run.send("Cambiá la hora de fin");
    assert.match(run.messages().at(-1).content, /horario de fin de la ceremonia o de la fiesta/);
    await run.send("La fiesta");
    assert.equal(run.messages().at(-1).content, "¿A qué hora termina la fiesta?");
    assert.equal(run.writes.length, 0);
  } finally { await run.close(); }
});

for (const method of ["holder", "bank", "cuit", "alias", "cbu"]) {
  test(`inherited ${method} stays hidden and asks for the actual value in chat`, async () => {
    const inherited = "DATO HEREDADO";
    const run = await mountPanel({ savedDraft: { authoring: { fieldsSchema: [], defaults: {} },
      render: { objetos: [], secciones: [], eventDetails: { mode: "single" }, rsvp: { enabled: false },
        gifts: { enabled: false, bank: { [method]: inherited }, visibility: { [method]: false } } },
      conversation: { usage: { hasStarted: true, guidedFlowCompleted: true } } },
      respond: (_payload, index) => index === 1 ? { assistantMessage: "Hola.", entryGreeting: "Hola." }
        : { intent: "apply", assistantMessage: "Listo.", actions: [
          { type: "gifts.set_enabled", arguments: { enabled: true } },
          { type: "gifts.set_method", arguments: { method, value: index === 2 ? null : "VALOR APORTADO", visible: true } },
        ], resolutions: [], controlRequest: null, clarification: null },
    });
    try {
      await run.until(() => run.messages().length === 1);
      await run.send("Quiero usar datos bancarios");
      assert.equal(run.writes.length, 1, "the valid gift activation still saves");
      assert.equal(run.render().gifts.visibility[method], false);
      assert.doesNotMatch(document.body.textContent, /DATO HEREDADO/);
      assert.equal(document.getElementById("designer-gift-confirm-title"), null);
      assert.match(run.messages().at(-1).content, /Pasame .* que quieran mostrar/);
      assert.equal(run.exportPersistedDraft().render.gifts.bank[method], inherited);
      await run.send("Usá VALOR APORTADO");
      assert.equal(document.getElementById("designer-gift-confirm-title"), null);
      assert.equal(run.render().gifts.visibility[method], true);
      assert.equal(run.exportPersistedDraft().render.gifts.bank[method], "VALOR APORTADO");
    } finally { await run.close(); }
  });
}
