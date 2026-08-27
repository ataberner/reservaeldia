import test from "node:test";
import assert from "node:assert/strict";
import ledgerRuntime from "./designerAiConversationLedger.js";

const {
  DESIGNER_AI_LEDGER_STATUSES,
  DESIGNER_AI_RESOLUTION_RULES,
  buildAutomaticEventName,
  buildDesignerAiConversationBrief,
  buildDesignerAiLedger,
  mapDesignerAiActionToLeafIds,
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
  assert.equal(brief.nextBlock.id, "couple");
  assert.ok(brief.nextBlock.leafIds.includes("event.people.primary_name"));
  assert.ok(brief.needsAttention.find((block) => block.id === "ceremony").leafIds.length >= 4);
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
