import test from "node:test";
import assert from "node:assert/strict";
import ledgerRuntime from "./designerAiConversationLedger.js";

const {
  DESIGNER_AI_LEDGER_STATUSES,
  DESIGNER_AI_RESOLUTION_RULES,
  buildAutomaticEventName,
  buildDesignerAiGalleryCompletionLeafId,
  buildDesignerAiConversationBrief,
  buildDesignerAiLedger,
  mapDesignerAiActionToLeafIds,
  prepareDesignerAiConversationEntry,
  reconcileDesignerAiConversationState,
} = ledgerRuntime;

function fixture(overrides = {}) {
  const availability = {
    documentName: true,
    people: true,
    eventMode: true,
    ceremonyDatetime: true,
    partyDatetime: true,
    ceremonyLocation: true,
    partyLocation: true,
    dressCode: true,
    story: true,
    cover: true,
    gallery: true,
    rsvp: true,
    gifts: true,
    ...overrides.availability,
  };
  const values = {
    documentName: "Borgoña · Floral contemporánea",
    people: { primaryName: "Ana", secondaryName: "Luz" },
    eventMode: "ceremony_party",
    ceremony: { date: "2027-11-14", startTime: "18:00", endTime: "", venueName: "Parroquia", address: "Diego Palma 215", placeSelected: false },
    party: { date: "2027-11-14", startTime: "21:00", endTime: "", venueName: "Estancia", address: "Ruta 8 km 47", placeSelected: false },
    dressCode: { enabled: false, value: "Elegante sport" },
    story: "Texto de ejemplo",
    media: { hasCover: true, contentRevision: "cover-a" },
    galleries: [{ id: "gallery-1", slots: [
      { cellId: "a", index: 0, occupied: true, contentRevision: "photo-a" },
      { cellId: "b", index: 1, occupied: false, contentRevision: "empty" },
    ] }],
    rsvp: {
      enabled: false,
      questions: [
        { id: "full_name", active: true, label: "Nombre y apellido", type: "short_text", required: true, options: [] },
        { id: "attendance", active: true, label: "¿Asistís?", type: "single_select", required: true, options: [{ id: "yes", label: "Sí" }, { id: "no", label: "No" }] },
        { id: "dietary_notes", active: false, label: "Alergias", type: "long_text", required: false, options: [] },
      ],
      modal: { title: "Confirmar asistencia", subtitle: "Completá tus datos", submitLabel: "Enviar", primaryColor: "#7c3aed" },
    },
    gifts: {
      enabled: false,
      methods: {
        holder: { value: "Ana Pérez", visible: false },
        bank: { value: "", visible: false },
        alias: { value: "ANA.LUZ", visible: false },
        cbu: { value: "", visible: false },
        cuit: { value: "", visible: false },
        giftListLink: { value: "", configured: false, visible: false },
      },
      introText: "Si querés hacernos un regalo",
      buttonText: "Ver regalos",
    },
    ...overrides.values,
  };
  return { availability, values };
}

function build(options = {}) {
  const data = fixture(options);
  return buildDesignerAiLedger({
    ...data,
    conversationState: options.conversationState,
    sourceContext: options.sourceContext || { templateDerived: true, changedKeys: [] },
  });
}

function snapshotFor(ledger, values = fixture().values) {
  return { ledger, values, conversation: { namePolicy: { mode: "unknown", lastAutomaticName: "" } } };
}

test("ledger expands RSVP, Gifts and media into structural leaves", () => {
  const ledger = build();
  const ids = new Set(ledger.leaves.map((leaf) => leaf.id));
  for (const id of [
    "event.people.primary_name",
    "event.ceremony.end_time",
    "media.gallery.gallery-1.guided_completion",
    "media.gallery.gallery-1.slot.b",
    "rsvp.question.attendance.options",
    "rsvp.modal.primary_color",
    "gifts.method.alias.visible",
    "gifts.method.alias.value",
  ]) assert.equal(ids.has(id), true, id);
  assert.equal(ledger.completion.complete, false);
  assert.ok(ledger.completion.unresolvedLeafIds.length > 10);
});

