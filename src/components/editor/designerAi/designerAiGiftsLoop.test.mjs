import test from "node:test";
import assert from "node:assert/strict";
import { mountPanel, capabilities, ledger } from "./testSupport/panelHarness.mjs";
import { withDesignerAiGuidedContinuation } from "../../../domain/editor/designerAiGuidedConversation.js";

const galleryId = "synthetic-gallery";
const gift = (type, args) => ({ type: `gifts.${type}`, arguments: args });
const aliasAction = gift("set_method", { method: "alias", value: "ALIAS.PRUEBA", visible: true });
const gallery = { type: "gallery_cell_upload", galleryId, cellId: "photo", cellIndex: 0 };
function draft({ enabled = true, parentStatus = "needs_clarification", provenance = "user_current_session", alias = "" } = {}) {
  const value = { authoring: { fieldsSchema: [], defaults: {} }, render: {
    objetos: [{ id: galleryId, tipo: "galeria", rows: 1, cols: 1, cells: [{ id: "photo", mediaUrl: "https://example.test/photo.jpg" }] }],
    secciones: [], rsvp: { enabled: false }, gifts: { enabled, bank: { alias }, visibility: { alias: true, cbu: false } }, eventDetails: { mode: "single" },
  } };
  const snapshot = capabilities.buildDesignerAiCapabilitySnapshot({ authoringSnapshot: value.authoring, renderSnapshot: value.render });
  value.conversation = { resolutions: snapshot.ledger.leaves
    .filter(leaf => (snapshot.ledger.guidedFlow.leafIds.includes(leaf.id) && leaf.block !== "galleries" && !leaf.id.startsWith("gifts.")) ||
      leaf.id === "gifts.enabled" || (alias && ["gifts.method.alias.visible", "gifts.method.alias.value"].includes(leaf.id)))
    .map(leaf => ({ leafId: leaf.id, fingerprint: leaf.fingerprint, status: leaf.id === "gifts.enabled" ? parentStatus : "resolved_from_user",
      provenance: leaf.id === "gifts.enabled" ? provenance : "user_current_session", rule: null })) };
  return value;
}
const hasGallery = () => document.body.textContent.includes("Terminé con esta galería");

for (const variant of ["prior clarification", "same-turn parent clarification", "same-turn alias clarification"]) {
  test(`confirmed alias advances once to Gallery and never returns to Gifts: ${variant}`, async () => {
    const prior = variant === "prior clarification";
    let run = await mountPanel({ savedDraft: draft({ enabled: prior, parentStatus: prior ? "needs_clarification" : "pending" }), respond: (_, index) => {
      if (index === 1) return { assistantMessage: "Pasame el alias que quieran mostrar." };
      if (index === 2) return {
        actions: [...(prior ? [] : [gift("set_enabled", { enabled: true })]), aliasAction],
        resolutions: prior ? [] : [{ leafId: variant.includes("alias") ? "gifts.method.alias.value" : "gifts.enabled", status: "needs_clarification", rule: null }],
        assistantMessage: "Habilité regalos y dejé visible el alias. ¿Quieren que los ayude a cambiar las fotos de la galería?",
      };
      if (index === 3) return { controlRequest: gallery, assistantMessage: "Acá podés cambiar las fotos." };
      return { assistantMessage: "Listo." };
    } });
    try {
      await run.until(() => run.messages().length === 1);
      await run.send("Usá el alias ALIAS.PRUEBA.");
      assert.equal(ledger.buildDesignerAiConversationBrief(run.snapshot()).nextBlock.id, "galleries");
      assert.equal(run.snapshot().values.gifts.methods.alias.value, "ALIAS.PRUEBA");
      assert.equal(run.snapshot().ledger.leaves.find(leaf => leaf.id === "gifts.method.alias.value").status, "resolved_from_user");
      assert.equal(hasGallery(), false);
      await run.send("Sí.");
      assert.equal(hasGallery(), true, "one yes accepts the one visible offer");
      assert.equal(run.messages().filter(message => /¿.*ayud.*fotos/.test(message.content)).length, 1);
      await run.click("Terminé con esta galería");
      await run.until(() => run.messages().some(message => message.guidedCompletion));
      assert.equal(run.calls.length, 3, "completion does not re-query Gifts");
      assert.equal(run.snapshot().ledger.guidedFlow.completion.complete, true);
      assert.doesNotMatch(run.messages().at(-1).content, /lista externa|datos bancarios/);
      await run.click("Ver vista previa");
      assert.equal(run.previews(), 1);
      const saved = run.exportPersistedDraft();
      await run.close(); run = null;
      run = await mountPanel({ savedDraft: saved, respond: () => ({ assistantMessage: "Seguimos ajustando." }) });
      await run.until(() => run.messages().length === 1);
      assert.equal(run.calls[0].capabilitySnapshot.conversation.mode, "editing");
      assert.equal(ledger.buildDesignerAiConversationBrief(run.snapshot()).nextBlock, null);
    } finally { await run?.close(); }
  });
}

