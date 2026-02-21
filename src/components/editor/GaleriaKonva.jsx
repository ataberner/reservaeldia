// src/components/editor/GaleriaKonva.jsx
//
// Galeria de imagenes como UN solo objeto en Konva.
// - Calcula su propio offset Y por seccion (calcularOffsetY).
// - Renderiza las celdas en base a calcGalleryLayout.
// - Permite seleccionar la galeria y una celda (onSelect + onPickCell/setCeldaGaleriaActiva).
// - Arrastre del grupo actualiza seccion/posicion (determinarNuevaSeccion).
//
// Dependencias de frontend: utils/layout (NO usar funciones de functions/).
// ----------------------------------------------------------------------

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Group, Rect, Image as KonvaImage, Text as KonvaText } from "react-konva";
import useImage from "use-image";
import { calcGalleryLayout } from "@/utils/calcGrid";
import { calcularOffsetY, determinarNuevaSeccion } from "@/utils/layout";

const DRAG_THRESHOLD_PX = 4;

function getClientPoint(evt) {
  if (!evt) return null;

  const touch =
    evt.touches?.[0] ||
    evt.changedTouches?.[0] ||
    null;

  const x = Number.isFinite(touch?.clientX) ? touch.clientX : evt.clientX;
  const y = Number.isFinite(touch?.clientY) ? touch.clientY : evt.clientY;

  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { x, y };
}

function ImagenCelda({ src, fit = "cover", w, h }) {
  const [img] = useImage(src, "anonymous");
  if (!img) return null;

  const escContain = Math.min(w / img.width, h / img.height);
  const escCover = Math.max(w / img.width, h / img.height);
  const esc = fit === "contain" ? escContain : escCover;

  const iw = img.width * esc;
  const ih = img.height * esc;
  const ix = (w - iw) / 2;
  const iy = (h - ih) / 2;

  return (
    <KonvaImage
      image={img}
      x={ix}
      y={iy}
      width={iw}
      height={ih}
      listening={false}
    />
  );
}

