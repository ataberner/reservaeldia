import runtime from "./eventDetailsConfig.cjs";

export const DEFAULT_DRESS_CODE_CONFIG = runtime.DEFAULT_DRESS_CODE_CONFIG;
export const DEFAULT_EVENT_DETAILS_MODE = runtime.DEFAULT_EVENT_DETAILS_MODE;
export const EVENT_DETAILS_MODES = runtime.EVENT_DETAILS_MODES;
export const normalizeDressCodeConfig = runtime.normalizeDressCodeConfig;
export const normalizeEventDetailsConfig = runtime.normalizeEventDetailsConfig;
export const normalizeEventDetailsMode = runtime.normalizeEventDetailsMode;
export const resolveEventDetailsEnabledState = runtime.resolveEventDetailsEnabledState;

export default runtime;