test("asking for the selected bank data does not append a second choice of gift method", () => {
  const value = draft();
  const snapshot = capabilities.buildDesignerAiCapabilitySnapshot({ authoringSnapshot: value.authoring, renderSnapshot: value.render, conversationState: value.conversation });
  for (const message of ["Perfecto. Pasame el alias que quieran mostrar.", "Compartime el enlace de la lista.", "¿Qué alias quieren mostrar?"]) {
    for (const resolutions of [[], [{ leafId: "gifts.enabled", status: "needs_clarification", rule: null }]]) {
      for (const actions of [[], [gift("set_enabled", { enabled: true })]]) {
        assert.equal(withDesignerAiGuidedContinuation(message, { previousSnapshot: snapshot, snapshot,
          result: { intent: actions.length ? "apply" : "clarify", actions, resolutions } }), message);
      }
    }
  }
});

test("a bare acknowledgement still continues the guided flow", () => {
  const value = draft();
  const snapshot = capabilities.buildDesignerAiCapabilitySnapshot({ authoringSnapshot: value.authoring, renderSnapshot: value.render, conversationState: value.conversation });
  assert.match(withDesignerAiGuidedContinuation("Perfecto.", { previousSnapshot: snapshot, snapshot, result: { intent: "clarify", actions: [], resolutions: [] } }), /lista externa.*datos bancarios/);
});

for (const provenance of ["template_value", "placeholder_or_sample", "unknown", "user_current_session", "existing_user_data"]) {
  test(`old Gifts clarification reuses only confirmed existing data: ${provenance}`, () => {
    const value = draft({ alias: "ALIAS.PRUEBA", provenance });
    const snapshot = capabilities.buildDesignerAiCapabilitySnapshot({ authoringSnapshot: value.authoring, renderSnapshot: value.render, conversationState: value.conversation });
    const trusted = ["user_current_session", "existing_user_data"].includes(provenance);
    assert.equal(ledger.buildDesignerAiConversationBrief(snapshot).nextBlock.id, trusted ? "galleries" : "gifts");
    const parent = snapshot.ledger.leaves.find(leaf => leaf.id === "gifts.enabled");
    assert.equal(parent.rule, trusted ? "keep_existing" : null);
    assert.equal(parent.provenance, provenance);
  });
}

test("empty, unconfirmed and deferred Gifts do not receive false confirmation", () => {
  for (const variant of ["empty", "template alias", "deferred", "disabled"]) {
    const value = draft({ alias: variant === "empty" ? "" : "ALIAS.PRUEBA", enabled: variant !== "disabled",
      parentStatus: variant === "deferred" ? "deferred_by_user" : "needs_clarification" });
    if (variant === "template alias") for (const leaf of value.conversation.resolutions.filter(leaf => leaf.leafId.startsWith("gifts.method."))) leaf.provenance = "template_value";
    const snapshot = capabilities.buildDesignerAiCapabilitySnapshot({ authoringSnapshot: value.authoring, renderSnapshot: value.render, conversationState: value.conversation });
    const parent = snapshot.ledger.leaves.find(leaf => leaf.id === "gifts.enabled");
    assert.equal(parent.status, variant === "deferred" ? "deferred_by_user" : "needs_clarification");
    assert.equal(parent.rule, null);
  }
});

test("a deliberately selected incomplete method asks only for its missing value", async () => {
  const run = await mountPanel({ savedDraft: draft({ alias: "ALIAS.PRUEBA" }), respond: (_, index) => index === 1
    ? { assistantMessage: "Podés seguir ajustando." }
    : { actions: [gift("set_method", { method: "cbu", visible: true, value: "" })], assistantMessage: "Listo." } });
  try {
    await run.until(() => run.messages().length === 1);
    await run.send("Quiero agregar también CBU.");
    assert.equal(ledger.buildDesignerAiConversationBrief(run.snapshot()).nextBlock.id, "gifts");
    assert.match(run.messages().at(-1).content, /CBU o CVU/);
    assert.doesNotMatch(run.messages().at(-1).content, /lista externa.*datos bancarios/);
  } finally { await run.close(); }
});

test("failed alias persistence blocks progression until the existing retry confirms it", async () => {
  let fail = false;
  const run = await mountPanel({ savedDraft: draft(), failWrite: () => fail, respond: (_, index) => index === 1
    ? { assistantMessage: "Pasame el alias." }
    : { actions: [aliasAction], assistantMessage: "Agregué el alias. ¿Quieren ayuda con las fotos?" } });
  try {
    await run.until(() => run.messages().length === 1);
    fail = true;
    await run.send("El alias es ALIAS.PRUEBA.");
    assert.equal(run.messages().at(-1).intent, "error");
    assert.equal(ledger.buildDesignerAiConversationBrief(run.snapshot()).nextBlock.id, "gifts");
    assert.equal(hasGallery(), false);
    fail = false;
    await run.click("Reintentar pendientes");
    await run.until(() => ledger.buildDesignerAiConversationBrief(run.snapshot()).nextBlock.id === "galleries");
    assert.equal(run.snapshot().ledger.leaves.find(leaf => leaf.id === "gifts.method.alias.value").status, "resolved_from_user");
  } finally { await run.close(); }
});
