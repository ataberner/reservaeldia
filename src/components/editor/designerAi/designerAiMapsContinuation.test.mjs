import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { act } from "react";
import { mountPanel, ledger, contract } from "./testSupport/panelHarness.mjs";
import { templateDraft } from "./testSupport/conversationRegressionFixture.mjs";
import { applyEventGooglePlaceSelection } from "../../../domain/eventDetails/locationAuthoring.js";
import service from "../../../../functions/lib/designerAi/service.js";
import { withDesignerAiGuidedContinuation } from "../../../domain/editor/designerAiGuidedConversation.js";

const location = { placeId: "synthetic-selected-place", displayName: "Salón de prueba", formattedAddress: "Calle Ejemplo 123", lat: -34, lng: -58 };
const staleReply = "Perfecto, el lugar quedó guardado. ¿Querés indicarme la dirección manualmente? Y, si ya la tienen definida, ¿hasta qué hora dura el evento?";
const action = (type, args) => ({ type, arguments: args });

test("the first manual Maps choice remains saved despite a redundant model clarification", async () => {
  const run = await mountPanel({ savedDraft: templateDraft(), respond: (_, index) => index === 1
    ? { assistantMessage: "Hola.", entryGreeting: "Hola." }
    : index === 2 ? { intent: "apply", assistantMessage: "Datos guardados.", actions: [
      action("event.set_people", { primaryName: "Ana", secondaryName: "Luz" }),
      action("event.set_mode", { mode: "single" }),
      action("event.set_datetime", { phase: "ceremony", date: "2027-08-24", startTime: "20:00", endTime: null }),
      action("event.set_location_text", { phase: "ceremony", venueName: "Salón de prueba", address: "Calle Ejemplo 123" }),
    ] } : { assistantMessage: "¿Querés verificar la ubicación en Google Maps o conservar los datos manuales?", resolutions: [{ leafId: "event.ceremony.place_selection", status: "needs_clarification", rule: null }] },
  });
  try {
    await run.until(() => run.messages().length === 1);
    await run.send("Somos Ana y Luz. Un evento el 24/08/2027 a las 20 en Salón de prueba, Calle Ejemplo 123.");
    await run.click("Usar estos datos");
    await run.until(() => run.messages().at(-1)?.role === "assistant" &&
      document.querySelector("section[aria-label='Tu asistente']")?.getAttribute("aria-busy") === "false");
    const leaf = run.snapshot().ledger.leaves.find(entry => entry.id === "event.ceremony.place_selection");
    assert.equal(leaf.status, "resolved_by_rule");
    assert.equal(leaf.rule, "leave_empty");
    assert.match(run.messages().at(-1).content, /Dress Code/);
    assert.doesNotMatch(run.messages().at(-1).content, /Maps/);
    assert.equal(run.calls.length, 2, "a verified local choice does not need model interpretation");
  } finally { await run.close(); }
});

test("verified manual location continuation cannot reopen Maps from a model control request", async () => {
  const run = await mountPanel({ savedDraft: templateDraft(), locationControl: SelectionControl,
    respond: (_, index) => index === 1 ? { assistantMessage: "Hola.", entryGreeting: "Hola." } : index === 2 ? {
      intent: "apply", assistantMessage: "Datos guardados.", actions: [
        action("event.set_people", { primaryName: "Ana", secondaryName: "Luz" }),
        action("event.set_mode", { mode: "single" }),
        action("event.set_datetime", { phase: "ceremony", date: "2027-08-24", startTime: "20:00", endTime: null }),
        action("event.set_location_text", { phase: "ceremony", venueName: "Salón de prueba", address: "Calle Ejemplo 123" }),
      ],
    } : { intent: "apply", assistantMessage: "Abramos Google Maps para buscar la dirección.",
      controlRequest: { type: "google_place_picker", phase: "ceremony" } },
  });
  try {
    await run.until(() => run.messages().length === 1);
    await run.send("Somos Ana y Luz. Un evento el 24/08/2027 a las 20 en Salón de prueba, Calle Ejemplo 123.");
    await run.click("Usar estos datos");
    await run.until(() => run.messages().at(-1)?.role === "assistant");
    assert.equal(run.calls.length, 2, "manual continuation is derived locally");
    assert.equal(document.querySelector('[data-designer-ai-location-control]'), null);
    assert.equal(run.snapshot().ledger.leaves.find(leaf => leaf.id === "event.ceremony.place_selection").rule, "leave_empty");
    assert.match(run.messages().at(-1).content, /Dress Code/);
    assert.doesNotMatch(run.messages().at(-1).content, /Maps|buscar la dirección/);
    assert.equal(run.messages().at(-1).intent, "clarify");
  } finally { await run.close(); }
});

