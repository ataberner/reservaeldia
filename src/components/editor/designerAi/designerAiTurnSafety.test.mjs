import test from "node:test";
import assert from "node:assert/strict";
import { act } from "react";
import { mountPanel } from "./testSupport/panelHarness.mjs";
import { DESIGNER_AI_TIMING_EVENT } from "../../../domain/editor/designerAiTiming.js";

const greeting = { assistantMessage: "¡Hola!", entryGreeting: "¡Hola!" };
const pause = () => new Promise(resolve => setTimeout(resolve, 20));
const type = async text => {
  const input = document.querySelector("textarea");
  const props = input[Object.keys(input).find(key => key.startsWith("__reactProps"))];
  await act(async () => props.onChange({ target: { value: text } }));
};
const submit = async () => act(async () => document.querySelector("form").dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true })));

test("placeholder is exact; composing before hydration never submits or loses the message", async () => {
  const run = await mountPanel({ fullFields: true, authoringReady: false, respond: () => greeting });
  try {
    assert.equal(document.querySelector("textarea").placeholder, "Contame que tenes en mente...");
    await type("Somos Ana y Luz"); await submit(); await act(pause);
    assert.equal(run.calls.length, 0);
    assert.equal(run.metadataWrites(), 0);
    assert.equal(document.querySelector("textarea").value, "Somos Ana y Luz");
    await run.setAuthoringReady();
    await run.until(() => run.messages().length === 1);
    assert.equal(document.querySelector("textarea").value, "Somos Ana y Luz");
    assert.match(run.messages()[0].content, /nombres de quienes se casan/);
  } finally { await run.close(); }
});

test("opening rereads edits made while initial metadata persistence is waiting", async () => {
  let release;
  const waiting = new Promise(resolve => { release = resolve; });
  const run = await mountPanel({ fullFields: true, beforeMetadata: () => waiting, respond: () => greeting });
  try {
    await act(pause);
    run.authoring.defaults.event_ceremony_date = "2028-06-10";
    release();
    await run.until(() => run.calls.length === 1 && run.messages().length === 1);
    assert.equal(run.calls[0].capabilitySnapshot.values.ceremony.date, "2028-06-10");
  } finally { release(); await run.close(); }
});

test("automatic opening never executes writes from an older backend response", async () => {
  const run = await mountPanel({ respond: () => ({ assistantMessage: "Activé RSVP. ¿Qué fecha eligieron?", intent: "apply",
    actions: [{ type: "rsvp.set_enabled", arguments: { enabled: true } }],
    resolutions: [{ leafId: "gifts.enabled", status: "deferred_by_user", rule: null }],
  }) });
  try {
    await run.until(() => run.messages().length === 1);
    assert.equal(run.writes.length, 0);
    assert.equal(run.snapshot().values.rsvp.enabled, false);
    assert.doesNotMatch(run.messages()[0].content, /Activé|fecha eligieron/);
  } finally { await run.close(); }
});

test("double submit is ignored while a turn runs; typed next intent survives and timing is value-free", async () => {
  let release;
  const waiting = new Promise(resolve => { release = resolve; });
  const run = await mountPanel({ respond: (_, count) => count === 1 ? greeting : waiting });
  const events = [];
  try {
    await run.until(() => run.messages().length === 1);
    window.addEventListener(DESIGNER_AI_TIMING_EVENT, event => events.push(event.detail));
    await type("Activá confirmación"); await submit();
    await run.until(() => run.calls.length === 2);
    assert.equal(document.querySelector("textarea").disabled, false);
    await type("Mi próxima intención privada"); await submit(); await submit();
    assert.equal(run.calls.length, 2);
    release({ assistantMessage: "Listo.", intent: "apply", actions: [{ type: "rsvp.set_enabled", arguments: { enabled: true } }] });
    await run.until(() => run.messages().some(m => m.content.startsWith("Listo, actualizado.")));
    assert.equal(run.writes.length, 1);
    assert.equal(document.querySelector("textarea").value, "Mi próxima intención privada");
    assert.equal(events.length, 1);
    assert.equal(events[0].outcome, "success");
    assert.ok(events[0].responseVisibleMs >= events[0].responseReadyMs);
    assert.ok(events[0].callableMs > 0);
    assert.doesNotMatch(JSON.stringify(events), /privada|confirmación|snapshot|message|draft/);
  } finally { release(greeting); await run.close(); }
});

