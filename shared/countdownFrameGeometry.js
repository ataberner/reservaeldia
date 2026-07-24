import runtime from "./countdownFrameGeometry.cjs";

export const COUNTDOWN_FRAME_SCALE_LIMITS =
  runtime.COUNTDOWN_FRAME_SCALE_LIMITS;
export const normalizeCountdownFrameScale =
  runtime.normalizeCountdownFrameScale;
export const normalizeCountdownRect =
  runtime.normalizeCountdownRect;
export const resolveCountdownRectUnion =
  runtime.resolveCountdownRectUnion;
export const resolveContainedCountdownFrameRect =
  runtime.resolveContainedCountdownFrameRect;
export const resolveCenteredScaledFrameRect =
  runtime.resolveCenteredScaledFrameRect;
export const resolveCountdownSelectionGeometry =
  runtime.resolveCountdownSelectionGeometry;
export const resolveCountdownBoundsXWithinCanvas =
  runtime.resolveCountdownBoundsXWithinCanvas;
export const resolveCountdownFrameVisualBounds =
  runtime.resolveCountdownFrameVisualBounds;

export default runtime;
