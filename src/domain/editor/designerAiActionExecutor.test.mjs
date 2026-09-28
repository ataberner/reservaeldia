import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import projection from "../../../shared/designerAiActionProjection.cjs";
const { validateDesignerAiModelResult } = createRequire(import.meta.url)("../../../functions/lib/designerAi/service.js");
import { syncEditorSnapshotRenderState } from "../../lib/editorSnapshotAdapter.js";
import { executeDesignerAiActionBatch as executeBatch } from "./designerAiActionExecutor.js";
import { readEditorRenderSnapshot } from "../../lib/editorSnapshotAdapter.js";
import { publishDashboardDocumentNameState } from "../../lib/dashboardDocumentNameBridge.js";

// Existing routing tests now model consuming owners and durable acknowledgements.
// A listener which only records an event no longer qualifies as an applied action.
function installOwners(target) {
  publishDashboardDocumentNameState({ documentId: "A", hydrated: true, editable: true }, target);
  target.addEventListener("dashboard-document-name-update-request", ({ detail }) => {
    detail.onAccepted?.();
    publishDashboardDocumentNameState({ documentId: "A", hydrated: true, editable: true, name: detail.name }, target);
    detail.onPersisted?.({ documentId: "A", name: detail.name });
  });
  for (const [event, key] of [["rsvp-config-update", "rsvp"], ["gift-config-update", "gifts"]]) {
    target.addEventListener(event, ({ detail }) => syncEditorSnapshotRenderState({ ...readEditorRenderSnapshot(target), [key]: detail.config }, target));
  }
  target.addEventListener("insertar-elemento", ({ detail }) => {
    const state = readEditorRenderSnapshot(target);
    syncEditorSnapshotRenderState({ ...state, objetos: [...state.objetos, detail] }, target);
  });
  target.addEventListener("actualizar-elemento", ({ detail }) => {
    const state = readEditorRenderSnapshot(target);
    syncEditorSnapshotRenderState({ ...state, objetos: state.objetos.map((o) => o.id === detail.id ? { ...o, ...detail.cambios } : o) }, target);
  });
  const bridge = target.canvasEditor;
  for (const name of ["updateTemplateAuthoringEventPersonNames", "updateTemplateAuthoringDefault", "updateTemplateFieldValues", "updateTemplateAuthoringEventLocation"]) {
    const original = bridge[name];
    if (!original) continue;
    bridge[name] = async (...args) => {
      await original(...args);
      const authoring = bridge.getTemplateAuthoringSnapshot();
      const values = authoring.defaults;
      if (name === "updateTemplateAuthoringEventPersonNames") Object.assign(values, { event_primary_person_name: args[0].primaryName, event_secondary_person_name: args[0].secondaryName });
      if (name === "updateTemplateAuthoringDefault") values[args[0]] = args[1];
      if (name === "updateTemplateFieldValues") Object.assign(values, args[0]);
      if (name === "updateTemplateAuthoringEventLocation") {
        values.event_ceremony_venue_name = args[0].venueName;
        values.event_ceremony_venue_address = args[0].address;
        const state = readEditorRenderSnapshot(target);
        syncEditorSnapshotRenderState({ ...state, objetos: state.objetos.map((o) => o.tipo === "mapa-google" ? { ...o, googlePlaceId: "", googleDisplayName: "", googleFormattedAddress: "" } : o) }, target);
      }
    };
  }
  bridge.flushPersistenceNow = async () => ({
    ok: true, documentId: "A", persistedState: {
      ...structuredClone(readEditorRenderSnapshot(target)),
      templateAuthoringDraft: structuredClone(bridge.getTemplateAuthoringSnapshot()),
      templateInput: { values: structuredClone(bridge.getTemplateAuthoringSnapshot().defaults) },
    },
  });
}
async function executeDesignerAiActionBatch(actions, options) {
  installOwners(options.targetWindow);
  return executeBatch(actions, { ...options, waitFrame: async () => {}, evidenceAttempts: 2 });
}
import { sanitizeCapabilitySnapshot } from "../../../shared/designerAiCapabilityContract.js";
import { reconcileDesignerAiConversationState } from "../../../shared/designerAiConversationLedger.js";
import { readDesignerAiCapabilitySnapshot } from "./designerAiCapabilities.js";
import { waitForDesignerAiEffect } from "./designerAiActionEvidence.js";
import { matchesDesignerAiActionEvidence } from "../../../shared/designerAiConversationLedger.js";
import { createEditorDocumentOperation } from "../../lib/editorDocumentOperation.js";

const fastEvidence = { waitFrame: async () => {}, evidenceAttempts: 2 };
const enableRsvp = { type: "rsvp.set_enabled", arguments: { enabled: true } };

const recoveryActions = [
  { type: "rsvp.add_option", arguments: { questionId: "attendance", label: "Tal vez" } },
  { type: "rsvp.update_modal", arguments: { title: "Nos vemos", subtitle: null, submitLabel: null, primaryColor: null } },
  { type: "rsvp.set_enabled", arguments: { enabled: true } },
];

async function partialRsvpBatch({ failedIndex = 2 } = {}) {
  const { target } = createRuntime();
  installOwners(target);
  const operation = createEditorDocumentOperation(target);
  const flush = target.canvasEditor.flushPersistenceNow;
  let writes = 0;
  target.canvasEditor.flushPersistenceNow = async () => {
    if (++writes === failedIndex) throw new Error("Synthetic persistence failure");
    return flush();
  };
  const options = () => ({ snapshot: readDesignerAiCapabilitySnapshot(target), targetWindow: target, isSessionCurrent: operation.isCurrent, ...fastEvidence });
  const failed = await executeBatch(recoveryActions, options()).catch((error) => error);
  assert.ok(failed.recovery);
  return { target, operation, failed, options, writes: () => writes };
}

