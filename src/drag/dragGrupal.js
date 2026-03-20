// C:\Reservaeldia\src\drag\dragGrupal.js
import { determinarNuevaSeccion } from "@/utils/layout";
import {
  getCanvasPointerDebugInfo,
  getCanvasSelectionDebugInfo,
  getKonvaNodeDebugInfo,
  logSelectedDragDebug,
  resetCanvasInteractionLogSample,
  sampleCanvasInteractionLog,
} from "@/components/editor/canvasEditor/selectedDragDebug";
import { resolveCanonicalNodePose } from "@/components/editor/canvasEditor/konvaCanonicalPose";

const isDragGrupalDebugEnabled = () =>
  typeof window !== "undefined" && window.__DBG_DRAG_GRUPAL === true;

const dlog = (...args) => {
  if (!isDragGrupalDebugEnabled()) return;
  console.log(...args);
};

const dwarn = (...args) => {
  if (!isDragGrupalDebugEnabled()) return;
  console.warn(...args);
};

function getNowMs() {
  return typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();
}

function buildGroupDragSessionId(leaderId) {
  return `${leaderId || "group"}:${Math.round(getNowMs())}`;
}

const MANUAL_GROUP_DRAG_MOVE_THRESHOLD_POINTER = 4;
const MANUAL_GROUP_DRAG_MOVE_THRESHOLD_TOUCH = 6;
const MANUAL_GROUP_FINAL_PREVIEW_SYNC_EPSILON = 0.01;

function buildGroupDragResult(overrides = {}) {
  return {
    handled: false,
    role: "none",
    mode: "not-group",
    sessionId: null,
    leaderId: null,
    restorePose: null,
    shouldDispatchDraggingEnd: false,
    shouldRunPersonalizedEnd: false,
    completed: false,
    deltaSource: null,
    session: null,
    ...overrides,
  };
}

function buildGroupDeltaResult(overrides = {}) {
  const deltaX = Number(overrides?.deltaX);
  const deltaY = Number(overrides?.deltaY);
  const isValid = Number.isFinite(deltaX) && Number.isFinite(deltaY);

  return {
    isValid,
    deltaX: isValid ? deltaX : null,
    deltaY: isValid ? deltaY : null,
    source: isValid ? overrides?.source || null : null,
    reason: isValid ? null : overrides?.reason || "invalid-delta",
    ...overrides,
    isValid,
    deltaX: isValid ? deltaX : null,
    deltaY: isValid ? deltaY : null,
  };
}

export function getActiveGroupDragSession() {
  if (typeof window === "undefined") return null;
  const session = window._groupDragSession || null;
  return session?.active ? session : null;
}

export function getAnyGroupDragSession() {
  if (typeof window === "undefined") return null;
  return window._groupDragSession || null;
}

function getRecentGroupDragGuard() {
  if (typeof window === "undefined") return null;
  const guard = window._recentGroupDragGuard || null;
  if (!guard) return null;
  if (Number.isFinite(guard.untilMs) && guard.untilMs > getNowMs()) {
    return guard;
  }
  window._recentGroupDragGuard = null;
  return null;
}

function setRecentGroupDragGuard(session, durationMs = 120) {
  if (typeof window === "undefined" || !session) return null;
  const nextGuard = {
    sessionId: session.sessionId || null,
    leaderId: session.leaderId || null,
    elementIds: Array.isArray(session.elementIds) ? [...session.elementIds] : [],
    untilMs: getNowMs() + Number(durationMs || 120),
  };
  window._recentGroupDragGuard = nextGuard;
  return nextGuard;
}

export function shouldSuppressIndividualDragForElement(elementId) {
  if (!elementId) return false;

  const activeSession = getAnyGroupDragSession();
  if (
    activeSession?.active &&
    Array.isArray(activeSession.elementIds) &&
    activeSession.elementIds.includes(elementId)
  ) {
    return true;
  }

  const recentGuard = getRecentGroupDragGuard();
  return Boolean(
    recentGuard &&
    Array.isArray(recentGuard.elementIds) &&
    recentGuard.elementIds.includes(elementId)
  );
}

function syncLegacyGroupGlobalsFromSession(session) {
  if (typeof window === "undefined") return;

  const activeSession = session?.active ? session : null;
  const shouldExposeLegacyGlobals = Boolean(
    activeSession &&
    (
      activeSession.engine !== "manual-pointer" ||
      activeSession.phase === "active" ||
      activeSession.phase === "ending"
    )
  );
  const legacyDragStartPos =
    activeSession?.engine === "manual-pointer"
      ? (
          activeSession.phase === "active" || activeSession.phase === "ending"
            ? resolveManualMotionStartPointer(activeSession)
            : activeSession.pointerDownStage || activeSession.startPointer || null
        )
      : activeSession?.startPointer || null;
  window._grupoLider = shouldExposeLegacyGlobals ? activeSession?.leaderId || null : null;
  window._grupoElementos = shouldExposeLegacyGlobals ? activeSession?.elementIds || null : null;
  window._grupoSeguidores = shouldExposeLegacyGlobals ? activeSession?.followerIds || null : null;
  window._dragStartPos = shouldExposeLegacyGlobals ? legacyDragStartPos : null;
  window._dragInicial = shouldExposeLegacyGlobals ? activeSession?.dragInicial || null : null;
  window._groupPreviewLastDelta =
    shouldExposeLegacyGlobals &&
    Number.isFinite(activeSession?.lastPreviewDelta?.deltaX) &&
    Number.isFinite(activeSession?.lastPreviewDelta?.deltaY)
      ? {
          deltaX: activeSession.lastPreviewDelta.deltaX,
          deltaY: activeSession.lastPreviewDelta.deltaY,
        }
      : null;
}

function setActiveGroupDragSession(session) {
  if (typeof window === "undefined") return null;
  window._groupDragSession = session || null;
  syncLegacyGroupGlobalsFromSession(session || null);
  return window._groupDragSession;
}

function clearActiveGroupDragSession() {
  if (typeof window === "undefined") return;
  window._groupDragSession = null;
  syncLegacyGroupGlobalsFromSession(null);
}

function hasFinitePoint(point) {
  return Number.isFinite(point?.x) && Number.isFinite(point?.y);
}

function getNativeClientPoint(nativeEvent) {
  if (!nativeEvent) return null;

  if (nativeEvent.touches?.[0]) {
    return {
      clientX: Number(nativeEvent.touches[0].clientX),
      clientY: Number(nativeEvent.touches[0].clientY),
    };
  }

  if (nativeEvent.changedTouches?.[0]) {
    return {
      clientX: Number(nativeEvent.changedTouches[0].clientX),
      clientY: Number(nativeEvent.changedTouches[0].clientY),
    };
  }

  if (
    Number.isFinite(Number(nativeEvent.clientX)) &&
    Number.isFinite(Number(nativeEvent.clientY))
  ) {
    return {
      clientX: Number(nativeEvent.clientX),
      clientY: Number(nativeEvent.clientY),
    };
  }

  return null;
}

function resolveSessionStage(session, fallbackStage = null) {
  const stage = session?.stage || fallbackStage || null;
  return stage?.getStage?.() || stage || null;
}

function readStagePointer(stage) {
  const pointer = stage?.getPointerPosition?.() || null;
  return hasFinitePoint(pointer) ? { x: pointer.x, y: pointer.y } : null;
}

function resolveStagePointerFromNativeEvent(stage, nativeEvent) {
  if (!stage || !nativeEvent) return null;

  try {
    stage.setPointersPositions?.(nativeEvent);
    const point = stage.getPointerPosition?.();
    if (point && Number.isFinite(point.x) && Number.isFinite(point.y)) {
      return { x: Number(point.x), y: Number(point.y) };
    }
  } catch {}

  const clientPoint = getNativeClientPoint(nativeEvent);
  const rect = stage.container?.().getBoundingClientRect?.();
  if (!clientPoint || !rect) return null;

  const scaleX = rect.width > 0 ? stage.width() / rect.width : 1;
  const scaleY = rect.height > 0 ? stage.height() / rect.height : 1;

  return {
    x: (clientPoint.clientX - rect.left) * scaleX,
    y: (clientPoint.clientY - rect.top) * scaleY,
  };
}

