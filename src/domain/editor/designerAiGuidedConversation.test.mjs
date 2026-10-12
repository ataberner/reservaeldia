import test from "node:test";
import assert from "node:assert/strict";
import { buildDesignerAiLedger } from "../../../shared/designerAiConversationLedger.js";
import { buildDesignerAiGuidedQuestion, withDesignerAiGuidedContinuation, resolveDesignerAiCoverHelp, resolveDesignerAiGalleryHelp } from "./designerAiGuidedConversation.js";

function snapshot({ changedKeys = [], mode = "guided", conversationState = {}, templateDerived = true } = {}) {
  const availability = { people: true, eventMode: true, documentName: false,
    ceremonyDatetime: false, partyDatetime: false, ceremonyLocation: false,
    partyLocation: false, dressCode: false, story: false, cover: false, gallery: false,
    rsvp: false, gifts: false };
  const phase = { date: "", startTime: "", endTime: "", venueName: "", address: "", placeSelected: false };
  const values = { documentName: "", people: { primaryName: "Ana", secondaryName: "Luz" }, eventMode: "single",
    ceremony: { ...phase }, party: { ...phase }, dressCode: { enabled: false, value: "" }, story: "",
    media: { hasCover: false, contentRevision: "" }, galleries: [],
    rsvp: { enabled: false, questions: [], modal: { title: "", subtitle: "", submitLabel: "", primaryColor: "" } },
    gifts: { enabled: false, methods: {}, introText: "", buttonText: "" } };
  return { values, ledger: buildDesignerAiLedger({ availability, values, conversationState,
    sourceContext: { templateDerived, changedKeys } }), conversation: { mode } };
}

test("automatic entry and reentry ask names when values are template defaults or unconfirmed legacy text", () => {
  for (const entryMode of ["first_entry", "reentry"]) {
    for (const templateDerived of [true, false]) {
      const current = snapshot({ templateDerived, conversationState: { usage: { hasStarted: entryMode === "reentry" } } });
      assert.equal(withDesignerAiGuidedContinuation("Hola, Mica.", {
        previousSnapshot: current, snapshot: current, entryMode,
        result: { intent: "clarify", actions: [], resolutions: [], entryGreeting: "Hola, Mica." },
      }), "Hola, Mica. ¿Me compartís los nombres de quienes se casan?");
    }
  }
});

test("confirmed names and a partially completed flow resume at the actual next block", () => {
  const current = snapshot({ changedKeys: ["event_primary_person_name", "event_secondary_person_name"] });
  assert.equal(buildDesignerAiGuidedQuestion(current), "¿Van a tener ceremonia y fiesta o un único evento?");
  assert.equal(withDesignerAiGuidedContinuation("Seguimos con tu invitación.", {
    previousSnapshot: current, snapshot: current, entryMode: "reentry", result: { intent: "clarify", entryGreeting: "Seguimos con tu invitación." },
  }), "Seguimos con tu invitación. ¿Van a tener ceremonia y fiesta o un único evento?");
});

test("one confirmed name asks only for the remaining person", () => {
  assert.equal(buildDesignerAiGuidedQuestion(snapshot({ changedKeys: ["event_primary_person_name"] })),
    "¿Cómo se llama la otra persona que se casa?");
});

test("Dress Code asks for the choice and its value together, then only the missing value", () => {
  const current = snapshot();
  assert.equal(buildDesignerAiGuidedQuestion(current, { step: { kind: "dress_code_enabled", leafIds: ["event.dress_code.enabled"] } }),
    "¿Quieren incluir Dress Code? Si es así, ¿cuál?");
  assert.equal(buildDesignerAiGuidedQuestion(current, { step: { kind: "dress_code_value", leafIds: ["event.dress_code.value"] } }),
    "¿Qué Dress Code quieren indicar?");
});

test("a local requested-field clarification takes precedence without trusting provider prose", () => {
  for (const mode of ["guided", "editing"]) {
    const current = snapshot({ mode });
    const question = "Pasame el alias que quieran mostrar.";
    assert.equal(withDesignerAiGuidedContinuation("El alias heredado quedó guardado.", {
      previousSnapshot: current, snapshot: current, result: { intent: "clarify", assistantMessage: "guardado" },
      trustedClarification: question,
    }), question);
  }
});

test("completed journeys stay in editing on entry even if data now needs attention", () => {
  const current = snapshot({ mode: "editing", conversationState: { usage: { hasStarted: true, guidedFlowCompleted: true } } });
  assert.equal(withDesignerAiGuidedContinuation("Hola, Mica. ¿Qué querés ajustar?", {
    previousSnapshot: current, snapshot: current, entryMode: "reentry",
    result: { intent: "clarify", entryGreeting: "Hola, Mica. ¿Qué querés ajustar?" },
  }), "Hola, Mica. ¿Qué querés ajustar?");
});