test("H3 A persisted, B write failed, C unexecuted resumes without repeating additive A or optimistic B", async () => {
  const run = await partialRsvpBatch();
  try {
    assert.deepEqual(run.failed.actionResults.map((r) => [r.executed, r.effective, r.persisted]), [[true, true, true], [true, true, false], [false, false, false]]);
    let dispatched = 0;
    run.target.addEventListener("rsvp-config-update", () => dispatched++);
    const result = await executeBatch(recoveryActions, { ...run.options(), recovery: run.failed.recovery });
    const current = readDesignerAiCapabilitySnapshot(run.target);
    assert.equal(current.values.rsvp.questions.find((q) => q.id === "attendance").options.filter((o) => o.label === "Tal vez").length, 1);
    assert.equal(dispatched, 1); // only C; B retries its writer and A is skipped
    assert.equal(run.writes(), 4);
    assert.ok(result.actionResults.every((r) => r.persisted && !r.error));
    const state = reconcileDesignerAiConversationState({ snapshot: current, actionResults: result.actionResults });
    assert.equal(state.resolutions.find((r) => r.leafId === "rsvp.question.attendance.options").status, "resolved_from_user");
    assert.equal(current.values.rsvp.modal.title, "Nos vemos");
  } finally { run.operation.cancel(); }
});

test("H3 an additive action whose own write failed retries persistence without adding twice", async () => {
  const run = await partialRsvpBatch({ failedIndex: 1 });
  try {
    await executeBatch(recoveryActions, { ...run.options(), recovery: run.failed.recovery });
    const options = readDesignerAiCapabilitySnapshot(run.target).values.rsvp.questions.find((q) => q.id === "attendance").options;
    assert.equal(options.filter((o) => o.label === "Tal vez").length, 1);
  } finally { run.operation.cancel(); }
});

for (const change of ["B", "B then A", "manual", "unmount"]) {
  test(`H3 recovery fails closed after ${change}`, async () => {
    const run = await partialRsvpBatch();
    try {
      if (change.startsWith("B")) {
        publishDashboardDocumentNameState({ documentId: "B", hydrated: true, editable: true }, run.target);
        if (change === "B then A") publishDashboardDocumentNameState({ documentId: "A", hydrated: true, editable: true }, run.target);
      } else if (change === "manual") {
        const render = readEditorRenderSnapshot(run.target);
        syncEditorSnapshotRenderState({ ...render, rsvp: { ...render.rsvp, modal: { ...render.rsvp.modal, title: "Manual" } } }, run.target);
      } else run.operation.cancel();
      await assert.rejects(executeBatch(recoveryActions, { ...run.options(), recovery: run.failed.recovery }), (error) => error.code === "designer-ai/recovery-conflict");
      assert.equal(run.writes(), 2);
    } finally { run.operation.cancel(); }
  });
}

test("H3 a new explicit request can legitimately add the same option again", async () => {
  const run = await partialRsvpBatch();
  try {
    // New intent does not supply the recovery record. It is not deduplicated forever.
    await executeBatch([recoveryActions[0]], run.options());
    const options = readDesignerAiCapabilitySnapshot(run.target).values.rsvp.questions.find((q) => q.id === "attendance").options;
    assert.equal(options.filter((o) => o.label === "Tal vez").length, 2);
  } finally { run.operation.cancel(); }
});

test("H4 compound RSVP projection uses the same canonical reducers and ordering as execution", async () => {
  const { target } = createRuntime();
  installOwners(target);
  const initial = readDesignerAiCapabilitySnapshot(target);
  const actions = [
    { type: "rsvp.rename_option", arguments: { questionId: "attendance", optionId: "yes", label: " Voy   seguro " } },
    { type: "rsvp.remove_option", arguments: { questionId: "attendance", optionId: "no" } },
    { type: "rsvp.add_option", arguments: { questionId: "attendance", label: " Quizás " } },
    { type: "rsvp.set_question_active", arguments: { questionId: "dietary_notes", active: true } },
    { type: "rsvp.move_question", arguments: { questionId: "attendance", targetQuestionId: "full_name", placement: "before" } },
    { type: "rsvp.update_modal", arguments: { title: " Confirmá   asistencia ", subtitle: " Nos vemos ", submitLabel: " Enviar ", primaryColor: "#aabbcc" } },
  ];
  const resolution = { leafId: "rsvp.question.attendance.options", status: "resolved_by_rule", rule: "keep_existing" };
  const accepted = validateDesignerAiModelResult({ intent: "apply", assistantMessage: "Aplicado", actions, resolutions: [resolution], controlRequest: null }, initial);
  const projected = projection.projectDesignerAiValues(initial, accepted.actions);
  const result = await executeBatch(accepted.actions, { snapshot: initial, targetWindow: target, ...fastEvidence });
  const current = readDesignerAiCapabilitySnapshot(target);
  assert.deepEqual(current.values.rsvp, projected.rsvp);
  const state = reconcileDesignerAiConversationState({ snapshot: current, actionResults: result.actionResults, resolutions: accepted.resolutions });
  assert.equal(state.resolutions.find((r) => r.leafId === resolution.leafId).rule, "keep_existing");
});