function buildNativePointerDebugInfo(stage, nativeEvent) {
  const stagePointer = resolveStagePointerFromNativeEvent(stage, nativeEvent);
  const clientPoint = getNativeClientPoint(nativeEvent);
  return {
    type: nativeEvent?.type || null,
    pointerType: nativeEvent?.pointerType || (nativeEvent?.touches ? "touch" : "mouse"),
    button:
      Number.isFinite(Number(nativeEvent?.button)) ? Number(nativeEvent.button) : null,
    buttons:
      Number.isFinite(Number(nativeEvent?.buttons)) ? Number(nativeEvent.buttons) : null,
    clientX: Number.isFinite(clientPoint?.clientX) ? clientPoint.clientX : null,
    clientY: Number.isFinite(clientPoint?.clientY) ? clientPoint.clientY : null,
    stageX: Number.isFinite(stagePointer?.x) ? stagePointer.x : null,
    stageY: Number.isFinite(stagePointer?.y) ? stagePointer.y : null,
  };
}

function getPointerMoveThreshold(pointerType) {
  return String(pointerType || "").toLowerCase() === "touch"
    ? MANUAL_GROUP_DRAG_MOVE_THRESHOLD_TOUCH
    : MANUAL_GROUP_DRAG_MOVE_THRESHOLD_POINTER;
}

function areGroupDeltaValuesClose(a, b, epsilon = MANUAL_GROUP_FINAL_PREVIEW_SYNC_EPSILON) {
  return Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= epsilon;
}

function doesDeltaMatchLastPreview(deltaData, lastPreviewDelta) {
  return Boolean(
    deltaData?.isValid &&
    Number.isFinite(lastPreviewDelta?.deltaX) &&
    Number.isFinite(lastPreviewDelta?.deltaY) &&
    areGroupDeltaValuesClose(deltaData.deltaX, lastPreviewDelta.deltaX) &&
    areGroupDeltaValuesClose(deltaData.deltaY, lastPreviewDelta.deltaY)
  );
}

function resolveNativePointerId(nativeEvent) {
  if (Number.isFinite(Number(nativeEvent?.pointerId))) {
    return Number(nativeEvent.pointerId);
  }
  return null;
}

function resolveNativePointerType(nativeEvent) {
  if (nativeEvent?.pointerType) return String(nativeEvent.pointerType);
  if (nativeEvent?.touches || nativeEvent?.changedTouches) return "touch";
  return "mouse";
}

function shouldStartGroupDrag(objId, selectedIds = []) {
  return selectedIds.length > 1 && selectedIds.includes(objId);
}

function resolveRawNodePose(node, objectMeta = null) {
  const canonicalPose = resolveCanonicalNodePose(node, objectMeta);
  return {
    rawX: canonicalPose?.rawX,
    rawY: canonicalPose?.rawY,
    rotation: canonicalPose?.rotation,
  };
}

function captureGroupInitialPose(elementId) {
  const objeto = window._objetosActuales?.find((item) => item.id === elementId) || null;
  const node = window._elementRefs?.[elementId] || null;

  if (node) {
    const rawPose = resolveRawNodePose(node, objeto);
    if (Number.isFinite(rawPose.rawX) && Number.isFinite(rawPose.rawY)) {
      return {
        x: rawPose.rawX,
        y: rawPose.rawY,
      };
    }
  }

  if (!objeto) return null;

  const sectionIndex = (window._seccionesOrdenadas || []).findIndex(
    (section) => section.id === objeto.seccionId
  );
  const offsetY =
    sectionIndex >= 0
      ? (window._seccionesOrdenadas || [])
          .slice(0, sectionIndex)
          .reduce((sum, section) => sum + (section.altura || 0), 0)
      : 0;

  return {
    x: Number(objeto.x || 0),
    y: Number(objeto.y || 0) + offsetY,
  };
}

function captureGroupDragInicial(elementIds = []) {
  return elementIds.reduce((snapshot, elementId) => {
    const pose = captureGroupInitialPose(elementId);
    if (!pose) return snapshot;
    snapshot[elementId] = pose;
    return snapshot;
  }, {});
}

function clonePoseMap(poseMap = null) {
  if (!poseMap || typeof poseMap !== "object") return null;

  return Object.entries(poseMap).reduce((snapshot, [elementId, pose]) => {
    if (!pose) return snapshot;
    snapshot[elementId] = {
      x: Number.isFinite(pose.x) ? pose.x : 0,
      y: Number.isFinite(pose.y) ? pose.y : 0,
    };
    return snapshot;
  }, {});
}

function captureSessionPoseMap(session) {
  const elementIds = Array.isArray(session?.elementIds) ? session.elementIds : [];
  return clonePoseMap(captureGroupDragInicial(elementIds)) || {};
}

function resolveManualPreviewBasePose(session) {
  return (
    session?.previewBasePose ||
    session?.commitBasePose ||
    session?.memberInitialPose ||
    session?.dragInicial ||
    null
  );
}

function resolveManualCommitBasePose(session) {
  return (
    session?.commitBasePose ||
    session?.previewBasePose ||
    session?.memberInitialPose ||
    session?.dragInicial ||
    null
  );
}

function resolveManualMotionStartPointer(session) {
  if (hasFinitePoint(session?.activationPointerStage)) {
    return session.activationPointerStage;
  }
  if (session?.phase === "active" || session?.phase === "ending") {
    return null;
  }
  if (hasFinitePoint(session?.pointerDownStage)) {
    return session.pointerDownStage;
  }
  return session?.startPointerStage || session?.startPointer || null;
}

function readNodeInteractionState(node) {
  if (!node) {
    return {
      draggable: null,
      listening: null,
    };
  }

  return {
    draggable:
      typeof node.draggable === "function" ? Boolean(node.draggable()) : null,
    listening:
      typeof node.listening === "function" ? Boolean(node.listening()) : null,
  };
}

function captureFollowerInteractionSnapshot(followerIds = []) {
  return followerIds.reduce((snapshot, elementId) => {
    const node = window._elementRefs?.[elementId];
    if (!node) return snapshot;
    snapshot[elementId] = readNodeInteractionState(node);
    return snapshot;
  }, {});
}

function captureLeaderInteractionSnapshot(leaderId) {
  const node = leaderId ? window._elementRefs?.[leaderId] : null;
  return readNodeInteractionState(node);
}

function applyNodeInteractionState(node, nextState = {}) {
  if (!node) return;

  if (
    Object.prototype.hasOwnProperty.call(nextState, "draggable") &&
    typeof node.draggable === "function"
  ) {
    node.draggable(Boolean(nextState.draggable));
  }

  if (
    Object.prototype.hasOwnProperty.call(nextState, "listening") &&
    typeof node.listening === "function"
  ) {
    node.listening(Boolean(nextState.listening));
  }

  node.getLayer?.()?.batchDraw?.();
}

function setFollowerInteractionState(
  followerIds = [],
  nextState = {},
  interactionSnapshot = null
) {
  followerIds.forEach((elementId) => {
    const node = window._elementRefs?.[elementId];
    if (!node) return;
    const previousState =
      interactionSnapshot?.[elementId] || readNodeInteractionState(node);

    try {
      applyNodeInteractionState(node, nextState);
    } catch (error) {
      dwarn("[DRAG GRUPAL] follower interaction sync error", {
        elementId,
        nextState,
        previousState,
        error,
      });
    }
  });
}

