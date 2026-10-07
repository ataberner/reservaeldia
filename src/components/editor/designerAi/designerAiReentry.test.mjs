import test from "node:test";
import assert from "node:assert/strict";
import { act } from "react";
import { mountPanel, ledger, capabilities } from "./testSupport/panelHarness.mjs";
import { templateDraft } from "./testSupport/conversationRegressionFixture.mjs";
import { buildDesignerAiGuidedQuestion } from "../../../domain/editor/designerAiGuidedConversation.js";

const greeting = { assistantMessage: "¡Hola!", entryGreeting: "¡Hola!" };
const action = (type, args) => ({ type, arguments: args });
const type = async value => {
  const input = document.querySelector("textarea");
  const props = input[Object.keys(input).find(key => key.startsWith("__reactProps"))];
  await act(async () => props.onChange({ target: { value } }));
};
const assertNoControl = () => assert.equal(document.querySelector('section[aria-label="Selección para la invitación"]'), null);
async function manuallyChangeFields(run, patch) {
  Object.assign(run.authoring.defaults, patch);
  // The authoring owner publishes changedKeys against the original template.
  run.authoring.templateInput = { defaults: {}, values: run.authoring.defaults,
    changedKeys: [...new Set([...(run.authoring.templateInput?.changedKeys || []), ...Object.keys(patch)])] };
  await window.canvasEditor.flushPersistenceNow();
}

test("legacy history keeps its messages but presents the current first pending step locally", async () => {
  const history = [{ id: "old-question", role: "assistant", content: "¿Qué Dress Code quieren indicar?" }];
  const run = await mountPanel({ savedDraft: templateDraft(), initialMessages: history,
    respond: () => { throw new Error("Reentry must not request the provider"); } });
  try {
    await run.until(() => run.messages().length === 2);
    assert.deepEqual(run.messages()[0], history[0]);
    assert.equal(run.messages().at(-1).content, buildDesignerAiGuidedQuestion(run.snapshot()));
    assert.match(run.messages().at(-1).content, /nombres de quienes se casan/);
    assert.equal(run.calls.length, 0);
    assert.equal(run.metadataWrites(), 0);
    assert.equal(run.writes.length, 0);
    const retained = structuredClone(run.messages());
    await run.toggle(false); await run.toggle(true);
    assert.deepEqual(run.messages(), retained, "unchanged reentry must not repeat a local question");
    assertNoControl();
  } finally { await run.close(); }
});

test("manual confirmed names while chat is closed advance reentry without resetting its history", async () => {
  const run = await mountPanel({ savedDraft: templateDraft(), respond: () => greeting });
  try {
    await run.until(() => run.messages().length === 1);
    const opening = run.messages()[0];
    const metaWrites = run.metadataWrites();
    await run.toggle(false);
    await manuallyChangeFields(run, { event_primary_person_name: "Ana", event_secondary_person_name: "Luz" });
    await run.toggle(true);
    await run.until(() => run.messages().length === 2);
    assert.deepEqual(run.messages()[0], opening);
    assert.equal(ledger.buildDesignerAiConversationBrief(run.snapshot()).nextStep.kind, "event_structure");
    assert.match(run.messages().at(-1).content, /ceremonia y fiesta/);
    assert.doesNotMatch(run.messages().at(-1).content, /nombres/);
    assert.equal(run.calls.length, 1);
    assert.equal(run.metadataWrites(), metaWrites);
    assertNoControl();
  } finally { await run.close(); }
});

test("minimal structured date clarification survives reentry until a manual date changes its evidence", async () => {
  const run = await mountPanel({ savedDraft: templateDraft(), respond: (_, index) => index === 1 ? greeting : index === 2
    ? { intent: "apply", assistantMessage: "Nombres guardados. ¿Dónde es?", actions: [action("event.set_people", { primaryName: "Ana", secondaryName: "Luz" })] }
    : index === 3
      ? { intent: "apply", assistantMessage: "Evento configurado.", actions: [action("event.set_mode", { mode: "single" })] }
      : { assistantMessage: "¿De qué año y dónde se casan?", clarification: { leafId: "event.ceremony.date", kind: "missing_year" },
        resolutions: [{ leafId: "event.ceremony.date", status: "needs_clarification", rule: null }] } });
  try {
    await run.until(() => run.messages().length === 1);
    await run.send("Somos Ana y Luz.");
    await run.send("Un único evento.");
    await run.send("El 24 de agosto.");
    assert.match(run.messages().at(-1).content, /año/);
    assert.doesNotMatch(run.messages().at(-1).content, /dónde/);
    const count = run.messages().length;
    const clarification = structuredClone(run.messages().at(-1));
    await run.toggle(false); await run.toggle(true);
    assert.equal(run.messages().length, count);
    assert.deepEqual(run.messages().at(-1), clarification);
    await run.toggle(false);
    await manuallyChangeFields(run, { event_ceremony_date: "2028-08-24" });
    await run.toggle(true);
    await run.until(() => run.messages().length === count + 1);
    assert.equal(ledger.buildDesignerAiConversationBrief(run.snapshot()).nextStep.kind, "start_time");
    assert.match(run.messages().at(-1).content, /hora empieza/);
    assert.doesNotMatch(run.messages().at(-1).content, /año|dónde/);
    assert.equal(run.calls.length, 4);
    assert.equal(JSON.stringify(run.exportPersistedDraft().conversation).includes("guidedStepFingerprint"), false);
    assert.equal(run.calls.some(payload => payload.recentTurns.some(turn => "guidedStepFingerprint" in turn)), false);
    assertNoControl();
  } finally { await run.close(); }
});