test("H4 Gallery order projection agrees with the real Gallery mutation", async () => {
  const { target } = createRuntime();
  installOwners(target);
  syncEditorSnapshotRenderState({ ...readEditorRenderSnapshot(target), objetos: [{ id: "gallery", tipo: "galeria", rows: 1, cols: 3,
    cells: [{ id: "a", mediaUrl: "synthetic-a" }, { id: "b", mediaUrl: "synthetic-b" }, { id: "c" }] }] }, target);
  const initial = readDesignerAiCapabilitySnapshot(target);
  const actions = [{ type: "gallery.move_photo", arguments: { galleryId: "gallery", sourceCellId: "a", sourceIndex: 0, targetCellId: "c", targetIndex: 2 } }];
  const resolution = { leafId: "media.gallery.gallery.order", status: "resolved_by_rule", rule: "recommended_order" };
  const accepted = validateDesignerAiModelResult({ intent: "apply", assistantMessage: "Aplicado", actions, resolutions: [resolution], controlRequest: null }, initial);
  const predicted = projection.projectDesignerAiValues(initial, accepted.actions);
  const execution = await executeBatch(accepted.actions, { snapshot: initial, targetWindow: target, ...fastEvidence });
  const current = readDesignerAiCapabilitySnapshot(target);
  assert.deepEqual(current.values.galleries, predicted.galleries);
  const state = reconcileDesignerAiConversationState({ snapshot: current, actionResults: execution.actionResults, resolutions: accepted.resolutions });
  assert.equal(state.resolutions.find((r) => r.leafId === resolution.leafId).rule, "recommended_order");
});

for (const [label, actions, leafId, rule, valid] of [
  ["people clears previous valid name", [{ type: "event.set_people", arguments: { primaryName: "", secondaryName: "Luz" } }], "event.people.primary_name", "keep_existing", false],
  ["people becomes valid in this batch", [{ type: "event.set_people", arguments: { primaryName: " Eva ", secondaryName: "Luz" } }], "event.people.primary_name", "keep_existing", true],
  ["custom copy invalidates default", [{ type: "gifts.set_intro_text", arguments: { text: "Texto propio" } }], "gifts.intro_text", "system_default", false],
  ["canonical default copy remains valid", [{ type: "gifts.set_enabled", arguments: { enabled: true } }, { type: "gifts.set_button_text", arguments: { text: "Ver regalos" } }], "gifts.button_text", "system_default", true],
  ["enabling gifts invalidates inactive rule", [{ type: "gifts.set_enabled", arguments: { enabled: true } }], "gifts.intro_text", "preserve_while_inactive", false],
  ["gift method becomes valid", [{ type: "gifts.set_method", arguments: { method: "holder", visible: true, value: " Ana   Perez " } }], "gifts.method.holder.value", "keep_existing", true],
  ["datetime fills missing date", [{ type: "event.set_datetime", arguments: { phase: "ceremony", date: "2027-05-10", startTime: null, endTime: null } }, { type: "event.set_datetime", arguments: { phase: "ceremony", date: null, startTime: "18:00", endTime: null } }], "event.ceremony.date", "keep_existing", true],
  ["datetime invalidates omission", [{ type: "event.set_datetime", arguments: { phase: "ceremony", date: null, startTime: null, endTime: "23:00" } }], "event.ceremony.end_time", "optional_end_time_omitted", false],
  ["location supplies manual address", [{ type: "event.set_location_text", arguments: { phase: "ceremony", venueName: "", address: " Calle Real 123 " } }], "event.ceremony.place_selection", "leave_empty", true],
  ["location clears address", [{ type: "event.set_location_text", arguments: { phase: "ceremony", venueName: "Salon", address: "" } }], "event.ceremony.place_selection", "leave_empty", false],
  ["story emptied cannot be kept", [{ type: "story.set_text", arguments: { text: "" } }], "story.text", "keep_existing", false],
  ["story preserves meaningful whitespace", [{ type: "story.set_text", arguments: { text: " Nuestra historia \n Segunda línea " } }], "story.text", "keep_existing", true],
  ["RSVP label canonicalized", [{ type: "rsvp.update_question", arguments: { questionId: "full_name", label: " Tu   nombre ", required: null, questionType: null } }], "rsvp.question.full_name.label", "keep_existing", true],
]) {
  test(`H4 backend -> execution -> ledger: ${label}`, async () => {
    const { target } = createRuntime();
    const authoring = target.canvasEditor.getTemplateAuthoringSnapshot();
    authoring.fieldsSchema.push(...[
      ["date", "date"], ["start_time", "time"], ["end_time", "time"], ["venue_name", "text"], ["venue_address", "location"],
    ].map(([role, type]) => ({ key: `event_ceremony_${role}`, eventDetailsRole: `ceremony_${role}`, type, applyTargets: [] })));
    Object.assign(authoring.defaults, { event_primary_person_name: "Ana", event_secondary_person_name: "", event_ceremony_venue_address: "Anterior 123", texto_historia: "Nuestra historia" });
    target.canvasEditor.updateTemplateFieldValues = async () => {};
    target.canvasEditor.updateTemplateAuthoringEventLocation = async () => {};
    installOwners(target);
    const initial = readDesignerAiCapabilitySnapshot(target);
    const resolution = { leafId, status: "resolved_by_rule", rule };
    const proposed = { intent: "apply", assistantMessage: "Aplicado", actions, resolutions: [resolution], controlRequest: null };
    if (!valid) {
      assert.throws(() => validateDesignerAiModelResult(proposed, initial), /precondiciones/);
      return;
    }
    const accepted = validateDesignerAiModelResult(proposed, initial);
    const predicted = projection.projectDesignerAiValues(initial, accepted.actions);
    const execution = await executeBatch(accepted.actions, { snapshot: initial, targetWindow: target, ...fastEvidence });
    const current = readDesignerAiCapabilitySnapshot(target);
    for (const domain of ["people", "ceremony", "story", "rsvp"]) assert.deepEqual(current.values[domain], predicted[domain], domain);
    const reconciled = reconcileDesignerAiConversationState({ snapshot: current, actionResults: execution.actionResults, resolutions: accepted.resolutions });
    const entry = reconciled.resolutions.find((r) => r.leafId === leafId);
    assert.equal(entry?.rule, rule);
    const reread = readDesignerAiCapabilitySnapshot(target, { conversationState: reconciled });
    assert.equal(reread.ledger.leaves.find((r) => r.id === leafId).rule, rule);
  });
}

