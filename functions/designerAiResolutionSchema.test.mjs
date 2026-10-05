import test from "node:test";
import assert from "node:assert/strict";
import Ajv from "ajv";
import contract from "../shared/designerAiCapabilityContract.cjs";
import service from "./lib/designerAi/service.js";
import ledger from "../shared/designerAiConversationLedger.cjs";

const leaf = (id, status = "pending") => ({ id, status, provenance: "unknown", fingerprint: `fp-${id}` });
const phaseIds = ["date", "start_time", "end_time", "venue_name", "address"];
const snapshot = contract.sanitizeCapabilitySnapshot({
  revision: "synthetic-olo-fiesta",
  availability: { eventMode: true, ceremonyDatetime: true, partyDatetime: true, ceremonyLocation: true, partyLocation: true },
  values: { eventMode: "single" },
  ledger: { leaves: [leaf("event.mode"), ...["ceremony", "party"].flatMap(phase => phaseIds.map(field => leaf(`event.${phase}.${field}`)))] },
});
const valid = {
  intent: "apply", assistantMessage: "Perfecto, un único evento. ¿Qué día es la fiesta?",
  actions: [{ type: "event.set_mode", arguments: { mode: "single" } }],
  controlRequest: null, resolutions: [],
};
// The production log records five incompatible pairs, not their field/rule
// values. This fixture reproduces that failure class; it is not a stored output.
const invalid = { ...valid, resolutions: [...valid.resolutions, ...phaseIds.map(field => ({
  leafId: `event.party.${field}`, status: "resolved_by_rule", rule: "preserve_while_inactive",
}))] };
const compile = (schema) => new Ajv({ allErrors: true }).compile(schema);
const providerResponse = (result) => ({ output: [{ type: "function_call", name: "submit_designer_ai_result", arguments: JSON.stringify(result) }] });

test("production failure class: generic schema permits five invalid pairs; request schema forbids them", () => {
  assert.equal(compile(contract.DESIGNER_AI_TOOL.parameters)(invalid), true);
  const tool = contract.buildDesignerAiTool(snapshot);
  const validate = compile(tool.parameters);
  assert.equal(validate(invalid), false);
  assert.equal(validate(valid), true);
  assert.equal(tool.name, contract.DESIGNER_AI_TOOL.name);
  assert.equal(tool.strict, true);
  assert.throws(() => service.validateDesignerAiModelResult(invalid, snapshot), /regla no corresponde/);
});

for (const repaired of [true, false]) {
  test(`olo fiesta: constrained tool is sent on both attempts; semantic repair ${repaired ? "succeeds" : "still rejects"}`, async () => {
    const requests = [];
    const run = service.interpretDesignerAiChat({
      payload: { contractVersion: contract.DESIGNER_AI_CONTRACT_VERSION, clientMessageId: "incident-regression", entryMode: "continuation", message: "olo fiesta",
        recentTurns: [{ role: "assistant", content: "¿Van a tener solo un evento o habrá ceremonia y fiesta por separado?" }], capabilitySnapshot: snapshot },
      client: { responses: { create: async body => { requests.push(body); return providerResponse(requests.length === 2 && repaired ? valid : invalid); } } },
    });
    if (repaired) {
      const result = await run;
      assert.equal(result.repairCount, 1);
      assert.deepEqual(result.actions, valid.actions);
      assert.deepEqual(result.resolutions, valid.resolutions);
    } else await assert.rejects(run, error => error.kind === "malformed-output");
    assert.equal(requests.length, 2);
    for (const request of requests) {
      assert.equal(request.tools.length, 1);
      assert.equal(compile(request.tools[0].parameters)(invalid), false);
      assert.equal(compile(request.tools[0].parameters)(valid), true);
      assert.equal(request.store, false);
    }
    assert.match(requests[1].input.at(-1).content, /event\.party\.date; regla: preserve_while_inactive/);
  });
}