test("manual entry with no address asks only for it and keeps the choice after saving it", async () => {
  const run = await mountPanel({ savedDraft: templateDraft(), respond: (_, index) => index === 1
    ? { assistantMessage: "Hola.", entryGreeting: "Hola." }
    : index === 2 ? { intent: "apply", assistantMessage: "Datos guardados.", actions: [
      action("event.set_people", { primaryName: "Ana", secondaryName: "Luz" }),
      action("event.set_mode", { mode: "single" }),
      action("event.set_datetime", { phase: "ceremony", date: "2027-08-24", startTime: "20:00", endTime: null }),
      action("event.set_location_text", { phase: "ceremony", venueName: "Salón de prueba", address: "" }),
    ] } : { intent: "apply", assistantMessage: "Dirección guardada.", actions: [
      action("event.set_location_text", { phase: "ceremony", venueName: "Salón de prueba", address: "Calle Ejemplo 123" }),
    ], resolutions: [{ leafId: "event.ceremony.place_selection", status: "needs_clarification", rule: null }] },
  });
  try {
    await run.until(() => run.messages().length === 1);
    await run.send("Somos Ana y Luz. Un evento el 24/08/2027 a las 20 en Salón de prueba.");
    await run.click("Ingresar dirección manual");
    await run.until(() => run.messages().at(-1)?.role === "assistant");
    const selection = () => run.snapshot().ledger.leaves.find(entry => entry.id === "event.ceremony.place_selection");
    assert.equal(selection().rule, "leave_empty");
    assert.equal(run.snapshot().values.ceremony.address, "");
    assert.equal(ledger.buildDesignerAiNextStep(run.snapshot()).kind, "address");
    assert.match(run.messages().at(-1).content, /¿Cuál es la dirección/);
    assert.doesNotMatch(run.messages().at(-1).content, /Maps|Dress Code/);
    assert.equal(run.calls.length, 2);
    await run.send("Calle Ejemplo 123");
    assert.equal(selection().rule, "leave_empty");
    assert.match(run.messages().at(-1).content, /Dress Code/);
    assert.doesNotMatch(run.messages().at(-1).content, /Maps/);
  } finally { await run.close(); }
});

