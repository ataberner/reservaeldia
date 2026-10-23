const test = require("node:test");
const assert = require("node:assert/strict");
const {
  GIFT_MAX_LINKS,
  createDefaultGiftConfig,
  isGiftConfig,
  isGiftConfigV1,
  normalizeGiftConfig,
  getGiftAccounts,
  getGiftLinks,
  hasVisibleGiftMethods,
  sanitizeGiftLinkUrl,
  sanitizeGiftImageUrl,
} = require("./giftsConfig.cjs");
const { applySelectedGiftAction } = require("./designerAiConfigReducers.cjs");

test("V1 gifts normalize additively with existing visibility and legacy list intact", () => {
  const legacy = {
    version: 1,
    enabled: true,
    bank: { holder: " Pareja de prueba ", alias: "cuenta.pesos", cbu: "0000000000000000000001" },
    visibility: { holder: false, alias: true, cbu: false, giftListLink: true },
    giftListUrl: "regalos.example.com/lista",
  };
  const normalized = normalizeGiftConfig(legacy);
  assert.equal(normalized.version, 2);
  assert.equal(normalized.bank.holder, "Pareja de prueba");
  assert.equal(normalized.visibility.holder, false);
  assert.equal(normalized.visibility.cbu, false);
  assert.equal(normalized.giftListUrl, "https://regalos.example.com/lista");
  assert.equal(normalized.visibility.giftListLink, true);
  assert.deepEqual(normalized.giftLinks, []);
  assert.ok(Object.values(normalized.bankUsd).every((value) => value === ""));
  assert.ok(Object.values(normalized.visibilityUsd).every((value) => value === false));
  assert.equal(isGiftConfigV1(legacy), true);
  assert.equal(isGiftConfig(legacy), true);
  assert.equal(isGiftConfigV1(normalized), false);
  assert.equal(isGiftConfig(normalized), true);
  assert.equal(isGiftConfig({ ...normalized, version: 3 }), false);
  assert.equal(isGiftConfig(null), false);
});

test("ARS and USD preserve their own values and visibility without enabling stored USD data", () => {
  const config = normalizeGiftConfig({
    bank: { alias: "regalo.pesos" },
    visibility: { alias: true },
    bankUsd: { alias: " regalo.dolares ", bank: "Banco USD" },
    visibilityUsd: { alias: "yes" },
  });
  const accounts = getGiftAccounts(config);
  assert.deepEqual(accounts.map(({ id, currency }) => ({ id, currency })), [
    { id: "ars", currency: "ARS" },
    { id: "usd", currency: "USD" },
  ]);
  assert.equal(accounts[0].bank.alias, "regalo.pesos");
  assert.equal(accounts[1].bank.alias, "regalo.dolares");
  assert.equal(accounts[1].visibility.alias, true);
  assert.equal(accounts[1].bank.bank, "Banco USD");
  assert.equal(accounts[1].visibility.bank, false);
  const hidden = normalizeGiftConfig({ ...config, visibilityUsd: {} });
  assert.equal(hidden.bankUsd.alias, "regalo.dolares");
  assert.equal(hidden.visibilityUsd.alias, false);
});

test("gift links keep legacy separate and preserve editable hidden card values", () => {
  const config = normalizeGiftConfig({
    giftListUrl: "https://example.com/lista",
    visibility: { giftListLink: false },
    giftLinks: [
      { id: "cafetera", url: "example.com/cafetera", title: " Cafetera  de prueba ", imageUrl: "https://images.example.com/cafetera.jpg", visible: false },
      { id: "viaje", url: "https://example.com/viaje", title: "Viaje", visible: true },
    ],
  });
  assert.equal(config.giftLinks.length, 2);
  assert.deepEqual(getGiftLinks(config).map(({ id, visible }) => ({ id, visible })), [
    { id: "legacy", visible: false },
    { id: "cafetera", visible: false },
    { id: "viaje", visible: true },
  ]);
  assert.equal(config.giftLinks[0].title, "Cafetera de prueba");
  assert.equal(config.giftLinks[0].imageUrl, "https://images.example.com/cafetera.jpg");
  assert.deepEqual(normalizeGiftConfig(config), config);
});

test("unsafe URLs are rejected and preview images require HTTPS", () => {
  for (const unsafe of [
    "javascript:alert(1)", "data:text/html,<script></script>", "file:///tmp/test",
    "ftp://example.com/gift", "https://user:secret@example.com/gift",
    "https://user@example.com/gift", "java\nscript:alert(1)", "https://example.com/\nsecret",
    "/relative", "https://example.com/" + "a".repeat(2048),
  ]) {
    assert.equal(sanitizeGiftLinkUrl(unsafe), "", unsafe);
    assert.equal(sanitizeGiftImageUrl(unsafe), "", unsafe);
  }
  assert.equal(sanitizeGiftLinkUrl(" //example.com/producto "), "https://example.com/producto");
  assert.equal(sanitizeGiftLinkUrl("http://example.com/producto"), "http://example.com/producto");
  assert.equal(sanitizeGiftImageUrl("http://example.com/image.jpg"), "");
  assert.equal(sanitizeGiftImageUrl("images.example.com/image.jpg"), "https://images.example.com/image.jpg");
  assert.equal(sanitizeGiftLinkUrl({ url: "https://example.com" }), "");
  const config = normalizeGiftConfig({
    giftListUrl: "https://user:secret@example.com/lista",
    giftLinks: [{ url: "javascript:alert(1)", imageUrl: "data:image/svg+xml,<svg/>", title: "Editable", visible: true }],
  });
  assert.equal(config.giftListUrl, "");
  assert.equal(config.giftLinks[0].url, "");
  assert.equal(config.giftLinks[0].imageUrl, "");
  assert.equal(config.giftLinks[0].title, "Editable");
  assert.equal(hasVisibleGiftMethods(config), false);
});

