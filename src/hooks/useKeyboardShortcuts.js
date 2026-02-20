// src/hooks/useKeyboardShortcuts.js
import { useEffect } from 'react';

export default function useKeyboardShortcuts({
  onDeshacer,
  onRehacer,
  onDuplicar,
  onEliminar,
  onDeseleccionar,
  onCopiar,
  onPegar,
  onCambiarAlineacion,
  isEditing,
  tieneSeleccion
}) {
  useEffect(() => {
    const handleKeyDown = (e) => {
      const key = typeof e?.key === "string" ? e.key.toLowerCase() : "";
      if (!key) return;

      // 🔒 No ejecutar atajos si se está escribiendo en un input, textarea o contenteditable
      const tag = document.activeElement?.tagName?.toLowerCase();
      const isTyping =
        tag === 'input' ||
        tag === 'textarea' ||
        document.activeElement?.isContentEditable;

      if (isTyping) return;

      // ⌨️ Atajos con Ctrl o Cmd
      if ((e.ctrlKey || e.metaKey) && key === "z" && !e.shiftKey) {
        e.preventDefault();
        onDeshacer?.();
      }

      if ((e.ctrlKey || e.metaKey) && (key === "y" || (key === "z" && e.shiftKey))) {
        e.preventDefault();
        onRehacer?.();
      }

      if ((e.ctrlKey || e.metaKey) && key === "d") {
        if (!tieneSeleccion) return;
        e.preventDefault();
        onDuplicar?.();
      }


      if ((e.ctrlKey || e.metaKey) && key === "c") {
        if (!tieneSeleccion) return;
        e.preventDefault();
        onCopiar?.();
      }

      if ((e.ctrlKey || e.metaKey) && key === "v") {
        e.preventDefault();
        onPegar?.();
      }

      // 🔤 Alineación: tecla L
      if (key === "l") {
        e.preventDefault();
        onCambiarAlineacion?.();
      }

      // 🗑️ Eliminar
      if ((key === "delete" || key === "backspace") && tieneSeleccion && !isEditing) {
        e.preventDefault();
        onEliminar?.();
      }

      // ❌ Deseleccionar
      if (key === "escape") {
        e.preventDefault();
        onDeseleccionar?.();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [
    onDeshacer,
    onRehacer,
    onDuplicar,
    onEliminar,
    onDeseleccionar,
    onCopiar,
    onPegar,
    onCambiarAlineacion,
    isEditing,
    tieneSeleccion
  ]);
}
