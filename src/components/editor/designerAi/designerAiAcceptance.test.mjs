import test from "node:test";
import assert from "node:assert/strict";
import { mountPanel } from "./testSupport/panelHarness.mjs";
import service from "../../../../functions/lib/designerAi/service.js";

const action = (type, args) => ({ type, arguments: args });

async function acceptanceRun() {
  let planned = [];
  const run = await mountPanel({ fullFields: true, respond: async (payload) => service.interpretDesignerAiChat({
    payload,
    client: { responses: { create: async (body) => {
      assert.equal(body.store, false);
      assert.equal(body.model, "gpt-5.6-luna");
      return { output: [{ type: "function_call", name: "submit_designer_ai_result", arguments: JSON.stringify({
        intent: planned.length ? "apply" : "clarify", assistantMessage: planned.length ? "Listo." : "Seguimos.",
        actions: planned, resolutions: [], controlRequest: null,
      }) }] };
    } } },
  }) });
  await run.until(() => run.messages().length === 1);
  return { ...run, step: async (message, actions) => {
    planned = actions;
    await run.send(message);
    assert.notEqual(run.messages().at(-1).intent, "error", run.messages().at(-1).content);
    assert.ok(run.writes.length || actions.every((a) => a.type === "document.set_name"));
    return run.snapshot().values;
  } };
}

// These scenarios test interpretation transport/validation -> actual panel ->
// executor -> owners/receipts -> metadata -> visible feedback. Model outputs and
// durable I/O are deterministic fixtures, not an evaluation of live model NLU.
test("acceptance Personas and automatic/explicit document names can be corrected", async () => {
  const run = await acceptanceRun();
  try {
    let v = await run.step("Somos Ana y Juan.", [action("event.set_people", { primaryName: "Ana", secondaryName: "Juan" })]);
    assert.deepEqual(v.people, { primaryName: "Ana", secondaryName: "Juan" });
    assert.equal(v.documentName, "Casamiento Ana y Juan");
    v = await run.step("Cambiá Juan por Pedro.", [action("event.set_people", { primaryName: "Ana", secondaryName: "Pedro" })]);
    assert.equal(v.documentName, "Casamiento Ana y Pedro");
    v = await run.step("Llamá al documento Nuestra fiesta.", [action("document.set_name", { name: "Nuestra fiesta" })]);
    assert.equal(v.documentName, "Nuestra fiesta");
    v = await run.step("Cambiá Pedro por Juan.", [action("event.set_people", { primaryName: "Ana", secondaryName: "Juan" })]);
    assert.equal(v.documentName, "Nuestra fiesta");
  } finally { await run.close(); }
});

test("acceptance event mode, date/time, manual locations, Dress Code and Historia", async () => {
  const run = await acceptanceRun();
  try {
    await run.step("Nos casamos el 15 de marzo de 2027 a las 18:30.", [action("event.set_datetime", { phase: "ceremony", date: "2027-03-15", startTime: "18:30", endTime: null })]);
    let v = await run.step("Mejor a las 19.", [action("event.set_datetime", { phase: "ceremony", date: null, startTime: "19:00", endTime: null })]);
    assert.equal(v.ceremony.date, "2027-03-15");
    assert.equal(v.ceremony.startTime, "19:00");
    v = await run.step("Hay ceremonia y fiesta, la fiesta es a las 21.", [action("event.set_mode", { mode: "ceremony_party" }), action("event.set_datetime", { phase: "party", date: "2027-03-15", startTime: "21:00", endTime: null })]);
    assert.equal(v.eventMode, "ceremony_party");
    assert.equal(v.party.startTime, "21:00");
    v = await run.step("Es un solo evento.", [action("event.set_mode", { mode: "single" })]);
    assert.equal(v.eventMode, "single");
    assert.equal(run.snapshot().ledger.guidedFlow.leafIds.some((id) => id.startsWith("event.party")), false);
    v = await run.step("Volvemos a ceremonia y fiesta.", [action("event.set_mode", { mode: "ceremony_party" })]);
    assert.equal(v.party.startTime, "21:00");
    for (const phase of ["ceremony", "party"]) {
      v = await run.step(`La ubicación de ${phase} es Salón Ejemplo, Calle Ficticia 123.`, [action("event.set_location_text", { phase, venueName: "Salón Ejemplo", address: "Calle Ficticia 123" })]);
      assert.equal(v[phase].address, "Calle Ficticia 123");
      assert.equal(v[phase].placeSelected, false);
    }
    for (const [enabled, value] of [[true, "Elegante"], [true, "Elegante sport"], [false, "Elegante sport"]]) {
      v = await run.step(enabled ? `Dress Code ${value}.` : "Sacá el Dress Code.", [action("event.set_dress_code", { enabled, value })]);
      assert.equal(v.dressCode.enabled, enabled);
      assert.equal(v.dressCode.value, value);
    }
    for (const text of ["Nos conocimos en un viaje.", "Nuestra historia comenzó en la facultad."]) {
      v = await run.step(`Cambiá el texto de nuestra historia por ${text}`, [action("story.set_text", { text })]);
      assert.equal(v.story, text);
    }
  } finally { await run.close(); }
});

