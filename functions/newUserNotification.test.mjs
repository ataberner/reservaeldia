import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { requireBuiltModule } from "./testUtils/requireBuiltModule.mjs";

const require = createRequire(import.meta.url);
let networkAttempts = 0;
const noNetwork = () => { networkAttempts++; throw new Error("Network forbidden in notification tests"); };
for (const protocol of ["node:http", "node:https"]) {
  for (const method of ["request", "get"]) mock.method(require(protocol), method, noNetwork);
}
mock.method(require("node:net").Socket.prototype, "connect", noNetwork);
mock.method(require("node:tls"), "connect", noNetwork);
mock.method(globalThis, "fetch", noNetwork);

const { JSDOM } = require("jsdom");
const { renderEmail } = requireBuiltModule("lib/emails/renderEmail.js");
const { emailTemplates, isEmailTemplateRequest } = requireBuiltModule("lib/emails/templateRegistry.js");
const { createTransactionalEmailService } = requireBuiltModule("lib/emails/sendTransactionalEmail.js");
const { newUserNotificationData } = requireBuiltModule("lib/emails/newUserNotification.js");
const config = requireBuiltModule("lib/emails/config.js");
const correlationId = "new-user-notification-12345678-1234-4123-8123-123456789012";
const data = { name: "Agustín Pérez", email: "synthetic@example.invalid",
  registrationMethod: "google.com", createdAt: "2026-09-27T15:30:00.000Z" };
const input = { template: "newUserNotification", data, metadata: { correlationId } };

test("internal React Email has subject, preheader, backend data, Unicode and the verified admin CTA", async () => {
  const { subject, html, text } = await renderEmail(input);
  assert.equal(subject, "Nuevo usuario registrado — Reserva el Día");
  assert.match(html, /<!DOCTYPE html/i);
  assert.match(html, /<html[^>]*lang="es"/i);
  const { window } = new JSDOM(html);
  for (const body of [window.document.body.textContent, text]) {
    for (const fragment of ["Nuevo usuario registrado", "Se creó una nueva cuenta en Reserva el Día.",
      "Agustín Pérez", "synthetic@example.invalid", "Google", "27 de septiembre de 2026", "12:30", "Buenos Aires"]) {
      assert.ok(body.toLocaleLowerCase("es").includes(fragment.toLocaleLowerCase("es")), fragment);
    }
  }
  const cta = [...window.document.querySelectorAll("a")].find(a => a.textContent === "Ver usuarios");
  assert.equal(cta.href, "https://reservaeldia.com.ar/admin/usuarios");
  assert.match(readFileSync(new URL("../src/pages/admin/usuarios.jsx", import.meta.url), "utf8"), /UsersDirectoryManager/);
  assert.match(text, /Ver usuarios https:\/\/reservaeldia.com.ar\/admin\/usuarios/);
  assert.match(text, /\n\nNombre:/);
  assert.doesNotMatch(html + text, /unsubscribe|javascript:|localhost|127\.0\.0\.1|Reply-To/);
  assert.equal(window.document.querySelectorAll("script,iframe,form,input,button,svg").length, 0);
  for (const element of window.document.querySelectorAll("*")) {
    for (const attribute of element.attributes) assert.doesNotMatch(attribute.name, /^on/i);
  }
  window.close();
});

test("missing fields have natural fallback and untrusted markup is escaped", async () => {
  const fallback = await renderEmail({ template: "newUserNotification", data: { registrationMethod: "unavailable" } });
  assert.equal((fallback.text.match(/No disponible/g) || []).length, 4);
  assert.doesNotMatch(fallback.html + fallback.text, /undefined|null|Invalid Date/);
  const name = 'Ángela & Ñandú <script>alert("sí")</script>';
  const rendered = await renderEmail({ ...input, data: { ...data, name } });
  const { window } = new JSDOM(rendered.html);
  assert.ok(window.document.body.textContent.includes(name));
  assert.ok(rendered.text.includes(name));
  assert.equal(window.document.querySelectorAll("script").length, 0);
  window.close();
});

