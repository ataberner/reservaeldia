import runtime from "./countdownEventDetails.cjs";

export const buildCountdownTargetIsoFromLocalParts =
  runtime.buildCountdownTargetIsoFromLocalParts;
export const buildDynamicCountdownProjectionPatches =
  runtime.buildDynamicCountdownProjectionPatches;
export const buildDynamicCountdownEventDetails =
  runtime.buildDynamicCountdownEventDetails;
export const collectCountdownObjects = runtime.collectCountdownObjects;
export const collectDynamicCountdownBindings =
  runtime.collectDynamicCountdownBindings;
export const findDynamicCountdownBinding =
  runtime.findDynamicCountdownBinding;
export const isCountdownVisible = runtime.isCountdownVisible;
export const mergeCountdownTargetLocalParts =
  runtime.mergeCountdownTargetLocalParts;
export const resolveCanonicalCountdownTargetIso =
  runtime.resolveCanonicalCountdownTargetIso;
export const resolveCountdownTargetValue = runtime.resolveCountdownTargetValue;
export const splitCountdownTargetIso = runtime.splitCountdownTargetIso;

export default runtime;