for (const duringWrite of ["unchanged", "false", "false then true"]) {
  test(`H2 receipt credits only the observed RSVP value: ${duringWrite}`, async () => {
    const { target } = createRuntime();
    installOwners(target);
    let release;
    let started;
    const writing = new Promise((resolve) => { started = resolve; });
    const pending = new Promise((resolve) => { release = resolve; });
    const flush = target.canvasEditor.flushPersistenceNow;
    target.canvasEditor.flushPersistenceNow = async () => {
      const receipt = await flush(); // captures true, before the asynchronous write
      started();
      await pending;
      return receipt;
    };
    const execution = executeBatch([enableRsvp], { snapshot: readDesignerAiCapabilitySnapshot(target), targetWindow: target, ...fastEvidence }).catch((error) => error);
    await writing;
    if (duringWrite !== "unchanged") {
      const render = readEditorRenderSnapshot(target);
      syncEditorSnapshotRenderState({ ...render, rsvp: { ...render.rsvp, enabled: false } }, target);
      if (duringWrite === "false then true") syncEditorSnapshotRenderState(render, target);
    }
    release();
    const result = await execution;
    const current = readDesignerAiCapabilitySnapshot(target);
    const state = reconcileDesignerAiConversationState({ snapshot: current, actionResults: result.actionResults });
    assert.equal(state.resolutions.find((r) => r.leafId === "rsvp.enabled").status,
      duringWrite === "false" ? "needs_clarification" : "resolved_from_user");
    assert.equal(result.actionResults[0].persisted, true);
    if (duringWrite === "false") assert.equal(result.code, "designer-ai/evidence-conflict");
  });
}

test("H2 consecutive same-leaf actions credit the final receipt, not an earlier value", async () => {
  const { target } = createRuntime();
  const result = await executeDesignerAiActionBatch([enableRsvp, { ...enableRsvp, arguments: { enabled: false } }], { snapshot: readDesignerAiCapabilitySnapshot(target), targetWindow: target });
  const current = readDesignerAiCapabilitySnapshot(target);
  assert.equal(matchesDesignerAiActionEvidence(result.actionResults[0].action, result.actionResults[0].evidence, current), false);
  assert.equal(matchesDesignerAiActionEvidence(result.actionResults[1].action, result.actionResults[1].evidence, current), true);
  const state = reconcileDesignerAiConversationState({ snapshot: current, actionResults: result.actionResults });
  assert.equal(state.resolutions.find((r) => r.leafId === "rsvp.enabled").status, "resolved_from_user");
});

test("H2 a receipt cannot be reused for another action, leaf or document", async () => {
  const { target } = createRuntime();
  const result = await executeDesignerAiActionBatch([enableRsvp], { snapshot: readDesignerAiCapabilitySnapshot(target), targetWindow: target });
  const receipt = result.actionResults[0];
  const current = readDesignerAiCapabilitySnapshot(target);
  assert.equal(matchesDesignerAiActionEvidence({ ...enableRsvp, arguments: { enabled: false } }, receipt.evidence, current), false);
  assert.equal(matchesDesignerAiActionEvidence(enableRsvp, receipt.evidence, current, "gifts.enabled"), false);
  assert.equal(matchesDesignerAiActionEvidence(enableRsvp, receipt.evidence, { ...current, documentIdentity: "draft:B" }), false);
});

test("H2 sensitive evidence stores fingerprints and is excluded from provider context", async () => {
  const { target } = createRuntime();
  const secret = "SECRET_ALIAS_TEST_93841";
  const result = await executeDesignerAiActionBatch([{ type: "gifts.set_method", arguments: { method: "alias", value: secret, visible: false } }], { snapshot: readDesignerAiCapabilitySnapshot(target), targetWindow: target });
  assert.equal(JSON.stringify(result.actionResults[0].evidence).includes(secret), false);
  const snapshot = readDesignerAiCapabilitySnapshot(target);
  const state = reconcileDesignerAiConversationState({ snapshot, actionResults: result.actionResults });
  assert.equal(JSON.stringify(state).includes(secret), false);
  const { buildDesignerAiCallablePayload } = await import("./designerAiCapabilities.js");
  assert.equal(JSON.stringify(buildDesignerAiCallablePayload({ message: "Continuar", snapshot })).includes(secret), false);
});

for (const [method, input, accepted] of [
  ["giftListLink", "https://example.test/", "https://example.test/"],
  ["giftListLink", "https://example.test", "https://example.test/"],
  ["holder", " Ana   Perez ", "Ana Perez"],
  ["alias", "ANA.PEREZ", "ANA.PEREZ"],
]) {
  test(`H1 ${method}: canonical ${JSON.stringify(input)} is effective, persisted and continues the batch`, async () => {
    const { target } = createRuntime();
    installOwners(target);
    const written = [];
    const flush = target.canvasEditor.flushPersistenceNow;
    target.canvasEditor.flushPersistenceNow = async () => {
      const receipt = await flush();
      written.push(receipt.persistedState);
      return receipt;
    };
    const result = await executeBatch([
      { type: "gifts.set_method", arguments: { method, value: input, visible: true } },
      { type: "gifts.set_intro_text", arguments: { text: "Gracias por compartir" } },
    ], { snapshot: readDesignerAiCapabilitySnapshot(target), targetWindow: target, ...fastEvidence });
    assert.deepEqual(result.actionResults.map((r) => [r.effective, r.persisted]), [[true, true], [true, true]]);
    assert.equal(method === "giftListLink" ? written[0].gifts.giftListUrl : written[0].gifts.bank[method], accepted);
    assert.equal(written[1].gifts.introText, "Gracias por compartir");
  });
}

