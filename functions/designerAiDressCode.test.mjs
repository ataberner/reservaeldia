import test from "node:test";
import assert from "node:assert/strict";
import contract from "../shared/designerAiCapabilityContract.cjs";
import service from "./lib/designerAi/service.js";

const { interpretDesignerAiChat, buildDesignerAiConversationBrief, validateDesignerAiModelResult } = service;
const dressLeafId = "event.dress_code.enabled";
const question = "El cambio quedó guardado. ¿Quieren incluir Dress Code?";
const hiddenText = "Elegante sport";

function payload({ message = "no", mode = "guided", entryMode = "continuation", lastMessage = question,
  nextLeafId = dressLeafId, enabled = true, value = hiddenText, valueProvenance = "template_value" } = {}) {
  const leaf = { id: nextLeafId, block: nextLeafId === dressLeafId ? "dress_code" : "rsvp",
    status: "pending", provenance: "unknown", rule: null, fingerprint: "synthetic-fingerprint" };
  const textLeaf = { id: "event.dress_code.value", block: "dress_code", status: "pending",
    provenance: valueProvenance, rule: null, fingerprint: "synthetic-value" };
  return {
    contractVersion: contract.DESIGNER_AI_CONTRACT_VERSION,
    draftId: "synthetic-dress-code", clientMessageId: "synthetic-turn", requestCreatedAt: Date.now(),
    entryMode, message,
    recentTurns: lastMessage === null ? [] : [{ role: "assistant", content: lastMessage }],
    capabilitySnapshot: contract.sanitizeCapabilitySnapshot({ revision: "synthetic-revision",
      availability: { dressCode: true, rsvp: true }, values: { dressCode: { enabled, value } },
      conversation: { mode }, ledger: { version: 4, leaves: [leaf, textLeaf], guidedFlow: { leafIds: [nextLeafId] } },
    }),
  };
}

function result({ actions = [], resolutions = [], intent = "clarify" } = {}) {
  return { intent, assistantMessage: "Seguimos.", actions, resolutions, controlRequest: null };
}

const postpone = (leafId = dressLeafId) => result({
  resolutions: [{ leafId, status: "deferred_by_user", rule: null }],
});
const disable = (value = hiddenText) => result({ intent: "apply", actions: [{
  type: "event.set_dress_code", arguments: { enabled: false, value },
}] });

function provider(...results) {
  const requests = [];
  return { requests, client: { responses: { create: async (request) => {
    requests.push(request);
    const proposal = results[Math.min(requests.length - 1, results.length - 1)];
    return { output: [{ type: "function_call", name: "submit_designer_ai_result", arguments: JSON.stringify(proposal) }] };
  } } } };
}

test("a negative Dress Code answer repairs a model deferral into the existing disable action", async () => {
  const input = payload();
  assert.equal(buildDesignerAiConversationBrief(input.capabilitySnapshot).nextStep.kind, "dress_code_enabled");
  const stub = provider(postpone(), disable());
  const answer = await interpretDesignerAiChat({ payload: input, client: stub.client });
  assert.equal(stub.requests.length, 2);
  assert.equal(answer.repairCount, 1);
  assert.deepEqual(answer.actions, disable().actions);
  assert.deepEqual(answer.resolutions, []);
  assert.match(stub.requests[1].input.at(-1).content, /event\.set_dress_code/);
  assert.match(stub.requests[1].input.at(-1).content, /no.*postergación/i);
  assert.equal(stub.requests[1].input.at(-1).content.includes(hiddenText), false);
});

test("a disabling action cannot carry a deferral that would overwrite its visibility receipt", async () => {
  const contradictory = { ...disable(""), resolutions: postpone().resolutions };
  assert.throws(() => validateDesignerAiModelResult(contradictory, payload().capabilitySnapshot),
    /sin mutación en el lote/);
  const stub = provider(contradictory, disable(""));
  const answer = await interpretDesignerAiChat({ payload: payload(), client: stub.client });
  assert.equal(answer.repairCount, 1);
  assert.deepEqual(answer.actions, disable().actions);
  assert.deepEqual(answer.resolutions, []);
});

for (const message of ["NO!", "No, gracias.", "Prefiero que no", "No queremos incluir Dress Code", "Sin Dress Code"]) {
  test(`a clear contextual refusal requires disabling Dress Code: ${message}`, async () => {
    const stub = provider(result(), disable());
    const answer = await interpretDesignerAiChat({ payload: payload({ message }), client: stub.client });
    assert.equal(answer.repairCount, 1);
    assert.deepEqual(answer.actions, disable().actions);
  });
}

