import test from "node:test";
import assert from "node:assert/strict";
import { isDesignerAiActionEffective } from "./designerAiActionEvidence.js";
import rsvpConfig from "../../../shared/rsvpConfig.cjs";
import reducers from "../../../shared/designerAiConfigReducers.cjs";

test("an RSVP activation rejected by normalization never proves the requested effect", () => {
  const before = rsvpConfig.createDefaultRsvpConfig("wedding_complete");
  const action = { type: "rsvp.set_question_active", arguments: { questionId: "custom_1", active: true } };
  const rejected = reducers.applyRsvpAction(before, action);
  assert.equal(rejected.questions.find(question => question.id === "custom_1").active, false);
  assert.equal(isDesignerAiActionEffective(action, { values: {} }, { rsvp: rejected }, { rsvp: rejected }), false);
  const freeSlot = reducers.applyRsvpAction(before, { type: action.type,
    arguments: { questionId: before.questions.find(question => question.active && !question.locked).id, active: false } });
  const accepted = reducers.applyRsvpAction(freeSlot, action);
  assert.equal(accepted.questions.find(question => question.id === "custom_1").active, true);
  assert.equal(isDesignerAiActionEffective(action, { values: {} }, { rsvp: accepted }, { rsvp: accepted }), true);
});
