function hasWindow() {
  return typeof window !== "undefined";
}

function parseInlineDiagFlag(value, fallback = false) {
  if (typeof value === "undefined") return fallback;
  if (value === true || value === 1 || value === "1") return true;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") return true;
    if (normalized === "false") return false;
  }
  if (value === false || value === 0 || value === "0") return false;
  return fallback;
}

function isInlineDiagCompactEnabled() {
  if (!hasWindow()) return true;
  return parseInlineDiagFlag(window.__INLINE_DIAG_COMPACT, true);
}

function toSafeElementLabel(element) {
  if (!element || !(element instanceof Element)) return null;
  const tag = String(element.tagName || "").toLowerCase();
  const id = element.id ? `#${element.id}` : "";
  const classes = element.classList?.length
    ? `.${Array.from(element.classList).slice(0, 2).join(".")}`
    : "";
  return `${tag}${id}${classes}` || tag || null;
}

function isNodeInsideEditor(editorEl, node) {
  if (!editorEl || !node) return false;
  if (node === editorEl) return true;
  if (node instanceof Element) return editorEl.contains(node);
  if (node.parentElement instanceof Element) {
    return editorEl.contains(node.parentElement);
  }
  return false;
}

export function isInlineFocusRcaDebugEnabled() {
  if (!hasWindow()) return false;
  return window.__INLINE_FOCUS_RCA === true;
}

export function buildInlineFocusOperationalSnapshot(editorEl) {
  if (!hasWindow()) {
    return {
      hasEditorNode: false,
      activeElementLabel: null,
      isActiveElementEditor: false,
      selection: null,
      hasSelectionInsideEditor: false,
      hasValidRangeInsideEditor: false,
      hasCollapsedCaretInsideEditor: false,
      focusOperationalCore: false,
    };
  }

  const activeElement = document.activeElement || null;
  const selection = window.getSelection?.() || null;
  const rangeCount = Number(selection?.rangeCount || 0);
  const range = rangeCount > 0 ? selection.getRangeAt(0) : null;
  const anchorNode = selection?.anchorNode || null;
  const focusNode = selection?.focusNode || null;
  const startContainer = range?.startContainer || null;
  const endContainer = range?.endContainer || null;
  const anchorInEditor = isNodeInsideEditor(editorEl, anchorNode);
  const focusInEditor = isNodeInsideEditor(editorEl, focusNode);
  const rangeStartInEditor = isNodeInsideEditor(editorEl, startContainer);
  const rangeEndInEditor = isNodeInsideEditor(editorEl, endContainer);
  const hasSelectionInsideEditor = Boolean(anchorInEditor && focusInEditor);
  const hasValidRangeInsideEditor = Boolean(
    rangeCount > 0 && rangeStartInEditor && rangeEndInEditor
  );
  const isCollapsed = Boolean(selection?.isCollapsed);
  const hasCollapsedCaretInsideEditor = Boolean(
    isCollapsed && hasSelectionInsideEditor && hasValidRangeInsideEditor
  );
  const isActiveElementEditor = Boolean(editorEl && activeElement === editorEl);

  return {
    hasEditorNode: Boolean(editorEl),
    activeElementLabel: toSafeElementLabel(activeElement),
    isActiveElementEditor,
    selection: {
      rangeCount,
      isCollapsed,
      anchorInEditor,
      focusInEditor,
      rangeStartInEditor,
      rangeEndInEditor,
    },
    hasSelectionInsideEditor,
    hasValidRangeInsideEditor,
    hasCollapsedCaretInsideEditor,
    focusOperationalCore: Boolean(
      isActiveElementEditor &&
      hasSelectionInsideEditor &&
      hasValidRangeInsideEditor
    ),
  };
}

function resolveSessionStateMap() {
  if (!hasWindow()) return null;
  if (!window.__INLINE_FOCUS_RCA_SESSION) {
    window.__INLINE_FOCUS_RCA_SESSION = {};
  }
  return window.__INLINE_FOCUS_RCA_SESSION;
}

function buildSessionKey(editingId, sessionId) {
  const safeEditingId = editingId || "__no-editing-id__";
  const safeSessionId = sessionId || "__no-session-id__";
  return `${safeEditingId}::${safeSessionId}`;
}

