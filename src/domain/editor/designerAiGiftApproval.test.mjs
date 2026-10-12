import test from "node:test";
import assert from "node:assert/strict";
import { buildDesignerAiCapabilitySnapshot } from "./designerAiCapabilities.js";
import { createDesignerAiGiftProposal, approveDesignerAiGiftProposal, requireDesignerAiGiftApproval, discardDesignerAiGiftProposal, resolveDesignerAiBankInput } from "./designerAiGiftApproval.js";

const method = (name, value, visible = true) => ({ type: "gifts.set_method", arguments: { method: name, value, visible } });
const enabled = value => ({ type: "gifts.set_enabled", arguments: { enabled: value } });
function context(actions, gifts = {}) {
  return { actions, rawGifts: gifts, snapshot: buildDesignerAiCapabilitySnapshot({ renderSnapshot: { gifts },
    documentNameState: { documentId: "A", documentKind: "draft", name: "Prueba", editable: true, hydrated: true } }) };
}

test("external list changes need an opaque one-use local approval; forged model fields cannot authorize", () => {
  const ctx = context([method("giftListLink", "https://lista.test/nueva")]);
  for (const forged of [null, {}, { approved: true }, { giftApproval: true }]) {
    assert.throws(() => requireDesignerAiGiftApproval(ctx, forged), { code: "designer-ai/gift-approval-required" });
  }
  const approval = approveDesignerAiGiftProposal(createDesignerAiGiftProposal(ctx), ctx);
  requireDesignerAiGiftApproval(ctx, approval);
  assert.throws(() => requireDesignerAiGiftApproval(ctx, approval), { code: "designer-ai/gift-approval-required" });
});

test("approval binds exact state, full hidden URL, action values and session lifetime", () => {
  for (const change of [ctx => { ctx.actions[0].arguments.value = "OTRO"; }, ctx => { ctx.rawGifts.giftListUrl = "https://other.test/"; }, ctx => { ctx.snapshot.documentIdentity = "draft:B"; }]) {
    const ctx = context([method("giftListLink", "https://lista.test/nueva")], { giftListUrl: "https://before.test/" });
    const approval = approveDesignerAiGiftProposal(createDesignerAiGiftProposal(ctx), ctx);
    change(ctx);
    assert.throws(() => requireDesignerAiGiftApproval(ctx, approval), { code: "designer-ai/gift-approval-required" });
  }
  const ctx = context([method("giftListLink", "https://lista.test/nueva")]);
  let current = true;
  const proposal = createDesignerAiGiftProposal(ctx, () => current);
  current = false;
  assert.throws(() => approveDesignerAiGiftProposal(proposal, ctx), { code: "designer-ai/stale-snapshot" });
  const cancelled = createDesignerAiGiftProposal(ctx);
  discardDesignerAiGiftProposal(cancelled);
  assert.throws(() => approveDesignerAiGiftProposal(cancelled, ctx));
});

test("explicit external list clearing, hidden priming, visibility-only and disabling still require review", () => {
  const raw = { enabled: true, giftListUrl: "https://lista.test/anterior", visibility: { giftListLink: true } };
  for (const actions of [[method("giftListLink", "")], [method("giftListLink", "https://lista.test/otra", false)], [method("giftListLink", null, false)], [method("alias", "APORTADO"), method("giftListLink", null, false)], [enabled(false)]]) {
    assert.ok(createDesignerAiGiftProposal(context(actions, raw)), JSON.stringify(actions));
  }
  assert.ok(createDesignerAiGiftProposal(context([method("giftListLink", null)], { ...raw, visibility: { giftListLink: false } })));
});

