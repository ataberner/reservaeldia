import test from "node:test";
import assert from "node:assert/strict";
import { createDesignerAiTurnTiming, DESIGNER_AI_TIMING_EVENT } from "./designerAiTiming.js";

test("turn timing separates waits and visible response, publishes once with no content", () => {
  let now = 0;
  const events = [];
  const target = { CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } }, dispatchEvent: e => events.push(e) };
  const timing = createDesignerAiTurnTiming(() => now);
  const contextDone = timing.startStage("contextMs");
  now = 4; contextDone(); contextDone();
  now = 7; timing.markFeedback();
  const modelDone = timing.startStage("callableMs");
  now = 1007; modelDone();
  const actionsDone = timing.startStage("actionsAndPersistenceMs");
  now = 1027; actionsDone();
  const metadataDone = timing.startStage("metadataMs");
  now = 1037; metadataDone(); timing.complete("success");
  now = 1040; timing.publish(target); timing.publish(target);
  assert.deepEqual(events.map(e => ({ type: e.type, detail: e.detail })), [{ type: DESIGNER_AI_TIMING_EVENT, detail: {
    contextMs: 4, callableMs: 1000, actionsAndPersistenceMs: 20, metadataMs: 10,
    firstFeedbackMs: 7, responseReadyMs: 1037, responseVisibleMs: 1040, outcome: "success",
  } }]);
});
