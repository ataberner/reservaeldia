import test from "node:test";
import assert from "node:assert/strict";
import ledger from "./designerAiConversationLedger.cjs";
import { sanitizeCapabilitySnapshot } from "./designerAiCapabilityContract.cjs";

const {
  buildDesignerAiLedger, buildDesignerAiConversationBrief, captureDesignerAiActionEvidence,
  reconcileDesignerAiConversationState, fingerprintDesignerAiValue,
} = ledger;
const dateId = "event.ceremony.date";
const defaultDate = "2027-11-14";
const fieldKey = "event_ceremony_date";
const resolution = (leafId, value, overrides = {}) => ({ leafId,
  status: "resolved_from_user", provenance: "user_current_session", rule: null,
  fingerprint: fingerprintDesignerAiValue(value), ...overrides });

function snapshot({ sourceContext = {}, conversationState = {}, values = {},
  availability = {}, fieldAvailability = {}, modeConfirmed = true } = {}) {
  const base = sanitizeCapabilitySnapshot({
    availability: { documentName: false, people: false, eventMode: true, ceremonyDatetime: true,
      partyDatetime: false, ceremonyLocation: false, partyLocation: false, dressCode: false,
      story: false, cover: false, gallery: false, rsvp: true, gifts: false, ...availability },
    values: { eventMode: "single", ceremony: { date: defaultDate, startTime: "", endTime: "" }, ...values },
  });
  const state = { ...conversationState, resolutions: [
    ...(modeConfirmed ? [resolution("event.mode", base.values.eventMode)] : []),
    ...(conversationState.resolutions || []),
  ] };
  return { ...base, documentIdentity: "draft:date-provenance", conversation: { mode: "guided" },
    ledger: buildDesignerAiLedger({ ...base, sourceContext, conversationState: state, fieldAvailability }) };
}
const dateLeaf = (current, id = dateId) => current.ledger.leaves.find((leaf) => leaf.id === id);
const nextStep = (current) => buildDesignerAiConversationBrief(current).nextStep;

test("uncredited legacy and template dates stay intact and are asked separately before start time", () => {
  for (const sourceContext of [{}, { templateDerived: false }, { templateDerived: true },
    { templateDerived: true, changedKeysAuthoritative: true, authoringFieldKeys: [fieldKey], changedKeys: [] }]) {
    const current = snapshot({ sourceContext });
    assert.equal(current.values.ceremony.date, defaultDate);
    assert.equal(dateLeaf(current).status, "pending");
    assert.deepEqual(nextStep(current), { blockId: "event_data", kind: "date", phase: "ceremony", leafIds: [dateId] });
  }
});

test("a date changed after the entry baseline needs positive evidence even on a legacy draft", () => {
  for (const provenance of ["unknown", "template_value", "existing_user_data", "user_current_session"]) {
    const conversationState = { baseline: [{ leafId: dateId,
      fingerprint: fingerprintDesignerAiValue("2026-12-24"), provenance }] };
    for (const sourceContext of [{}, { templateDerived: true }, { changedKeysAuthoritative: true, changedKeys: [] }]) {
      const current = snapshot({ conversationState, sourceContext });
      assert.equal(dateLeaf(current).status, "pending", provenance);
      assert.equal(nextStep(current).kind, "date");
    }
  }
});

test("trusted manual date edits use the actual binding and keep the date before start time after undo", () => {
  for (const key of [fieldKey, "custom_date"]) {
    const sourceContext = { templateDerived: true, changedKeysAuthoritative: true,
      authoringFieldKeys: [key], fieldKeysByLeaf: { [dateId]: key }, changedKeys: [key] };
    const current = snapshot({ sourceContext });
    assert.equal(dateLeaf(current).status, "resolved_from_existing_user_data");
    assert.equal(nextStep(current).kind, "start_time");
    const state = reconcileDesignerAiConversationState({ snapshot: current });
    const restored = snapshot({ sourceContext: { ...sourceContext, changedKeys: [] }, conversationState: state,
      values: { ceremony: { date: "2026-12-24", startTime: "", endTime: "" } } });
    assert.equal(dateLeaf(restored).status, "pending");
    assert.equal(nextStep(restored).kind, "date");
    const staleKey = snapshot({ sourceContext: { ...sourceContext, changedKeys: ["unrelated_date"] } });
    assert.equal(dateLeaf(staleKey).status, "pending");
  }
});

