import test from "node:test";
import assert from "node:assert/strict";
import { normalizeGiftConfig } from "./config.js";
import { normalizeDraftRenderState } from "../drafts/sourceOfTruth.js";
import { buildDashboardPreviewRenderPayload } from "../dashboard/previewSession.js";
import { readEditorRenderSnapshot, syncEditorSnapshotRenderState } from "../../lib/editorSnapshotAdapter.js";
import reducers from "../../../shared/designerAiConfigReducers.cjs";

const giftFixture = () => normalizeGiftConfig({
  enabled: true,
  bank: { alias: "PESOS.EJEMPLO" }, visibility: { alias: true, cbu: false, giftListLink: true },
  giftListUrl: "https://regalos.example/lista-anterior",
  bankUsd: { holder: "Titular de ejemplo", alias: "USD.EJEMPLO", cbu: "DATO.OCULTO" },
  visibilityUsd: { holder: true, alias: true, cbu: false },
  giftLinks: [
    { id: "cafetera", url: "https://tienda.example/cafetera", title: "Cafetera", imageUrl: "https://img.example/cafe.jpg", visible: true },
    { id: "oculto", url: "https://tienda.example/oculto", title: "Regalo oculto", visible: false },
  ],
});

test("gift accounts, images, links and hidden values survive editor snapshot, draft reload and preview preparation", () => {
  const gifts = giftFixture();
  const editor = {};
  syncEditorSnapshotRenderState({ objetos: [], secciones: [], gifts }, editor);
  const saved = JSON.parse(JSON.stringify(readEditorRenderSnapshot(editor)));
  const hydrated = normalizeDraftRenderState(saved);
  const preview = buildDashboardPreviewRenderPayload(hydrated);
  assert.deepEqual(hydrated.gifts, gifts);
  assert.deepEqual(preview.giftPreviewConfig, gifts);
  assert.equal(preview.giftPreviewConfig.bankUsd.alias, "USD.EJEMPLO");
  assert.equal(preview.giftPreviewConfig.visibilityUsd.cbu, false);
  assert.equal(preview.giftPreviewConfig.giftLinks.length, 2);
  assert.equal(preview.giftPreviewConfig.giftLinks[1].visible, false);
  hydrated.gifts.bankUsd.alias = "CAMBIO.LOCAL";
  assert.equal(readEditorRenderSnapshot(editor).gifts.bankUsd.alias, "USD.EJEMPLO");
});

test("legacy Designer AI actions preserve the manually configured dollar account and gift cards", () => {
  const original = giftFixture();
  const actions = [
    { type: "gifts.set_enabled", arguments: { enabled: false } },
    { type: "gifts.set_enabled", arguments: { enabled: true } },
    { type: "gifts.set_method", arguments: { method: "alias", value: "NUEVO.PESOS", visible: true } },
    { type: "gifts.set_method", arguments: { method: "giftListLink", value: "https://lista.example/nueva", visible: true } },
    { type: "gifts.set_intro_text", arguments: { text: "Gracias por acompañarnos" } },
  ];
  let config = original;
  const confirmed = new Set(["alias", "giftListLink"]);
  for (const action of actions) {
    config = reducers.applySelectedGiftAction(config, action, confirmed);
    assert.deepEqual(config.bankUsd, original.bankUsd);
    assert.deepEqual(config.visibilityUsd, original.visibilityUsd);
    assert.deepEqual(config.giftLinks, original.giftLinks);
  }
  assert.equal(config.bank.alias, "NUEVO.PESOS");
  assert.equal(config.giftListUrl, "https://lista.example/nueva");
});