for (const [name, proposal] of [
  ["empty acknowledgement", result()],
  ["deferral", postpone()],
  ["opposite visibility", result({ actions: [{ type: "event.set_dress_code", arguments: { enabled: true, value: hiddenText } }] })],
  ["unrelated mutation", result({ actions: [{ type: "rsvp.set_enabled", arguments: { enabled: false } }] })],
]) {
  test(`a refusal cannot finish as ${name} after its bounded repair`, async () => {
    const stub = provider(proposal);
    await assert.rejects(interpretDesignerAiChat({ payload: payload(), client: stub.client }),
      error => error.kind === "malformed-output" && error.reason === "dress_code_refusal_unapplied");
    assert.equal(stub.requests.length, 2);
  });
}

for (const valueProvenance of ["template_value", "placeholder_or_sample", "existing_user_data"]) {
  test(`disabling preserves hidden ${valueProvenance} text even when the provider returns an empty value`, async () => {
    const stub = provider(disable(""));
    const answer = await interpretDesignerAiChat({ payload: payload({ valueProvenance }), client: stub.client });
    assert.equal(answer.repairCount, 0);
    assert.deepEqual(answer.actions, disable().actions);
    if (valueProvenance !== "existing_user_data") {
      assert.equal(JSON.stringify(stub.requests[0].input).includes(hiddenText), false);
    }
  });
}

test("disable normalization preserves an earlier explicit Dress Code text change in the same batch", () => {
  const actions = [
    { type: "event.set_dress_code", arguments: { enabled: true, value: "Casual" } },
    ...disable("").actions,
  ];
  const answer = validateDesignerAiModelResult(result({ actions }), payload().capabilitySnapshot);
  assert.deepEqual(answer.actions, [actions[0], ...disable("Casual").actions]);
  assert.equal(actions[1].arguments.value, "", "the provider proposal is not mutated");
});

test("disable normalization never repairs malformed actions", () => {
  for (const args of [{ enabled: false }, { enabled: false, value: "", extra: true }, { enabled: false, value: null }]) {
    assert.throws(() => validateDesignerAiModelResult(result({ actions: [{ type: "event.set_dress_code", arguments: args }] }),
      payload().capabilitySnapshot), error => error.kind === "malformed-output");
  }
});

for (const enabled of [true, false]) {
  test(`a correct refusal preserves text without repair when currently enabled=${enabled}`, async () => {
    const stub = provider(disable());
    const answer = await interpretDesignerAiChat({ payload: payload({ enabled }), client: stub.client });
    assert.equal(answer.repairCount, 0);
    assert.equal(stub.requests.length, 1);
    assert.deepEqual(answer.actions, disable().actions);
  });
}

for (const message of ["No sé todavía", "No, después lo vemos", "Ahora no", "¿No?", "No quiero decidirlo todavía", "No, pero sí queremos RSVP"]) {
  test(`the narrow refusal guard preserves ambiguous, postponed or mixed interpretation: ${message}`, async () => {
    const stub = provider(postpone());
    const answer = await interpretDesignerAiChat({ payload: payload({ message }), client: stub.client });
    assert.equal(answer.repairCount, 0);
    assert.deepEqual(answer.actions, []);
    assert.deepEqual(answer.resolutions, postpone().resolutions);
  });
}

for (const options of [
  { mode: "editing" },
  { entryMode: "reentry" },
  { lastMessage: null },
  { lastMessage: "¿Querés buscar el lugar en Google Maps?" },
  { lastMessage: "¿Quieren incluir Dress Code? ¿Querés que te explique cómo funciona?" },
  { nextLeafId: "rsvp.enabled" },
]) {
  test(`a bare no cannot borrow an unrelated pending Dress Code target: ${JSON.stringify(options)}`, async () => {
    const stub = provider(result());
    const answer = await interpretDesignerAiChat({ payload: payload(options), client: stub.client });
    assert.equal(answer.repairCount, 0);
    assert.deepEqual(answer.actions, []);
  });
}

test("the provider is instructed to distinguish refusing Dress Code from postponing its decision", async () => {
  const stub = provider(disable());
  await interpretDesignerAiChat({ payload: payload(), client: stub.client });
  assert.match(stub.requests[0].input[0].content, /Dress Code.*event\.set_dress_code.*enabled:false/);
  assert.match(stub.requests[0].input[0].content, /Dress Code.*deferred_by_user/);
});
