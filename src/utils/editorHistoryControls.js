import { readCanvasEditorMethod } from "@/lib/editorRuntimeBridge";

export function triggerEditorUndo() {
  const undo = readCanvasEditorMethod("deshacer");
  if (undo) {
    undo();
    return;
  }

  if (typeof document !== "undefined") {
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "z", ctrlKey: true, bubbles: true })
    );
  }
}

export function triggerEditorRedo() {
  const redo = readCanvasEditorMethod("rehacer");
  if (redo) {
    redo();
    return;
  }

  if (typeof document !== "undefined") {
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "y", ctrlKey: true, bubbles: true })
    );
  }
}