test("H1 a rejected URL cannot become a successful empty value", async () => {
  const { target } = createRuntime();
  installOwners(target);
  await assert.rejects(executeBatch([
    { type: "gifts.set_method", arguments: { method: "giftListLink", value: "not a url", visible: true } },
    { type: "gifts.set_intro_text", arguments: { text: "No ejecutar" } },
  ], { snapshot: readDesignerAiCapabilitySnapshot(target), targetWindow: target, ...fastEvidence }), (error) => {
    assert.equal(error.actionResults[0].effective, false);
    assert.equal(error.actionResults[0].persisted, false);
    assert.equal(error.actionResults[1].executed, false);
    return true;
  });
});

test("an optimistic effect must survive the commit boundary before flushing", async () => {
  let effective = true;
  await assert.rejects(waitForDesignerAiEffect(() => effective, {
    isSessionCurrent: () => true, attempts: 2,
    waitFrame: async () => { effective = false; },
  }), /efecto solicitado/);
});

test("date then time in one batch preserves the effective new date and unrequested end time", async () => {
  const { target } = createRuntime();
  const authoring = target.canvasEditor.getTemplateAuthoringSnapshot();
  authoring.fieldsSchema.push(
    { key: "event_ceremony_date", type: "date", eventDetailsRole: "ceremony_date", applyTargets: [] },
    { key: "event_ceremony_start_time", type: "time", eventDetailsRole: "ceremony_start_time", applyTargets: [] },
    { key: "event_ceremony_end_time", type: "time", eventDetailsRole: "ceremony_end_time", applyTargets: [] },
  );
  Object.assign(authoring.defaults, { event_ceremony_date: "2027-04-01", event_ceremony_start_time: "17:00", event_ceremony_end_time: "22:00" });
  const patches = [];
  target.canvasEditor.updateTemplateFieldValues = async (patch) => patches.push(patch);
  const current = readDesignerAiCapabilitySnapshot(target);
  await executeDesignerAiActionBatch([
    { type: "event.set_datetime", arguments: { phase: "ceremony", date: "2027-05-10", startTime: null, endTime: null } },
    { type: "event.set_datetime", arguments: { phase: "ceremony", date: null, startTime: "18:00", endTime: null } },
  ], { snapshot: current, targetWindow: target });
  assert.deepEqual(patches, [{ event_ceremony_date: "2027-05-10" }, { event_ceremony_start_time: "18:00" }]);
  assert.deepEqual(readDesignerAiCapabilitySnapshot(target).values.ceremony, { date: "2027-05-10", startTime: "18:00", endTime: "22:00", venueName: "", address: "", placeSelected: false });
});

test("an event without a consumer is executed but has no effective or persisted receipt", async () => {
  const { target } = createRuntime();
  await assert.rejects(executeBatch([enableRsvp], { snapshot: snapshot(), targetWindow: target, ...fastEvidence }), (error) => {
    assert.equal(error.code, "designer-ai/evidence-missing");
    assert.deepEqual(error.actionResults.map(({ executed, effective, persisted }) => ({ executed, effective, persisted })), [{ executed: true, effective: false, persisted: false }]);
    assert.deepEqual(error.appliedActions, []);
    return true;
  });
});

test("an unrelated local change does not confirm the requested people values", async () => {
  const { target } = createRuntime();
  installOwners(target);
  target.canvasEditor.updateTemplateAuthoringEventPersonNames = async () => {
    target.canvasEditor.getTemplateAuthoringSnapshot().defaults.event_primary_person_name = "Otro";
  };
  await assert.rejects(executeBatch([{ type: "event.set_people", arguments: { primaryName: "Ana", secondaryName: "Luz" } }], { snapshot: snapshot(), targetWindow: target, ...fastEvidence }), /efecto solicitado/);
});

for (const failure of ["write rejected", "wrong durable payload"]) {
  test(`local success with ${failure} remains effective but not persisted or terminal`, async () => {
    const { target } = createRuntime();
    installOwners(target);
    const flush = target.canvasEditor.flushPersistenceNow;
    target.canvasEditor.flushPersistenceNow = async () => {
      if (failure === "write rejected") return { ok: false };
      const receipt = await flush();
      receipt.persistedState.rsvp.enabled = false;
      return receipt;
    };
    await assert.rejects(executeBatch([enableRsvp], { snapshot: snapshot(), targetWindow: target, ...fastEvidence }), (error) => {
      assert.equal(error.actionResults[0].effective, true);
      assert.equal(error.actionResults[0].persisted, false);
      const state = reconcileDesignerAiConversationState({ snapshot: readDesignerAiCapabilitySnapshot(target), actionResults: error.actionResults, resolutions: [{ leafId: "rsvp.enabled", status: "resolved_from_user", rule: null }] });
      assert.equal(state.resolutions.find((r) => r.leafId === "rsvp.enabled")?.status, "needs_clarification");
      const reread = readDesignerAiCapabilitySnapshot(target, { conversationState: state });
      assert.equal(reread.ledger.leaves.find((r) => r.id === "rsvp.enabled").status, "needs_clarification");
      return true;
    });
  });
}