for (const variant of ["editing", "metadata failure", "pending metadata", "external Maps selection"]) {
  test(`manual location continuation preserves persistence and composer guards: ${variant}`, async () => {
    let failMetadata = false, holdMetadata = false, release;
    const pending = new Promise(resolve => { release = resolve; });
    const draft = templateDraft();
    if (variant === "editing") draft.conversation = { usage: { hasStarted: true, guidedFlowCompleted: true } };
    const run = await mountPanel({ savedDraft: draft, failMetadata: () => failMetadata,
      beforeMetadata: () => holdMetadata ? pending : undefined,
      respond: (_, index) => index === 1 ? { assistantMessage: "Hola.", entryGreeting: "Hola." } : {
        intent: "apply", assistantMessage: "Datos guardados.", actions: [
          action("event.set_people", { primaryName: "Ana", secondaryName: "Luz" }),
          action("event.set_mode", { mode: "single" }),
          action("event.set_datetime", { phase: "ceremony", date: "2027-08-24", startTime: "20:00", endTime: null }),
          action("event.set_location_text", { phase: "ceremony", venueName: "Salón de prueba", address: "Calle Ejemplo 123" }),
        ],
      },
    });
    try {
      await run.until(() => run.messages().length === 1);
      await run.send("Somos Ana y Luz. Un evento el 24/08/2027 a las 20 en Salón de prueba, Calle Ejemplo 123.");
      failMetadata = variant === "metadata failure";
      holdMetadata = ["pending metadata", "external Maps selection"].includes(variant);
      await run.click("Usar estos datos");
      if (failMetadata) {
        await run.until(() => run.messages().at(-1)?.intent === "error");
        assert.match(run.messages().at(-1).content, /No pude guardar la elección/);
        assert.equal(run.exportPersistedDraft().conversation.resolutions.some(entry =>
          entry.leafId === "event.ceremony.place_selection" && entry.rule === "leave_empty"), false);
        assert.equal(run.snapshot().values.ceremony.address, "Calle Ejemplo 123");
        failMetadata = false;
        await run.click("Usar estos datos");
      }
      if (holdMetadata) {
        assert.equal(document.querySelector("section[aria-label='Tu asistente']").getAttribute("aria-busy"), "true");
        const composer = document.querySelector("textarea");
        const props = composer[Object.keys(composer).find(key => key.startsWith("__reactProps"))];
        await act(async () => props.onChange({ target: { value: "No queremos Dress Code." } }));
        await act(async () => document.querySelector("form").dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true })));
        assert.equal(run.calls.length, 2, "chat cannot race the unfinished manual decision");
        assert.equal(run.messages().at(-1)?.role, "user", "no confirmation before durable metadata");
        if (variant === "external Maps selection") {
          await applyEventGooglePlaceSelection({ targetWindow: window, feature: "ceremony", googlePlace: location });
          assert.equal(run.snapshot().values.ceremony.placeSelected, true);
        }
        holdMetadata = false;
        release();
      }
      await run.until(() => run.messages().at(-1)?.role === "assistant" && run.messages().at(-1)?.intent !== "error");
      assert.equal(run.calls.length, 2);
      assert.equal(run.exportPersistedDraft().conversation.resolutions.find(entry => entry.leafId === "event.ceremony.place_selection").rule, "leave_empty");
      if (variant === "external Maps selection") {
        const leaf = run.snapshot().ledger.leaves.find(entry => entry.id === "event.ceremony.place_selection");
        assert.notEqual(leaf.rule, "leave_empty", "a stale manual fingerprint does not overwrite newer Google data");
        assert.match(run.messages().at(-1).content, /Sigamos con tu invitación/);
        assert.doesNotMatch(run.messages().at(-1).content, /seguimos con la ubicación manual/);
      } else if (variant === "editing") assert.doesNotMatch(run.messages().at(-1).content, /¿|\?/);
      else assert.match(run.messages().at(-1).content, /Dress Code/);
      if (variant === "pending metadata") assert.equal(document.querySelector("textarea").value, "No queremos Dress Code.");
    } finally { release(); await run.close(); }
  });
}

// Exercise the real owner/verification/persistence path; only Places UI and the
// provider are synthetic. The returned copy reproduces the observed bad reply.
function SelectionControl({ phase, onSelectionApplied, onCancel }) {
  const [error, setError] = React.useState("");
  return React.createElement("section", { "data-designer-ai-location-control": phase },
    React.createElement("button", { onClick: async () => {
      try {
        const selected = await applyEventGooglePlaceSelection({ targetWindow: window, feature: phase, googlePlace: location });
        if (await onSelectionApplied(selected) === false) throw new Error("Selection is not verified");
      } catch (failure) { setError(failure.message); }
    } }, "Seleccionar resultado"),
    React.createElement("button", { onClick: onCancel }, "Cancelar selección"),
    error ? React.createElement("p", { role: "alert" }, error) : null);
}

