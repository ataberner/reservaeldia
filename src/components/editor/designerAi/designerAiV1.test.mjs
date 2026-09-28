import test from "node:test";
import assert from "node:assert/strict";
import { mountPanel, ledger } from "./testSupport/panelHarness.mjs";

const action = (type, args) => ({ type, arguments: args });
const completedInvitation = {
  intent: "apply", assistantMessage: "Datos actualizados.",
  actions: [
    action("event.set_people", { primaryName: "Ana", secondaryName: "Juan" }),
    action("event.set_mode", { mode: "single" }),
    action("event.set_datetime", { phase: "ceremony", date: "2027-03-15", startTime: "18:30", endTime: null }),
    action("event.set_location_text", { phase: "ceremony", venueName: "Salón de prueba", address: "Calle Ejemplo 123" }),
    action("gifts.set_enabled", { enabled: false }),
    action("event.set_dress_code", { enabled: false, value: "Elegante" }),
  ],
  resolutions: [
    { leafId: "event.ceremony.end_time", status: "resolved_by_rule", rule: "optional_end_time_omitted" },
    { leafId: "event.ceremony.place_selection", status: "resolved_by_rule", rule: "leave_empty" },
  ],
};

test("E11 retries the same failed provider turn once without adding a duplicate user message", async () => {
  const run = await mountPanel({ respond: async (_, i) => {
    if (i === 2) throw Object.assign(new Error("provider"), { code: "functions/internal", details: { retryable: true } });
    return { assistantMessage: "Seguimos." };
  } });
  try {
    await run.until(() => run.messages().length === 1);
    await run.send("Cambiá la hora a las 19.");
    assert.equal(run.writes.length, 0);
    await run.click("Reintentar");
    await run.until(() => run.calls.length === 3 && run.messages().at(-1).content === "Seguimos.");
    assert.equal(run.calls[2].message, run.calls[1].message);
    assert.equal(run.messages().filter((m) => m.role === "user").length, 1);
    assert.equal(run.writes.length, 0);
  } finally { await run.close(); }
});

test("E11 auto-start metadata failure recovers in place before calling the provider", async () => {
  const run = await mountPanel({ failMetadata: (n) => n === 1, respond: async () => ({ assistantMessage: "Hola, seguimos." }) });
  try {
    await run.until(() => run.messages().some((m) => m.intent === "error"));
    assert.equal(run.calls.length, 0);
    assert.doesNotMatch(run.messages().at(-1).content, /Cerrá/);
    await run.click("Reintentar");
    await run.until(() => run.messages().at(-1).content === "Hola, seguimos.");
    assert.equal(run.calls.length, 1);
  } finally { await run.close(); }
});

test("E11 a new intention invalidates the old failed request", async () => {
  const run = await mountPanel({ respond: async (_, i) => {
    if (i === 2) throw new Error("provider");
    return { assistantMessage: "Seguimos." };
  } });
  try {
    await run.until(() => run.messages().length === 1);
    await run.send("Activá RSVP.");
    await run.send("Mejor dejalo desactivado.");
    assert.equal(run.calls.at(-1).message, "Mejor dejalo desactivado.");
    assert.equal([...document.querySelectorAll("button")].some((b) => b.textContent.trim() === "Reintentar"), false);
  } finally { await run.close(); }
});

test("E12 current >700 character message occurs once, including safe retry", async () => {
  const long = "Historia solicitada: " + "a".repeat(820);
  const run = await mountPanel({ respond: async (_, i) => {
    if (i === 2) throw new Error("provider");
    return { assistantMessage: "Seguimos." };
  } });
  try {
    await run.until(() => run.messages().length === 1);
    await run.send(long);
    await run.click("Reintentar");
    await run.until(() => run.calls.length === 3 && run.messages().at(-1).content === "Seguimos.");
    for (const payload of run.calls.slice(1)) {
      assert.equal(payload.message, long);
      assert.ok(payload.recentTurns.length <= 6);
      assert.equal(payload.recentTurns.some((t) => t.content.startsWith("Historia solicitada:")), false);
    }
  } finally { await run.close(); }
});

test("execution feedback shows saving and withholds confirmation until the receipt arrives", async () => {
  let release;
  const pendingWrite = new Promise((resolve) => { release = resolve; });
  const run = await mountPanel({ beforeWrite: () => pendingWrite, respond: async () => ({ intent: "apply", assistantMessage: "Listo.", actions: [action("rsvp.set_enabled", { enabled: true })] }) });
  try {
    await run.until(() => run.writes.length === 1);
    assert.match(document.body.textContent, /Guardando/);
    assert.equal(run.messages().length, 0);
    release();
    await run.until(() => run.messages().some((m) => m.content === "Listo. RSVP activado."));
    assert.equal(run.snapshot().values.rsvp.enabled, true);
  } finally { release(); await run.close(); }
});

