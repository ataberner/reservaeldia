import test from "node:test";
import assert from "node:assert/strict";
import { mountPanel, ledger, contract } from "./testSupport/panelHarness.mjs";
import { templateDraft } from "./testSupport/conversationRegressionFixture.mjs";
import { buildDesignerAiGuidedQuestion, buildDesignerAiCompletionMessage, withDesignerAiGuidedContinuation } from "../../../domain/editor/designerAiGuidedConversation.js";

function progress(mode, status = "pending", finished = false) {
  const values = contract.sanitizeCapabilitySnapshot({ values: {
    eventMode: mode,
    ceremony: { date: "2026-12-24", startTime: "20:00", endTime: "", venueName: "Salón", address: "Calle 123", placeSelected: true },
    party: { date: "2026-12-24", startTime: "22:00", endTime: "", venueName: "Club", address: "Calle 456", placeSelected: true },
  } }).values;
  const availability = { documentName: false, people: false, eventMode: true, ceremonyDatetime: true, partyDatetime: true,
    ceremonyLocation: true, partyLocation: true, dressCode: true, rsvp: true, gifts: true, story: false, cover: false, gallery: false };
  const initial = ledger.buildDesignerAiLedger({ values, availability });
  const resolutions = initial.leaves.filter(leaf => leaf.id === "event.mode" || /^event\.(ceremony|party)\./.test(leaf.id) ||
    (finished && ["event.dress_code.enabled", "rsvp.enabled", "gifts.enabled"].includes(leaf.id)))
    .filter(leaf => !leaf.id.endsWith(".end_time") || status !== "pending")
    .map(leaf => ({ leafId: leaf.id, fingerprint: leaf.fingerprint, rule: null, provenance: "user_current_session",
      status: leaf.id.endsWith(".end_time") ? status : "resolved_from_user" }));
  return { values, availability, conversation: { mode: "guided" },
    ledger: ledger.buildDesignerAiLedger({ values, availability, conversationState: { resolutions } }) };
}

test("only an explicit end-time request permits a reactive clarification outside the guided step", () => {
  for (const mode of ["single", "ceremony_party"]) {
    const snapshot = progress(mode, "needs_clarification");
    const result = { intent: "clarify", clarification: { leafId: "event.ceremony.end_time", kind: "missing_value" },
      resolutions: [{ leafId: "event.ceremony.end_time", status: "needs_clarification", rule: null }] };
    const render = userMessage => withDesignerAiGuidedContinuation("Pasame la dirección.", {
      previousSnapshot: snapshot, snapshot, result, userMessage,
    });
    for (const text of ["Hola", "Empieza a las ocho", "Después seguimos"]) assert.match(render(text), /Dress Code/);
    assert.equal(render("No sé cómo indicar a qué hora termina la ceremonia"), mode === "single"
      ? "¿A qué hora termina el evento?" : "¿A qué hora termina la ceremonia?");
    if (mode === "ceremony_party") {
      assert.match(render("Quiero cambiar la hora de fin"), /cuál querés cambiar/);
      assert.match(render("La fiesta termina a las ocho"), /Dress Code/, "a mismatched phase cannot ask about the ceremony");
    }
  }
});

for (const mode of ["single", "ceremony_party"]) {
  for (const status of ["pending", "needs_clarification", "deferred_by_user"]) {
    test(`end time stays reactive and does not block the journey: ${mode}/${status}`, () => {
      const snapshot = progress(mode, status);
      const brief = ledger.buildDesignerAiConversationBrief(snapshot);
      assert.equal(brief.nextBlock.id, "dress_code");
      assert.match(buildDesignerAiGuidedQuestion(snapshot), /Dress Code/);
      assert.equal(snapshot.ledger.leaves.find(leaf => leaf.id === "event.ceremony.end_time").status, status);
      assert.ok(snapshot.ledger.completion.unresolvedLeafIds.includes("event.ceremony.end_time"));
      assert.equal(snapshot.ledger.guidedFlow.leafIds.some(id => id.endsWith(".end_time")), false);
      const complete = progress(mode, status, true);
      assert.equal(complete.ledger.guidedFlow.completion.complete, true);
      assert.equal(ledger.buildDesignerAiConversationBrief(complete).nextBlock, null);
      assert.equal(buildDesignerAiGuidedQuestion(complete), "");
      assert.doesNotMatch(buildDesignerAiCompletionMessage(complete), /horario|hora de fin/);
    });
  }
}

test("user-supplied end time persists, survives reload and stays editable after completion", async () => {
  const draft = templateDraft();
  draft.conversation = { usage: { hasStarted: true, guidedFlowCompleted: true } };
  const result = endTime => ({ assistantMessage: `Actualicé el horario de fin a ${endTime}.`,
    actions: [{ type: "event.set_datetime", arguments: { phase: "ceremony", date: null, startTime: null, endTime } }] });
  let run = await mountPanel({ savedDraft: draft, respond: (_, index) => index === 1
    ? { assistantMessage: "Podés seguir ajustando la invitación." } : result("23:00") });
  try {
    await run.until(() => run.messages().length === 1);
    await run.send("El evento termina a las 23:00.");
    assert.equal(run.snapshot().values.ceremony.endTime, "23:00");
    assert.equal(run.snapshot().ledger.leaves.find(leaf => leaf.id === "event.ceremony.end_time").status, "resolved_from_user");
    const saved = run.exportPersistedDraft();
    assert.equal(saved.authoring.defaults.event_ceremony_end_time, "23:00");
    await run.close(); run = null;
    run = await mountPanel({ savedDraft: saved, respond: (_, index) => index === 1
      ? { assistantMessage: "Podés seguir ajustando la invitación." } : result("23:30") });
    await run.until(() => run.messages().length === 1);
    assert.equal(run.snapshot().values.ceremony.endTime, "23:00");
    await run.send("Cambiá la hora de fin a las 23:30.");
    assert.equal(run.snapshot().values.ceremony.endTime, "23:30");
    assert.equal(run.calls.at(-1).capabilitySnapshot.conversation.mode, "editing");
  } finally { await run?.close(); }
});