export default function GaleriaKonva({
  obj,
  registerRef,
  onHover,
  isSelected,
  onSelect,
  onChange,
  onDragStartPersonalizado,
  onDragMovePersonalizado,
  onDragEndPersonalizado,
  celdaGaleriaActiva,
  onPickCell,
  setCeldaGaleriaActiva,
  seccionesOrdenadas = [],
  altoCanvas = 0,
}) {
  const [hoveredCell, setHoveredCell] = useState(null);
  const rootRef = useRef(null);
  const cleanupGlobalRef = useRef(null);
  const pressRef = useRef({
    active: false,
    movedEnough: false,
    startedDrag: false,
    suppressClick: false,
    allowDrag: false,
    startClientX: 0,
    startClientY: 0,
    startNodeX: 0,
    startNodeY: 0,
  });

  const setRootRef = useCallback(
    (node) => {
      rootRef.current = node || null;
      registerRef?.(obj.id, node || null);
    },
    [obj.id, registerRef]
  );

  const indexSeccion = seccionesOrdenadas.findIndex((s) => s.id === obj.seccionId);
  const offsetY = calcularOffsetY(seccionesOrdenadas, indexSeccion);

  const toNum = (v, d = 0) => (Number.isFinite(+v) ? +v : d);
  const radius = Math.max(0, toNum(obj.radius, 0));
  const gap = Math.max(0, toNum(obj.gap, 0));
  const rows = Math.max(1, toNum(obj.rows, 1));
  const cols = Math.max(1, toNum(obj.cols, 1));
  const width = Math.max(1, toNum(obj.width, 400));

  const cellRatio =
    obj.ratio === "4:3" ? 3 / 4 :
      obj.ratio === "16:9" ? 9 / 16 :
        1;

  const { rects, totalHeight } = useMemo(() => {
    try {
      return calcGalleryLayout({ width, rows, cols, gap, cellRatio });
    } catch {
      return { rects: [], totalHeight: 0 };
    }
  }, [width, rows, cols, gap, cellRatio]);

  const safeTotalHeight = Math.max(1, totalHeight);

  const isRemoveButtonTarget = useCallback(
    (target) => {
      const targetId =
        typeof target?.id === "function"
          ? target.id()
          : target?.attrs?.id;
      return typeof targetId === "string" && targetId.startsWith(`btn-${obj.id}-`);
    },
    [obj.id]
  );

  const cleanupGlobal = useCallback(() => {
    if (!cleanupGlobalRef.current) return;
    try {
      cleanupGlobalRef.current();
    } finally {
      cleanupGlobalRef.current = null;
    }
  }, []);

  const attachGlobalListeners = useCallback(() => {
    cleanupGlobal();

    const onMove = (ev) => {
      const press = pressRef.current;
      if (!press.active || press.startedDrag || !press.allowDrag) return;

      const point = getClientPoint(ev);
      if (!point) return;

      const dx = point.x - press.startClientX;
      const dy = point.y - press.startClientY;
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;

      press.movedEnough = true;
      press.startedDrag = true;
      press.suppressClick = true;

      const node = rootRef.current;
      if (!node) return;

      try {
        node.position({ x: press.startNodeX, y: press.startNodeY });
        node.getLayer()?.batchDraw();
      } catch {}

      try {
        node.draggable(true);
        node.startDrag();
      } catch {}
    };

    const onUp = () => {
      const press = pressRef.current;
      if (!press.active) {
        cleanupGlobal();
        return;
      }

      press.active = false;

      const node = rootRef.current;
      if (node) {
        if (!press.movedEnough) {
          try {
            node.position({ x: press.startNodeX, y: press.startNodeY });
            node.getLayer()?.batchDraw();
          } catch {}
        } else {
          try {
            if (node.isDragging?.()) node.stopDrag();
          } catch {}
        }
        try {
          node.draggable(false);
        } catch {}
      }

      press.movedEnough = false;
      press.startedDrag = false;

      setTimeout(() => {
        pressRef.current.suppressClick = false;
      }, 0);

      cleanupGlobal();
    };

    window.addEventListener("mousemove", onMove, true);
    window.addEventListener("touchmove", onMove, { capture: true, passive: true });
    window.addEventListener("mouseup", onUp, true);
    window.addEventListener("touchend", onUp, true);
    window.addEventListener("touchcancel", onUp, true);
    window.addEventListener("pointercancel", onUp, true);
    window.addEventListener("blur", onUp, true);

    cleanupGlobalRef.current = () => {
      window.removeEventListener("mousemove", onMove, true);
      window.removeEventListener("touchmove", onMove, true);
      window.removeEventListener("mouseup", onUp, true);
      window.removeEventListener("touchend", onUp, true);
      window.removeEventListener("touchcancel", onUp, true);
      window.removeEventListener("pointercancel", onUp, true);
      window.removeEventListener("blur", onUp, true);
    };
  }, [cleanupGlobal]);

  const handlePressStart = useCallback(
    (e) => {
      if (e) e.cancelBubble = true;
      if (e?.evt) e.evt.cancelBubble = true;

      const node = rootRef.current || e.currentTarget;
      const point = getClientPoint(e?.evt);
      if (!node || !point) return;

      const press = pressRef.current;
      press.active = true;
      press.movedEnough = false;
      press.startedDrag = false;
      press.suppressClick = false;
      press.allowDrag = isSelected && !isRemoveButtonTarget(e?.target);
      press.startClientX = point.x;
      press.startClientY = point.y;
      press.startNodeX = node.x();
      press.startNodeY = node.y();

      try {
        node.draggable(false);
      } catch {}

      attachGlobalListeners();
    },
    [attachGlobalListeners, isRemoveButtonTarget, isSelected]
  );

  const handleRootClick = useCallback(
    (e) => {
      if (e && e.evt) e.evt.cancelBubble = true;
      if (pressRef.current.suppressClick) return;
      onSelect?.(obj.id, e);
    },
    [obj.id, onSelect]
  );

  const seleccionarCelda = (index, evt) => {
    if (pressRef.current.suppressClick) return;
    if (evt?.target?.id?.() === `btn-${obj.id}-${index}`) return;
    if (evt) evt.cancelBubble = true;
    if (evt?.evt) evt.evt.cancelBubble = true;
    onSelect?.(obj.id, evt);
    const payload = { objId: obj.id, index };
    onPickCell?.(payload);
    setCeldaGaleriaActiva?.(payload);
  };

  const limpiarCelda = (index, evt) => {
    if (pressRef.current.suppressClick) return;
    if (evt) evt.cancelBubble = true;
    if (evt?.evt) evt.evt.cancelBubble = true;
    const nuevasCells = [...(obj.cells || [])];
    nuevasCells[index] = { ...(nuevasCells[index] || {}), mediaUrl: null };
    onChange?.(obj.id, { cells: nuevasCells });
  };

  useEffect(() => () => cleanupGlobal(), [cleanupGlobal]);

  return (
    <Group
      x={toNum(obj.x, 0)}
      y={toNum(obj.y, 0) + offsetY}
      id={obj.id}
      clipX={0}
      clipY={0}
      clipWidth={width}
      clipHeight={safeTotalHeight}
      draggable={false}
      ref={setRootRef}
      onMouseEnter={() => {
        if (!window._isDragging) onHover?.(obj.id);
      }}
      onMouseLeave={() => {
        setHoveredCell(null);
        onHover?.(null);
      }}
      onMouseDown={handlePressStart}
      onTouchStart={handlePressStart}
      onClick={handleRootClick}
      onTap={handleRootClick}
      onDragStart={(e) => {
        if (!isSelected) {
          e.target.stopDrag();
          return;
        }
        window._isDragging = true;
        onDragStartPersonalizado?.(obj.id);
      }}
      onDragMove={(e) => {
        onDragMovePersonalizado?.({ x: e.target.x(), y: e.target.y() }, obj.id);
      }}
      onDragEnd={(e) => {
        onDragMovePersonalizado?.({ x: e.target.x(), y: e.target.y() }, obj.id);

        const finalX = e.target.x();
        const finalYAbs = e.target.y();

        const { nuevaSeccion, coordenadasAjustadas } = determinarNuevaSeccion(
          finalYAbs,
          obj.seccionId,
          seccionesOrdenadas
        );

        if (nuevaSeccion) {
          onChange?.(obj.id, { x: finalX, seccionId: nuevaSeccion, ...coordenadasAjustadas });
        } else {
          const yRel = finalYAbs - offsetY;
          onChange?.(obj.id, { x: finalX, y: yRel });
        }

        window._isDragging = false;
        onDragEndPersonalizado?.(obj.id);
        e.target.draggable(false);
        pressRef.current.active = false;
        pressRef.current.movedEnough = false;
        pressRef.current.startedDrag = false;
        setTimeout(() => {
          pressRef.current.suppressClick = false;
        }, 0);
        cleanupGlobal();
      }}
    >
      <Rect
        name="gallery-transform-frame"
        x={0}
        y={0}
        width={width}
        height={safeTotalHeight}
        fill="transparent"
        strokeEnabled={false}
        listening={false}
      />

      {rects.map((r, i) => {
        const cell = obj.cells?.[i] || {};
        const bg = cell.bg || "#f3f4f6";
        const mediaUrl = cell.mediaUrl || null;
        const fit = cell.fit || "cover";

        const esActiva =
          celdaGaleriaActiva?.objId === obj.id &&
          celdaGaleriaActiva?.index === i;

        const clipFunc = (ctx) => {
          const w = r.width;
          const h = r.height;
          const rad = Math.min(radius, Math.min(w, h) / 2);
          ctx.beginPath();
          ctx.moveTo(rad, 0);
          ctx.lineTo(w - rad, 0);
          ctx.quadraticCurveTo(w, 0, w, rad);
          ctx.lineTo(w, h - rad);
          ctx.quadraticCurveTo(w, h, w - rad, h);
          ctx.lineTo(rad, h);
          ctx.quadraticCurveTo(0, h, 0, h - rad);
          ctx.lineTo(0, rad);
          ctx.quadraticCurveTo(0, 0, rad, 0);
          ctx.closePath();
        };

        const mostrarBotonQuitar = mediaUrl && (hoveredCell === i || esActiva);

        return (
          <Group
            key={`${obj.id}-${i}`}
            x={r.x}
            y={r.y}
            onMouseEnter={() => setHoveredCell(i)}
            onMouseLeave={() => setHoveredCell(null)}
            onClick={(e) => seleccionarCelda(i, e)}
            onTap={(e) => seleccionarCelda(i, e)}
          >
            <Rect x={0} y={0} width={r.width} height={r.height} fill="transparent" />

            <Group clipFunc={clipFunc} listening={true}>
              <Rect x={0} y={0} width={r.width} height={r.height} fill={bg} />
              {mediaUrl && (
                <ImagenCelda src={mediaUrl} fit={fit} w={r.width} h={r.height} />
              )}
              <Rect
                x={0}
                y={0}
                width={r.width}
                height={r.height}
                cornerRadius={radius || 0}
                stroke={esActiva ? "#773dbe" : "#ddd"}
                strokeWidth={esActiva ? 2 : 1}
                dash={esActiva ? [6, 4] : []}
                listening={false}
              />
            </Group>

            {mostrarBotonQuitar && (
              <Group
                id={`btn-${obj.id}-${i}`}
                x={r.width - 20}
                y={0}
                width={20}
                height={20}
                listening={true}
                onMouseEnter={() => setHoveredCell(i)}
                onClick={(e) => limpiarCelda(i, e)}
                onTap={(e) => limpiarCelda(i, e)}
              >
                <Rect width={20} height={20} fill="rgba(0,0,0,0.6)" cornerRadius={4} />
                <KonvaText
                  text="x"
                  fontSize={14}
                  fill="#fff"
                  align="center"
                  verticalAlign="middle"
                  width={20}
                  height={20}
                  listening={false}
                />
              </Group>
            )}
          </Group>
        );
      })}
    </Group>
  );
}