test("reentry preserves an explicit continuation retry and rereads the ledger when it is used", async () => {
  const interrupted = { id: "retry", role: "assistant", intent: "error", canRetryContinuation: true,
    content: "El cambio quedó reflejado, pero no pude preparar el próximo paso." };
  const run = await mountPanel({ savedDraft: templateDraft(), initialMessages: [interrupted],
    respond: () => { throw new Error("Local continuation cannot call the provider"); } });
  try {
    await run.until(() => document.querySelector("section[aria-label='Tu asistente']")?.getAttribute("aria-busy") === "false");
    assert.deepEqual(run.messages(), [interrupted]);
    await run.click("Continuar recorrido");
    assert.match(run.messages().at(-1).content, /nombres de quienes se casan/);
    assert.equal(run.messages()[0].canRetryContinuation, false);
    assert.equal(run.calls.length, 0);
    assert.equal(run.metadataWrites(), 0);
    assertNoControl();
  } finally { await run.close(); }
});

test("completed flow keeps editing on reentry even when manual changes create pending leaves", async () => {
  const savedDraft = templateDraft();
  savedDraft.conversation = { usage: { hasStarted: true, guidedFlowCompleted: true } };
  const messages = [{ id: "completed", role: "assistant", content: "Ya recorrimos lo principal.", guidedCompletion: true }];
  const run = await mountPanel({ savedDraft, initialMessages: messages,
    respond: () => { throw new Error("Completed reentry must stay local"); } });
  try {
    await run.until(() => document.querySelector("section[aria-label='Tu asistente']")?.getAttribute("aria-busy") === "false");
    await run.toggle(false);
    await manuallyChangeFields(run, { event_primary_person_name: "" });
    await run.toggle(true);
    assert.deepEqual(run.messages(), messages);
    assert.equal(run.journeyRef.current.editing, true);
    assert.equal(run.calls.length, 0);
    assert.equal(run.metadataWrites(), 0);
    assert.equal(run.messages().filter(message => message.guidedCompletion).length, 1);
    assertNoControl();
  } finally { await run.close(); }
});

test("content refresh while composing cannot rerun entry, clear input or add questions", async () => {
  const run = await mountPanel({ savedDraft: templateDraft(), respond: () => greeting });
  try {
    await run.until(() => run.messages().length === 1);
    await type("Estoy escribiendo los nombres");
    const messages = structuredClone(run.messages());
    await run.replaceCover("https://example.test/manually-changed.jpg");
    assert.equal(document.querySelector("textarea").value, "Estoy escribiendo los nombres");
    assert.deepEqual(run.messages(), messages);
    assert.equal(run.calls.length, 1);
    assertNoControl();
  } finally { await run.close(); }
});

test("reentry from an unfinished uploader restores chat without automatically reopening the control", async () => {
  const savedDraft = { sourceContext: { templateDerived: true }, coverImage: "https://example.test/cover.jpg", authoring: { fieldsSchema: [], defaults: {} },
    render: { objetos: [], secciones: [], rsvp: { enabled: false }, gifts: { enabled: false }, eventDetails: { mode: "single" } } };
  const snapshot = capabilities.buildDesignerAiCapabilitySnapshot({ coverImage: savedDraft.coverImage,
    authoringSnapshot: savedDraft.authoring, renderSnapshot: savedDraft.render });
  savedDraft.conversation = { resolutions: snapshot.ledger.leaves.filter(leaf =>
    snapshot.ledger.guidedFlow.leafIds.includes(leaf.id) && leaf.block !== "cover")
    .map(leaf => ({ leafId: leaf.id, fingerprint: leaf.fingerprint, status: "resolved_from_user", provenance: "user_current_session", rule: null })) };
  const run = await mountPanel({ savedDraft, respond: (_, index) => index === 1 ? greeting
    : { intent: "apply", assistantMessage: "Subí una foto.", controlRequest: { type: "cover_upload" } } });
  try {
    await run.until(() => run.messages().length === 1);
    await run.send("Sí, quiero cambiarla.");
    assert.ok(document.querySelector('section[aria-label="Selección para la invitación"]'));
    await run.toggle(false); await run.toggle(true);
    await run.until(() => document.querySelector("section[aria-label='Tu asistente']")?.getAttribute("aria-busy") === "false");
    assertNoControl();
    assert.match(run.messages().at(-1).content, /cambiar la foto de portada/);
    assert.equal(run.calls.length, 2);
    assert.equal(run.snapshot().ledger.leaves.find(leaf => leaf.id === "media.cover").status, "requires_control");
  } finally { await run.close(); }
});
