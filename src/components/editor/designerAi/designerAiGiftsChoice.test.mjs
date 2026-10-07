import test from "node:test";
import assert from "node:assert/strict";
import { mountPanel, capabilities, ledger } from "./testSupport/panelHarness.mjs";

const enable = { type: "gifts.set_enabled", arguments: { enabled: true } };
const method = (name, value) => ({ type: "gifts.set_method", arguments: { method: name, value, visible: true } });
const marker = (group) => ({ leafId: `gifts.${group}`, status: "needs_clarification", rule: null });
const choose = (...groups) => ({ actions: [enable], resolutions: groups.map(marker), assistantMessage: "Listo. ¿Lista externa o datos bancarios?" });
const questions = {
  bank_details: "Pasame los datos bancarios que quieran mostrar. Con un alias alcanza.",
  external_list: "Pasame el enlace de la lista de regalos.",
};
const sampleBank = { holder: "Titular de muestra", bank: "Banco de muestra", alias: "ALIAS.MUESTRA", cbu: "CBU-MUESTRA", cuit: "CUIT-MUESTRA" };
const sampleUrl = "https://example.test/lista-muestra";
const selectedGroups = (saved) => saved.conversation.resolutions
  .filter(item => ["gifts.bank_details", "gifts.external_list"].includes(item.leafId))
  .map(item => item.leafId).sort();

function draft({ enabled = false } = {}) {
  const value = { sourceContext: { templateDerived: true, changedKeys: [] }, authoring: { fieldsSchema: [], defaults: {} },
    render: { objetos: [{ id: "synthetic-gallery", tipo: "galeria", rows: 1, cols: 1,
      cells: [{ id: "photo", mediaUrl: "https://example.test/photo.jpg" }] }], secciones: [],
      eventDetails: { mode: "single" }, rsvp: { enabled: false },
      gifts: { enabled, bank: { ...sampleBank }, giftListUrl: sampleUrl,
        visibility: Object.fromEntries([...Object.keys(sampleBank), "giftListLink"].map(key => [key, true])) } } };
  const snapshot = capabilities.buildDesignerAiCapabilitySnapshot({ authoringSnapshot: value.authoring,
    renderSnapshot: value.render, sourceContext: value.sourceContext });
  value.conversation = { resolutions: snapshot.ledger.leaves.filter(leaf =>
    snapshot.ledger.guidedFlow.leafIds.includes(leaf.id) && leaf.block !== "galleries" && !leaf.id.startsWith("gifts."))
    .map(leaf => ({ leafId: leaf.id, fingerprint: leaf.fingerprint, status: "resolved_from_user", provenance: "user_current_session", rule: null })) };
  return value;
}

function assertQuestion(run, group) {
  assert.notEqual(run.messages().at(-1).intent, "error");
  assert.equal(ledger.buildDesignerAiConversationBrief(run.snapshot()).nextStep.kind,
    group === "bank_details" ? "gift_bank_details" : "gift_external_list");
  assert.ok(run.messages().at(-1).content.endsWith(questions[group]), run.messages().at(-1).content);
  assert.doesNotMatch(run.messages().at(-1).content, /lista externa.*datos bancarios/);
  assert.equal(run.snapshot().ledger.guidedFlow.completion.complete, false);
}

function assertSamplesConservedAndHidden(run) {
  const config = run.exportPersistedDraft().render.gifts;
  assert.deepEqual(config.bank, sampleBank);
  assert.equal(config.giftListUrl, sampleUrl);
  assert.equal(Object.values(config.visibility).some(Boolean), false);
  const payload = capabilities.buildDesignerAiCallablePayload({ snapshot: run.snapshot(), message: "Seguimos.", clientMessageId: "synthetic-gifts-followup" });
  for (const value of [...Object.values(sampleBank), sampleUrl]) assert.equal(JSON.stringify(payload).includes(value), false);
}

