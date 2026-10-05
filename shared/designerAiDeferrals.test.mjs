import test from "node:test";
import assert from "node:assert/strict";
import ledger from "./designerAiConversationLedger.cjs";
import contract from "./designerAiCapabilityContract.cjs";

const values = contract.sanitizeCapabilitySnapshot({ values: { eventMode: "single", people: { primaryName: "Ana", secondaryName: "Luz" }, ceremony: { date: "2026-12-24", startTime: "20:00", endTime: "", venueName: "", address: "", placeSelected: false }, dressCode: { enabled: false, value: "" }, rsvp: { enabled: false, questions: [] }, gifts: { enabled: false, methods: {} } } }).values;
const availability = { people: true, eventMode: true, ceremonyDatetime: true, ceremonyLocation: true, partyDatetime: false, partyLocation: false, rsvp: true, gifts: true, dressCode: true, cover: false, story: false, documentName: false };
const locationIds = ["venue_name", "address", "place_selection"].map((field) => `event.ceremony.${field}`);
const deferred = (leafId) => ({ leafId, status: "deferred_by_user", rule: null });
function snapshot(state = {}, nextValues = values) {
  return { values: nextValues, availability, conversation: { mode: "guided" }, ledger: ledger.buildDesignerAiLedger({ values: nextValues, availability, conversationState: state, sourceContext: { changedKeys: ["event_primary_person_name", "event_secondary_person_name"] } }) };
}

test("a postponed location stays unresolved while Dress Code, RSVP and Gifts advance deterministically", () => {
  const initial = snapshot();
  const resolved = initial.ledger.leaves.filter((leaf) => ["event.mode", "event.dress_code.enabled", "rsvp.enabled", "gifts.enabled"].includes(leaf.id)).map((leaf) => ({ ...leaf, leafId: leaf.id, status: "resolved_from_user", provenance: "user_current_session" }));
  resolved.push({ leafId: "event.ceremony.end_time", status: "resolved_by_rule", provenance: "automatic_rule", rule: "optional_end_time_omitted", fingerprint: initial.ledger.leaves.find((l) => l.id === "event.ceremony.end_time").fingerprint });
  const before = snapshot({ resolutions: resolved.filter((l) => !["event.dress_code.enabled", "rsvp.enabled", "gifts.enabled"].includes(l.leafId)) });
  assert.equal(ledger.buildDesignerAiConversationBrief(before).nextBlock.id, "event_data");
  assert.equal(contract.validateDesignerAiResolutionUpdates(locationIds.map(deferred), before).ok, true);
  const state = ledger.reconcileDesignerAiConversationState({ previousState: { resolutions: resolved }, snapshot: before, resolutions: locationIds.map(deferred) });
  const after = snapshot(state);
  assert.equal(after.ledger.completion.complete, false);
  assert.equal(after.ledger.guidedFlow.completion.complete, true);
  assert.deepEqual(after.ledger.guidedFlow.completion.deferredLeafIds, locationIds);
  assert.equal(after.ledger.leaves.filter((leaf) => locationIds.includes(leaf.id)).every((leaf) => !ledger.isTerminalDesignerAiLedgerStatus(leaf.status)), true);
  assert.equal(ledger.buildDesignerAiConversationBrief(after).nextBlock, null);
  for (const [unresolved, nextBlock] of [["event.dress_code.enabled", "dress_code"], ["rsvp.enabled", "rsvp"], ["gifts.enabled", "gifts"]]) {
    const stateWithPending = { ...state, resolutions: state.resolutions.filter((leaf) => leaf.leafId !== unresolved) };
    assert.equal(ledger.buildDesignerAiConversationBrief(snapshot(stateWithPending)).nextBlock.id, nextBlock);
  }
  assert.deepEqual(contract.sanitizeCapabilitySnapshot(after).ledger.guidedFlow.completion, after.ledger.guidedFlow.completion);
  assert.deepEqual(snapshot(JSON.parse(JSON.stringify(state))).ledger, after.ledger);
  const changed = snapshot(state, { ...values, ceremony: { ...values.ceremony, address: "Nueva dirección 123" } });
  assert.notEqual(changed.ledger.leaves.find((l) => l.id === "event.ceremony.address").status, "deferred_by_user");
});

test("deferral cannot credit completion, hide terminal/unavailable/reactive leaves or override a mutation", () => {
  const current = snapshot();
  for (const id of ["event.people.primary_name", "event.party.address", "story.text", "rsvp.modal.title", "unknown"]) {
    assert.equal(contract.validateDesignerAiResolutionUpdates([deferred(id)], current).ok, false, id);
  }
  assert.equal(contract.validateDesignerAiResolutionUpdates([{ ...deferred("event.ceremony.address"), rule: "leave_empty" }], current).ok, false);
  assert.equal(contract.validateDesignerAiResolutionUpdates([deferred("event.ceremony.address")], current, { actions: [{ type: "event.set_location_text", arguments: { phase: "ceremony", venueName: "", address: "Calle 123" } }] }).ok, false);
  assert.equal(ledger.isTerminalDesignerAiLedgerStatus("deferred_by_user"), false);
});
