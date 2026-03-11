import { useState, useCallback } from "react";

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
  });

  const startEdit = useCallback(
    (id, val, options = {}) =>
      setEditing({
        id,
        value: val,
        initialCaretClientPoint: normalizeClientPoint(
          options?.initialCaretClientPoint
        ),
      }),
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
      }),
    []
  );

  return { editing, startEdit, updateEdit, finishEdit };
}