function restoreFollowerInteractionState(
  followerIds = [],
  interactionSnapshot = null
) {
  followerIds.forEach((elementId) => {
    const node = window._elementRefs?.[elementId];
    const previousState = interactionSnapshot?.[elementId] || null;
    if (!node || !previousState) return;

    try {
      applyNodeInteractionState(node, previousState);
    } catch (error) {
      dwarn("[DRAG GRUPAL] follower interaction restore error", {
        elementId,
        previousState,
        error,
      });
    }
  });
}

function setLeaderInteractionState(leaderId, nextState = {}) {
  const node = leaderId ? window._elementRefs?.[leaderId] : null;
  if (!node) return;

  try {
    applyNodeInteractionState(node, nextState);
  } catch (error) {
    dwarn("[DRAG GRUPAL] leader interaction sync error", {
      leaderId,
      nextState,
      error,
    });
  }
}

function restoreLeaderInteractionState(leaderId, interactionSnapshot = null) {
  const node = leaderId ? window._elementRefs?.[leaderId] : null;
  if (!node || !interactionSnapshot) return;

  try {
    applyNodeInteractionState(node, interactionSnapshot);
  } catch (error) {
    dwarn("[DRAG GRUPAL] leader interaction restore error", {
      leaderId,
      interactionSnapshot,
      error,
    });
  }
}

function cancelGroupPreviewRaf() {
  if (!window._groupPreviewRaf) return;
  cancelAnimationFrame(window._groupPreviewRaf);
  window._groupPreviewRaf = null;
}

function syncSessionPreviewState(session, previewDelta, leaderPose) {
  if (!session?.active) return;

  session.lastPreviewDelta =
    Number.isFinite(previewDelta?.deltaX) && Number.isFinite(previewDelta?.deltaY)
      ? {
          deltaX: previewDelta.deltaX,
          deltaY: previewDelta.deltaY,
        }
      : null;
  session.lastLeaderPose =
    Number.isFinite(leaderPose?.rawX) && Number.isFinite(leaderPose?.rawY)
      ? {
          rawX: leaderPose.rawX,
          rawY: leaderPose.rawY,
          rotation: leaderPose.rotation ?? 0,
        }
      : session.lastLeaderPose || null;
  session.lastPreviewAt = getNowMs();
  syncLegacyGroupGlobalsFromSession(session);
}

function dispatchGroupDraggingStart(session, obj) {
  if (typeof window === "undefined") return;
  window._isDragging = true;
  try {
    document.body.style.cursor = "grabbing";
  } catch {}
  window.dispatchEvent(
    new CustomEvent("dragging-start", {
      detail: {
        id: obj?.id || null,
        tipo: obj?.tipo || null,
        group: true,
        sessionId: session?.sessionId || null,
        leaderId: session?.leaderId || null,
      },
    })
  );
}

function scheduleSkipIndividualEndCleanup(sessionId) {
  setTimeout(() => {
    if (window._skipIndividualEndSessionId !== sessionId) return;
    window._skipIndividualEnd = null;
    window._skipIndividualEndSessionId = null;
    window._skipUntil = 0;
  }, 450);
}

function getGrupoElementos() {
  const activeSession = getActiveGroupDragSession();
  if (Array.isArray(activeSession?.elementIds) && activeSession.elementIds.length > 0) {
    return activeSession.elementIds;
  }
  if (Array.isArray(window._grupoElementos) && window._grupoElementos.length > 0) {
    return window._grupoElementos;
  }
  return window._elementosSeleccionados || [];
}

function buildGroupPreviewSampleKey(leaderId) {
  return `drag-group-preview:${leaderId || "unknown"}`;
}

function buildSelectionSnapshot() {
  const activeSession = getAnyGroupDragSession();
  return {
    ...getCanvasSelectionDebugInfo(),
    dragStartPos: window._dragStartPos || null,
    groupSessionId: activeSession?.sessionId || null,
  };
}

export function isManualGroupDragMemberLocked(elementId) {
  if (!elementId) return false;
  const session = getAnyGroupDragSession();
  return Boolean(
    session?.active &&
    session?.engine === "manual-pointer" &&
    Array.isArray(session.elementIds) &&
    session.elementIds.includes(elementId)
  );
}

export function getManualGroupDragPreviewPose(elementId) {
  if (!elementId) return null;
  const session = getAnyGroupDragSession();
  if (
    !session?.active ||
    session.engine !== "manual-pointer" ||
    !Array.isArray(session.elementIds) ||
    !session.elementIds.includes(elementId)
  ) {
    return null;
  }

  const poseMap =
    session.phase === "active" || session.phase === "ending"
      ? resolveManualPreviewBasePose(session)
      : (session.memberInitialPose || session.dragInicial || null);
  const initialPose = poseMap?.[elementId] || null;
  if (!initialPose) return null;

  const deltaX = Number.isFinite(session?.lastPreviewDelta?.deltaX)
    ? session.lastPreviewDelta.deltaX
    : 0;
  const deltaY = Number.isFinite(session?.lastPreviewDelta?.deltaY)
    ? session.lastPreviewDelta.deltaY
    : 0;
  const phase = session.phase || "active";
  const signature = [
    session.sessionId || "group",
    phase,
    Math.round(deltaX * 100) / 100,
    Math.round(deltaY * 100) / 100,
  ].join(":");

  return {
    x: initialPose.x + deltaX,
    y: initialPose.y + deltaY,
    phase,
    signature,
  };
}

function resolveSessionMemberObject(elementId) {
  if (!elementId || typeof window === "undefined") return null;
  const objetos = Array.isArray(window._objetosActuales) ? window._objetosActuales : [];
  return objetos.find((item) => item.id === elementId) || null;
}

export function resolveSessionMemberNode(elementId) {
  if (!elementId || typeof window === "undefined") return null;
  return window._elementRefs?.[elementId] || null;
}

export function resolveSessionLeaderNode(session = null) {
  const activeSession = session?.active ? session : getAnyGroupDragSession();
  const leaderId = activeSession?.leaderId || null;
  return resolveSessionMemberNode(leaderId);
}

export function resolveSessionLeaderObject(session = null) {
  const activeSession = session?.active ? session : getAnyGroupDragSession();
  const leaderId = activeSession?.leaderId || null;
  return resolveSessionMemberObject(leaderId);
}

export function resolveGroupDragFollowerRestorePose(session, elementId) {
  const activeSession = session?.active ? session : getActiveGroupDragSession();
  if (!activeSession) return null;

  const poseMap =
    activeSession.engine === "manual-pointer"
      ? resolveManualPreviewBasePose(activeSession)
      : activeSession.dragInicial;
  const initialPose = poseMap?.[elementId];
  if (!initialPose) return null;

  const deltaX = Number.isFinite(activeSession?.lastPreviewDelta?.deltaX)
    ? activeSession.lastPreviewDelta.deltaX
    : 0;
  const deltaY = Number.isFinite(activeSession?.lastPreviewDelta?.deltaY)
    ? activeSession.lastPreviewDelta.deltaY
    : 0;

  return {
    x: initialPose.x + deltaX,
    y: initialPose.y + deltaY,
  };
}