for (const [group, field, value, userData] of [
  ["bank_details", "alias", "ALIAS.ELEGIDO", "El alias es ALIAS.ELEGIDO."],
  ["bank_details", "holder", "Ana Prueba", "Quiero mostrar sólo el titular Ana Prueba."],
  ["external_list", "giftListLink", "https://example.test/lista-elegida", "La lista está en https://example.test/lista-elegida"],
]) {
  test(`${group} survives reentry without exposing samples and completes with only ${field}`, async () => {
    let run = await mountPanel({ savedDraft: draft(), respond: (_, index) => index === 1
      ? { assistantMessage: "Hola." } : choose(group) });
    try {
      await run.until(() => run.messages().length === 1);
      await run.send(group === "bank_details" ? "datos bancarios" : "una lista externa");
      assertQuestion(run, group);
      assertSamplesConservedAndHidden(run);
      assert.equal(run.writes.length, 1);
      const saved = run.exportPersistedDraft();
      assert.deepEqual(selectedGroups(saved), [`gifts.${group}`]);
      await run.close(); run = null;
      run = await mountPanel({ savedDraft: saved, respond: (_, index) => index === 1
        ? { assistantMessage: "Seguimos." }
        : { actions: [method(field, value)], assistantMessage: "Guardado." } });
      await run.until(() => run.messages().length === 1);
      assertQuestion(run, group);
      assertSamplesConservedAndHidden(run);
      assert.equal(run.writes.length, 0, "reentry does not replay the selection or expose sample values");
      await run.send(userData);
      assert.notEqual(run.messages().at(-1).intent, "error");
      assert.equal(ledger.buildDesignerAiConversationBrief(run.snapshot()).nextStep.kind, "gallery");
      assert.equal(run.writes.length, 1);
      const final = run.exportPersistedDraft().render.gifts;
      assert.equal(field === "giftListLink" ? final.giftListUrl : final.bank[field], value);
      assert.deepEqual(Object.keys(final.visibility).filter(key => final.visibility[key]), [field]);
      for (const key of Object.keys(sampleBank).filter(key => key !== field)) assert.equal(final.bank[key], sampleBank[key]);
      assert.doesNotMatch(run.messages().at(-1).content, /Pasame .*alias|Pasame .*enlace|datos bancarios/);
    } finally { await run?.close(); }
  });
}

test("an explicit combination waits for the external list after the first complete bank datum", async () => {
  let run = await mountPanel({ savedDraft: draft(), respond: (_, index) => index === 1
    ? { assistantMessage: "Hola." } : index === 2 ? choose("bank_details", "external_list")
    : { actions: [method("alias", "ALIAS.ELEGIDO")], assistantMessage: "Guardado." } });
  try {
    await run.until(() => run.messages().length === 1);
    await run.send("Queremos datos bancarios y una lista externa.");
    assertQuestion(run, "bank_details");
    assertSamplesConservedAndHidden(run);
    await run.send("El alias es ALIAS.ELEGIDO.");
    assertQuestion(run, "external_list");
    const partial = run.exportPersistedDraft();
    assert.equal(partial.render.gifts.visibility.alias, true);
    assert.equal(partial.render.gifts.visibility.giftListLink, false);
    assert.equal(partial.render.gifts.giftListUrl, sampleUrl);
    assert.deepEqual(selectedGroups(partial), ["gifts.bank_details", "gifts.external_list"]);
    await run.close(); run = null;
    run = await mountPanel({ savedDraft: partial, respond: (_, index) => index === 1
      ? { assistantMessage: "Seguimos." }
      : { actions: [method("giftListLink", "https://example.test/lista-elegida")], assistantMessage: "Guardado." } });
    await run.until(() => run.messages().length === 1);
    assertQuestion(run, "external_list");
    assert.equal(run.writes.length, 0);
    await run.send("La lista es https://example.test/lista-elegida");
    assert.equal(ledger.buildDesignerAiConversationBrief(run.snapshot()).nextStep.kind, "gallery");
    const saved = run.exportPersistedDraft();
    assert.deepEqual(Object.keys(saved.render.gifts.visibility).filter(key => saved.render.gifts.visibility[key]), ["alias", "giftListLink"]);
    assert.equal(saved.render.gifts.bank.alias, "ALIAS.ELEGIDO");
    assert.equal(saved.render.gifts.giftListUrl, "https://example.test/lista-elegida");
  } finally { await run?.close(); }
});

for (const [first, next] of [["bank_details", "external_list"], ["external_list", "bank_details"]]) {
  test(`switching the pending choice from ${first} to ${next} replaces its durable markers`, async () => {
    let run = await mountPanel({ savedDraft: draft(), respond: (_, index) => index === 1
      ? { assistantMessage: "Hola." } : choose(index === 2 ? first : next) });
    try {
      await run.until(() => run.messages().length === 1);
      await run.send(first === "bank_details" ? "datos bancarios" : "una lista externa");
      assertQuestion(run, first);
      await run.send(next === "bank_details" ? "Mejor datos bancarios." : "Mejor una lista externa.");
      assertQuestion(run, next);
      assertSamplesConservedAndHidden(run);
      const saved = run.exportPersistedDraft();
      assert.deepEqual(selectedGroups(saved), [`gifts.${next}`]);
      await run.close(); run = null;
      run = await mountPanel({ savedDraft: saved, respond: () => ({ assistantMessage: "Seguimos." }) });
      await run.until(() => run.messages().length === 1);
      assertQuestion(run, next);
      assert.equal(run.writes.length, 0);
    } finally { await run?.close(); }
  });
}

