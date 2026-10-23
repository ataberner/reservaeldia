import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { requireBuiltModule } from "./testUtils/requireBuiltModule.mjs";

const { generarModalRegalosHTML } = requireBuiltModule("lib/utils/generarModalRegalos.js");
const { resolveFunctionalCtaContract } = requireBuiltModule("lib/utils/functionalCtaContract.js");
const { generarHTMLDesdeSecciones } = requireBuiltModule("lib/utils/generarHTMLDesdeSecciones.js");
const { validatePreparedPublicationRenderState } = requireBuiltModule("lib/render/prepareRenderPayload.js");

const HIDDEN_BANK = { holder: false, bank: false, alias: false, cbu: false, cuit: false };
const SECTIONS = [{ id: "details", orden: 1, altoModo: "fijo", altura: 600 }];
const BUTTONS = [{ id: "gift-cta", tipo: "regalo-boton", seccionId: "details", x: 40, y: 100, width: 180, height: 44, texto: "Ver regalos" }];

function createConfig(overrides = {}) {
  return {
    version: 2,
    enabled: true,
    introText: "Gracias por compartir este día.",
    bank: { alias: "ejemplo.pesos" },
    visibility: { ...HIDDEN_BANK, alias: true, giftListLink: false },
    bankUsd: { alias: "ejemplo.dolares" },
    visibilityUsd: { ...HIDDEN_BANK, alias: true },
    giftListUrl: "",
    giftLinks: [
      { id: "coffee", title: "Una cafetera", url: "https://tienda.example/cafetera", imageUrl: "https://imagenes.example/cafetera.jpg", visible: true },
      { id: "trip", title: "Una experiencia", url: "https://pagos.example/experiencia", visible: true },
    ],
    ...overrides,
  };
}

function createRuntime(t, html, clipboardWrite) {
  // No resource loader: assets/links remain synthetic and no network is used.
  const dom = new JSDOM(`<!doctype html><body style="overflow: scroll"><button id="open-gifts" data-gift-open="1"><span>Ver regalos</span></button>${html}</body>`, {
    url: "https://invitacion.example/",
    runScripts: "outside-only",
    pretendToBeVisual: true,
  });
  t.after(() => dom.window.close());
  dom.window.requestAnimationFrame = (callback) => { callback(); return 1; };
  if (clipboardWrite) {
    Object.defineProperty(dom.window.navigator, "clipboard", {
      value: { writeText: clipboardWrite },
      configurable: true,
    });
  }
  const runtime = [...String(html).matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)]
    .map((match) => match[1])
    .find((source) => source.includes("var copyTimers = new Map()"));
  assert.ok(runtime, "generated gift modal runtime must be present");
  dom.window.eval(runtime);
  return dom.window;
}

function validateConfig(gifts) {
  return validatePreparedPublicationRenderState({
    rawObjetos: BUTTONS,
    rawSecciones: SECTIONS,
    objetosFinales: BUTTONS,
    seccionesFinales: SECTIONS,
    rawGifts: gifts,
  });
}

test("USD-only and product-link-only configurations make the gift CTA usable", () => {
  const usdOnly = createConfig({ visibility: HIDDEN_BANK, giftLinks: [] });
  const linksOnly = createConfig({ visibility: HIDDEN_BANK, visibilityUsd: HIDDEN_BANK });
  for (const giftsConfig of [usdOnly, linksOnly]) {
    const contract = resolveFunctionalCtaContract({ objetos: BUTTONS, giftsConfig });
    assert.equal(contract.gifts.ready, true);
    assert.equal(contract.gifts.hasUsableMethods, true);
    assert.equal(contract.gifts.reason, "ready");
    assert.ok(generarModalRegalosHTML(giftsConfig));
    assert.equal(validateConfig(giftsConfig).warnings.length, 0);
  }
});

test("renders separate currencies, legacy list and product previews together", (t) => {
  const html = generarModalRegalosHTML(createConfig({
    giftListUrl: "https://lista.example/regalos",
    visibility: { ...HIDDEN_BANK, alias: true, giftListLink: true },
  }));
  const window = createRuntime(t, html);
  const document = window.document;
  assert.equal(document.querySelector('[data-gift-account="ars"] h3').textContent, "Cuenta en pesos");
  assert.equal(document.querySelector('[data-gift-account="usd"] h3').textContent, "Cuenta en dólares");
  assert.equal(document.querySelector('[data-gift-account="ars"] [data-gift-copy]').getAttribute("data-copy-value"), "ejemplo.pesos");
  assert.equal(document.querySelector('[data-gift-account="usd"] [data-gift-copy]').getAttribute("data-copy-value"), "ejemplo.dolares");
  assert.equal(document.querySelectorAll("[data-gift-link-id]").length, 3);
  assert.equal(document.querySelector('[data-gift-link-id="coffee"] h4').textContent, "Una cafetera");
  assert.equal(document.querySelector('[data-gift-link-id="coffee"] .gift-link-domain').textContent, "tienda.example");
  for (const link of document.querySelectorAll(".gift-link-button")) {
    assert.equal(link.target, "_blank");
    assert.equal(link.rel, "noopener noreferrer");
    assert.match(link.getAttribute("aria-label"), /otra pestaña/);
  }
});