for (const variant of ["new address", "same template address", "clarification", "deferred", "editing", "two phases", "cancel", "write failure", "metadata failure", "continuation failure"]) {
  test(`Maps selection resolves its text leaves and avoids asking again: ${variant}`, async () => {
    const draft = templateDraft();
    const twoPhases = variant === "two phases";
    if (variant === "same template address") Object.assign(draft.authoring.defaults, {
      event_ceremony_venue_address: location.formattedAddress, event_ceremony_venue_name: location.displayName,
    });
    if (twoPhases) {
      draft.authoring.fieldsSchema.push(...draft.authoring.fieldsSchema.filter(field => field.eventDetailsRole.startsWith("ceremony_")).map(field => ({
        ...field, key: field.key.replace("ceremony", "party"), eventDetailsRole: field.eventDetailsRole.replace("ceremony", "party"), applyTargets: [],
      })));
    }
    if (variant === "editing") draft.conversation = { usage: { hasStarted: true, guidedFlowCompleted: true } };
    let failWrite = false, failMetadata = false;
    let run = await mountPanel({ savedDraft: draft, locationControl: SelectionControl,
      failWrite: () => failWrite, failMetadata: () => failMetadata, respond: (payload, index) => {
      if (index === 1) return { assistantMessage: "¿Cómo se llaman?" };
      if (index === 2) return { actions: [action("event.set_people", { primaryName: "Ana", secondaryName: "Luz" })], assistantMessage: "¿Un único evento o ceremonia y fiesta?" };
      if (index === 3) return { actions: [action("event.set_mode", { mode: twoPhases ? "ceremony_party" : "single" }),
        action("event.set_datetime", { phase: "ceremony", date: "2026-12-24", startTime: "20:00", endTime: null })], assistantMessage: "¿Cómo se llama el lugar?" };
      if (index === 4) return { actions: variant === "same template address" ? [] : [action("event.set_location_text", { phase: "ceremony", venueName: location.displayName, address: "" })],
        controlRequest: variant === "same template address" ? { type: "google_place_picker", phase: "ceremony" } : null,
        resolutions: [{ leafId: "event.ceremony.place_selection", status: "needs_clarification", rule: null },
          ...(["clarification", "deferred"].includes(variant) ? [{ leafId: "event.ceremony.address", status: variant === "deferred" ? "deferred_by_user" : "needs_clarification", rule: null }] : [])],
        assistantMessage: "¿Querés buscarlo en Google Maps o cargar la dirección manualmente?" };
      if (variant === "continuation failure") throw new Error("Synthetic empty apply rejection");
      return { assistantMessage: staleReply };
    } });
    try {
      await run.until(() => run.messages().length === 1);
      await run.send("Somos Ana y Luz.");
      await run.send(twoPhases ? "Ceremonia y fiesta. La ceremonia es el 24/12/26 a las 20." : "Solo fiesta, el 24/12/26 a las 20.");
      await run.send(variant === "same template address" ? "Buscá Salón de prueba en Google Maps." : "Se llama Salón de prueba.");
      if (variant !== "same template address") await run.click("Buscar en Google Maps");
      if (variant === "cancel") {
        await run.click("Cancelar selección");
        assert.equal(run.calls.length, 4);
        assert.equal(run.snapshot().values.ceremony.placeSelected, false);
        assert.notEqual(run.snapshot().ledger.leaves.find(leaf => leaf.id === "event.ceremony.address").status, "resolved_by_control");
        return;
      }
      if (["write failure", "metadata failure"].includes(variant)) {
        failWrite = variant === "write failure";
        failMetadata = variant === "metadata failure";
        await act(async () => document.querySelector('[data-designer-ai-location-control] button').click());
        await run.until(() => document.querySelector('[role="alert"]'));
        assert.equal(run.calls.length, 4, "no model continuation before durable confirmation");
        assert.notEqual(run.exportPersistedDraft().conversation.resolutions.find(entry => entry.leafId === "event.ceremony.address")?.status, "resolved_by_control");
        failWrite = false; failMetadata = false;
      }
      await act(async () => document.querySelector('[data-designer-ai-location-control] button').click());
      await run.until(() => run.calls.length === 5 && document.querySelector("section[aria-label='Tu asistente']")?.getAttribute("aria-busy") === "false");
      if (variant === "continuation failure") {
        assert.equal(run.messages().at(-1).canRetryContinuation, true);
        await run.click("Continuar recorrido");
        assert.equal(run.calls.length, 5, "recovery derives the next question locally; no repeated empty-apply rejection");
        assert.equal(run.messages().some(message => message.canRetryContinuation), false);
      }
      const state = run.snapshot();
      assert.doesNotMatch(run.messages().at(-1).content, /dirección manual|Y, si/);
      for (const field of ["address", "venue_name", "place_selection"]) {
        assert.equal(state.ledger.leaves.find(leaf => leaf.id === `event.ceremony.${field}`).status, "resolved_by_control", field);
      }
      assert.equal(service.buildDesignerAiModelValues(run.calls.at(-1).capabilitySnapshot).ceremony.address, location.formattedAddress);
      if (variant === "editing") assert.doesNotMatch(run.messages().at(-1).content, /¿|\?/);
      else assert.match(run.messages().at(-1).content, twoPhases ? /¿Qué día es la fiesta\?/ : /¿Quieren incluir Dress Code\?/);
      assert.doesNotMatch(run.messages().at(-1).content, /hasta qué hora|hora termina/);
      if (twoPhases) {
        assert.equal(state.values.party.placeSelected, false);
        assert.ok(ledger.buildDesignerAiConversationBrief(state).unresolvedLeafIds.includes("event.party.address"));
      }
      const saved = run.exportPersistedDraft();
      assert.equal(saved.authoring.defaults.event_ceremony_venue_address, location.formattedAddress);
      assert.equal(saved.conversation.resolutions.find(entry => entry.leafId === "event.ceremony.address").status, "resolved_by_control");
      assert.equal(JSON.stringify(run.calls).includes("synthetic-selected-place"), false);
      await run.close(); run = null;
      run = await mountPanel({ savedDraft: saved, respond: (_, index) => index === 1
        ? { assistantMessage: "Seguimos con los datos pendientes." }
        : { actions: [action("event.set_location_text", { phase: "ceremony", venueName: location.displayName, address: "Otra calle 456" })],
          resolutions: [{ leafId: "event.ceremony.place_selection", status: "resolved_by_rule", rule: "leave_empty" }], assistantMessage: "Actualicé la dirección manualmente." } });
      await run.until(() => run.messages().length === 1);
      assert.equal(run.snapshot().ledger.leaves.find(leaf => leaf.id === "event.ceremony.address").status, "resolved_by_control");
      assert.equal(service.buildDesignerAiModelValues(run.calls[0].capabilitySnapshot).ceremony.address, location.formattedAddress);
      if (variant === "editing") {
        assert.equal(run.calls[0].capabilitySnapshot.conversation.mode, "editing");
        await run.send("Cambiá la dirección manualmente por Otra calle 456, sin Maps.");
        assert.equal(run.snapshot().values.ceremony.address, "Otra calle 456");
        assert.equal(run.snapshot().values.ceremony.placeSelected, false);
        assert.equal(run.snapshot().ledger.leaves.find(leaf => leaf.id === "event.ceremony.address").status, "resolved_from_user");
        assert.equal(run.calls[1].capabilitySnapshot.conversation.mode, "editing");
      }
    } finally { await run?.close(); }
  });
}