test("completeness is true only when every available leaf is terminal", () => {
  const initial = build();
  const resolutions = initial.leaves
    .filter((leaf) => leaf.status !== DESIGNER_AI_LEDGER_STATUSES.UNAVAILABLE)
    .map((leaf) => ({
      leafId: leaf.id,
      status: DESIGNER_AI_LEDGER_STATUSES.RESOLVED_FROM_USER,
      provenance: "user_current_session",
      rule: null,
      fingerprint: leaf.fingerprint,
    }));
  const complete = build({ conversationState: { resolutions } });
  assert.equal(complete.completion.complete, true);
  const incomplete = build({ conversationState: { resolutions: resolutions.slice(1) } });
  assert.equal(incomplete.completion.complete, false);
  assert.ok(incomplete.completion.unresolvedLeafIds.length > 0);
});

test("template, placeholder and system defaults are not mistaken for personalization", () => {
  const ledger = build();
  const byId = new Map(ledger.leaves.map((leaf) => [leaf.id, leaf]));
  assert.equal(byId.get("document.name").provenance, "placeholder_or_sample");
  assert.equal(byId.get("document.name").status, "pending");
  assert.equal(byId.get("rsvp.modal.title").provenance, "system_default");
  assert.equal(byId.get("rsvp.modal.title").status, "pending");
  assert.equal(byId.get("story.text").provenance, "placeholder_or_sample");
});

test("template changedKeys provide evidence for existing user data", () => {
  const ledger = build({
    sourceContext: {
      templateDerived: true,
      changedKeys: ["event_primary_person_name", "event_ceremony_date"],
    },
  });
  assert.equal(ledger.leaves.find((leaf) => leaf.id === "event.people.primary_name").status, "resolved_from_existing_user_data");
  assert.equal(ledger.leaves.find((leaf) => leaf.id === "event.ceremony.date").status, "resolved_from_existing_user_data");
  assert.equal(ledger.leaves.find((leaf) => leaf.id === "event.people.secondary_name").status, "pending");
});

test("automatic event name is safe, normalized and rejects samples", () => {
  assert.equal(buildAutomaticEventName("  Martina ", "Juan  Pérez"), "Casamiento Martina y Juan Pérez");
  assert.equal(buildAutomaticEventName("Nombre de la novia", "Juan"), "");
  assert.equal(buildAutomaticEventName("", "Juan"), "");
});

test("automatic name policy follows corrections while explicit names remain explicit", () => {
  const initial = build();
  const snapshot = snapshotFor(initial);
  const automatic = reconcileDesignerAiConversationState({
    snapshot,
    actions: [
      { type: "event.set_people", arguments: { primaryName: "Ana", secondaryName: "Luz" } },
      { type: "document.set_name", arguments: { name: "Casamiento Ana y Luz" } },
    ],
    resolutions: [{
      leafId: "document.name",
      status: "resolved_by_rule",
      rule: DESIGNER_AI_RESOLUTION_RULES.AUTOMATIC_EVENT_NAME,
    }],
  });
  assert.deepEqual(automatic.namePolicy, { mode: "automatic", lastAutomaticName: "Casamiento Ana y Luz" });
  const corrected = reconcileDesignerAiConversationState({
    snapshot,
    previousState: automatic,
    actions: [{ type: "document.set_name", arguments: { name: "Casamiento Ana y Lucía" } }],
    resolutions: [{ leafId: "document.name", status: "resolved_by_rule", rule: DESIGNER_AI_RESOLUTION_RULES.AUTOMATIC_EVENT_NAME }],
  });
  assert.equal(corrected.namePolicy.lastAutomaticName, "Casamiento Ana y Lucía");
  const explicit = reconcileDesignerAiConversationState({
    snapshot,
    previousState: corrected,
    actions: [{ type: "document.set_name", arguments: { name: "Nuestra fiesta" } }],
  });
  assert.equal(explicit.namePolicy.mode, "explicit");
});

