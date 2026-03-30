import { useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import HiddenSemanticTextBackend from "@/components/editor/textSystem/render/domSemantic/HiddenSemanticTextBackend";
import DividersOverlayStage from "@/components/canvas/DividersOverlayStage";
import { shouldPreserveTextCenterPosition } from "@/lib/textCenteringPolicy";
import {
  emitInlineCaretScrollDebugEvent,
  isInlineCaretScrollDebugEnabled,
} from "@/components/editor/textSystem/debug/inlineCaretScrollDebug";

function buildInlineLayerActiveElementSnapshot() {
  if (typeof document === "undefined") return null;
  const activeElement = document.activeElement || null;
  return {
    nodeName: activeElement?.nodeName || null,
    role:
      typeof activeElement?.getAttribute === "function"
        ? activeElement.getAttribute("role")
        : null,
    dataInlineEditorContent:
      typeof activeElement?.getAttribute === "function"
        ? activeElement.getAttribute("data-inline-editor-content")
        : null,
    dataInlineEditorEngine:
      typeof activeElement?.getAttribute === "function"
        ? activeElement.getAttribute("data-inline-editor-engine")
        : null,
  };
}

function buildCanvasInlineNodeSnapshot(node) {
  if (!node) {
    return {
      present: false,
      className: null,
      visible: null,
      opacity: null,
      absoluteOpacity: null,
      listening: null,
      fill: null,
      clientRect: null,
    };
  }

  let clientRect = null;
  try {
    clientRect = node.getClientRect?.({ skipStroke: false, skipShadow: false }) || null;
  } catch {
    clientRect = null;
  }

  const readMetric = (fnName) => {
    try {
      const fn = node?.[fnName];
      return typeof fn === "function" ? fn.call(node) : null;
    } catch {
      return null;
    }
  };

  return {
    present: true,
    className: typeof node.getClassName === "function" ? node.getClassName() : null,
    visible: readMetric("isVisible"),
    opacity: readMetric("opacity"),
    absoluteOpacity: readMetric("getAbsoluteOpacity"),
    listening: readMetric("listening"),
    fill: readMetric("fill"),
    clientRect:
      clientRect &&
      Number.isFinite(Number(clientRect.x)) &&
      Number.isFinite(Number(clientRect.y))
        ? {
            x: Number(clientRect.x),
            y: Number(clientRect.y),
            width: Number(clientRect.width),
            height: Number(clientRect.height),
          }
        : null,
  };
}

export default function CanvasInlineEditingLayer({
  editing,
  elementRefs,
  objetos,
  escalaVisual,
  textEditController,
  textEditBackendController,
  isMobile,
  zoom,
  altoCanvasDinamico,
  seccionesOrdenadas,
}) {
  const emitCanvasInlineLayerDebug = useCallback((eventName, extra = {}) => {
    if (!isInlineCaretScrollDebugEnabled()) return null;
    const editingId = editing?.id || null;
    const canvasNode = editingId ? elementRefs.current?.[editingId] || null : null;
    const decorations = textEditController?.decorations || null;
    const selectionRects = Array.isArray(decorations?.selectionRects)
      ? decorations.selectionRects
      : [];
    const safeId =
      editingId && typeof editingId === "string"
        ? editingId.replace(/"/g, '\\"')
        : null;
    const overlayRoots =
      safeId && typeof document !== "undefined"
        ? Array.from(document.querySelectorAll(`[data-inline-editor-id="${safeId}"]`))
        : [];
    return emitInlineCaretScrollDebugEvent(eventName, {
      component: "CanvasInlineEditingLayer",
      editingId,
      canvasNode: buildCanvasInlineNodeSnapshot(canvasNode),
      controller: {
        nativeCaretVisible: Boolean(textEditController?.nativeCaretVisible),
        selectionRectsCount: selectionRects.length,
        hasSelectionBounds: Boolean(decorations?.selectionBounds),
        hasSyntheticCaret: Boolean(decorations?.caretRect),
      },
      overlayRoots: overlayRoots.map((rootEl) => ({
        engine:
          typeof rootEl?.getAttribute === "function"
            ? rootEl.getAttribute("data-inline-editor-engine")
            : null,
        visualReady:
          typeof rootEl?.getAttribute === "function"
            ? rootEl.getAttribute("data-inline-editor-visual-ready")
            : null,
        rect:
          typeof rootEl?.getBoundingClientRect === "function"
            ? {
                x: Number(rootEl.getBoundingClientRect().x),
                y: Number(rootEl.getBoundingClientRect().y),
                width: Number(rootEl.getBoundingClientRect().width),
                height: Number(rootEl.getBoundingClientRect().height),
              }
            : null,
      })),
      focus: buildInlineLayerActiveElementSnapshot(),
      ...extra,
    });
  }, [editing?.id, elementRefs, textEditController]);

  const semanticBackend =
    editing.id && elementRefs.current[editing.id] && (() => {
      const objetoEnEdicion = objetos.find((o) => o.id === editing.id);
      const keepCenterDuringEdit =
        Boolean(objetoEnEdicion) &&
        shouldPreserveTextCenterPosition(objetoEnEdicion);

        return (
          <HiddenSemanticTextBackend
            editing={editing}
            node={elementRefs.current[editing.id]}
            controller={textEditBackendController || textEditController}
            textAlign={objetoEnEdicion?.align || "left"}
            scaleVisual={escalaVisual}
            preserveCenterDuringEdit={keepCenterDuringEdit}
          />
        );
      })();

  useEffect(() => {
    if (!editing?.id) return undefined;
    emitCanvasInlineLayerDebug("canvas-inline-layer-baseline", {
      step: "baseline",
      frameOrder: "effect",
      semanticBackendMounted: Boolean(semanticBackend),
    });
    return undefined;
  }, [editing?.id, emitCanvasInlineLayerDebug, semanticBackend]);

  useEffect(() => {
    if (!editing?.id) return undefined;
    if (typeof window === "undefined") return undefined;

    const handleScroll = () => {
      emitCanvasInlineLayerDebug("canvas-inline-layer-scroll", {
        step: "before-scroll",
        frameOrder: "scroll-event",
      });
      window.requestAnimationFrame(() => {
        emitCanvasInlineLayerDebug("canvas-inline-layer-after-scroll", {
          step: "after-scroll",
          frameOrder: "raf-1",
        });
      });
    };

    window.addEventListener("scroll", handleScroll, true);
    return () => {
      window.removeEventListener("scroll", handleScroll, true);
    };
  }, [editing?.id, emitCanvasInlineLayerDebug]);

  return (
    <>
      {semanticBackend && typeof document !== "undefined"
        ? createPortal(semanticBackend, document.body)
        : semanticBackend}

      {!isMobile && (
        <DividersOverlayStage
          zoom={zoom}
          altoCanvasDinamico={altoCanvasDinamico}
          seccionesOrdenadas={seccionesOrdenadas}
        />
      )}
    </>
  );
}