test("verified continuation suppresses stale questions without losing ordinary date clarification", () => {
  const values = contract.sanitizeCapabilitySnapshot({ values: { eventMode: "single", ceremony: { date: "" } } }).values;
  const snapshot = { values, conversation: { mode: "guided" }, ledger: ledger.buildDesignerAiLedger({ values, availability: { people: false, eventMode: false, ceremonyDatetime: true } }) };
  const result = { intent: "clarify", actions: [], resolutions: [], clarification: { leafId: "event.ceremony.date", kind: "missing_year" } };
  assert.equal(withDesignerAiGuidedContinuation("¿De qué año?", { previousSnapshot: snapshot, snapshot, result }), "¿De qué año es la fecha del evento?");
  const editing = { ...snapshot, conversation: { mode: "editing" } };
  assert.equal(withDesignerAiGuidedContinuation("¿Querés indicarme la dirección manualmente?", { previousSnapshot: editing, snapshot: editing, result, verifiedContinuation: true }), "Listo.");
});

for (const choice of ["button", "chat"]) {
  test(`manual location stays selected after naming the venue and reloading: ${choice}`, async () => {
    const address = "Calle de Prueba 459, Ciudad de Prueba";
    const manual = { leafId: "event.ceremony.place_selection", status: "resolved_by_rule", rule: "leave_empty" };
    const hasMapsOffer = () => [...document.querySelectorAll("button")].some(button => button.textContent.trim() === "Buscar en Google Maps");
    const selectionLeaf = snapshot => snapshot.ledger.leaves.find(leaf => leaf.id === manual.leafId);
    let run = await mountPanel({ savedDraft: templateDraft(), respond: (_, index) => {
      if (index === 1) return { assistantMessage: "¿Cómo se llaman?" };
      if (index === 2) return { actions: [action("event.set_people", { primaryName: "Ana", secondaryName: "Luz" })], assistantMessage: "¿Un único evento o ceremonia y fiesta?" };
      if (index === 3) return { actions: [action("event.set_mode", { mode: "single" })], assistantMessage: "¿Qué día es el evento?" };
      if (index === 4) return { actions: [action("event.set_datetime", { phase: "ceremony", date: "2026-12-24", startTime: null, endTime: null })], assistantMessage: "¿A qué hora comienza y dónde será el evento?" };
      if (index === 5) return {
        actions: [action("event.set_datetime", { phase: "ceremony", date: null, startTime: "20:00", endTime: null }),
          action("event.set_location_text", { phase: "ceremony", venueName: "", address })],
        assistantMessage: "Anoté el horario y la dirección. ¿Querés verificarla en Google Maps o usar la dirección manual?",
      };
      if (index === 6 && choice === "chat") return {
        resolutions: choice === "chat" ? [manual] : [], assistantMessage: "Perfecto, queda cargada manualmente la dirección. ¿Cómo se llama el lugar?" };
      return { actions: [action("event.set_location_text", { phase: "ceremony", venueName: "Mi casa", address })],
        assistantMessage: "El lugar queda como Mi casa. ¿Quieren incluir Dress Code?" };
    } });
    try {
      await run.until(() => run.messages().length === 1);
      await run.send("Somos Ana y Luz.");
      await run.send("Un único evento.");
      await run.send("24/12/26");
      await run.send(`Es a las 20:00 en ${address}.`);
      assert.equal(hasMapsOffer(), false, "confirm the venue before offering a passive Maps decision");
      assert.match(run.messages().at(-1).content, /Cómo se llama el lugar/);
      if (choice === "button") {
        await run.send("Es mi casa.");
        assert.equal(hasMapsOffer(), true);
        await run.click("Usar estos datos");
        await run.until(() => run.messages().at(-1)?.role === "assistant");
        assert.equal(run.calls.length, 6);
      } else {
        await run.send("Prefiero cargar manualmente la dirección del evento, sin usar Google Maps.");
      }
      assert.equal(selectionLeaf(run.snapshot()).rule, "leave_empty");
      assert.match(run.messages().at(-1).content, choice === "chat" ? /Cómo se llama el lugar/ : /Dress Code/);
      assert.equal(hasMapsOffer(), false);
      if (choice === "chat") await run.send("Es mi casa.");
      assert.equal(selectionLeaf(run.snapshot()).status, "resolved_by_rule");
      assert.equal(run.snapshot().values.ceremony.address, address);
      assert.equal(run.snapshot().values.ceremony.venueName, "Mi casa");
      assert.equal(ledger.buildDesignerAiConversationBrief(run.snapshot()).nextBlock.id, "dress_code");
      assert.match(run.messages().at(-1).content, /Dress Code/);
      assert.equal(hasMapsOffer(), false, "naming a manual venue must not repeat the Maps decision");

      const savedDraft = run.exportPersistedDraft();
      await run.close(); run = null;
      run = await mountPanel({ savedDraft, locationControl: SelectionControl, respond: (_, index) => index === 1
        ? { assistantMessage: "¿Quieren incluir Dress Code?" }
        : index === 2 ? { actions: [action("event.set_location_text", { phase: "ceremony", venueName: "Nuestra casa", address })], assistantMessage: "Actualicé el nombre del lugar." }
          : { intent: "apply", controlRequest: { type: "google_place_picker", phase: "ceremony" }, assistantMessage: "Busquemos la dirección en Google Maps." } });
      await run.until(() => run.messages().length === 1);
      assert.equal(selectionLeaf(run.snapshot()).rule, "leave_empty");
      await run.send("El lugar se llama Nuestra casa.");
      assert.equal(hasMapsOffer(), false, "the persisted choice also applies after a full reload");
      assert.equal(selectionLeaf(run.snapshot()).status, "resolved_by_rule");
      await run.send("Ahora sí quiero buscar esa dirección en Google Maps.");
      assert.ok(document.querySelector('[data-designer-ai-location-control="ceremony"]'), "an explicit later request can still open Maps");
    } finally { await run?.close(); }
  });
}
