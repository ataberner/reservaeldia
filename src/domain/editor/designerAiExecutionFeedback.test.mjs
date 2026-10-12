import test from "node:test";
import assert from "node:assert/strict";
import { buildDesignerAiExecutionFeedback, buildDesignerAiExecutionProgress, withDesignerAiExecutionFeedback } from "./designerAiExecutionFeedback.js";
import { buildDesignerAiCapabilitySnapshot } from "./designerAiCapabilities.js";
import { captureDesignerAiActionEvidence } from "../../../shared/designerAiConversationLedger.js";

const receipt = (type, args, overrides = {}) => ({ action: { type, arguments: args }, requested: true, executed: true, effective: true, persisted: true, error: null, ...overrides });
const enable = receipt("rsvp.set_enabled", { enabled: true });

function bankFixture(method = "cbu", value = "123456", { visible = true, enabled = true } = {}) {
  const snapshot = buildDesignerAiCapabilitySnapshot({ documentNameState: { documentId: "synthetic-bank-draft" },
    renderSnapshot: { gifts: { enabled, bank: { [method]: value }, visibility: { [method]: visible } } } });
  const saved = receipt("gifts.set_method", { method, value, visible });
  saved.evidence = captureDesignerAiActionEvidence(saved.action, snapshot);
  return { snapshot, saved };
}

test("progress distinguishes date and time changes without using private values", () => {
  const progress = (args) => buildDesignerAiExecutionProgress({ type: "event.set_datetime", arguments: args });
  assert.equal(progress({ date: "2026-12-24", startTime: null, endTime: null }), "Actualizando la fecha…");
  assert.equal(progress({ date: null, startTime: "20:00", endTime: null }), "Actualizando el horario…");
  assert.equal(progress({ date: null, startTime: null, endTime: "" }), "Actualizando el horario…");
  assert.equal(progress({ date: "2026-12-24", startTime: "20:00", endTime: null }), "Actualizando la fecha y el horario…");
  assert.equal(buildDesignerAiExecutionProgress(), "Haciendo los cambios…");
  assert.equal(buildDesignerAiExecutionProgress({ type: "unknown" }), "Haciendo los cambios…");
  assert.equal(buildDesignerAiExecutionProgress({ type: "gifts.set_method", arguments: { method: "alias", value: "SYNTHETIC.PRIVATE" } }), "Actualizando los regalos…");
});

test("location progress distinguishes adding from updating or clearing, scoped to the requested phase", () => {
  const action = { type: "event.set_location_text", arguments: { phase: "party", venueName: "Mi casa", address: "" } };
  const snapshot = { values: { ceremony: { venueName: "Iglesia" }, party: {} } };
  assert.equal(buildDesignerAiExecutionProgress(action, snapshot), "Agregando la ubicación…");
  snapshot.values.party.address = "Calle de prueba 123";
  assert.equal(buildDesignerAiExecutionProgress(action, snapshot), "Actualizando la ubicación…");
  assert.equal(buildDesignerAiExecutionProgress({ ...action, arguments: { phase: "party", venueName: "", address: "" } }), "Actualizando la ubicación…");
});

test("execution feedback never treats executed or optimistic effects as saved", () => {
  for (const bad of [{ effective: false }, { persisted: false }, { error: "conflict" }]) {
    assert.equal(buildDesignerAiExecutionFeedback([{ ...enable, ...bad }]), "");
    assert.match(buildDesignerAiExecutionFeedback([{ ...enable, ...bad }], { partial: true }), /^Se guardaron 0 de 1 cambios:/);
  }
});

