import test from "node:test";
import assert from "node:assert/strict";
import contract from "../shared/designerAiCapabilityContract.cjs";
import service from "./lib/designerAi/service.js";

const { interpretDesignerAiChat, buildDesignerAiConversationBrief, validateDesignerAiModelResult } = service;
const dressLeafId = "event.dress_code.enabled";
const question = "Listo, actualizado. ¿Quieren incluir Dress Code? Si es así, ¿cuál?";
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

const textLeafId = "event.dress_code.value";
const textResolution = { leafId: textLeafId, status: "needs_clarification", rule: null };
const textClarification = { leafId: textLeafId, kind: "missing_value" };
const requestText = (withResolution = true) => ({ ...result(),
  resolutions: withResolution ? [textResolution] : [], clarification: textClarification, notice: null,
});

for (const enabled of [true, false]) {
  for (const valueProvenance of ["template_value", "placeholder_or_sample", "existing_user_data"]) {
    test(`yes without text keeps Dress Code unchanged: enabled=${enabled}, ${valueProvenance}`, async () => {
      const input = payload({ message: "Sí", enabled, valueProvenance });
      const before = structuredClone(input.capabilitySnapshot);
      const stub = provider(requestText());
      const answer = await interpretDesignerAiChat({ payload: input, client: stub.client });
      assert.equal(stub.requests.length, 1);
      assert.equal(answer.repairCount, 0);
      assert.equal(answer.intent, "clarify");
      assert.deepEqual(answer.actions, []);
      assert.deepEqual(answer.resolutions, [textResolution]);
      assert.deepEqual(answer.clarification, textClarification);
      assert.deepEqual(input.capabilitySnapshot, before);
      assert.match(stub.requests[0].input[0].content, /sí sin aportar texto real, no emitas event\.set_dress_code/);
      assert.match(stub.requests[0].input[0].content, /event\.dress_code\.value.*needs_clarification.*missing_value/);
    });
  }
}

for (const message of ["Sí, Cóctel", "Cóctel", "Formal"]) test(`Dress Code text is applied directly without another choice: ${message}`, async () => {
  const value = message === "Formal" ? "Formal" : "Cóctel";
  const actions = [{ type: "event.set_dress_code", arguments: { enabled: true, value } }];
  const stub = provider(result({ actions, intent: "apply" }));
  const answer = await interpretDesignerAiChat({ payload: payload({ message }), client: stub.client });
  assert.equal(answer.repairCount, 0);
  assert.deepEqual(answer.actions, actions);
  assert.deepEqual(answer.resolutions, []);
});

test("a pending Dress Code text clarification completes only its missing nonterminal resolution", async () => {
  const proposal = requestText(false);
  const original = structuredClone(proposal);
  const stub = provider(proposal);
  const answer = await interpretDesignerAiChat({ payload: payload({ message: "Si" }), client: stub.client });
  assert.equal(stub.requests.length, 1);
  assert.equal(answer.repairCount, 0);
  assert.deepEqual(answer.actions, []);
  assert.deepEqual(answer.resolutions, [textResolution]);
  assert.deepEqual(answer.clarification, textClarification);
  assert.deepEqual(proposal, original, "normalization must not mutate the provider proposal");
});

test("the missing pair normalization also works while already asking for Dress Code text", () => {
  const current = payload().capabilitySnapshot;
  Object.assign(current.ledger.leaves[0], { status: "resolved_from_user", provenance: "user_current_session" });
  current.ledger.guidedFlow.leafIds.push(textLeafId);
  assert.equal(buildDesignerAiConversationBrief(current).nextStep.kind, "dress_code_value");
  assert.deepEqual(validateDesignerAiModelResult(requestText(false), current).resolutions, [textResolution]);
});

for (const [name, change] of [
  ["editing", (input) => { input.conversation.mode = "editing"; }],
  ["unavailable binding", (input) => { input.availability.dressCode = false; }],
  ["unavailable leaf", (input) => { input.ledger.leaves[1].status = "unavailable"; }],
  ["unknown leaf", (input) => { input.ledger.leaves.pop(); }],
  ["terminal leaf", (input) => { input.ledger.leaves[1].status = "resolved_from_user"; }],
  ["control verified leaf", (input) => { input.ledger.leaves[1].status = "resolved_by_control"; }],
  ["deferred leaf", (input) => { input.ledger.leaves[1].status = "deferred_by_user"; }],
  ["inactive leaf", (input) => { input.ledger.leaves[1].status = "not_applicable_by_dependency"; }],
  ["another next step", (input) => { input.ledger.leaves[0].id = "rsvp.enabled"; input.ledger.leaves[0].block = "rsvp"; input.ledger.guidedFlow.leafIds = ["rsvp.enabled"]; }],
]) {
  test(`missing Dress Code resolution is not synthesized for ${name}`, () => {
    const current = payload().capabilitySnapshot;
    change(current);
    assert.throws(() => validateDesignerAiModelResult(requestText(false), current), error =>
      error.kind === "malformed-output" && error.validationCode === "clarification_invalid");
  });
}

