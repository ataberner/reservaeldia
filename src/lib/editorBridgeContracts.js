function normalizeText(value) {
  return String(value || "").trim();
}

function asObject(value) {
  return value && typeof value === "object" ? value : null;
}

function cloneGalleryCell(cell) {
  const safeCell = asObject(cell);
  return safeCell ? { ...safeCell } : null;
}

export const CANVAS_EDITOR_COMPATIBILITY_KEYS = Object.freeze([
  "deshacer",
  "rehacer",
  "ensureInlineEditSettledBeforeCriticalAction",
  "flushPersistenceNow",
  "getTemplateAuthoringStatus",
  "getTemplateAuthoringSnapshot",
  "repairTemplateAuthoringState",
  "stageRef",
  "seccionActivaId",
  "tipoInvitacion",
  "snapshot",
]);

export const LEGACY_RENDER_STATE_GLOBAL_KEYS = Object.freeze([
  "_objetosActuales",
  "_seccionesOrdenadas",
  "_rsvpConfigActual",
  "_giftConfigActual",
  "_giftsConfigActual",
]);

export const LEGACY_EDITOR_SESSION_GLOBAL_KEYS = Object.freeze([
  "_draftTipoInvitacion",
  "_tipoInvitacionActual",
  "_seccionActivaId",
  "_lastSeccionActivaId",
]);

export const LEGACY_EDITOR_SELECTION_GLOBAL_KEYS = Object.freeze([
  "_elementosSeleccionados",
  "_celdaGaleriaActiva",
]);

export const LEGACY_EDITOR_INTERACTION_GLOBAL_KEYS = Object.freeze([
  "_elementRefs",
  "setHoverIdGlobal",
  "_isDragging",
  "_resizeData",
]);

export const LEGACY_EDITOR_GROUP_DRAG_GLOBAL_KEYS = Object.freeze([
  "_groupDragSession",
  "_grupoLider",
  "_grupoElementos",
  "_grupoSeguidores",
  "_dragStartPos",
  "_dragInicial",
  "_groupPreviewLastDelta",
]);

export const EDITOR_RUNTIME_BRIDGE_FUNCTION_KEYS = Object.freeze([
  "asignarImagenACelda",
  "__getSeccionInfo",
  "__getObjById",
]);

export const EDITOR_RUNTIME_COMPATIBILITY_CONTRACT = Object.freeze({
  canvasEditor: CANVAS_EDITOR_COMPATIBILITY_KEYS,
  legacyRenderStateGlobals: LEGACY_RENDER_STATE_GLOBAL_KEYS,
  legacySessionGlobals: LEGACY_EDITOR_SESSION_GLOBAL_KEYS,
  legacySelectionGlobals: LEGACY_EDITOR_SELECTION_GLOBAL_KEYS,
  legacyInteractionGlobals: LEGACY_EDITOR_INTERACTION_GLOBAL_KEYS,
  legacyGroupDragGlobals: LEGACY_EDITOR_GROUP_DRAG_GLOBAL_KEYS,
  bridgeFunctions: EDITOR_RUNTIME_BRIDGE_FUNCTION_KEYS,
});

export const EDITOR_BRIDGE_EVENTS = Object.freeze({
  INSERT_ELEMENT: "insertar-elemento",
  UPDATE_ELEMENT: "actualizar-elemento",
  ADD_TEXT_BOX: "agregar-cuadro-texto",
  CREATE_SECTION: "crear-seccion",
  APPLY_MOTION_EFFECTS: "aplicar-estilo-efectos",
  MOTION_EFFECTS_APPLIED: "motion-effects-applied",
  SELECTION_CHANGE: "editor-selection-change",
  GALLERY_CELL_CHANGE: "editor-gallery-cell-change",
  ACTIVE_SECTION_CHANGE: "seccion-activa",
  INVITATION_TYPE_CHANGE: "editor-tipo-invitacion",
  ELEMENT_REF_REGISTERED: "element-ref-registrado",
  DRAGGING_START: "dragging-start",
  DRAGGING_END: "dragging-end",
  RSVP_PANEL_OPEN: "abrir-panel-rsvp",
  RSVP_CONFIG_UPDATE: "rsvp-config-update",
  RSVP_CONFIG_CHANGED: "rsvp-config-changed",
  GIFT_PANEL_OPEN: "abrir-panel-regalos",
  GIFT_CONFIG_UPDATE: "gift-config-update",
  GIFT_CONFIG_CHANGED: "gift-config-changed",
  ENTER_BACKGROUND_MOVE_MODE: "activar-modo-mover-fondo",
  EXIT_BACKGROUND_MOVE_MODE: "salir-modo-mover-fondo",
  DRAFT_FLUSH_REQUEST: "editor:draft-flush:request",
  DRAFT_FLUSH_RESULT: "editor:draft-flush:result",
});

