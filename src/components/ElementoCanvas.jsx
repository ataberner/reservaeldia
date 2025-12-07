// ElementoCanvas.jsx - REEMPLAZAR TODO EL ARCHIVO
import { Text, Image as KonvaImage, Rect, Circle, Line, RegularPolygon, Path, Group } from "react-konva";
import useImage from "use-image";
import { useState, useRef, useMemo, useCallback, useEffect } from "react";
import { LINE_CONSTANTS } from '@/models/lineConstants';
import { fontManager } from '../utils/fontManager';
import { previewDragGrupal, startDragGrupalLider, endDragGrupal } from "@/drag/dragGrupal";
import { startDragIndividual, previewDragIndividual, endDragIndividual } from "@/drag/dragIndividual";
import { getCenteredTextPosition } from "@/utils/getTextMetrics";



export default function ElementoCanvas({
  obj,
  isSelected,
  isInEditMode,
  onSelect,
  onChange,
  editingId,
  registerRef,
  onHover,
  preSeleccionado,
  onDragMovePersonalizado,
  onDragEndPersonalizado,
  dragStartPos,
  hasDragged,
  onStartTextEdit,
  editingMode = false
}) {
  const [img] = useImage(obj.src || null, "anonymous");
  const [isDragging, setIsDragging] = useState(false);

  const textNodeRef = useRef(null);

  // 🔥 PREVENIR onChange RECURSIVO PARA AUTOFIX
  const handleChange = useCallback((id, newData) => {
    if (newData.fromAutoFix || !onChange) return;
    onChange(id, newData);
  }, [onChange]);

  const handleRef = useCallback((node) => {
    if (node && registerRef) {
      registerRef(obj.id, node);
    }
  }, [obj.id, registerRef]);

  // 🔥 MEMOIZAR PROPIEDADES COMUNES
  const commonProps = useMemo(() => ({
    x: obj.x ?? 0,
    y: obj.y ?? 0,
    rotation: obj.rotation || 0,
    scaleX: obj.scaleX || 1,
    scaleY: obj.scaleY || 1,
    draggable: !editingMode,
    ref: handleRef,
    listening: !isInEditMode,

    onMouseDown: (e) => {
      e.cancelBubble = true;
      hasDragged.current = false;

      e.currentTarget?.draggable(true);
    },

    onMouseUp: (e) => {
      if (e.currentTarget?.draggable && !hasDragged.current) {
        e.currentTarget.draggable(false);
      }
    },

    onClick: (e) => {
      e.cancelBubble = true;

      if (!hasDragged.current) {
        // 🧠 Si es texto, mismo comportamiento actual
        if (obj.tipo === "texto") {
          if (isSelected) {
            onStartTextEdit?.(obj.id, obj.texto);
          } else {
            onSelect(obj.id, obj, e);
          }
        }

        // 🆕 Si es forma con texto, comportamiento similar
        else if (obj.tipo === "forma" && obj.figura === "rect") {
          if (isSelected) {
            onStartTextEdit?.(obj.id, obj.texto || "");
          } else {
            onSelect(obj.id, obj, e);
          }
        }

        // 🧱 Para todo lo demás
        else {
          onSelect(obj.id, obj, e);
        }
      }
    },

    onDragStart: (e) => {


      window._dragCount = 0;
      window._lastMouse = null;
      window._lastElement = null;

      hasDragged.current = true;
      window._isDragging = true;
      setIsDragging(true);

      // 🔥 Intentar drag grupal
      const fueGrupal = startDragGrupalLider(e, obj);
      if (!fueGrupal) {
        startDragIndividual(e, dragStartPos);
      }
    },


    onDragMove: (e) => {
      hasDragged.current = true;

      const stage = e.target.getStage();
      const mousePos = stage.getPointerPosition();
      const elementPos = { x: e.target.x(), y: e.target.y() };

      window._lastMouse = mousePos;
      window._lastElement = elementPos;

      // 🔥 DRAG GRUPAL - SOLO EL LÍDER PROCESA
      if (window._grupoLider && obj.id === window._grupoLider) {
        // Preview visual para drag grupal
        const stage = e.target.getStage();
        const currentPos = stage.getPointerPosition();
        const startPos = window._dragStartPos;

        if (currentPos && startPos && window._dragInicial) {
          const deltaX = currentPos.x - startPos.x;
          const deltaY = currentPos.y - startPos.y;
          const seleccion = window._elementosSeleccionados || [];

          // Actualizar visualmente todos los seguidores
          seleccion.forEach((elementId) => {
            if (elementId === obj.id) return; // El líder ya se mueve automáticamente

            const node = window._elementRefs?.[elementId];
            const posInicial = window._dragInicial[elementId];

            if (node && posInicial) {
              node.x(posInicial.x + deltaX);
              node.y(posInicial.y + deltaY);
            }
          });

          // Redibujar para mostrar cambios
          if (e.target.getLayer) {
            e.target.getLayer().batchDraw();
          }
        }

        // 🔥 NO llamar onDragMovePersonalizado durante drag grupal (evita guías)
        // El preview individual ya no es necesario porque manejamos todo aquí

        return;
      }

      // 🔥 SI ES SEGUIDOR DEL GRUPO, NO PROCESAR
      if (window._grupoLider) {
        const elementosSeleccionados = window._elementosSeleccionados || [];
        if (elementosSeleccionados.includes(obj.id) && obj.id !== window._grupoLider) {
          return;
        }
      }

      // 🔄 DRAG INDIVIDUAL - Solo si no hay drag grupal activo
      if (!window._grupoLider) {
        previewDragIndividual(e, obj, onDragMovePersonalizado);
      }
    },




    onDragEnd: (e) => {

      window._isDragging = false;
      setIsDragging(false);

      const node = e.currentTarget;

      // 🔥 Intentar drag grupal
      const fueGrupal = endDragGrupal(e, obj, onChange, hasDragged, setIsDragging);
      if (fueGrupal) return;

      // 🔄 DRAG INDIVIDUAL (no cambió)
      endDragIndividual(obj, node, onChange, onDragEndPersonalizado, hasDragged);
    },


  }), [obj.x, obj.y, obj.rotation, obj.scaleX, obj.scaleY, handleRef, onChange, isInEditMode]);


  // 🔥 MEMOIZAR HANDLERS HOVER
  const handleMouseEnter = useCallback(() => {
    if (!onHover || isDragging || window._isDragging || isInEditMode) return;
    onHover(obj.id);
  }, [onHover, obj.id, isDragging, isInEditMode]);

  const handleMouseLeave = useCallback(() => {
    if (!onHover || isInEditMode) return;
    onHover(null);
  }, [onHover, isInEditMode]);

  const recalcGroupAlign = useCallback(() => {
    if (obj.tipo !== "texto") return;
    if (!obj.__groupAlign || !obj.__groupId) return;
    if (typeof window === "undefined" || typeof onChange !== "function") return;

    const refs = window._elementRefs || {};
    const getObj = window.__getObjById || (() => null);

    let maxW = 0;
    let thisW = 0;

    for (const [id, node] of Object.entries(refs)) {
      const o = getObj(id);
      if (!o || o.tipo !== "texto" || o.__groupId !== obj.__groupId) continue;
      const w = node?.getTextWidth ? Math.ceil(node.getTextWidth()) : 0;
      if (id === obj.id) thisW = w;
      if (w > maxW) maxW = w;
    }
    if (!maxW || !thisW) return;

    const baseX = Number.isFinite(obj.__groupOriginX) ? obj.__groupOriginX : (obj.x || 0);
    let targetX = baseX;
    if (obj.__groupAlign === "center") {
      targetX = baseX + (maxW - thisW) / 2;
    } else if (obj.__groupAlign === "right") {
      targetX = baseX + (maxW - thisW);
    }

    if (Math.abs((obj.x || 0) - targetX) > 0.5) {
      onChange(obj.id, { x: targetX });
    }
  }, [obj.id, obj.x, obj.tipo, obj.__groupAlign, obj.__groupId, obj.__groupOriginX, onChange]);




  useEffect(() => {
    // Recalcular cuando este texto cambia y tras montar sus vecinos
    let r1, r2;
    r1 = requestAnimationFrame(() => {
      r2 = requestAnimationFrame(() => {
        recalcGroupAlign();
      });
    });
    return () => {
      if (r1) cancelAnimationFrame(r1);
      if (r2) cancelAnimationFrame(r2);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recalcGroupAlign, obj.texto, obj.fontFamily, obj.fontSize, obj.fontStyle, obj.fontWeight]);




  useEffect(() => {
    const handler = (e) => {
      const wanted = e?.detail?.groupId;
      if (!obj.__groupId) return;
      if (!wanted || wanted === obj.__groupId) {
        recalcGroupAlign();
      }
    };
    window.addEventListener("alinear-grupo", handler);
    return () => window.removeEventListener("alinear-grupo", handler);
  }, [obj.__groupId, recalcGroupAlign]);




  // 🔒 Nueva versión: solo corrige width en casos especiales (no por align)
  useEffect(() => {
    if (obj.tipo !== "texto") return;
    if (obj.__groupAlign) return;
    if (obj.width || obj.__autoWidth === false) return;

    const node = textNodeRef.current;
    if (!node || typeof onChange !== "function") return;

    // Solo si el texto recién se creó y no tiene width (por ejemplo, texto vacío que ahora tiene contenido)
    if ((obj.texto?.length || 0) > 0 && !obj.width) {
      const w = Math.ceil(node.getTextWidth?.() || 0);
      if (Number.isFinite(w) && w > 0) {
        onChange(obj.id, { width: undefined, __autoWidth: false });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [obj.id, obj.texto]);


  const groupRef = useRef(null);

  useEffect(() => {
    // Cachear cuando cambie el color
    if (groupRef.current && obj.tipo === "icono" && obj.color && obj.color !== "#000000") {
      groupRef.current.cache();
      groupRef.current.getLayer()?.batchDraw();
    }
  }, [obj.color, obj.id]);


  // Convierte "minX minY width height" -> números
  function parseViewBox(vb) {
    if (!vb || typeof vb !== "string") return null;
    const parts = vb.trim().split(/\s+/).map(Number);
    if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return null;
    const [minX, minY, vbWidth, vbHeight] = parts;
    return { minX, minY, vbWidth, vbHeight };
  }


  if (obj.tipo === "forma" && obj.figura === "line") {
    let linePoints = obj.points;
    let pointsFixed = false;

    if (!linePoints || !Array.isArray(linePoints) || linePoints.length < 4) {
      linePoints = [0, 0, LINE_CONSTANTS.DEFAULT_LENGTH, 0]; // Usar constante
      pointsFixed = true;
    } else {
      const puntosValidados = [];
      for (let i = 0; i < 4; i++) {
        const punto = parseFloat(linePoints[i]);
        puntosValidados.push(isNaN(punto) ? 0 : punto);
      }

      if (JSON.stringify(puntosValidados) !== JSON.stringify(linePoints.slice(0, 4))) {
        linePoints = puntosValidados;
        pointsFixed = true;
      } else {
        linePoints = linePoints.slice(0, 4);
      }
    }

    if (pointsFixed && handleChange) {
      setTimeout(() => {
        handleChange(obj.id, {
          points: linePoints,
          fromAutoFix: true
        });
      }, 0);
    }


    return (
      <Line
        {...commonProps}
        points={linePoints}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        stroke={obj.color || LINE_CONSTANTS.DEFAULT_COLOR}
        strokeWidth={obj.strokeWidth || LINE_CONSTANTS.STROKE_WIDTH}
        tension={0}
        lineCap="round"
        lineJoin="round"
        perfectDrawEnabled={false}
        hitStrokeWidth={Math.max(LINE_CONSTANTS.HIT_STROKE_WIDTH, obj.strokeWidth || 2)}
        shadowForStrokeEnabled={false}
        opacity={isSelected ? 1 : 0.95}
        shadowColor={isSelected ? "rgba(119, 61, 190, 0.3)" : "transparent"}
        shadowBlur={isSelected ? 8 : 0}
        shadowOffset={{ x: 0, y: 2 }}
      />
    );
  }


  if (obj.tipo === "texto") {
  const isEditing = window._currentEditingId === obj.id;
  const fontFamily = fontManager.isFontAvailable(obj.fontFamily)
    ? obj.fontFamily
    : "sans-serif";
  const align = (obj.align || "left").toLowerCase();
  const fillColor = obj.colorTexto ?? obj.fill ?? obj.color ?? "#000";
  const baseLineHeight =
    typeof obj.lineHeight === "number" && obj.lineHeight > 0 ? obj.lineHeight : 1.2;
  const lineHeight = baseLineHeight * 0.92;

  // ✅ VALIDACIÓN: Asegurar valores numéricos válidos
  const validX = typeof obj.x === "number" && !isNaN(obj.x) ? obj.x : 0;
  const validY = typeof obj.y === "number" && !isNaN(obj.y) ? obj.y : 0;
  const validFontSize = typeof obj.fontSize === "number" && !isNaN(obj.fontSize) && obj.fontSize > 0 ? obj.fontSize : 24;

  // 🔹 PASO 1: Calcular dimensiones del texto PRIMERO
  const ctx = document.createElement("canvas").getContext("2d");
  ctx.font = `${obj.fontWeight || "normal"} ${obj.fontStyle || "normal"} ${validFontSize}px ${fontFamily}`;
  const lines = (obj.texto || "").split(/\r?\n/);
  const maxLineWidth = Math.max(...lines.map(line => ctx.measureText(line).width), 20);
  const numLines = lines.length;
  const textWidth = Math.ceil(maxLineWidth + 6);
  const textHeight = validFontSize * lineHeight * numLines;

  // 🔹 PASO 2: Ahora sí calcular posición (con textHeight ya definido)
  const position = getCenteredTextPosition({
    rectY: validY,
    rectHeight: textHeight,
    fontSize: validFontSize,
    fontFamily,
    fontWeight: obj.fontWeight || "normal",
    fontStyle: obj.fontStyle || "normal",
  });

  // 🔍 Debug: información completa de posición y centrado
  console.log("📐 [Konva Text Position]", {
    objId: obj.id,
    originalX: obj.x,
    originalY: obj.y,
    validX,
    validY,
    fontFamily,
    fontSize: validFontSize,
    textWidth,
    textHeight: textHeight.toFixed(2),
    textTop: position.textTop.toFixed(2),
    baseline: position.baseline.toFixed(2),
    ascent: position.ascent.toFixed(2),
    descent: position.descent.toFixed(2),
    konvaNodeY: textNodeRef.current?.y() ?? null,
    konvaAbsoluteY: textNodeRef.current?.getAbsolutePosition?.().y ?? null,
  });

  // ⚠️ Warning si hay valores inválidos
  if (obj.x !== validX || obj.y !== validY || obj.fontSize !== validFontSize) {
    console.warn("⚠️ Objeto de texto tiene valores inválidos:", {
      id: obj.id,
      x: obj.x,
      y: obj.y,
      fontSize: obj.fontSize,
    });
  }
  

  return (
    <>
      <Text
        {...commonProps}
        ref={(node) => {
          textNodeRef.current = node;
          registerRef?.(obj.id, node);
        }}
        text={obj.texto}
        x={validX}
        y={position.textTop}
        width={textWidth}
        height={textHeight}
        wrap="word"
        align={align}
        fontSize={validFontSize}
        fontFamily={fontFamily}
        fontWeight={obj.fontWeight || "normal"}
        fontStyle={obj.fontStyle || "normal"}
        lineHeight={lineHeight}
        fill={fillColor}
        opacity={isEditing ? 0 : 1}
        verticalAlign="top"
      />

      {/* 🔴 Rect de depuración */}
      <Rect
        x={validX}
        y={position.textTop} 
        width={textWidth}
        height={textHeight}
        stroke="green"
        strokeWidth={1}
        listening={false}
      />

      {/* 🔵 Línea central del rectángulo */}
      <Line
        points={[
          validX,
          position.textTop + textHeight / 2,
          validX + textWidth,
          position.textTop + textHeight / 2
        ]}
        stroke="blue"
        strokeWidth={1}
        listening={false}
      />

      {/* 🔴 Línea central del texto */}
      <Line
        points={[
          validX,
          position.rectCenter,
          validX + textWidth,
          position.rectCenter
        ]}
        stroke="red"
        strokeWidth={1}
        listening={false}
      />
    </>
  );
}

  if (obj.tipo === "rsvp-boton") {
    const fontFamily = fontManager.isFontAvailable(obj.fontFamily)
      ? obj.fontFamily
      : "sans-serif";

    const width = obj.ancho || 200;
    const height = obj.alto || 50;

    return (
      <>
        {/* 🟣 Botón (fondo) */}
        <Rect
          {...commonProps}
          width={width}
          height={height}
          cornerRadius={8}
          fill={obj.color || "#773dbe"}
          stroke={isSelected || preSeleccionado ? "#773dbe" : undefined}
          strokeWidth={isSelected || preSeleccionado ? 2 : 0}
          onClick={(e) => {
            e.cancelBubble = true;
            onSelect?.(obj.id, obj, e);
          }}
          onDragMove={(e) => {
            const nuevaPos = e.target.position();
            const textoNode = window._elementRefs?.[`${obj.id}-text`];
            if (textoNode) {
              textoNode.x(nuevaPos.x);
              textoNode.y(nuevaPos.y);
              textoNode.getLayer()?.batchDraw();
            }
          }}
        />

        {/* 🔤 Texto encima del botón */}
        <Text
          ref={(node) => {
            if (node && registerRef) {
              registerRef(`${obj.id}-text`, node); // si querés manipular el texto aparte
            }
          }}
          x={obj.x}
          y={obj.y}
          width={width}
          height={height}
          text={obj.texto || "Confirmar asistencia"}
          fontSize={obj.fontSize || 18}
          fontFamily={fontFamily}
          fontStyle={obj.fontStyle || "normal"}
          fontWeight={obj.fontWeight || "bold"}
          fill={obj.colorTexto || "#ffffff"}
          align={obj.align || "center"}
          verticalAlign="middle"
          listening={false}
          opacity={isInEditMode ? 0 : 1}
        />

      </>
    );
  }



  if (obj.tipo === "imagen" && img) {
    return (
      <KonvaImage
        {...commonProps}
        image={img}
        crossOrigin="anonymous"
        width={obj.width || img.width}
        height={obj.height || img.height}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        stroke={isSelected || preSeleccionado ? "#773dbe" : undefined}
        strokeWidth={isSelected || preSeleccionado ? 1 : 0}
      />
    );
  }


  /* ---------------- ICONO SVG (tipo:"icono", formato:"svg") — CON HITBOX FUNCIONAL ---------------- */
  if (obj.tipo === "icono" && obj.formato === "svg") {
    const color = obj.color || "#000000";
    const paths = Array.isArray(obj.paths) ? obj.paths : [];
    const W = Number(obj.width) || 128;
    const H = Number(obj.height) || 128;
    const vb = parseViewBox(obj.viewBox) || { minX: 0, minY: 0, vbWidth: 100, vbHeight: 100 };

    return (
      <Group
        {...commonProps}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        width={W}
        height={H}
      >
        {/* 🔥 HITBOX INVISIBLE - SOLO para eventos de drag/click */}
        <Rect
          x={0}
          y={0}
          width={W}
          height={H}
          fill="rgba(0,0,0,0.001)"  // Casi transparente pero clickeable
          stroke="transparent"      // Sin borde
          listening={true}          // DEBE recibir eventos
          draggable={false}
        />

        {/* Contenido SVG visual - NO maneja eventos */}
        {paths.map((p, i) => (
          <Path
            key={i}
            data={p.d}
            fill={color}
            scaleX={W / vb.vbWidth}
            scaleY={H / vb.vbHeight}
            x={-vb.minX * (W / vb.vbWidth)}
            y={-vb.minY * (H / vb.vbHeight)}
            listening={false}        // NO maneja eventos
            perfectDrawEnabled={false}
          />
        ))}

        {/* Marco de selección visual */}
        {(isSelected || preSeleccionado) && (
          <Rect
            x={0}
            y={0}
            width={W}
            height={H}
            stroke="#773dbe"
            strokeWidth={1}
            fill="transparent"
            listening={false}        // Solo visual
          />
        )}
      </Group>
    );
  }


  /* ---------------- ICONO RASTER (PNG/JPG/WEBP) – sin recolor ---------------- */
  if (obj.tipo === "icono" && obj.formato === "png") {
    const [img] = useImage(obj.url, "anonymous");

    return (
      <KonvaImage
        {...commonProps}
        image={img}
        crossOrigin="anonymous"
        width={obj.width || (img?.width ?? 120)}
        height={obj.height || (img?.height ?? 120)}
        listening={true}

        // UX cursor (si ya lo manejás en commonProps, podés omitir estos dos)
        onMouseEnter={(e) => {
          const stage = e.currentTarget.getStage();
          if (stage) stage.container().style.cursor = "grab";
          handleMouseEnter?.(e);
        }}
        onMouseLeave={(e) => {
          const stage = e.currentTarget.getStage();
          if (stage) stage.container().style.cursor = "default";
          handleMouseLeave?.(e);
        }}

        // Selección por click/tap
        onClick={(e) => { e.cancelBubble = true; if (obj) onSelect?.(obj, e); }}
        onTap={(e) => { e.cancelBubble = true; if (obj) onSelect?.(obj, e); }}

        // ✅ Persistimos SIEMPRE la posición del contenedor top-level
        onDragEnd={(e) => {
          const node = e.currentTarget;
          const patch = {
            id: obj.id,
            tipo: obj.tipo,
            formato: obj.formato,
            x: node.x(),
            y: node.y(),
            isDragPreview: false,
            isFinal: true,
          };
          const meta = { isDragPreview: false, isFinal: true, source: "dragEnd" };
          onChange?.(patch, meta);

          // limpiar cursor
          const stage = node.getStage();
          if (stage) stage.container().style.cursor = "default";
        }}

        onTransformEnd={(e) => {
          const node = e.currentTarget;
          const patch = {
            id: obj.id,
            tipo: obj.tipo,
            formato: obj.formato,
            x: node.x(),
            y: node.y(),
            rotation: node.rotation() || 0,
            scaleX: typeof node.scaleX === "function" ? node.scaleX() : (node.scaleX ?? 1),
            scaleY: typeof node.scaleY === "function" ? node.scaleY() : (node.scaleY ?? 1),
            isDragPreview: false,
            isFinal: true,
          };
          const meta = { isDragPreview: false, isFinal: true, source: "transformEnd" };
          onChange?.(patch, meta);
        }}
      />
    );
  }



  /* ---------------- LEGACY: ICONO SVG (tipo: "icono-svg" con obj.d) ---------------- */
  if (obj.tipo === "icono-svg") {
    const W = Number(obj.width) || 128;
    const H = Number(obj.height) || 128;

    const vb = parseViewBox(obj.viewBox) || { minX: 0, minY: 0, vbWidth: 100, vbHeight: 100 };
    const scaleX = vb.vbWidth ? W / vb.vbWidth : 1;
    const scaleY = vb.vbHeight ? H / vb.vbHeight : 1;

    return (
      <Group
        {...commonProps}
        draggable={true}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onClick={(e) => { e.cancelBubble = true; if (!obj) return; onSelect?.(obj, e); }}
        onTap={(e) => { e.cancelBubble = true; if (!obj) return; onSelect?.(obj, e); }}
        onDragEnd={(e) => {
          const patch = {
            id: obj.id,
            tipo: obj.tipo,
            x: e.target.x(),
            y: e.target.y(),
            isDragPreview: false,
            isFinal: true,
          };
          const meta = { isDragPreview: false, isFinal: true, source: "dragEnd" };
          onChange?.(patch, meta);
        }}
        onTransformEnd={(e) => {
          const node = e.target;
          const patch = {
            id: obj.id,
            tipo: obj.tipo,
            x: node.x(),
            y: node.y(),
            rotation: node.rotation() || 0,
            scaleX: typeof node.scaleX === "function" ? node.scaleX() : (node.scaleX ?? 1),
            scaleY: typeof node.scaleY === "function" ? node.scaleY() : (node.scaleY ?? 1),
            isDragPreview: false,
            isFinal: true,
          };
          const meta = { isDragPreview: false, isFinal: true, source: "transformEnd" };
          onChange?.(patch, meta);
        }}
      >
        <Rect
          x={0}
          y={0}
          width={W}
          height={H}
          fill="rgba(0,0,0,0.001)"
          stroke={isSelected || preSeleccionado ? "#773dbe" : undefined}
          strokeWidth={isSelected || preSeleccionado ? 1 : 0}
          listening={true}
        />
        <Group x={0} y={0} scaleX={scaleX} scaleY={scaleY}>
          <Group x={-vb.minX} y={-vb.minY}>
            <Path
              data={obj.d}
              fill={obj.color || "#000"}
              stroke={obj.color || "#000"}
              strokeWidth={1}
              perfectDrawEnabled
              listening={false}
            />
          </Group>
        </Group>
      </Group>
    );
  }





  if (obj.tipo === "forma") {
    const propsForma = {
      ...commonProps,
      fill: obj.color || "#000000",
    };

    switch (obj.figura) {
      case "rect":
        return (
          <>
            {/* 🟪 Forma */}
            <Rect
              {...propsForma}
              width={Math.abs(obj.width || 100)}
              height={Math.abs(obj.height || 100)}
              cornerRadius={obj.cornerRadius || 0}
              stroke={isSelected || preSeleccionado ? "#773dbe" : undefined}
              strokeWidth={isSelected || preSeleccionado ? 1 : 0}
            />

            {/* ✏️ Texto encima de la forma */}
            {obj.texto && (
              <Text
                ref={(node) => {
                  if (node && registerRef) {
                    registerRef(`${obj.id}-text`, node); // clave única para el texto
                  }
                }}
                x={obj.x}
                y={obj.y}
                width={obj.width}
                height={obj.height}
                text={obj.texto}
                fontSize={obj.fontSize || 24}
                fontFamily={obj.fontFamily || "sans-serif"}
                fontWeight={obj.fontWeight || "normal"}
                fontStyle={obj.fontStyle || "normal"}
                fill={obj.colorTexto || "#000000"}
                align={obj.align || "center"}
                verticalAlign="middle"
                listening={false}
                opacity={isInEditMode ? 0 : 1}
              />
            )}

          </>
        );


      case "circle":
        return (
          <Circle
            {...propsForma}
            radius={obj.radius || 50}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            stroke={isSelected || preSeleccionado ? "#773dbe" : undefined}
            strokeWidth={isSelected || preSeleccionado ? 1 : 0}
          />
        );

      case "triangle":
        return (
          <RegularPolygon
            {...propsForma}
            sides={3}
            radius={obj.radius || 60}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            stroke={isSelected || preSeleccionado ? "#773dbe" : undefined}
            strokeWidth={isSelected || preSeleccionado ? 1 : 0}
          />
        );


      default:
        return null;
    }
  }

  return null;
}