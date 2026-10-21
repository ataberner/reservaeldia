// Konva 9.3.20 retains _lastPos between gestures, including after React restores
// a pose (undo or rejected drag). Its first _setDragPosition can then skip a
// valid destination. Invalidate only at an accepted native dragstart, before
// Konva applies the first sample; retain native deduplication within the gesture.
// Keep this compatibility access isolated and recheck konvaDragSession.test.mjs
// when upgrading Konva. No public API resets this transient cache in 9.3.20.
export function resetNativeDragPositionCache(node) {
  if (node && Object.prototype.hasOwnProperty.call(node, "_lastPos")) {
    node._lastPos = null;
  }
}
