const DEFAULT_EDITOR_CONSOLE_DEBUG_FLAGS = Object.freeze({
  __DBG_CANVAS_DRAG_PERF: false,
  __CANVAS_DRAG_PERF_EXPANDED: false,
  __CANVAS_DRAG_PERF_VERBOSE_CONSOLE: false,
  __DEBUG_SELECTED_DRAG: false,
  __EDITOR_PRELOAD_DEBUG: false,
  __INLINE_DEBUG: false,
  __INLINE_MICROMOVE_DEBUG: false,
  __DBG_INLINE_INTENT: false,
  __INLINE_FOCUS_RCA: false,
  __INLINE_DIAG_ALIGNMENT: false,
  __INLINE_DIAG_ALIGNMENT_EXTENDED: false,
  __INLINE_DIAG_COMPACT: true,
  __DBG_IMAGE_RESIZE: false,
  __DBG_IMAGE_RESIZE_VERBOSE_CONSOLE: false,
  __DBG_IMAGE_ROTATION: false,
  __DBG_IMAGE_ROTATION_VERBOSE_CONSOLE: false,
  __DBG_TEXT_RESIZE: false,
  __DBG_TR: false,
  __INLINE_CANVAS_TEXT_DEBUG: false,
  __INLINE_BOX_DEBUG: false,
});

export function applyDefaultEditorConsoleDebugFlags(target = null) {
  const resolvedTarget =
    target ||
    (typeof window !== "undefined" ? window : null);

  if (!resolvedTarget) return;

  Object.entries(DEFAULT_EDITOR_CONSOLE_DEBUG_FLAGS).forEach(([flagName, defaultValue]) => {
    if (typeof resolvedTarget[flagName] === "undefined") {
      resolvedTarget[flagName] = defaultValue;
    }
  });
}

export { DEFAULT_EDITOR_CONSOLE_DEBUG_FLAGS };