test("party and question dependencies reopen when their parent changes", () => {
  const singleValues = { ...fixture().values, eventMode: "single" };
  const initial = build({ values: singleValues });
  const modeLeaf = initial.leaves.find((leaf) => leaf.id === "event.mode");
  const state = { resolutions: [{ ...modeLeaf, leafId: modeLeaf.id, status: "resolved_from_user", provenance: "user_current_session" }] };
  const single = build({ values: singleValues, conversationState: state });
  assert.equal(single.leaves.find((leaf) => leaf.id === "event.party.date").status, "not_applicable_by_dependency");
  const party = build({ conversationState: state });
  assert.equal(party.leaves.find((leaf) => leaf.id === "event.party.date").status, "pending");

  const inactive = initial.leaves.find((leaf) => leaf.id === "rsvp.question.dietary_notes.active");
  const inactiveState = { resolutions: [{ ...inactive, leafId: inactive.id, status: "resolved_from_user", provenance: "user_current_session" }] };
  const child = build({ conversationState: inactiveState }).leaves.find((leaf) => leaf.id === "rsvp.question.dietary_notes.label");
  assert.equal(child.status, "not_applicable_by_dependency");
});

test("preserve_while_inactive resolves every internal RSVP/Gifts leaf and reopens on activation", () => {
  const initial = build();
  const preserved = initial.leaves
    .filter((leaf) => (leaf.id.startsWith("rsvp.") && leaf.id !== "rsvp.enabled") || (leaf.id.startsWith("gifts.") && leaf.id !== "gifts.enabled"))
    .map((leaf) => ({ ...leaf, leafId: leaf.id, status: "resolved_by_rule", provenance: "automatic_rule", rule: "preserve_while_inactive" }));
  const parentLeaves = ["rsvp.enabled", "gifts.enabled"].map((id) => {
    const leaf = initial.leaves.find((entry) => entry.id === id);
    return { ...leaf, leafId: leaf.id, status: "resolved_from_user", provenance: "user_current_session" };
  });
  const inactive = build({ conversationState: { resolutions: [...preserved, ...parentLeaves] } });
  assert.equal(inactive.leaves.find((leaf) => leaf.id === "rsvp.modal.title").status, "resolved_by_rule");
  const activeValues = {
    ...fixture().values,
    rsvp: { ...fixture().values.rsvp, enabled: true },
    gifts: { ...fixture().values.gifts, enabled: true },
  };
  const activeUnresolved = build({ values: activeValues });
  const activeParents = ["rsvp.enabled", "gifts.enabled"].map((id) => {
    const leaf = activeUnresolved.leaves.find((entry) => entry.id === id);
    return { ...leaf, leafId: leaf.id, status: "resolved_from_user", provenance: "user_current_session" };
  });
  const active = build({ values: activeValues, conversationState: { resolutions: [...preserved, ...activeParents] } });
  assert.equal(active.leaves.find((leaf) => leaf.id === "rsvp.modal.title").status, "pending");
  assert.equal(active.leaves.find((leaf) => leaf.id === "gifts.intro_text").status, "pending");
});

test("RSVP order follows active-question dependency and enabled Gifts require a complete visible method", () => {
  const singleQuestionValues = {
    ...fixture().values,
    rsvp: {
      ...fixture().values.rsvp,
      questions: fixture().values.rsvp.questions.map((question) => ({
        ...question,
        active: question.id === "full_name",
      })),
    },
  };
  const initial = build({ values: singleQuestionValues });
  const activeResolutions = initial.leaves
    .filter((leaf) => leaf.id.match(/^rsvp\.question\..+\.active$/))
    .map((leaf) => ({ ...leaf, leafId: leaf.id, status: "resolved_from_user", provenance: "user_current_session" }));
  const oneQuestion = build({ values: singleQuestionValues, conversationState: { resolutions: activeResolutions } });
  assert.equal(oneQuestion.leaves.find((leaf) => leaf.id === "rsvp.questions.order").status, "not_applicable_by_dependency");

  const giftsEnabledValues = {
    ...fixture().values,
    gifts: { ...fixture().values.gifts, enabled: true },
  };
  const unresolvedGifts = build({ values: giftsEnabledValues });
  const enabledLeaf = unresolvedGifts.leaves.find((leaf) => leaf.id === "gifts.enabled");
  const invalidGifts = build({
    values: giftsEnabledValues,
    conversationState: {
      resolutions: [{ ...enabledLeaf, leafId: enabledLeaf.id, status: "resolved_from_user", provenance: "user_current_session" }],
    },
  });
  assert.equal(invalidGifts.leaves.find((leaf) => leaf.id === "gifts.enabled").status, "needs_clarification");
});

