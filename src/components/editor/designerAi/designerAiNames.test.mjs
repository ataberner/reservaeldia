import test from "node:test";
import assert from "node:assert/strict";
import { act } from "react";
import { mountPanel, ledger } from "./testSupport/panelHarness.mjs";
import { templateDraft } from "./testSupport/conversationRegressionFixture.mjs";

const nameIds = ["event.people.primary_name", "event.people.secondary_name"];
function namesDraft({ names = ["Juan", "María"], legacy = false, changedKeys = [], conversation } = {}) {
  const draft = templateDraft();
  draft.authoring.defaults.event_primary_person_name = names[0];
  draft.authoring.defaults.event_secondary_person_name = names[1];
  draft.sourceContext = legacy ? undefined : { templateDerived: true, changedKeys };
  draft.conversation = conversation;
  return draft;
}
const nextBlock = snapshot => ledger.buildDesignerAiConversationBrief(snapshot).nextBlock?.id;
const opening = assistantMessage => ({ assistantMessage, entryGreeting: assistantMessage });
const greeting = payload => {
  assert.equal(nextBlock(payload.capabilitySnapshot), "names");
  return opening("¡Hola! Te acompaño a preparar tu invitación.");
};

for (const entryMode of ["first_entry", "reentry"]) {
  test(`safe opening greeting gets exactly one ledger names question on ${entryMode}`, async () => {
    const assistantMessage = "¡Hola, Reserva! Te acompaño a preparar tu invitación.";
    const run = await mountPanel({
      savedDraft: namesDraft({ conversation: { usage: { hasStarted: entryMode === "reentry" } } }),
      respond: payload => {
        assert.equal(payload.entryMode, entryMode);
        return opening(assistantMessage);
      },
    });
    try {
      await run.until(() => run.messages().length === 1);
      assert.equal(run.messages()[0].content, `${assistantMessage} ¿Me compartís los nombres de quienes se casan?`);
      assert.equal(nextBlock(run.snapshot()), "names");
      assert.equal(run.calls.length, 1);
    } finally { await run.close(); }
  });
}

test("a greeting without a names request still adds the pending question once", async () => {
  const run = await mountPanel({ savedDraft: namesDraft(), respond: () => opening("¡Hola, Reserva!") });
  try {
    await run.until(() => run.messages().length === 1);
    assert.equal(run.messages()[0].content, "¡Hola, Reserva! ¿Me compartís los nombres de quienes se casan?");
  } finally { await run.close(); }
});

for (const assistantMessage of [
  "¡Hola, Reserva! ¿Qué día es el evento? ¿Y en qué lugar?",
  "¡Hola, Reserva! Para empezar, contame los nombres de las dos personas que se casan.",
  "¡Hola! ¿Cómo estás? ¿Me pasás la dirección?",
]) test(`legacy opening cannot bypass or duplicate the names question: ${assistantMessage}`, async () => {
  const run = await mountPanel({ savedDraft: namesDraft(), respond: () => ({ assistantMessage }) });
  try {
    await run.until(() => run.messages().length === 1);
    assert.equal(run.messages()[0].content, "¡Hola! Sigamos con tu invitación. ¿Me compartís los nombres de quienes se casan?");
    assert.equal(nextBlock(run.snapshot()), "names");
    assert.equal(run.calls.length, 1);
  } finally { await run.close(); }
});

test("a normal human reply presents a structured clarification inside the names block", async () => {
  const clarification = "Contame también el nombre de la otra persona que se casa.";
  const run = await mountPanel({ savedDraft: namesDraft(), respond: (payload, count) =>
    count === 1 ? greeting(payload) : { assistantMessage: clarification,
      clarification: { leafId: "event.people.secondary_name", kind: "missing_value" },
      resolutions: [{ leafId: "event.people.secondary_name", status: "needs_clarification", rule: null }],
    } });
  try {
    await run.until(() => run.messages().length === 1);
    await run.send("Soy Ana.");
    assert.match(run.messages().at(-1).content, /otra persona que se casa/);
    assert.equal(run.snapshot().ledger.leaves.find(leaf => leaf.id === nameIds[0]).status, "pending");
    assert.equal(run.calls[1].entryMode, "continuation");
  } finally { await run.close(); }
});

test("entry waits for authoring hydration before classifying name availability or recording usage", async () => {
  const run = await mountPanel({ savedDraft: namesDraft(), authoringReady: false, respond: greeting });
  try {
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
    assert.equal(run.calls.length, 0);
    assert.equal(run.metadataWrites(), 0);
    await run.setAuthoringReady();
    await run.until(() => run.messages().length === 1);
    assert.equal(run.calls[0].entryMode, "first_entry");
    assert.equal(nextBlock(run.snapshot()), "names");
  } finally { await run.close(); }
});

for (const [name, options] of [
  ["first entry with template names", {}],
  ["second entry with template names", { conversation: { usage: { hasStarted: true } } }],
  ["empty template names", { names: ["", ""] }],
  ["legacy without provenance", { legacy: true }],
  ["only one confirmed name", { changedKeys: ["event_primary_person_name"] }],
]) test(`names priority: ${name}`, async () => {
  const run = await mountPanel({ savedDraft: namesDraft(options), respond: greeting });
  try {
    await run.until(() => run.messages().length === 1);
    assert.match(run.messages()[0].content, options.changedKeys?.length
      ? /otra persona que se casa/ : /nombres de quienes se casan/);
    const leaves = run.snapshot().ledger.leaves.filter(leaf => nameIds.includes(leaf.id));
    assert.equal(leaves[1].status, "pending");
    assert.equal(leaves[0].status, options.changedKeys?.length ? "resolved_from_existing_user_data" : "pending");
  } finally { await run.close(); }
});

