import test from "node:test";
import assert from "node:assert/strict";
import { mountPanel, capabilities, ledger } from "./testSupport/panelHarness.mjs";

const galleryIds = ["gallery-a", "gallery-b"];
const completionId = id => `media.gallery.${id}.guided_completion`;
const request = id => ({ type: "gallery_cell_upload", galleryId: id, cellId: "photo", cellIndex: 0 });
const open = id => ({ intent: "apply", assistantMessage: "Acá podés cambiar las fotos.", controlRequest: request(id) });
const decline = { assistantMessage: "Seguimos.", resolutions: galleryIds.map(id => ({ leafId: completionId(id), status: "deferred_by_user", rule: null })) };

function galleryDraft() {
  const draft = { authoring: { fieldsSchema: [], defaults: {} }, render: {
    objetos: galleryIds.map(id => ({ id, tipo: "galeria", rows: 1, cols: 1, cells: [{ id: "photo", mediaUrl: `https://example.test/${id}.jpg` }] })),
    secciones: [], rsvp: { enabled: false }, gifts: { enabled: false }, eventDetails: { mode: "single" },
  } };
  const snapshot = capabilities.buildDesignerAiCapabilitySnapshot({ authoringSnapshot: draft.authoring, renderSnapshot: draft.render });
  draft.conversation = { resolutions: snapshot.ledger.leaves
    .filter(leaf => snapshot.ledger.guidedFlow.leafIds.includes(leaf.id) && leaf.block !== "galleries")
    .map(leaf => ({ leafId: leaf.id, fingerprint: leaf.fingerprint, status: "resolved_from_user", provenance: "user_current_session", rule: null })) };
  return draft;
}
const hasPanel = () => document.body.textContent.includes("Terminé con esta galería");

test("asks before a premature Gallery request, accepts yes and visits the existing controls once per Gallery", async () => {
  const run = await mountPanel({ savedDraft: galleryDraft(), respond: (_, index) => open(index < 3 ? galleryIds[0] : galleryIds[1]) });
  try {
    await run.until(() => run.messages().length === 1);
    assert.match(run.messages()[0].content, /¿Querés que te ayude a cambiar las fotos de las galerías\?/);
    assert.equal(hasPanel(), false);
    assert.equal(run.writes.length, 0);
    await run.send("Sí, ayudame.");
    assert.equal(hasPanel(), true);
    assert.match(document.body.textContent, /Galería 1 de 2/);
    assert.equal(run.snapshot().ledger.leaves.find(leaf => leaf.id === completionId(galleryIds[0])).status, "requires_control");
    await run.click("Terminé con esta galería");
    await run.until(() => document.body.textContent.includes("Galería 2 de 2"));
    assert.equal(run.messages().filter(message => message.content.includes("¿Querés que te ayude")).length, 1);
    assert.equal(run.snapshot().ledger.leaves.find(leaf => leaf.id === completionId(galleryIds[0])).status, "resolved_by_control");
    await run.click("Terminé con esta galería");
    await run.until(() => run.messages().some(message => message.guidedCompletion));
    assert.equal(run.snapshot().ledger.guidedFlow.completion.complete, true);
  } finally { await run.close(); }
});

for (const otherPending of [false, true]) test(`declining preserves both galleries and continues to ${otherPending ? "RSVP" : "completion"}, including reload`, async () => {
  let run = await mountPanel({ savedDraft: galleryDraft(), respond: (_, index) => index === 1 ? { assistantMessage: "¿Qué fotos quieren incluir?" } : decline });
  try {
    await run.until(() => run.messages().length === 1);
    assert.match(run.messages()[0].content, /¿Querés que te ayude/);
    if (otherPending) run.update({ rsvp: { enabled: true } });
    const photos = structuredClone(run.render().objetos);
    await run.send("No, ahora no.");
    assert.equal(hasPanel(), false);
    assert.deepEqual(run.render().objetos, photos);
    assert.equal(run.writes.length, 0);
    assert.match(run.messages().find(message => message.content.includes("tab Fotos")).content, /desde el asistente o desde el tab Fotos/);
    for (const id of galleryIds) assert.equal(run.snapshot().ledger.leaves.find(leaf => leaf.id === completionId(id)).status, "deferred_by_user");
    if (otherPending) {
      assert.equal(ledger.buildDesignerAiConversationBrief(run.snapshot()).nextBlock.id, "rsvp");
      assert.match(run.messages().at(-1).content, /confirmen asistencia/);
    } else assert.equal(run.messages().at(-1).guidedCompletion, true);
    const savedDraft = run.exportPersistedDraft();
    await run.close(); run = null;
    run = await mountPanel({ savedDraft, respond: () => ({ assistantMessage: "Seguimos con tu invitación." }) });
    await run.until(() => run.messages().length === 1);
    assert.equal(hasPanel(), false);
    assert.doesNotMatch(run.messages()[0].content, /¿Querés que te ayude/);
    for (const id of galleryIds) assert.equal(run.snapshot().ledger.leaves.find(leaf => leaf.id === completionId(id)).status, "deferred_by_user");
  } finally { await run?.close(); }
});

