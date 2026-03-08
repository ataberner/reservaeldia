import { useEffect } from "react";
import { flushSync } from "react-dom";
import { getInlineLineStats, inlineDebugLog } from "@/components/editor/canvasEditor/inlineSnapshotPrimitives";
import {
  resolveInlineStageViewportMetrics as resolveInlineStageViewportMetricsShared,
} from "@/components/editor/overlays/inlineGeometry";
import {
  normalizeInlineEditableText as normalizeInlineEditableTextShared,
} from "@/components/editor/overlays/inlineTextModel";
import {
  clearCurrentInlineEditingIdIfMatches,
  getCurrentInlineEditingId,
  getInlineEditingSnapshot,
} from "@/components/editor/textSystem/bridges/window/inlineWindowBridge";

export default function useCanvasEditorInlineCommitHandlers({
  editing,
  captureInlineSnapshot,
  updateEdit,
  objetos,
  elementRefs,
  inlineEditPreviewRef,
  inlineCommitDebugRef,
  inlineOverlayMountedId,
  setInlineOverlayMountedId,
  inlineOverlayEngine = "legacy",
  finishEdit,
  restoreElementDrag,
  stageRef,
  escalaVisual,
  medirAnchoTextoKonva,
  obtenerMetricasTexto,
  calcularXTextoCentrado,
  setObjetos,
  obtenerMetricasNodoInline,
}) {
useEffect(() => {
  const pending = inlineCommitDebugRef.current;
  if (!pending?.id) return;
  if (editing.id) return;

  const finalObj = objetos.find((o) => o.id === pending.id);
  const finalNode = elementRefs.current[pending.id];
  const finalNodeMetrics = obtenerMetricasNodoInline(finalNode);
  const finalX = Number.isFinite(finalObj?.x) ? finalObj.x : null;
  const deltaFinalVsExpected =
    Number.isFinite(finalX) && Number.isFinite(pending.expectedX)
      ? finalX - pending.expectedX
      : null;

  inlineDebugLog("finish-post-commit", {
    ...pending,
    finalX,
    deltaFinalVsExpected,
    finalNodeMetrics,
  });

  const shouldAutoCorrectFinalX =
    Number.isFinite(pending.expectedX) &&
    Number.isFinite(finalX) &&
    Math.abs(deltaFinalVsExpected) > 0.25;
  if (shouldAutoCorrectFinalX) {
    inlineDebugLog("finish-post-commit:autocorrect-x", {
      id: pending.id,
      fromX: finalX,
      toX: pending.expectedX,
      deltaFinalVsExpected,
    });
    setObjetos((prev) => {
      const index = prev.findIndex((o) => o.id === pending.id);
      if (index < 0) return prev;
      const current = prev[index];
      const currentX = Number.isFinite(current?.x) ? current.x : null;
      if (
        Number.isFinite(currentX) &&
        Number.isFinite(pending.expectedX) &&
        Math.abs(currentX - pending.expectedX) <= 0.01
      ) {
        return prev;
      }
      const next = [...prev];
      next[index] = {
        ...current,
        x: pending.expectedX,
      };
      return next;
    });
  }

  inlineCommitDebugRef.current = { id: null };
}, [editing.id, objetos, obtenerMetricasNodoInline]);

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
  const isPhaseAtomicV2 = inlineOverlayEngine === "phase_atomic_v2";
  const isLegacyExitRcaDiagEnabled =
    !isPhaseAtomicV2 &&
    typeof window !== "undefined" &&
    window.__INLINE_DEBUG === true;
  let drawRequestedByBatchDraw = false;
  let lastKnownBaseRect = null;
  const roundDiagMetric = (value, digits = 4) => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return null;
    return Number(numeric.toFixed(digits));
  };
  const readOverlayBaseSnapshot = () => {
    if (typeof document === "undefined") {
      return { overlayDomPresent: false, overlayRect: null };
    }
    const safeId = String(finishId || "").replace(/"/g, '\\"');
    if (!safeId) {
      return { overlayDomPresent: false, overlayRect: null };
    }
    const overlayEl = document.querySelector(`[data-inline-editor-id="${safeId}"]`);
    if (!overlayEl) {
      return { overlayDomPresent: false, overlayRect: null };
    }
    const rect = overlayEl.getBoundingClientRect?.();
    if (
      !Number.isFinite(Number(rect?.x)) ||
      !Number.isFinite(Number(rect?.y)) ||
      !Number.isFinite(Number(rect?.width)) ||
      !Number.isFinite(Number(rect?.height))
    ) {
      return { overlayDomPresent: true, overlayRect: null };
    }
    const overlayRect = {
      x: roundDiagMetric(rect.x),
      y: roundDiagMetric(rect.y),
      width: roundDiagMetric(rect.width),
      height: roundDiagMetric(rect.height),
    };
    lastKnownBaseRect = overlayRect;
    return {
      overlayDomPresent: true,
      overlayRect,
    };
  };
  const readKonvaRawRectViewport = (node, stage) => {
    if (!node || !stage) return null;
    if (typeof node.getClientRect !== "function") return null;
    const localRect = node.getClientRect({
      relativeTo: stage,
      skipTransform: false,
      skipShadow: true,
      skipStroke: true,
    });
    const localX = Number(localRect?.x);
    const localY = Number(localRect?.y);
    const localWidth = Number(localRect?.width);
    const localHeight = Number(localRect?.height);
    if (![localX, localY, localWidth, localHeight].every(Number.isFinite)) return null;
    const stageMetrics = resolveInlineStageViewportMetricsShared(stage, {
      scaleVisual: escalaVisual,
    });
    const stageRect = stageMetrics?.stageRect;
    const totalScaleX = Number(stageMetrics?.totalScaleX);
    const totalScaleY = Number(stageMetrics?.totalScaleY);
    if (!stageRect) return null;
    if (!Number.isFinite(totalScaleX) || !Number.isFinite(totalScaleY)) return null;
    return {
      x: roundDiagMetric(Number(stageRect.left) + localX * totalScaleX),
      y: roundDiagMetric(Number(stageRect.top) + localY * totalScaleY),
      width: roundDiagMetric(localWidth * totalScaleX),
      height: roundDiagMetric(localHeight * totalScaleY),
    };
  };
  const readKonvaNodeValue = (node, key) => {
    if (!node) return null;
    try {
      const fn = node[key];
      if (typeof fn === "function") {
        const value = fn.call(node);
        return typeof value === "undefined" ? null : value;
      }
      if (typeof node.getAttr === "function") {
        const value = node.getAttr(key);
        return typeof value === "undefined" ? null : value;
      }
      if (node?.attrs && Object.prototype.hasOwnProperty.call(node.attrs, key)) {
        return node.attrs[key];
      }
    } catch {
      return null;
    }
    return null;
  };
  const emitLegacyExitRcaCheckpoint = (eventName, details = {}) => {
    if (!isLegacyExitRcaDiagEnabled) return;
    try {
      const stage =
        details?.stage ||
        stageRef.current?.getStage?.() ||
        stageRef.current ||
        null;
      const liveNode = elementRefs.current[finishId] || null;
      const overlaySnapshot = readOverlayBaseSnapshot();
      const konvaRectBase = overlaySnapshot.overlayRect || lastKnownBaseRect;
      const konvaRectRaw = readKonvaRawRectViewport(liveNode, stage);
      const layer = liveNode?.getLayer?.() || null;
      const rawX = Number(konvaRectRaw?.x);
      const rawWidth = Number(konvaRectRaw?.width);
      const baseX = Number(konvaRectBase?.x);
      const baseWidth = Number(konvaRectBase?.width);
      const payload = {
        eventName,
        id: finishId || null,
        phase: "legacy-exit-rca",
        overlayDomPresent: overlaySnapshot.overlayDomPresent,
        overlayRect: overlaySnapshot.overlayRect,
        konvaNode: {
          opacity: roundDiagMetric(readKonvaNodeValue(liveNode, "opacity")),
          visible: (() => {
            const value = readKonvaNodeValue(liveNode, "visible");
            return typeof value === "boolean" ? value : null;
          })(),
          text: (() => {
            const value = readKonvaNodeValue(liveNode, "text");
            return value == null ? null : String(value);
          })(),
          x: roundDiagMetric(readKonvaNodeValue(liveNode, "x")),
          width: roundDiagMetric(readKonvaNodeValue(liveNode, "width")),
          scaleX: roundDiagMetric(readKonvaNodeValue(liveNode, "scaleX")),
          offsetX: roundDiagMetric(readKonvaNodeValue(liveNode, "offsetX")),
        },
        konvaRectRaw,
        konvaRectBase,
        rawVsBaseDelta: {
          dx:
            Number.isFinite(rawX) && Number.isFinite(baseX)
              ? roundDiagMetric(rawX - baseX)
              : null,
          widthDw:
            Number.isFinite(rawWidth) && Number.isFinite(baseWidth)
              ? roundDiagMetric(rawWidth - baseWidth)
              : null,
        },
        commitTextFinal: String(textoNuevoRaw ?? ""),
        patchXFinal: Number.isFinite(patch?.x) ? roundDiagMetric(patch.x) : null,
        drawRequestedByBatchDraw: Boolean(drawRequestedByBatchDraw),
        layerWaitingForDraw:
          layer && Object.prototype.hasOwnProperty.call(layer, "_waitingForDraw")
            ? Boolean(layer._waitingForDraw)
            : null,
        barrierResult: typeof details?.barrierResult === "string" ? details.barrierResult : null,
        waitRafCount: Number.isFinite(Number(details?.waitRafCount))
          ? Number(details.waitRafCount)
          : null,
        waitingForDrawAtReveal:
          typeof details?.waitingForDrawAtReveal === "boolean"
            ? details.waitingForDrawAtReveal
            : null,
      };
      console.log(`[INLINE][DIAG] ${eventName}\n${JSON.stringify(payload, null, 2)}`);
    } catch (diagError) {
      console.warn("[INLINE][DIAG] legacy-exit-rca-error", {
        eventName,
        error: String(diagError || ""),
      });
    }
  };
  const clearLegacyInlineOverlayMounted = () => {
    if (isPhaseAtomicV2) return;
    if (typeof setInlineOverlayMountedId !== "function") return;
    setInlineOverlayMountedId((prev) => (prev === finishId ? null : prev));
  };
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
  let textoNuevoRaw =
    domRawText == null
      ? normalizeInlineEditableTextShared(String(editing.value ?? ""), {
        trimPhantomTrailingNewline: true,
      })
      : normalizeInlineEditableTextShared(domRawText, {
        trimPhantomTrailingNewline: true,
      });
  const domCenterXCanvas = (() => {
    if (!overlayRoot || typeof document === "undefined") return null;
    const overlayRect = overlayRoot.getBoundingClientRect?.();
    if (
      !Number.isFinite(overlayRect?.left) ||
      !Number.isFinite(overlayRect?.width)
    ) {
      return null;
    }
    const stage = stageRef.current?.getStage?.() || stageRef.current || null;
    const stageMetrics = resolveInlineStageViewportMetricsShared(stage, {
      scaleVisual: escalaVisual,
    });
    const stageRect = stageMetrics?.stageRect;
    const totalScaleX = Number(stageMetrics?.totalScaleX);
    if (!stageRect || !Number.isFinite(stageRect.left)) return null;
    if (!Number.isFinite(totalScaleX) || totalScaleX <= 0) return null;
    const centerXViewport = overlayRect.left + (overlayRect.width / 2);
    return (centerXViewport - stageRect.left) / totalScaleX;
  })();
  captureInlineSnapshot("finish: blur", {
    id: finishId,
    valueLength: textoNuevoRaw.length,
  });
  const textoNuevoValidado = textoNuevoRaw.trim();
  const index = objetos.findIndex(o => o.id === finishId);
  const objeto = objetos[index];
  const liveNodeAtFinish = elementRefs.current[finishId];
  const liveMetricsAtFinish = obtenerMetricasNodoInline(liveNodeAtFinish);

  inlineDebugLog("finish-start", {
    id: finishId,
    rawLength: textoNuevoRaw.length,
    trimmedLength: textoNuevoValidado.length,
    objectX: objeto?.x ?? null,
    objectY: objeto?.y ?? null,
    domCenterXCanvas,
    previewRef: { ...inlineEditPreviewRef.current },
    liveMetricsAtFinish,
  });

  if (index === -1) {
    console.warn("? El objeto ya no existe. Cancelando guardado.");
    inlineDebugLog("finish-abort-missing-object", { id: finishId });
    inlineCommitDebugRef.current = { id: null };
    finishEdit();
    restoreElementDrag(finishId);
    return;
  }

  // ?? PodÃ©s permitir texto vacÃ­o en formas si querÃ©s (yo lo permitirÃ­a)
  if (textoNuevoValidado === "" && objeto.tipo === "texto") {
    console.warn("?? El texto estÃ¡ vacÃ­o. No se actualiza.");
    inlineDebugLog("finish-abort-empty", {
      id: finishId,
      rawLength: textoNuevoRaw.length,
      trimmedLength: textoNuevoValidado.length,
    });
    inlineCommitDebugRef.current = { id: null };
    inlineEditPreviewRef.current = { id: null, centerX: null };
    finishEdit();
    restoreElementDrag(finishId);
    return;
  }

  const textoActualRaw = String(objeto?.texto ?? "");
  const textoSinCambios = textoNuevoRaw === textoActualRaw;
  if (textoSinCambios) {
    inlineDebugLog("finish-noop-unchanged-text", {
      id: finishId,
      valueLength: textoNuevoRaw.length,
    });
    inlineCommitDebugRef.current = { id: null };
    inlineEditPreviewRef.current = { id: null, centerX: null };
    finishEdit();
    restoreElementDrag(finishId);
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
    const baseLineHeight =
      typeof objeto.lineHeight === "number" && objeto.lineHeight > 0
        ? objeto.lineHeight
        : 1.2;
    const letterSpacing =
      Number.isFinite(Number(objeto.letterSpacing)) ? Number(objeto.letterSpacing) : 0;
    const liveNodeX =
      Number.isFinite(liveMetricsAtFinish?.x) ? liveMetricsAtFinish.x : (
        typeof liveNodeAtFinish?.x === "function" ? liveNodeAtFinish.x() : null
      );
    const nextWidthFromKonva = medirAnchoTextoKonva(objeto, textoNuevoRaw);
    const nextMetrics = obtenerMetricasTexto(textoNuevoRaw, {
      fontSize: objeto.fontSize,
      fontFamily: objeto.fontFamily,
      fontWeight: objeto.fontWeight,
      fontStyle: objeto.fontStyle,
      lineHeight: baseLineHeight * 0.92,
      letterSpacing,
    });
    const nextWidth =
      Number.isFinite(nextWidthFromKonva) && nextWidthFromKonva > 0
        ? nextWidthFromKonva
        : nextMetrics.width;
    const availableWidthForCenter = Math.max(
      1,
      800 - (
        Number.isFinite(objeto.x)
          ? objeto.x
          : (Number.isFinite(liveNodeX) ? liveNodeX : 0)
      )
    );
    const centerWidthForCommit =
      Number.isFinite(nextWidth) && nextWidth > 0
        ? Math.min(nextWidth, availableWidthForCenter)
        : nextWidth;
    const xFromDomCenter =
      Number.isFinite(domCenterXCanvas) && Number.isFinite(centerWidthForCommit)
        ? domCenterXCanvas - (centerWidthForCommit / 2)
        : null;
    const nextX = calcularXTextoCentrado(
      objeto,
      textoNuevoRaw,
      lockedCenterX
    );
    const currentX = Number.isFinite(objeto.x) ? objeto.x : 0;
    const committedX = Number.isFinite(xFromDomCenter)
      ? xFromDomCenter
      : (Number.isFinite(liveNodeX) ? liveNodeX : nextX);
    if (Number.isFinite(committedX) && Math.abs(committedX - currentX) > 0.01) {
      patch.x = committedX;
    }

    inlineDebugLog("finish-center-computed", {
      id: finishId,
      shouldKeepCenterX,
      lockedCenterX,
      domCenterXCanvas,
      nextWidth,
      centerWidthForCommit,
      availableWidthForCenter,
      xFromDomCenter,
      liveNodeX,
      currentX,
      nextX,
      committedX: patch.x ?? null,
    });
  }

  actualizado[index] = {
    ...actualizado[index],
    ...patch
  };

  const expectedX = Number.isFinite(patch.x)
    ? patch.x
    : (Number.isFinite(objeto.x) ? objeto.x : null);
  inlineCommitDebugRef.current = {
    id: finishId,
    expectedX,
    objectXBeforeCommit: Number.isFinite(objeto.x) ? objeto.x : null,
    liveNodeXAtFinish: Number.isFinite(liveMetricsAtFinish?.x)
      ? liveMetricsAtFinish.x
      : null,
    previewCenterX: null,
    textLength: textoNuevoRaw.length,
  };

  inlineDebugLog("finish-apply-patch", {
    id: finishId,
    patch,
    expectedX,
  });
  const logFinishVisibilityCheck = (phase) => {
    const safeId = String(finishId || "").replace(/"/g, '\\"');
    const overlayDomPresent = safeId
      ? Boolean(document.querySelector(`[data-inline-editor-id="${safeId}"]`))
      : false;
    const liveNode = elementRefs.current[finishId];
    inlineDebugLog("finish-visibility-check", {
      phase,
      id: finishId,
      reactiveEditingId: editing.id || null,
      globalEditingId: getInlineEditingSnapshot()?.id ?? null,
      currentEditingId: getCurrentInlineEditingId() ?? null,
      overlayMountedId: inlineOverlayMountedId ?? null,
      overlayDomPresent,
      nodeOpacity:
        typeof liveNode?.opacity === "function"
          ? liveNode.opacity()
          : null,
      nodeVisible:
        typeof liveNode?.visible === "function"
          ? liveNode.visible()
          : null,
      nodeMetrics: obtenerMetricasNodoInline(liveNode),
    });
  };
  logFinishVisibilityCheck("before-commit");

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
  emitLegacyExitRcaCheckpoint("exit:post-commit-pre-reveal");
  logFinishVisibilityCheck("after-commit-before-finishEdit");
  inlineEditPreviewRef.current = { id: null, centerX: null };
  const LEGACY_REVEAL_MAX_WAIT_RAF = 8;
  const resolveStageForReveal = () =>
    stageRef.current?.getStage?.() || stageRef.current || null;
  const readLayerWaitingForDrawSignal = (layer) => {
    if (!layer) return null;
    if (!Object.prototype.hasOwnProperty.call(layer, "_waitingForDraw")) return null;
    return Boolean(layer._waitingForDraw);
  };
  const requestBatchDraw = ({ layer, stage }) => {
    if (typeof layer?.batchDraw === "function") {
      drawRequestedByBatchDraw = true;
      layer.batchDraw();
      return "layer";
    }
    if (typeof stage?.batchDraw === "function") {
      drawRequestedByBatchDraw = true;
      stage.batchDraw();
      return "stage";
    }
    return null;
  };

  let revealDone = false;
  const finalizeReveal = ({
    barrierResult = null,
    waitRafCount = 0,
    waitingForDrawAtReveal = null,
    stageForReveal = null,
    requestPostRevealBatchDraw = false,
  } = {}) => {
    if (revealDone) return;
    revealDone = true;

    flushSync(() => {
      clearLegacyInlineOverlayMounted();
      finishEdit();
    });
    restoreElementDrag(finishId);

    const revealStage = stageForReveal || resolveStageForReveal();
    if (requestPostRevealBatchDraw && typeof revealStage?.batchDraw === "function") {
      drawRequestedByBatchDraw = true;
      revealStage.batchDraw();
    }
    emitLegacyExitRcaCheckpoint("exit:reveal-sync", {
      stage: revealStage,
      barrierResult,
      waitRafCount,
      waitingForDrawAtReveal,
    });
    logFinishVisibilityCheck("after-finishEdit-sync");
    clearCurrentInlineEditingIdIfMatches(finishId);
    captureInlineSnapshot("finish: after-finishEdit", {
      id: finishId,
      expectedX,
      patchX: patch.x ?? null,
    });

    requestAnimationFrame(() => {
      emitLegacyExitRcaCheckpoint("exit:after-raf1", {
        stage: revealStage,
        barrierResult,
        waitRafCount,
        waitingForDrawAtReveal,
      });
      logFinishVisibilityCheck("after-finishEdit-raf1");
      captureInlineSnapshot("finish: raf1", {
        id: finishId,
        expectedX,
        patchX: patch.x ?? null,
      });
      requestAnimationFrame(() => {
        captureInlineSnapshot("finish: raf2", {
          id: finishId,
          expectedX,
          patchX: patch.x ?? null,
        });
      });
    });
  };

  if (isPhaseAtomicV2) {
    const phaseAtomicStage = resolveStageForReveal();
    finalizeReveal({
      stageForReveal: phaseAtomicStage,
      requestPostRevealBatchDraw: true,
    });
    return;
  }

  const targetNode = elementRefs.current[finishId] || null;
  const targetLayer = targetNode?.getLayer?.() || null;
  const legacyStage = resolveStageForReveal();
  const drawSource = requestBatchDraw({
    layer: targetLayer,
    stage: legacyStage,
  });
  const canConfirmDraw = drawSource === "layer" && readLayerWaitingForDrawSignal(targetLayer) !== null;

  if (!canConfirmDraw) {
    finalizeReveal({
      barrierResult: "fallback-no-confirmation",
      waitRafCount: 0,
      waitingForDrawAtReveal: readLayerWaitingForDrawSignal(targetLayer),
      stageForReveal: legacyStage,
    });
    return;
  }

  let waitRafCount = 0;
  const waitForLayerDraw = () => {
    waitRafCount += 1;
    const waitingSignal = readLayerWaitingForDrawSignal(targetLayer);
    const isSettled = waitRafCount >= 1 && waitingSignal === false;

    if (isSettled) {
      finalizeReveal({
        barrierResult: "draw-settled",
        waitRafCount,
        waitingForDrawAtReveal: waitingSignal,
        stageForReveal: legacyStage,
      });
      return;
    }

    if (waitRafCount >= LEGACY_REVEAL_MAX_WAIT_RAF) {
      finalizeReveal({
        barrierResult: "timeout",
        waitRafCount,
        waitingForDrawAtReveal: waitingSignal,
        stageForReveal: legacyStage,
      });
      return;
    }

    requestAnimationFrame(waitForLayerDraw);
  };

  requestAnimationFrame(waitForLayerDraw);
  };

  return {
    onInlineChange,
    onInlineDebugEvent,
    onInlineFinish,
  };
}

