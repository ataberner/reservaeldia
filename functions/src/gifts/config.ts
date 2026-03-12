export type GiftBankFields = {
  holder: string;
  bank: string;
  alias: string;
  cbu: string;
  cuit: string;
};

export type GiftVisibility = {
  holder: boolean;
  bank: boolean;
  alias: boolean;
  cbu: boolean;
  cuit: boolean;
  giftListLink: boolean;
};

export type GiftsConfigV1 = {
  version: 1;
  enabled: boolean;
  introText: string;
  bank: GiftBankFields;
  visibility: GiftVisibility;
  giftListUrl: string;
};

export type GiftsConfig = GiftsConfigV1;

export const GIFT_CONFIG_VERSION = 1;

export const GIFT_DEFAULT_INTRO_TEXT =
  "Lo mas importante es compartir este dia con ustedes. Si ademas desean hacernos un regalo, pueden hacerlo por alguno de los siguientes medios.";

export const GIFT_DEFAULT_VISIBILITY: GiftVisibility = Object.freeze({
  holder: false,
  bank: false,
  alias: true,
  cbu: true,
  cuit: false,
  giftListLink: false,
});

function sanitizeText(value: unknown, fallback = "", maxLength = 160): string {
  if (value === null || typeof value === "undefined") return fallback;
  const next = String(value).replace(/\s+/g, " ").trim();
  if (!next) return fallback;
  return next.slice(0, maxLength);
}

function sanitizeLongText(value: unknown, fallback = "", maxLength = 480): string {
  if (value === null || typeof value === "undefined") return fallback;
  const next = String(value).trim();
  if (!next) return fallback;
  return next.slice(0, maxLength);
}

function sanitizeBoolean(value: unknown, fallback = false): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "si", "yes"].includes(normalized)) return true;
    if (["false", "0", "no"].includes(normalized)) return false;
  }
  return fallback;
}

function sanitizeExternalUrl(value: unknown): string {
  const raw = String(value || "").trim();
  if (!raw) return "";

  const withProtocol =
    /^(https?:)?\/\//i.test(raw)
      ? raw.startsWith("//")
        ? `https:${raw}`
        : raw
      : /^[\w.-]+\.[a-z]{2,}(\/.*)?$/i.test(raw)
        ? `https://${raw}`
        : raw;

  try {
    const url = new URL(withProtocol);
    if (!["http:", "https:"].includes(url.protocol)) return "";
    return url.toString();
  } catch {
    return "";
  }
}

export function createDefaultGiftConfig(): GiftsConfigV1 {
  return {
    version: GIFT_CONFIG_VERSION,
    enabled: true,
    introText: GIFT_DEFAULT_INTRO_TEXT,
    bank: {
      holder: "",
      bank: "",
      alias: "",
      cbu: "",
      cuit: "",
    },
    visibility: { ...GIFT_DEFAULT_VISIBILITY },
    giftListUrl: "",
  };
}

export function isGiftConfigV1(value: unknown): value is GiftsConfigV1 {
  return Boolean(
    value &&
      typeof value === "object" &&
      Number((value as Record<string, unknown>).version) === GIFT_CONFIG_VERSION &&
      (value as Record<string, unknown>).bank &&
      typeof (value as Record<string, unknown>).bank === "object" &&
      (value as Record<string, unknown>).visibility &&
      typeof (value as Record<string, unknown>).visibility === "object"
  );
}

export function normalizeGiftConfig(
  rawConfig: unknown,
  options: { forceEnabled?: boolean } = {}
): GiftsConfigV1 {
  const source =
    rawConfig && typeof rawConfig === "object"
      ? (rawConfig as Record<string, any>)
      : {};
  const defaults = createDefaultGiftConfig();
  const forceEnabled = options.forceEnabled !== false;

  return {
    version: GIFT_CONFIG_VERSION,
    enabled: forceEnabled ? source.enabled !== false : sanitizeBoolean(source.enabled, false),
    introText: sanitizeLongText(source.introText, defaults.introText, 480),
    bank: {
      holder: sanitizeText(source?.bank?.holder, "", 120),
      bank: sanitizeText(source?.bank?.bank, "", 120),
      alias: sanitizeText(source?.bank?.alias, "", 120),
      cbu: sanitizeText(source?.bank?.cbu, "", 120),
      cuit: sanitizeText(source?.bank?.cuit, "", 120),
    },
    visibility: {
      holder: sanitizeBoolean(source?.visibility?.holder, defaults.visibility.holder),
      bank: sanitizeBoolean(source?.visibility?.bank, defaults.visibility.bank),
      alias: sanitizeBoolean(source?.visibility?.alias, defaults.visibility.alias),
      cbu: sanitizeBoolean(source?.visibility?.cbu, defaults.visibility.cbu),
      cuit: sanitizeBoolean(source?.visibility?.cuit, defaults.visibility.cuit),
      giftListLink: sanitizeBoolean(
        source?.visibility?.giftListLink,
        defaults.visibility.giftListLink
      ),
    },
    giftListUrl: sanitizeExternalUrl(source.giftListUrl),
  };
}