test("E8 guided -> complete -> editing: one closure, preview, sidebar reentry and reactive capabilities", async () => {
  const responses = [completedInvitation,
    { assistantMessage: "Listo, cambié la hora a las 19:30.", actions: [action("event.set_datetime", { phase: "ceremony", date: null, startTime: "19:30", endTime: null })] },
    { assistantMessage: "Listo, quedó a las 19.", actions: [action("event.set_datetime", { phase: "ceremony", date: null, startTime: "19:00", endTime: null })] },
    { assistantMessage: "Activé RSVP.", actions: [action("rsvp.set_enabled", { enabled: true })] },
    { assistantMessage: "Actualicé su historia.", actions: [action("story.set_text", { text: "Nos conocimos durante un viaje." })] },
    { assistantMessage: "Cambié la fecha.", actions: [action("event.set_datetime", { phase: "ceremony", date: "2027-12-12", startTime: null, endTime: null })] },
    { assistantMessage: "Actualicé el Dress Code.", actions: [action("event.set_dress_code", { enabled: true, value: "Elegante sport" })] },
    { assistantMessage: "Saqué la pregunta de restricciones alimentarias.", actions: [action("rsvp.set_question_active", { questionId: "dietary_notes", active: false })] },
    { assistantMessage: "La dirección quedó pendiente.", actions: [action("event.set_location_text", { phase: "ceremony", venueName: "Salón de prueba", address: "" })] },
  ];
  const run = await mountPanel({ fullFields: true, respond: async (_, index) => ({ intent: "apply", ...responses[index - 1] }) });
  try {
    await run.until(() => run.messages().some((m) => m.guidedCompletion));
    assert.equal(run.snapshot().ledger.guidedFlow.completion.complete, true);
    assert.equal(run.journeyRef.current.editing, true);
    await run.toggle(false);
    await run.toggle(true);
    assert.equal(run.calls.length, 1);
    assert.equal(run.messages().filter((m) => m.guidedCompletion).length, 1);
    const before = run.metadataWrites();
    await run.click("Ver vista previa");
    assert.equal(run.previews(), 1);
    assert.equal(run.metadataWrites(), before);
    assert.equal(run.snapshot().ledger.guidedFlow.completion.complete, true);
    await run.click("Seguir ajustando");
    assert.equal(document.activeElement, document.querySelector("textarea"));
    await run.send("Cambiá la ceremonia a las 19:30.");
    await run.send("Mejor dejala a las 19.");
    assert.equal(run.snapshot().values.ceremony.date, "2027-03-15");
    assert.equal(run.snapshot().values.ceremony.startTime, "19:00");
    await run.send("Activá RSVP.");
    assert.equal(run.snapshot().values.rsvp.enabled, true);
    await run.send("Cambiá el texto de nuestra historia.");
    assert.equal(run.snapshot().values.story, "Nos conocimos durante un viaje.");
    await run.send("Cambiá la fecha al 12 de diciembre de 2027.");
    assert.equal(run.snapshot().values.ceremony.date, "2027-12-12");
    assert.equal(run.snapshot().values.ceremony.startTime, "19:00");
    await run.send("Cambiá el Dress Code.");
    await run.send("Sacá una pregunta de RSVP.");
    await run.send("Sacá la dirección, todavía no la definimos.");
    assert.equal(run.snapshot().ledger.guidedFlow.completion.complete, false);
    assert.ok(run.snapshot().ledger.guidedFlow.completion.unresolvedLeafIds.includes("event.ceremony.address"));
    assert.equal(run.journeyRef.current.editing, true);
    assert.equal(run.messages().filter((m) => m.guidedCompletion).length, 1);
    assert.equal(run.messages().at(-1).content, responses.at(-1).assistantMessage);
    for (const payload of run.calls.slice(1)) assert.equal(payload.capabilitySnapshot.conversation.mode, "editing");
    const editingSnapshot = { ...run.snapshot(), conversation: { ...run.snapshot().conversation, mode: "editing" } };
    assert.equal(ledger.buildDesignerAiConversationBrief(editingSnapshot).nextBlock, null);
    assert.ok(ledger.buildDesignerAiConversationBrief(editingSnapshot).unresolvedLeafIds.length);
    await run.toggle(false);
    await run.toggle(true);
    assert.equal(run.calls.length, responses.length);
    assert.equal(run.journeyRef.current.editing, true);
    assert.equal(run.messages().filter((m) => m.guidedCompletion).length, 1);
    assert.ok(run.writes.every((w) => w.templateAuthoringDraft));
  } finally { await run.close(); }
});

