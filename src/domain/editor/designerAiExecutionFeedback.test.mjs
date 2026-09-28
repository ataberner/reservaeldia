import test from "node:test";
import assert from "node:assert/strict";
import { buildDesignerAiExecutionFeedback, withDesignerAiExecutionFeedback } from "./designerAiExecutionFeedback.js";

const receipt = (type, args, overrides = {}) => ({ action: { type, arguments: args }, requested: true, executed: true, effective: true, persisted: true, error: null, ...overrides });
const enable = receipt("rsvp.set_enabled", { enabled: true });

test("execution feedback never treats executed or optimistic effects as saved", () => {
  for (const bad of [{ effective: false }, { persisted: false }, { error: "conflict" }]) {
    assert.equal(buildDesignerAiExecutionFeedback([{ ...enable, ...bad }]), "");
    assert.match(buildDesignerAiExecutionFeedback([{ ...enable, ...bad }], { partial: true }), /^Se guardaron 0 de 1 cambios:/);
  }
});

test("feedback summarizes single, multiple and partial confirmed changes without sensitive gift values", () => {
  assert.equal(withDesignerAiExecutionFeedback("Listo.", [enable]), "Listo. RSVP activado.");
  const results = [receipt("event.set_datetime", { phase: "ceremony", date: "2027-12-12", startTime: null, endTime: null }), enable,
    receipt("rsvp.set_question_active", { questionId: "dietary_notes", active: true })];
  const snapshot = { values: { rsvp: { questions: [{ id: "dietary_notes", label: "Restricciones alimentarias" }] } } };
  const multi = buildDesignerAiExecutionFeedback(results, { snapshot });
  assert.match(multi, /^Listo, guardé 3 cambios:/);
  assert.match(multi, /Fecha: 12 de diciembre/);
  assert.match(multi, /✓ RSVP activado/);
  assert.match(multi, /✓ Pregunta «Restricciones alimentarias» activada/);
  results[2].persisted = false;
  const partial = buildDesignerAiExecutionFeedback(results, { partial: true, snapshot });
  assert.match(partial, /^Se guardaron 2 de 3 cambios:/);
  assert.match(partial, /⚠ No pude confirmar el guardado/);
  assert.doesNotMatch(partial, /✓ Pregunta/);
  assert.doesNotMatch(buildDesignerAiExecutionFeedback([receipt("gifts.set_method", { method: "alias", value: "SYNTHETIC.PRIVATE", visible: true })]), /SYNTHETIC/);
});

test("feedback preserves a meaningful single-action answer and a multi-action follow-up question", () => {
  assert.equal(withDesignerAiExecutionFeedback("Activé RSVP. ¿Qué pregunta querés agregar?", [enable]), "Activé RSVP. ¿Qué pregunta querés agregar?");
  assert.match(withDesignerAiExecutionFeedback("¿Qué horario prefieren?", [enable, receipt("gifts.set_enabled", { enabled: false })]), /¿Qué horario prefieren\?$/);
});
