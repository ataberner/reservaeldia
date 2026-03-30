export function createSelectionClearPolicy({ clearSelectionState }) {
  const run = (options) => {
    if (typeof clearSelectionState !== "function") return null;
    return clearSelectionState(options);
  };

  return Object.freeze({
    clearCanvasSelection() {
      return run({
        clearCommittedSelection: true,
        clearPreselection: true,
        clearMarquee: true,
        clearBackgroundEdit: true,
        clearBackgroundInteraction: true,
        clearPendingDrag: true,
        clearDragVisual: true,
        source: "selection-ui:clear",
      });
    },
    clearForStageTap() {
      return run({
        clearCommittedSelection: true,
        clearPreselection: false,
        clearMarquee: false,
        clearBackgroundEdit: false,
        clearBackgroundInteraction: false,
        clearPendingDrag: true,
        clearDragVisual: true,
        source: "stage-gestures:clear-selection",
      });
    },
    resetMarquee() {
      return run({
        clearCommittedSelection: false,
        clearPreselection: true,
        clearMarquee: true,
        clearBackgroundEdit: false,
        clearBackgroundInteraction: false,
        clearPendingDrag: false,
        clearDragVisual: false,
        source: "stage-gestures:reset-marquee",
      });
    },
    prepareForSectionBackgroundEdit() {
      return run({
        clearCommittedSelection: true,
        clearPreselection: true,
        clearMarquee: true,
        clearBackgroundEdit: false,
        clearBackgroundInteraction: true,
        clearPendingDrag: true,
        clearDragVisual: true,
        source: "section-background:request-edit",
      });
    },
    prepareForBackgroundDecorationEdit() {
      return run({
        clearCommittedSelection: true,
        clearPreselection: true,
        clearMarquee: false,
        clearBackgroundEdit: false,
        clearBackgroundInteraction: false,
        clearPendingDrag: true,
        clearDragVisual: true,
        source: "background-decoration-edit",
      });
    },
  });
}
