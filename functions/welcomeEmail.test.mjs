import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { requireBuiltModule } from "./testUtils/requireBuiltModule.mjs";

const require = createRequire(import.meta.url);
let networkAttempts = 0;
const rejectNetwork = () => { networkAttempts++; throw new Error("Network forbidden in welcome email tests"); };
for (const protocol of ["node:http", "node:https"]) {
  for (const method of ["request", "get"]) mock.method(require(protocol), method, rejectNetwork);
}
mock.method(require("node:net").Socket.prototype, "connect", rejectNetwork);
mock.method(require("node:tls"), "connect", rejectNetwork);
mock.method(globalThis, "fetch", rejectNetwork);

const { JSDOM } = require("jsdom");
const { createElement } = require("react");
const { render, toPlainText } = require("react-email");
const { renderEmail } = requireBuiltModule("lib/emails/renderEmail.js");
const { EmailFooter } = requireBuiltModule("lib/emails/components/EmailFooter.js");
const { emailTemplates, isEmailTemplateRequest } = requireBuiltModule("lib/emails/templateRegistry.js");
const { welcomeContent } = requireBuiltModule("lib/emails/content/welcome.js");
const { createTransactionalEmailService } = requireBuiltModule("lib/emails/sendTransactionalEmail.js");
const { SANDBOX_RECIPIENT } = requireBuiltModule("lib/emails/config.js");
const dashboardUrl = "https://reservaeldia.com.ar/dashboard?from=bienvenida&view=invitaciones";
const instagramUrl = "https://www.instagram.com/reservaeldia.ok/";
const linkedinUrl = "https://www.linkedin.com/company/reserva-el-d%C3%ADa/?viewAsMember=true";
const normalizeText = value => value.replace(/\s+/g, " ").trim();
const welcome = data => renderEmail({ template: "welcome", data: { dashboardUrl, ...data } });

test("welcome renders accessible Spanish HTML and readable plain-text with its real CTA", async () => {
  const result = await welcome({ name: "María José Muñoz" });
  const { window } = new JSDOM(result.html);
  const document = window.document;
  assert.match(result.html, /<!DOCTYPE html/i);
  assert.equal(document.documentElement.lang, "es");
  assert.equal(document.body.lang, "es");
  for (const value of [document.body.textContent, result.text].map(normalizeText)) {
    for (const expected of ["¡Hola, María José Muñoz!", "Soy Agus, el fundador.", "Podés cambiar textos", "pedirle ayuda al asistente", "Crear mi invitación"]) {
      assert.ok(value.includes(expected), expected);
    }
  }
  assert.equal([...document.querySelectorAll("a")].find(a => a.textContent === welcomeContent.action).href, dashboardUrl);
  assert.ok(result.text.includes(dashboardUrl));
  assert.ok(result.text.toLocaleLowerCase("es").includes("reserva el día"));
  assert.doesNotMatch(result.text, /<\/?(?:html|body|table|p|a)\b/i);
  assert.ok(Buffer.byteLength(result.html) < 25_000, "keep this simple template lightweight");
  window.close();
});

test("welcome subject and hidden preheader are complementary and centralized", async () => {
  const result = await welcome();
  assert.equal(result.subject, "Bienvenido a Reserva el Día");
  assert.equal(result.subject, welcomeContent.subject);
  assert.equal(welcomeContent.preheader, "Tu invitación empieza acá. Elegí una plantilla y hacela tuya.");
  const { window } = new JSDOM(result.html);
  const preview = [...window.document.querySelectorAll("div")].find(node => node.textContent.startsWith(welcomeContent.preheader));
  assert.ok(preview);
  assert.equal(preview.style.display, "none");
  assert.notEqual(result.subject, welcomeContent.preheader);
  assert.ok(!result.text.includes(welcomeContent.preheader), "preview is not duplicate body copy");
  window.close();
});

test("optional, empty and whitespace names have a clean greeting", async () => {
  for (const name of [undefined, "", "   "]) {
    const { html, text } = await welcome({ name });
    assert.ok(html.includes("¡Hola!"));
    assert.ok(text.includes("¡Hola!"));
    assert.doesNotMatch(html + text, /¡Hola,\s*!|undefined|null/);
  }
  assert.ok((await welcome({ name: "  Lucía  " })).text.includes("¡Hola, Lucía!"));
});