test("A confirmed, B failed, C unexecuted returns recoverable per-action evidence", async () => {
  const { target } = createRuntime();
  installOwners(target);
  const dispatch = target.dispatchEvent.bind(target);
  target.dispatchEvent = (event) => {
    if (event.type === "gift-config-update") throw new Error("owner failed");
    return dispatch(event);
  };
  await assert.rejects(executeBatch([enableRsvp,
    { type: "gifts.set_enabled", arguments: { enabled: true } },
    { type: "gifts.set_intro_text", arguments: { text: "Gracias" } },
  ], { snapshot: snapshot(), targetWindow: target, ...fastEvidence }), (error) => {
    assert.deepEqual(error.actionResults.map((r) => [r.executed, r.effective, r.persisted]), [[true, true, true], [true, false, false], [false, false, false]]);
    const state = reconcileDesignerAiConversationState({ snapshot: readDesignerAiCapabilitySnapshot(target), actionResults: error.actionResults });
    assert.deepEqual(state.resolutions.map((r) => [r.leafId, r.status]), [["rsvp.enabled", "resolved_from_user"], ["gifts.enabled", "needs_clarification"]]);
    return true;
  });
});

test("a name dispatch without its owner cannot confirm persistence", async () => {
  const { target } = createRuntime();
  await assert.rejects(executeBatch([{ type: "document.set_name", arguments: { name: "Nuestra boda" } }], { snapshot: snapshot(), targetWindow: target, ...fastEvidence }));
});

test("unverified action proposals do not resolve ledger leaves", () => {
  const { target } = createRuntime();
  const state = reconcileDesignerAiConversationState({ snapshot: readDesignerAiCapabilitySnapshot(target), actions: [enableRsvp], resolutions: [{ leafId: "rsvp.enabled", status: "resolved_from_user", rule: null }] });
  assert.deepEqual(state.resolutions, []);
});

for (const [label, selected] of [
  ["alias only", { alias: "ANA.LUZ" }],
  ["external list only", { giftListLink: "https://example.test/lista" }],
  ["multiple methods", { alias: "ANA.LUZ", holder: "Ana", giftListLink: "https://example.test/lista" }],
]) {
  test(`Gifts ${label}: hides unconfirmed inherited methods, preserves values and asks no optional copies`, async () => {
    const { target } = createRuntime();
    const methods = ["holder", "bank", "alias", "cbu", "cuit", "giftListLink"];
    syncEditorSnapshotRenderState({ ...readEditorRenderSnapshot(target), gifts: {
      enabled: false, bank: { holder: "Heredado", bank: "Banco heredado", alias: "HEREDADO", cbu: "123456", cuit: "654321" },
      visibility: Object.fromEntries(methods.map((key) => [key, true])), giftListUrl: "https://example.test/heredada",
    } }, target);
    const actions = [{ type: "gifts.set_enabled", arguments: { enabled: true } }, ...Object.entries(selected).map(([method, value]) => ({ type: "gifts.set_method", arguments: { method, value, visible: true } }))];
    const execution = await executeDesignerAiActionBatch(actions, { snapshot: readDesignerAiCapabilitySnapshot(target), targetWindow: target });
    const config = readEditorRenderSnapshot(target).gifts;
    for (const method of methods) assert.equal(config.visibility[method], Object.hasOwn(selected, method));
    assert.equal(config.bank.cbu, "123456");
    const effective = readDesignerAiCapabilitySnapshot(target);
    const conversationState = reconcileDesignerAiConversationState({ snapshot: effective, actionResults: execution.actionResults });
    const final = readDesignerAiCapabilitySnapshot(target, { conversationState });
    assert.deepEqual(final.ledger.guidedFlow.completion.unresolvedLeafIds.filter((id) => id.startsWith("gifts.")), []);
    assert.equal(final.ledger.guidedFlow.leafIds.includes("gifts.intro_text"), false);
    assert.equal(final.ledger.guidedFlow.leafIds.includes("gifts.button_text"), false);
    assert.equal(final.ledger.guidedFlow.leafIds.includes("gifts.method.cbu.value"), false);
  });
}

test("Gifts explicitly selected empty method remains pending, hidden data does not", async () => {
  const { target } = createRuntime();
  const actions = [{ type: "gifts.set_enabled", arguments: { enabled: true } }, { type: "gifts.set_method", arguments: { method: "alias", value: null, visible: true } }];
  const execution = await executeDesignerAiActionBatch(actions, { snapshot: readDesignerAiCapabilitySnapshot(target), targetWindow: target });
  const current = readDesignerAiCapabilitySnapshot(target);
  const conversationState = reconcileDesignerAiConversationState({ snapshot: current, actionResults: execution.actionResults });
  const pending = readDesignerAiCapabilitySnapshot(target, { conversationState }).ledger.guidedFlow.completion.unresolvedLeafIds;
  assert.equal(pending.includes("gifts.method.alias.value"), true);
  assert.equal(pending.some((id) => /gifts\.method\.(cbu|cuit|bank|holder|giftListLink)/.test(id)), false);
});

class TestCustomEvent extends Event {
  constructor(type, options = {}) {
    super(type);
    this.detail = options.detail;
  }
}

function createRuntime() {
  const target = new EventTarget();
  target.CustomEvent = TestCustomEvent;
  target.Event = Event;
  const calls = [];
  const authoring = {
    fieldsSchema: [
      { key: "event_primary_person_name", eventDetailsRole: "primary_person_name", type: "text", applyTargets: [] },
      { key: "event_secondary_person_name", eventDetailsRole: "secondary_person_name", type: "text", applyTargets: [] },
      { key: "texto_historia", type: "textarea", applyTargets: [{ scope: "objeto", id: "story", path: "texto" }] },
    ],
    defaults: {},
  };
  target.canvasEditor = {
    getTemplateAuthoringSnapshot: () => authoring,
    updateTemplateAuthoringEventPersonNames: async (value) => calls.push(["people", value]),
    updateTemplateAuthoringDefault: async (...args) => calls.push(["default", ...args]),
  };
  syncEditorSnapshotRenderState({
    objetos: [{ id: "story", tipo: "texto", texto: "Anterior" }],
    secciones: [],
    rsvp: { enabled: false },
    gifts: { enabled: false },
    eventDetails: { mode: "single" },
  }, target);
  return { target, calls };
}