for (const [providers, expected] of [
  [["password"], "password"], [["google.com"], "google.com"], [["google.com", "google.com"], "google.com"],
  [[], "unavailable"], [["facebook.com"], "unavailable"], [["password", "google.com"], "unavailable"],
  [[""], "unavailable"], [undefined, "unavailable"],
]) {
  test(`provider derivation only trusts an unambiguous backend provider: ${JSON.stringify(providers)}`, () => {
    assert.equal(newUserNotificationData({ user: { uid: "synthetic", providerData: providers?.map(providerId => ({ providerId })) },
      sourceEventId: "event" }).registrationMethod, expected);
  });
}

test("backend name/date normalization uses metadata, then event timestamp; invalid dates are omitted", () => {
  const user = { uid: "synthetic", email: data.email, displayName: "  Agustín   Pérez  ",
    creationTime: "Sun, 27 Sep 2026 15:30:00 GMT", providerData: [{ providerId: "password" }] };
  assert.deepEqual(newUserNotificationData({ user, sourceEventId: "event", eventTimestamp: "2000-01-01" }), { ...data, registrationMethod: "password" });
  assert.equal(newUserNotificationData({ user: { ...user, creationTime: "bad" }, sourceEventId: "event", eventTimestamp: data.createdAt }).createdAt, data.createdAt);
  assert.equal(newUserNotificationData({ user: { uid: "synthetic" }, sourceEventId: "event" }).createdAt, undefined);
});

test("registry accepts the internal preview and rejects arbitrary fields, headers, URLs and mismatched data", async () => {
  assert.ok(isEmailTemplateRequest({ template: "newUserNotification", data: emailTemplates.newUserNotification.previewData }));
  for (const invalid of [undefined, {}, { registrationMethod: "facebook.com" }, { ...data, name: 12 },
    { ...data, email: [data.email] }, { ...data, createdAt: "2026-02-30T00:00:00.000Z" },
    { ...data, createdAt: "not-a-date" }, ...["to", "subject", "html", "adminUrl", "headers", "replyTo"]
      .map(key => ({ ...data, [key]: "injected" }))]) {
    await assert.rejects(renderEmail({ template: "newUserNotification", data: invalid }), /Invalid email template data/);
  }
});

test("fixed internal recipient cannot be provided or overridden, including its correct value", async () => {
  const sent = [], logs = [];
  let mode = "production";
  const service = createTransactionalEmailService({ getMode: () => mode, render: renderEmail,
    transport: async request => { sent.push(request); return { ok: true, state: "accepted", messageId: "synthetic", errorCode: null, retryable: false }; },
    log: entry => logs.push(entry) });
  assert.equal((await service(input)).ok, true);
  assert.equal(sent[0].to, "reservaeldia.invitaciones@gmail.com");
  for (const extra of [{ to: config.NEW_USER_NOTIFICATION_RECIPIENT }, { to: "attacker@example.invalid" },
    { to: undefined }, { from: "attacker@example.invalid" }, { replyTo: "attacker@example.invalid" },
    { cc: [data.email] }, { bcc: [data.email] }, { headers: {} }, { mode: "production" }]) {
    assert.equal((await service({ ...input, ...extra })).errorCode, "EMAIL_INVALID_REQUEST");
  }
  mode = "sandbox";
  assert.equal((await service(input)).errorCode, "EMAIL_SANDBOX_BUSINESS_BLOCKED");
  mode = "disabled";
  assert.equal((await service(input)).errorCode, "EMAIL_DISABLED");
  assert.equal(sent.length, 1);
  assert.doesNotMatch(JSON.stringify(logs), /Agustín|synthetic@example|<html|Secrets/);
  assert.ok(config.isEmailCorrelationId(correlationId));
  for (const value of ["new-user-notification-user@example.invalid", `${correlationId}\n`, correlationId.replace("4123", "1123")]) {
    assert.equal(config.isEmailCorrelationId(value), false);
  }
});

test.after(() => { assert.equal(networkAttempts, 0); mock.restoreAll(); });