test("a saved date provided ahead of the guided step survives reload, including confirmation of a default", () => {
  for (const date of [defaultDate, "2028-01-15"]) {
    const before = snapshot({ modeConfirmed: false });
    assert.equal(nextStep(before).kind, "event_structure");
    const applied = snapshot({ modeConfirmed: false, values: { ceremony: { date, startTime: "", endTime: "" } } });
    const action = { type: "event.set_datetime", arguments: { phase: "ceremony", date, startTime: null, endTime: null } };
    const state = reconcileDesignerAiConversationState({ snapshot: applied, previousSnapshot: before,
      actionResults: [{ action, requested: true, executed: true, effective: true, persisted: true,
        evidence: captureDesignerAiActionEvidence(action, applied) }] });
    const restored = snapshot({ values: applied.values, conversationState: JSON.parse(JSON.stringify(state)) });
    assert.equal(dateLeaf(restored).status, "resolved_from_user");
    assert.equal(nextStep(restored).kind, "start_time");
  }
});

test("failed or stale date receipts cannot skip the date question", () => {
  const current = snapshot();
  const action = { type: "event.set_datetime", arguments: { phase: "ceremony", date: defaultDate, startTime: null, endTime: null } };
  const receipt = { action, requested: true, executed: true, effective: true, persisted: true,
    evidence: captureDesignerAiActionEvidence(action, current) };
  for (const invalid of [{ ...receipt, persisted: false }, { ...receipt, effective: false },
    { ...receipt, evidence: { ...receipt.evidence, leaves: [] } }]) {
    const state = reconcileDesignerAiConversationState({ snapshot: current, actionResults: [invalid] });
    assert.equal(nextStep(snapshot({ conversationState: state })).kind, "date");
  }
});

test("only positive durable date provenance can skip an unchanged date on reentry", () => {
  for (const provenance of ["unknown", "template_value", "system_default", "placeholder_or_sample", "existing_user_data", "user_current_session"]) {
    const trusted = ["existing_user_data", "user_current_session"].includes(provenance);
    const baseline = [{ leafId: dateId, fingerprint: fingerprintDesignerAiValue(defaultDate), provenance }];
    const fromBaseline = snapshot({ conversationState: { baseline } });
    assert.equal(nextStep(fromBaseline).kind, trusted ? "start_time" : "date");
    for (const status of ["resolved_from_user", "resolved_from_existing_user_data"]) {
      const fromResolution = snapshot({ conversationState: { resolutions: [resolution(dateId, defaultDate, { provenance, status })] } });
      assert.equal(nextStep(fromResolution).kind, trusted ? "start_time" : "date");
    }
  }
});

test("live template comparison overrides a historical default classification, without erasing explicit confirmation", () => {
  for (const key of [fieldKey, "custom_date"]) {
    const sourceContext = { templateDerived: true, changedKeysAuthoritative: true,
      authoringFieldKeys: [key], fieldKeysByLeaf: { [dateId]: key }, changedKeys: [] };
    const baseline = [{ leafId: dateId, fingerprint: fingerprintDesignerAiValue(defaultDate), provenance: "existing_user_data" }];
    for (const historical of [[], [resolution(dateId, defaultDate, { status: "resolved_from_existing_user_data", provenance: "existing_user_data" })],
      [resolution(dateId, defaultDate, { status: "resolved_by_rule", provenance: "existing_user_data", rule: "keep_existing" })]]) {
      const state = { baseline, resolutions: historical };
      const current = snapshot({ sourceContext, conversationState: state });
      assert.equal(dateLeaf(current).status, "pending");
      assert.equal(dateLeaf(current).provenance, "template_value");
      assert.equal(nextStep(current).kind, "date");
      assert.equal(current.values.ceremony.date, defaultDate);
      assert.equal(nextStep(snapshot({ conversationState: state })).kind, "start_time", "without current metadata a trusted historical value remains usable");
      const manual = snapshot({ sourceContext: { ...sourceContext, changedKeys: [key] }, conversationState: state });
      assert.equal(nextStep(manual).kind, "start_time");

      const explicit = snapshot({ sourceContext, conversationState: { baseline,
        resolutions: [resolution(dateId, defaultDate)] } });
      assert.equal(dateLeaf(explicit).status, "resolved_from_user");
      assert.equal(nextStep(explicit).kind, "start_time");
      const explicitBaseline = snapshot({ sourceContext, conversationState: { baseline: [
        { ...baseline[0], provenance: "user_current_session" },
      ] } });
      assert.equal(nextStep(explicitBaseline).kind, "start_time");
    }
  }
});

