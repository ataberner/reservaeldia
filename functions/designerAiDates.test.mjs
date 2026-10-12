import test from "node:test";
import assert from "node:assert/strict";
import service from "./lib/designerAi/service.js";
import { designerAiDateCases, dateCasePayload, assertDateInterpretation } from "./testSupport/designerAiDateCases.mjs";
import { normalizeVisibleEventDateValue } from "../src/domain/eventDetails/date.js";
import { normalizeNumericEventDateValue } from "../shared/authoringValueNormalization.cjs";

test("numeric date parser covers leap centuries, short years and strict whole-message hints", () => {
  for (const [input, expected] of [["1 / 2 / 00", "2000-02-01"], ["31/12/99", "2099-12-31"],
    ["29/02/2000", "2000-02-29"], ["29/02/1900", ""], ["29/02/26", ""], ["12/24/26", ""],
    ["24/12", null], ["2026", null], ["24/12/26 o 25/12/26", null], ["24/12/26, no, el 25", null]]) {
    assert.equal(normalizeNumericEventDateValue(input, { allowTrailingText: false }), expected, input);
  }
  assert.equal(normalizeVisibleEventDateValue("24/12/26, 20:00"), "2026-12-24");
});

test("provider receives canonical calendar evidence without a new action or client field", async () => {
  for (const item of designerAiDateCases.filter(entry => !entry.recentTurns)) {
    await service.interpretDesignerAiChat({ payload: dateCasePayload(item), client: { responses: { create: async (body) => {
      const context = body.input[1].content;
      const expected = normalizeNumericEventDateValue(item.message, { allowTrailingText: false });
      if (expected === null) assert.doesNotMatch(context, /numericDateInterpretation/);
      else assert.ok(context.includes(JSON.stringify({ valid: expected !== "", dateISO: expected || null })));
      return { output: [{ type: "function_call", name: "submit_designer_ai_result", arguments: JSON.stringify({
        intent: "clarify", assistantMessage: "¿Podés aclararlo?", actions: [], controlRequest: null, resolutions: [],
      }) }] };
    } } } });
  }
});

test("date eval fixtures use the existing editor interpretation and calendar validation", () => {
  for (const item of designerAiDateCases.filter(item => !item.recentTurns && item.id !== "missing-year" && item.id !== "year-only-without-context")) {
    assert.equal(normalizeVisibleEventDateValue(item.message), item.date || "", item.id);
  }
});

test("year clarification retains the user date in bounded provider input, without another memory", async () => {
  const item = designerAiDateCases.find(entry => entry.id === "production-recovery");
  const payload = dateCasePayload(item);
  assert.equal(payload.capabilitySnapshot.ledger.leaves.find(entry => entry.id === "event.mode").status, "resolved_from_user");
  assert.equal(service.buildDesignerAiConversationBrief(payload.capabilitySnapshot).nextBlock.id, "event_data");
  const result = await service.interpretDesignerAiChat({ payload, client: { responses: { create: async (body) => {
    assert.equal(body.store, false);
    assert.equal(body.input.at(-1).content, item.message);
    assert.equal(body.input.at(-2).role, "user");
    assert.deepEqual(JSON.parse(body.input.at(-2).content.split("\n").slice(1).join("\n")), item.recentTurns);
    assert.equal(body.input.some(turn => turn.role === "assistant"), false);
    assert.match(body.input[0].content, /No pidas cuatro dígitos ni repetir una fecha válida/);
    assert.match(body.input[0].content, /día y mes que ya aportó para esa misma fecha en recentTurns/);
    return { output: [{ type: "function_call", name: "submit_designer_ai_result", arguments: JSON.stringify({
      intent: "apply", assistantMessage: "Perfecto, el evento es el 24 de diciembre de 2026. ¿A qué hora empieza?",
      actions: [{ type: "event.set_datetime", arguments: { phase: "ceremony", date: item.date, startTime: null, endTime: null } }],
      controlRequest: null, resolutions: [],
    }) }] };
  } } } });
  assertDateInterpretation(item, result);
});