export function buildEditorSelectionChangeDetail({
  ids,
  activeSectionId = null,
  galleryCell = null,
} = {}) {
  return {
    ids: Array.isArray(ids) ? [...ids] : [],
    activeSectionId: normalizeText(activeSectionId) || null,
    galleryCell: cloneGalleryCell(galleryCell),
  };
}

export function buildEditorGalleryCellChangeDetail(cell = null) {
  return {
    cell: cloneGalleryCell(cell),
  };
}

export function buildEditorActiveSectionDetail(id = null) {
  return {
    id: normalizeText(id) || null,
  };
}

export function buildEditorInvitationTypeDetail(tipoInvitacion = null) {
  return {
    tipoInvitacion: normalizeText(tipoInvitacion) || null,
  };
}

export function buildEditorDragLifecycleDetail({
  id = null,
  tipo = null,
  group = false,
  sessionId = null,
  leaderId = null,
  engine = null,
} = {}) {
  const detail = {
    id: normalizeText(id) || null,
    tipo: normalizeText(tipo) || null,
  };

  if (group === true || sessionId != null || leaderId != null || engine != null) {
    detail.group = group === true;
    detail.sessionId = normalizeText(sessionId) || null;
    detail.leaderId = normalizeText(leaderId) || null;
  }

  if (engine != null) {
    detail.engine = normalizeText(engine) || null;
  }

  return detail;
}

export function normalizeEditorDraftFlushRequestDetail(detail) {
  const safeDetail = asObject(detail) || {};
  const requestId = normalizeText(safeDetail.requestId);
  const slug = normalizeText(safeDetail.slug);
  const reason = normalizeText(safeDetail.reason) || "manual-flush";

  return {
    requestId,
    slug,
    reason,
  };
}

export function normalizeEditorDraftFlushResultDetail(detail) {
  const safeDetail = asObject(detail) || {};
  const requestId = normalizeText(safeDetail.requestId);
  const slug = normalizeText(safeDetail.slug);
  const ok = safeDetail.ok === true;
  const reason = normalizeText(safeDetail.reason);
  const error = normalizeText(safeDetail.error);

  return {
    requestId,
    slug,
    ok,
    reason,
    error,
  };
}

export function buildEditorDraftFlushResultDetail({
  requestId,
  slug,
  result,
} = {}) {
  const normalizedRequest = normalizeEditorDraftFlushRequestDetail({
    requestId,
    slug,
  });
  const safeResult = asObject(result) || {};
  const ok = safeResult.ok === true;

  return {
    requestId: normalizedRequest.requestId,
    slug: normalizedRequest.slug,
    ok,
    reason: normalizeText(safeResult.reason),
    error: ok
      ? ""
      : normalizeText(safeResult.error) || "No se pudo guardar el borrador.",
  };
}

export function projectLegacyGroupDragGlobals(
  session,
  { resolveManualStartPointer = null } = {}
) {
  const activeSession = session?.active ? session : null;
  const shouldExposeLegacyGlobals = Boolean(
    activeSession &&
      (
        activeSession.engine !== "manual-pointer" ||
        activeSession.phase === "active" ||
        activeSession.phase === "ending"
      )
  );
  const manualStartPointer =
    activeSession?.engine === "manual-pointer" &&
    typeof resolveManualStartPointer === "function"
      ? resolveManualStartPointer(activeSession)
      : null;
  const legacyDragStartPos =
    activeSession?.engine === "manual-pointer"
      ? (
          activeSession.phase === "active" || activeSession.phase === "ending"
            ? manualStartPointer
            : activeSession.pointerDownStage ||
              activeSession.startPointerStage ||
              activeSession.startPointer ||
              null
        )
      : activeSession?.startPointer || activeSession?.startPointerStage || null;

  return {
    _groupDragSession: session || null,
    _grupoLider: shouldExposeLegacyGlobals ? activeSession?.leaderId || null : null,
    _grupoElementos: shouldExposeLegacyGlobals ? activeSession?.elementIds || null : null,
    _grupoSeguidores: shouldExposeLegacyGlobals ? activeSession?.followerIds || null : null,
    _dragStartPos: shouldExposeLegacyGlobals ? legacyDragStartPos : null,
    _dragInicial: shouldExposeLegacyGlobals ? activeSession?.dragInicial || null : null,
    _groupPreviewLastDelta:
      shouldExposeLegacyGlobals &&
      Number.isFinite(activeSession?.lastPreviewDelta?.deltaX) &&
      Number.isFinite(activeSession?.lastPreviewDelta?.deltaY)
        ? {
            deltaX: activeSession.lastPreviewDelta.deltaX,
            deltaY: activeSession.lastPreviewDelta.deltaY,
          }
        : null,
  };
}