test("request schema keeps compatible rules and rejects wrong status, unknown/unavailable leaves and gallery completion", () => {
  const ids = ["document.name", "event.ceremony.end_time", "event.ceremony.venue_name", "event.party.date", "rsvp.question.attendance.label", "rsvp.modal.title", "gifts.intro_text", "gifts.method.alias.value", "story.text", "media.gallery.gallery-1.order", "media.gallery.gallery-1.guided_completion"];
  const initial = { ledger: { leaves: [...ids.map(id => leaf(id)), leaf("media.cover", "unavailable")], guidedFlow: { leafIds: ["media.gallery.gallery-1.guided_completion"] } } };
  const original = JSON.stringify([initial, contract.DESIGNER_AI_TOOL]);
  const validate = compile(contract.buildDesignerAiTool(initial).parameters);
  const rules = ["automatic_event_name", "optional_end_time_omitted", "optional_venue_name_omitted", "same_day_party", "catalog_defaults", "system_default", "preserve_while_inactive", "keep_existing", "leave_empty", "recommended_order"];
  for (const id of ids.filter(id => !id.endsWith("guided_completion"))) for (const rule of rules) {
    const resolution = { leafId: id, status: "resolved_by_rule", rule };
    const errors = contract.validateDesignerAiResolutionUpdates([resolution], initial).errors;
    assert.equal(validate({ ...valid, resolutions: [resolution] }), !errors.some(error => /regla no corresponde/.test(error)), `${id}/${rule}`);
  }
  for (const resolution of [
    { leafId: "unknown.leaf", status: "needs_clarification", rule: null },
    { leafId: "media.cover", status: "requires_control", rule: null },
    { leafId: "story.text", status: "needs_clarification", rule: "leave_empty" },
    { leafId: "story.text", status: "resolved_by_rule", rule: null },
    { leafId: "media.gallery.gallery-1.guided_completion", status: "resolved_from_user", rule: null },
  ]) assert.equal(validate({ ...valid, resolutions: [resolution] }), false);
  for (const status of ["requires_control", "deferred_by_user"]) assert.equal(validate({ ...valid, resolutions: [{ leafId: "media.gallery.gallery-1.guided_completion", status, rule: null }] }), true);
  assert.equal(JSON.stringify([initial, contract.DESIGNER_AI_TOOL]), original);
});

test("empty availability and maximum ledger produce valid bounded schemas", () => {
  const empty = compile(contract.buildDesignerAiTool({ ledger: { leaves: [leaf("event.mode", "unavailable")] } }).parameters);
  assert.equal(empty({ ...valid, resolutions: [] }), true);
  assert.equal(empty({ ...valid, resolutions: [{ leafId: "event.mode", status: "needs_clarification", rule: null }] }), false);
  const leaves = Array.from({ length: 700 }, (_, index) => leaf(`media.gallery.gallery-${Math.floor(index / 24)}.slot.${index}`));
  const schema = contract.buildDesignerAiTool({ ledger: { leaves } }).parameters;
  const validate = compile(schema);
  assert.equal(validate({ ...valid, resolutions: [{ leafId: leaves[699].id, status: "resolved_by_rule", rule: "leave_empty" }] }), true);
  let enumCount = 0;
  const visit = value => { if (!value || typeof value !== "object") return; if (Array.isArray(value.enum)) enumCount += value.enum.length; for (const child of Object.values(value)) visit(child); };
  visit(schema);
  assert(enumCount <= 1000);
  assert(Object.values(schema.$defs).every(definition => definition.enum.length <= 200));
});

test("diagnostics name known schema fields, never reflect arbitrary invalid output", () => {
  const errors = contract.validateDesignerAiResolutionUpdates([{ leafId: "SECRET_ALIAS_TEST_93841", status: "resolved_by_rule", rule: "automatic_event_name" }], snapshot).errors.join(" ");
  assert.equal(errors.includes("SECRET_ALIAS_TEST_93841"), false);
  assert.match(contract.validateDesignerAiResolutionUpdates(invalid.resolutions, snapshot).errors.join(" "), /event\.party\.date; regla: preserve_while_inactive/);
});