test("acceptance RSVP activation, questions, options, rename, remove, order, modal and corrections", async () => {
  const run = await acceptanceRun();
  try {
    let v = await run.step("Activá RSVP y la pregunta sobre restricciones alimentarias.", [action("rsvp.set_enabled", { enabled: true }), action("rsvp.set_question_active", { questionId: "dietary_notes", active: true })]);
    assert.equal(v.rsvp.enabled, true);
    v = await run.step("Renombrá esa pregunta a ¿Tenés restricciones alimentarias? y que sea obligatoria.", [action("rsvp.update_question", { questionId: "dietary_notes", label: "¿Tenés restricciones alimentarias?", questionType: "long_text", required: true })]);
    assert.equal(v.rsvp.questions.find((q) => q.id === "dietary_notes").required, true);
    v = await run.step("Agregá Tal vez a las respuestas de asistencia.", [action("rsvp.add_option", { questionId: "attendance", label: "Tal vez" })]);
    const id = v.rsvp.questions.find((q) => q.id === "attendance").options.find((o) => o.label === "Tal vez").id;
    v = await run.step("Renombrá Tal vez a Todavía no sé.", [action("rsvp.rename_option", { questionId: "attendance", optionId: id, label: "Todavía no sé" })]);
    assert.ok(v.rsvp.questions.find((q) => q.id === "attendance").options.some((o) => o.label === "Todavía no sé"));
    v = await run.step("Eliminá esa opción.", [action("rsvp.remove_option", { questionId: "attendance", optionId: id })]);
    assert.equal(v.rsvp.questions.find((q) => q.id === "attendance").options.some((o) => o.id === id), false);
    v = await run.step("Poné restricciones antes de asistencia.", [action("rsvp.move_question", { questionId: "dietary_notes", targetQuestionId: "attendance", placement: "before" })]);
    assert.ok(v.rsvp.questions.findIndex((q) => q.id === "dietary_notes") < v.rsvp.questions.findIndex((q) => q.id === "attendance"));
    v = await run.step("Cambiá el título y botón del formulario.", [action("rsvp.update_modal", { title: "¿Nos acompañás?", subtitle: "Contanos", submitLabel: "Confirmar", primaryColor: "#692B9A" })]);
    assert.equal(v.rsvp.modal.title, "¿Nos acompañás?");
    assert.equal(v.rsvp.modal.submitLabel, "Confirmar");
    v = await run.step("Sacá la pregunta de restricciones alimentarias.", [action("rsvp.set_question_active", { questionId: "dietary_notes", active: false })]);
    assert.equal(v.rsvp.questions.find((q) => q.id === "dietary_notes").active, false);
    v = await run.step("Desactivá RSVP.", [action("rsvp.set_enabled", { enabled: false })]);
    assert.equal(v.rsvp.enabled, false);
  } finally { await run.close(); }
});

