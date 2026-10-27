import test from "node:test";
import assert from "node:assert/strict";
import contract from "./profileDesignAssistance.cjs";

test("assistance is optional and older payloads preserve the existing preference", () => {
  assert.deepEqual(contract.validateDesignAssistance(undefined), { value: undefined, error: null });
  assert.deepEqual(contract.readDesignAssistance(undefined), { requested: false, whatsapp: null });
  assert.deepEqual(contract.validateDesignAssistance({ requested: false, whatsapp: "+5491112345678" }).value,
    { requested: false, whatsapp: null });
});
test("requesting help without WhatsApp is valid", () => {
  for (const whatsapp of [undefined, null, "", "   "]) {
    assert.deepEqual(contract.validateDesignAssistance({ requested: true, whatsapp }).value,
      { requested: true, whatsapp: null });
  }
});
test("international numbers normalize without guessing a country or dropping digits", () => {
  for (const [input, expected] of [
    [" +54 9 (11) 1234-5678 ", "+5491112345678"],
    ["+598 99 123 456", "+59899123456"],
    ["+34 612 345 678", "+34612345678"],
  ]) assert.deepEqual(contract.validateDesignAssistance({ requested: true, whatsapp: input }).value,
    { requested: true, whatsapp: expected });
});
test("malformed input and unsafe contact URLs cannot be accepted", () => {
  for (const input of [null, [], true, {}, { requested: "true" }, { requested: 1 }]) {
    assert.ok(contract.validateDesignAssistance(input).error);
  }
  for (const whatsapp of [42, {}, [], "11 1234 5678", "+0123456789", "+1", "+1234567890123456",
    "javascript:alert(1)", "+54911x12345678", " ".repeat(41)]) {
    assert.ok(contract.validateDesignAssistance({ requested: true, whatsapp }).error);
  }
  assert.deepEqual(contract.readDesignAssistance({ requested: true, whatsapp: "javascript:bad" }),
    { requested: false, whatsapp: null });
});
