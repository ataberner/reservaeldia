import test from "node:test";
import assert from "node:assert/strict";
import { mountPanel, capabilities, ledger } from "./testSupport/panelHarness.mjs";

// All banking values, editor writes and provider responses in this file are
// synthetic. The real panel, normalizers, executor and saved receipts are used.
const galleryQuestion = "¿Querés que te ayude a cambiar las fotos de las galerías?";
const editingQuestion = "¿Querés cambiar algo más?";
const method = (name, value, visible = true) => ({
  type: "gifts.set_method", arguments: { method: name, value, visible },
});
const sampleBank = {
  holder: "Titular sintético heredado", bank: "Banco sintético heredado", alias: "ALIAS.SINTETICO.HEREDADO",
  cbu: "CBU.SINTETICO.HEREDADO", cuit: "CUIT.SINTETICO.HEREDADO",
};

function draft({ editing = false, inherited = false } = {}) {
  const value = {
    sourceContext: { templateDerived: inherited, changedKeys: [] },
    authoring: { fieldsSchema: [], defaults: {} },
    render: {
      objetos: [{ id: "synthetic-bank-gallery", tipo: "galeria", rows: 1, cols: 1,
        cells: [{ id: "photo", mediaUrl: "https://example.test/synthetic-photo.jpg" }] }],
      secciones: [], eventDetails: { mode: "single" }, rsvp: { enabled: false },
      gifts: { enabled: true, bank: inherited ? { ...sampleBank } : {},
        visibility: Object.fromEntries([...Object.keys(sampleBank), "giftListLink"].map(key => [key, inherited])) },
    },
  };
  const snapshot = capabilities.buildDesignerAiCapabilitySnapshot({
    authoringSnapshot: value.authoring, renderSnapshot: value.render, sourceContext: value.sourceContext,
  });
  value.conversation = {
    usage: { hasStarted: true, guidedFlowCompleted: editing },
    resolutions: snapshot.ledger.leaves.filter(leaf => leaf.id === "gifts.enabled" ||
      (snapshot.ledger.guidedFlow.leafIds.includes(leaf.id) && leaf.block !== "galleries" && !leaf.id.startsWith("gifts.")))
      .map(leaf => ({ leafId: leaf.id, fingerprint: leaf.fingerprint,
        status: "resolved_from_user", provenance: "user_current_session", rule: null })),
  };
  return value;
}

const occurrences = (text, value) => text.split(value).length - 1;
async function mount({ actions, editing = false, inherited = false, failWrite, assistantMessage } = {}) {
  const run = await mountPanel({ savedDraft: draft({ editing, inherited }), failWrite,
    respond: (_, index) => index === 1 ? { assistantMessage: "Hola, seguimos.", entryGreeting: "Hola, seguimos." }
      : { intent: "apply", actions, assistantMessage: assistantMessage ||
        `Ya configuré los regalos. ${editing ? editingQuestion : galleryQuestion}` },
  });
  await run.until(() => run.messages().length === 1);
  return run;
}

for (const suppliesAlias of [true, false]) {
  test(`an inherited visible gift list does not interrupt bank chat when ${suppliesAlias ? "saving an alias" : "choosing bank details without a value"}`, async () => {
    const savedDraft = draft({ inherited: true });
    savedDraft.render.gifts.giftListUrl = "https://example.test/synthetic-gift-list";
    const run = await mountPanel({ savedDraft, respond: (_payload, index) => index === 1
      ? { assistantMessage: "Hola.", entryGreeting: "Hola." }
      : { intent: "apply", assistantMessage: "Listo.", actions: suppliesAlias || index > 2
        ? [method("alias", "ALIAS.APORTADO")]
        : [{ type: "gifts.set_enabled", arguments: { enabled: true } }, method("alias", null)] },
    });
    try {
      await run.until(() => run.messages().length === 1);
      await run.send(suppliesAlias ? "Mi alias es ALIAS.APORTADO" : "Prefiero datos bancarios con alias");
      assert.equal(document.getElementById("designer-gift-confirm-title"), null);
      assert.equal(document.querySelector("textarea").disabled, false);
      assert.notEqual(run.messages().at(-1).intent, "error");
      assert.equal(run.exportPersistedDraft().render.gifts.visibility.giftListLink, false);
      assert.equal(run.exportPersistedDraft().render.gifts.giftListUrl, "https://example.test/synthetic-gift-list");
      assert.doesNotMatch(document.body.textContent, /synthetic-gift-list|ALIAS.SINTETICO.HEREDADO/);
      if (!suppliesAlias) {
        assert.match(run.messages().at(-1).content, /Pasame Alias/);
        assert.equal(run.render().gifts.visibility.alias, false);
        await run.send("ALIAS.APORTADO");
      }
      assert.equal(run.exportPersistedDraft().render.gifts.bank.alias, "ALIAS.APORTADO");
      assert.equal(run.exportPersistedDraft().render.gifts.visibility.alias, true);
      assert.match(run.messages().at(-1).content, /Alias: ALIAS.APORTADO configurado/);
      assert.equal(document.getElementById("designer-gift-confirm-title"), null);
    } finally { await run.close(); }
  });
}