test("repair describes known action phases and leaves without echoing rejected values or identifiers", async () => {
  const secret = "PRIVATE_VALUE_NOT_FOR_REPAIR";
  const requests = [];
  const rejected = { ...valid, assistantMessage: secret, actions: [
    { type: "event.set_datetime", arguments: { phase: "party", date: secret, startTime: null, endTime: null } },
    { type: secret, arguments: { phase: secret, value: secret } },
  ], resolutions: [{ leafId: secret, status: secret, rule: secret }] };
  const result = await service.interpretDesignerAiChat({
    payload: { contractVersion: contract.DESIGNER_AI_CONTRACT_VERSION, clientMessageId: "repair-minimization", entryMode: "continuation",
      message: "Solo fiesta a las 20", recentTurns: [], capabilitySnapshot: snapshot },
    client: { responses: { create: async body => { requests.push(body); return providerResponse(requests.length === 1 ? rejected : valid); } } },
  });
  assert.equal(result.repairCount, 1);
  const context = requests[1].input.at(-1).content;
  assert.match(context, /"phase":"party"/);
  assert.match(context, /event\.party\.date/);
  assert.match(context, /"type":"unknown"/);
  assert.equal(context.includes(secret), false);
});

test("second production incident: model cannot claim user evidence for any leaf", () => {
  const ids = ["event.mode", ...["party", "ceremony"].flatMap(phase => [...phaseIds, "place_selection"].map(field => `event.${phase}.${field}`))];
  const current = { ...snapshot, ledger: { leaves: ids.map(id => leaf(id)) } };
  const claims = ids.map(leafId => ({ leafId, status: "resolved_from_user", rule: null }));
  const validate = compile(contract.buildDesignerAiTool(current).parameters);
  for (const claim of claims) assert.equal(validate({ ...valid, resolutions: [claim] }), false, claim.leafId);
  assert.equal(validate(valid), true);
  assert.throws(() => service.validateDesignerAiModelResult({ ...valid, resolutions: claims }, current), /no tiene una action ejecutable/);
  // Legacy well-backed results remain compatible; evidence checks are not relaxed.
  assert.doesNotThrow(() => service.validateDesignerAiModelResult({ ...valid, resolutions: [claims[0]] }, current));
});

test("provider can only defer leaves eligible under the same snapshot validator", () => {
  const initial = { ledger: { leaves: [leaf("event.ceremony.date"), leaf("event.party.date"), leaf("event.ceremony.address", "resolved_from_user")],
    guidedFlow: { leafIds: ["event.ceremony.date", "event.ceremony.address"] } } };
  const validate = compile(contract.buildDesignerAiTool(initial).parameters);
  for (const { id } of initial.ledger.leaves) {
    const resolutions = [{ leafId: id, status: "deferred_by_user", rule: null }];
    assert.equal(validate({ ...valid, resolutions }), contract.validateDesignerAiResolutionUpdates(resolutions, initial).ok, id);
  }
});

for (const persisted of [true, false]) {
  test(`single action without model resolutions derives only actual receipt evidence (persisted=${persisted})`, () => {
    const values = { ...snapshot.values, eventMode: "single" };
    const current = { ...snapshot, values, documentIdentity: "synthetic-draft",
      ledger: ledger.buildDesignerAiLedger({ availability: snapshot.availability, values, sourceContext: { templateDerived: true } }) };
    const action = valid.actions[0];
    const conversation = ledger.reconcileDesignerAiConversationState({ snapshot: current, previousState: {}, resolutions: [], actionResults: [{
      action, executed: true, effective: true, persisted, evidence: ledger.captureDesignerAiActionEvidence(action, current),
    }] });
    const after = ledger.buildDesignerAiLedger({ availability: snapshot.availability, values, conversationState: conversation, sourceContext: { templateDerived: true } });
    const byId = new Map(after.leaves.map(item => [item.id, item]));
    assert.equal(byId.get("event.mode").status, persisted ? "resolved_from_user" : "needs_clarification");
    for (const field of [...phaseIds, "place_selection"]) {
      assert.equal(byId.get(`event.ceremony.${field}`).status, "pending");
      assert.equal(byId.get(`event.party.${field}`).status, persisted ? "not_applicable_by_dependency" : "pending");
    }
    assert.equal(conversation.resolutions.some(r => r.leafId !== "event.mode" && r.status === "resolved_from_user"), false);
  });
}
