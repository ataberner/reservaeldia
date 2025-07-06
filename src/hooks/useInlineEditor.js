import { useState, useCallback } from "react";

export default function useInlineEditor() {
  const [editing, setEditing] = useState({ id: null, value: "" });

  const startEdit  = useCallback((id, val) => setEditing({ id, value: val }), []);
  const updateEdit = useCallback((val)      => setEditing(e => ({ ...e, value: val })), []);
  const finishEdit = useCallback(()         => setEditing({ id: null, value: "" }), []);

  return { editing, startEdit, updateEdit, finishEdit };
}
