// C:\Reservaeldia\src\drag\dragIndividual.js


if (!window.__DEBUG_DRAG) window.__DEBUG_DRAG = false; // poné true en consola cuando quieras


export function startDragIndividual(e, dragStartPos) {
  dragStartPos.current = e.target.getStage().getPointerPosition();
  if (window.__DEBUG_DRAG) {
    const t = e.target;
    console.log('[DIAG] startDrag', {
      class: t?.getClassName?.(),
      id: t?.id?.(),
      x: t?.x?.(),
      y: t?.y?.()
    });
  }
  try { document.body.style.cursor = "grabbing"; } catch {}
}

export function previewDragIndividual(e, obj, onDragMovePersonalizado) {
  const node = e.currentTarget || e.target; // ✅ priorizar contenedor
  if (node?.position) {
    const nuevaPos = node.position();
    if (window.__DEBUG_DRAG) {
      console.log('[DIAG] dragMove', {
        id: obj?.id, class: node.getClassName?.(),
        local: { x: nuevaPos.x, y: nuevaPos.y },
        abs: node.absolutePosition?.()
      });
    }
    if (onDragMovePersonalizado) onDragMovePersonalizado(nuevaPos, obj.id);
  }
}

export function endDragIndividual(obj, node, onChange, onDragEndPersonalizado, hasDragged) {
  try { document.body.style.cursor = "default"; } catch {}
  if (node?.getAttr && node.getAttr("_muteNextEnd")) {
    try { node.setAttr("_muteNextEnd", false); } catch {}
    if (onDragEndPersonalizado) onDragEndPersonalizado();
    setTimeout(() => { hasDragged.current = false; }, 30);
    return;
  }
  const ahora = typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();
  if (
    window._skipIndividualEnd &&
    window._skipIndividualEnd.has(obj.id) &&
    (!window._skipUntil || ahora <= window._skipUntil)
  ) {
    try { window._skipIndividualEnd.delete(obj.id); } catch {}
    if (onDragEndPersonalizado) onDragEndPersonalizado();
    setTimeout(() => { hasDragged.current = false; }, 30);
    return;
  }

  if (window.__DEBUG_DRAG) {
    console.log('[DIAG] endDrag -> onChange', {
      id: obj?.id, class: node?.getClassName?.(),
      finalPosLocal: { x: node?.x?.(), y: node?.y?.() },
      finalAbs: node?.absolutePosition?.()
    });
  }
  onChange(obj.id, {
    x: node.x(),
    y: node.y(),
    finalizoDrag: true,
    causa: "drag-individual"
  });
  if (onDragEndPersonalizado) onDragEndPersonalizado();
  setTimeout(() => { hasDragged.current = false; }, 30);
}