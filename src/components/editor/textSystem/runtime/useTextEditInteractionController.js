import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import {
  normalizeInlineEditableText,
} from "@/components/editor/overlays/inlineTextModel";
import {
  resolveInlineStageViewportMetrics,
} from "@/components/editor/overlays/inlineGeometry";
import {
  emitSemanticCaretDebug,
  emitSemanticCaretPositionDebug,
  rectToSemanticCaretPayload,
  roundSemanticCaretMetric,
} from "@/components/editor/textSystem/debug";
import {
  createEmptyTextSelectionGeometry,
  resolveTextSelectionGeometry,
} from "@/components/editor/textSystem/services/textSelectionGeometryService";
import {
  focusSemanticEditor,
  moveSemanticCaretToBoundary,
  placeSemanticCaretFromPoint,
} from "@/components/editor/textSystem/services/textHitTestService";
import {
  applySelectionRange,
  createLogicalCaretRange,
  resolveEditorRangeTextPosition,
} from "@/components/editor/textSystem/services/textCaretPositionService";

function createEmptyDecorations() {
  return createEmptyTextSelectionGeometry();
}

function areRectsEqual(nextRect, previousRect) {
  const keys = ["x", "y", "width", "height"];
  return keys.every((key) => {
    const nextValue = Number(nextRect?.[key]);
    const previousValue = Number(previousRect?.[key]);
    if (!Number.isFinite(nextValue) && !Number.isFinite(previousValue)) return true;
    if (!Number.isFinite(nextValue) || !Number.isFinite(previousValue)) return false;
    return Math.abs(nextValue - previousValue) < 0.01;
  });
}

function areSelectionRectArraysEqual(nextRects = [], previousRects = []) {
  if (nextRects.length !== previousRects.length) return false;
  for (let index = 0; index < nextRects.length; index += 1) {
    if (!areRectsEqual(nextRects[index], previousRects[index])) {
      return false;
    }
  }
  return true;
}

function areDecorationsEqual(nextDecorations, previousDecorations) {
  return (
    Boolean(nextDecorations?.isActive) === Boolean(previousDecorations?.isActive) &&
    Boolean(nextDecorations?.isCollapsed) === Boolean(previousDecorations?.isCollapsed) &&
    areRectsEqual(nextDecorations?.caretRect, previousDecorations?.caretRect) &&
    areRectsEqual(nextDecorations?.selectionBounds, previousDecorations?.selectionBounds) &&
    areSelectionRectArraysEqual(
      Array.isArray(nextDecorations?.selectionRects) ? nextDecorations.selectionRects : [],
      Array.isArray(previousDecorations?.selectionRects) ? previousDecorations.selectionRects : []
    )
  );
}

