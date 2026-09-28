import { useCallback, useLayoutEffect, useRef } from "react";
import { createEditorDocumentOperation } from "../lib/editorDocumentOperation.js";

// Lifetimes of Places/file pickers are shorter than the sidebar lifetime.
export default function useEditorDocumentOperation() {
  const operations = useRef(new Set());
  useLayoutEffect(() => () => {
    for (const operation of operations.current) operation.cancel();
    operations.current.clear();
  }, []);
  return useCallback(() => {
    const operation = createEditorDocumentOperation(window);
    const cancel = operation.cancel;
    operation.cancel = () => { cancel(); operations.current.delete(operation); };
    operations.current.add(operation);
    return operation;
  }, []);
}
