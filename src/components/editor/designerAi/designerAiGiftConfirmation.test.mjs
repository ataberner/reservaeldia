import test from "node:test";
import assert from "node:assert/strict";
import { act } from "react";
import { mountPanel } from "./testSupport/panelHarness.mjs";
import { executeDesignerAiActionBatch } from "../../../domain/editor/designerAiActionExecutor.js";
import { publishDashboardDocumentNameState } from "../../../lib/dashboardDocumentNameBridge.js";

const gifts = [{ type: "gifts.set_enabled", arguments: { enabled: true } },
  { type: "gifts.set_method", arguments: { method: "giftListLink", value: "https://destino.sintetico.test/lista", visible: true } }];
const mixed = [{ type: "story.set_text", arguments: { text: "Historia nueva" } }, ...gifts];
const response = actions => ({ intent: "apply", assistantMessage: "Listo.", actions });
const mount = options => mountPanel({ fullFields: true, respond: (_, index) => index === 1
  ? { assistantMessage: "Hola", entryGreeting: "Hola" } : response(mixed), ...options });
const ready = run => run.until(() => run.messages().length === 1);
const idle = run => run.until(() => document.querySelector("section[aria-label='Tu asistente']").getAttribute("aria-busy") === "false");

test("an external list pauses the entire mixed batch; explicit double click applies once", async () => {
  const run = await mount();
  try {
    await ready(run); await run.send("La ceremonia empieza a las 18:00");
    assert.equal(run.writes.length, 0);
    assert.equal(run.authoring.defaults.texto_historia, undefined);
    assert.ok(document.getElementById("designer-gift-confirm-title"));
    assert.equal(document.activeElement.id, "designer-gift-confirm-title");
    assert.match(document.body.textContent, /destino\.sintetico\.test/);
    assert.match(document.body.textContent, /Actualizar el texto de la historia/);
    const button = [...document.querySelectorAll("button")].find(b => b.textContent === "Confirmar cambios");
    await act(async () => { button.click(); button.click(); });
    await idle(run);
    assert.equal(run.writes.length, 3);
    assert.equal(run.authoring.defaults.texto_historia, "Historia nueva");
    assert.equal(run.exportPersistedDraft().render.gifts.giftListUrl, "https://destino.sintetico.test/lista");
  } finally { await run.close(); }
});

test("cancel, Escape and a new user intent discard authorization without writes", async () => {
  for (const cancel of ["button", "escape", "new-message"]) {
    const run = await mount({ respond: (_, index) => index === 1 ? { assistantMessage: "Hola" } : index === 2 ? response(mixed) : { assistantMessage: "Seguimos" } });
    try {
      await ready(run); await run.send("Cambiar la hora");
      if (cancel === "button") await run.click("Cancelar");
      else if (cancel === "escape") await act(async () => document.activeElement.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
      else await run.send("No hagas esos cambios");
      await idle(run);
      assert.equal(run.writes.length, 0);
      assert.equal(document.getElementById("designer-gift-confirm-title"), null);
    } finally { await run.close(); }
  }
});

test("changed draft and A to B to A cannot reuse a pending approval", async () => {
  for (const change of [run => run.update({ gifts: { enabled: false, bank: { alias: "MANUAL" } } }), () => {
    publishDashboardDocumentNameState({ documentId: "B", documentKind: "draft", hydrated: true, editable: true }, window);
    publishDashboardDocumentNameState({ documentId: "A", documentKind: "draft", hydrated: true, editable: true }, window);
  }]) {
    const run = await mount();
    try { await ready(run); await run.send("Cambiar la hora"); change(run); await run.click("Confirmar cambios"); await idle(run); assert.equal(run.writes.length, 0); }
    finally { await run.close(); }
  }
});

test("direct executor rejects a forged approval before any mixed-batch owner writes", async () => {
  const run = await mount();
  try {
    await ready(run);
    await assert.rejects(executeDesignerAiActionBatch(mixed, { snapshot: run.snapshot(), targetWindow: window,
      giftApproval: { approved: true } }), { code: "designer-ai/gift-approval-required" });
    assert.equal(run.writes.length, 0);
    assert.equal(run.authoring.defaults.texto_historia, undefined);
  } finally { await run.close(); }
});

test("closing the panel discards the card and cannot authorize on reopening", async () => {
  const run = await mount();
  try {
    await ready(run); await run.send("Cambiar la hora");
    const oldButton = [...document.querySelectorAll("button")].find(b => b.textContent === "Confirmar cambios");
    await run.toggle(false);
    await act(async () => oldButton.click());
    await run.toggle(true); await idle(run);
    assert.equal(run.writes.length, 0);
    assert.equal(document.getElementById("designer-gift-confirm-title"), null);
  } finally { await run.close(); }
});

test("a stale card callback cannot approve a replacement proposal", async () => {
  const run = await mount();
  try {
    await ready(run); await run.send("Primer pedido");
    const oldButton = [...document.querySelectorAll("button")].find(b => b.textContent === "Confirmar cambios");
    const oldProps = oldButton[Object.keys(oldButton).find(key => key.startsWith("__reactProps"))];
    await run.send("Pedido nuevo");
    await act(async () => oldProps.onClick());
    assert.equal(run.writes.length, 0);
    assert.ok(document.getElementById("designer-gift-confirm-title"));
    await run.click("Confirmar cambios"); await idle(run);
    assert.equal(run.writes.length, 3);
  } finally { await run.close(); }
});

test("confirmation displays the canonical full URL and host as inert text without extra provider calls", async () => {
  const link = "https://regalos.example.test/lista?nota=%3Cscript%3E&destino=12345678901234567890";
  const run = await mount({ respond: (_, index) => index === 1 ? { assistantMessage: "Hola" } : response([
    ...gifts, { type: "gifts.set_method", arguments: { method: "giftListLink", value: link, visible: true } },
  ]) });
  try {
    await ready(run); await run.send("Configurar regalos");
    const region = document.querySelector("section[aria-labelledby='designer-gift-confirm-title']");
    assert.ok(region);
    assert.match(region.textContent, /regalos\.example\.test/);
    assert.ok(region.textContent.includes(link));
    assert.equal(region.querySelector("a, script, iframe"), null);
    assert.equal(run.calls.length, 2);
    await run.click("Confirmar cambios"); await idle(run);
    assert.equal(run.calls.length, 2);
    assert.equal(run.exportPersistedDraft().render.gifts.giftListUrl, link);
  } finally { await run.close(); }
});

test("partial persistence retries need a fresh click and never replay saved actions", async () => {
  let fail = true;
  const run = await mount({ failWrite: count => count === 3 && fail });
  try {
    await ready(run); await run.send("Cambiar los datos"); await run.click("Confirmar cambios"); await idle(run);
    assert.equal(run.writes.length, 3);
    assert.match(run.messages().at(-1).content, /Se guardaron 2 de 3/);
    fail = false;
    await run.click("Reintentar pendientes"); await idle(run);
    assert.equal(run.writes.length, 3);
    assert.match(document.body.textContent, /Ya se guardaron 2 cambios/);
    await run.click("Confirmar cambios"); await idle(run);
    assert.equal(run.writes.length, 4);
    assert.equal(run.exportPersistedDraft().render.gifts.giftListUrl, "https://destino.sintetico.test/lista");
  } finally { await run.close(); }
});
