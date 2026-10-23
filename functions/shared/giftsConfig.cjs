const GIFT_CONFIG_VERSION = 2;
const GIFT_MAX_LINKS = 30;
const GIFT_BANK_FIELDS = Object.freeze(["holder", "bank", "alias", "cbu", "cuit"]);

const GIFT_DEFAULT_INTRO_TEXT =
  "Lo mas importante es compartir este dia con ustedes. Si ademas desean hacernos un regalo, pueden hacerlo por alguno de los siguientes medios.";

const GIFT_DEFAULT_VISIBILITY = Object.freeze({
  holder: false,
  bank: false,
  alias: true,
  cbu: true,
  cuit: false,
  giftListLink: false,
});

const GIFT_DEFAULT_USD_VISIBILITY = Object.freeze({
  holder: false,
  bank: false,
  alias: false,
  cbu: false,
  cuit: false,
});

function sanitizeText(value, fallback = "", maxLength = 160) {
  if (value === null || typeof value === "undefined") return fallback;
  const next = String(value).replace(/\s+/g, " ").trim();
  if (!next) return fallback;
  return next.slice(0, maxLength);
}

function sanitizeLongText(value, fallback = "", maxLength = 480) {
  if (value === null || typeof value === "undefined") return fallback;
  const next = String(value).trim();
  if (!next) return fallback;
  return next.slice(0, maxLength);
}

function sanitizeBoolean(value, fallback = false) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "si", "yes"].includes(normalized)) return true;
    if (["false", "0", "no"].includes(normalized)) return false;
  }
  return fallback;
}

