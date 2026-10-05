import test from "node:test";
import assert from "node:assert/strict";
import { mountPanel, capabilities } from "./testSupport/panelHarness.mjs";
import { buildDesignerAiLocalContinuation } from "../../../domain/editor/designerAiGuidedConversation.js";

const open = { intent: "apply", assistantMessage: "Acá podés subir la nueva foto de portada.", controlRequest: { type: "cover_upload" } };
const offer = { assistantMessage: "¿Qué foto quieren usar para la portada?" };
const hasCoverControl = () => Boolean(document.querySelector('section[aria-label="Selección para la invitación"]')) && !document.body.textContent.includes("Terminé con esta galería");
function coverDraft({ gallery = false } = {}) {
  const draft = { sourceContext: { templateDerived: true }, coverImage: "https://example.test/cover.jpg", authoring: { fieldsSchema: [], defaults: {} }, render: {
    objetos: gallery ? [{ id: "gallery-a", tipo: "galeria", rows: 1, cols: 1, cells: [{ id: "photo", mediaUrl: "https://example.test/gallery.jpg" }] }] : [],
    secciones: [], rsvp: { enabled: false }, gifts: { enabled: false }, eventDetails: { mode: "single" },
  } };
  const snapshot = capabilities.buildDesignerAiCapabilitySnapshot({ coverImage: draft.coverImage, authoringSnapshot: draft.authoring, renderSnapshot: draft.render });
  draft.conversation = { resolutions: snapshot.ledger.leaves
    .filter(leaf => snapshot.ledger.guidedFlow.leafIds.includes(leaf.id) && !["cover", "galleries"].includes(leaf.block))
    .map(leaf => ({ leafId: leaf.id, fingerprint: leaf.fingerprint, status: "resolved_from_user", provenance: "user_current_session", rule: null })) };
  return draft;
}

for (const prematureControl of [false, true]) test(`cover offer precedes uploader (premature request: ${prematureControl})`, async () => {
  const run = await mountPanel({ savedDraft: coverDraft({ gallery: true }), respond: (_, index) => {
    if (index > 2) throw new Error("apply requiere acciones, una decisión o un control local.");
    return index === 1 ? prematureControl ? open : offer : open;
  } });
  try {
    await run.until(() => run.messages().length === 1);
    assert.match(run.messages()[0].content, /¿Querés cambiar la foto de portada actual\?/);
    assert.equal(hasCoverControl(), false);
    await run.send("Sí, la subo acá?");
    assert.equal(hasCoverControl(), true);
    assert.equal(run.snapshot().ledger.leaves.find(l => l.id === "media.cover").status, "requires_control");
    await run.replaceCover("https://example.test/cover.jpg");
    assert.equal(run.calls.length, 2, "same image is not completion evidence");
    await run.replaceCover("https://example.test/new-cover.jpg");
    await run.until(() => run.messages().at(-1).content.includes("galerías"));
    assert.equal(run.calls.length, 2, "verified cover continuation never asks the model to propose another change");
    assert.equal(run.messages().some(m => m.canRetryContinuation), false);
    assert.match(run.messages().at(-1).content, /cambié la foto de portada/);
    assert.equal(hasCoverControl(), false);
    assert.equal(run.snapshot().ledger.leaves.find(l => l.id === "media.cover").status, "resolved_by_control");
    assert.equal(run.messages().filter(m => m.content.includes("¿Querés cambiar")).length, 1);
    assert.equal(run.exportPersistedDraft().coverImage, "https://example.test/new-cover.jpg");
  } finally { await run.close(); }
});