test("brief selects the highest-priority real pending block and groups related leaves", () => {
  const ledger = build();
  const brief = buildDesignerAiConversationBrief({ ledger });
  assert.equal(brief.nextBlock.id, "names");
  assert.ok(brief.nextBlock.leafIds.includes("event.people.primary_name"));
  assert.ok(brief.needsAttention.find((block) => block.id === "event_data").leafIds.length >= 4);
});

test("legacy drafts enter once as first_entry and persist an unambiguous reentry marker", () => {
  const legacy = prepareDesignerAiConversationEntry(null);
  assert.equal(legacy.entryMode, "first_entry");
  assert.equal(legacy.requestState.usage.hasStarted, false);
  assert.equal(legacy.persistedState.usage.hasStarted, true);

  const reopened = prepareDesignerAiConversationEntry(legacy.persistedState);
  assert.equal(reopened.entryMode, "reentry");
  assert.equal(reopened.requestState.usage.hasStarted, true);
  assert.equal(reopened.persistedState.usage.hasStarted, true);
});

function terminalResolution(leaf, status = DESIGNER_AI_LEDGER_STATUSES.RESOLVED_FROM_USER) {
  return {
    leafId: leaf.id,
    status,
    provenance: "user_current_session",
    rule: null,
    fingerprint: leaf.fingerprint,
  };
}

function buildWithResolvedIds(values, predicate, availability = {}) {
  const initial = build({ values, availability });
  return build({
    values,
    availability,
    conversationState: {
      resolutions: initial.leaves.filter(predicate).map((leaf) => terminalResolution(leaf)),
    },
  });
}

test("guided priority is names, structure, data, Gifts, Dress Code, cover and Galleries", () => {
  const values = { ...fixture().values, eventMode: "single" };
  const initial = build({ values });
  assert.equal(buildDesignerAiConversationBrief({ ledger: initial }).nextBlock.id, "names");

  const namesDone = buildWithResolvedIds(values, (leaf) => leaf.id.startsWith("event.people."));
  assert.equal(buildDesignerAiConversationBrief({ ledger: namesDone }).nextBlock.id, "event_structure");

  const eventDone = buildWithResolvedIds(values, (leaf) => (
    leaf.id.startsWith("event.people.") ||
    leaf.id === "event.mode" ||
    leaf.id.startsWith("event.ceremony.")
  ));
  assert.equal(buildDesignerAiConversationBrief({ ledger: eventDone }).nextBlock.id, "gifts");

  const giftsRejected = buildWithResolvedIds(values, (leaf) => (
    leaf.id.startsWith("event.people.") ||
    leaf.id === "event.mode" ||
    leaf.id.startsWith("event.ceremony.") ||
    leaf.id === "gifts.enabled"
  ));
  assert.equal(buildDesignerAiConversationBrief({ ledger: giftsRejected }).nextBlock.id, "dress_code");

  const dressRejected = buildWithResolvedIds(values, (leaf) => (
    leaf.id.startsWith("event.people.") ||
    leaf.id === "event.mode" ||
    leaf.id.startsWith("event.ceremony.") ||
    leaf.id === "gifts.enabled" ||
    leaf.id === "event.dress_code.enabled"
  ));
  assert.equal(buildDesignerAiConversationBrief({ ledger: dressRejected }).nextBlock.id, "cover");

  const coverDone = buildWithResolvedIds(values, (leaf) => (
    leaf.id.startsWith("event.people.") ||
    leaf.id === "event.mode" ||
    leaf.id.startsWith("event.ceremony.") ||
    leaf.id === "gifts.enabled" ||
    leaf.id === "event.dress_code.enabled" ||
    leaf.id === "media.cover"
  ));
  const mediaBrief = buildDesignerAiConversationBrief({ ledger: coverDone });
  assert.equal(mediaBrief.nextBlock.id, "galleries");
  assert.deepEqual(mediaBrief.nextBlock.leafIds, ["media.gallery.gallery-1.guided_completion"]);
});