function calcularDeltaGrupal(stage, { allowPointerFallback = true } = {}) {
  const session = getAnyGroupDragSession();
  if (!session) {
    return buildGroupDeltaResult({ reason: "no-active-session" });
  }

  if (session.engine === "manual-pointer") {
    const currentPos = hasFinitePoint(session.lastPointerStage)
      ? session.lastPointerStage
      : readStagePointer(resolveSessionStage(session, stage));
    const startPos = resolveManualMotionStartPointer(session);

    if (hasFinitePoint(currentPos) && hasFinitePoint(startPos)) {
      return buildGroupDeltaResult({
        deltaX: currentPos.x - startPos.x,
        deltaY: currentPos.y - startPos.y,
        source: "pointer",
      });
    }

    if (
      Number.isFinite(session?.lastPreviewDelta?.deltaX) &&
      Number.isFinite(session?.lastPreviewDelta?.deltaY)
    ) {
      return buildGroupDeltaResult({
        deltaX: session.lastPreviewDelta.deltaX,
        deltaY: session.lastPreviewDelta.deltaY,
        source: "last-preview",
      });
    }

    return buildGroupDeltaResult({
      reason: "manual-pointer-unavailable",
      pointerAvailable: hasFinitePoint(currentPos),
      startPointerAvailable: hasFinitePoint(startPos),
    });
  }

  const leaderId = session.leaderId;
  const posInicialLider = leaderId ? session.dragInicial?.[leaderId] : null;
  const leaderNode = resolveSessionLeaderNode(session);
  const leaderObject = resolveSessionLeaderObject(session);

  if (leaderNode && posInicialLider) {
    const leaderPose = resolveRawNodePose(leaderNode, leaderObject);
    if (Number.isFinite(leaderPose.rawX) && Number.isFinite(leaderPose.rawY)) {
      return buildGroupDeltaResult({
        deltaX: leaderPose.rawX - posInicialLider.x,
        deltaY: leaderPose.rawY - posInicialLider.y,
        source: "leader-node",
      });
    }
  }

  if (
    Number.isFinite(session?.lastPreviewDelta?.deltaX) &&
    Number.isFinite(session?.lastPreviewDelta?.deltaY)
  ) {
    return buildGroupDeltaResult({
      deltaX: session.lastPreviewDelta.deltaX,
      deltaY: session.lastPreviewDelta.deltaY,
      source: "last-preview",
    });
  }

  if (
    posInicialLider &&
    Number.isFinite(session?.lastLeaderPose?.rawX) &&
    Number.isFinite(session?.lastLeaderPose?.rawY)
  ) {
    return buildGroupDeltaResult({
      deltaX: session.lastLeaderPose.rawX - posInicialLider.x,
      deltaY: session.lastLeaderPose.rawY - posInicialLider.y,
      source: "last-leader-pose",
    });
  }

  const currentPos = readStagePointer(stage);
  const startPos = session.startPointer || null;
  if (allowPointerFallback && hasFinitePoint(currentPos) && hasFinitePoint(startPos)) {
    return buildGroupDeltaResult({
      deltaX: currentPos.x - startPos.x,
      deltaY: currentPos.y - startPos.y,
      source: "pointer",
    });
  }

  return buildGroupDeltaResult({
    reason: allowPointerFallback
      ? "no-valid-delta-source"
      : "pointer-fallback-disabled",
    pointerAvailable: hasFinitePoint(currentPos),
    startPointerAvailable: hasFinitePoint(startPos),
  });
}

function syncAttachedTextNodePosition(elementId, x, y) {
  const textNode = window._elementRefs?.[`${elementId}-text`];
  if (!textNode || typeof textNode.position !== "function") return;
  textNode.position({ x, y });
}

function applyPreviewDragGrupal(stage, leaderId, deltaX, deltaY, options = {}) {
  const session = getAnyGroupDragSession();
  if (!stage || !session?.dragInicial) return;
  const shouldScheduleBatchDraw = options?.scheduleBatchDraw !== false;
  const poseBaseMap =
    session.engine === "manual-pointer"
      ? resolveManualPreviewBasePose(session)
      : session.dragInicial;

  const last = session.lastPreviewDelta;
  if (
    last &&
    Math.abs(last.deltaX - deltaX) < 0.01 &&
    Math.abs(last.deltaY - deltaY) < 0.01
  ) {
    return;
  }

  const memberIds = session.engine === "manual-pointer"
    ? Array.isArray(session.elementIds)
      ? session.elementIds
      : []
    : (
        Array.isArray(session.followerIds)
          ? session.followerIds
          : getGrupoElementos().filter((id) => id !== leaderId)
      );

  memberIds.forEach((elementId) => {
    const node = window._elementRefs?.[elementId];
    const posInicial = poseBaseMap?.[elementId] || session.dragInicial[elementId];
    if (!node || !posInicial) return;
    const nextX = posInicial.x + deltaX;
    const nextY = posInicial.y + deltaY;
    node.position({ x: nextX, y: nextY });
    syncAttachedTextNodePosition(elementId, nextX, nextY);
  });

  if (!shouldScheduleBatchDraw) {
    return;
  }

  if (!window._groupPreviewRaf) {
    window._groupPreviewRaf = requestAnimationFrame(() => {
      window._groupPreviewRaf = null;
      stage.batchDraw();
    });
  }
}

function syncFinalPreviewToCommitDelta(session, stage, deltaData) {
  const previousPreviewDelta =
    Number.isFinite(session?.lastPreviewDelta?.deltaX) &&
    Number.isFinite(session?.lastPreviewDelta?.deltaY)
      ? {
          deltaX: session.lastPreviewDelta.deltaX,
          deltaY: session.lastPreviewDelta.deltaY,
        }
      : null;

  const alreadyMatched = doesDeltaMatchLastPreview(deltaData, previousPreviewDelta);
  if (!session?.active || !deltaData?.isValid || !stage || alreadyMatched) {
    return {
      finalDeltaMatchesLastPreview: alreadyMatched,
      previousPreviewDelta,
    };
  }

  const leaderBasePose =
    resolveManualPreviewBasePose(session)?.[session.leaderId] ||
    session.dragInicial?.[session.leaderId] ||
    null;
  applyPreviewDragGrupal(stage, session.leaderId, deltaData.deltaX, deltaData.deltaY, {
    scheduleBatchDraw: false,
  });
  syncSessionPreviewState(session, {
    deltaX: deltaData.deltaX,
    deltaY: deltaData.deltaY,
  }, {
    rawX: (leaderBasePose?.x || 0) + deltaData.deltaX,
    rawY: (leaderBasePose?.y || 0) + deltaData.deltaY,
    rotation: session.lastLeaderPose?.rotation ?? 0,
  });
  if (session.engine === "manual-pointer") {
    session.hasPreviewSinceActivation = true;
  }
  stage.batchDraw?.();

  logSelectedDragDebug("drag:group:final-preview-sync", {
    sessionId: session.sessionId,
    leaderId: session.leaderId,
    deltaSource: deltaData.source || null,
    previousPreviewDelta,
    finalDelta: {
      deltaX: deltaData.deltaX,
      deltaY: deltaData.deltaY,
    },
    selection: buildSelectionSnapshot(),
  });

  return {
    finalDeltaMatchesLastPreview: true,
    previousPreviewDelta,
  };
}

function commitGroupDragChanges(session, deltaData, fallbackObj, onChange) {
  const appliedChanges = [];
  if (!deltaData?.isValid || !session?.dragInicial || typeof onChange !== "function") {
    return appliedChanges;
  }

  const { deltaX, deltaY } = deltaData;
  const elementIds = Array.isArray(session.elementIds) ? session.elementIds : getGrupoElementos();
  const poseBaseMap =
    session.engine === "manual-pointer"
      ? resolveManualCommitBasePose(session)
      : session.dragInicial;

  elementIds.forEach((elementId) => {
    const objeto = resolveSessionMemberObject(elementId);
    if (!objeto) return;

    const posInicial = poseBaseMap?.[elementId] || session.dragInicial[elementId];
    if (!posInicial) return;

    const nuevaX = posInicial.x + deltaX;
    const nuevaY = posInicial.y + deltaY;
    const node = resolveSessionMemberNode(elementId);
    const { nuevaSeccion } = determinarNuevaSeccion(
      nuevaY,
      objeto.seccionId,
      window._seccionesOrdenadas || []
    );
    const canonicalPose = resolveCanonicalNodePose(node, objeto, {
      x: nuevaX,
      y: nuevaY,
      rotation:
        typeof node?.rotation === "function"
          ? node.rotation()
          : objeto.rotation || fallbackObj?.rotation || 0,
    });
    const committedX = Number.isFinite(canonicalPose?.x) ? canonicalPose.x : nuevaX;
    const committedY = Number.isFinite(canonicalPose?.y) ? canonicalPose.y : nuevaY;

    try {
      node?.setAttr?.("_muteNextEnd", true);
    } catch {}

    onChange(elementId, {
      x: committedX,
      y: committedY,
      ...(nuevaSeccion ? { seccionId: nuevaSeccion } : {}),
      finalizoDrag: true,
      causa: "drag-grupal",
    });

    appliedChanges.push({
      elementId,
      initialPosition: posInicial,
      nextPosition: {
        x: committedX,
        y: committedY,
      },
      nextSectionId: nuevaSeccion || null,
      node: getKonvaNodeDebugInfo(node),
    });
  });

  return appliedChanges;
}