test("decline preserves the existing cover, advances and survives reload in editing", async () => {
  let run = await mountPanel({ savedDraft: coverDraft(), respond: (_, index) => index === 1 ? offer : {
    assistantMessage: "Seguimos.", resolutions: [{ leafId: "media.cover", status: "deferred_by_user", rule: null }],
  } });
  try {
    await run.until(() => run.messages().length === 1);
    await run.send("No, dejemos la actual.");
    assert.equal(hasCoverControl(), false);
    assert.equal(run.exportPersistedDraft().coverImage, "https://example.test/cover.jpg");
    assert.match(run.messages().find(m => m.content.includes("Conservamos")).content, /tab Fotos/);
    assert.equal(run.snapshot().ledger.leaves.find(l => l.id === "media.cover").status, "deferred_by_user");
    assert.equal(run.messages().at(-1).guidedCompletion, true);
    await run.click("Ver vista previa");
    assert.equal(run.previews(), 1);
    const savedDraft = run.exportPersistedDraft();
    await run.close(); run = null;
    run = await mountPanel({ savedDraft, respond: (_, index) => index === 2 ? open : { assistantMessage: "Seguimos con tu invitación." } });
    await run.until(() => run.messages().length === 1);
    assert.doesNotMatch(run.messages()[0].content, /¿Querés cambiar/);
    await run.send("Ahora quiero cambiar la portada.");
    assert.equal(hasCoverControl(), true);
    await run.replaceCover("https://example.test/new-cover.jpg");
    await run.until(() => run.messages().at(-1).content.includes("cambié la foto de portada"));
    assert.equal(run.calls.length, 2);
    assert.equal(run.calls.at(-1).capabilitySnapshot.conversation.mode, "editing");
    assert.doesNotMatch(run.messages().at(-1).content, /¿|\?/);
    assert.equal(run.messages().some(m => m.guidedCompletion), false);
  } finally { await run?.close(); }
});

test("closing the cover control leaves it pending; an actual replacement closes the journey with preview", async () => {
  const run = await mountPanel({ savedDraft: coverDraft(), respond: (_, index) => index === 1 ? offer : open });
  try {
    await run.until(() => run.messages().length === 1);
    await run.send("Sí.");
    await run.click("Volver al chat");
    assert.equal(run.snapshot().ledger.leaves.find(l => l.id === "media.cover").status, "requires_control");
    assert.equal(run.messages().some(m => m.guidedCompletion), false);
    await run.send("Quiero cambiar la portada.");
    await run.replaceCover("https://example.test/changed.jpg");
    await run.until(() => run.messages().some(m => m.guidedCompletion));
    assert.equal(run.calls.length, 3, "no extra provider call at completion");
    assert.equal(run.exportPersistedDraft().conversation.usage.guidedFlowCompleted, true);
    await run.click("Ver vista previa");
    assert.equal(run.previews(), 1);
  } finally { await run.close(); }
});

test("one yes opens Gallery after the verified cover without another consent loop", async () => {
  const run = await mountPanel({ savedDraft: coverDraft({ gallery: true }), respond: (_, index) => {
    return index === 1 ? offer : index === 2 ? open : { intent: "apply", assistantMessage: "Acá podés cambiar las fotos.",
      controlRequest: { type: "gallery_cell_upload", galleryId: "gallery-a", cellId: "photo", cellIndex: 0 } };
  } });
  try {
    await run.until(() => run.messages().length === 1);
    await run.send("Sí.");
    await run.replaceCover("https://example.test/changed.jpg");
    await run.until(() => run.messages().at(-1).content.includes("galerías"));
    assert.equal(run.snapshot().ledger.leaves.find(l => l.id === "media.cover").status, "resolved_by_control");
    assert.equal(run.exportPersistedDraft().coverImage, "https://example.test/changed.jpg");
    await run.send("Sí.");
    assert.match(document.body.textContent, /Terminé con esta galería/);
    assert.equal(run.messages().filter(m => m.content.includes("¿Querés que te ayude")).length, 1);
    assert.equal(hasCoverControl(), false);
    await run.click("Terminé con esta galería");
    await run.until(() => run.messages().some(m => m.guidedCompletion));
    await run.click("Ver vista previa");
    assert.equal(run.previews(), 1);
  } finally { await run.close(); }
});