test("single mode never adds party data to guided flow", () => {
  const values = { ...fixture().values, eventMode: "single" };
  const ledger = buildWithResolvedIds(values, (leaf) => leaf.id === "event.mode");
  assert.equal(
    ledger.guidedFlow.leafIds.some((leafId) => leafId.startsWith("event.party.")),
    false
  );
  assert.equal(
    ledger.leaves.find((leaf) => leaf.id === "event.party.date").status,
    "not_applicable_by_dependency"
  );
});

test("guided completion ignores RSVP, story, Gallery order and empty slots without falsifying them", () => {
  const values = {
    ...fixture().values,
    eventMode: "single",
    galleries: [{ id: "gallery-1", slots: [
      { cellId: "a", index: 0, occupied: true, contentRevision: "photo-a" },
      { cellId: "b", index: 1, occupied: true, contentRevision: "photo-b" },
      { cellId: "c", index: 2, occupied: false, contentRevision: "empty" },
    ] }],
  };
  const initial = build({ values });
  const guidedIds = new Set(initial.guidedFlow.leafIds);
  const ledger = build({
    values,
    conversationState: {
      resolutions: initial.leaves
        .filter((leaf) => guidedIds.has(leaf.id))
        .map((leaf) => terminalResolution(leaf)),
    },
  });
  assert.equal(ledger.guidedFlow.completion.complete, true);
  assert.equal(ledger.completion.complete, false);
  assert.ok(ledger.completion.unresolvedLeafIds.includes("rsvp.enabled"));
  assert.ok(ledger.completion.unresolvedLeafIds.includes("story.text"));
  assert.ok(ledger.completion.unresolvedLeafIds.includes("media.gallery.gallery-1.order"));
  assert.ok(ledger.completion.unresolvedLeafIds.includes("media.gallery.gallery-1.slot.c"));
});

test("non-applicable cover and Galleries are skipped and multiple Galleries stay distinct in canonical order", () => {
  const noMediaValues = { ...fixture().values, eventMode: "single", media: { hasCover: false }, galleries: [] };
  const noMedia = build({
    values: noMediaValues,
    availability: { cover: false, gallery: false },
  });
  assert.equal(noMedia.guidedFlow.leafIds.includes("media.cover"), false);
  assert.equal(noMedia.guidedFlow.leafIds.some((id) => id.startsWith("media.gallery.")), false);

  const noEditableSlots = build({
    values: { ...noMediaValues, galleries: [{ id: "gallery-without-slots", slots: [] }] },
    availability: { cover: false, gallery: true },
  });
  assert.equal(
    noEditableSlots.guidedFlow.leafIds.includes("media.gallery.gallery-without-slots.guided_completion"),
    false
  );

  const multipleValues = {
    ...fixture().values,
    galleries: [
      ...fixture().values.galleries,
      { id: "gallery-2", slots: [
        { cellId: "c", index: 0, occupied: true, contentRevision: "photo-c" },
        { cellId: "d", index: 1, occupied: true, contentRevision: "photo-d" },
      ] },
    ],
  };
  const multiple = build({ values: multipleValues });
  assert.deepEqual(
    multiple.guidedFlow.leafIds.filter((id) => id.startsWith("media.gallery.")),
    [
      "media.gallery.gallery-1.guided_completion",
      "media.gallery.gallery-2.guided_completion",
    ]
  );
});

test("Gallery edits and reordering never complete its guided step without explicit finalization", () => {
  const initialValues = {
    ...fixture().values,
    galleries: [{ id: "gallery-1", slots: [
      { cellId: "a", index: 0, occupied: true, contentRevision: "photo-a" },
      { cellId: "b", index: 1, occupied: true, contentRevision: "photo-b" },
    ] }],
  };
  const initial = build({ values: initialValues });
  const completionLeafId = buildDesignerAiGalleryCompletionLeafId("gallery-1");
  assert.equal(
    initial.leaves.find((leaf) => leaf.id === completionLeafId).status,
    DESIGNER_AI_LEDGER_STATUSES.REQUIRES_CONTROL
  );

  const changedValues = {
    ...initialValues,
    galleries: [{ id: "gallery-1", slots: [
      { cellId: "b", index: 0, occupied: true, contentRevision: "photo-b" },
      { cellId: "a", index: 1, occupied: true, contentRevision: "photo-replaced" },
    ] }],
  };
  const changedWithoutFinish = build({ values: changedValues });
  assert.equal(
    changedWithoutFinish.leaves.find((leaf) => leaf.id === completionLeafId).status,
    DESIGNER_AI_LEDGER_STATUSES.REQUIRES_CONTROL
  );
  assert.ok(changedWithoutFinish.guidedFlow.completion.unresolvedLeafIds.includes(completionLeafId));
});

