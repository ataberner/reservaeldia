export function triggerEditorUndo() {
  if (typeof window !== "undefined" && window.canvasEditor?.deshacer) {
    window.canvasEditor.deshacer();
    return;
  }

  if (typeof document !== "undefined") {
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "z", ctrlKey: true, bubbles: true })
    );
  }
}

export function triggerEditorRedo() {
  if (typeof window !== "undefined" && window.canvasEditor?.rehacer) {
    window.canvasEditor.rehacer();
    return;
  }

  if (typeof document !== "undefined") {
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "y", ctrlKey: true, bubbles: true })
    );
  }
}