test("acceptance survives a provider retry without offering the same question again", async () => {
  const run = await mountPanel({ savedDraft: galleryDraft(), respond: (_, index) => {
    if (index === 2) throw new Error("Synthetic provider failure");
    return open(galleryIds[0]);
  } });
  try {
    await run.until(() => run.messages().length === 1);
    await run.send("Sí.");
    await run.click("Reintentar");
    await run.until(hasPanel);
    assert.equal(run.messages().filter(message => message.content.includes("¿Querés que te ayude")).length, 1);
    assert.equal(run.messages().filter(message => message.role === "user").length, 1);
  } finally { await run.close(); }
});

test("a failed deferral write cannot advance the journey or claim the choice was saved", async () => {
  let failNext = false;
  const run = await mountPanel({ savedDraft: galleryDraft(), failMetadata: () => {
    if (!failNext) return false;
    failNext = false;
    return true;
  }, respond: (_, index) => index === 1 ? open(galleryIds[0]) : decline });
  try {
    await run.until(() => run.messages().length === 1);
    failNext = true;
    await run.send("No, después.");
    assert.equal(run.messages().at(-1).intent, "error");
    assert.equal(run.messages().some(message => message.guidedCompletion), false);
    assert.equal(run.messages().some(message => message.content.includes("tab Fotos")), false);
    assert.equal(run.snapshot().ledger.leaves.find(leaf => leaf.id === completionId(galleryIds[0])).status, "requires_control");
    await run.click("Reintentar");
    await run.until(() => run.messages().some(message => message.guidedCompletion));
    assert.equal(run.snapshot().ledger.leaves.find(leaf => leaf.id === completionId(galleryIds[0])).status, "deferred_by_user");
  } finally { await run.close(); }
});

test("later explicit photo editing reopens the existing panel without restarting a completed journey", async () => {
  const run = await mountPanel({ savedDraft: galleryDraft(), respond: (_, index) => index === 1 ? open(galleryIds[0]) : index === 2 ? decline : open(galleryIds[0]) });
  try {
    await run.until(() => run.messages().length === 1);
    await run.send("No, ahora no.");
    assert.equal(run.exportPersistedDraft().conversation.usage.guidedFlowCompleted, true);
    await run.send("Ahora sí, quiero cambiar las fotos de la galería.");
    assert.equal(hasPanel(), true);
    assert.equal(run.calls.at(-1).capabilitySnapshot.conversation.mode, "editing");
    assert.equal(run.messages().filter(message => message.guidedCompletion).length, 1);
  } finally { await run.close(); }
});

test("acceptance is retained when a mixed request must recover an unconfirmed write", async () => {
  const run = await mountPanel({ savedDraft: galleryDraft(), failWrite: count => count === 1, respond: (_, index) => ({
    ...open(galleryIds[0]), actions: index === 1 ? [] : [{ type: "rsvp.set_enabled", arguments: { enabled: true } }],
  }) });
  try {
    await run.until(() => run.messages().length === 1);
    await run.send("Sí, ayudame con las fotos y activá RSVP.");
    assert.equal(run.messages().at(-1).intent, "error");
    assert.equal(hasPanel(), false);
    await run.click("Reintentar pendientes");
    await run.until(hasPanel);
    assert.equal(run.snapshot().values.rsvp.enabled, true);
    assert.equal(run.calls.length, 2);
    assert.equal(run.messages().filter(message => message.content.includes("¿Querés que te ayude")).length, 1);
  } finally { await run.close(); }
});
