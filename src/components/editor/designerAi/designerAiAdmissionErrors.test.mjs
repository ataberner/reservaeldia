import test from "node:test";
import assert from "node:assert/strict";
import { act } from "react";
import { mountPanel } from "./testSupport/panelHarness.mjs";

const opening = { assistantMessage: "Hola", entryGreeting: "Hola" };
const request = "La ceremonia empieza a las 18:00";
const retryVisible = () => [...document.querySelectorAll("button")].some(button => button.textContent === "Reintentar");
for (const [reason, code, summary, retryable] of [
  ["minute_quota", "resource-exhausted", "Alcanzaste el límite temporal del asistente. Esperá un momento.", true],
  ["daily_quota", "resource-exhausted", "Alcanzaste el límite diario del asistente.", false],
  ["global_budget", "resource-exhausted", "El asistente alcanzó su límite de uso por hoy.", false],
  ["concurrent_request", "resource-exhausted", "Ya hay una solicitud del asistente en curso.", true],
  ["duplicate_active", "already-exists", "Esta solicitud ya está en curso.", false],
  ["duplicate_completed", "already-exists", "Esta solicitud ya fue procesada. Revisá tu invitación antes de enviar otra.", false],
  ["duplicate_unknown", "already-exists", "La solicitud anterior no pudo confirmarse. Revisá tu invitación antes de enviar otra.", false],
  ["email_verification_required", "permission-denied", "Verificá tu email para usar tu asistente.", false],
]) {
  test(`safe admission ${reason}: clear copy, preserved composer, retry policy and no mutation`, async () => {
    const run = await mountPanel({ respond: (_, index) => {
      if (index === 1) return opening;
      throw Object.assign(new Error("RAW_FIREBASE_TOKEN_SENSITIVE"), { code: `functions/${code}`,
        details: { category: "assistant_admission", reason, summary, retryable } });
    } });
    try {
      await run.until(() => run.messages().length === 1); await run.send(request);
      assert.equal(run.messages().at(-1).content, summary);
      assert.equal(document.querySelector("textarea").value, request);
      assert.equal(retryVisible(), retryable);
      assert.equal(run.writes.length, 0);
      assert.doesNotMatch(document.body.textContent, /RAW_FIREBASE|TOKEN_SENSITIVE/);
    } finally { await run.close(); }
  });
}

for (const code of ["functions/unauthenticated", "appCheck/recaptcha-error", "appCheck/fetch-status-error"]) {
  test(`${code} requires session reload without raw Firebase detail or blind retry`, async () => {
    const run = await mountPanel({ respond: (_, index) => {
      if (index === 1) return opening;
      throw Object.assign(new Error("RAW_FIREBASE_TOKEN_SENSITIVE"), { code, details: { summary: "RAW_FIREBASE_TOKEN_SENSITIVE" } });
    } });
    try {
      await run.until(() => run.messages().length === 1); await run.send(request);
      assert.match(run.messages().at(-1).content, /Recargá la página.*iniciar sesión/);
      assert.equal(document.querySelector("textarea").value, request);
      assert.equal(retryVisible(), false);
      assert.equal(run.writes.length, 0);
      assert.doesNotMatch(document.body.textContent, /RAW_FIREBASE|TOKEN_SENSITIVE/);
    } finally { await run.close(); }
  });
}

test("late admission error preserves a composed next intent instead of restoring the old message", async () => {
  let reject;
  const response = new Promise((_, rejectPromise) => { reject = rejectPromise; });
  const run = await mountPanel({ respond: (_, index) => index === 1 ? opening : response });
  const type = async text => {
    const input = document.querySelector("textarea");
    const props = input[Object.keys(input).find(key => key.startsWith("__reactProps"))];
    await act(async () => props.onChange({ target: { value: text } }));
  };
  try {
    await run.until(() => run.messages().length === 1);
    await type(request);
    await act(async () => document.querySelector("form").dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true })));
    await run.until(() => run.calls.length === 2);
    await type("Otro pedido que todavía estoy escribiendo");
    await act(async () => reject(Object.assign(new Error("raw"), { code: "functions/resource-exhausted",
      details: { category: "assistant_admission", reason: "concurrent_request", summary: "Ya hay una solicitud en curso.", retryable: true } })));
    await run.until(() => run.messages().at(-1).intent === "error");
    assert.equal(document.querySelector("textarea").value, "Otro pedido que todavía estoy escribiendo");
  } finally { await run.close(); }
});
