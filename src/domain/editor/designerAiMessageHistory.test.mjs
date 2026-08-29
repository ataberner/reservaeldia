import test from "node:test";
import assert from "node:assert/strict";
import {
  DESIGNER_AI_CALLABLE_RECENT_TURN_LIMIT,
  DESIGNER_AI_IN_MEMORY_MESSAGE_LIMIT,
  appendDesignerAiMessageHistory,
  normalizeDesignerAiMessageHistory,
  selectDesignerAiRecentTurns,
} from "./designerAiMessageHistory.js";

function buildMessages(count) {
  return Array.from({ length: count }, (_, index) => ({
    id: `message-${index + 1}`,
    role: index % 2 === 0 ? "user" : "assistant",
    content: `Mensaje ${index + 1}`,
  }));
}

test("retains only the newest 30 in-memory messages", () => {
  const history = normalizeDesignerAiMessageHistory(buildMessages(32));

  assert.equal(history.length, DESIGNER_AI_IN_MEMORY_MESSAGE_LIMIT);
  assert.equal(history[0].id, "message-3");
  assert.equal(history.at(-1).id, "message-32");
});

test("appends valid messages and safely rejects invalid history input", () => {
  const appended = appendDesignerAiMessageHistory(
    null,
    { id: "empty", role: "user", content: "" },
    { id: "valid", role: "assistant", content: "Disponible" }
  );

  assert.deepEqual(appended.map((message) => message.id), ["valid"]);
  assert.deepEqual(normalizeDesignerAiMessageHistory(undefined), []);
});

test("sends only the newest six visible turns to the callable", () => {
  const turns = selectDesignerAiRecentTurns(buildMessages(30));

  assert.equal(turns.length, DESIGNER_AI_CALLABLE_RECENT_TURN_LIMIT);
  assert.deepEqual(turns[0], { role: "user", content: "Mensaje 25" });
  assert.deepEqual(turns.at(-1), { role: "assistant", content: "Mensaje 30" });
  assert.equal(Object.hasOwn(turns[0], "id"), false);
});