test("an explicit same-default date receipt survives the live authoring comparison on reload", () => {
  const sourceContext = { templateDerived: true, changedKeysAuthoritative: true,
    authoringFieldKeys: [fieldKey], changedKeys: [] };
  const current = snapshot({ sourceContext });
  const action = { type: "event.set_datetime", arguments: { phase: "ceremony", date: defaultDate, startTime: null, endTime: null } };
  const state = reconcileDesignerAiConversationState({ snapshot: current,
    actionResults: [{ action, requested: true, executed: true, effective: true, persisted: true,
      evidence: captureDesignerAiActionEvidence(action, current) }] });
  const restored = snapshot({ sourceContext, conversationState: JSON.parse(JSON.stringify(state)) });
  assert.equal(dateLeaf(restored).status, "resolved_from_user");
  assert.equal(dateLeaf(restored).provenance, "user_current_session");
  assert.equal(nextStep(restored).kind, "start_time");
});

test("explicit date deferral stays unresolved while an absent date binding is unavailable", () => {
  const current = snapshot();
  const state = reconcileDesignerAiConversationState({ snapshot: current,
    resolutions: [{ leafId: dateId, status: "deferred_by_user", rule: null }] });
  const deferred = snapshot({ conversationState: JSON.parse(JSON.stringify(state)) });
  assert.equal(dateLeaf(deferred).status, "deferred_by_user");
  assert.equal(nextStep(deferred).kind, "start_time");
  assert.ok(deferred.ledger.completion.unresolvedLeafIds.includes(dateId));
  const unavailable = snapshot({ fieldAvailability: { [dateId]: false } });
  assert.equal(dateLeaf(unavailable).status, "unavailable");
  assert.equal(nextStep(unavailable).kind, "start_time");
});

test("Party date follows Ceremony and its same-day rule still requires confirmed Ceremony evidence", () => {
  const values = { eventMode: "ceremony_party", party: { date: defaultDate, startTime: "", endTime: "" } };
  const availability = { partyDatetime: true };
  const initial = snapshot({ values, availability });
  assert.equal(dateLeaf(initial, "event.party.date").status, "pending");
  assert.equal(nextStep(initial).phase, "ceremony");
  const partyRule = resolution("event.party.date", defaultDate, { status: "resolved_by_rule", provenance: "automatic_rule", rule: "same_day_party" });
  const unconfirmed = snapshot({ values, availability, conversationState: { resolutions: [partyRule] } });
  assert.equal(dateLeaf(unconfirmed, "event.party.date").status, "pending");
  const confirmed = snapshot({ values, availability, conversationState: { resolutions: [resolution(dateId, defaultDate), partyRule] } });
  assert.equal(dateLeaf(confirmed, "event.party.date").status, "resolved_by_rule");
  assert.equal(nextStep(confirmed).kind, "start_time");
  const ceremonyComplete = snapshot({ values, availability, conversationState: { resolutions: [resolution(dateId, defaultDate)] },
    fieldAvailability: { "event.ceremony.start_time": false } });
  assert.equal(nextStep(ceremonyComplete).leafIds[0], "event.party.date");
  assert.equal(dateLeaf(snapshot(), "event.party.date").status, "unavailable");
});