test("retains v1 bank and external list compatibility without exposing a USD account", (t) => {
  const legacy = {
    version: 1,
    enabled: true,
    bank: { alias: "legado.pesos" },
    visibility: { ...HIDDEN_BANK, alias: true, giftListLink: true },
    giftListUrl: "https://lista.example/legado",
  };
  const window = createRuntime(t, generarModalRegalosHTML(legacy));
  assert.equal(window.document.querySelectorAll("[data-gift-account]").length, 1);
  assert.equal(window.document.querySelector('[data-gift-account="usd"]'), null);
  assert.equal(window.document.querySelector('[data-gift-link-id="legacy"] a').textContent.trim().replace(/\s+/g, " "), "Ver lista de regalos ↗");
});

test("omits hidden or incomplete fields and never embeds hidden values into public HTML", () => {
  const html = generarModalRegalosHTML(createConfig({
    bank: { alias: "ars-visible", cbu: "ARS-PRIVATE" },
    visibility: { ...HIDDEN_BANK, alias: true, holder: true },
    bankUsd: { alias: "USD-PRIVATE", holder: "" },
    visibilityUsd: { ...HIDDEN_BANK, holder: true },
    giftListUrl: "https://hidden-list.example/PRIVATE",
    giftLinks: [
      { id: "private", title: "LINK-PRIVATE", url: "https://hidden.example/PRIVATE", imageUrl: "https://images.example/PRIVATE", visible: false },
      { id: "incomplete", title: "INCOMPLETE-PRIVATE", url: "javascript:alert(1)", visible: true },
    ],
  }));
  assert.match(html, /ars-visible/);
  assert.doesNotMatch(html, /PRIVATE|data-gift-account="usd"|data-gift-link-id=/);
  for (const gifts of [
    createConfig({ enabled: false }),
    createConfig({ visibility: HIDDEN_BANK, visibilityUsd: HIDDEN_BANK, giftLinks: [] }),
  ]) {
    assert.equal(generarModalRegalosHTML(gifts), "");
    assert.equal(resolveFunctionalCtaContract({ objetos: BUTTONS, giftsConfig: gifts }).gifts.ready, false);
  }
});

test("untrusted text stays text and unsafe link/image protocols never become active content", (t) => {
  const attack = '</script><img src=x onerror="window.giftAttack=true">';
  const html = generarModalRegalosHTML(createConfig({
    introText: attack,
    bank: { alias: attack },
    giftLinks: [
      { id: 'safe" onclick="evil()', title: attack, url: "https://tienda.example/?q=%22%3E%3Cscript%3E", imageUrl: "javascript:alert(1)", visible: true },
      { id: "data", title: "Unsafe data", url: "data:text/html,evil", visible: true },
      { id: "script", title: "Unsafe script", url: "javascript:alert(1)", visible: true },
    ],
  }));
  const window = createRuntime(t, html);
  assert.equal(window.giftAttack, undefined);
  assert.equal(window.document.querySelector("#gift-intro").textContent, attack);
  assert.equal(window.document.querySelector('[data-gift-account="ars"] [data-gift-copy]').getAttribute("data-copy-value"), attack);
  assert.equal(window.document.querySelector(".gift-link-copy h4").textContent, attack);
  assert.equal(window.document.querySelectorAll("[data-gift-link-id]").length, 1);
  assert.equal(window.document.querySelector("#modal-regalos img"), null);
  assert.equal(window.document.querySelector("[onerror], [onclick], [onfocus]"), null);
  assert.equal(window.document.querySelectorAll("script").length, 1);
  assert.doesNotMatch(html, /href="(?:javascript|data):/i);
});

test("fallback preview works without an image and after an image load failure", (t) => {
  const window = createRuntime(t, generarModalRegalosHTML(createConfig()));
  const withImage = window.document.querySelector('[data-gift-link-id="coffee"]');
  const withoutImage = window.document.querySelector('[data-gift-link-id="trip"]');
  const image = withImage.querySelector("img");
  assert.equal(image.getAttribute("referrerpolicy"), "no-referrer");
  image.dispatchEvent(new window.Event("error"));
  assert.equal(image.hidden, true);
  assert.ok(withImage.querySelector(".gift-link-placeholder svg"));
  assert.ok(withoutImage.querySelector(".gift-link-placeholder svg"));
  assert.equal(withoutImage.querySelector("img"), null);
});

test("opening, keyboard focus, Escape and backdrop preserve modal focus and scrolling", (t) => {
  const window = createRuntime(t, generarModalRegalosHTML(createConfig()));
  const document = window.document;
  const trigger = document.getElementById("open-gifts");
  const modal = document.getElementById("modal-regalos");
  const close = document.getElementById("gift-close");
  const cancel = document.getElementById("gift-cancel");
  trigger.focus();
  trigger.querySelector("span").click();
  assert.equal(modal.style.display, "flex");
  assert.equal(modal.getAttribute("aria-hidden"), "false");
  assert.equal(document.body.style.overflow, "hidden");
  assert.equal(document.activeElement, close);
  close.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true, cancelable: true }));
  assert.equal(document.activeElement, cancel);
  cancel.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true }));
  assert.equal(document.activeElement, close);
  close.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
  assert.equal(modal.style.display, "none");
  assert.equal(modal.getAttribute("aria-hidden"), "true");
  assert.equal(document.body.style.overflow, "scroll");
  assert.equal(document.activeElement, trigger);
  for (const key of ["Enter", " "]) {
    trigger.dispatchEvent(new window.KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
    assert.equal(modal.style.display, "flex");
    modal.click();
    assert.equal(modal.style.display, "none");
  }
});