for (const [name, overrides] of [
  ["apply intent", { intent: "apply" }],
  ["out of scope", { intent: "out_of_scope" }],
  ["unrelated action", { actions: [{ type: "rsvp.set_enabled", arguments: { enabled: false } }] }],
  ["Dress Code action", { actions: [{ type: "event.set_dress_code", arguments: { enabled: true, value: "Cóctel" } }] }],
  ["local control", { controlRequest: { type: "cover_upload", target: {} } }],
  ["conflicting deferral", { resolutions: [{ ...textResolution, status: "deferred_by_user" }] }],
  ["conflicting terminal status", { resolutions: [{ ...textResolution, status: "resolved_from_user" }] }],
  ["conflicting rule", { resolutions: [{ ...textResolution, rule: "keep_existing" }] }],
  ["unrelated clarification", { clarification: { leafId: dressLeafId, kind: "missing_value" } }],
  ["wrong kind", { clarification: { ...textClarification, kind: "missing_year" } }],
  ["extra clarification property", { clarification: { ...textClarification, text: "PRIVATE_INPUT" } }],
]) {
  test(`missing pair normalization does not relax ${name}`, () => {
    assert.throws(() => validateDesignerAiModelResult({ ...requestText(false), ...overrides }, payload().capabilitySnapshot), error =>
      error.kind === "malformed-output" && error.validationCode === "clarification_invalid");
  });
}

test("completing the text clarification does not bypass unrelated malformed resolutions", () => {
  assert.throws(() => validateDesignerAiModelResult({ ...requestText(false), resolutions: [
    { leafId: "PRIVATE_UNKNOWN_LEAF", status: "needs_clarification", rule: null },
  ] }, payload().capabilitySnapshot), error => error.kind === "malformed-output" && error.validationCode === "resolution_invalid");
});

for (const value of ["", "   ", "Sí", "Elegante sport"]) {
  test(`a bare affirmative becomes a safe value question despite the model text: ${JSON.stringify(value)}`, async () => {
    const input = payload({ message: "Sí" });
    const invalid = result({ intent: "apply", actions: [{ type: "event.set_dress_code", arguments: { enabled: true, value } }] });
    const stub = provider(invalid, requestText());
    const answer = await interpretDesignerAiChat({ payload: input, client: stub.client });
    assert.equal(stub.requests.length, 1);
    assert.equal(answer.repairCount, 0);
    assert.deepEqual(answer.actions, []);
    assert.deepEqual(answer.resolutions, [textResolution]);
    assert.equal(input.capabilitySnapshot.values.dressCode.value, hiddenText);
    assert.equal(JSON.stringify(stub.requests[0].input).includes(hiddenText), false);
  });
}

test("destructive enabling proposals outside the bare affirmative guard still fail closed", async () => {
  const stub = provider(result({ intent: "apply", actions: [{ type: "event.set_dress_code", arguments: { enabled: true, value: "" } }] }));
  await assert.rejects(interpretDesignerAiChat({ payload: payload({ message: "Formal" }), client: stub.client }), error => {
    assert.equal(error.kind, "malformed-output");
    assert.equal(error.validationCode, "action_invalid");
    assert.equal(error.telemetry.providerAttempts, 2);
    return true;
  });
  assert.equal(stub.requests.length, 2);
});

for (const options of [{ message: "Sí, queremos RSVP" }, { message: "Sí", mode: "editing" },
  { message: "Sí", nextLeafId: "rsvp.enabled" }, { message: "Sí", lastMessage: "¿Quieren que los invitados confirmen asistencia?" }]) {
  test(`bare affirmative normalization preserves unrelated or mixed requests: ${JSON.stringify(options)}`, async () => {
    const proposal = result();
    const stub = provider(proposal);
    const answer = await interpretDesignerAiChat({ payload: payload(options), client: stub.client });
    assert.deepEqual(answer.actions, []);
    assert.deepEqual(answer.resolutions, []);
    assert.equal(answer.clarification, undefined);
  });
}

test("a refusal to the previous single Dress Code question remains compatible", async () => {
  const stub = provider(postpone(), disable());
  const answer = await interpretDesignerAiChat({ payload: payload({ lastMessage: "¿Quieren incluir Dress Code?" }), client: stub.client });
  assert.equal(answer.repairCount, 1);
  assert.deepEqual(answer.actions, disable().actions);
});