for (const failure of ["content", "metadata"]) {
  test(`a ${failure} persistence failure cannot confirm the choice and the existing retry saves it once`, async () => {
    let fail = false;
    const run = await mountPanel({ savedDraft: draft(), failWrite: () => failure === "content" && fail,
      failMetadata: () => failure === "metadata" && fail,
      respond: (_, index) => index === 1 ? { assistantMessage: "Hola." } : choose("bank_details") });
    try {
      await run.until(() => run.messages().length === 1);
      fail = true;
      await run.send("datos bancarios");
      assert.equal(run.messages().at(-1).intent, "error");
      assert.deepEqual(selectedGroups(run.exportPersistedDraft()), []);
      assert.equal(run.snapshot().ledger.guidedFlow.completion.complete, false);
      const priorWrites = run.writes.length;
      fail = false;
      await run.click("Reintentar pendientes");
      await run.until(() => run.messages().at(-1).intent !== "error");
      assertQuestion(run, "bank_details");
      assertSamplesConservedAndHidden(run);
      assert.deepEqual(selectedGroups(run.exportPersistedDraft()), ["gifts.bank_details"]);
      assert.equal(run.calls.length, 2, "retry uses the existing validated response");
      assert.equal(run.writes.length, priorWrites + (failure === "content" ? 1 : 0), "saved content is not applied twice to retry metadata");
      assert.equal(run.messages().filter(message => message.role === "user" && message.content === "datos bancarios").length, 1);
    } finally { await run.close(); }
  });
}

test("template values and enabled alone do not infer a bank or external-list choice", async () => {
  const run = await mountPanel({ savedDraft: draft({ enabled: true }), respond: (_, index) => index === 1
    ? { assistantMessage: "Hola." } : { actions: [enable], assistantMessage: "Pasame el alias." } });
  try {
    await run.until(() => run.messages().length === 1);
    assert.equal(ledger.buildDesignerAiConversationBrief(run.snapshot()).nextStep.kind, "gifts_choice");
    await run.send("Sí, queremos incluir regalos.");
    assert.equal(ledger.buildDesignerAiConversationBrief(run.snapshot()).nextStep.kind, "gifts_choice");
    assertSamplesConservedAndHidden(run);
    assert.deepEqual(selectedGroups(run.exportPersistedDraft()), []);
    assert.match(run.messages().at(-1).content, /lista externa.*datos bancarios/);
  } finally { await run.close(); }
});

for (const failure of ["content", "metadata"]) {
  test(`retrying a bank datum after ${failure} failure retains the previously selected external list`, async () => {
    let fail = false;
    const run = await mountPanel({ savedDraft: draft(), failWrite: () => failure === "content" && fail,
      failMetadata: () => failure === "metadata" && fail,
      respond: (_, index) => index === 1 ? { assistantMessage: "Hola." }
        : index === 2 ? choose("bank_details", "external_list")
        : { actions: [method("alias", "ALIAS.ELEGIDO")], assistantMessage: "Guardado." } });
    try {
      await run.until(() => run.messages().length === 1);
      await run.send("Queremos datos bancarios y una lista externa.");
      assertQuestion(run, "bank_details");
      fail = true;
      await run.send("El alias es ALIAS.ELEGIDO.");
      assert.equal(run.messages().at(-1).intent, "error");
      assert.equal(run.snapshot().ledger.guidedFlow.completion.complete, false);
      const priorWrites = run.writes.length;
      fail = false;
      await run.click("Reintentar pendientes");
      await run.until(() => run.messages().at(-1).intent !== "error");
      assertQuestion(run, "external_list");
      assert.equal(run.calls.length, 3);
      assert.equal(run.writes.length, priorWrites + (failure === "content" ? 1 : 0));
      const saved = run.exportPersistedDraft();
      assert.deepEqual(selectedGroups(saved), ["gifts.bank_details", "gifts.external_list"]);
      assert.equal(saved.render.gifts.bank.alias, "ALIAS.ELEGIDO");
      assert.equal(saved.render.gifts.visibility.alias, true);
      assert.equal(saved.render.gifts.visibility.giftListLink, false);
    } finally { await run.close(); }
  });
}

