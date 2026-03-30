import test from "node:test";
import assert from "node:assert/strict";

import {
  EDITOR_BRIDGE_EVENTS,
  EDITOR_RUNTIME_COMPATIBILITY_CONTRACT,
  buildEditorActiveSectionDetail,
  buildEditorDraftFlushResultDetail,
  buildEditorDragLifecycleDetail,
  buildEditorGalleryCellChangeDetail,
  buildEditorInvitationTypeDetail,
  buildEditorSelectionChangeDetail,
  normalizeEditorDraftFlushRequestDetail,
  normalizeEditorDraftFlushResultDetail,
  projectLegacyGroupDragGlobals,
} from "./editorBridgeContracts.js";

test("editor bridge contract helpers preserve active event names and payload shapes", () => {
  assert.equal(EDITOR_BRIDGE_EVENTS.SELECTION_CHANGE, "editor-selection-change");
  assert.equal(EDITOR_BRIDGE_EVENTS.DRAGGING_END, "dragging-end");

  assert.deepEqual(
    buildEditorSelectionChangeDetail({
      ids: ["obj-1", "obj-2"],
      activeSectionId: "hero",
      galleryCell: { objId: "gallery-1", index: 2 },
    }),
    {
      ids: ["obj-1", "obj-2"],
      activeSectionId: "hero",
      galleryCell: { objId: "gallery-1", index: 2 },
    }
  );
  assert.deepEqual(buildEditorGalleryCellChangeDetail(), {
    cell: null,
  });
  assert.deepEqual(buildEditorActiveSectionDetail(" hero "), {
    id: "hero",
  });
  assert.deepEqual(buildEditorInvitationTypeDetail(" wedding "), {
    tipoInvitacion: "wedding",
  });
  assert.deepEqual(
    buildEditorDragLifecycleDetail({
      id: "obj-1",
      tipo: "texto",
    }),
    {
      id: "obj-1",
      tipo: "texto",
    }
  );
  assert.deepEqual(
    buildEditorDragLifecycleDetail({
      id: "obj-1",
      tipo: "texto",
      group: true,
      sessionId: "group-1",
      leaderId: "obj-1",
      engine: "manual-pointer",
    }),
    {
      id: "obj-1",
      tipo: "texto",
      group: true,
      sessionId: "group-1",
      leaderId: "obj-1",
      engine: "manual-pointer",
    }
  );
});

test("editor bridge flush helpers preserve request/result normalization", () => {
  assert.deepEqual(
    normalizeEditorDraftFlushRequestDetail({
      requestId: " req-1 ",
      slug: " draft-a ",
      reason: "",
    }),
    {
      requestId: "req-1",
      slug: "draft-a",
      reason: "manual-flush",
    }
  );
  assert.deepEqual(
    normalizeEditorDraftFlushResultDetail({
      requestId: " req-1 ",
      slug: " draft-a ",
      ok: true,
      reason: " saved-now ",
      error: "ignored",
    }),
    {
      requestId: "req-1",
      slug: "draft-a",
      ok: true,
      reason: "saved-now",
      error: "ignored",
    }
  );
  assert.deepEqual(
    buildEditorDraftFlushResultDetail({
      requestId: "req-1",
      slug: "draft-a",
      result: {
        ok: false,
        reason: "timeout",
        error: "No se recibio confirmacion",
      },
    }),
    {
      requestId: "req-1",
      slug: "draft-a",
      ok: false,
      reason: "timeout",
      error: "No se recibio confirmacion",
    }
  );
});

test("editor bridge group-drag projection exposes only the legacy globals the runtime reads", () => {
  const normalSession = {
    active: true,
    engine: "konva-drag",
    leaderId: "leader-1",
    elementIds: ["leader-1", "follower-1"],
    followerIds: ["follower-1"],
    startPointer: { x: 12, y: 48 },
    dragInicial: {
      "leader-1": { x: 10, y: 20 },
    },
    lastPreviewDelta: { deltaX: 8, deltaY: -4 },
  };

  assert.deepEqual(projectLegacyGroupDragGlobals(normalSession), {
    _groupDragSession: normalSession,
    _grupoLider: "leader-1",
    _grupoElementos: ["leader-1", "follower-1"],
    _grupoSeguidores: ["follower-1"],
    _dragStartPos: { x: 12, y: 48 },
    _dragInicial: {
      "leader-1": { x: 10, y: 20 },
    },
    _groupPreviewLastDelta: { deltaX: 8, deltaY: -4 },
  });

  const manualSession = {
    active: true,
    engine: "manual-pointer",
    phase: "active",
    leaderId: "leader-2",
    elementIds: ["leader-2", "follower-2"],
    followerIds: ["follower-2"],
    pointerDownStage: { x: 5, y: 6 },
    dragInicial: {
      "leader-2": { x: 100, y: 150 },
    },
    lastPreviewDelta: { deltaX: 2, deltaY: 3 },
  };

  assert.deepEqual(
    projectLegacyGroupDragGlobals(manualSession, {
      resolveManualStartPointer: () => ({ x: 40, y: 60 }),
    }),
    {
      _groupDragSession: manualSession,
      _grupoLider: "leader-2",
      _grupoElementos: ["leader-2", "follower-2"],
      _grupoSeguidores: ["follower-2"],
      _dragStartPos: { x: 40, y: 60 },
      _dragInicial: {
        "leader-2": { x: 100, y: 150 },
      },
      _groupPreviewLastDelta: { deltaX: 2, deltaY: 3 },
    }
  );

  assert.deepEqual(projectLegacyGroupDragGlobals(null), {
    _groupDragSession: null,
    _grupoLider: null,
    _grupoElementos: null,
    _grupoSeguidores: null,
    _dragStartPos: null,
    _dragInicial: null,
    _groupPreviewLastDelta: null,
  });
});

test("editor bridge contract does not formalize transient scratch globals", () => {
  const formalizedKeys = new Set(
    Object.values(EDITOR_RUNTIME_COMPATIBILITY_CONTRACT).flat()
  );

  assert.equal(
    EDITOR_RUNTIME_COMPATIBILITY_CONTRACT.canvasEditor.includes(
      "ensureInlineEditSettledBeforeCriticalAction"
    ),
    true
  );

  assert.equal(formalizedKeys.has("_skipUntil"), false);
  assert.equal(formalizedKeys.has("_recentGroupDragGuard"), false);
  assert.equal(formalizedKeys.has("_objetosCopiados"), false);
  assert.equal(formalizedKeys.has("_selectionThrottle"), false);
  assert.equal(formalizedKeys.has("_currentEditingId"), false);
  assert.equal(formalizedKeys.has("editing"), false);
});
