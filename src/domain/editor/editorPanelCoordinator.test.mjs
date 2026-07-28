import test from "node:test";
import assert from "node:assert/strict";

import {
  EDITOR_PANEL_IDS,
  editorPanelCoordinatorReducer,
  resolveEditorPanelState,
} from "./editorPanelCoordinator.js";

test("editor panel coordinator opens only one side at a time", () => {
  let state = resolveEditorPanelState(null, {
    scopeKey: "draft-a",
    defaultPanel: EDITOR_PANEL_IDS.LEFT,
  });
  assert.equal(state.activePanel, EDITOR_PANEL_IDS.LEFT);

  state = editorPanelCoordinatorReducer(state, {
    type: "open",
    scopeKey: "draft-a",
    panel: EDITOR_PANEL_IDS.SECTION_DESIGN,
  });
  assert.equal(state.activePanel, EDITOR_PANEL_IDS.SECTION_DESIGN);

  state = editorPanelCoordinatorReducer(state, {
    type: "open",
    scopeKey: "draft-a",
    panel: EDITOR_PANEL_IDS.LEFT,
  });
  assert.equal(state.activePanel, EDITOR_PANEL_IDS.LEFT);
});

test("closing one panel cannot accidentally close the other", () => {
  const state = {
    scopeKey: "draft-a",
    activePanel: EDITOR_PANEL_IDS.SECTION_DESIGN,
  };
  const unchanged = editorPanelCoordinatorReducer(state, {
    type: "close",
    scopeKey: "draft-a",
    panel: EDITOR_PANEL_IDS.LEFT,
  });
  const closed = editorPanelCoordinatorReducer(state, {
    type: "close",
    scopeKey: "draft-a",
    panel: EDITOR_PANEL_IDS.SECTION_DESIGN,
  });

  assert.equal(unchanged.activePanel, EDITOR_PANEL_IDS.SECTION_DESIGN);
  assert.equal(closed.activePanel, null);
});

test("a new editor scope resets to its declared default without competing effects", () => {
  const state = {
    scopeKey: "draft-a",
    activePanel: EDITOR_PANEL_IDS.SECTION_DESIGN,
  };
  assert.deepEqual(
    resolveEditorPanelState(state, {
      scopeKey: "draft-b",
      defaultPanel: EDITOR_PANEL_IDS.LEFT,
    }),
    {
      scopeKey: "draft-b",
      activePanel: EDITOR_PANEL_IDS.LEFT,
    }
  );
});
