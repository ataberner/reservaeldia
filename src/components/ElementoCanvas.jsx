// ElementoCanvas.jsx - REEMPLAZAR TODO EL ARCHIVO
import { Text, Image as KonvaImage, Rect, Circle, Line, RegularPolygon, Path, Group } from "react-konva";
import useImage from "use-image";
import { useState, useRef, useMemo, useCallback, useEffect } from "react";
import { LINE_CONSTANTS } from '@/models/lineConstants';
import { fontManager } from '../utils/fontManager';
import { previewDragGrupal, startDragGrupalLider, endDragGrupal } from "@/drag/dragGrupal";
import { startDragIndividual, previewDragIndividual, endDragIndividual } from "@/drag/dragIndividual";


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

      // 🔥 HABILITAR draggable SIEMPRE
      e.target.draggable(true);
    },

    onMouseUp: (e) => {
      if (e.target.draggable && !hasDragged.current) {
        e.target.draggable(false);
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
      console.log("🏁 [ELEMENTO CANVAS] onDragEnd:", {
        elementoId: obj.id,
        grupoLider: window._grupoLider,
        hasDragged: hasDragged.current,
        tipoElemento: obj.tipo
      });
      window._isDragging = false;
      setIsDragging(false);

      const node = e.target;

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




  useEffect(() => {
    if (obj.tipo !== "texto") return;
    if (obj.__groupAlign) return; // 👉 si alineamos por grupo, no seteamos width
    const align = (obj.align || "left").toLowerCase();
    if (align === "left") return;
    if (obj.width || obj.__autoWidth === false) return;

    const node = textNodeRef.current;
    if (!node || typeof onChange !== "function") return;

    requestAnimationFrame(() => {
      const w = Math.ceil(node.getTextWidth());
      if (Number.isFinite(w) && w > 0) {
        onChange(obj.id, { width: w, __autoWidth: false });
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [obj.id, obj.texto, obj.fontFamily, obj.fontSize, obj.fontStyle, obj.fontWeight, obj.align]);



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
    // Verificar si la fuente está cargada
    const fontFamily = fontManager.isFontAvailable(obj.fontFamily)
      ? obj.fontFamily
      : "sans-serif";

    // 🔥 NUEVO: Detectar si está en modo edición
    const isEditing = window._currentEditingId === obj.id;

    const align = (obj.align || "left").toLowerCase();        // "left" | "center" | "right" | "justify"
    const fillColor = obj.colorTexto ?? obj.fill ?? obj.color ?? "#000";  // 👈 prioridad a colorTexto
    const lineHeight =
      (typeof obj.lineHeight === "number" && obj.lineHeight > 0) ? obj.lineHeight : 1.2;
    // 🔒 Mantener el comportamiento anterior: solo usar width si el objeto ya lo tiene
    const width = obj.width || undefined;


    return (
      <Text
        {...commonProps}
        ref={(node) => {
          textNodeRef.current = node;
          registerRef?.(obj.id, node);
        }}
        text={obj.texto}
        fontSize={obj.fontSize || 24}
        fontFamily={fontFamily}
        fontWeight={obj.fontWeight || "normal"}
        fontStyle={obj.fontStyle || "normal"}
        align={align}
        verticalAlign="top"
        wrap="word"
        width={width}
        textDecoration={obj.textDecoration || "none"}
        fill={fillColor}
        lineHeight={lineHeight}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        opacity={isInEditMode ? 0 : 1}
      />

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


  if (obj.tipo === "rsvp-boton") {
    return (
      <div
        key={obj.id}
        data-id={obj.id}
        style={{
          position: "absolute",
          left: obj.x,
          top: obj.y,
          width: obj.ancho,
          height: obj.alto,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: obj.color ?? "#773dbe",
          color: obj.colorTexto ?? "#fff",
          borderRadius: 10,
          fontSize: obj.fontSize ?? 16,
          fontFamily: obj.fontFamily ?? "Inter, system-ui, sans-serif",
          userSelect: "none",
          pointerEvents: "none",
        }}
      >
        {obj.texto ?? "Confirmar asistencia"}
      </div>
    );
  }


  if (obj.tipo === "icono-svg") {
    return (
      <Path
        {...commonProps}
        data={obj.d}
        fill={obj.color || "#000"}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        stroke={isSelected || preSeleccionado ? "#773dbe" : undefined}
        strokeWidth={isSelected || preSeleccionado ? 1 : 0}
      />
    );
  }

  if (obj.tipo === "icono" && img) {
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