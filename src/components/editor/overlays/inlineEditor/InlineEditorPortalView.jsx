import { createPortal } from "react-dom";
import {
  INLINE_DOM_TEXT_RENDER_PARITY_STYLE,
} from "@/components/editor/overlays/inlineEditor/inlineEditorTextMetrics";

export default function InlineEditorPortalView({
  BOX_DEBUG_MODE,
  konvaRectDebugStyle,
  konvaLabelDebugStyle,
  editingId,
  overlayRootRef,
  editorVisualReady,
  paintStable,
  renderAuthorityPhase,
  caretVisible,
  normalizedOverlayEngine,
  overlayPhase,
  normalizedWidthMode,
  normalizedFinishMode,
  overlayLeftPx,
  overlayTopPx,
  resolvedOverlayWidthPx,
  effectiveTextWidth,
  resolvedMinWidthPx,
  resolvedOverlayHeightPx,
  PADDING_X,
  PADDING_Y,
  overlayDebugStyle,
  overlayLabelDebugStyle,
  contentLabelDebugStyle,
  contentBoxRef,
  resolvedContentMinHeightPx,
  contentDebugStyle,
  editableHostRef,
  editorFrameRef,
  editorRef,
  editorVisualWidthPx,
  editorVisualLeftPx,
  centeredEditorWidthPx,
  centeredEditorLeftPx,
  effectiveVisualOffsetPx,
  internalContentOffsetPx = 0,
  isEditorVisible,
  isEditorInteractive,
  fontSizePx,
  nodeProps,
  editableLineHeightPx,
  letterSpacingPx,
  editorTextColor,
  editorPaddingTopPx,
  editorPaddingBottomPx,
  textAlign,
  onInput,
  onKeyDown,
  onBlur,
}) {
  const overlayPortalTarget = document.body;
  const liveEditableVisible = true;
  const overlayPointerEvents = isEditorInteractive ? "auto" : "none";
  const resolvedEditorWidthCss = Number.isFinite(editorVisualWidthPx)
    ? `${editorVisualWidthPx}px`
    : (
      Number.isFinite(centeredEditorWidthPx)
        ? `${centeredEditorWidthPx}px`
        : "100%"
    );
  const resolvedEditorLeftCss = Number.isFinite(editorVisualLeftPx)
    ? `${editorVisualLeftPx}px`
    : `${centeredEditorLeftPx}px`;

  return createPortal(
    <>
      {BOX_DEBUG_MODE && (
        <div
          data-inline-konva-debug="true"
          style={konvaRectDebugStyle}
        />
      )}
      {BOX_DEBUG_MODE && (
        <div
          data-inline-konva-debug-label="true"
          style={konvaLabelDebugStyle}
        >
          KONVA PROJECTION
        </div>
      )}
      <div
        ref={overlayRootRef}
        data-inline-editor-id={editingId || ""}
        data-inline-editor-visual-ready={editorVisualReady ? "true" : "false"}
        data-inline-editor-paint-stable={paintStable ? "true" : "false"}
        data-inline-overlay-engine={normalizedOverlayEngine}
        data-inline-overlay-phase={overlayPhase}
        data-inline-render-authority-phase={renderAuthorityPhase || "konva"}
        data-inline-caret-visible={caretVisible ? "true" : "false"}
        data-inline-editor="true"
        data-inline-width-mode={normalizedWidthMode}
        data-inline-finish-mode={normalizedFinishMode}
        data-inline-box-debug={BOX_DEBUG_MODE ? "true" : "false"}
        style={{
          position: "fixed",
          left: `${overlayLeftPx}px`,
          top: `${overlayTopPx}px`,
          display: "block",
          verticalAlign: "top",
          width:
            Number.isFinite(resolvedOverlayWidthPx)
              ? `${resolvedOverlayWidthPx}px`
              : (
                normalizedWidthMode === "measured"
                  ? `${effectiveTextWidth}px`
                  : "fit-content"
              ),
          minWidth: `${resolvedMinWidthPx}px`,
          height: Number.isFinite(resolvedOverlayHeightPx)
            ? `${resolvedOverlayHeightPx}px`
            : undefined,
          minHeight: Number.isFinite(resolvedOverlayHeightPx)
            ? `${resolvedOverlayHeightPx}px`
            : undefined,
          maxWidth: "min(100vw - 40px, 1200px)",
          background: "transparent",
          borderRadius: 0,
          boxShadow: "none",
          border: "none",
          padding: `${PADDING_Y}px ${PADDING_X}px`,
          zIndex: 9999,
          boxSizing: "border-box",
          visibility: liveEditableVisible ? "visible" : "hidden",
          pointerEvents: liveEditableVisible ? overlayPointerEvents : "none",
          ...overlayDebugStyle,
        }}
      >
        {BOX_DEBUG_MODE && (
          <div
            data-inline-overlay-debug-label="true"
            style={overlayLabelDebugStyle}
          >
            DOM OVERLAY [{overlayPhase}]
          </div>
        )}
        {BOX_DEBUG_MODE && (
          <div
            data-inline-content-debug-label="true"
            style={contentLabelDebugStyle}
          >
            DOM TEXT
          </div>
        )}
        <div
          ref={contentBoxRef}
          data-inline-text-debug={BOX_DEBUG_MODE ? "true" : "false"}
          style={{
            display: "block",
            verticalAlign: "top",
            width:
              Number.isFinite(resolvedOverlayWidthPx)
                ? `${resolvedOverlayWidthPx}px`
                : (
                  normalizedWidthMode === "measured"
                    ? `${effectiveTextWidth}px`
                    : undefined
                ),
            minWidth: `${resolvedMinWidthPx}px`,
            height: Number.isFinite(resolvedOverlayHeightPx)
              ? `${resolvedOverlayHeightPx}px`
              : undefined,
            minHeight: `${resolvedContentMinHeightPx}px`,
            background: "transparent",
            borderRadius: 0,
            padding: 0,
            margin: 0,
            outline: "none",
            boxSizing: "border-box",
            position: "relative",
            overflow: "visible",
            ...contentDebugStyle,
          }}
        >
        <div
          ref={editableHostRef}
          style={{
            display: "block",
            verticalAlign: "top",
            width: "100%",
            minWidth: "100%",
            height: Number.isFinite(resolvedOverlayHeightPx)
              ? "100%"
              : undefined,
            minHeight: "100%",
            position: "relative",
            left: 0,
            top: 0,
            margin: 0,
            padding: 0,
            border: 0,
            outline: "none",
            boxSizing: "border-box",
            overflow: "visible",
          }}
        >
          <div
            ref={editorFrameRef}
            style={{
              display: "block",
              verticalAlign: "top",
              width: resolvedEditorWidthCss,
              minWidth: resolvedEditorWidthCss,
              maxWidth: "none",
              height: "100%",
              minHeight: "100%",
              position: "absolute",
              left: resolvedEditorLeftCss,
              top: `${effectiveVisualOffsetPx}px`,
              margin: 0,
              padding: 0,
              border: 0,
              outline: "none",
              boxSizing: "border-box",
              overflow: "visible",
            }}
          >
            <div
              ref={editorRef}
              data-inline-editor-content="true"
              contentEditable={isEditorInteractive}
              suppressContentEditableWarning
              spellCheck={false}
              style={{
                display: "block",
                verticalAlign: "top",
                width: "100%",
                minWidth: "100%",
                maxWidth: "none",
                height: "100%",
                minHeight: "100%",
                position: "absolute",
                left: 0,
                // Keep external box locked; internal parity is applied inside the frame.
                top: `${Number(internalContentOffsetPx || 0)}px`,
                transform: "none",
                visibility: isEditorVisible ? "visible" : "hidden",
                pointerEvents: isEditorInteractive ? "auto" : "none",
                whiteSpace: "pre",
                overflowWrap: "normal",
                wordBreak: "normal",
                overflow: "visible",
                fontSize: `${fontSizePx}px`,
                fontFamily: nodeProps.fontFamily,
                fontWeight: nodeProps.fontWeight,
                fontStyle: nodeProps.fontStyle,
                ...INLINE_DOM_TEXT_RENDER_PARITY_STYLE,
                lineHeight: `${editableLineHeightPx}px`,
                letterSpacing: `${letterSpacingPx}px`,
                color: editorTextColor,
                caretColor: caretVisible ? editorTextColor : "transparent",
                WebkitTextFillColor: editorTextColor,
                background: "transparent",
                borderRadius: 0,
                paddingTop: `${editorPaddingTopPx}px`,
                paddingBottom: `${editorPaddingBottomPx}px`,
                paddingLeft: 0,
                paddingRight: 0,
                margin: 0,
                outline: "none",
                boxSizing: "border-box",
                textAlign: textAlign || "left",
                userSelect: isEditorInteractive ? "text" : "none",
              }}
              onInput={isEditorInteractive ? onInput : undefined}
              onKeyDown={isEditorInteractive ? onKeyDown : undefined}
              onBlur={isEditorInteractive ? onBlur : undefined}
            />
          </div>
        </div>
        </div>
      </div>
    </>,
    overlayPortalTarget
  );
}
