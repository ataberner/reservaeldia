// Typed adapter; canonical normalization lives in shared/giftsConfig.cjs.
const runtime = require("../../shared/giftsConfig.cjs");

export type GiftBankFields = {
  holder: string;
  bank: string;
  alias: string;
  cbu: string;
  cuit: string;
};

export type GiftBankVisibility = Record<keyof GiftBankFields, boolean>;
export type GiftVisibility = GiftBankVisibility & { giftListLink: boolean };

export type GiftLink = {
  id: string;
  url: string;
  title: string;
  imageUrl: string;
  visible: boolean;
};

export type GiftsConfigV1 = {
  version: 1;
  enabled: boolean;
  introText: string;
  bank: GiftBankFields;
  visibility: GiftVisibility;
  giftListUrl: string;
};

export type GiftsConfigV2 = Omit<GiftsConfigV1, "version"> & {
  version: 2;
  bankUsd: GiftBankFields;
  visibilityUsd: GiftBankVisibility;
  giftLinks: GiftLink[];
};

export type GiftsConfig = GiftsConfigV2;
export type GiftAccount = {
  id: "ars" | "usd";
  currency: "ARS" | "USD";
  bank: GiftBankFields;
  visibility: GiftBankVisibility;
};

export const GIFT_CONFIG_VERSION: 2 = runtime.GIFT_CONFIG_VERSION;
export const GIFT_MAX_LINKS: number = runtime.GIFT_MAX_LINKS;
export const GIFT_BANK_FIELDS: ReadonlyArray<keyof GiftBankFields> = runtime.GIFT_BANK_FIELDS;
export const GIFT_DEFAULT_INTRO_TEXT: string = runtime.GIFT_DEFAULT_INTRO_TEXT;
export const GIFT_DEFAULT_VISIBILITY: Readonly<GiftVisibility> = runtime.GIFT_DEFAULT_VISIBILITY;
export const GIFT_DEFAULT_USD_VISIBILITY: Readonly<GiftBankVisibility> = runtime.GIFT_DEFAULT_USD_VISIBILITY;

export function createDefaultGiftConfig(): GiftsConfig {
  return runtime.createDefaultGiftConfig();
}

export function isGiftConfigV1(value: unknown): value is GiftsConfigV1 {
  return runtime.isGiftConfigV1(value);
}

export function isGiftConfig(value: unknown): value is GiftsConfigV1 | GiftsConfigV2 {
  return runtime.isGiftConfig(value);
}

export function normalizeGiftConfig(
  value: unknown,
  options: { forceEnabled?: boolean } = {}
): GiftsConfig {
  return runtime.normalizeGiftConfig(value, options);
}

export function getGiftAccounts(value: unknown): GiftAccount[] {
  return runtime.getGiftAccounts(value);
}

export function getGiftLinks(value: unknown): GiftLink[] {
  return runtime.getGiftLinks(value);
}

export function hasVisibleGiftMethods(value: unknown): boolean {
  return runtime.hasVisibleGiftMethods(value);
}

export function sanitizeGiftLinkUrl(value: unknown): string {
  return runtime.sanitizeGiftLinkUrl(value);
}

export function sanitizeGiftImageUrl(value: unknown): string {
  return runtime.sanitizeGiftImageUrl(value);
}
