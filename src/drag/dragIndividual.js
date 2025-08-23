// C:\Reservaeldia\src\drag\dragIndividual.js

// Manejo del drag individual

export function startDragIndividual(e, dragStartPos) {
  dragStartPos.current = e.target.getStage().getPointerPosition();
}

export function previewDragIndividual(e, obj, onDragMovePersonalizado) {
  const node = e.target;
  if (node && node.position) {
    const nuevaPos = node.position();

    // 🔥 mover también el texto hermano si existe
    const textoNode = window._elementRefs?.[`${obj.id}-text`];
    if (textoNode) {
      textoNode.x(nuevaPos.x);
      textoNode.y(nuevaPos.y);
      textoNode.getLayer()?.batchDraw();
    }

    if (onDragMovePersonalizado) {
      onDragMovePersonalizado(nuevaPos, obj.id);
    }
  }
}

export function endDragIndividual(obj, node, onChange, onDragEndPersonalizado, hasDragged) {
  console.log("🔄 FIN DRAG INDIVIDUAL:", obj.id);
  onChange(obj.id, {
    x: node.x(),
    y: node.y(),
    finalizoDrag: true
  });

  if (onDragEndPersonalizado) onDragEndPersonalizado();

  setTimeout(() => {
    hasDragged.current = false;
  }, 50);
}