test("explicit Gallery finalization is durable and advances only to the next real Gallery", () => {
  const values = {
    ...fixture().values,
    eventMode: "single",
    galleries: [
      { id: "gallery-1", slots: [{ cellId: "a", index: 0, occupied: true, contentRevision: "photo-a" }] },
      { id: "gallery-2", slots: [{ cellId: "b", index: 0, occupied: true, contentRevision: "photo-b" }] },
    ],
  };
  const initial = build({ values });
  const firstCompletionId = buildDesignerAiGalleryCompletionLeafId("gallery-1");
  const secondCompletionId = buildDesignerAiGalleryCompletionLeafId("gallery-2");
  const precedingResolutions = initial.leaves
    .filter((leaf) => initial.guidedFlow.leafIds.includes(leaf.id) && !leaf.id.endsWith(".guided_completion"))
    .map((leaf) => terminalResolution(leaf));
  const state = reconcileDesignerAiConversationState({
    snapshot: snapshotFor(initial, values),
    previousState: { resolutions: precedingResolutions },
    controlLeafIds: [firstCompletionId],
  });
  const changedValues = {
    ...values,
    galleries: [
      { id: "gallery-1", slots: [{ cellId: "a", index: 0, occupied: true, contentRevision: "photo-after-finish" }] },
      values.galleries[1],
    ],
  };
  const reopened = build({ values: changedValues, conversationState: state });
  assert.equal(
    reopened.leaves.find((leaf) => leaf.id === firstCompletionId).status,
    DESIGNER_AI_LEDGER_STATUSES.RESOLVED_BY_CONTROL
  );
  assert.equal(
    reopened.leaves.find((leaf) => leaf.id === secondCompletionId).status,
    DESIGNER_AI_LEDGER_STATUSES.REQUIRES_CONTROL
  );
  assert.deepEqual(
    buildDesignerAiConversationBrief({ ledger: reopened }).nextBlock.leafIds,
    [secondCompletionId]
  );
});

test("legacy drafts without explicit Gallery completion remain pending regardless of media fingerprints", () => {
  const values = {
    ...fixture().values,
    galleries: [{ id: "legacy-gallery", slots: [
      { cellId: "legacy-a", index: 0, occupied: true, contentRevision: "heavily-customized-photo" },
    ] }],
  };
  const ledger = build({
    values,
    conversationState: { version: 2, resolutions: [], baseline: [] },
    sourceContext: { templateDerived: false, changedKeys: [] },
  });
  const completionLeafId = buildDesignerAiGalleryCompletionLeafId("legacy-gallery");
  assert.equal(
    ledger.leaves.find((leaf) => leaf.id === completionLeafId).status,
    DESIGNER_AI_LEDGER_STATUSES.REQUIRES_CONTROL
  );
});

test("a multi-action turn maps all mentioned values without aggregate coverage", () => {
  const ids = [
    ...mapDesignerAiActionToLeafIds({ type: "event.set_people", arguments: { primaryName: "Ana", secondaryName: "Luz" } }),
    ...mapDesignerAiActionToLeafIds({ type: "event.set_datetime", arguments: { phase: "ceremony", date: "2027-11-14", startTime: "18:00", endTime: null } }),
    ...mapDesignerAiActionToLeafIds({ type: "event.set_dress_code", arguments: { enabled: true, value: "Elegante sport" } }),
  ];
  assert.deepEqual(ids, [
    "event.people.primary_name",
    "event.people.secondary_name",
    "event.ceremony.date",
    "event.ceremony.start_time",
    "event.dress_code.enabled",
    "event.dress_code.value",
  ]);
});