function snapshot() {
  return sanitizeCapabilitySnapshot({
    revision: "rev-1",
    availability: {
      documentName: true,
      people: true,
      eventMode: true,
      ceremonyDatetime: false,
      partyDatetime: false,
      ceremonyLocation: false,
      partyLocation: false,
      dressCode: false,
      story: true,
      cover: false,
      gallery: false,
      rsvp: true,
      gifts: true,
    },
    values: {
      rsvp: { questions: [] },
      gifts: { enabled: false },
    },
  });
}

test("applies shared document, people and story owners without generic setters", async () => {
  const { target, calls } = createRuntime();
  const documentUpdates = [];
  target.addEventListener("dashboard-document-name-update-request", (event) => documentUpdates.push(event.detail));

  const result = await executeDesignerAiActionBatch([
    { type: "document.set_name", arguments: { name: "Boda de Ana y Luz" } },
    { type: "event.set_people", arguments: { primaryName: "Ana", secondaryName: "Luz" } },
    { type: "story.set_text", arguments: { text: "Nos conocimos en otoño." } },
  ], { snapshot: snapshot(), targetWindow: target });

  assert.deepEqual(result.appliedActions, ["document.set_name", "event.set_people", "story.set_text"]);
  assert.deepEqual(documentUpdates.map(({ onAccepted, onPersisted, onPersistenceError, expectedDocumentId, ...detail }) => detail), [{
    hasName: true,
    name: "Boda de Ana y Luz",
    persist: true,
    source: "designer-ai",
    designerAiConversation: null,
  }]);
  assert.deepEqual(calls[0], ["people", { primaryName: "Ana", secondaryName: "Luz" }]);
  assert.deepEqual(calls[1], ["default", "texto_historia", "Nos conocimos en otoño.", { applyTargets: true }]);
  assert.equal("setObjetos" in target.canvasEditor, false);
});

test("prevalidation is atomic and rejects an out-of-allowlist action before dispatch", async () => {
  const { target, calls } = createRuntime();
  let events = 0;
  target.addEventListener("dashboard-document-name-update-request", () => events += 1);

  await assert.rejects(
    executeDesignerAiActionBatch([
      { type: "document.set_name", arguments: { name: "Nombre válido" } },
      { type: "canvas.update_object", arguments: { id: "x", x: 40 } },
    ], { snapshot: snapshot(), targetWindow: target }),
    (error) => error.code === "designer-ai/prevalidation-failed"
  );
  assert.equal(events, 0);
  assert.deepEqual(calls, []);
});

test("stale draft identity cancels the batch before the first mutation", async () => {
  const { target, calls } = createRuntime();
  await assert.rejects(
    executeDesignerAiActionBatch([
      { type: "story.set_text", arguments: { text: "No aplicar" } },
    ], {
      snapshot: snapshot(),
      targetWindow: target,
      isSessionCurrent: () => false,
    }),
    (error) => error.code === "designer-ai/stale-session"
  );
  assert.deepEqual(calls, []);
});

test("event datetime delegates countdown projection to the authoring value owner", async () => {
  const target = new EventTarget();
  target.CustomEvent = TestCustomEvent;
  target.Event = Event;
  const calls = [];
  const updates = [];
  const authoring = {
    fieldsSchema: [
      { key: "event_ceremony_date", eventDetailsRole: "ceremony_date", type: "date", applyTargets: [{ scope: "objeto", id: "countdown", path: "fechaObjetivo" }] },
      { key: "event_ceremony_start_time", eventDetailsRole: "ceremony_start_time", type: "time", applyTargets: [] },
      { key: "event_ceremony_end_time", eventDetailsRole: "ceremony_end_time", type: "time", applyTargets: [] },
    ],
    defaults: {},
  };
  target.canvasEditor = {
    getTemplateAuthoringSnapshot: () => authoring,
    updateTemplateFieldValues: async (...args) => calls.push(["values", ...args]),
  };
  target.addEventListener("actualizar-elemento", (event) => updates.push(event.detail));
  syncEditorSnapshotRenderState({
    objetos: [{ id: "countdown", tipo: "countdown", fechaObjetivo: "" }],
    secciones: [],
    eventDetails: { mode: "single" },
  }, target);
  const current = sanitizeCapabilitySnapshot({
    revision: "date-rev",
    availability: { ceremonyDatetime: true },
    values: { eventMode: "single", ceremony: { date: "", startTime: "", endTime: "" } },
  });

  await executeDesignerAiActionBatch([
    { type: "event.set_datetime", arguments: { phase: "ceremony", date: "2027-04-10", startTime: "18:30", endTime: "23:45" } },
  ], { snapshot: current, targetWindow: target });

  assert.deepEqual(calls, [[
    "values",
    {
      event_ceremony_date: "2027-04-10",
      event_ceremony_start_time: "18:30",
      event_ceremony_end_time: "23:45",
    },
    {
      applyTargets: true,
      reason: "designer-ai-event-datetime",
    },
  ]]);
  assert.deepEqual(updates, []);
});

