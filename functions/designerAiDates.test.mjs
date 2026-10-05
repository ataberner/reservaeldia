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
    assert.deepEqual(body.input.slice(-4), [...item.recentTurns, { role: "user", content: item.message }].slice(-4));
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