test("manual location resolves only nonempty values and leaves a missing address pending", () => {
  assert.deepEqual(
    mapDesignerAiActionToLeafIds({
      type: "event.set_location_text",
      arguments: { phase: "ceremony", venueName: "Salón Los Robles", address: "" },
    }),
    ["event.ceremony.venue_name"]
  );
  assert.deepEqual(
    mapDesignerAiActionToLeafIds({
      type: "event.set_location_text",
      arguments: { phase: "party", venueName: "", address: "Ruta 8 km 40" },
    }),
    ["event.party.address"]
  );
});

test("trusted control resolution is recorded only against the reread leaf fingerprint", () => {
  const initial = build();
  const changed = build({
    values: {
      ...fixture().values,
      media: { hasCover: true, contentRevision: "cover-b" },
    },
  });
  const state = reconcileDesignerAiConversationState({
    snapshot: snapshotFor(changed, { ...fixture().values, media: { hasCover: true, contentRevision: "cover-b" } }),
    controlLeafIds: ["media.cover"],
  });
  const resolution = state.resolutions.find((item) => item.leafId === "media.cover");
  assert.equal(resolution.status, "resolved_by_control");
  assert.equal(resolution.fingerprint, changed.leaves.find((leaf) => leaf.id === "media.cover").fingerprint);
  assert.notEqual(resolution.fingerprint, initial.leaves.find((leaf) => leaf.id === "media.cover").fingerprint);
});

function buildCeremonyPartyLocationProgress({
  ceremony,
  party,
  googlePhase = "",
  manualPhase = "",
} = {}) {
  const values = {
    ...fixture().values,
    eventMode: "ceremony_party",
    ceremony: {
      date: "2027-11-14",
      startTime: "18:00",
      endTime: "",
      venueName: "",
      address: "",
      placeSelected: false,
      ...ceremony,
    },
    party: {
      date: "2027-11-14",
      startTime: "21:00",
      endTime: "",
      venueName: "",
      address: "",
      placeSelected: false,
      ...party,
    },
    media: { hasCover: false, contentRevision: "" },
    galleries: [],
  };
  const availability = { cover: false, gallery: false };
  const initial = build({
    values,
    availability,
    sourceContext: { templateDerived: false, changedKeys: [] },
  });
  const byId = new Map(initial.leaves.map((leaf) => [leaf.id, leaf]));
  const resolutions = [
    terminalResolution(byId.get("event.mode")),
    {
      ...terminalResolution(byId.get("event.ceremony.end_time"), DESIGNER_AI_LEDGER_STATUSES.RESOLVED_BY_RULE),
      rule: DESIGNER_AI_RESOLUTION_RULES.OPTIONAL_END_TIME_OMITTED,
      provenance: "automatic_rule",
    },
    {
      ...terminalResolution(byId.get("event.party.end_time"), DESIGNER_AI_LEDGER_STATUSES.RESOLVED_BY_RULE),
      rule: DESIGNER_AI_RESOLUTION_RULES.OPTIONAL_END_TIME_OMITTED,
      provenance: "automatic_rule",
    },
  ];
  if (googlePhase) {
    resolutions.push(terminalResolution(
      byId.get(`event.${googlePhase}.place_selection`),
      DESIGNER_AI_LEDGER_STATUSES.RESOLVED_BY_CONTROL
    ));
  }
  if (manualPhase) {
    resolutions.push({
      ...terminalResolution(
        byId.get(`event.${manualPhase}.place_selection`),
        DESIGNER_AI_LEDGER_STATUSES.RESOLVED_BY_RULE
      ),
      rule: DESIGNER_AI_RESOLUTION_RULES.LEAVE_EMPTY,
      provenance: "automatic_rule",
    });
  }
  return build({
    values,
    availability,
    conversationState: { resolutions },
    sourceContext: { templateDerived: false, changedKeys: [] },
  });
}

