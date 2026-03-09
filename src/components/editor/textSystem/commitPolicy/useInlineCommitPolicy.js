import { flushSync } from "react-dom";
import {
  getInlineLineStats,
  inlineDebugLog,
} from "@/components/editor/canvasEditor/inlineSnapshotPrimitives";
import {
  normalizeInlineEditableText as normalizeInlineEditableTextShared,
} from "@/components/editor/overlays/inlineTextModel";
import {
  clearCurrentInlineEditingIdIfMatches,
  getCurrentInlineEditingId,
} from "@/components/editor/textSystem/bridges/window/inlineWindowBridge";

export default function useCanvasEditorInlineCommitHandlers({
  editing,
  captureInlineSnapshot,
  updateEdit,
  objetos,
  inlineEditPreviewRef,
  inlineCommitDebugRef,
  setInlineOverlayMountedId,
  setInlineOverlayMountSession,
  finishEdit,
  restoreElementDrag,
  calcularXTextoCentrado,
  setObjetos,
}) {
  const onInlineChange = (nextValue) => {
    const nextText = String(nextValue ?? "");
    const prevStats = getInlineLineStats(editing.value);
    const nextStats = getInlineLineStats(nextText);
    if (
      prevStats.lineCount !== nextStats.lineCount ||
      prevStats.trailingNewlines !== nextStats.trailingNewlines
    ) {
      inlineDebugLog("linebreak-model-sync", {
        id: editing.id || getCurrentInlineEditingId() || null,
        prevLength: prevStats.length,
        nextLength: nextStats.length,
        prevLineCount: prevStats.lineCount,
        nextLineCount: nextStats.lineCount,
        prevTrailingNewlines: prevStats.trailingNewlines,
        nextTrailingNewlines: nextStats.trailingNewlines,
      });
    }
    captureInlineSnapshot("input: before-render", {
      id: editing.id || getCurrentInlineEditingId() || null,
      valueLength: nextText.length,
    });
    updateEdit(nextValue);
  };

  const onInlineDebugEvent = (eventName, payload = {}) => {
    captureInlineSnapshot(eventName, {
      id: payload?.id || editing.id || null,
      ...payload,
    });
  };

  const onInlineFinish = () => {
    const finishId = editing.id;
    if (!finishId) return;

    const safeFinishId = String(finishId || "").replace(/"/g, '\\"');
    const overlayRoot =
      typeof document !== "undefined" && safeFinishId
        ? document.querySelector(`[data-inline-editor-id="${safeFinishId}"]`)
        : null;
    const overlayEditor = overlayRoot?.querySelector?.('[contenteditable="true"]');
    const domRawText =
      overlayEditor && typeof overlayEditor.innerText === "string"
        ? overlayEditor.innerText
        : null;

    const textoNuevoRaw = normalizeInlineEditableTextShared(
      domRawText == null ? String(editing.value ?? "") : domRawText,
      { trimPhantomTrailingNewline: true }
    );

    captureInlineSnapshot("finish: blur", {
      id: finishId,
      valueLength: textoNuevoRaw.length,
    });

    const index = objetos.findIndex((o) => o.id === finishId);
    const objeto = objetos[index];
    if (index === -1) {
      inlineDebugLog("finish-abort-missing-object", { id: finishId });
      inlineCommitDebugRef.current = { id: null };
      inlineEditPreviewRef.current = { id: null, centerX: null };
      flushSync(() => {
        setInlineOverlayMountedId((prev) => (prev === finishId ? null : prev));
        setInlineOverlayMountSession((prev) => {
          const prevId = prev?.mounted ? prev.id : null;
          if (prevId !== finishId) return prev;
          return {
            id: null,
            sessionId: null,
            mounted: false,
            swapCommitted: false,
            phase: "finish-missing-object",
            token: Number(prev?.token || 0),
          };
        });
        finishEdit();
      });
      restoreElementDrag(finishId);
      clearCurrentInlineEditingIdIfMatches(finishId);
      return;
    }

    const textoNuevoValidado = textoNuevoRaw.trim();
    if (textoNuevoValidado === "" && objeto.tipo === "texto") {
      inlineDebugLog("finish-abort-empty", {
        id: finishId,
        rawLength: textoNuevoRaw.length,
        trimmedLength: textoNuevoValidado.length,
      });
      inlineCommitDebugRef.current = { id: null };
      inlineEditPreviewRef.current = { id: null, centerX: null };
      flushSync(() => {
        setInlineOverlayMountedId((prev) => (prev === finishId ? null : prev));
        setInlineOverlayMountSession((prev) => {
          const prevId = prev?.mounted ? prev.id : null;
          if (prevId !== finishId) return prev;
          return {
            id: null,
            sessionId: null,
            mounted: false,
            swapCommitted: false,
            phase: "finish-empty-abort",
            token: Number(prev?.token || 0),
          };
        });
        finishEdit();
      });
      restoreElementDrag(finishId);
      clearCurrentInlineEditingIdIfMatches(finishId);
      return;
    }

    const textoActualRaw = String(objeto?.texto ?? "");
    if (textoNuevoRaw === textoActualRaw) {
      inlineDebugLog("finish-noop-unchanged-text", {
        id: finishId,
        valueLength: textoNuevoRaw.length,
      });
      inlineCommitDebugRef.current = { id: null };
      inlineEditPreviewRef.current = { id: null, centerX: null };
      flushSync(() => {
        setInlineOverlayMountedId((prev) => (prev === finishId ? null : prev));
        setInlineOverlayMountSession((prev) => {
          const prevId = prev?.mounted ? prev.id : null;
          if (prevId !== finishId) return prev;
          return {
            id: null,
            sessionId: null,
            mounted: false,
            swapCommitted: false,
            phase: "finish-noop-unchanged-text",
            token: Number(prev?.token || 0),
          };
        });
        finishEdit();
      });
      restoreElementDrag(finishId);
      clearCurrentInlineEditingIdIfMatches(finishId);
      return;
    }

    const actualizado = [...objetos];
    const patch = { texto: textoNuevoRaw };
    const shouldKeepCenterX =
      objeto.tipo === "texto" &&
      !objeto.__groupAlign &&
      !Number.isFinite(objeto.width) &&
      objeto.__autoWidth !== false;
    const lockedCenterX =
      inlineEditPreviewRef.current?.id === finishId &&
      Number.isFinite(inlineEditPreviewRef.current?.centerX)
        ? inlineEditPreviewRef.current.centerX
        : null;

    if (shouldKeepCenterX) {
      const nextX = calcularXTextoCentrado(objeto, textoNuevoRaw, lockedCenterX);
      const currentX = Number.isFinite(objeto?.x) ? objeto.x : 0;
      if (Number.isFinite(nextX) && Math.abs(nextX - currentX) > 0.01) {
        patch.x = nextX;
      }
    }

    actualizado[index] = {
      ...actualizado[index],
      ...patch,
    };

    const expectedX = Number.isFinite(patch.x)
      ? patch.x
      : (Number.isFinite(actualizado[index]?.x) ? actualizado[index].x : null);
    inlineCommitDebugRef.current = {
      id: finishId,
      expectedX,
      objectXBeforeCommit: Number.isFinite(objeto?.x) ? objeto.x : null,
      textLength: textoNuevoRaw.length,
    };

    captureInlineSnapshot("finish: before-flush", {
      id: finishId,
      expectedX,
      patchX: patch.x ?? null,
    });
    flushSync(() => {
      setObjetos(actualizado);
    });
    captureInlineSnapshot("finish: after-flush", {
      id: finishId,
      expectedX,
      patchX: patch.x ?? null,
    });

    inlineEditPreviewRef.current = { id: null, centerX: null };
    inlineCommitDebugRef.current = { id: null };

    flushSync(() => {
      setInlineOverlayMountedId((prev) => (prev === finishId ? null : prev));
      setInlineOverlayMountSession((prev) => {
        const prevId = prev?.mounted ? prev.id : null;
        if (prevId !== finishId) return prev;
        return {
          id: null,
          sessionId: null,
          mounted: false,
          swapCommitted: false,
          phase: "finish-commit",
          token: Number(prev?.token || 0),
        };
      });
      finishEdit();
    });
    restoreElementDrag(finishId);
    clearCurrentInlineEditingIdIfMatches(finishId);
    captureInlineSnapshot("finish: after-finishEdit", {
      id: finishId,
      expectedX,
      patchX: patch.x ?? null,
    });
  };

  return {
    onInlineChange,
    onInlineDebugEvent,
    onInlineFinish,
  };
}