test("a missing inherited bank value keeps valid supplied data, asks by chat and does not close or label the next guided step", async () => {
  const savedDraft = draft({ inherited: true });
  const missing = "gifts.method.holder.value";
  const run = await mountPanel({ savedDraft, respond: (payload, index) => {
    if (index === 1) return { assistantMessage: "Hola.", entryGreeting: "Hola." };
    if (index === 2) return { intent: "apply", assistantMessage: "Listo.", actions: [
      { type: "gifts.set_enabled", arguments: { enabled: true } }, method("alias", "APORTADO.ALIAS"), method("holder", null),
    ], resolutions: [{ leafId: "gifts.bank_details", status: "needs_clarification", rule: null },
      { leafId: "gifts.enabled", status: "resolved_from_user", rule: null },
      { leafId: missing, status: "resolved_from_user", rule: null }] };
    assert.match(payload.recentTurns.at(-1).content, /Pasame Titular/);
    return { intent: "apply", assistantMessage: "Listo.", actions: [method("holder", "Persona Aportada")] };
  } });
  try {
    await run.until(() => run.messages().length === 1);
    await run.send("Usá el alias APORTADO.ALIAS y un titular");
    assert.equal(run.snapshot().values.gifts.methods.alias.value, "APORTADO.ALIAS");
    assert.equal(run.render().gifts.visibility.holder, false);
    assert.match(run.messages().at(-1).content, /Pasame Titular/);
    assert.equal(run.messages().at(-1).guidedStepFingerprint, undefined);
    assert.equal(run.messages().some(message => message.guidedCompletion), false);
    assert.equal(document.getElementById("designer-gift-confirm-title"), null);
    assert.doesNotMatch(document.body.textContent, /Titular sintético heredado/);
    await run.send("Persona Aportada");
    assert.equal(run.render().gifts.bank.holder, "Persona Aportada");
    assert.equal(run.render().gifts.visibility.holder, true);
    assert.match(run.messages().at(-1).content, /Persona Aportada/);
    assert.equal(occurrences(run.messages().at(-1).content, galleryQuestion), 1);
  } finally { await run.close(); }
});

test("chat hides and reactivates a supplied bank value after reload without any approval", async () => {
  let run = await mountPanel({ savedDraft: draft({ editing: true }), respond: (_payload, index) => index === 1
    ? { assistantMessage: "Hola.", entryGreeting: "Hola." }
    : { intent: "apply", assistantMessage: "Listo.", actions: [method("alias", index === 2 ? "ALIAS.CONFIRMADO" : null, index === 2)] } });
  try {
    await run.until(() => run.messages().length === 1);
    await run.send("Mi alias es ALIAS.CONFIRMADO");
    await run.send("Ocultá el alias");
    assert.equal(run.render().gifts.visibility.alias, false);
    const savedDraft = run.exportPersistedDraft();
    await run.close();
    run = await mountPanel({ savedDraft, respond: (_payload, index) => index === 1
      ? { assistantMessage: "Hola.", entryGreeting: "Hola." }
      : { intent: "apply", assistantMessage: "Listo.", actions: [method("alias", null)] } });
    await run.until(() => run.messages().length === 1);
    await run.send("Volvé a mostrar el alias que te pasé");
    assert.equal(document.getElementById("designer-gift-confirm-title"), null);
    assert.equal(run.render().gifts.visibility.alias, true);
    assert.equal(run.exportPersistedDraft().render.gifts.bank.alias, "ALIAS.CONFIRMADO");
    assert.notEqual(run.messages().at(-1).intent, "error");
  } finally { await run.close(); }
});

