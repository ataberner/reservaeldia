// Canonical pure domain implementation shared with server-side AI validation.
import runtime from "../../../shared/giftsConfig.cjs";
export const GIFT_CONFIG_VERSION = runtime.GIFT_CONFIG_VERSION;
export const GIFT_MAX_LINKS = runtime.GIFT_MAX_LINKS;
export const GIFT_BANK_FIELDS = runtime.GIFT_BANK_FIELDS;
export const GIFT_DEFAULT_INTRO_TEXT = runtime.GIFT_DEFAULT_INTRO_TEXT;
export const GIFT_DEFAULT_VISIBILITY = runtime.GIFT_DEFAULT_VISIBILITY;
export const GIFT_DEFAULT_USD_VISIBILITY = runtime.GIFT_DEFAULT_USD_VISIBILITY;
export const createDefaultGiftConfig = runtime.createDefaultGiftConfig;
export const isGiftConfigV1 = runtime.isGiftConfigV1;
export const isGiftConfig = runtime.isGiftConfig;
export const normalizeGiftConfig = runtime.normalizeGiftConfig;
export const hasVisibleGiftMethods = runtime.hasVisibleGiftMethods;
export const getGiftAccounts = runtime.getGiftAccounts;
export const getGiftLinks = runtime.getGiftLinks;
export const sanitizeGiftLinkUrl = runtime.sanitizeGiftLinkUrl;
export const sanitizeGiftImageUrl = runtime.sanitizeGiftImageUrl;