test("gift alias confirmation leads to one cover offer, then one gallery offer after declining", async () => {
  const savedDraft = coverDraft({ gallery: true });
  savedDraft.conversation.resolutions = savedDraft.conversation.resolutions.filter(r => !r.leafId.startsWith("gifts."));
  const run = await mountPanel({ savedDraft, respond: (_, index) => index === 1 ? { assistantMessage: "Pasame el alias que quieran mostrar." } : index === 2 ? {
    intent: "apply", assistantMessage: "Activo regalos con el alias. ¿Qué foto quieren usar para la portada?",
    actions: [{ type: "gifts.set_enabled", arguments: { enabled: true } },
      { type: "gifts.set_method", arguments: { method: "alias", value: "ALIAS.PRUEBA", visible: true } }],
  } : { assistantMessage: "Seguimos.", resolutions: [{ leafId: "media.cover", status: "deferred_by_user", rule: null }] } });
  try {
    await run.until(() => run.messages().length === 1);
    await run.send("Activá regalos con el alias ALIAS.PRUEBA.");
    assert.match(run.messages().at(-1).content, /¿Querés cambiar la foto de portada actual\?/);
    assert.doesNotMatch(run.messages().at(-1).content, /Qué foto|Listo, guardé/);
    assert.equal(run.snapshot().values.gifts.methods.alias.value, "ALIAS.PRUEBA");
    assert.equal(hasCoverControl(), false);
    await run.send("No, la dejamos así.");
    assert.match(run.messages().at(-1).content, /Conservamos la portada actual/);
    assert.match(run.messages().at(-1).content, /¿Querés que te ayude a cambiar las fotos de las galerías\?/);
    assert.equal(run.exportPersistedDraft().coverImage, savedDraft.coverImage);
  } finally { await run.close(); }
});

test("a failed cover deferral write cannot advance or claim the decision was saved", async () => {
  let failNext = false;
  const run = await mountPanel({ savedDraft: coverDraft(), failMetadata: () => { const fail = failNext; failNext = false; return fail; },
    respond: (_, index) => index === 1 ? offer : { assistantMessage: "Seguimos.", resolutions: [{ leafId: "media.cover", status: "deferred_by_user", rule: null }] } });
  try {
    await run.until(() => run.messages().length === 1);
    failNext = true;
    await run.send("No, ahora no.");
    assert.equal(run.messages().at(-1).intent, "error");
    assert.equal(run.messages().some(m => m.guidedCompletion), false);
    assert.equal(run.snapshot().ledger.leaves.find(l => l.id === "media.cover").status, "requires_control");
    await run.click("Reintentar");
    await run.until(() => run.messages().some(m => m.guidedCompletion));
  } finally { await run.close(); }
});

test("cover acknowledgement waits for its metadata write and never queries the model", async () => {
  let failNext = false;
  const run = await mountPanel({ savedDraft: coverDraft({ gallery: true }), failMetadata: () => { const fail = failNext; failNext = false; return fail; },
    respond: (_, index) => index === 1 ? offer : open });
  try {
    await run.until(() => run.messages().length === 1);
    await run.send("Sí.");
    failNext = true;
    await run.replaceCover("https://example.test/new-cover.jpg");
    assert.equal(hasCoverControl(), true);
    assert.equal(run.messages().some(m => m.content.includes("cambié la foto")), false);
    assert.equal(run.calls.length, 2);
    await run.replaceCover("https://example.test/new-cover.jpg");
    await run.until(() => run.messages().at(-1).content.includes("cambié la foto"));
    assert.equal(run.calls.length, 2);
    assert.equal(run.snapshot().ledger.leaves.find(l => l.id === "media.cover").status, "resolved_by_control");
  } finally { await run.close(); }
});