function cleanupGroupDragSession(session, {
  hasDragged = null,
  setRecentGuard = true,
  resetHasDraggedDelayed = true,
} = {}) {
  if (!session) return;

  const completedSessionId = session.sessionId;
  window._skipUntil = getNowMs() + 400;
  if (setRecentGuard) {
    setRecentGroupDragGuard(session, 120);
  }
  restoreLeaderInteractionState(
    session.leaderId,
    session.leaderInteractionSnapshot
  );
  restoreFollowerInteractionState(
    session.followerIds,
    session.followerInteractionSnapshot
  );
  clearActiveGroupDragSession();
  try {
    document.body.style.cursor = "default";
  } catch {}
  scheduleSkipIndividualEndCleanup(completedSessionId);
  resetCanvasInteractionLogSample(buildGroupPreviewSampleKey(session.leaderId));
  if (resetHasDraggedDelayed) {
    setTimeout(() => {
      if (hasDragged?.current != null) hasDragged.current = false;
    }, 40);
  } else if (hasDragged?.current != null) {
    hasDragged.current = false;
  }
}

function buildManualGroupStartResult(mode, session) {
  return buildGroupDragResult({
    handled: true,
    role: "leader",
    mode,
    sessionId: session?.sessionId || null,
    leaderId: session?.leaderId || null,
    session,
  });
}

export function armManualGroupDragSession(e, obj) {
  const selectedIds = window._elementosSeleccionados || [];
  const existingSession = getAnyGroupDragSession();

  if (typeof window !== "undefined") {
    window._recentGroupDragGuard = null;
  }

  if (existingSession?.active) {
    const isLeader = obj?.id === existingSession.leaderId;
    const isFollower = Array.isArray(existingSession.elementIds)
      ? existingSession.elementIds.includes(obj?.id)
      : false;

    if (isLeader) {
      return buildManualGroupStartResult("duplicate-leader-ignored", existingSession);
    }

    return buildGroupDragResult({
      handled: true,
      role: isFollower ? "follower" : "none",
      mode: "follower-ignored",
      sessionId: existingSession.sessionId,
      leaderId: existingSession.leaderId,
      restorePose: resolveGroupDragFollowerRestorePose(existingSession, obj?.id),
      session: existingSession,
    });
  }

  if (!shouldStartGroupDrag(obj?.id, selectedIds)) {
    return buildGroupDragResult({
      handled: false,
      role: "none",
      mode: "not-eligible",
    });
  }

  const stage = e?.target?.getStage?.() || e?.currentTarget?.getStage?.() || null;
  const nativeEvent = e?.evt || null;
  const startPointerStage =
    resolveStagePointerFromNativeEvent(stage, nativeEvent) ||
    readStagePointer(stage);
  const startPointerClient = getNativeClientPoint(nativeEvent);
  const followerIds = selectedIds.filter((id) => id !== obj.id);
  const dragInicial = captureGroupDragInicial(selectedIds);
  const memberInitialPose = { ...dragInicial };
  const leaderNode = window._elementRefs?.[obj.id] || e?.currentTarget || e?.target || null;
  const leaderPose = resolveRawNodePose(leaderNode, obj);
  const session = setActiveGroupDragSession({
    sessionId: buildGroupDragSessionId(obj.id),
    engine: "manual-pointer",
    phase: "armed",
    leaderId: obj.id,
    elementIds: [...selectedIds],
    followerIds,
    leaderInteractionSnapshot: captureLeaderInteractionSnapshot(obj.id),
    followerInteractionSnapshot: captureFollowerInteractionSnapshot(followerIds),
    startedAt: getNowMs(),
    stage,
    dragInicial,
    memberInitialPose,
    previewBasePose: clonePoseMap(dragInicial),
    commitBasePose: clonePoseMap(dragInicial),
    startPointer: startPointerStage,
    startPointerStage,
    pointerDownStage: startPointerStage,
    activationPointerStage: null,
    startPointerClient,
    pointerId: resolveNativePointerId(nativeEvent),
    pointerType: resolveNativePointerType(nativeEvent),
    lastPointerStage: startPointerStage,
    lastPreviewDelta: null,
    hasPreviewSinceActivation: false,
    lastLeaderPose:
      Number.isFinite(leaderPose?.rawX) && Number.isFinite(leaderPose?.rawY)
        ? {
            rawX: leaderPose.rawX,
            rawY: leaderPose.rawY,
            rotation: leaderPose.rotation ?? 0,
          }
        : null,
    lastPreviewAt: null,
    cleanupListeners: null,
    active: true,
  });

  cancelGroupPreviewRaf();
  window._groupPreviewLastDelta = null;
  window._skipIndividualEnd = new Set(selectedIds);
  window._skipIndividualEndSessionId = session.sessionId;
  window._skipUntil = 0;
  resetCanvasInteractionLogSample(buildGroupPreviewSampleKey(obj.id));

  setLeaderInteractionState(session.leaderId, {
    draggable: false,
  });
  setFollowerInteractionState(
    followerIds,
    {
      draggable: false,
      listening: false,
    },
    session.followerInteractionSnapshot
  );

  logSelectedDragDebug("drag:group:arm", {
    sessionId: session.sessionId,
    engine: session.engine || null,
    leaderId: session.leaderId,
    followerIds: [...session.followerIds],
    elementId: obj?.id || null,
    tipo: obj?.tipo || null,
    figura: obj?.figura || null,
    pointerDownStageX: Number.isFinite(startPointerStage?.x) ? startPointerStage.x : null,
    pointerDownStageY: Number.isFinite(startPointerStage?.y) ? startPointerStage.y : null,
    pointer: getCanvasPointerDebugInfo(e),
    node: getKonvaNodeDebugInfo(e?.currentTarget || e?.target || null),
    selection: buildSelectionSnapshot(),
  });

  return buildManualGroupStartResult("armed", session);
}

