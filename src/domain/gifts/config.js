// Canonical pure domain implementation shared with server-side AI validation.
import runtime from "../../../shared/giftsConfig.cjs";
export const GIFT_CONFIG_VERSION = runtime.GIFT_CONFIG_VERSION;
export const GIFT_DEFAULT_INTRO_TEXT = runtime.GIFT_DEFAULT_INTRO_TEXT;
export const GIFT_DEFAULT_VISIBILITY = runtime.GIFT_DEFAULT_VISIBILITY;
export const createDefaultGiftConfig = runtime.createDefaultGiftConfig;
export const isGiftConfigV1 = runtime.isGiftConfigV1;
export const normalizeGiftConfig = runtime.normalizeGiftConfig;
export const hasVisibleGiftMethods = runtime.hasVisibleGiftMethods;
