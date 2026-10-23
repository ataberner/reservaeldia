import test from "node:test";
import assert from "node:assert/strict";
import { createDefaultGiftConfig } from "../../../domain/gifts/config.js";
import { getEditableGiftLinks, initialAutoVisibleFields, removeGiftLink, setAccountVisibility, updateAccountField, updateGiftLink, validateGiftEditorDraft } from "./giftEditorDraft.js";

function fixture() {
  const config = createDefaultGiftConfig();
  config.bank.alias = "pesos.fixture";
  config.bankUsd.alias = "dolares.fixture";
  config.visibilityUsd.alias = true;
  config.giftListUrl = "https://example.com/lista";
  config.visibility.giftListLink = true;
  config.giftLinks = [{ id: "coffee", title: "Cafetera", url: "https://example.com/cafe", imageUrl: "", visible: true }];
  return config;
}

test("draft account mutations preserve the original config and other account", () => {
  const original = fixture();
  const edited = updateAccountField(original, "usd", "alias", "nueva.cuenta.usd");
  assert.equal(original.bankUsd.alias, "dolares.fixture");
  assert.equal(edited.bank.alias, "pesos.fixture");
  assert.equal(edited.bankUsd.alias, "nueva.cuenta.usd");
  const hidden = setAccountVisibility(edited, "usd", false);
  assert.equal(hidden.bankUsd.alias, "nueva.cuenta.usd");
  assert.equal(hidden.visibilityUsd.alias, false);
  assert.equal(hidden.visibility.alias, true);
  assert.equal(hidden.visibility.giftListLink, true);
});

test("typing a new account field shows it while editing an existing hidden value keeps it hidden", () => {
  const original = fixture();
  const first = updateAccountField(original, "usd", "holder", "Persona de prueba", { showNewField: true });
  assert.equal(first.visibilityUsd.holder, true);
  const hidden = setAccountVisibility(first, "usd", false);
  const changed = updateAccountField(hidden, "usd", "holder", "Otra persona");
  assert.equal(changed.visibilityUsd.holder, false);
});

test("clearing and rewriting an initially hidden bank field never turns visibility back on", () => {
  const config = fixture();
  config.bankUsd.cbu = "CUENTA.OCULTA";
  config.visibilityUsd.cbu = false;
  const autoVisible = initialAutoVisibleFields(config);
  assert.equal(autoVisible.includes("usd.cbu"), false);
  const options = { showNewField: autoVisible.includes("usd.cbu") };
  const cleared = updateAccountField(config, "usd", "cbu", "", options);
  const rewritten = updateAccountField(cleared, "usd", "cbu", "NUEVA.CUENTA", options);
  assert.equal(rewritten.visibilityUsd.cbu, false);
  assert.equal(rewritten.bankUsd.cbu, "NUEVA.CUENTA");
});

test("legacy edits and removal stay in the legacy authority", () => {
  const original = fixture();
  const changed = updateGiftLink(original, "legacy", { url: "https://example.com/otra-lista", visible: false });
  assert.equal(changed.giftListUrl, "https://example.com/otra-lista");
  assert.equal(changed.visibility.giftListLink, false);
  assert.equal(changed.giftLinks.length, 1);
  assert.equal(original.giftListUrl, "https://example.com/lista");
  const removed = removeGiftLink(changed, "legacy");
  assert.equal(removed.giftListUrl, "");
  assert.equal(removed.giftLinks.length, 1);
});

test("hiding a gift preserves its editable content; removing affects only that link", () => {
  const original = fixture();
  const hidden = updateGiftLink(original, "coffee", { visible: false });
  assert.equal(hidden.giftLinks[0].title, "Cafetera");
  assert.equal(hidden.giftLinks[0].visible, false);
  assert.equal(original.giftLinks[0].visible, true);
  assert.equal(removeGiftLink(hidden, "coffee").giftListUrl, original.giftListUrl);
  assert.equal(removeGiftLink(hidden, "coffee").giftLinks.length, 0);
});

test("save rejects raw invalid links and images instead of silently discarding input", () => {
  for (const changes of [{ url: "javascript:alert(1)" }, { imageUrl: "http://example.com/image.jpg" }, { title: "   " }]) {
    const result = validateGiftEditorDraft(updateGiftLink(fixture(), "coffee", changes));
    assert.ok(result.error);
    assert.equal(result.linkId, "coffee");
  }
  const legacy = updateGiftLink(fixture(), "legacy", { url: "javascript:alert(1)", visible: false });
  assert.ok(validateGiftEditorDraft(legacy).error);
  assert.equal(getEditableGiftLinks(legacy)[0].url, "javascript:alert(1)");
});

test("save rejects duplicate normalized URLs including the existing list", () => {
  const config = updateGiftLink(fixture(), "coffee", { url: "example.com/lista" });
  assert.match(validateGiftEditorDraft(config).error, /ya está/);
});

test("valid save normalizes together, preserving disabled state and both account values", () => {
  const config = fixture();
  config.enabled = false;
  config.giftLinks[0].imageUrl = "https://example.com/cafe.jpg";
  const result = validateGiftEditorDraft(config);
  assert.equal(result.error, "");
  assert.equal(result.config.enabled, false);
  assert.equal(result.config.bank.alias, "pesos.fixture");
  assert.equal(result.config.bankUsd.alias, "dolares.fixture");
  assert.equal(result.config.giftLinks[0].imageUrl, "https://example.com/cafe.jpg");
  assert.equal(result.config.visibility.cbu, false);
});

test("hidden incomplete links and optional ARS fields do not block saving the USD account", () => {
  const config = createDefaultGiftConfig();
  config.bankUsd.alias = "cuenta.usd.fixture";
  config.visibilityUsd.alias = true;
  config.giftLinks = [{ id: "later", title: "", url: "", imageUrl: "", visible: false }];
  const result = validateGiftEditorDraft(config);
  assert.equal(result.error, "");
  assert.equal(result.config.bankUsd.alias, "cuenta.usd.fixture");
  assert.equal(result.config.visibility.alias, false);
  assert.equal(result.config.visibility.cbu, false);
  assert.equal(result.config.giftLinks[0].visible, false);
});