test("acceptance Gifts: disabled, alias, list, combinations, hide, reactivate, change, clear and copy", async () => {
  const run = await acceptanceRun();
  const method = (name, value, visible = true) => action("gifts.set_method", { method: name, value, visible });
  try {
    let v = await run.step("Sin regalos.", [action("gifts.set_enabled", { enabled: false })]);
    assert.equal(v.gifts.enabled, false);
    v = await run.step("Solo alias PRUEBA.V1.FICTICIA.", [action("gifts.set_enabled", { enabled: true }), method("alias", "PRUEBA.V1.FICTICIA")]);
    assert.equal(v.gifts.methods.alias.value, "PRUEBA.V1.FICTICIA");
    assert.equal(v.gifts.methods.bank.visible, false);
    v = await run.step("Solo lista externa https://example.test/lista.", [method("alias", null, false), method("giftListLink", "https://example.test/lista")]);
    assert.equal(run.render().gifts.giftListUrl, "https://example.test/lista");
    assert.equal(v.gifts.methods.alias.visible, false);
    assert.equal(run.render().gifts.bank.alias, "PRUEBA.V1.FICTICIA");
    v = await run.step("Mostrá también el alias y titular Pareja de Prueba.", [method("alias", null), method("holder", "Pareja de Prueba")]);
    assert.equal(v.gifts.methods.alias.visible, true);
    assert.equal(v.gifts.methods.giftListLink.visible, true);
    v = await run.step("Ocultá y conservá el titular.", [method("holder", null, false)]);
    assert.equal(v.gifts.methods.holder.visible, false);
    assert.equal(run.render().gifts.bank.holder, "Pareja de Prueba");
    v = await run.step("Volvé a mostrar el titular.", [method("holder", null)]);
    assert.equal(v.gifts.methods.holder.visible, true);
    v = await run.step("Cambiá el alias a OTRO.ALIAS.FICTICIO.", [method("alias", "OTRO.ALIAS.FICTICIO")]);
    assert.equal(v.gifts.methods.alias.value, "OTRO.ALIAS.FICTICIO");
    v = await run.step("Eliminá el valor del alias y ocultalo.", [method("alias", "", false)]);
    assert.equal(run.render().gifts.bank.alias, "");
    v = await run.step("Personalizá los textos de regalos.", [action("gifts.set_intro_text", { text: "Tu presencia es nuestro regalo." }), action("gifts.set_button_text", { text: "Nuestra lista" })]);
    assert.equal(v.gifts.introText, "Tu presencia es nuestro regalo.");
    assert.equal(v.gifts.buttonText, "Nuestra lista");
    v = await run.step("Desactivá regalos.", [action("gifts.set_enabled", { enabled: false })]);
    assert.equal(v.gifts.enabled, false);
    v = await run.step("Reactivá regalos.", [action("gifts.set_enabled", { enabled: true })]);
    assert.equal(v.gifts.enabled, true);
    assert.equal(v.gifts.methods.holder.value, "Pareja de Prueba");
  } finally { await run.close(); }
});

test("acceptance Gallery move uses the existing slots and persists the result without finishing its guided step", async () => {
  const run = await acceptanceRun();
  try {
    run.update({ objetos: [{ id: "gallery", tipo: "galeria", rows: 1, cols: 2, cells: [{ id: "a", mediaUrl: "https://example.test/synthetic-photo" }, { id: "b" }] }] });
    const v = await run.step("Mové la primera foto al segundo lugar.", [action("gallery.move_photo", { galleryId: "gallery", sourceCellId: "a", sourceIndex: 0, targetCellId: "b", targetIndex: 1 })]);
    assert.equal(v.galleries[0].slots[1].occupied, true);
    assert.equal(run.writes.at(-1).objetos[0].cells[1].mediaUrl, "https://example.test/synthetic-photo");
    assert.ok(run.snapshot().ledger.guidedFlow.completion.unresolvedLeafIds.includes("media.gallery.gallery.guided_completion"));
  } finally { await run.close(); }
});