test("bank input and activation can hide an unconfirmed inherited list without reviewing it", () => {
  const raw = { enabled: true, giftListUrl: "https://plantilla.test/lista", visibility: { giftListLink: true } };
  for (const actions of [[enabled(true), method("alias", null)], ...["holder", "bank", "alias", "cbu", "cuit"].map(name => [method(name, "APORTADO")])]) {
    const ctx = context(actions, raw);
    ctx.snapshot = buildDesignerAiCapabilitySnapshot({ renderSnapshot: { gifts: raw }, sourceContext: { templateDerived: true, changedKeys: [] } });
    assert.equal(createDesignerAiGiftProposal(ctx), null);
    requireDesignerAiGiftApproval(ctx, null);
    if (actions[0].type === "gifts.set_enabled") assert.match(resolveDesignerAiBankInput(ctx).clarification, /Pasame Alias/);
  }
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

test("a mixed list review never enumerates bank values or asks to approve bank fields", () => {
  const ctx = context([enabled(true), method("alias", "BANCO.APORTADO"), method("giftListLink", "https://lista.test/nueva")],
    { bank: { holder: "TITULAR HEREDADO", cbu: "CBU HEREDADO" } });
  const proposal = createDesignerAiGiftProposal(ctx);
  assert.ok(proposal);
  assert.ok(proposal.steps.flatMap(step => step.rows).every(row => row.method === "giftListLink"));
  assert.doesNotMatch(JSON.stringify(proposal), /BANCO.APORTADO|TITULAR HEREDADO|CBU HEREDADO|Actualizar Alias/);
});

test("hidden previously confirmed bank data can be reactivated only while its durable fingerprint matches", () => {
  const ctx = context([method("alias", null)], { enabled: true, bank: { alias: "CONFIRMADO" }, visibility: { alias: false } });
  const leaf = ctx.snapshot.ledger.leaves.find(item => item.id === "gifts.method.alias.value");
  ctx.conversationState = { resolutions: [{ leafId: leaf.id, fingerprint: leaf.fingerprint,
    status: "resolved_from_user", provenance: "user_current_session" }] };
  assert.deepEqual(resolveDesignerAiBankInput(ctx).blockedMethods, []);
  requireDesignerAiGiftApproval(ctx, null);
  ctx.conversationState.resolutions[0].fingerprint = "stale";
  assert.throws(() => requireDesignerAiGiftApproval(ctx, null), { code: "designer-ai/bank-value-required" });
});

test("reactivation of confirmed existing destinations and failed persistence require fresh review", () => {
  const ctx = context([enabled(true)], { enabled: false, giftListUrl: "https://lista.test/existente", visibility: { giftListLink: true } });
  ctx.snapshot.ledger.leaves = [{ id: "gifts.method.giftListLink.visible", status: "resolved_from_user", provenance: "user_current_session" }];
  assert.ok(createDesignerAiGiftProposal(ctx));
  const action = method("giftListLink", "https://lista.test/visible");
  const retry = context([action], { enabled: true, giftListUrl: "https://lista.test/visible", visibility: { giftListLink: true } });
  retry.recovery = { confirmedGiftMethods: ["giftListLink"], actionResults: [{ action, effective: true, persisted: false, error: "write-failed" }] };
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

for (const name of ["holder", "bank", "cuit", "alias", "cbu"]) {
  test(`inherited ${name} is requested in chat and cannot be adopted by a direct executor`, () => {
    const ctx = context([enabled(true), method(name, null)], { enabled: false,
      bank: { [name]: "VALOR HEREDADO" }, visibility: { [name]: false } });
    assert.equal(createDesignerAiGiftProposal(ctx), null);
    const resolved = resolveDesignerAiBankInput(ctx);
    assert.deepEqual(resolved.actions, [enabled(true)]);
    assert.deepEqual(resolved.missingMethods, [name]);
    assert.doesNotMatch(resolved.clarification, /VALOR HEREDADO/);
    assert.throws(() => requireDesignerAiGiftApproval(ctx, null), { code: "designer-ai/bank-value-required" });
    const retry = context([method(name, null)], { enabled: true,
      bank: { [name]: "VALOR HEREDADO" }, visibility: { [name]: true } });
    retry.recovery = { confirmedGiftMethods: [name], actionResults: [{ action: method(name, null), effective: true, persisted: false, error: "write-failed" }] };
    assert.equal(createDesignerAiGiftProposal(retry), null);
    assert.throws(() => requireDesignerAiGiftApproval(retry, null), { code: "designer-ai/bank-value-required" });
  });
  test(`explicit supplied ${name} and preservation of a previously confirmed value need no new review`, () => {
    assert.equal(createDesignerAiGiftProposal(context([method(name, "APORTADO")])), null);
    const ctx = context([method(name, null)], { enabled: true, bank: { [name]: "CONFIRMADO" }, visibility: { [name]: true } });
    ctx.snapshot.ledger.leaves = [{ id: `gifts.method.${name}.value`, status: "resolved_from_user", provenance: "user_current_session" }];
    assert.equal(createDesignerAiGiftProposal(ctx), null);
    requireDesignerAiGiftApproval(ctx, null);
    for (const action of [method(name, "NUEVO"), method(name, "", false), method(name, null, false), enabled(false)]) {
      requireDesignerAiGiftApproval(context([action], { enabled: true, bank: { [name]: "ANTERIOR" }, visibility: { [name]: true } }), null);
    }
  });
}

test("retrying an effective URL clear or disable still reviews the destination before saving", () => {
  for (const name of ["giftListLink"]) {
    const action = method(name, "", false);
    const ctx = context([action], { enabled: true, visibility: { [name]: false } });
    ctx.recovery = { confirmedGiftMethods: [], actionResults: [{ action, effective: true, persisted: false, error: "write-failed" }] };
    const proposal = createDesignerAiGiftProposal(ctx);
    assert.ok(proposal, name);
    assert.ok(proposal.steps[0].rows.some(row => row.method === name && row.after === ""));
    assert.throws(() => requireDesignerAiGiftApproval(ctx, null));
  }
  for (const action of [enabled(false)]) {
    const ctx = context([action], { enabled: action.arguments.enabled ?? true,
      giftListUrl: "https://destino.oculto.test", visibility: { giftListLink: false } });
    ctx.recovery = { confirmedGiftMethods: [], actionResults: [{ action, effective: true, persisted: false, error: "write-failed" }] };
    const proposal = createDesignerAiGiftProposal(ctx);
    assert.ok(proposal);
    assert.ok(proposal.steps[0].rows.some(row => row.method === "giftListLink" && row.after === "https://destino.oculto.test/"));
    assert.throws(() => requireDesignerAiGiftApproval(ctx, null));
  }
});

test("retrying implicit template list hiding stays in chat while confirmed URL effects still require review", () => {
  for (const action of [enabled(true), method("holder", "Persona")]) {
    const ctx = context([action], { enabled: true,
      giftListUrl: "https://plantilla.test/lista", visibility: { giftListLink: false } });
    ctx.recovery = { confirmedGiftMethods: [], actionResults: [{ action, effective: true, persisted: false, error: "write-failed" }] };
    assert.equal(createDesignerAiGiftProposal(ctx), null);
    requireDesignerAiGiftApproval(ctx, null);
    ctx.recovery.confirmedGiftMethods = ["giftListLink"];
    assert.ok(createDesignerAiGiftProposal(ctx));
    assert.throws(() => requireDesignerAiGiftApproval(ctx, null), { code: "designer-ai/gift-approval-required" });
  }
});