export function activateManualGroupDragSession(session, nativeEvent = null, activationMeta = null) {
  if (!session?.active || session.engine !== "manual-pointer") {
    return buildGroupDragResult({
      handled: false,
      role: "none",
      mode: "not-manual-session",
      sessionId: session?.sessionId || null,
      leaderId: session?.leaderId || null,
      session,
    });
  }

  if (session.phase === "active") {
    return buildManualGroupStartResult("already-active", session);
  }

  session.phase = "active";
  const stage = resolveSessionStage(session);
  if (nativeEvent) {
    session.lastPointerStage =
      resolveStagePointerFromNativeEvent(stage, nativeEvent) ||
      session.lastPointerStage ||
      null;
  }
  const activationPointerStage =
    activationMeta?.activationPointerStage ||
    session.lastPointerStage ||
    session.pointerDownStage ||
    session.startPointerStage ||
    session.startPointer ||
    null;
  const previewBasePose =
    clonePoseMap(activationMeta?.previewBasePose) ||
    captureSessionPoseMap(session) ||
    clonePoseMap(session.dragInicial) ||
    {};
  session.activationPointerStage = hasFinitePoint(activationPointerStage)
    ? activationPointerStage
    : session.activationPointerStage || null;
  session.previewBasePose = previewBasePose;
  session.commitBasePose = clonePoseMap(activationMeta?.commitBasePose) || clonePoseMap(previewBasePose);
  session.lastPreviewDelta = { deltaX: 0, deltaY: 0 };
  session.hasPreviewSinceActivation = false;
  session.activationMetrics = activationMeta
    ? {
        thresholdPx: Number.isFinite(activationMeta.thresholdPx)
          ? activationMeta.thresholdPx
          : getPointerMoveThreshold(session.pointerType),
        activationDistance: Number.isFinite(activationMeta.activationDistance)
          ? activationMeta.activationDistance
          : null,
        activationDeltaX: Number.isFinite(activationMeta.activationDeltaX)
          ? activationMeta.activationDeltaX
          : null,
        activationDeltaY: Number.isFinite(activationMeta.activationDeltaY)
          ? activationMeta.activationDeltaY
          : null,
      }
    : session.activationMetrics || {
        thresholdPx: getPointerMoveThreshold(session.pointerType),
        activationDistance: null,
        activationDeltaX: null,
        activationDeltaY: null,
      };
  syncLegacyGroupGlobalsFromSession(session);
  dispatchGroupDraggingStart(
    session,
    resolveSessionLeaderObject(session)
  );

  logSelectedDragDebug("drag:group:start", {
    sessionId: session.sessionId,
    engine: session.engine || null,
    leaderId: session.leaderId,
    followerIds: [...(session.followerIds || [])],
    elementId: session.leaderId || null,
    thresholdPx: session.activationMetrics?.thresholdPx ?? null,
    activationDistance: session.activationMetrics?.activationDistance ?? null,
    activationDeltaX: session.activationMetrics?.activationDeltaX ?? null,
    activationDeltaY: session.activationMetrics?.activationDeltaY ?? null,
    activationPointerStageX: Number.isFinite(session.activationPointerStage?.x)
      ? session.activationPointerStage.x
      : null,
    activationPointerStageY: Number.isFinite(session.activationPointerStage?.y)
      ? session.activationPointerStage.y
      : null,
    visualDeltaSeedX: 0,
    visualDeltaSeedY: 0,
    pointer: buildNativePointerDebugInfo(stage, nativeEvent),
    node: getKonvaNodeDebugInfo(resolveSessionLeaderNode(session)),
    selection: buildSelectionSnapshot(),
  });

  return buildManualGroupStartResult("activated", session);
}

export function updateManualGroupDragSession(nativeEvent) {
  const session = getAnyGroupDragSession();
  if (!session?.active || session.engine !== "manual-pointer") {
    return buildGroupDragResult({
      handled: false,
      role: "none",
      mode: "no-manual-session",
    });
  }

  const expectedPointerId = Number.isFinite(session.pointerId) ? session.pointerId : null;
  const incomingPointerId = resolveNativePointerId(nativeEvent);
  if (
    expectedPointerId !== null &&
    incomingPointerId !== null &&
    incomingPointerId !== expectedPointerId
  ) {
    return buildGroupDragResult({
      handled: false,
      role: "leader",
      mode: "pointer-mismatch",
      sessionId: session.sessionId,
      leaderId: session.leaderId,
      session,
    });
  }

  const stage = resolveSessionStage(session);
  const pointerStage = resolveStagePointerFromNativeEvent(stage, nativeEvent);
  if (!pointerStage) {
    return buildGroupDragResult({
      handled: false,
      role: "leader",
      mode: "missing-pointer",
      sessionId: session.sessionId,
      leaderId: session.leaderId,
      session,
    });
  }

  session.lastPointerStage = pointerStage;
  const pointerDownStage = session.pointerDownStage || session.startPointerStage || session.startPointer || null;
  if (!hasFinitePoint(pointerDownStage)) {
    return buildGroupDragResult({
      handled: false,
      role: "leader",
      mode: "missing-start-pointer",
      sessionId: session.sessionId,
      leaderId: session.leaderId,
      session,
    });
  }

  const pointerDownDeltaX = pointerStage.x - pointerDownStage.x;
  const pointerDownDeltaY = pointerStage.y - pointerDownStage.y;
  const threshold = getPointerMoveThreshold(session.pointerType);

  if (session.phase === "armed") {
    const distance = Math.hypot(pointerDownDeltaX, pointerDownDeltaY);
    if (distance < threshold) {
      return buildGroupDragResult({
        handled: true,
        role: "leader",
        mode: "armed-waiting-threshold",
        sessionId: session.sessionId,
        leaderId: session.leaderId,
        session,
      });
    }

    const activationBasePose = captureSessionPoseMap(session);
    activateManualGroupDragSession(session, nativeEvent, {
      thresholdPx: threshold,
      activationDistance: distance,
      activationDeltaX: pointerDownDeltaX,
      activationDeltaY: pointerDownDeltaY,
      activationPointerStage: pointerStage,
      previewBasePose: activationBasePose,
      commitBasePose: activationBasePose,
    });
    return buildGroupDragResult({
      handled: true,
      role: "leader",
      mode: "activated",
      sessionId: session.sessionId,
      leaderId: session.leaderId,
      session,
      activatedNow: true,
    });
  }

  const motionStartPointer = resolveManualMotionStartPointer(session);
  if (!hasFinitePoint(motionStartPointer)) {
    return buildGroupDragResult({
      handled: false,
      role: "leader",
      mode: "missing-activation-pointer",
      sessionId: session.sessionId,
      leaderId: session.leaderId,
      session,
    });
  }

  const deltaX = pointerStage.x - motionStartPointer.x;
  const deltaY = pointerStage.y - motionStartPointer.y;
  applyPreviewDragGrupal(stage, session.leaderId, deltaX, deltaY);
  const leaderPreviewBase =
    resolveManualPreviewBasePose(session)?.[session.leaderId] ||
    session.dragInicial?.[session.leaderId] ||
    null;
  syncSessionPreviewState(session, { deltaX, deltaY }, {
    rawX: (leaderPreviewBase?.x || 0) + deltaX,
    rawY: (leaderPreviewBase?.y || 0) + deltaY,
    rotation: session.lastLeaderPose?.rotation ?? 0,
  });
  session.hasPreviewSinceActivation = true;

  const sample = sampleCanvasInteractionLog(buildGroupPreviewSampleKey(session.leaderId), {
    firstCount: 3,
    throttleMs: 120,
  });
  if (sample.shouldLog) {
    logSelectedDragDebug("drag:group:preview", {
      sessionId: session.sessionId,
      leaderId: session.leaderId,
      elementId: session.leaderId || null,
      previewCount: sample.sampleCount,
      deltaX,
      deltaY,
      deltaSource: "pointer",
      motionBase: "activation-pointer",
      pointer: buildNativePointerDebugInfo(stage, nativeEvent),
      node: getKonvaNodeDebugInfo(resolveSessionLeaderNode(session)),
      selection: buildSelectionSnapshot(),
    });
  }

  return buildGroupDragResult({
    handled: true,
    role: "leader",
    mode: "preview",
    sessionId: session.sessionId,
    leaderId: session.leaderId,
    session,
    activatedNow: false,
  });
}

