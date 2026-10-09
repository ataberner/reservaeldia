import test from "node:test";
import assert from "node:assert/strict";
import { buildDesignerAiCapabilitySnapshot } from "./designerAiCapabilities.js";
import { createDesignerAiGiftProposal, approveDesignerAiGiftProposal, requireDesignerAiGiftApproval, discardDesignerAiGiftProposal } from "./designerAiGiftApproval.js";

const method = (name, value, visible = true) => ({ type: "gifts.set_method", arguments: { method: name, value, visible } });
const enabled = value => ({ type: "gifts.set_enabled", arguments: { enabled: value } });
function context(actions, gifts = {}) {
  return { actions, rawGifts: gifts, snapshot: buildDesignerAiCapabilitySnapshot({ renderSnapshot: { gifts },
    documentNameState: { documentId: "A", documentKind: "draft", name: "Prueba", editable: true, hydrated: true } }) };
}

test("sensitive changes need an opaque one-use local approval; forged model fields cannot authorize", () => {
  const ctx = context([method("alias", "ALIAS.NUEVO")]);
  for (const forged of [null, {}, { approved: true }, { giftApproval: true }]) {
    assert.throws(() => requireDesignerAiGiftApproval(ctx, forged), { code: "designer-ai/gift-approval-required" });
  }
  const approval = approveDesignerAiGiftProposal(createDesignerAiGiftProposal(ctx), ctx);
  requireDesignerAiGiftApproval(ctx, approval);
  assert.throws(() => requireDesignerAiGiftApproval(ctx, approval), { code: "designer-ai/gift-approval-required" });
});

test("approval binds exact state, full hidden URL, action values and session lifetime", () => {
  for (const change of [ctx => { ctx.actions[0].arguments.value = "OTRO"; }, ctx => { ctx.rawGifts.giftListUrl = "https://other.test/"; }, ctx => { ctx.snapshot.documentIdentity = "draft:B"; }]) {
    const ctx = context([method("alias", "NUEVO")], { giftListUrl: "https://before.test/" });
    const approval = approveDesignerAiGiftProposal(createDesignerAiGiftProposal(ctx), ctx);
    change(ctx);
    assert.throws(() => requireDesignerAiGiftApproval(ctx, approval), { code: "designer-ai/gift-approval-required" });
  }
  const ctx = context([method("cbu", "1234567890123456789012")]);
  let current = true;
  const proposal = createDesignerAiGiftProposal(ctx, () => current);
  current = false;
  assert.throws(() => approveDesignerAiGiftProposal(proposal, ctx), { code: "designer-ai/stale-snapshot" });
  const cancelled = createDesignerAiGiftProposal(ctx);
  discardDesignerAiGiftProposal(cancelled);
  assert.throws(() => approveDesignerAiGiftProposal(cancelled, ctx));
});

test("clearing, hidden priming, visibility-only and implicit hiding all require review", () => {
  const raw = { enabled: true, bank: { alias: "ANTERIOR" }, visibility: { alias: true } };
  for (const actions of [[method("alias", "")], [method("alias", "OTRO", false)], [method("alias", null, false)], [method("holder", "Persona")], [enabled(false)]]) {
    assert.ok(createDesignerAiGiftProposal(context(actions, raw)), JSON.stringify(actions));
  }
  assert.ok(createDesignerAiGiftProposal(context([method("alias", null)], { ...raw, visibility: { alias: false } })));
});

test("review shows every intermediate sensitive effect, normalization, and all mixed actions", () => {
  const ctx = context([{ type: "story.set_text", arguments: { text: "Historia" } }, enabled(true),
    method("giftListLink", "example.test/lista"), method("giftListLink", "https://other.test/lista")]);
  const proposal = createDesignerAiGiftProposal(ctx);
  assert.equal(proposal.summary.length, 4);
  const links = proposal.steps.flatMap(step => step.rows).filter(row => row.method === "giftListLink");
  assert.deepEqual(links.map(row => row.after), ["https://example.test/lista", "https://other.test/lista"]);
  assert.ok(links.every(row => row.afterVisible));
});

test("reactivation of confirmed existing destinations and failed persistence require fresh review", () => {
  const ctx = context([enabled(true)], { enabled: false, bank: { alias: "EXISTENTE" }, visibility: { alias: true } });
  ctx.snapshot.ledger.leaves = [{ id: "gifts.method.alias.visible", status: "resolved_from_user", provenance: "user_current_session" }];
  assert.ok(createDesignerAiGiftProposal(ctx));
  const action = method("alias", "YA.VISIBLE");
  const retry = context([action], { enabled: true, bank: { alias: "YA.VISIBLE" }, visibility: { alias: true } });
  retry.recovery = { confirmedGiftMethods: ["alias"], actionResults: [{ action, effective: true, persisted: false, error: "write-failed" }] };
  const proposal = createDesignerAiGiftProposal(retry);
  assert.ok(proposal.steps[0].persistOnly);
  assert.throws(() => requireDesignerAiGiftApproval(retry, null));
});

test("ordinary copy and empty gift activation need no confirmation", () => {
  for (const actions of [[enabled(true)], [{ type: "gifts.set_intro_text", arguments: { text: "Gracias" } }]]) {
    assert.equal(createDesignerAiGiftProposal(context(actions)), null);
    requireDesignerAiGiftApproval(context(actions), null);
  }
});

test("retrying an effective clear, disable or implicit hiding still reviews the destination before saving", () => {
  for (const name of ["alias", "cbu", "giftListLink"]) {
    const action = method(name, "", false);
    const ctx = context([action], { enabled: true, visibility: { [name]: false } });
    ctx.recovery = { confirmedGiftMethods: [], actionResults: [{ action, effective: true, persisted: false, error: "write-failed" }] };
    const proposal = createDesignerAiGiftProposal(ctx);
    assert.ok(proposal, name);
    assert.ok(proposal.steps[0].rows.some(row => row.method === name && row.after === ""));
    assert.throws(() => requireDesignerAiGiftApproval(ctx, null));
  }
  for (const action of [enabled(false), enabled(true), method("holder", "Persona")]) {
    const ctx = context([action], { enabled: action.arguments.enabled ?? true,
      bank: { alias: "DESTINO.OCULTO" }, visibility: { alias: false } });
    ctx.recovery = { confirmedGiftMethods: [], actionResults: [{ action, effective: true, persisted: false, error: "write-failed" }] };
    const proposal = createDesignerAiGiftProposal(ctx);
    assert.ok(proposal);
    assert.ok(proposal.steps[0].rows.some(row => row.method === "alias" && row.after === "DESTINO.OCULTO"));
    assert.throws(() => requireDesignerAiGiftApproval(ctx, null));
  }
});