function sanitizeUrl(value, allowedProtocols) {
  if (typeof value !== "string") return "";
  const raw = value.trim();
  if (!raw || raw.length > 2048) return "";
  if (Array.from(raw).some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)) {
    return "";
  }
  const withProtocol =
    /^(https?:)?\/\//i.test(raw)
      ? raw.startsWith("//")
        ? `https:${raw}`
        : raw
      : /^[\w.-]+\.[a-z]{2,}(?::\d+)?([/?#].*)?$/i.test(raw)
        ? `https://${raw}`
        : raw;

  try {
    const url = new URL(withProtocol);
    if (!allowedProtocols.includes(url.protocol) || !url.hostname || url.username || url.password) {
      return "";
    }
    const normalized = url.toString();
    return normalized.length <= 2048 ? normalized : "";
  } catch {
    return "";
  }
}

function sanitizeGiftLinkUrl(value) {
  return sanitizeUrl(value, ["http:", "https:"]);
}

function sanitizeGiftImageUrl(value) {
  return sanitizeUrl(value, ["https:"]);
}

function normalizeBank(source) {
  return Object.fromEntries(GIFT_BANK_FIELDS.map((key) => [key, sanitizeText(source?.[key], "", 120)]));
}

function normalizeBankVisibility(source, defaults) {
  return Object.fromEntries(GIFT_BANK_FIELDS.map((key) => [key, sanitizeBoolean(source?.[key], defaults[key])]));
}

function createDefaultGiftConfig() {
  return {
    version: GIFT_CONFIG_VERSION,
    enabled: true,
    introText: GIFT_DEFAULT_INTRO_TEXT,
    bank: normalizeBank(null),
    visibility: { ...GIFT_DEFAULT_VISIBILITY },
    giftListUrl: "",
    bankUsd: normalizeBank(null),
    visibilityUsd: { ...GIFT_DEFAULT_USD_VISIBILITY },
    giftLinks: [],
  };
}

function hasGiftConfigShape(value) {
  return Boolean(
    value && typeof value === "object" && !Array.isArray(value) &&
    value.bank && typeof value.bank === "object" && !Array.isArray(value.bank) &&
    value.visibility && typeof value.visibility === "object" && !Array.isArray(value.visibility)
  );
}

function isGiftConfigV1(value) {
  return hasGiftConfigShape(value) && Number(value.version) === 1;
}

function isGiftConfig(value) {
  return hasGiftConfigShape(value) && [1, GIFT_CONFIG_VERSION].includes(Number(value.version));
}

function fallbackLinkId(url, index) {
  if (!url) return `gift-${index + 1}`;
  let hash = 2166136261;
  for (let index = 0; index < url.length; index += 1) {
    hash = Math.imul(hash ^ url.charCodeAt(index), 16777619) >>> 0;
  }
  return `gift-${hash.toString(36)}`;
}

function normalizeGiftLinks(rawLinks) {
  if (!Array.isArray(rawLinks)) return [];
  const urls = new Set();
  const ids = new Set(["legacy"]);
  const links = [];
  for (const [index, source] of rawLinks.slice(0, GIFT_MAX_LINKS).entries()) {
    if (!source || typeof source !== "object" || Array.isArray(source)) continue;
    const url = sanitizeGiftLinkUrl(source.url);
    if (url && urls.has(url)) continue;
    const requestedId = typeof source.id === "string" && /^[a-zA-Z0-9_-]{1,64}$/.test(source.id)
      ? source.id
      : fallbackLinkId(url, index);
    let id = requestedId;
    let suffix = 2;
    while (ids.has(id)) id = `${requestedId.slice(0, 55)}-${suffix++}`;
    ids.add(id);
    if (url) urls.add(url);
    links.push({
      id,
      url,
      title: typeof source.title === "string" ? sanitizeText(source.title, "", 120) : "",
      imageUrl: sanitizeGiftImageUrl(source.imageUrl),
      visible: sanitizeBoolean(source.visible, true),
    });
    if (links.length >= GIFT_MAX_LINKS) break;
  }
  return links;
}

function normalizeGiftConfig(rawConfig, options = {}) {
  const source = rawConfig && typeof rawConfig === "object" ? rawConfig : {};
  const defaults = createDefaultGiftConfig();
  const forceEnabled = options.forceEnabled !== false;

  return {
    version: GIFT_CONFIG_VERSION,
    enabled: forceEnabled ? source.enabled !== false : sanitizeBoolean(source.enabled, false),
    introText: sanitizeLongText(source.introText, defaults.introText, 480),
    // The original fields remain the ARS authority for existing drafts and AI actions.
    bank: normalizeBank(source.bank),
    visibility: {
      ...normalizeBankVisibility(source.visibility, defaults.visibility),
      giftListLink: sanitizeBoolean(source?.visibility?.giftListLink, defaults.visibility.giftListLink),
    },
    giftListUrl: sanitizeGiftLinkUrl(source.giftListUrl),
    bankUsd: normalizeBank(source.bankUsd),
    visibilityUsd: normalizeBankVisibility(source.visibilityUsd, defaults.visibilityUsd),
    giftLinks: normalizeGiftLinks(source.giftLinks),
  };
}

function getGiftAccounts(config) {
  const normalized = normalizeGiftConfig(config, { forceEnabled: false });
  return [
    { id: "ars", currency: "ARS", bank: normalized.bank, visibility: normalized.visibility },
    { id: "usd", currency: "USD", bank: normalized.bankUsd, visibility: normalized.visibilityUsd },
  ];
}

function getGiftLinks(config) {
  const normalized = normalizeGiftConfig(config, { forceEnabled: false });
  const legacy = normalized.giftListUrl || normalized.visibility.giftListLink
    ? [{ id: "legacy", url: normalized.giftListUrl, title: "Lista de regalos", imageUrl: "", visible: normalized.visibility.giftListLink }]
    : [];
  return [...legacy, ...normalized.giftLinks];
}

function hasVisibleGiftMethods(config) {
  const normalized = normalizeGiftConfig(config, { forceEnabled: false });
  if (!normalized.enabled) return false;
  return getGiftAccounts(normalized).some(({ bank, visibility }) =>
    GIFT_BANK_FIELDS.some((key) => visibility[key] && Boolean(bank[key]))
  ) || getGiftLinks(normalized).some((link) => link.visible && Boolean(link.url));
}

module.exports = {
  GIFT_CONFIG_VERSION,
  GIFT_MAX_LINKS,
  GIFT_BANK_FIELDS,
  GIFT_DEFAULT_INTRO_TEXT,
  GIFT_DEFAULT_VISIBILITY,
  GIFT_DEFAULT_USD_VISIBILITY,
  createDefaultGiftConfig,
  isGiftConfigV1,
  isGiftConfig,
  normalizeGiftConfig,
  getGiftAccounts,
  getGiftLinks,
  hasVisibleGiftMethods,
  sanitizeGiftLinkUrl,
  sanitizeGiftImageUrl,
};
