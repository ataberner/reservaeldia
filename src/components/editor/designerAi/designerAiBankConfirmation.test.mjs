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
  const run = await mountPanel({ savedDraft: draft({ editing, inherited }), confirmGiftChanges: true, failWrite,
    respond: (_, index) => index === 1 ? { assistantMessage: "Hola, seguimos.", entryGreeting: "Hola, seguimos." }
      : { intent: "apply", actions, assistantMessage: assistantMessage ||
        `Ya configuré los regalos. ${editing ? editingQuestion : galleryQuestion}` },
  });
  await run.until(() => run.messages().length === 1);
  return run;
}

for (const editing of [false, true]) {
  for (const [input, saved] of [["123456", "123456"], ["  000123456  ", "000123456"]]) {
    test(`bank confirmation identifies the exact saved CBU in ${editing ? "editing" : "guided"} mode: ${saved}`, async () => {
      const run = await mount({ editing, actions: [method("cbu", input)] });
      try {
        await run.send(`El CBU sintético es ${input}.`);
        const message = run.messages().at(-1);
        assert.notEqual(message.intent, "error");
        assert.equal(run.writes.length, 1);
        assert.equal(run.exportPersistedDraft().render.gifts.bank.cbu, saved);
        assert.equal(run.exportPersistedDraft().render.gifts.visibility.cbu, true);
        assert.match(message.content, new RegExp(`CBU[:\\s]+${saved}`));
        assert.equal(occurrences(message.content, saved), 1, message.content);
        assert.doesNotMatch(message.content, /Ya configuré los regalos/, "the local receipt replaces the model's duplicate acknowledgement");
        assert.equal(occurrences(message.content, editing ? editingQuestion : galleryQuestion), 1, message.content);
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
    assert.match(message.content, /CBU.*oculto/i);
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