function applySessionMetrics(entry) {
  const editingId = entry?.editingId || null;
  const sessionId = entry?.sessionId || null;
  if (!editingId || !hasWindow()) return entry;
  const map = resolveSessionStateMap();
  if (!map) return entry;
  const sessionKey = buildSessionKey(editingId, sessionId);

  const previous = map[sessionKey] || {
    firstOperationalAtMs: null,
    firstInputAtMs: null,
    firstBlurAtMs: null,
    lastBlurAtMs: null,
  };
  const next = { ...previous };
  const perfNowMs = Number(entry?.perfNowMs);
  const eventName = String(entry?.eventName || "");
  const becameOperational = entry?.focusOperationalCore === true;

  if (
    becameOperational &&
    !Number.isFinite(Number(next.firstOperationalAtMs)) &&
    Number.isFinite(perfNowMs)
  ) {
    next.firstOperationalAtMs = perfNowMs;
  }
  if (
    (eventName === "input-first" || eventName === "input") &&
    !Number.isFinite(Number(next.firstInputAtMs)) &&
    Number.isFinite(perfNowMs)
  ) {
    next.firstInputAtMs = perfNowMs;
  }
  if (
    eventName === "blur" &&
    !Number.isFinite(Number(next.firstBlurAtMs)) &&
    Number.isFinite(perfNowMs)
  ) {
    next.firstBlurAtMs = perfNowMs;
  }
  if (eventName === "blur" && Number.isFinite(perfNowMs)) {
    next.lastBlurAtMs = perfNowMs;
  }

  map[sessionKey] = next;

  const safeDelta = (from, to) => {
    if (!Number.isFinite(Number(from)) || !Number.isFinite(Number(to))) return null;
    return Number(to) - Number(from);
  };
  const hasFirstOperational = Number.isFinite(Number(next.firstOperationalAtMs));
  const hasFirstInput = Number.isFinite(Number(next.firstInputAtMs));
  const hasFirstBlur = Number.isFinite(Number(next.firstBlurAtMs));
  const blurBeforeFirstInput =
    hasFirstBlur && (!hasFirstInput || Number(next.firstBlurAtMs) < Number(next.firstInputAtMs));
  const focusOperationalStrict = Boolean(
    hasFirstOperational &&
    hasFirstInput &&
    !blurBeforeFirstInput
  );

  return {
    ...entry,
    sessionMetrics: {
      sessionId: sessionId || null,
      sessionKey,
      firstOperationalAtMs: Number.isFinite(Number(next.firstOperationalAtMs))
        ? Number(next.firstOperationalAtMs)
        : null,
      firstInputAtMs: Number.isFinite(Number(next.firstInputAtMs))
        ? Number(next.firstInputAtMs)
        : null,
      firstBlurAtMs: Number.isFinite(Number(next.firstBlurAtMs))
        ? Number(next.firstBlurAtMs)
        : null,
      lastBlurAtMs: Number.isFinite(Number(next.lastBlurAtMs))
        ? Number(next.lastBlurAtMs)
        : null,
      blurBeforeFirstInput,
      focusOperationalStrict,
      msFromOperationalToInput: safeDelta(next.firstOperationalAtMs, next.firstInputAtMs),
      msFromOperationalToFirstBlur: safeDelta(next.firstOperationalAtMs, next.firstBlurAtMs),
      msFromOperationalToBlur: safeDelta(next.firstOperationalAtMs, next.lastBlurAtMs),
      msFromInputToBlur: safeDelta(next.firstInputAtMs, next.lastBlurAtMs),
    },
  };
}

export function emitInlineFocusRcaEvent(eventName, payload = {}) {
  if (!isInlineFocusRcaDebugEnabled()) return;
  const compactMode = isInlineDiagCompactEnabled();
  if (compactMode) {
    const compactEvents = new Set([
      "intent-start-inline",
      "focus-mount-skipped-v2",
      "inline-session-start",
      "overlay-ready-to-swap",
      "overlay-swap-commit",
      "overlay-focus-claim-commit",
      "blur",
    ]);
    if (!compactEvents.has(eventName)) return;
  }

  const editorEl = payload?.editorEl || null;
  const snapshot = buildInlineFocusOperationalSnapshot(editorEl);
  const perfNowMs =
    hasWindow() && typeof window.performance?.now === "function"
      ? Number(window.performance.now())
      : null;
  const entryBase = {
    ts: new Date().toISOString(),
    perfNowMs: Number.isFinite(perfNowMs) ? perfNowMs : null,
    eventName,
    editingId: payload?.editingId || null,
    overlayPhase: payload?.overlayPhase || null,
    ...snapshot,
    ...payload?.extra,
  };
  const entry = applySessionMetrics(entryBase);
  const compactEntry = compactMode
    ? {
        ts: entry.ts,
        perfNowMs: entry.perfNowMs,
        eventName: entry.eventName,
        editingId: entry.editingId,
        overlayPhase: entry.overlayPhase,
        sessionId: entry.sessionId || entry.sessionMetrics?.sessionId || null,
        reason: entry.reason || null,
        path: entry.path || null,
        attempt: Number.isFinite(Number(entry.attempt)) ? Number(entry.attempt) : null,
        focusOperationalCore: Boolean(entry.focusOperationalCore),
        isActiveElementEditor: Boolean(entry.isActiveElementEditor),
        hasSelectionInsideEditor: Boolean(entry.hasSelectionInsideEditor),
        hasValidRangeInsideEditor: Boolean(entry.hasValidRangeInsideEditor),
      }
    : entry;

  if (!Array.isArray(window.__INLINE_FOCUS_RCA_TRACE)) {
    window.__INLINE_FOCUS_RCA_TRACE = [];
  }
  window.__INLINE_FOCUS_RCA_TRACE.push(compactEntry);
  if (window.__INLINE_FOCUS_RCA_TRACE.length > 500) {
    window.__INLINE_FOCUS_RCA_TRACE.splice(0, window.__INLINE_FOCUS_RCA_TRACE.length - 500);
  }

  console.log("[INLINE][FOCUS-RCA]", compactEntry);
}
