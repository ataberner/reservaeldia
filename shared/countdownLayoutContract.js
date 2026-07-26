import runtime from "./countdownLayoutContract.cjs";

export const COUNTDOWN_DEFAULT_VISIBLE_UNITS =
  runtime.COUNTDOWN_DEFAULT_VISIBLE_UNITS;
export const COUNTDOWN_LAYOUT_DEFAULTS = runtime.COUNTDOWN_LAYOUT_DEFAULTS;
export const normalizeCountdownVisibleUnits =
  runtime.normalizeCountdownVisibleUnits;
export const estimateCountdownUnitHeight =
  runtime.estimateCountdownUnitHeight;
export const resolveCountdownUnitWidth = runtime.resolveCountdownUnitWidth;
export const buildCountdownEditorialWidths =
  runtime.buildCountdownEditorialWidths;
export const resolveCountdownLayoutMetrics =
  runtime.resolveCountdownLayoutMetrics;

export default runtime;