test("party Google selection leaves ceremony location pending and blocks Gifts", () => {
  const ledger = buildCeremonyPartyLocationProgress({
    ceremony: {},
    party: {
      venueName: "Estancia La Fiesta",
      address: "Ruta 8 km 40",
      placeSelected: true,
    },
    googlePhase: "party",
  });
  const brief = buildDesignerAiConversationBrief({ ledger });

  assert.equal(ledger.leaves.find((leaf) => leaf.id === "event.party.place_selection").status, "resolved_by_control");
  assert.equal(ledger.leaves.find((leaf) => leaf.id === "event.ceremony.address").status, "pending");
  assert.equal(brief.nextBlock.id, "event_data");
  assert.ok(brief.nextBlock.leafIds.includes("event.ceremony.address"));
  assert.equal(brief.nextBlock.leafIds.some((leafId) => leafId.startsWith("event.party.")), false);
  assert.equal(brief.needsAttention.some((block) => block.id === "gifts"), true);
  assert.equal(ledger.guidedFlow.completion.complete, false);
});

test("ceremony Google selection leaves party location pending and blocks Gifts", () => {
  const ledger = buildCeremonyPartyLocationProgress({
    ceremony: {
      venueName: "Registro Civil",
      address: "Calle 1 123",
      placeSelected: true,
    },
    party: {},
    googlePhase: "ceremony",
  });
  const brief = buildDesignerAiConversationBrief({ ledger });

  assert.equal(ledger.leaves.find((leaf) => leaf.id === "event.ceremony.place_selection").status, "resolved_by_control");
  assert.equal(ledger.leaves.find((leaf) => leaf.id === "event.party.address").status, "pending");
  assert.equal(brief.nextBlock.id, "event_data");
  assert.ok(brief.nextBlock.leafIds.includes("event.party.address"));
  assert.equal(brief.nextBlock.leafIds.some((leafId) => leafId.startsWith("event.ceremony.")), false);
});

test("manual location resolves only its phase and a cancelled control resolves neither phase", () => {
  const manualCeremony = buildCeremonyPartyLocationProgress({
    ceremony: {
      venueName: "Parroquia San José",
      address: "Calle 2 456",
      placeSelected: false,
    },
    party: {},
    manualPhase: "ceremony",
  });
  const manualBrief = buildDesignerAiConversationBrief({ ledger: manualCeremony });
  assert.equal(manualCeremony.leaves.find((leaf) => leaf.id === "event.ceremony.place_selection").status, "resolved_by_rule");
  assert.equal(manualBrief.nextBlock.id, "event_data");
  assert.ok(manualBrief.nextBlock.leafIds.includes("event.party.address"));

  const cancelledParty = buildCeremonyPartyLocationProgress({
    ceremony: {
      venueName: "Parroquia San José",
      address: "Calle 2 456",
      placeSelected: false,
    },
    party: {
      venueName: "Estancia La Fiesta",
      address: "Ruta 8 km 40",
      placeSelected: false,
    },
    manualPhase: "ceremony",
  });
  const cancelledBrief = buildDesignerAiConversationBrief({ ledger: cancelledParty });
  assert.equal(cancelledParty.leaves.find((leaf) => leaf.id === "event.party.place_selection").status, "requires_control");
  assert.equal(cancelledBrief.nextBlock.id, "event_data");
  assert.ok(cancelledBrief.nextBlock.leafIds.includes("event.party.place_selection"));
  assert.notEqual(cancelledBrief.nextBlock.id, "gifts");
});

test("Gifts becomes next only after both applicable locations are resolved", () => {
  const ledger = buildCeremonyPartyLocationProgress({
    ceremony: {
      venueName: "Registro Civil",
      address: "Calle 1 123",
      placeSelected: true,
    },
    party: {
      venueName: "Estancia La Fiesta",
      address: "Ruta 8 km 40",
      placeSelected: false,
    },
    googlePhase: "ceremony",
    manualPhase: "party",
  });
  const brief = buildDesignerAiConversationBrief({ ledger });
  assert.equal(brief.nextBlock.id, "gifts");
  assert.equal(ledger.guidedFlow.completion.unresolvedLeafIds.some((leafId) => (
    leafId.startsWith("event.people.") ||
    leafId === "event.mode" ||
    leafId.startsWith("event.ceremony.") ||
    leafId.startsWith("event.party.")
  )), false);
});