test("explicit retry preserves a composed next message and does not duplicate the user turn", async () => {
  const run = await mountPanel({ respond: (_, count) => {
    if (count === 2) throw Object.assign(new Error("synthetic timeout"), { code: "functions/deadline-exceeded" });
    return greeting;
  } });
  try {
    await run.until(() => run.messages().length === 1);
    await run.send("Cambiá RSVP");
    await type("Otro pedido todavía sin enviar");
    await run.click("Reintentar");
    await run.until(() => run.calls.length === 3 && run.messages().at(-1).intent !== "error");
    assert.equal(document.querySelector("textarea").value, "Otro pedido todavía sin enviar");
    assert.equal(run.messages().filter(m => m.role === "user").length, 1);
  } finally { await run.close(); }
});

test("a repeated batch returns feedback and cannot apply the same mutation twice", async () => {
  const run = await mountPanel({ respond: (_, count) => count === 1 ? greeting : {
    batchId: "same-batch", assistantMessage: "Listo.", intent: "apply",
    actions: [{ type: "rsvp.add_option", arguments: { questionId: "attendance", label: "Tal vez" } }],
  } });
  try {
    await run.until(() => run.messages().length === 1);
    await run.send("Agregá la opción Tal vez");
    const writes = run.writes.length;
    await run.send("Agregá otra opción");
    assert.equal(run.writes.length, writes);
    assert.match(run.messages().at(-1).content, /respuesta repetida/);
    assert.equal(run.snapshot().values.rsvp.questions.find(q => q.id === "attendance").options.filter(o => o.label === "Tal vez").length, 1);
  } finally { await run.close(); }
});

test("closing a pending turn invalidates its result and reopening explains the interruption without replay", async () => {
  let release;
  const waiting = new Promise(resolve => { release = resolve; });
  const run = await mountPanel({ respond: (_, count) => count === 1 ? greeting : waiting });
  try {
    await run.until(() => run.messages().length === 1);
    await type("Activá RSVP"); await submit();
    await run.until(() => run.calls.length === 2);
    await run.toggle(false);
    release({ assistantMessage: "Listo.", intent: "apply", actions: [{ type: "rsvp.set_enabled", arguments: { enabled: true } }] });
    await act(pause);
    await run.toggle(true);
    await run.until(() => /interrumpió/.test(run.messages().at(-1).content));
    assert.equal(run.writes.length, 0);
    assert.equal(run.snapshot().values.rsvp.enabled, false);
    assert.equal(run.calls.length, 2);
    assert.equal(document.body.textContent.includes("Reintentar"), false);
  } finally { release(greeting); await run.close(); }
});

test("manual changes during final metadata save withhold stale success and unsafe recovery", async () => {
  let release, metadataCalls = 0;
  const waiting = new Promise(resolve => { release = resolve; });
  const run = await mountPanel({ beforeMetadata: () => ++metadataCalls === 3 ? waiting : undefined,
    respond: (_, count) => count === 1 ? greeting : { assistantMessage: "Listo. RSVP activado.", intent: "apply",
      actions: [{ type: "rsvp.set_enabled", arguments: { enabled: true } }] },
  });
  try {
    await run.until(() => run.messages().length === 1);
    await type("Activá RSVP"); await submit();
    await run.until(() => metadataCalls === 3);
    run.update({ rsvp: { ...run.render().rsvp, enabled: false } });
    release();
    await run.until(() => run.messages().at(-1).intent === "error");
    assert.equal(run.snapshot().values.rsvp.enabled, false);
    assert.match(run.messages().at(-1).content, /cambió durante la operación/);
    assert.equal(document.body.textContent.includes("Reintentar pendientes"), false);
    assert.equal(run.messages().some(m => m.content === "Listo. RSVP activado."), false);
  } finally { release(); await run.close(); }
});