test("a later Gift action does not revive a choice invalidated by a prior manual edit", async () => {
  const run = await mountPanel({ savedDraft: draft(), respond: (_, index) => index === 1
    ? { assistantMessage: "Hola." } : index === 2 ? choose("bank_details")
    : { actions: [{ type: "gifts.set_intro_text", arguments: { text: "Gracias por acompañarnos." } }], assistantMessage: "Guardado." } });
  try {
    await run.until(() => run.messages().length === 1);
    await run.send("datos bancarios");
    assertQuestion(run, "bank_details");
    const config = run.render().gifts;
    run.update({ gifts: { ...config, bank: { ...config.bank, alias: "ALIAS.EDITADO.MANUALMENTE" } } });
    assert.equal(ledger.buildDesignerAiConversationBrief(run.snapshot()).nextStep.kind, "gifts_choice");
    await run.send("Cambiá la introducción a Gracias por acompañarnos.");
    assert.notEqual(run.messages().at(-1).intent, "error");
    assert.equal(ledger.buildDesignerAiConversationBrief(run.snapshot()).nextStep.kind, "gifts_choice");
    assert.equal(run.exportPersistedDraft().render.gifts.bank.alias, "ALIAS.EDITADO.MANUALMENTE");
    assert.equal(run.exportPersistedDraft().render.gifts.visibility.alias, false);
    assert.match(run.messages().at(-1).content, /lista externa.*datos bancarios/);
  } finally { await run.close(); }
});

for (const group of ["bank_details", "external_list"]) {
  test(`postponing selected ${group} advances without discarding it or changing Gifts, including after reentry`, async () => {
    let run = await mountPanel({ savedDraft: draft(), respond: (_, index) => index === 1
      ? { assistantMessage: "Hola." } : index === 2 ? choose(group)
      : { resolutions: [{ leafId: `gifts.${group}`, status: "deferred_by_user", rule: null }], assistantMessage: "Lo dejamos para después." } });
    try {
      await run.until(() => run.messages().length === 1);
      await run.send(group === "bank_details" ? "datos bancarios" : "una lista externa");
      assertQuestion(run, group);
      const before = run.exportPersistedDraft();
      const priorWrites = run.writes.length;
      await run.send("Lo dejamos para después.");
      assert.notEqual(run.messages().at(-1).intent, "error");
      assert.equal(ledger.buildDesignerAiConversationBrief(run.snapshot()).nextStep.kind, "gallery");
      assert.ok(ledger.buildDesignerAiConversationBrief(run.snapshot()).deferredLeafIds.includes(`gifts.${group}`));
      assert.equal(run.writes.length, priorWrites, "postponing is conversation metadata, not a Gifts mutation");
      const saved = run.exportPersistedDraft();
      assert.deepEqual(saved.render.gifts, before.render.gifts);
      assert.equal(saved.conversation.resolutions.find(item => item.leafId === `gifts.${group}`).status, "deferred_by_user");
      assertSamplesConservedAndHidden(run);
      await run.close(); run = null;
      run = await mountPanel({ savedDraft: saved, respond: () => ({ assistantMessage: "Seguimos." }) });
      await run.until(() => run.messages().length === 1);
      assert.equal(ledger.buildDesignerAiConversationBrief(run.snapshot()).nextStep.kind, "gallery");
      assert.ok(ledger.buildDesignerAiConversationBrief(run.snapshot()).deferredLeafIds.includes(`gifts.${group}`));
      assert.equal(run.writes.length, 0);
      assert.doesNotMatch(run.messages().at(-1).content, /Pasame los datos bancarios|Pasame el enlace|lista externa.*datos bancarios/);
    } finally { await run?.close(); }
  });
}