test("legacy editing entry never announces discarded mutations or restarts the guided flow", () => {
  const current = snapshot({ mode: "editing" });
  assert.equal(withDesignerAiGuidedContinuation("Cambié los nombres y la dirección. ¿Qué día es?", {
    previousSnapshot: current, snapshot: current, entryMode: "reentry", result: { intent: "clarify" },
  }), "¡Hola! Sigamos con tu invitación. Contame qué querés ajustar.");
});

test("human replies cannot choose an unrelated question while names are pending", () => {
  const current = snapshot();
  for (const message of ["¿Cuál es la dirección del evento?", "Cual es la direccion?", "Pasame la dirección del evento.", "Listo. Ya cambié el lugar."]) {
    assert.equal(withDesignerAiGuidedContinuation(message, {
      previousSnapshot: current, snapshot: current, result: { intent: "clarify" },
    }), "¿Me compartís los nombres de quienes se casan?");
  }
});

test("legacy opening prose cannot replace the ledger question or introduce several questions", () => {
  const current = snapshot();
  for (const message of ["Hola. ¿Dónde es y a qué hora?", "Para empezar, contame el lugar del evento.",
    "¡Hola! ¿Cómo estás? ¿Qué fecha eligieron? Contame todo junto."]) {
    assert.equal(withDesignerAiGuidedContinuation(message, {
      previousSnapshot: current, snapshot: current, entryMode: "first_entry", result: { intent: "clarify" },
    }), "¡Hola! Sigamos con tu invitación. ¿Me compartís los nombres de quienes se casan?");
  }
});

function eventSnapshot({ phase = "ceremony", pending = ["date", "start_time", "venue_name", "address", "place_selection"], venue = "Salón Modelo", venueConfirmed = false, mode = "guided" } = {}) {
  const current = snapshot({ mode });
  current.values.eventMode = phase === "party" ? "ceremony_party" : "single";
  current.values[phase].venueName = venue;
  const leaves = ["date", "start_time", "venue_name", "address", "place_selection"].map((field) => ({
    id: `event.${phase}.${field}`, block: "event_data", fingerprint: field,
    status: pending.includes(field) ? "pending" : "resolved_from_user",
    provenance: field === "venue_name" && !venueConfirmed ? "template_value" : "user_current_session",
  }));
  current.ledger = { leaves, guidedFlow: { leafIds: leaves.map((leaf) => leaf.id), completion: { complete: false } } };
  return current;
}

test("each phase asks date, start time, venue, then location method or address", () => {
  for (const phase of ["ceremony", "party"]) {
    const owner = phase === "ceremony" ? "del evento" : "de la fiesta";
    assert.match(buildDesignerAiGuidedQuestion(eventSnapshot({ phase })), /Qué día/);
    assert.match(buildDesignerAiGuidedQuestion(eventSnapshot({ phase, pending: ["start_time", "venue_name", "address", "place_selection"] })), /A qué hora empieza/);
    assert.equal(buildDesignerAiGuidedQuestion(eventSnapshot({ phase, pending: ["venue_name", "address", "place_selection"] })), `¿Cómo se llama el lugar ${owner}?`);
    assert.match(buildDesignerAiGuidedQuestion(eventSnapshot({ phase, pending: ["address", "place_selection"], venueConfirmed: true })), /Google Maps o cargar/);
    assert.equal(buildDesignerAiGuidedQuestion(eventSnapshot({ phase, pending: ["address"], venueConfirmed: true })), `¿Cuál es la dirección ${owner}?`);
  }
});

test("a template venue cannot choose the Maps decision before confirming its name", () => {
  assert.match(buildDesignerAiGuidedQuestion(eventSnapshot({ pending: ["venue_name", "address", "place_selection"] })), /Cómo se llama el lugar/);
  assert.doesNotMatch(buildDesignerAiGuidedQuestion(eventSnapshot({ pending: ["address", "place_selection"] })), /Maps/);
});

test("only structured clarification of the current date can request its year", () => {
  const current = eventSnapshot();
  const render = (clarification) => withDesignerAiGuidedContinuation("¿Dónde es?", {
    previousSnapshot: current, snapshot: current, result: { intent: "clarify", clarification },
  });
  assert.equal(render({ leafId: "event.ceremony.date", kind: "missing_year" }), "¿De qué año es la fecha del evento?");
  assert.match(render({ leafId: "event.ceremony.date", kind: "invalid_date" }), /confirmar la fecha/);
  assert.equal(render({ leafId: "event.party.date", kind: "missing_year" }), "¿Qué día es el evento?");
  assert.equal(render({ leafId: "event.ceremony.address", kind: "missing_year" }), "¿Qué día es el evento?");
  assert.equal(render(undefined), "¿Qué día es el evento?");
});