function buildSelectionSnapshot(editorEl) {
  if (!editorEl || typeof window === "undefined") {
    return {
      rangeCount: 0,
      inEditor: false,
      isCollapsed: null,
      anchorOffset: null,
      focusOffset: null,
      anchorNodeName: null,
      focusNodeName: null,
      selectionAliasKind: null,
      logicalCanonicalOffset: null,
      canonicalNodeName: null,
      canonicalOffset: null,
      canonicalStrategy: null,
      rangeRectViewport: null,
      firstClientRectViewport: null,
    };
  }

  const selection = window.getSelection?.();
  if (!selection || selection.rangeCount <= 0) {
    return {
      rangeCount: 0,
      inEditor: false,
      isCollapsed: null,
      anchorOffset: null,
      focusOffset: null,
      anchorNodeName: null,
      focusNodeName: null,
      selectionAliasKind: null,
      logicalCanonicalOffset: null,
      canonicalNodeName: null,
      canonicalOffset: null,
      canonicalStrategy: null,
      rangeRectViewport: null,
      firstClientRectViewport: null,
    };
  }

  let range = null;
  try {
    range = selection.getRangeAt(0);
  } catch {
    range = null;
  }

  let rangeRectViewport = null;
  let firstClientRectViewport = null;
  if (range) {
    try {
      rangeRectViewport = rectToSemanticCaretPayload(
        range.getBoundingClientRect?.()
      );
    } catch {
      rangeRectViewport = null;
    }
    try {
      const firstClientRect = Array.from(range.getClientRects?.() || [])[0] || null;
      firstClientRectViewport = rectToSemanticCaretPayload(firstClientRect);
    } catch {
      firstClientRectViewport = null;
    }
  }

  const anchorNode = selection.anchorNode || null;
  const focusNode = selection.focusNode || null;
  const inEditor = Boolean(
    anchorNode &&
      focusNode &&
      editorEl.contains(anchorNode) &&
      editorEl.contains(focusNode)
  );
  const rangePosition =
    inEditor && range
      ? resolveEditorRangeTextPosition(editorEl, range)
      : null;

  return {
    rangeCount: Number(selection.rangeCount || 0),
    inEditor,
    isCollapsed:
      typeof selection.isCollapsed === "boolean" ? selection.isCollapsed : null,
    anchorOffset: Number.isFinite(Number(selection.anchorOffset))
      ? Number(selection.anchorOffset)
      : null,
    focusOffset: Number.isFinite(Number(selection.focusOffset))
      ? Number(selection.focusOffset)
      : null,
    anchorNodeName: anchorNode?.nodeName || null,
    focusNodeName: focusNode?.nodeName || null,
    selectionAliasKind: rangePosition?.selectionAliasKind || null,
    logicalCanonicalOffset: Number.isFinite(rangePosition?.logicalOffset)
      ? Number(rangePosition.logicalOffset)
      : null,
    canonicalNodeName: rangePosition?.canonicalNodeName || null,
    canonicalOffset: Number.isFinite(rangePosition?.canonicalOffset)
      ? Number(rangePosition.canonicalOffset)
      : null,
    canonicalStrategy: rangePosition?.canonicalStrategy || null,
    rangeRectViewport,
    firstClientRectViewport,
  };
}

function getSelectionRangeInsideEditor(editorEl) {
  if (!editorEl || typeof window === "undefined") return null;
  const selection = window.getSelection?.();
  if (!selection || selection.rangeCount <= 0) return null;
  try {
    const range = selection.getRangeAt(0);
    const startContainer = range?.startContainer || null;
    const endContainer = range?.endContainer || null;
    if (
      startContainer &&
      endContainer &&
      editorEl.contains(startContainer) &&
      editorEl.contains(endContainer)
    ) {
      return range;
    }
  } catch {
    return null;
  }
  return null;
}

function readClientPointFromCanvasEvent(event, stage, scaleVisual) {
  const nativeEvent = event?.evt || event;
  const clientX = Number(nativeEvent?.clientX);
  const clientY = Number(nativeEvent?.clientY);
  if (Number.isFinite(clientX) && Number.isFinite(clientY)) {
    return { clientX, clientY };
  }

  const pointerPosition =
    stage?.getPointerPosition?.() ||
    (Number.isFinite(Number(event?.x)) && Number.isFinite(Number(event?.y))
      ? { x: Number(event.x), y: Number(event.y) }
      : null);
  const stageMetrics = resolveInlineStageViewportMetrics(stage, { scaleVisual });
  if (!pointerPosition || !stageMetrics?.stageRect) {
    return { clientX: null, clientY: null };
  }

  return {
    clientX:
      Number(stageMetrics.stageRect.left || 0) +
      Number(pointerPosition.x || 0) * Number(stageMetrics.totalScaleX || 1),
    clientY:
      Number(stageMetrics.stageRect.top || 0) +
      Number(pointerPosition.y || 0) * Number(stageMetrics.totalScaleY || 1),
  };
}

function isSelectionNavigationKey(key) {
  return (
    key === "ArrowLeft" ||
    key === "ArrowRight" ||
    key === "ArrowUp" ||
    key === "ArrowDown" ||
    key === "Home" ||
    key === "End"
  );
}

function clampCaretOffset(offset, textLength) {
  const numericOffset = Number(offset);
  const safeTextLength = Math.max(0, Number(textLength) || 0);
  if (!Number.isFinite(numericOffset)) return null;
  return Math.max(0, Math.min(safeTextLength, numericOffset));
}