test("manual event location delegates map clearing to the shared atomic owner", async () => {
  const target = new EventTarget();
  target.CustomEvent = TestCustomEvent;
  target.Event = Event;
  const calls = [];
  const updates = [];
  const authoring = {
    fieldsSchema: [
      { key: "event_ceremony_venue_name", eventDetailsRole: "ceremony_venue_name", type: "text", applyTargets: [] },
      { key: "event_ceremony_venue_address", eventDetailsRole: "ceremony_venue_address", type: "location", applyTargets: [] },
    ],
    defaults: {
      event_ceremony_venue_name: "Anterior",
      event_ceremony_venue_address: "Dirección anterior",
    },
  };
  target.canvasEditor = {
    getTemplateAuthoringSnapshot: () => authoring,
    updateTemplateAuthoringEventLocation: async (...args) => calls.push(args),
  };
  target.addEventListener("actualizar-elemento", (event) => updates.push(event.detail));
  syncEditorSnapshotRenderState({
    objetos: [{
      id: "map-ceremony",
      tipo: "mapa-google",
      eventDetailsFeature: "ceremony",
      googlePlaceId: "old-place",
      googleDisplayName: "Anterior",
      googleFormattedAddress: "Dirección anterior",
      mostrarMapa: true,
    }],
    secciones: [],
    eventDetails: { mode: "single" },
  }, target);
  const current = sanitizeCapabilitySnapshot({
    revision: "location-rev",
    availability: { ceremonyLocation: true },
    values: {
      eventMode: "single",
      ceremony: { venueName: "Anterior", address: "Dirección anterior", placeSelected: true },
    },
  });

  await executeDesignerAiActionBatch([{
    type: "event.set_location_text",
    arguments: {
      phase: "ceremony",
      venueName: "Salón Los Robles",
      address: "Av. Ejemplo 1234",
    },
  }], { snapshot: current, targetWindow: target });

  assert.equal(calls.length, 1);
  assert.equal(calls[0][0].venueName, "Salón Los Robles");
  assert.equal(calls[0][0].address, "Av. Ejemplo 1234");
  assert.equal(calls[0][0].googlePlaceId, "");
  assert.deepEqual(calls[0][1], { feature: "ceremony" });
  assert.deepEqual(updates, []);
});

test("Gallery, RSVP and Gifts delegate to existing mutation/config/CTA events", async () => {
  const target = new EventTarget();
  target.CustomEvent = TestCustomEvent;
  target.Event = Event;
  target.canvasEditor = { getTemplateAuthoringSnapshot: () => ({ fieldsSchema: [], defaults: {} }) };
  const events = [];
  for (const name of ["actualizar-elemento", "insertar-elemento", "rsvp-config-update", "gift-config-update"]) {
    target.addEventListener(name, (event) => events.push([name, event.detail]));
  }
  syncEditorSnapshotRenderState({
    objetos: [{
      id: "gallery",
      tipo: "galeria",
      rows: 1,
      cols: 2,
      cells: [{ id: "a", mediaUrl: "https://not-sent.example/a" }, { id: "b" }],
    }],
    secciones: [],
    rsvp: { enabled: false },
    gifts: { enabled: false },
  }, target);
  const current = sanitizeCapabilitySnapshot({
    revision: "config-rev",
    availability: { gallery: true, rsvp: true, gifts: true },
    values: {
      galleries: [{ id: "gallery", slots: [{ cellId: "a", index: 0, occupied: true }, { cellId: "b", index: 1, occupied: false }] }],
      rsvp: { enabled: false, questions: [] },
      gifts: { enabled: false, buttonText: "" },
    },
  });

  await executeDesignerAiActionBatch([
    { type: "gallery.move_photo", arguments: { galleryId: "gallery", sourceCellId: "a", sourceIndex: 0, targetCellId: "b", targetIndex: 1 } },
    { type: "rsvp.set_enabled", arguments: { enabled: true } },
    { type: "gifts.set_enabled", arguments: { enabled: true } },
    { type: "gifts.set_button_text", arguments: { text: "Ver nuestra lista" } },
  ], { snapshot: current, targetWindow: target });

  assert.equal(events.some(([name, detail]) => name === "actualizar-elemento" && detail.id === "gallery"), true);
  assert.equal(events.some(([name, detail]) => name === "rsvp-config-update" && detail.config.enabled), true);
  assert.equal(events.some(([name, detail]) => name === "gift-config-update" && detail.config.enabled), true);
  assert.equal(events.some(([name, detail]) => name === "insertar-elemento" && detail.tipo === "rsvp-boton"), true);
  assert.equal(readEditorRenderSnapshot(target).objetos.find((o) => o.tipo === "regalo-boton").texto, "Ver nuestra lista");
});

test("reports config actions already reflected when a later owner fails", async () => {
  const { target } = createRuntime();
  const dispatched = [];
  const dispatch = target.dispatchEvent.bind(target);
  target.dispatchEvent = (event) => {
    dispatched.push(event.type);
    if (event.type === "gift-config-update") throw new Error("gift runtime failed");
    return dispatch(event);
  };
  const current = sanitizeCapabilitySnapshot({
    revision: "partial-config-rev",
    availability: { rsvp: true, gifts: true },
    values: {
      rsvp: { enabled: false, questions: [] },
      gifts: { enabled: false, buttonText: "" },
    },
  });

  await assert.rejects(
    executeDesignerAiActionBatch([
      { type: "rsvp.set_enabled", arguments: { enabled: true } },
      { type: "gifts.set_enabled", arguments: { enabled: true } },
    ], { snapshot: current, targetWindow: target }),
    (error) => {
      assert.deepEqual(error.appliedActions, ["rsvp.set_enabled"]);
      return true;
    }
  );
  assert.deepEqual(dispatched.filter((name) => name !== "dashboard-document-name-state-change").slice(0, 3), [
    "rsvp-config-update",
    "insertar-elemento",
    "gift-config-update",
  ]);
});