test("fresh state supersedes model clarification after a saved action or manual change", () => {
  const previous = eventSnapshot();
  const current = eventSnapshot({ pending: ["start_time", "venue_name", "address", "place_selection"] });
  assert.equal(withDesignerAiGuidedContinuation("¿De qué año?", {
    previousSnapshot: previous, snapshot: current, executionFeedback: "Listo. Fecha actualizada.",
    result: { intent: "apply", clarification: { leafId: "event.ceremony.date", kind: "missing_year" } },
  }), "Listo. Fecha actualizada. ¿A qué hora empieza el evento?");
});

test("editing stays reactive and never retains unverified model prose", () => {
  const current = snapshot({ mode: "editing" });
  const message = "¿Qué dirección querés usar?";
  assert.equal(withDesignerAiGuidedContinuation(message, { previousSnapshot: current, snapshot: current, result: {} }), "¿Qué dato querés ajustar y qué valor querés usar?");
  assert.equal(withDesignerAiGuidedContinuation(message, { previousSnapshot: current, snapshot: current, result: {}, verifiedContinuation: true }), "Listo, actualizado.");
});

test("editing renders structured clarification of the requested field without resuming guided questions", () => {
  const current = eventSnapshot({ mode: "editing" });
  for (const [field, kind, expected] of [["date", "missing_year", "¿De qué año es la fecha del evento?"],
    ["date", "invalid_date", "Necesito confirmar la fecha. ¿Qué día, mes y año es el evento?"],
    ["address", "missing_value", "¿Cuál es la dirección del evento?"]]) {
    const result = { clarification: { leafId: `event.ceremony.${field}`, kind } };
    assert.equal(withDesignerAiGuidedContinuation("El horario quedó guardado: 18:00.", {
      previousSnapshot: current, snapshot: current, result,
    }), expected);
  }
  assert.equal(withDesignerAiGuidedContinuation("Guardé las 18:00.", {
    previousSnapshot: current, snapshot: current, result: { intent: "apply" }, executionFeedback: "Listo. Evento · Hora: 20:00.",
  }), "Listo. Evento · Hora: 20:00.");
  assert.match(withDesignerAiGuidedContinuation("La portada ya fue cambiada.", {
    previousSnapshot: current, snapshot: current, result: { controlRequest: { type: "cover_upload" } },
  }), /^Podés cargar la nueva foto/);
  assert.match(withDesignerAiGuidedContinuation("Ya cambié la tipografía.", {
    previousSnapshot: current, snapshot: current, result: { intent: "out_of_scope" },
  }), /^Para esos ajustes, usá los controles del editor/);
});

test("editing asks which event phase without adopting the model's representative target", () => {
  for (const phase of ["ceremony", "party"]) {
    const current = eventSnapshot({ phase, mode: "editing" });
    current.values.eventMode = "ceremony_party";
    for (const field of ["date", "start_time", "venue_name", "address", "place_selection"]) {
      const rendered = withDesignerAiGuidedContinuation("Ya cambié la ceremonia.", {
        previousSnapshot: current, snapshot: current,
        result: { clarification: { leafId: `event.${phase}.${field}`, kind: "missing_phase" } },
      });
      assert.match(rendered, /de la ceremonia o de la fiesta\?/);
      assert.doesNotMatch(rendered, /Ya cambié/);
    }
  }
});

test("guided phase clarification only changes wording for the actual next step", () => {
  const current = eventSnapshot({ phase: "party" });
  assert.equal(buildDesignerAiGuidedQuestion(current, {
    clarification: { leafId: "event.party.date", kind: "missing_phase" },
  }), "¿Querés cambiar la fecha de la ceremonia o de la fiesta? Indicame también el nuevo dato.");
  assert.equal(buildDesignerAiGuidedQuestion(current, {
    clarification: { leafId: "event.party.start_time", kind: "missing_phase" },
  }), "¿Qué día es la fiesta?");
  assert.equal(buildDesignerAiGuidedQuestion(snapshot(), {
    clarification: { leafId: "event.ceremony.start_time", kind: "missing_phase" },
  }), "¿Me compartís los nombres de quienes se casan?");
});

test("editing missing names identifies the requested person", () => {
  const current = snapshot({ mode: "editing" });
  for (const [leafId, person] of [["event.people.primary_name", "primera"], ["event.people.secondary_name", "segunda"]]) {
    assert.equal(withDesignerAiGuidedContinuation("¿Cómo se llama la otra persona?", {
      previousSnapshot: current, snapshot: current,
      result: { clarification: { leafId, kind: "missing_value" } },
    }), `¿Cuál es el nombre de la ${person} persona que se casa?`);
  }
});

