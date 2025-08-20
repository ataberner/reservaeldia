// src/components/editor/GaleriaKonva.jsx
//
// Galería de imágenes como UN solo objeto en Konva.
// - Calcula su propio offset Y por sección (calcularOffsetY).
// - Renderiza las celdas en base a calcGalleryLayout.
// - Permite seleccionar la galería y una celda (onSelect + onPickCell/setCeldaGaleriaActiva).
// - Arrastre del grupo actualiza sección/posición (determinarNuevaSeccion).
//
// Dependencias de frontend: utils/layout (NO usar funciones de functions/).
// ----------------------------------------------------------------------

import React, { useMemo } from "react";
import { Group, Rect, Image as KonvaImage } from "react-konva";
import useImage from "use-image";
import { calcGalleryLayout } from "@/utils/calcGrid";
import { calcularOffsetY, determinarNuevaSeccion } from "@/utils/layout";

// Imagen dentro de la celda con fit cover/contain (memo no necesario si src cambia poco)
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
  isSelected, // (hoy no lo usamos, pero lo dejamos por compatibilidad)
  onSelect,
  onChange,
  onDragStartPersonalizado,
  onDragMovePersonalizado,
  onDragEndPersonalizado,
  // celda activa / selección de celda
  celdaGaleriaActiva,
  onPickCell,              // preferido
  setCeldaGaleriaActiva,   // fallback
  // secciones
  seccionesOrdenadas = [],
  altoCanvas = 0,
}) {
  // 1) Sección y offset
  const indexSeccion = seccionesOrdenadas.findIndex((s) => s.id === obj.seccionId);
  const offsetY = calcularOffsetY(seccionesOrdenadas, indexSeccion);


  // 2) Normalizar números
  const toNum = (v, d = 0) => (Number.isFinite(+v) ? +v : d);
  const radius = Math.max(0, toNum(obj.radius, 0));
  const gap = Math.max(0, toNum(obj.gap, 0));
  const rows = Math.max(1, toNum(obj.rows, 1));
  const cols = Math.max(1, toNum(obj.cols, 1));
  const width = Math.max(1, toNum(obj.width, 400));

  // 3) Ratio alto/ancho por celda
  const cellRatio =
    obj.ratio === "4:3" ? 3 / 4 :
      obj.ratio === "16:9" ? 9 / 16 :
        1;

  // 4) Layout de celdas
  const { rects, totalHeight } = useMemo(() => {
    try {
      return calcGalleryLayout({ width, rows, cols, gap, cellRatio });
    } catch {
      return { rects: [], totalHeight: 0 };
    }
  }, [width, rows, cols, gap, cellRatio]);

  const safeTotalHeight = Math.max(1, totalHeight);

  return (
    <Group
      x={toNum(obj.x, 0)}
      y={toNum(obj.y, 0) + offsetY}
      id={obj.id} 
      draggable={false}
      ref={(node) => registerRef?.(obj.id, node)}
      onClick={(e) => {
        if (e && e.evt) e.evt.cancelBubble = true;
        onSelect?.(obj.id, e);
      }}
      onDragStart={(e) => {
        if (!isSelected) {
          e.target.stopDrag(); // 🔒 evita drag si no está seleccionado
          return;
        }
        window._isDragging = true;
        onDragStartPersonalizado?.(obj.id);
      }}
      onDragMove={(e) => {
        onDragMovePersonalizado?.({ x: e.target.x(), y: e.target.y() }, obj.id);
      }}
      onMouseDown={(e) => {
  if (!isSelected) return;
  const node = e.target.getStage()?.findOne(`#${obj.id}`);
  if (node) {
    node.draggable(true);   // habilitar
    node.startDrag(e);      // iniciar drag real
  }
}}
      onDragEnd={(e) => {
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
      }}
    >
      {/* Bounding del grupo (útil para drag/selección visual) */}
      <Rect
        x={0}
        y={0}
        width={width}
        height={safeTotalHeight}
        fill="transparent"
        stroke="#ddd"
        listening={true}
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

        return (
          <Group
            key={`${obj.id}-${i}`}
            x={r.x}
            y={r.y}
            clipFunc={clipFunc}
            listening={true}
            onMouseDown={() => {
              // Marcá celda activa (soportamos ambos contratos)
              onPickCell?.({ objId: obj.id, index: i });
              setCeldaGaleriaActiva?.({ objId: obj.id, index: i });
            }}
          >
            {/* Fondo de celda */}
            <Rect x={0} y={0} width={r.width} height={r.height} fill={bg} />

            {/* Imagen si hay */}
            {mediaUrl && (
              <ImagenCelda
                src={mediaUrl}
                fit={fit}
                w={r.width}
                h={r.height}
              />
            )}

            {/* Borde activo */}
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
        );
      })}
    </Group>
  );
}
