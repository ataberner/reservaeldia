import test from "node:test";
import assert from "node:assert/strict";
import ledger from "./designerAiConversationLedger.cjs";
import { sanitizeCapabilitySnapshot, validateDesignerAiResolutionUpdates } from "./designerAiCapabilityContract.js";

function snapshot(id, provenance = "existing_user_data", override = {}) {
  const values = {
    documentName: "Casamiento Ana y Luz", people: { primaryName: "Ana", secondaryName: "Luz" }, eventMode: "ceremony_party",
    ceremony: { date: "2027-05-10", endTime: "", venueName: "", address: "Calle 1", placeSelected: false },
    party: { date: "2027-05-10", endTime: "", venueName: "", address: "Calle 2", placeSelected: false },
    story: "", gifts: { enabled: false, buttonText: "Ver regalos", methods: {} },
    rsvp: { enabled: false, questions: [{ id: "a", active: true, label: "Nombre", type: "short_text", options: [] }, { id: "b", active: false, label: "Otro", options: [] }] },
    ...override,
  };
  return { values, conversation: { namePolicy: { mode: "automatic" } }, ledger: { leaves: [
    { id, status: "pending", provenance },
    ...(id !== "event.ceremony.date" ? [{ id: "event.ceremony.date", status: "resolved_from_user", provenance: "user_current_session" }] : []),
  ] } };
}
const resolution = (leafId, rule) => ({ leafId, status: "resolved_by_rule", rule });

for (const provenance of ["user_current_session", "existing_user_data", "template_value", "placeholder_or_sample", "unknown", "automatic_rule", "system_default"]) {
  test(`keep_existing requires real user data: ${provenance}`, () => {
    const id = "event.people.primary_name";
    const valid = ["user_current_session", "existing_user_data"].includes(provenance);
    assert.equal(validateDesignerAiResolutionUpdates([resolution(id, "keep_existing")], snapshot(id, provenance)).ok, valid);
    for (const primaryName of ["", "Nombre de la novia"]) {
      assert.equal(validateDesignerAiResolutionUpdates([resolution(id, "keep_existing")], snapshot(id, provenance, { people: { primaryName } })).ok, false);
    }
  });
}

for (const [rule, id, provenance, invalidValues] of [
  ["optional_end_time_omitted", "event.ceremony.end_time", "unknown", { ceremony: { endTime: "18:00" } }],
  ["optional_venue_name_omitted", "event.ceremony.venue_name", "unknown", { ceremony: { venueName: "Salón" } }],
  ["leave_empty", "story.text", "unknown", { story: "Una historia" }],
  ["preserve_while_inactive", "gifts.button_text", "template_value", { gifts: { enabled: true, buttonText: "Ver regalos" } }],
  ["system_default", "gifts.button_text", "system_default", { gifts: { enabled: false, buttonText: "Texto propio" } }],
  ["catalog_defaults", "rsvp.question.a.active", "system_default", { rsvp: { questions: [] } }],
  ["recommended_order", "rsvp.questions.order", "existing_user_data", { rsvp: { questions: [] } }],
  ["same_day_party", "event.party.date", "template_value", { party: { date: "2027-05-11" } }],
  ["automatic_event_name", "document.name", "automatic_rule", { documentName: "Otro nombre" }],
]) {
  test(`${rule}: valid semantic state, incompatible leaf, and invalid semantic state`, () => {
    assert.equal(validateDesignerAiResolutionUpdates([resolution(id, rule)], snapshot(id, provenance)).ok, true);
    assert.equal(validateDesignerAiResolutionUpdates([resolution(id, rule)], snapshot(id, provenance, invalidValues)).ok, false);
    assert.equal(validateDesignerAiResolutionUpdates([resolution("event.people.primary_name", rule)], snapshot("event.people.primary_name", provenance)).ok, false);
  });
}

test("omissions use the effective batch, not a stale empty snapshot", () => {
  const id = "event.ceremony.end_time";
  const actions = [{ type: "event.set_datetime", arguments: { phase: "ceremony", date: null, startTime: null, endTime: "22:00" } }];
  assert.equal(validateDesignerAiResolutionUpdates([resolution(id, "optional_end_time_omitted")], snapshot(id), { actions }).ok, false);
});

test("stored keep_existing for an empty value reopens instead of hiding a pending leaf", () => {
  const values = sanitizeCapabilitySnapshot({ values: { people: { primaryName: "", secondaryName: "Luz" } } }).values;
  const availability = { people: true };
  const before = ledger.buildDesignerAiLedger({ availability, values });
  const leaf = before.leaves.find((l) => l.id === "event.people.primary_name");
  const conversationState = { resolutions: [{ leafId: leaf.id, status: "resolved_by_rule", rule: "keep_existing", provenance: "user_current_session", fingerprint: leaf.fingerprint }] };
  const replayed = ledger.buildDesignerAiLedger({ availability, values, conversationState });
  assert.equal(replayed.leaves.find((l) => l.id === leaf.id).status, "pending");
  const reconciled = ledger.reconcileDesignerAiConversationState({ snapshot: { values, ledger: before }, resolutions: [resolution(leaf.id, "keep_existing")] });
  assert.deepEqual(reconciled.resolutions, []);
  const legacy = ledger.buildDesignerAiLedger({ availability, values, conversationState: { resolutions: [{ ...conversationState.resolutions[0], status: "resolved_from_user", rule: null }] } });
  assert.equal(legacy.leaves.find((l) => l.id === leaf.id).status, "pending");
});