test("copy actions use the selected account and clear feedback on close", async (t) => {
  const copied = [];
  const window = createRuntime(t, generarModalRegalosHTML(createConfig()), async (value) => { copied.push(value); });
  window.document.getElementById("open-gifts").click();
  for (const currency of ["ars", "usd"]) {
    const button = window.document.querySelector(`[data-gift-account="${currency}"] [data-gift-copy]`);
    button.click();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(button.textContent, "Copiado");
  }
  assert.deepEqual(copied, ["ejemplo.pesos", "ejemplo.dolares"]);
  assert.equal(window.document.querySelector('[role="status"]').textContent, "Dato copiado.");
  window.document.getElementById("gift-close").click();
  for (const button of window.document.querySelectorAll("[data-gift-copy]")) assert.equal(button.textContent, "Copiar");
  assert.equal(window.document.querySelector('[role="status"]').textContent, "");
});

test("denied clipboard falls back locally and reports failure without leaving a textarea", async (t) => {
  const window = createRuntime(t, generarModalRegalosHTML(createConfig()), async () => { throw new Error("Clipboard unavailable"); });
  const copied = [];
  window.document.execCommand = (command) => { copied.push([command, window.document.querySelector("textarea").value]); return true; };
  window.document.getElementById("open-gifts").click();
  const button = window.document.querySelector('[data-gift-account="usd"] [data-gift-copy]');
  button.focus();
  button.click();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(copied, [["copy", "ejemplo.dolares"]]);
  assert.equal(window.document.querySelector("textarea"), null);
  assert.equal(window.document.activeElement, button);
  window.document.execCommand = () => { throw new Error("Unavailable"); };
  button.click();
  await new Promise((resolve) => setImmediate(resolve));
  assert.match(window.document.querySelector('[role="status"]').textContent, /No se pudo copiar/);
  assert.equal(window.document.querySelector("textarea"), null);
});

test("validation reports incomplete visible USD fields and product URLs without hidden values", () => {
  const result = validateConfig(createConfig({
    bankUsd: { holder: "HIDDEN-PRIVATE", alias: "", cbu: "" },
    visibilityUsd: { ...HIDDEN_BANK, alias: true, cbu: true },
    giftLinks: [
      { id: "broken", title: "PRIVATE-TITLE", url: "javascript:evil()", visible: true },
      { id: "hidden", title: "HIDDEN-PRIVATE", url: "", visible: false },
    ],
  }));
  assert.equal(result.canPublish, true);
  assert.deepEqual(result.warnings.map((issue) => issue.fieldPath).sort(), [
    "gifts.bankUsd.alias", "gifts.bankUsd.cbu", "gifts.giftLinks[0].url",
  ]);
  assert.ok(result.warnings.every((issue) => issue.code === "gift-modal-field-incomplete"));
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE/);
});

test("published and draft-preview HTML share the complete gift modal and nested CTA behavior", (t) => {
  const gifts = createConfig();
  const nested = [{
    id: "gift-group", tipo: "grupo", seccionId: "details", anclaje: "content", x: 20, y: 30, width: 240, height: 100,
    children: [{ ...BUTTONS[0], x: 0, y: 0 }],
  }];
  const modals = [];
  for (const isPreview of [false, true]) {
    const html = generarHTMLDesdeSecciones(SECTIONS, nested, null, { gifts, isPreview });
    const window = createRuntime(t, html);
    const trigger = window.document.querySelector('[data-group-child-id="gift-cta"][data-gift-open]');
    assert.ok(trigger, "nested gift CTA remains discoverable");
    assert.equal(trigger.getAttribute("data-cta-state"), "ready");
    trigger.click();
    assert.equal(window.document.getElementById("modal-regalos").style.display, "flex");
    modals.push(window.document.getElementById("modal-regalos").outerHTML);
  }
  assert.equal(modals[0], modals[1]);
});