export function finishManualGroupDragSession(
  nativeEvent,
  { reason = "pointerup", obj = null, onChange = null, hasDragged = null } = {}
) {
  const session = getAnyGroupDragSession();
  if (!session?.active || session.engine !== "manual-pointer") {
    return buildGroupDragResult({
      handled: false,
      role: "none",
      mode: "no-manual-session",
    });
  }

  session.phase = "ending";
  const stage = resolveSessionStage(session);
  const resolvedPointer =
    resolveStagePointerFromNativeEvent(stage, nativeEvent) ||
    session.lastPointerStage ||
    null;
  if (hasFinitePoint(resolvedPointer)) {
    session.lastPointerStage = resolvedPointer;
  }

  const activated = session.phase === "ending" && Boolean(window._isDragging);
  const deltaData = activated
    ? calcularDeltaGrupal(stage, { allowPointerFallback: true })
    : buildGroupDeltaResult({ reason: "never-activated" });

  cancelGroupPreviewRaf();
  const previewSync = window._isDragging && deltaData?.isValid
    ? syncFinalPreviewToCommitDelta(session, stage, deltaData)
    : {
        finalDeltaMatchesLastPreview: doesDeltaMatchLastPreview(
          deltaData,
          session?.lastPreviewDelta
        ),
        previousPreviewDelta:
          Number.isFinite(session?.lastPreviewDelta?.deltaX) &&
          Number.isFinite(session?.lastPreviewDelta?.deltaY)
            ? {
                deltaX: session.lastPreviewDelta.deltaX,
                deltaY: session.lastPreviewDelta.deltaY,
              }
            : null,
      };
  let appliedChanges = [];
  const leaderNode = resolveSessionLeaderNode(session);
  const leaderObject = resolveSessionLeaderObject(session) || obj || null;
  const finalPreviewDelta =
    Number.isFinite(session?.lastPreviewDelta?.deltaX) &&
    Number.isFinite(session?.lastPreviewDelta?.deltaY)
      ? {
          deltaX: session.lastPreviewDelta.deltaX,
          deltaY: session.lastPreviewDelta.deltaY,
        }
      : null;

  if (window._isDragging && deltaData?.isValid) {
    appliedChanges = commitGroupDragChanges(session, deltaData, obj, onChange);
    logSelectedDragDebug("drag:group:end", {
      sessionId: session.sessionId,
      engine: session.engine || null,
      leaderId: session.leaderId,
      elementId: session.leaderId || null,
      deltaX: deltaData.deltaX,
      deltaY: deltaData.deltaY,
      deltaSource: deltaData.source || null,
      reason,
      lastPreviewDeltaX: finalPreviewDelta?.deltaX ?? null,
      lastPreviewDeltaY: finalPreviewDelta?.deltaY ?? null,
      finalDeltaMatchesLastPreview: Boolean(previewSync.finalDeltaMatchesLastPreview),
      commitBase: "activation-pointer",
      hadPreviewSinceActivation: Boolean(session.hasPreviewSinceActivation),
      appliedCount: appliedChanges.length,
      appliedChanges,
      pointer: buildNativePointerDebugInfo(stage, nativeEvent),
      node: getKonvaNodeDebugInfo(leaderNode),
      leaderResolvedById: Boolean(leaderNode),
      leaderObjectResolvedById: Boolean(leaderObject),
      selection: buildSelectionSnapshot(),
    });
  } else if (window._isDragging) {
    logSelectedDragDebug("drag:group:end-no-delta", {
      sessionId: session.sessionId,
      engine: session.engine || null,
      leaderId: session.leaderId,
      elementId: session.leaderId || null,
      reason: deltaData?.reason || "missing-delta",
      pointer: buildNativePointerDebugInfo(stage, nativeEvent),
      node: getKonvaNodeDebugInfo(leaderNode),
      leaderResolvedById: Boolean(leaderNode),
      leaderObjectResolvedById: Boolean(leaderObject),
      selection: buildSelectionSnapshot(),
    });
  } else {
    logSelectedDragDebug("drag:group:cancel", {
      sessionId: session.sessionId,
      engine: session.engine || null,
      leaderId: session.leaderId,
      elementId: session.leaderId || null,
      reason,
      pointer: buildNativePointerDebugInfo(stage, nativeEvent),
      node: getKonvaNodeDebugInfo(leaderNode),
      leaderResolvedById: Boolean(leaderNode),
      leaderObjectResolvedById: Boolean(leaderObject),
      selection: buildSelectionSnapshot(),
    });
  }

  const completed = Boolean(window._isDragging);
  window._isDragging = false;
  cleanupGroupDragSession(session, {
    hasDragged,
    setRecentGuard: completed,
    resetHasDraggedDelayed: completed,
  });

  return buildGroupDragResult({
    handled: true,
    role: "leader",
    mode: completed
      ? (deltaData?.isValid ? "completed" : "completed-no-delta")
      : "cancelled",
    sessionId: session.sessionId,
    leaderId: session.leaderId,
    shouldDispatchDraggingEnd: completed,
    shouldRunPersonalizedEnd: completed,
    completed,
    deltaSource: completed && deltaData?.isValid ? deltaData.source || null : null,
    session,
  });
}

export function cancelManualGroupDragSession(reason = "cancelled", nativeEvent = null) {
  return finishManualGroupDragSession(nativeEvent, {
    reason,
    obj: window._objetosActuales?.find((item) => item.id === getAnyGroupDragSession()?.leaderId) || null,
    onChange: null,
    hasDragged: null,
  });
}

export function startDragGrupalLider(e, obj) {
  const selectedIds = window._elementosSeleccionados || [];
  const activeSession = getAnyGroupDragSession();

  if (typeof window !== "undefined") {
    window._recentGroupDragGuard = null;
  }

  if (activeSession) {
    const isLeader = obj?.id === activeSession.leaderId;
    const isFollower = Array.isArray(activeSession.elementIds)
      ? activeSession.elementIds.includes(obj?.id)
      : false;

    if (isLeader) {
      logSelectedDragDebug("drag:group:duplicate-leader-start-ignored", {
        sessionId: activeSession.sessionId,
        leaderId: activeSession.leaderId,
        elementId: obj?.id || null,
        pointer: getCanvasPointerDebugInfo(e),
        node: getKonvaNodeDebugInfo(e?.currentTarget || e?.target || null),
        selection: buildSelectionSnapshot(),
      });
      return buildGroupDragResult({
        handled: true,
        role: "leader",
        mode: "duplicate-leader-ignored",
        sessionId: activeSession.sessionId,
        leaderId: activeSession.leaderId,
        session: activeSession,
      });
    }

    const restorePose = resolveGroupDragFollowerRestorePose(activeSession, obj?.id);
    logSelectedDragDebug("drag:group:follower-start-ignored", {
      sessionId: activeSession.sessionId,
      leaderId: activeSession.leaderId,
      elementId: obj?.id || null,
      isSessionFollower: isFollower,
      restorePose,
      pointer: getCanvasPointerDebugInfo(e),
      node: getKonvaNodeDebugInfo(e?.currentTarget || e?.target || null),
      selection: buildSelectionSnapshot(),
    });
    return buildGroupDragResult({
      handled: true,
      role: isFollower ? "follower" : "none",
      mode: "follower-ignored",
      sessionId: activeSession.sessionId,
      leaderId: activeSession.leaderId,
      restorePose,
      session: activeSession,
    });
  }

  if (!shouldStartGroupDrag(obj?.id, selectedIds)) {
    return buildGroupDragResult({
      handled: false,
      role: "none",
      mode: "not-eligible",
    });
  }

  const stage = e?.target?.getStage?.() || e?.currentTarget?.getStage?.() || null;
  const followerIds = selectedIds.filter((id) => id !== obj.id);
  const dragInicial = captureGroupDragInicial(selectedIds);
  const leaderNode = window._elementRefs?.[obj.id] || e?.currentTarget || e?.target || null;
  const leaderPose = resolveRawNodePose(leaderNode, obj);
  const session = setActiveGroupDragSession({
    sessionId: buildGroupDragSessionId(obj.id),
    engine: "konva-native",
    phase: "active",
    leaderId: obj.id,
    elementIds: [...selectedIds],
    followerIds,
    leaderInteractionSnapshot: captureLeaderInteractionSnapshot(obj.id),
    followerInteractionSnapshot: captureFollowerInteractionSnapshot(followerIds),
    startedAt: getNowMs(),
    stage,
    dragInicial,
    memberInitialPose: { ...dragInicial },
    startPointer: readStagePointer(stage),
    startPointerStage: readStagePointer(stage),
    startPointerClient: getNativeClientPoint(e?.evt || null),
    pointerId: resolveNativePointerId(e?.evt || null),
    pointerType: resolveNativePointerType(e?.evt || null),
    lastPointerStage: readStagePointer(stage),
    lastPreviewDelta: null,
    lastLeaderPose:
      Number.isFinite(leaderPose?.rawX) && Number.isFinite(leaderPose?.rawY)
        ? {
            rawX: leaderPose.rawX,
            rawY: leaderPose.rawY,
            rotation: leaderPose.rotation ?? 0,
          }
        : null,
    lastPreviewAt: null,
    active: true,
  });

  cancelGroupPreviewRaf();
  window._groupPreviewLastDelta = null;
  window._skipIndividualEnd = new Set(selectedIds);
  window._skipIndividualEndSessionId = session.sessionId;
  window._skipUntil = 0;
  resetCanvasInteractionLogSample(buildGroupPreviewSampleKey(obj.id));

  const hasLines = selectedIds.some((id) => {
    const selectedObject = window._objetosActuales?.find((item) => item.id === id);
    return selectedObject?.tipo === "forma" && selectedObject?.figura === "line";
  });

  if (hasLines) {
    selectedIds.forEach((id) => {
      const selectedObject = window._objetosActuales?.find((item) => item.id === id);
      if (selectedObject?.tipo !== "forma" || selectedObject?.figura !== "line") return;
      const node = window._elementRefs?.[id];
      if (!node || typeof node.draggable !== "function") return;
      try {
        node.draggable(true);
      } catch {}
    });
  }

  setFollowerInteractionState(
    followerIds,
    {
      draggable: false,
      listening: false,
    },
    session.followerInteractionSnapshot
  );
  dispatchGroupDraggingStart(session, obj);
  dlog("[DRAG GRUPAL] session start", {
    sessionId: session.sessionId,
    leaderId: session.leaderId,
    followerIds: session.followerIds,
  });

  logSelectedDragDebug("drag:group:start", {
    sessionId: session.sessionId,
    engine: session.engine || null,
    leaderId: session.leaderId,
    followerIds: [...session.followerIds],
    elementId: obj?.id || null,
    tipo: obj?.tipo || null,
    figura: obj?.figura || null,
    pointer: getCanvasPointerDebugInfo(e),
    node: getKonvaNodeDebugInfo(e?.currentTarget || e?.target || null),
    selection: buildSelectionSnapshot(),
  });

  return buildGroupDragResult({
    handled: true,
    role: "leader",
    mode: "started",
    sessionId: session.sessionId,
    leaderId: session.leaderId,
    session,
  });
}