test("feedback summarizes confirmed changes without exposing gift values that lack current evidence", () => {
  assert.equal(withDesignerAiExecutionFeedback("Listo.", [enable]), "Listo, actualizado.");
  const results = [receipt("event.set_datetime", { phase: "ceremony", date: "2027-12-12", startTime: null, endTime: null }), enable,
    receipt("rsvp.set_question_active", { questionId: "dietary_notes", active: true })];
  const snapshot = { values: { rsvp: { questions: [{ id: "dietary_notes", label: "Restricciones alimentarias" }] } } };
  assert.equal(buildDesignerAiExecutionFeedback(results, { snapshot }), "Listo, actualizado.");
  const multi = buildDesignerAiExecutionFeedback(results, { snapshot, structured: true });
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

test("feedback is generated only from receipts, independently of model prose", () => {
  assert.equal(withDesignerAiExecutionFeedback("Activé RSVP. ¿Qué pregunta querés agregar?", [enable]), "Listo, actualizado.");
  assert.equal(withDesignerAiExecutionFeedback("El horario quedó guardado: 18:00.", []), "");
  assert.equal(withDesignerAiExecutionFeedback("El horario quedó guardado: 18:00.", [receipt("event.set_datetime", { phase: "ceremony", date: null, startTime: "20:00", endTime: null })], { values: { eventMode: "single" } }), "Listo, actualizado.");
  assert.equal(withDesignerAiExecutionFeedback("¿Qué horario prefieren?", [enable, receipt("gifts.set_enabled", { enabled: false })]), "Listo, actualizado.");
});

test("automatic name receipts stay internal and simple feedback is not duplicated", () => {
  const snapshot = { values: { eventMode: "single" }, conversation: { namePolicy: { mode: "automatic" } } };
  const results = [receipt("document.set_name", { name: "Casamiento Ana y Luz" }), receipt("event.set_dress_code", { enabled: true, value: "Cocktail" })];
  const message = "Listo, agregué Dress Code “Cocktail”. ¿Quieren confirmar asistencia?";
  assert.equal(withDesignerAiExecutionFeedback(message, results, snapshot), "Listo, actualizado.");
  assert.equal(results.length, 2);
  assert.ok(results.every((r) => r.persisted && r.effective));
  assert.doesNotMatch(buildDesignerAiExecutionFeedback(results, { snapshot }), /Nombre de la invitación|2 cambios/);
  assert.match(buildDesignerAiExecutionFeedback(results, { snapshot, partial: true }), /Nombre de la invitación/);
  const date = receipt("event.set_datetime", { phase: "ceremony", date: "2026-12-24", startTime: "20:00" });
  assert.equal(buildDesignerAiExecutionFeedback([date], { snapshot }), "Listo, actualizado.");
  assert.doesNotMatch(buildDesignerAiExecutionFeedback([date], { snapshot }), /Ceremonia/);
});

test("only explicit summaries expand successful batches without duplicate prose", () => {
  const results = [enable, receipt("event.set_dress_code", { enabled: true, value: "Cocktail" }), receipt("rsvp.set_question_active", { questionId: "dietary_notes", active: true })];
  const message = "Perfecto, activé RSVP y Dress Code. ¿Quieren regalos?";
  assert.equal(withDesignerAiExecutionFeedback(message, results), "Listo, actualizado.");
  const summary = withDesignerAiExecutionFeedback(message, results, null, { userMessage: "Resumí los cambios" });
  assert.match(summary, /guardé 3 cambios/);
  assert.doesNotMatch(summary, /Perfecto, activé/);
  assert.doesNotMatch(summary, /¿Quieren regalos\?/);
  assert.doesNotMatch(withDesignerAiExecutionFeedback("Listo, actualicé los datos. El tamaño de letra se cambia desde el editor. ¿Quieren regalos?", results), /El tamaño de letra/);
  assert.match(withDesignerAiExecutionFeedback("RSVP activado.", [enable], null, { userMessage: "¿Qué cambiaste?" }), /✓ RSVP activado/);
  assert.doesNotMatch(withDesignerAiExecutionFeedback("Activé RSVP.", [{ ...enable, persisted: false }]), /^Activé RSVP/);
});

test("ordinary acknowledgements omit nonbank values even in mixed batches and partial errors identify fields", () => {
  const results = [receipt("event.set_people", { primaryName: "Persona Primera", secondaryName: "Persona Segunda" }),
    receipt("event.set_datetime", { phase: "ceremony", date: "2027-12-12", startTime: "20:00", endTime: null }),
    receipt("event.set_dress_code", { enabled: true, value: "Formal" })];
  assert.equal(withDesignerAiExecutionFeedback("Confirmé Persona Primera y Formal.", results), "Listo, actualizado.");
  const { snapshot, saved } = bankFixture("alias", "nuestro.casamiento");
  assert.equal(withDesignerAiExecutionFeedback("Listo.", [...results, saved], snapshot), "Alias: nuestro.casamiento configurado.");
  const partial = buildDesignerAiExecutionFeedback([...results, { ...enable, persisted: false }], { partial: true });
  assert.match(partial, /Nombres actualizados/);
  assert.match(partial, /Fecha actualizada.*Horario de inicio actualizado/);
  assert.match(partial, /Dress Code actualizado/);
  assert.match(partial, /⚠.*RSVP/);
  assert.doesNotMatch(partial, /Persona Primera|Persona Segunda|20:00|Formal|12 de diciembre/);
});

test("bank confirmation names the field and exact saved value, including leading zeros and owner normalization", () => {
  for (const [method, input, expected] of [["cbu", "123456", "CBU: 123456"], ["cbu", "  00123456  ", "CBU: 00123456"],
    ["alias", "nuestro.casamiento", "Alias: nuestro.casamiento"], ["holder", " Ana   Prueba ", "Titular: Ana Prueba"],
    ["bank", "Banco de Prueba", "Banco: Banco de Prueba"], ["cuit", "CUIT-PRUEBA", "CUIT: CUIT-PRUEBA"]]) {
    const { snapshot, saved } = bankFixture(method, input);
    assert.equal(buildDesignerAiExecutionFeedback([saved], { snapshot }), `${expected} configurado.`);
    assert.equal(withDesignerAiExecutionFeedback("Listo.", [saved], snapshot), `${expected} configurado.`);
  }
});

test("editing replaces model-written bank acknowledgement with verified values only", () => {
  const { snapshot, saved } = bankFixture();
  for (const message of ["Guardado. ¿Querés cambiar la foto?", "Confirmado: CBU 999999. ¿Querés cambiar la foto?",
    "El CBU quedó guardado. ¿Querés cambiar la foto?", "Listo, actualicé los datos. ¿Querés cambiar la foto?",
    "Ya guardé el CBU 999999. ¿Querés cambiar la foto?", "Te guardé el CBU 999999. ¿Querés cambiar la foto?",
    "Dejé el CBU 999999 configurado. ¿Querés cambiar la foto?", "CBU: 999999. ¿Querés cambiar la foto?"]) {
    assert.equal(withDesignerAiExecutionFeedback(message, [saved], snapshot), "CBU: 123456 configurado.");
  }
  assert.equal(withDesignerAiExecutionFeedback("Listo. El banco no se puede validar desde acá. ¿Querés cambiar la foto?", [saved], snapshot),
    "CBU: 123456 configurado.");
});

test("bank details require a current successful receipt and a visible enabled field with supplied data", () => {
  for (const overrides of [{ effective: false }, { persisted: false }, { error: "synthetic-failure" },
    { requested: false }, { evidence: undefined }]) {
    const { snapshot, saved } = bankFixture();
    assert.doesNotMatch(buildDesignerAiExecutionFeedback([{ ...saved, ...overrides }], { snapshot, partial: true }), /123456/);
  }
  for (const options of [{ visible: false }, { enabled: false }]) {
    const { snapshot, saved } = bankFixture("cbu", "123456", options);
    assert.doesNotMatch(buildDesignerAiExecutionFeedback([saved], { snapshot }), /123456/);
  }
  const { snapshot, saved } = bankFixture();
  for (const value of [null, ""]) {
    const action = { ...saved.action, arguments: { ...saved.action.arguments, value } };
    const changed = { ...saved, action, evidence: captureDesignerAiActionEvidence(action, snapshot) };
    assert.doesNotMatch(buildDesignerAiExecutionFeedback([changed], { snapshot }), /123456/);
  }
  const stale = structuredClone(snapshot);
  stale.documentIdentity = "another-synthetic-draft";
  assert.doesNotMatch(buildDesignerAiExecutionFeedback([saved], { snapshot: stale }), /123456/);
  const later = bankFixture("cbu", "00009999").snapshot;
  assert.doesNotMatch(buildDesignerAiExecutionFeedback([saved], { snapshot: later }), /123456|00009999/);
});

test("partial feedback details only saved bank receipts and never attributes failed or superseded values", () => {
  const { snapshot, saved } = bankFixture();
  const failed = receipt("gifts.set_method", { method: "alias", value: "ALIAS.NO.GUARDADO", visible: true }, { persisted: false, error: "synthetic-failure" });
  const text = buildDesignerAiExecutionFeedback([saved, failed], { snapshot, partial: true });
  assert.match(text, /✓ CBU: 123456 configurado/);
  assert.doesNotMatch(text, /ALIAS.NO.GUARDADO/);
  assert.match(text, /⚠/);
  const previous = bankFixture("cbu", "00001111").saved;
  assert.doesNotMatch(buildDesignerAiExecutionFeedback([previous, saved], { snapshot }), /00001111/);
  assert.equal(buildDesignerAiExecutionFeedback([previous, saved], { snapshot }).match(/123456/g)?.length, 1);
});