test("postponing only the external list in a combination preserves the saved alias and resumes after refresh", async () => {
  let run = await mountPanel({ savedDraft: draft(), respond: (_, index) => index === 1
    ? { assistantMessage: "Hola." } : index === 2 ? choose("bank_details", "external_list")
    : index === 3 ? { actions: [method("alias", "ALIAS.ELEGIDO")], assistantMessage: "Guardado." }
    : { resolutions: [{ leafId: "gifts.external_list", status: "deferred_by_user", rule: null }], assistantMessage: "Lo dejamos para después." } });
  try {
    await run.until(() => run.messages().length === 1);
    await run.send("Queremos datos bancarios y una lista externa.");
    await run.send("El alias es ALIAS.ELEGIDO.");
    assertQuestion(run, "external_list");
    assert.ok(ledger.isTerminalDesignerAiLedgerStatus(run.snapshot().ledger.leaves.find(leaf => leaf.id === "gifts.enabled").status));
    const before = run.exportPersistedDraft();
    const priorWrites = run.writes.length;
    await run.send("La lista la dejamos para después.");
    assert.notEqual(run.messages().at(-1).intent, "error");
    assert.equal(ledger.buildDesignerAiConversationBrief(run.snapshot()).nextStep.kind, "gallery");
    assert.ok(ledger.buildDesignerAiConversationBrief(run.snapshot()).deferredLeafIds.includes("gifts.external_list"));
    assert.equal(run.writes.length, priorWrites);
    const saved = run.exportPersistedDraft();
    assert.deepEqual(saved.render.gifts, before.render.gifts);
    assert.equal(saved.render.gifts.bank.alias, "ALIAS.ELEGIDO");
    assert.equal(saved.render.gifts.visibility.alias, true);
    assert.equal(saved.render.gifts.visibility.giftListLink, false);
    await run.close(); run = null;
    run = await mountPanel({ savedDraft: saved, respond: (_, index) => index === 1
      ? { assistantMessage: "Seguimos." }
      : { actions: [method("giftListLink", "https://example.test/lista-elegida")], assistantMessage: "Guardado." } });
    await run.until(() => run.messages().length === 1);
    assert.equal(ledger.buildDesignerAiConversationBrief(run.snapshot()).nextStep.kind, "gallery");
    assert.ok(ledger.buildDesignerAiConversationBrief(run.snapshot()).deferredLeafIds.includes("gifts.external_list"));
    assert.equal(run.writes.length, 0);
    await run.send("Ahora agregá la lista https://example.test/lista-elegida");
    assert.notEqual(run.messages().at(-1).intent, "error");
    assert.equal(ledger.buildDesignerAiConversationBrief(run.snapshot()).deferredLeafIds.includes("gifts.external_list"), false);
    assert.equal(run.exportPersistedDraft().render.gifts.visibility.alias, true);
    assert.equal(run.exportPersistedDraft().render.gifts.visibility.giftListLink, true);
    assert.equal(run.writes.length, 1);
  } finally { await run?.close(); }
});

for (const groups of [["bank_details"], ["external_list"], ["bank_details", "external_list"]]) {
  test(`choosing and postponing ${groups.join(" and ")} in one turn persists the choice without showing template data`, async () => {
    let run = await mountPanel({ savedDraft: draft(), respond: (_, index) => index === 1
      ? { assistantMessage: "Hola." }
      : { ...choose(...groups), resolutions: groups.map(group => ({ ...marker(group), status: "deferred_by_user" })) } });
    try {
      await run.until(() => run.messages().length === 1);
      await run.send(groups.length === 2 ? "Queremos datos bancarios y lista, pero los datos los paso después."
        : groups[0] === "bank_details" ? "Datos bancarios, pero te los paso después." : "Una lista externa, el enlace te lo paso después.");
      assert.notEqual(run.messages().at(-1).intent, "error");
      assert.equal(ledger.buildDesignerAiConversationBrief(run.snapshot()).nextStep.kind, "gallery");
      assertSamplesConservedAndHidden(run);
      assert.equal(run.writes.length, 1);
      const saved = run.exportPersistedDraft();
      assert.deepEqual(selectedGroups(saved), groups.map(group => `gifts.${group}`).sort());
      for (const group of groups) {
        assert.equal(saved.conversation.resolutions.find(item => item.leafId === `gifts.${group}`).status, "deferred_by_user");
        assert.ok(ledger.buildDesignerAiConversationBrief(run.snapshot()).deferredLeafIds.includes(`gifts.${group}`));
      }
      await run.close(); run = null;
      run = await mountPanel({ savedDraft: saved, respond: () => ({ assistantMessage: "Seguimos." }) });
      await run.until(() => run.messages().length === 1);
      assert.equal(ledger.buildDesignerAiConversationBrief(run.snapshot()).nextStep.kind, "gallery");
      assert.equal(run.writes.length, 0);
      assertSamplesConservedAndHidden(run);
    } finally { await run?.close(); }
  });
}