const dateProposal = (date, phase = "ceremony") => ({
  intent: "apply", assistantMessage: "Seguimos.",
  actions: [{ type: "event.set_datetime", arguments: { phase, date, startTime: null, endTime: null } }],
  controlRequest: null, resolutions: [], clarification: null,
});
const dateClarification = (kind) => ({
  intent: "clarify", assistantMessage: "Necesito precisar esa fecha.", actions: [], controlRequest: null,
  resolutions: [{ leafId: "event.ceremony.date", status: "needs_clarification", rule: null }],
  clarification: { leafId: "event.ceremony.date", kind },
});
const responseFor = (result) => ({ output: [{ type: "function_call", name: "submit_designer_ai_result", arguments: JSON.stringify(result) }] });

for (const [message, wrong, corrected] of [
  ["03/04/26", dateProposal("2026-03-04"), dateProposal("2026-04-03")],
  ["03/04/26", dateClarification("missing_year"), dateProposal("2026-04-03")],
  ["29/02/28", dateClarification("invalid_date"), dateProposal("2028-02-29")],
  ["31/02/26", dateProposal("2026-03-03"), dateClarification("invalid_date")],
]) {
  test(`numeric date semantics repair ${message} without accepting a contradictory proposal`, async () => {
    let calls = 0;
    const result = await service.interpretDesignerAiChat({ payload: dateCasePayload({ id: "repair-date", message }), client: { responses: { create: async (body) => {
      calls += 1;
      if (calls === 2) assert.match(body.input.at(-1).content, /numericDateInterpretation/);
      return responseFor(calls === 1 ? wrong : corrected);
    } } } });
    assert.equal(calls, 2);
    assert.equal(result.repairCount, 1);
    assert.deepEqual(result.actions, corrected.actions);
    assert.deepEqual(result.clarification, corrected.clarification);
  });
}

test("repeated numeric date contradiction fails closed after the bounded repair", async () => {
  let calls = 0;
  await assert.rejects(service.interpretDesignerAiChat({ payload: dateCasePayload({ id: "persistent-contradiction", message: "03/04/26" }),
    client: { responses: { create: async () => { calls += 1; return responseFor(dateProposal("2026-03-04")); } } },
  }), (error) => error.kind === "malformed-output" && error.validationCode === "numeric_date_inconsistent");
  assert.equal(calls, 2);
});

test("date semantic guard preserves correct dates and does not infer mixed-message intent or target phase", async () => {
  for (const [message, proposal] of [
    ["03/04/26", dateProposal("2026-04-03")],
    ["31/02/26", dateClarification("invalid_date")],
    ["03/04/26, no, el 5 de abril", dateProposal("2026-04-05")],
    ["03/04/26", dateClarification("missing_value")],
  ]) {
    let calls = 0;
    const result = await service.interpretDesignerAiChat({ payload: dateCasePayload({ id: "preserved-date", message }),
      client: { responses: { create: async () => { calls += 1; return responseFor(proposal); } } },
    });
    assert.equal(calls, 1);
    assert.equal(result.repairCount, 0);
    assert.deepEqual(result.actions, proposal.actions);
    assert.deepEqual(result.clarification, proposal.clarification);
  }
});

test("a complete valid numeric date can clarify its phase without questioning its calendar value", async () => {
  const input = dateCasePayload({ id: "missing-phase", message: "03/04/26" });
  input.capabilitySnapshot.values.eventMode = "ceremony_party";
  input.capabilitySnapshot.availability.partyDatetime = true;
  input.capabilitySnapshot.ledger.leaves.find((leaf) => leaf.id === "event.party.date").status = "pending";
  input.capabilitySnapshot.conversation.mode = "editing";
  const proposal = dateClarification("missing_phase");
  let calls = 0;
  const result = await service.interpretDesignerAiChat({ payload: input, client: { responses: { create: async () => {
    calls += 1;
    return responseFor(proposal);
  } } } });
  assert.equal(calls, 1);
  assert.deepEqual(result.clarification, proposal.clarification);
  assert.deepEqual(result.actions, []);
});
