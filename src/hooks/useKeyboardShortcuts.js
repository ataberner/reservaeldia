// src/hooks/useKeyboardShortcuts.js
import { useEffect } from 'react';
import {
  resolveCanvasKeyboardNudgeIntent,
} from '@/domain/editor/canvasObjectPositioning';

export default function useKeyboardShortcuts({
  onDeshacer,
  onRehacer,
  onDuplicar,
  onEliminar,
  onDeseleccionar,
  onCopiar,
  onPegar,
  onCambiarAlineacion,
  onMoverSeleccion,
  isEditing,
  tieneSeleccion,
  puedeMoverSeleccion = false,
  disabled = false,
}) {
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (disabled) return;

      const key = typeof e?.key === "string" ? e.key.toLowerCase() : "";
      if (!key) return;

      // 🔒 No ejecutar atajos si se está escribiendo en un input, textarea o contenteditable
      const activeElement = document.activeElement;
      const eventTarget = e?.target && e.target !== document ? e.target : null;
      const keyboardTarget = eventTarget || activeElement;
      const tag = keyboardTarget?.tagName?.toLowerCase();
      const isTyping =
        tag === 'input' ||
        tag === 'textarea' ||
        tag === 'select' ||
        keyboardTarget?.isContentEditable ||
        activeElement?.isContentEditable;

      const keyboardNudge = resolveCanvasKeyboardNudgeIntent({
        key,
        canMoveSelection: puedeMoverSeleccion,
        isEditing,
        isTyping,
        defaultPrevented: e.defaultPrevented,
      });

      if (keyboardNudge) {
        e.preventDefault();
        onMoverSeleccion?.(keyboardNudge);
        return;
      }

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
    onMoverSeleccion,
    isEditing,
    tieneSeleccion,
    puedeMoverSeleccion,
    disabled,
  ]);
}
