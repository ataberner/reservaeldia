import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useReducer,
} from "react";
import {
  editorPanelCoordinatorReducer,
  normalizeEditorPanelId,
  resolveEditorPanelState,
} from "@/domain/editor/editorPanelCoordinator";

const EditorPanelCoordinatorContext = createContext({
  activePanel: null,
  openPanel: () => {},
  closePanel: () => {},
});

export function EditorPanelCoordinatorProvider({
  children,
  scopeKey = "",
  defaultPanel = null,
}) {
  const normalizedScopeKey = String(scopeKey || "");
  const normalizedDefaultPanel = normalizeEditorPanelId(defaultPanel);
  const [state, dispatch] = useReducer(editorPanelCoordinatorReducer, {
    scopeKey: normalizedScopeKey,
    activePanel: normalizedDefaultPanel,
  });
  const resolvedState = resolveEditorPanelState(state, {
    scopeKey: normalizedScopeKey,
    defaultPanel: normalizedDefaultPanel,
  });

  const openPanel = useCallback(
    (panel) => {
      dispatch({
        type: "open",
        scopeKey: normalizedScopeKey,
        defaultPanel: normalizedDefaultPanel,
        panel,
      });
    },
    [normalizedDefaultPanel, normalizedScopeKey]
  );

  const closePanel = useCallback(
    (panel = null) => {
      dispatch({
        type: "close",
        scopeKey: normalizedScopeKey,
        defaultPanel: normalizedDefaultPanel,
        panel,
      });
    },
    [normalizedDefaultPanel, normalizedScopeKey]
  );

  const value = useMemo(
    () => ({
      activePanel: resolvedState.activePanel,
      openPanel,
      closePanel,
    }),
    [closePanel, openPanel, resolvedState.activePanel]
  );

  return (
    <EditorPanelCoordinatorContext.Provider value={value}>
      {children}
    </EditorPanelCoordinatorContext.Provider>
  );
}

export function useEditorPanelCoordinator() {
  return useContext(EditorPanelCoordinatorContext);
}