test("links deduplicate normalized URLs and maintain stable unique safe IDs", () => {
  const input = {
    giftLinks: [
      { id: "legacy", url: "example.com/producto", title: "Primero" },
      { id: "duplicado", url: "https://example.com/producto", title: "Segundo" },
      { id: "legacy", url: "https://example.com/otro" },
      { id: "<unsafe>", url: "https://example.com/tercero" },
      { url: "", title: "Pendiente" },
    ],
  };
  const normalized = normalizeGiftConfig(input);
  assert.equal(normalized.giftLinks.length, 4);
  assert.equal(normalized.giftLinks[0].title, "Primero");
  assert.equal(new Set(normalized.giftLinks.map(({ id }) => id)).size, 4);
  assert.ok(normalized.giftLinks.every(({ id }) => id !== "legacy" && /^[a-zA-Z0-9_-]{1,64}$/.test(id)));
  assert.deepEqual(normalizeGiftConfig(normalized), normalized);
  assert.deepEqual(normalizeGiftConfig(input), normalized);
  const withoutIds = input.giftLinks.slice(2, 4).map(({ url }) => ({ url }));
  const forward = normalizeGiftConfig({ giftLinks: withoutIds }).giftLinks;
  const reverse = normalizeGiftConfig({ giftLinks: [...withoutIds].reverse() }).giftLinks;
  assert.equal(forward[0].id, reverse[1].id);
});

test("untrusted collection and text sizes are bounded without mutating input", () => {
  const input = {
    introText: "i".repeat(600),
    bankUsd: { alias: "a".repeat(200) },
    giftLinks: Array.from({ length: GIFT_MAX_LINKS + 5 }, (_, index) => ({
      url: `https://example.com/gift/${index}`,
      title: "t".repeat(300),
    })),
  };
  const original = JSON.stringify(input);
  const config = normalizeGiftConfig(input);
  assert.equal(config.giftLinks.length, GIFT_MAX_LINKS);
  assert.equal(config.introText.length, 480);
  assert.equal(config.bankUsd.alias.length, 120);
  assert.ok(config.giftLinks.every(({ title }) => title.length === 120));
  assert.equal(JSON.stringify(input), original);
  assert.deepEqual(normalizeGiftConfig({ giftLinks: {} }).giftLinks, []);
  assert.deepEqual(normalizeGiftConfig({ giftLinks: [null, 1, [], "url"] }).giftLinks, []);
});

test("readiness requires an enabled visible complete account or link in every modality", () => {
  for (const methods of [
    { bank: { alias: "pesos" }, visibility: { alias: true } },
    { bankUsd: { alias: "dolares" }, visibilityUsd: { alias: true } },
    { giftListUrl: "https://example.com/lista", visibility: { giftListLink: true } },
    { giftLinks: [{ url: "https://example.com/producto", visible: true }] },
  ]) {
    assert.equal(hasVisibleGiftMethods({ ...methods, enabled: true }), true);
    assert.equal(hasVisibleGiftMethods({ ...methods, enabled: false }), false);
    assert.equal(hasVisibleGiftMethods(methods), false);
  }
  assert.equal(hasVisibleGiftMethods({ enabled: true, bankUsd: { alias: "dolares" } }), false);
  assert.equal(hasVisibleGiftMethods({ enabled: true, giftLinks: [{ url: "https://example.com/producto", visible: false }] }), false);
  assert.equal(hasVisibleGiftMethods({ enabled: true, visibilityUsd: { alias: true } }), false);
  assert.equal(hasVisibleGiftMethods(createDefaultGiftConfig()), false);
  assert.deepEqual(getGiftLinks({ visibility: { giftListLink: true } }), [
    { id: "legacy", url: "", title: "Lista de regalos", imageUrl: "", visible: true },
  ]);
});

test("legacy AI actions preserve new USD accounts and gift cards", () => {
  const original = normalizeGiftConfig({
    bankUsd: { alias: "dolares" }, visibilityUsd: { alias: true },
    giftLinks: [{ id: "gift", url: "https://example.com/producto", title: "Producto", visible: true }],
  });
  let config = applySelectedGiftAction(original, {
    type: "gifts.set_method", arguments: { method: "alias", value: "pesos.nuevo", visible: true },
  }, new Set());
  assert.equal(config.bank.alias, "pesos.nuevo");
  assert.deepEqual(config.bankUsd, original.bankUsd);
  assert.deepEqual(config.visibilityUsd, original.visibilityUsd);
  assert.deepEqual(config.giftLinks, original.giftLinks);
  config = applySelectedGiftAction(config, {
    type: "gifts.set_enabled", arguments: { enabled: false },
  }, new Set());
  assert.equal(config.enabled, false);
  assert.deepEqual(config.giftLinks, original.giftLinks);
});