test("unanswered names stay pending across tab reentry and full reload", async () => {
  let run = await mountPanel({ savedDraft: namesDraft(), respond: greeting });
  try {
    await run.until(() => run.messages().length === 1);
    await run.toggle(false); await run.toggle(true);
    assert.equal(nextBlock(run.snapshot()), "names");
    assert.match(run.messages().at(-1).content, /nombres/);
    const saved = run.exportPersistedDraft();
    await run.close(); run = null;
    run = await mountPanel({ savedDraft: saved, respond: payload => {
      assert.equal(payload.entryMode, "reentry");
      return greeting(payload);
    } });
    await run.until(() => run.messages().length === 1);
    assert.equal(nextBlock(run.snapshot()), "names");
  } finally { await run?.close(); }
});

for (const names of [["Ana", "Luz"], ["Juan", "María"]]) {
  test(`confirmed names survive reentry/reload, including equal template values: ${names.join("/")}`, async () => {
    let run = await mountPanel({ savedDraft: namesDraft(), respond: (payload, count) => count === 1 ? greeting(payload) : {
      intent: "apply", assistantMessage: "¡Perfecto! ¿Van a tener ceremonia y fiesta o un único evento?",
      actions: [{ type: "event.set_people", arguments: { primaryName: names[0], secondaryName: names[1] } }],
    } });
    try {
      await run.until(() => run.messages().length === 1);
      await run.send(`Somos ${names[0]} y ${names[1]}.`);
      for (const leaf of run.snapshot().ledger.leaves.filter(leaf => nameIds.includes(leaf.id))) {
        assert.equal(leaf.status, "resolved_from_user");
        assert.equal(leaf.provenance, "user_current_session");
      }
      assert.equal(nextBlock(run.snapshot()), "event_structure");
      await run.toggle(false); await run.toggle(true);
      assert.equal(nextBlock(run.snapshot()), "event_structure");
      assert.match(run.messages().at(-1).content, /ceremonia y fiesta/);
      const saved = run.exportPersistedDraft();
      await run.close(); run = null;
      run = await mountPanel({ savedDraft: saved, respond: payload => {
        assert.equal(payload.entryMode, "reentry");
        assert.equal(nextBlock(payload.capabilitySnapshot), "event_structure");
        return opening("¡Hola! Sigamos con tu invitación.");
      } });
      await run.until(() => run.messages().length === 1);
      assert.equal(nextBlock(run.snapshot()), "event_structure");
      assert.doesNotMatch(run.messages().at(-1).content, /nombres/);
    } finally { await run?.close(); }
  });
}

test("completed legacy draft retains editing despite names with unknown provenance", async () => {
  const run = await mountPanel({ savedDraft: namesDraft({ legacy: true, conversation: { usage: { hasStarted: true, guidedFlowCompleted: true } } }),
    respond: payload => {
      assert.equal(payload.capabilitySnapshot.conversation.mode, "editing");
      assert.equal(nextBlock(payload.capabilitySnapshot), undefined);
      return opening("Podés seguir ajustando tu invitación.");
    } });
  try {
    await run.until(() => run.messages().length === 1);
    assert.equal(run.exportPersistedDraft().conversation.usage.guidedFlowCompleted, true);
    assert.equal(run.snapshot().ledger.leaves.find(leaf => leaf.id === nameIds[0]).status, "pending");
    assert.equal(run.messages()[0].content, "Podés seguir ajustando tu invitación.");
    assert.doesNotMatch(run.messages()[0].content, /nombres/);
  } finally { await run.close(); }
});

test("legacy editing entry cannot claim changes discarded by the read-only opening", async () => {
  const run = await mountPanel({ savedDraft: namesDraft({ legacy: true,
    conversation: { usage: { hasStarted: true, guidedFlowCompleted: true } } }),
    respond: () => ({ intent: "apply", assistantMessage: "Cambié los nombres y ya está todo listo.",
      actions: [{ type: "event.set_people", arguments: { primaryName: "Otra", secondaryName: "Pareja" } }] }) });
  try {
    await run.until(() => run.messages().length === 1);
    assert.equal(run.messages()[0].content, "¡Hola! Sigamos con tu invitación. Contame qué querés ajustar.");
    assert.deepEqual(run.snapshot().values.people, { primaryName: "Juan", secondaryName: "María" });
    assert.equal(run.writes.length, 0);
  } finally { await run.close(); }
});

test("loaded legacy draft without dynamic fields can still enter editing", async () => {
  const draft = namesDraft({ legacy: true, conversation: { usage: { hasStarted: true, guidedFlowCompleted: true } } });
  draft.authoring = { fieldsSchema: [], defaults: {} };
  const run = await mountPanel({ savedDraft: draft, respond: payload => {
    assert.equal(payload.capabilitySnapshot.conversation.mode, "editing");
    assert.equal(payload.capabilitySnapshot.availability.people, false);
    return { assistantMessage: "Podés seguir ajustando tu invitación." };
  } });
  try { await run.until(() => run.messages().length === 1); }
  finally { await run.close(); }
});