test("retrying a filtered bank batch retains the missing inherited field until a later chat answer", async () => {
  let failAliasWrite = true;
  const run = await mountPanel({ savedDraft: draft({ inherited: true }), failWrite: count => count === 2 && failAliasWrite,
    respond: (payload, index) => {
      if (index === 1) return { assistantMessage: "Hola.", entryGreeting: "Hola." };
      if (index === 2) return { intent: "apply", assistantMessage: "Listo.", actions: [
        { type: "gifts.set_enabled", arguments: { enabled: true } }, method("alias", "ALIAS.APORTADO"), method("holder", null),
      ], resolutions: [{ leafId: "gifts.bank_details", status: "needs_clarification", rule: null }] };
      assert.match(payload.recentTurns.at(-1).content, /Pasame Titular/);
      return { intent: "apply", assistantMessage: "Listo.", actions: [method("holder", "Persona Aportada")] };
    },
  });
  try {
    await run.until(() => run.messages().length === 1);
    await run.send("Usá el alias ALIAS.APORTADO y un titular");
    assert.equal(run.messages().at(-1).intent, "error");
    assert.equal(run.writes.length, 2);
    failAliasWrite = false;
    await run.click("Reintentar pendientes");
    await run.until(() => run.messages().at(-1).intent !== "error");
    assert.equal(run.calls.length, 2, "retry uses the same batch without another provider interpretation");
    assert.equal(run.writes.length, 3, "only the unpersisted alias is retried");
    assert.equal(run.exportPersistedDraft().render.gifts.bank.alias, "ALIAS.APORTADO");
    assert.equal(run.render().gifts.visibility.holder, false);
    assert.match(run.messages().at(-1).content, /Pasame Titular/);
    assert.equal(run.messages().at(-1).guidedStepFingerprint, undefined);
    assert.equal(run.messages().some(message => message.guidedCompletion), false);
    assert.doesNotMatch(document.body.textContent, /Titular sintético heredado/);
    assert.equal(document.getElementById("designer-gift-confirm-title"), null);
    await run.send("Persona Aportada");
    assert.equal(run.exportPersistedDraft().render.gifts.bank.holder, "Persona Aportada");
    assert.equal(run.render().gifts.visibility.holder, true);
    assert.match(run.messages().at(-1).content, /Persona Aportada/);
    assert.equal(occurrences(run.messages().at(-1).content, galleryQuestion), 1);
  } finally { await run.close(); }
});

test("a missing bank value keeps chat enabled while a valid photo control waits", async () => {
  const controlRequest = { type: "gallery_cell_upload", galleryId: "synthetic-bank-gallery", cellId: "photo", cellIndex: 0 };
  const run = await mountPanel({ savedDraft: draft({ inherited: true, editing: true }), respond: (_payload, index) => index === 1
    ? { assistantMessage: "Hola.", entryGreeting: "Hola." }
    : { intent: "apply", assistantMessage: "Listo.", controlRequest,
      actions: index === 2 ? [{ type: "gifts.set_enabled", arguments: { enabled: true } }, method("alias", "ALIAS.APORTADO"), method("holder", null)]
        : [method("holder", "Persona Aportada")], resolutions: [] },
  });
  try {
    await run.until(() => run.messages().length === 1);
    await run.send("Usá ALIAS.APORTADO y un titular; después cambiemos las fotos");
    assert.match(run.messages().at(-1).content, /Pasame Titular/);
    assert.equal(document.querySelector("textarea").disabled, false);
    assert.equal(run.snapshot().ledger.leaves.find(leaf => leaf.id === "media.gallery.synthetic-bank-gallery.guided_completion").status, "requires_control");
    await run.send("Persona Aportada");
    assert.equal(run.exportPersistedDraft().render.gifts.bank.holder, "Persona Aportada");
    assert.equal(run.render().gifts.visibility.holder, true);
    assert.equal(run.messages().some(message => message.guidedCompletion), false);
    assert.notEqual(run.messages().at(-1).intent, "error");
  } finally { await run.close(); }
});

