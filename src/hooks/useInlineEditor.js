import { useState, useCallback } from "react";
import {
  normalizeInlineEntrySelectionMode,
} from "@/components/editor/textSystem/runtime/inlineEntrySelectionMode";

function normalizeClientPoint(point) {
  const clientX = Number(point?.clientX);
  const clientY = Number(point?.clientY);
  if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) {
    return null;
  }
  return { clientX, clientY };
}

export default function useInlineEditor() {
  const [editing, setEditing] = useState({
    id: null,
    value: "",
    initialCaretClientPoint: null,
    entrySelectionMode: null,
  });

  const startEdit = useCallback(
    (id, val, options = {}) => {
      const initialCaretClientPoint = normalizeClientPoint(
        options?.initialCaretClientPoint
      );
      setEditing({
        id,
        value: val,
        initialCaretClientPoint,
        entrySelectionMode: normalizeInlineEntrySelectionMode(
          options?.entrySelectionMode,
          { initialCaretClientPoint }
        ),
      });
    },
    []
  );
  const updateEdit = useCallback(
    (val) => setEditing((e) => ({ ...e, value: val })),
    []
  );
  const finishEdit = useCallback(
    () =>
      setEditing({
        id: null,
        value: "",
        initialCaretClientPoint: null,
        entrySelectionMode: null,
      }),
    []
  );

  return { editing, startEdit, updateEdit, finishEdit };
}