for (const reopenPending of [false, true]) {
  test(`E8 durable completion survives a full reload (pending=${reopenPending}) without another closure`, async () => {
    let run = await mountPanel({ fullFields: true, respond: async (_, index) => index === 1
      ? completedInvitation
      : { intent: "apply", assistantMessage: "La dirección quedó pendiente.", actions: [action("event.set_location_text", { phase: "ceremony", venueName: "Salón de prueba", address: "" })] } });
    try {
      await run.until(() => run.messages().some((m) => m.guidedCompletion));
      assert.equal(run.exportPersistedDraft().conversation.usage.guidedFlowCompleted, true);
      if (reopenPending) await run.send("Sacá la dirección, todavía no la definimos.");
      const before = run.snapshot();
      assert.equal(before.ledger.guidedFlow.completion.complete, !reopenPending);
      const savedDraft = JSON.parse(JSON.stringify(run.exportPersistedDraft()));
      assert.deepEqual(savedDraft.conversation.usage, { hasStarted: true, guidedFlowCompleted: true });
      await run.close();
      run = null;
      // A new DOM, React root, history and journey ref; only confirmed writes survive.
      run = await mountPanel({ savedDraft, respond: async (_, index) => index === 1
        ? { assistantMessage: "Seguimos ajustando." }
        : { intent: "apply", assistantMessage: "Actualicé la dirección.", actions: [action("event.set_location_text", { phase: "ceremony", venueName: "Salón de prueba", address: "Calle Ejemplo 456" })] } });
      await run.until(() => run.messages().length > 0);
      assert.equal(run.calls[0].capabilitySnapshot.conversation.mode, "editing");
      assert.equal(run.journeyRef.current.editing, true);
      assert.deepEqual(run.snapshot().ledger, before.ledger);
      assert.equal(run.messages().some((m) => m.guidedCompletion), false);
      if (reopenPending) {
        await run.send("La dirección es Calle Ejemplo 456.");
        assert.equal(run.snapshot().ledger.guidedFlow.completion.complete, true);
        assert.equal(run.calls.at(-1).capabilitySnapshot.conversation.mode, "editing");
        assert.equal(run.messages().some((m) => m.guidedCompletion), false);
      }
      assert.equal(run.exportPersistedDraft().conversation.usage.guidedFlowCompleted, true);
    } finally { await run?.close(); }
  });
}

test("E8 a never-completed legacy draft reloads in guided mode", async () => {
  let run = await mountPanel({ fullFields: true, initialConversation: { usage: { hasStarted: true } }, respond: async () => ({ assistantMessage: "Seguimos con los nombres." }) });
  try {
    await run.until(() => run.messages().length > 0);
    const savedDraft = run.exportPersistedDraft();
    assert.equal(savedDraft.conversation.usage.guidedFlowCompleted, false);
    await run.close();
    run = null;
    run = await mountPanel({ savedDraft, respond: async () => ({ assistantMessage: "Seguimos con los nombres." }) });
    await run.until(() => run.messages().length > 0);
    assert.equal(run.calls[0].capabilitySnapshot.conversation.mode, "guided");
    assert.equal(run.journeyRef.current.editing, false);
    assert.equal(run.snapshot().ledger.guidedFlow.completion.complete, false);
    assert.equal(run.exportPersistedDraft().conversation.usage.guidedFlowCompleted, false);
    assert.equal(run.messages().some((m) => m.guidedCompletion), false);
  } finally { await run?.close(); }
});

test("E8 a currently complete legacy draft acquires the marker on entry without repeating the closure", async () => {
  let run = await mountPanel({ fullFields: true, respond: async () => completedInvitation });
  try {
    await run.until(() => run.messages().some((m) => m.guidedCompletion));
    const savedDraft = run.exportPersistedDraft();
    delete savedDraft.conversation.usage.guidedFlowCompleted;
    await run.close();
    run = null;
    run = await mountPanel({ savedDraft, respond: async () => ({ assistantMessage: "Seguimos ajustando." }) });
    await run.until(() => run.messages().length > 0);
    assert.equal(run.snapshot().ledger.guidedFlow.completion.complete, true);
    assert.equal(run.exportPersistedDraft().conversation.usage.guidedFlowCompleted, true);
    assert.equal(run.calls[0].capabilitySnapshot.conversation.mode, "editing");
    assert.equal(run.messages().some((m) => m.guidedCompletion), false);
  } finally { await run?.close(); }
});

test("E8 a failed final metadata write cannot persist completion or announce success", async () => {
  const run = await mountPanel({ fullFields: true, failMetadata: (n) => n > 1, respond: async () => completedInvitation });
  try {
    await run.until(() => run.messages().some((m) => m.intent === "error"));
    assert.equal(run.exportPersistedDraft().conversation.usage.guidedFlowCompleted, false);
    assert.equal(run.messages().some((m) => m.guidedCompletion), false);
  } finally { await run.close(); }
});