for (const editing of [false, true]) {
  for (const [input, saved] of [["123456", "123456"], ["  000123456  ", "000123456"]]) {
    test(`bank confirmation identifies the exact saved CBU in ${editing ? "editing" : "guided"} mode: ${saved}`, async () => {
      const run = await mount({ editing, actions: [method("cbu", input)] });
      try {
        await run.send(`El CBU sintético es ${input}.`);
        const message = run.messages().at(-1);
        assert.notEqual(message.intent, "error");
        assert.equal(document.getElementById("designer-gift-confirm-title"), null);
        assert.equal(run.writes.length, 1);
        assert.equal(run.exportPersistedDraft().render.gifts.bank.cbu, saved);
        assert.equal(run.exportPersistedDraft().render.gifts.visibility.cbu, true);
        assert.match(message.content, new RegExp(`CBU[:\\s]+${saved}`));
        assert.equal(occurrences(message.content, saved), 1, message.content);
        assert.doesNotMatch(message.content, /Ya configuré los regalos/, "the local receipt replaces the model's duplicate acknowledgement");
        assert.equal(occurrences(message.content, editing ? editingQuestion : galleryQuestion), editing ? 0 : 1, message.content);
        if (!editing) assert.equal(ledger.buildDesignerAiConversationBrief(run.snapshot()).nextStep.kind, "gallery");
        assert.equal(run.calls.length, 2, "the saved confirmation needs no extra model request");
      } finally { await run.close(); }
    });
  }
}

test("a bank confirmation lists each saved field once, using the owner's normalized text", async () => {
  const values = { holder: "Persona Sintética", bank: "Banco Sintético", alias: "ALIAS.SINTETICO", cbu: "000123456", cuit: "20123456789" };
  const run = await mount({ actions: Object.entries(values).map(([key, value]) => method(key, `  ${value.replaceAll(" ", "   ")}  `)) });
  try {
    await run.send("Usá los cinco datos bancarios sintéticos que indiqué.");
    const message = run.messages().at(-1);
    assert.notEqual(message.intent, "error");
    assert.equal(run.writes.length, 5);
    assert.deepEqual(run.exportPersistedDraft().render.gifts.bank, values);
    for (const value of Object.values(values)) assert.equal(occurrences(message.content, value), 1, message.content);
    assert.equal(occurrences(message.content, galleryQuestion), 1, message.content);
  } finally { await run.close(); }
});

test("the newly saved CBU is confirmed without exposing inherited bank values", async () => {
  const run = await mount({ inherited: true, actions: [method("cbu", "000123456")] });
  try {
    await run.send("Mostrá únicamente el CBU sintético 000123456.");
    const message = run.messages().at(-1);
    assert.notEqual(message.intent, "error");
    assert.match(message.content, /CBU[:\s]+000123456/);
    const config = run.exportPersistedDraft().render.gifts;
    assert.deepEqual(Object.keys(config.visibility).filter(key => config.visibility[key]), ["cbu"]);
    for (const [key, value] of Object.entries(sampleBank)) {
      assert.equal(message.content.includes(value), false, `inherited ${key} was not confirmed`);
      if (key !== "cbu") assert.equal(config.bank[key], value, `hidden ${key} is preserved`);
    }
  } finally { await run.close(); }
});

test("hiding a bank field confirms its visibility change without repeating its preserved value", async () => {
  const run = await mount({ inherited: true, actions: [method("cbu", null, false)], assistantMessage: "Listo, oculté el CBU." });
  try {
    await run.send("Ocultá el CBU y conservá su valor.");
    const message = run.messages().at(-1);
    assert.notEqual(message.intent, "error");
    assert.equal(run.exportPersistedDraft().render.gifts.bank.cbu, sampleBank.cbu);
    assert.equal(run.exportPersistedDraft().render.gifts.visibility.cbu, false);
    assert.match(message.content, /^Listo, actualizado\./);
    for (const value of Object.values(sampleBank)) assert.equal(message.content.includes(value), false);
  } finally { await run.close(); }
});

test("a failed bank write does not confirm or echo the optimistic CBU", async () => {
  const run = await mount({ actions: [method("cbu", "000123456")], failWrite: () => true });
  try {
    await run.send("Mostrá el CBU sintético 000123456.");
    const message = run.messages().at(-1);
    assert.equal(message.intent, "error");
    assert.equal(run.writes.length, 1);
    assert.equal(run.snapshot().values.gifts.methods.cbu.value, "000123456", "the local effect is optimistic");
    assert.notEqual(run.exportPersistedDraft().render.gifts.bank.cbu, "000123456");
    assert.match(message.content, /No pude confirmar el guardado/);
    assert.doesNotMatch(message.content, /000123456|✓|Confirmado/);
  } finally { await run.close(); }
});