function escapeCaretPreviewText(text) {
  return String(text || "")
    .replace(/\r/g, "\\r")
    .replace(/\n/g, "\\n")
    .replace(/\t/g, "\\t");
}

function buildCaretTextPreview(text, offset, radius = 12) {
  const safeText = String(text || "");
  const safeOffset = clampCaretOffset(offset, safeText.length);
  if (!Number.isFinite(safeOffset)) {
    return {
      offset: null,
      windowStart: null,
      windowEnd: null,
      preview: null,
    };
  }

  const windowStart = Math.max(0, safeOffset - radius);
  const windowEnd = Math.min(safeText.length, safeOffset + radius);
  const before = escapeCaretPreviewText(safeText.slice(windowStart, safeOffset));
  const after = escapeCaretPreviewText(safeText.slice(safeOffset, windowEnd));

  return {
    offset: safeOffset,
    windowStart,
    windowEnd,
    preview: `${windowStart > 0 ? "..." : ""}${before}|${after}${windowEnd < safeText.length ? "..." : ""}`,
  };
}

export default function useTextEditInteractionController({
  editing,
  stageRef,
  scaleVisual = 1,
  onChange,
  onFinish,
  onDebugEvent,
}) {
  const rootRef = useRef(null);
  const editorRef = useRef(null);
  const backendMetaRef = useRef({
    preserveCenterDuringEdit: false,
  });
  const finishLockRef = useRef(null);
  const geometryDebugSignatureRef = useRef(null);
  const caretTextDebugSignatureRef = useRef(null);
  const decorationsRef = useRef(createEmptyDecorations());
  const restoreEditorSelectionRef = useRef(null);
  const isFocusedRef = useRef(false);
  const caretBlinkVisibleRef = useRef(true);
  const logicalCaretOffsetRef = useRef(null);
  const requestedLogicalOffsetRef = useRef(null);
  const suppressNextFocusSyncRef = useRef(false);
  const lastKeyEventRef = useRef({
    key: null,
    code: null,
    ts: null,
  });
  const lastInputEventRef = useRef({
    inputType: null,
    data: null,
    prevLength: null,
    nextLength: null,
    ts: null,
  });
  const [backendRevision, setBackendRevision] = useState(0);
  const [decorations, setDecorations] = useState(createEmptyDecorations);
  const [isFocused, setIsFocused] = useState(false);
  const [caretBlinkVisible, setCaretBlinkVisible] = useState(true);

  const editingId = editing?.id || null;
  const normalizedValue = useMemo(
    () =>
      normalizeInlineEditableText(String(editing?.value ?? ""), {
        trimPhantomTrailingNewline: true,
      }),
    [editing?.value]
  );

  useEffect(() => {
    isFocusedRef.current = isFocused;
  }, [isFocused]);

  useEffect(() => {
    caretBlinkVisibleRef.current = caretBlinkVisible;
  }, [caretBlinkVisible]);

  const syncDecorations = useCallback(() => {
    const stage = stageRef.current?.getStage?.() || stageRef.current || null;
    if (!editingId || !editorRef.current || !stage) {
      const emptyGeometry = createEmptyDecorations();
      if (!areDecorationsEqual(emptyGeometry, decorationsRef.current)) {
        decorationsRef.current = emptyGeometry;
        setDecorations(emptyGeometry);
      }
      return emptyGeometry;
    }

    const logicalOffsetFallbackHint = Number.isFinite(requestedLogicalOffsetRef.current)
      ? Number(requestedLogicalOffsetRef.current)
      : null;
    const nextGeometry = resolveTextSelectionGeometry({
      editorEl: editorRef.current,
      stage,
      scaleVisual,
      preserveCenterDuringEdit: Boolean(
        backendMetaRef.current?.preserveCenterDuringEdit
      ),
      logicalOffsetHint: logicalOffsetFallbackHint,
    });
    const resolvedLogicalOffset = Number(nextGeometry?.diagnostics?.logicalOffset);
    const logicalOffsetSource = String(
      nextGeometry?.diagnostics?.logicalOffsetSource || ""
    );
    if (Number.isFinite(resolvedLogicalOffset)) {
      const shouldAdoptResolvedLogicalOffset =
        logicalOffsetSource === "selection" ||
        logicalOffsetSource === "selection-alias";
      if (shouldAdoptResolvedLogicalOffset) {
        logicalCaretOffsetRef.current = resolvedLogicalOffset;
        requestedLogicalOffsetRef.current = null;
      }
    }
    if (!areDecorationsEqual(nextGeometry, decorationsRef.current)) {
      decorationsRef.current = nextGeometry;
      setDecorations(nextGeometry);
    }
    if (nextGeometry?.isCollapsed) {
      setCaretBlinkVisible(true);
    }

    const stageMetrics = resolveInlineStageViewportMetrics(stage, { scaleVisual });
    const selectionSnapshot = buildSelectionSnapshot(editorRef.current);
    const payload = {
      id: editingId,
      stage: {
        stageRectViewport: rectToSemanticCaretPayload(stageMetrics?.stageRect),
        totalScaleX: roundSemanticCaretMetric(stageMetrics?.totalScaleX),
        totalScaleY: roundSemanticCaretMetric(stageMetrics?.totalScaleY),
      },
      rootRectViewport: rectToSemanticCaretPayload(
        rootRef.current?.getBoundingClientRect?.()
      ),
      editorRectViewport: rectToSemanticCaretPayload(
        editorRef.current?.getBoundingClientRect?.()
      ),
      selection: selectionSnapshot,
      geometry: {
        isActive: Boolean(nextGeometry?.isActive),
        isCollapsed: Boolean(nextGeometry?.isCollapsed),
        caretRectStage: rectToSemanticCaretPayload(nextGeometry?.caretRect),
        selectionBoundsStage: rectToSemanticCaretPayload(
          nextGeometry?.selectionBounds
        ),
        selectionRectsStageCount: Array.isArray(nextGeometry?.selectionRects)
          ? nextGeometry.selectionRects.length
          : 0,
        diagnostics: nextGeometry?.diagnostics || null,
      },
      focus: {
        isFocused: isFocusedRef.current,
        caretBlinkVisible: caretBlinkVisibleRef.current,
      },
      inputContext: {
        lastKey: lastKeyEventRef.current,
        lastInput: lastInputEventRef.current,
      },
    };
    const signature = JSON.stringify(payload);
    if (geometryDebugSignatureRef.current !== signature) {
      geometryDebugSignatureRef.current = signature;
      emitSemanticCaretDebug("semantic:caret-stage-geometry", payload, {
        onDebugEvent,
      });
    }

    const debugLogicalOffset = clampCaretOffset(
      nextGeometry?.diagnostics?.logicalOffset,
      normalizedValue.length
    );
    const previewSourceOffset = Number.isFinite(debugLogicalOffset)
      ? debugLogicalOffset
      : (
        Number.isFinite(logicalCaretOffsetRef.current)
          ? clampCaretOffset(logicalCaretOffsetRef.current, normalizedValue.length)
          : (
            Number.isFinite(requestedLogicalOffsetRef.current)
              ? clampCaretOffset(requestedLogicalOffsetRef.current, normalizedValue.length)
              : null
          )
      );
    const caretTextPayload = {
      id: editingId,
      textLength: normalizedValue.length,
      textPreview: buildCaretTextPreview(normalizedValue, previewSourceOffset),
      offsets: {
        logical: debugLogicalOffset,
        source: nextGeometry?.diagnostics?.logicalOffsetSource || null,
        logicalCanonical: Number.isFinite(selectionSnapshot.logicalCanonicalOffset)
          ? Number(selectionSnapshot.logicalCanonicalOffset)
          : null,
        selectionAnchor: Number.isFinite(selectionSnapshot.anchorOffset)
          ? Number(selectionSnapshot.anchorOffset)
          : null,
        selectionFocus: Number.isFinite(selectionSnapshot.focusOffset)
          ? Number(selectionSnapshot.focusOffset)
          : null,
        stable: Number.isFinite(logicalCaretOffsetRef.current)
          ? Number(logicalCaretOffsetRef.current)
          : null,
        requested: Number.isFinite(requestedLogicalOffsetRef.current)
          ? Number(requestedLogicalOffsetRef.current)
          : null,
      },
      state: {
        inEditor: Boolean(selectionSnapshot.inEditor),
        isCollapsed: Boolean(selectionSnapshot.isCollapsed),
        anchorNodeName: selectionSnapshot.anchorNodeName || null,
        focusNodeName: selectionSnapshot.focusNodeName || null,
        selectionAliasKind:
          selectionSnapshot.selectionAliasKind ||
          nextGeometry?.diagnostics?.selectionAliasKind ||
          null,
        canonicalNodeName:
          selectionSnapshot.canonicalNodeName ||
          nextGeometry?.diagnostics?.canonicalNodeName ||
          null,
        canonicalOffset: Number.isFinite(selectionSnapshot.canonicalOffset)
          ? Number(selectionSnapshot.canonicalOffset)
          : (
            Number.isFinite(nextGeometry?.diagnostics?.canonicalOffset)
              ? Number(nextGeometry.diagnostics.canonicalOffset)
              : null
          ),
        caretSourceKind: nextGeometry?.diagnostics?.caretSourceKind || null,
        collapsedRootBoundarySelection: Boolean(
          nextGeometry?.diagnostics?.collapsedRootBoundarySelection
        ),
        hasNativeCaretRect: Boolean(nextGeometry?.diagnostics?.nativeCollapsedRect),
      },
    };
    const caretTextSignature = JSON.stringify(caretTextPayload);
    if (caretTextDebugSignatureRef.current !== caretTextSignature) {
      caretTextDebugSignatureRef.current = caretTextSignature;
      emitSemanticCaretPositionDebug(
        "semantic:caret-text-position",
        caretTextPayload,
        { onDebugEvent }
      );
    }

    return nextGeometry;
  }, [
    editingId,
    normalizedValue,
    onDebugEvent,
    scaleVisual,
    stageRef,
  ]);

  const flushDecorationsSync = useCallback(() => {
    let nextGeometry = null;
    flushSync(() => {
      nextGeometry = syncDecorations();
    });
    return nextGeometry;
  }, [syncDecorations]);

  const registerBackend = useCallback(({
    rootEl = null,
    editorEl = null,
    preserveCenterDuringEdit = false,
  } = {}) => {
    const nextPreserveCenterDuringEdit = Boolean(preserveCenterDuringEdit);
    const backendChanged =
      rootRef.current !== rootEl ||
      editorRef.current !== editorEl ||
      Boolean(backendMetaRef.current?.preserveCenterDuringEdit) !==
        nextPreserveCenterDuringEdit;
    rootRef.current = rootEl;
    editorRef.current = editorEl;
    backendMetaRef.current = {
      preserveCenterDuringEdit: nextPreserveCenterDuringEdit,
    };
    if (backendChanged) {
      setBackendRevision((previous) => previous + 1);
    }
  }, []);

  const requestFinish = useCallback((reason = "manual") => {
    if (!editingId) return false;
    if (finishLockRef.current === editingId) return false;
    finishLockRef.current = editingId;
    onDebugEvent?.("semantic:finish-request", {
      id: editingId,
      reason,
    });
    onFinish?.();
    return true;
  }, [editingId, onDebugEvent, onFinish]);

  const focusEditorAtBoundary = useCallback((boundary = "end") => {
    if (!editorRef.current) return false;
    const targetOffset = boundary === "start" ? 0 : normalizedValue.length;
    requestedLogicalOffsetRef.current = targetOffset;
    suppressNextFocusSyncRef.current = true;
    focusSemanticEditor(editorRef.current);
    const moved = moveSemanticCaretToBoundary(editorRef.current, boundary);
    setIsFocused(true);
    setCaretBlinkVisible(true);
    flushDecorationsSync();
    window.requestAnimationFrame(syncDecorations);
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(syncDecorations);
    });
    return moved;
  }, [flushDecorationsSync, normalizedValue.length, syncDecorations]);

  const restoreEditorSelection = useCallback((boundary = "end") => {
    const editorEl = editorRef.current;
    if (!editorEl) return false;
    if (getSelectionRangeInsideEditor(editorEl)) {
      return true;
    }

    const preferredLogicalOffset = Number.isFinite(requestedLogicalOffsetRef.current)
      ? clampCaretOffset(requestedLogicalOffsetRef.current, normalizedValue.length)
      : (
        Number.isFinite(logicalCaretOffsetRef.current)
          ? clampCaretOffset(logicalCaretOffsetRef.current, normalizedValue.length)
          : null
      );

    suppressNextFocusSyncRef.current = true;
    focusSemanticEditor(editorEl);
    if (Number.isFinite(preferredLogicalOffset)) {
      const { range } = createLogicalCaretRange(editorEl, preferredLogicalOffset, {
        textLength: normalizedValue.length,
      });
      if (applySelectionRange(range)) {
        setIsFocused(true);
        setCaretBlinkVisible(true);
        return true;
      }
    }

    return focusEditorAtBoundary(boundary);
  }, [focusEditorAtBoundary, normalizedValue.length]);

  useEffect(() => {
    restoreEditorSelectionRef.current = restoreEditorSelection;
  }, [restoreEditorSelection]);

  const handleCanvasPointer = useCallback((event) => {
    if (!editingId || !editorRef.current) return false;
    const stage = stageRef.current?.getStage?.() || stageRef.current || null;
    const { clientX, clientY } = readClientPointFromCanvasEvent(
      event,
      stage,
      scaleVisual
    );

    suppressNextFocusSyncRef.current = true;
    requestedLogicalOffsetRef.current = null;
    focusSemanticEditor(editorRef.current);
    setIsFocused(true);
    setCaretBlinkVisible(true);
    const placed = placeSemanticCaretFromPoint({
      editorEl: editorRef.current,
      clientX,
      clientY,
    });
    if (!placed) {
      requestedLogicalOffsetRef.current = normalizedValue.length;
      moveSemanticCaretToBoundary(editorRef.current, "end");
    }
    flushDecorationsSync();
    window.requestAnimationFrame(syncDecorations);
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(syncDecorations);
    });
    onDebugEvent?.("semantic:canvas-pointer", {
      id: editingId,
      placed,
      clientX: Number.isFinite(Number(clientX)) ? Number(clientX) : null,
      clientY: Number.isFinite(Number(clientY)) ? Number(clientY) : null,
    });
    return true;
  }, [editingId, flushDecorationsSync, normalizedValue.length, onDebugEvent, scaleVisual, stageRef, syncDecorations]);

  const handleInput = useCallback((event) => {
    const rawText = String(event?.currentTarget?.innerText || "");
    const nextValue = normalizeInlineEditableText(rawText, {
      trimPhantomTrailingNewline: true,
    });
    lastInputEventRef.current = {
      inputType: event?.nativeEvent?.inputType || null,
      data:
        typeof event?.nativeEvent?.data === "string"
          ? event.nativeEvent.data
          : null,
      prevLength: String(editing?.value ?? "").length,
      nextLength: nextValue.length,
      ts: Date.now(),
    };

    flushSync(() => {
      onChange?.(nextValue);
    });
    flushDecorationsSync();
    window.requestAnimationFrame(syncDecorations);
  }, [editing?.value, flushDecorationsSync, onChange, syncDecorations]);

  const handleFocus = useCallback(() => {
    setIsFocused(true);
    setCaretBlinkVisible(true);
    if (suppressNextFocusSyncRef.current) {
      suppressNextFocusSyncRef.current = false;
      return;
    }
    flushDecorationsSync();
    window.requestAnimationFrame(syncDecorations);
  }, [flushDecorationsSync, syncDecorations]);

  const handleBlur = useCallback(() => {
    setIsFocused(false);
    requestFinish("blur");
  }, [requestFinish]);

  const handleKeyDown = useCallback((event) => {
    event.stopPropagation();
    lastKeyEventRef.current = {
      key: event.key || null,
      code: event.code || null,
      ts: Date.now(),
    };
    if (isSelectionNavigationKey(event.key)) {
      setCaretBlinkVisible(true);
      window.requestAnimationFrame(() => {
        syncDecorations();
      });
    }
    if (event.key === "Escape") {
      event.preventDefault();
      requestFinish("escape");
      return;
    }
    if (event.key === "Tab") {
      event.preventDefault();
      requestFinish("tab");
    }
  }, [requestFinish, syncDecorations]);

  const handleSelectionMutation = useCallback((event) => {
    event?.stopPropagation?.();
    const key = typeof event?.key === "string" ? event.key : null;
    if (isSelectionNavigationKey(key)) {
      setCaretBlinkVisible(true);
      window.requestAnimationFrame(() => {
        syncDecorations();
        window.requestAnimationFrame(syncDecorations);
      });
      return;
    }
    flushDecorationsSync();
    window.requestAnimationFrame(syncDecorations);
  }, [flushDecorationsSync, syncDecorations]);

  useEffect(() => {
    if (!editingId) {
      finishLockRef.current = null;
      geometryDebugSignatureRef.current = null;
      caretTextDebugSignatureRef.current = null;
      decorationsRef.current = createEmptyDecorations();
      backendMetaRef.current = {
        preserveCenterDuringEdit: false,
      };
      lastKeyEventRef.current = {
        key: null,
        code: null,
        ts: null,
      };
      lastInputEventRef.current = {
        inputType: null,
        data: null,
        prevLength: null,
        nextLength: null,
        ts: null,
      };
      logicalCaretOffsetRef.current = null;
      requestedLogicalOffsetRef.current = null;
      suppressNextFocusSyncRef.current = false;
      setIsFocused(false);
      setCaretBlinkVisible(true);
      setDecorations(createEmptyDecorations());
      return;
    }

    if (finishLockRef.current && finishLockRef.current !== editingId) {
      finishLockRef.current = null;
    }
  }, [editingId]);

  useEffect(() => {
    if (!editingId || !editorRef.current) return undefined;
    const rafId = window.requestAnimationFrame(() => {
      restoreEditorSelectionRef.current?.("end");
    });
    return () => {
      window.cancelAnimationFrame(rafId);
    };
  }, [backendRevision, editingId]);

  useLayoutEffect(() => {
    if (!editingId) return undefined;
    syncDecorations();
    const rafId = window.requestAnimationFrame(syncDecorations);
    return () => {
      window.cancelAnimationFrame(rafId);
    };
  }, [editingId, normalizedValue, syncDecorations]);

  useEffect(() => {
    if (!editingId || typeof document === "undefined") return undefined;

    const scheduleSync = () => {
      window.requestAnimationFrame(syncDecorations);
    };

    document.addEventListener("selectionchange", scheduleSync);
    window.addEventListener("resize", scheduleSync);
    document.addEventListener("scroll", scheduleSync, true);

    return () => {
      document.removeEventListener("selectionchange", scheduleSync);
      window.removeEventListener("resize", scheduleSync);
      document.removeEventListener("scroll", scheduleSync, true);
    };
  }, [editingId, syncDecorations]);

  useEffect(() => {
    if (!editingId || !isFocused || !decorations?.isCollapsed) {
      setCaretBlinkVisible(true);
      return undefined;
    }

    const intervalId = window.setInterval(() => {
      setCaretBlinkVisible((visible) => !visible);
    }, 530);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [decorations?.isCollapsed, editingId, isFocused]);

  const visibleDecorations = useMemo(() => ({
    ...decorations,
    caretRect:
      isFocused && decorations?.isCollapsed && caretBlinkVisible
        ? decorations?.caretRect || null
        : null,
  }), [caretBlinkVisible, decorations, isFocused]);

  return {
    editingId,
    normalizedValue,
    rootRef,
    editorRef,
    registerBackend,
    handleCanvasPointer,
    requestFinish,
    handleInput,
    handleFocus,
    handleBlur,
    handleKeyDown,
    handleSelectionMutation,
    syncDecorations,
    decorations: visibleDecorations,
  };
}