test("local continuation resumes consented Gallery through the validated existing control", async () => {
  const run = await mountPanel({ savedDraft: coverDraft({ gallery: true }), respond: (_, index) => index === 1 ? offer : open });
  try {
    await run.until(() => run.messages().length === 1);
    run.journeyRef.current.galleryHelp = { offered: true, accepted: true };
    await run.send("Sí.");
    await run.replaceCover("https://example.test/new-cover.jpg");
    await run.until(() => document.body.textContent.includes("Terminé con esta galería"));
    assert.equal(run.messages().some(m => m.content.includes("¿Querés que te ayude")), false);
    assert.equal(run.calls.length, 2);
    assert.equal(run.snapshot().ledger.leaves.find(l => l.id === "media.gallery.gallery-a.guided_completion").status, "requires_control");
  } finally { await run.close(); }
});

test("local continuation uses the actual next block and never fabricates resolutions", () => {
  const draft = coverDraft({ gallery: true });
  draft.conversation.resolutions = draft.conversation.resolutions.filter(r => !r.leafId.startsWith("rsvp."));
  const snapshot = capabilities.buildDesignerAiCapabilitySnapshot({ coverImage: draft.coverImage, authoringSnapshot: draft.authoring,
    renderSnapshot: draft.render, conversationState: draft.conversation, sourceContext: draft.sourceContext });
  const before = structuredClone(snapshot);
  const next = buildDesignerAiLocalContinuation(snapshot, { galleryHelp: { accepted: true } });
  assert.match(next.assistantMessage, /confirmen asistencia/);
  assert.equal(next.controlRequest, null);
  assert.deepEqual(snapshot, before);
  assert.equal(next.resolutions, undefined);
  const editing = buildDesignerAiLocalContinuation({ ...snapshot, conversation: { mode: "editing" } }, { galleryHelp: { accepted: true } });
  assert.doesNotMatch(editing.assistantMessage, /¿|\?/);
  assert.equal(editing.controlRequest, null);
});

test("an existing continuation error closes durably after manual edits, including metadata retry", async () => {
  const savedDraft = coverDraft({ gallery: true });
  const snapshot = capabilities.buildDesignerAiCapabilitySnapshot({ coverImage: savedDraft.coverImage, authoringSnapshot: savedDraft.authoring, renderSnapshot: savedDraft.render });
  savedDraft.conversation.resolutions.push({ ...snapshot.ledger.leaves.find(l => l.id === "media.cover"),
    leafId: "media.cover", status: "resolved_by_control", provenance: "user_current_session", rule: null });
  let failNext = false;
  let run = await mountPanel({ savedDraft, initialMessages: [{ id: "prior-error", role: "assistant", content: "El cambio quedó reflejado, pero no pude preparar el próximo paso.", intent: "error", canRetryContinuation: true }],
    failMetadata: () => { const fail = failNext; failNext = false; return fail; }, respond: () => { throw new Error("Continuation must not call the provider"); } });
  try {
    run.update({ objetos: [] }); // User removed the only remaining gallery manually.
    await window.canvasEditor.flushPersistenceNow();
    failNext = true;
    await run.click("Continuar recorrido");
    assert.equal(run.messages().some(m => m.guidedCompletion), false);
    assert.notEqual(run.exportPersistedDraft().conversation.usage?.guidedFlowCompleted, true);
    await run.click("Continuar recorrido");
    await run.until(() => run.messages().some(m => m.guidedCompletion));
    assert.equal(run.exportPersistedDraft().conversation.usage.guidedFlowCompleted, true);
    assert.equal(run.calls.length, 0);
    const persisted = run.exportPersistedDraft();
    await run.close(); run = null;
    // A later manual change reopens a pending field, but must not restart onboarding.
    persisted.render.rsvp.enabled = true;
    run = await mountPanel({ savedDraft: persisted, respond: () => ({ assistantMessage: "Podés seguir ajustando la invitación." }) });
    await run.until(() => run.calls.length === 1);
    assert.equal(run.calls[0].capabilitySnapshot.conversation.mode, "editing");
  } finally { await run?.close(); }
});
