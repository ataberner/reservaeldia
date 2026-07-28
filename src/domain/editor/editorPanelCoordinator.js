export const EDITOR_PANEL_IDS = Object.freeze({
  LEFT: "left",
  SECTION_DESIGN: "section-design",
});

const VALID_EDITOR_PANEL_IDS = new Set(Object.values(EDITOR_PANEL_IDS));

export function normalizeEditorPanelId(value) {
  return VALID_EDITOR_PANEL_IDS.has(value) ? value : null;
}

export function resolveEditorPanelState(
  state,
  { scopeKey = "", defaultPanel = null } = {}
) {
  const normalizedDefault = normalizeEditorPanelId(defaultPanel);
  if (state?.scopeKey !== scopeKey) {
    return {
      scopeKey,
      activePanel: normalizedDefault,
    };
  }

  return {
    scopeKey,
    activePanel: normalizeEditorPanelId(state?.activePanel),
  };
}

export function editorPanelCoordinatorReducer(state, action = {}) {
  const scopeKey = String(action.scopeKey || "");
  const current = resolveEditorPanelState(state, {
    scopeKey,
    defaultPanel: action.defaultPanel,
  });

  if (action.type === "open") {
    return {
      scopeKey,
      activePanel: normalizeEditorPanelId(action.panel),
    };
  }

  if (action.type === "close") {
    const requestedPanel = normalizeEditorPanelId(action.panel);
    if (requestedPanel && requestedPanel !== current.activePanel) {
      return current;
    }
    return {
      scopeKey,
      activePanel: null,
    };
  }

  return current;
}