test("partial unsupported requests keep verified feedback and local scope notice", () => {
  const current = snapshot();
  const rendered = withDesignerAiGuidedContinuation("Cambié la tipografía. Pasame la dirección.", {
    previousSnapshot: current, snapshot: current, executionFeedback: "Listo. Fecha actualizada.",
    result: { intent: "apply", notice: "unsupported_request" },
  });
  assert.match(rendered, /^Listo\. Fecha actualizada\./);
  assert.match(rendered, /controles del editor/);
  assert.match(rendered, /nombres de quienes se casan/);
  assert.doesNotMatch(rendered, /Cambié la tipografía|dirección/);
});

test("automatic photo controls cannot bypass names or dates, even with earlier consent", () => {
  for (const current of [snapshot(), eventSnapshot()]) {
    for (const [resolveHelp, controlRequest] of [
      [resolveDesignerAiCoverHelp, { type: "cover_upload" }],
      [resolveDesignerAiGalleryHelp, { type: "gallery_cell_upload", galleryId: "gallery-a", cellId: "a", cellIndex: 0 }],
    ]) {
      for (const decision of [{}, { offered: true, accepted: true }]) {
        const help = resolveHelp({ result: { controlRequest }, snapshot: current, decision, userReply: false });
        assert.equal(help.offer, false);
        assert.equal(help.controlRequest, null);
      }
    }
  }
});

test("human photo requests preserve reactive controls outside the guided order", () => {
  for (const mode of ["guided", "editing"]) {
    const current = snapshot({ mode });
    for (const [resolveHelp, controlRequest] of [
      [resolveDesignerAiCoverHelp, { type: "cover_upload" }],
      [resolveDesignerAiGalleryHelp, { type: "gallery_cell_upload", galleryId: "gallery-a", cellId: "a", cellIndex: 0 }],
    ]) {
      const help = resolveHelp({ result: { controlRequest }, snapshot: current,
        decision: { offered: true }, userReply: true });
      assert.equal(help.offer, false);
      assert.equal(help.controlRequest, controlRequest);
    }
  }
});

test("automatic photo controls match the current cover or exact gallery step", () => {
  const current = snapshot();
  const photoLeaves = [
    { id: "media.cover", block: "cover", status: "pending" },
    { id: "media.gallery.gallery-a.guided_completion", block: "galleries", status: "pending" },
    { id: "media.gallery.gallery-b.guided_completion", block: "galleries", status: "pending" },
  ];
  current.ledger = { leaves: photoLeaves, guidedFlow: { leafIds: photoLeaves.map(leaf => leaf.id) } };
  const cover = { type: "cover_upload" };
  const coverHelp = resolveDesignerAiCoverHelp({ result: { controlRequest: cover }, snapshot: current });
  assert.equal(coverHelp.offer, true);
  assert.equal(coverHelp.controlRequest, null, "an automatic offer does not open the upload control without consent");
  photoLeaves[0].status = "resolved_from_user";
  const gallery = galleryId => ({ type: "gallery_cell_upload", galleryId, cellId: "a", cellIndex: 0 });
  const matching = gallery("gallery-a");
  const decision = { offered: true, accepted: true };
  assert.equal(resolveDesignerAiGalleryHelp({ result: { controlRequest: matching }, snapshot: current, decision }).controlRequest, matching);
  const wrongGallery = resolveDesignerAiGalleryHelp({ result: { controlRequest: gallery("gallery-b") }, snapshot: current, decision });
  assert.equal(wrongGallery.offer, false);
  assert.equal(wrongGallery.controlRequest, null);
});

for (const [leafId, question] of [
  ["gifts.bank_details", "Pasame los datos bancarios que quieran mostrar. Con un alias alcanza."],
  ["gifts.external_list", "Pasame el enlace de la lista de regalos."],
]) {
  test(`a saved ${leafId} choice asks only for its missing data on continuation and reentry`, () => {
    const current = snapshot();
    current.values.gifts.enabled = true;
    current.ledger = { leaves: [{ id: leafId, block: "gifts", status: "needs_clarification", provenance: "user_current_session" }],
      guidedFlow: { leafIds: [leafId], completion: { complete: false } } };
    assert.equal(buildDesignerAiGuidedQuestion(current), question);
    assert.equal(withDesignerAiGuidedContinuation("¿Lista externa o datos bancarios?", {
      previousSnapshot: current, snapshot: current, result: { intent: "clarify" },
    }), question);
    assert.equal(withDesignerAiGuidedContinuation("Hola.", { previousSnapshot: current, snapshot: current,
      entryMode: "reentry", result: { entryGreeting: "Hola." } }), `Hola. ${question}`);
  });
}
