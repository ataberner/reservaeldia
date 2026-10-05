// Synthetic regression cases shared by local checks and opt-in provider evals.
// No account, draft identifiers, credentials or external I/O.
import assert from "node:assert/strict";
import contract from "../../shared/designerAiCapabilityContract.cjs";
import ledger from "../../shared/designerAiConversationLedger.cjs";

const askedDate = [{ role: "assistant", content: "¿Qué día es el evento?" }];
const followup = (date, question = "¿De qué año?") => [
  ...askedDate, { role: "user", content: date },
  { role: "assistant", content: question },
];
export const designerAiDateCases = [
  { id: "short-year", message: "24/12/26", date: "2026-12-24" },
  { id: "day-first", message: "03/04/26", date: "2026-04-03" },
  { id: "full-year", message: "24/12/2026", date: "2026-12-24" },
  { id: "dots", message: "24.12.26", date: "2026-12-24" },
  { id: "pipes", message: "24|12|26", date: "2026-12-24" },
  { id: "leap-year", message: "29/02/28", date: "2028-02-29" },
  { id: "impossible-date", message: "31/02/26", date: null },
  { id: "missing-year", message: "24/12", date: null },
  { id: "year-only-without-context", message: "2026", date: null },
  { id: "year-followup", message: "2026", recentTurns: followup("24 de diciembre"), date: "2026-12-24" },
  { id: "production-recovery", message: "2026", recentTurns: followup("24/12/26", "¿Podés indicarme la fecha completa, incluyendo el año con cuatro dígitos?"), date: "2026-12-24" },
  { id: "ambiguous-prior-dates", message: "2026", recentTurns: followup("Puede ser el 23 o el 24 de diciembre"), date: null },
];

export function dateCasePayload(item) {
  const availability = { people: true, eventMode: true, ceremonyDatetime: true, ceremonyLocation: true };
  const values = contract.sanitizeCapabilitySnapshot({ values: {
    people: { primaryName: "Ana", secondaryName: "Luz" }, eventMode: "single",
    ceremony: { date: "", startTime: "", endTime: "", venueName: "", address: "", placeSelected: false },
  } }).values;
  const sourceContext = { templateDerived: true,
    changedKeys: ["event_primary_person_name", "event_secondary_person_name"] };
  const initial = ledger.buildDesignerAiLedger({ availability, values, sourceContext });
  // The reported exchange already confirmed single in a previous persisted turn.
  const conversationState = { usage: { hasStarted: true }, resolutions: [{
    leafId: "event.mode", status: "resolved_from_user", provenance: "user_current_session", rule: null,
    fingerprint: initial.leaves.find(entry => entry.id === "event.mode").fingerprint,
  }] };
  return {
    contractVersion: contract.DESIGNER_AI_CONTRACT_VERSION,
    clientMessageId: `date-eval-${item.id}`, entryMode: "continuation",
    message: item.message, recentTurns: item.recentTurns || askedDate,
    capabilitySnapshot: contract.sanitizeCapabilitySnapshot({
      revision: "synthetic-date", availability, values,
      ledger: ledger.buildDesignerAiLedger({ availability, values, sourceContext, conversationState }),
      conversation: conversationState,
    }),
  };
}

export function assertDateInterpretation(item, result) {
  const expected = item.date ? [{ type: "event.set_datetime", arguments: {
    phase: "ceremony", date: item.date, startTime: null, endTime: null,
  } }] : [];
  assert.deepEqual(result.actions, expected, item.id);
  assert.equal(result.controlRequest, null);
  assert.equal(result.resolutions.some(entry => entry.status === "deferred_by_user"), false);
  assert.doesNotMatch(result.assistantMessage, /ceremonia|&#(?:x[0-9a-f]+|\d+);/i);
  if (item.date) {
    assert.equal(result.intent, "apply");
    assert.equal(result.resolutions.some(entry => entry.leafId === "event.ceremony.date"), false);
    assert.doesNotMatch(result.assistantMessage, /\?(?:.*)(?:año|fecha completa)|¿[^?]*(?:año|fecha completa)/i);
  } else {
    assert.equal(result.intent, "clarify");
    assert.ok(result.resolutions.some(entry => entry.leafId === "event.ceremony.date" && entry.status === "needs_clarification"));
  }
}