test("name is escaped as text, including Spanish punctuation and attempted markup", async () => {
  const name = 'Ángela & Ñandú <script>alert("sí")</script>';
  const { html, text } = await welcome({ name });
  const { window } = new JSDOM(html);
  assert.ok(window.document.body.textContent.includes(`¡Hola, ${name}!`));
  assert.ok(text.includes(name));
  assert.equal(window.document.querySelectorAll("script").length, 0);
  assert.ok(html.includes("&lt;script&gt;"));
  window.close();
});

test("email markup has no JavaScript, browser layout dependency, local URLs or default unsubscribe", async () => {
  const { html } = await welcome();
  const { window } = new JSDOM(html);
  const document = window.document;
  assert.equal(document.querySelectorAll("script,iframe,form,input,button,svg,link[rel=stylesheet]").length, 0);
  for (const element of document.querySelectorAll("*")) {
    for (const attribute of element.attributes) assert.doesNotMatch(attribute.name, /^on/i);
  }
  for (const element of document.querySelectorAll("[href],[src]")) {
    const url = new URL(element.getAttribute("href") || element.getAttribute("src"));
    assert.ok([dashboardUrl, "https://reservaeldia.com.ar/", instagramUrl, linkedinUrl].includes(url.href), url.href);
  }
  assert.doesNotMatch(html, /javascript:|localhost|127\.0\.0\.1|file:|display:\s*(flex|grid)|var\(--|@font-face|unsubscribe/i);
  assert.ok([...document.querySelectorAll("table")].every(table => table.getAttribute("role") === "presentation"));
  assert.match(html, /mso-padding-alt|mso-text-raise/);
  window.close();
});

test("founder's letter preserves the requested copy, emphasis and CTA placement", async () => {
  const { html, text } = await welcome({ name: "Agustín" });
  const { window } = new JSDOM(html);
  const document = window.document;
  const paragraphs = [...document.querySelectorAll("p")];
  const expectedCopy = [
    "¡Hola, Agustín!",
    "Qué alegría tenerte en Reserva el Día.",
    "Soy Agus, el fundador. Creé Reserva el Día con una idea bastante simple: que organizar un casamiento tenga menos complicaciones y deje más tiempo para disfrutar de lo que realmente importa.",
    "Porque, al final, no se trata de invitaciones, listas o confirmaciones. Se trata de reunir a las personas que queremos, compartir una mesa, bailar con amigos y crear recuerdos juntos.",
    "Para empezar, elegí la plantilla que más te guste y hacela tuya.",
    "Podés cambiar textos, colores, fotos, tipografías y cada detalle de la invitación. Podés hacerlo directamente desde el editor o pedirle ayuda al asistente. La idea es que no necesites saber de diseño para crear algo que realmente los represente.",
    "Y si en algún momento tenés una duda, algo no funciona como esperabas o simplemente querés contarnos qué te gustaría que mejoráramos, respondé directamente a este mail. Lo voy a leer.",
    "Gracias por elegir Reserva el Día para ser una pequeña parte de un momento tan importante.",
    "Ahora sí: reservemos el día.",
  ];
  const letterParagraphs = expectedCopy.map(copy => paragraphs.find(p => normalizeText(p.textContent) === copy));
  assert.ok(letterParagraphs.every(Boolean), "all requested paragraphs must be present verbatim");
  assert.ok(letterParagraphs.every(p => p.parentElement === letterParagraphs[0].parentElement), "the letter is not split into cards");
  assert.deepEqual([...document.querySelectorAll("strong")].map(node => node.textContent), [expectedCopy[4], "reservemos el día."]);
  const actionSection = letterParagraphs[5].nextElementSibling;
  assert.equal(actionSection.querySelector("a").textContent, "Crear mi invitación");
  assert.equal(actionSection.querySelector("a").href, dashboardUrl);
  assert.equal(actionSection.nextElementSibling, letterParagraphs[6]);
  const textSequence = [...expectedCopy.slice(0, 6), `Crear mi invitación ${dashboardUrl}`, ...expectedCopy.slice(6), "Agus Fundador de Reserva el Día"];
  let lastPosition = -1;
  for (const copy of textSequence) {
    const position = normalizeText(text).indexOf(copy);
    assert.ok(position > lastPosition, `ordered plain-text content: ${copy}`);
    lastPosition = position;
  }
  assert.match(text, /\nAgus\nFundador de Reserva el Día(?:\n|$)/);
  assert.ok(text.includes("\n\nQué alegría"), "paragraphs remain separated in plain-text");
  const signature = letterParagraphs.at(-1).nextElementSibling;
  assert.equal(signature.textContent, "AgusFundador de Reserva el Día");
  assert.equal(signature.querySelectorAll("br").length, 1);
  window.close();
});

test("welcome footer preserves brand, tagline and exact social links in HTML and plain-text", async () => {
  const { html, text } = await welcome();
  const { window } = new JSDOM(html);
  for (const [label, href] of [["Instagram", instagramUrl], ["LinkedIn", linkedinUrl]]) {
    const link = [...window.document.querySelectorAll("a")].find(a => a.textContent === label);
    assert.equal(link?.getAttribute("href"), href);
    assert.ok(text.includes(label));
    assert.ok(text.includes(href));
  }
  for (const value of [window.document.body.textContent, text].map(normalizeText)) {
    assert.ok(value.includes("Reserva el Día"));
    assert.ok(value.includes("Invitaciones digitales para momentos que importan."));
  }
  assert.doesNotMatch(html + text, /unsubscribe|dar(?:se)? de baja/i);
  window.close();
});

test("reusable footer supports supplied or omitted social links and retains its content slot", async () => {
  const custom = await render(createElement(EmailFooter, {
    socialLinks: [{ label: "Comunidad", href: "https://example.invalid/comunidad" }],
  }, createElement("p", null, "Información legal de prueba.")));
  const customText = toPlainText(custom);
  assert.ok(customText.includes("Comunidad https://example.invalid/comunidad"));
  assert.ok(customText.includes("Información legal de prueba."));
  assert.doesNotMatch(custom, /instagram\.com|linkedin\.com/);
  const hidden = await render(createElement(EmailFooter, { socialLinks: [] }));
  assert.doesNotMatch(hidden, /Instagram|LinkedIn| · /);
});

test("registry includes all templates, validates synthetic fixtures and preserves TestEmail", async () => {
  assert.deepEqual(Object.keys(emailTemplates).sort(), ["newUserNotification", "test", "welcome"]);
  for (const [template, definition] of Object.entries(emailTemplates)) {
    const input = { template, data: definition.previewData };
    assert.ok(isEmailTemplateRequest(input));
    assert.equal((await renderEmail(input)).subject, definition.subject);
  }
  const technical = await renderEmail({ template: "test", data: {} });
  assert.equal(technical.subject, "Prueba sandbox — Reserva el Día");
  assert.match(technical.text, /María de Prueba/);
  assert.doesNotMatch(technical.html, /Crear mi invitación/);
});

test("registry rejects missing, mismatched and injected data at runtime", async () => {
  for (const input of [null, undefined, {}, { template: "unknown", data: {} },
    { template: "test", data: { dashboardUrl } }, { template: "welcome", data: {} },
    ...[undefined, null, [], { dashboardUrl, name: 23 }, { dashboardUrl, name: null },
      { dashboardUrl, html: "injected" }, { dashboardUrl, subject: "injected" }, new Date()]
      .map(data => ({ template: "welcome", data }))]) {
    assert.equal(isEmailTemplateRequest(input), false);
    await assert.rejects(renderEmail(input), /Invalid email template data/);
  }
});

test("dashboard URL rejects local, relative, insecure, foreign and executable destinations", async () => {
  for (const url of ["", "/dashboard", "//reservaeldia.com.ar/dashboard", "http://reservaeldia.com.ar/dashboard",
    "javascript:alert(1)", "data:text/html,test", "file:///dashboard", "https://localhost/dashboard",
    "https://127.0.0.1/dashboard", "https://[::1]/dashboard", "https://example.invalid/dashboard",
    "https://reservaeldia.com.ar.evil.invalid/dashboard", "https://user:password@reservaeldia.com.ar/dashboard",
    "https://reservaeldia.com.ar:444/dashboard", "https://reservaeldia.com.ar/dashboard\n", "https:\\reservaeldia.com.ar\\dashboard"]) {
    await assert.rejects(welcome({ dashboardUrl: url }), /Invalid email template data/);
  }
});

test("welcome uses the same service with a fake transport and existing sandbox safeguards", async () => {
  const sent = [], logs = [];
  let mode = "sandbox";
  const send = createTransactionalEmailService({ getMode: () => mode, render: renderEmail,
    transport: async input => { sent.push(input); return { ok: true, state: "accepted", messageId: "synthetic", errorCode: null, retryable: false }; },
    log: entry => logs.push(entry) });
  const input = { template: "welcome", data: { name: "María", dashboardUrl }, to: SANDBOX_RECIPIENT,
    metadata: { correlationId: "email-test-12345678-1234-4123-8123-123456789012" } };
  assert.equal((await send(input)).ok, true);
  assert.equal(sent[0].content.subject, welcomeContent.subject);
  assert.equal(logs[0].template, "welcome");
  assert.doesNotMatch(JSON.stringify(logs), /María|dashboard|@|<html/);
  for (const [currentMode, code] of [["disabled", "EMAIL_DISABLED"]]) {
    mode = currentMode;
    assert.equal((await send(input)).errorCode, code);
  }
  mode = "production";
  assert.equal((await send({ ...input, to: "synthetic@example.invalid" })).ok, true);
  assert.equal(sent[1].to, "synthetic@example.invalid");
  mode = "sandbox";
  assert.equal((await send({ ...input, to: "synthetic@example.invalid" })).errorCode, "EMAIL_RECIPIENT_NOT_ALLOWED");
  assert.equal((await send({ ...input, data: {} })).errorCode, "EMAIL_INVALID_REQUEST");
  assert.equal(sent.length, 2);
});

test("rendering and its previews never load Firebase, SES, configuration or the sender", () => {
  const child = spawnSync(process.execPath, ["--require", "../scripts/local/networkGuard.cjs", "-e", `
    const assert = require('node:assert/strict');
    const Module = require('node:module');
    const original = Module._load;
    Module._load = function(id) {
      if (/firebase|aws-sdk|sendTransactionalEmail|sesClient|^\\.\\/config$/.test(id)) throw new Error('Forbidden render dependency: ' + id);
      return original.apply(this, arguments);
    };
    const {renderEmail} = require('./lib/emails/renderEmail.js');
    const {emailTemplates} = require('./lib/emails/templateRegistry.js');
    Promise.all(Object.entries(emailTemplates).map(([template, definition]) => renderEmail({template, data: definition.previewData})))
      .then(() => assert.deepEqual(require('../scripts/local/networkGuard.cjs').attempts, []))
      .catch(error => { console.error(error); process.exitCode = 1; });
  `], { cwd: new URL("./", import.meta.url), encoding: "utf8", timeout: 20_000, windowsHide: true });
  assert.equal(child.error, undefined);
  assert.equal(child.status, 0, child.stderr || child.stdout);
});

test("TypeScript rejects invalid template/data pairs at rendering and sending boundaries", () => {
  const ts = require("typescript");
  const config = ts.readConfigFile("tsconfig.json", ts.sys.readFile);
  assert.equal(config.error, undefined);
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, process.cwd(), { noEmit: true, rootDir: process.cwd() });
  const program = ts.createProgram(["testUtils/emailTemplateTypes.ts"], parsed.options);
  const diagnostics = ts.getPreEmitDiagnostics(program);
  assert.equal(diagnostics.length, 0, ts.formatDiagnostics(diagnostics, {
    getCanonicalFileName: file => file, getCurrentDirectory: () => process.cwd(), getNewLine: () => "\n",
  }));
});

test.after(() => {
  assert.equal(networkAttempts, 0, "tests must remain entirely offline");
  mock.restoreAll();
});