export function previewDragGrupal(e, obj, onChange) {
  const session = getActiveGroupDragSession();
  if (!session || obj?.id !== session.leaderId) return;
  if (session.engine === "manual-pointer") return;

  const stage = e?.target?.getStage?.();
  if (!stage || !session.dragInicial) return;

  const deltaData = calcularDeltaGrupal(stage);
  if (!deltaData?.isValid) return;

  const leaderNode = window._elementRefs?.[session.leaderId] || e?.currentTarget || e?.target || null;
  const leaderObject =
    window._objetosActuales?.find((item) => item.id === session.leaderId) || obj || null;
  const leaderPose = resolveRawNodePose(leaderNode, leaderObject);

  const { deltaX, deltaY, source } = deltaData;
  const sample = sampleCanvasInteractionLog(buildGroupPreviewSampleKey(obj?.id), {
    firstCount: 3,
    throttleMs: 120,
  });
  if (sample.shouldLog) {
    logSelectedDragDebug("drag:group:preview", {
      sessionId: session.sessionId,
      leaderId: session.leaderId,
      elementId: obj?.id || null,
      previewCount: sample.sampleCount,
      deltaX,
      deltaY,
      deltaSource: source || null,
      pointer: getCanvasPointerDebugInfo(e),
      node: getKonvaNodeDebugInfo(e?.currentTarget || e?.target || null),
      selection: buildSelectionSnapshot(),
    });
  }

  applyPreviewDragGrupal(stage, obj.id, deltaX, deltaY);
  syncSessionPreviewState(session, deltaData, leaderPose);
}

export function endDragGrupal(e, obj, onChange, hasDragged) {
  const session = getActiveGroupDragSession();
  if (!session) {
    return buildGroupDragResult({
      handled: false,
      role: "none",
      mode: "no-active-session",
    });
  }
  if (session.engine === "manual-pointer") {
    return buildGroupDragResult({
      handled: true,
      role: obj?.id === session.leaderId ? "leader" : "follower",
      mode: "manual-session-native-end-ignored",
      sessionId: session.sessionId,
      leaderId: session.leaderId,
      shouldDispatchDraggingEnd: false,
      shouldRunPersonalizedEnd: false,
      completed: false,
      session,
    });
  }

  if (obj?.id !== session.leaderId) {
    const isFollower = Array.isArray(session.elementIds)
      ? session.elementIds.includes(obj?.id)
      : false;
    if (!isFollower) {
      return buildGroupDragResult({
        handled: false,
        role: "none",
        mode: "session-other-element",
        sessionId: session.sessionId,
        leaderId: session.leaderId,
        session,
      });
    }

    logSelectedDragDebug("drag:group:follower-end-ignored", {
      sessionId: session.sessionId,
      leaderId: session.leaderId,
      elementId: obj?.id || null,
      node: getKonvaNodeDebugInfo(e?.currentTarget || e?.target || null),
      selection: buildSelectionSnapshot(),
    });
    return buildGroupDragResult({
      handled: true,
      role: "follower",
      mode: "follower-end-ignored",
      sessionId: session.sessionId,
      leaderId: session.leaderId,
      shouldDispatchDraggingEnd: false,
      shouldRunPersonalizedEnd: false,
      completed: false,
      session,
    });
  }

  const stage = e?.target?.getStage?.() || e?.currentTarget?.getStage?.() || null;
  const deltaData = session.dragInicial ? calcularDeltaGrupal(stage) : null;
  let appliedChanges = [];

  cancelGroupPreviewRaf();
  syncSessionPreviewState(session, null, session.lastLeaderPose || null);

  if (deltaData?.isValid && session.dragInicial) {
    const { source } = deltaData;
    appliedChanges = commitGroupDragChanges(session, deltaData, obj, onChange);

    logSelectedDragDebug("drag:group:end", {
      sessionId: session.sessionId,
      engine: session.engine || null,
      leaderId: session.leaderId,
      elementId: obj?.id || null,
      deltaX: deltaData.deltaX,
      deltaY: deltaData.deltaY,
      deltaSource: source || null,
      appliedCount: appliedChanges.length,
      appliedChanges,
      pointer: getCanvasPointerDebugInfo(e),
      node: getKonvaNodeDebugInfo(e?.currentTarget || e?.target || null),
      selection: buildSelectionSnapshot(),
    });
  } else {
    logSelectedDragDebug("drag:group:end-no-delta", {
      sessionId: session.sessionId,
      engine: session.engine || null,
      leaderId: session.leaderId,
      elementId: obj?.id || null,
      reason: deltaData?.reason || "missing-delta",
      pointer: getCanvasPointerDebugInfo(e),
      node: getKonvaNodeDebugInfo(e?.currentTarget || e?.target || null),
      selection: buildSelectionSnapshot(),
    });
  }

  cleanupGroupDragSession(session, {
    hasDragged,
    setRecentGuard: true,
    resetHasDraggedDelayed: true,
  });

  dlog("[DRAG GRUPAL] session end", {
    sessionId: session.sessionId,
    leaderId: session.leaderId,
    deltaSource: deltaData?.isValid ? deltaData.source || null : null,
    appliedCount: appliedChanges.length,
  });

  return buildGroupDragResult({
    handled: true,
    role: "leader",
    mode: deltaData?.isValid ? "completed" : "completed-no-delta",
    sessionId: session.sessionId,
    leaderId: session.leaderId,
    shouldDispatchDraggingEnd: true,
    shouldRunPersonalizedEnd: true,
    completed: true,
    deltaSource: deltaData?.isValid ? deltaData.source || null : null,
    session,
  });
}
