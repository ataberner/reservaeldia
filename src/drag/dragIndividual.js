// C:\Reservaeldia\src\drag\dragIndividual.js

export function startDragIndividual(e, dragStartPos) {
  dragStartPos.current = e.target.getStage().getPointerPosition();
}

export function previewDragIndividual(e, obj, onDragMovePersonalizado) {
  const node = e.target;
  if (node?.position) {
    const nuevaPos = node.position();
    if (onDragMovePersonalizado) onDragMovePersonalizado(nuevaPos, obj.id);
  }
}

export function endDragIndividual(obj, node, onChange, onDragEndPersonalizado, hasDragged) {
  // 🔇 1) Mute por nodo (a prueba de balas)
  if (node?.getAttr && node.getAttr("_muteNextEnd")) {
    try { node.setAttr("_muteNextEnd", false); } catch {}
    if (onDragEndPersonalizado) onDragEndPersonalizado();
    setTimeout(() => { hasDragged.current = false; }, 30);
    return;
  }

  // 🧯 2) Mute global por ventana de tiempo (cinturón y tirantes)
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

  // ✅ 3) Drag individual normal
  console.log("🔄 FIN DRAG INDIVIDUAL:", obj.id);
  onChange(obj.id, {
    x: node.x(),
    y: node.y(),
    finalizoDrag: true,
    causa: "drag-individual"
  });

  if (onDragEndPersonalizado) onDragEndPersonalizado();
  setTimeout(() => { hasDragged.current = false; }, 30);
}
