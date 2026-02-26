// ElementoCanvas.jsx - REEMPLAZAR TODO EL ARCHIVO
import { Text, Image as KonvaImage, Rect, Circle, Line, RegularPolygon, Path, Group } from "react-konva";
import useImage from "use-image";
import { useState, useRef, useMemo, useCallback, useEffect } from "react";
import { LINE_CONSTANTS } from '@/models/lineConstants';
import { previewDragGrupal, startDragGrupalLider, endDragGrupal } from "@/drag/dragGrupal";
import { startDragIndividual, previewDragIndividual, endDragIndividual } from "@/drag/dragIndividual";
import { getCenteredTextPosition } from "@/utils/getTextMetrics";
import { resolveRsvpButtonVisual } from "@/domain/rsvp/buttonStyles";
import { resolveKonvaFill } from "@/domain/colors/presets";

function normalizeFontSize(value, fallback = 24) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function isBoldFontWeight(weight) {
  const normalized = String(weight || "normal").toLowerCase();
  return (
    normalized === "bold" ||
    normalized === "bolder" ||
    ["500", "600", "700", "800", "900"].includes(normalized)
  );
}

function resolveKonvaFontStyle(fontStyle, fontWeight) {
  const style = String(fontStyle || "normal").toLowerCase();
  const isItalic = style.includes("italic") || style.includes("oblique");
  const isBold = style.includes("bold") || isBoldFontWeight(fontWeight);

  if (isBold && isItalic) return "bold italic";
  if (isBold) return "bold";
  if (isItalic) return "italic";
  return "normal";
}





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
  selectionCount = 0,
  onDragMovePersonalizado,
  onDragStartPersonalizado,
  onDragEndPersonalizado,
  dragStartPos,
  hasDragged,
  onStartTextEdit,
  editingMode = false,
  inlineOverlayMountedId = null,
  inlineVisibilityMode = "reactive"
}) {
  const [img] = useImage(obj.src || null, "anonymous");
  const [measuredTextWidth, setMeasuredTextWidth] = useState(null);

  const textNodeRef = useRef(null);
  const baseTextLayoutRef = useRef(null); // guarda el centro/baseline inicial


  // Ã°Å¸â€Â¥ PREVENIR onChange RECURSIVO PARA AUTOFIX
  const handleChange = useCallback((id, newData) => {
    if (newData.fromAutoFix || !onChange) return;
    onChange(id, newData);
  }, [onChange]);

  const handleRef = useCallback((node) => {
    if (registerRef) {
      registerRef(obj.id, node || null);
      // Ã¢ÂÅ’ NO despachar "element-ref-registrado" acÃƒÂ¡
      // CanvasEditor.registerRef ya lo hace.
    }
  }, [obj.id, registerRef]);



  // Ã¢Å“â€¦ Click con estado fresco (evita stale closures del useMemo)
  const handleClick = useCallback(
    (e) => {
      e.cancelBubble = true;

      if (!hasDragged.current) {
        // Ã°Å¸Â§Â  Texto normal
        if (obj.tipo === "texto") {
          if (isSelected) {
            onStartTextEdit?.(obj.id, obj.texto);
          } else {
            onSelect(obj.id, obj, e);
          }
        }

        // Ã°Å¸â€ â€¢ Forma con texto (rect)
        else if (obj.tipo === "forma" && obj.figura === "rect") {
          if (isSelected) {
            onStartTextEdit?.(obj.id, obj.texto || "");
          } else {
            onSelect(obj.id, obj, e);
          }
        }

        // Ã°Å¸Â§Â± Para todo lo demÃƒÂ¡s

        // Ã°Å¸Â§Â± Para todo lo demÃƒÂ¡s
        else {
          onSelect(obj.id, obj, e);
        }
      }
    },
    [obj, isSelected, onSelect, onStartTextEdit]
  );



  // Ã°Å¸â€Â¥ MEMOIZAR PROPIEDADES COMUNES
  const commonProps = useMemo(() => ({
    x: obj.x ?? 0,
    y: obj.y ?? 0,
    rotation: obj.rotation || 0,
    scaleX: obj.scaleX || 1,
    scaleY: obj.scaleY || 1,
    draggable: !editingMode,
    listening: !isInEditMode,

    onMouseDown: (e) => {
      e.cancelBubble = true;
      hasDragged.current = false;

      e.currentTarget?.draggable(true);
    },

    onTouchStart: (e) => {
      e.cancelBubble = true;
      hasDragged.current = false;

      e.currentTarget?.draggable(true);
    },

    onPointerDown: (e) => {
      e.cancelBubble = true;
      hasDragged.current = false;

      e.currentTarget?.draggable(true);
    },

    onMouseUp: (e) => {
      if (e.currentTarget?.draggable && !hasDragged.current) {
        e.currentTarget.draggable(false);
      }
    },

    onTouchEnd: (e) => {
      if (e.currentTarget?.draggable && !hasDragged.current) {
        e.currentTarget.draggable(false);
      }
    },

    onPointerUp: (e) => {
      if (e.currentTarget?.draggable && !hasDragged.current) {
        e.currentTarget.draggable(false);
      }
    },

    onClick: handleClick,
    onTap: handleClick,

    onDragStart: (e) => {

      onDragStartPersonalizado?.(obj.id, e);

      window._dragCount = 0;
      window._lastMouse = null;
      window._lastElement = null;

      hasDragged.current = true;
      window._isDragging = true;


      // Ã°Å¸â€Â¥ Intentar drag grupal
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

      // Ã°Å¸â€Â¥ DRAG GRUPAL - SOLO EL LÃƒÂDER PROCESA
      if (window._grupoLider && obj.id === window._grupoLider) {
        previewDragGrupal(e, obj, onChange);
        onDragMovePersonalizado?.({ x: e.target.x(), y: e.target.y() }, obj.id);

        return;
      }

      // Ã°Å¸â€Â¥ SI ES SEGUIDOR DEL GRUPO, NO PROCESAR
      if (window._grupoLider) {
        const elementosSeleccionados = window._elementosSeleccionados || [];
        if (elementosSeleccionados.includes(obj.id) && obj.id !== window._grupoLider) {
          return;
        }
      }

      // Ã°Å¸â€â€ž DRAG INDIVIDUAL - Solo si no hay drag grupal activo
      if (!window._grupoLider) {
        previewDragIndividual(e, obj, onDragMovePersonalizado);
      }
    },




    onDragEnd: (e) => {

      window._isDragging = false;

      const node = e.currentTarget;

      // Ã°Å¸â€Â¥ Intentar drag grupal
      const fueGrupal = endDragGrupal(e, obj, onChange, hasDragged);
      if (fueGrupal) {
        onDragEndPersonalizado?.();
        return;
      }

      // Ã°Å¸â€â€ž DRAG INDIVIDUAL (no cambiÃƒÂ³)
      endDragIndividual(obj, node, onChange, onDragEndPersonalizado, hasDragged);


    },


  }), [
    obj,
    editingMode,
    isInEditMode,
    handleClick,
    onDragMovePersonalizado,
    onDragStartPersonalizado,
    onDragEndPersonalizado,
    dragStartPos,
    hasDragged,
    onChange,
  ]);

  // Ã°Å¸â€Â¥ MEMOIZAR HANDLERS HOVER
  const handleMouseEnter = useCallback(() => {
    if (!onHover || window._isDragging || isInEditMode) return;
    onHover(obj.id);
  }, [onHover, obj.id, isInEditMode]);


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
    if (!obj || obj.tipo !== "texto") return;
    if (obj.__groupAlign) return;

    const isAutoWidth = !obj.width && obj.__autoWidth !== false;
    if (!isAutoWidth) return;

    let raf1 = null;
    let raf2 = null;

    raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        const node = textNodeRef.current;
        if (!node || typeof node.getTextWidth !== "function") return;

        const wReal = Math.ceil(node.getTextWidth() || 0);
        if (wReal > 0) setMeasuredTextWidth(wReal);
      });
    });

    return () => {
      if (raf1) cancelAnimationFrame(raf1);
      if (raf2) cancelAnimationFrame(raf2);
    };
  }, [
    obj?.id,
    obj?.texto,
    obj?.fontFamily,
    obj?.fontSize,
    obj?.fontStyle,
    obj?.fontWeight,
    obj?.lineHeight,
    obj?.width,
    obj?.__autoWidth,
    obj?.__groupAlign,
  ]);



  useEffect(() => {
    setMeasuredTextWidth(null);
    // tambiÃƒÂ©n conviene resetear el layout base cuando cambia de texto
    if (obj?.tipo === "texto") baseTextLayoutRef.current = null;
  }, [obj?.id]);



  const groupRef = useRef(null);

  useEffect(() => {
    // Cachear cuando cambie el color
    if (groupRef.current && obj.tipo === "icono" && obj.color && obj.color !== "#000000") {
      groupRef.current.cache();
      groupRef.current.getLayer()?.batchDraw();
    }
  }, [obj.color, obj.id]);


  // Convierte "minX minY width height" -> nÃƒÂºmeros
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
        ref={handleRef}
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
    const visibilityMode =
      inlineVisibilityMode === "window" ? "window" : "reactive";
    const isEditingByWindow = window._currentEditingId === obj.id;
    const isEditingByReactive = editingId === obj.id;
    const overlayDomPresentLoose = (() => {
      if (typeof document === "undefined") return false;
      const safeId = String(obj.id).replace(/"/g, '\\"');
      return Boolean(document.querySelector(`[data-inline-editor-id="${safeId}"]`));
    })();
    const overlayDomPresent =
      inlineOverlayMountedId === obj.id && overlayDomPresentLoose;
    const isEditingByOverlay = overlayDomPresent;
    const isEditing =
      visibilityMode === "reactive"
        ? (isEditingByReactive || isEditingByOverlay)
        : (isEditingByWindow || isEditingByReactive || isEditingByOverlay);
    const fontFamily = obj.fontFamily || "sans-serif";
    const align = (obj.align || "left").toLowerCase();
    const fillColor = obj.colorTexto ?? obj.fill ?? obj.color ?? "#000";
    const baseLineHeight =
      typeof obj.lineHeight === "number" && obj.lineHeight > 0 ? obj.lineHeight : 1.2;
    const lineHeight = baseLineHeight * 0.92;


    // Ã¢Å“â€¦ Evita bbox sobrado a la derecha por espacios/tabs invisibles al final de lÃƒÂ­nea
    const rawText = String(obj.texto ?? "");
    const safeText = rawText.replace(/[ \t]+$/gm, "");


    // Ã¢Å“â€¦ VALIDACIÃƒâ€œN: Asegurar valores numÃƒÂ©ricos vÃƒÂ¡lidos
    const validX = typeof obj.x === "number" && !isNaN(obj.x) ? obj.x : 0;
    const validY = typeof obj.y === "number" && !isNaN(obj.y) ? obj.y : 0;
    const validFontSize = normalizeFontSize(obj.fontSize, 24);
    const textDecoration =
      typeof obj.textDecoration === "string" && obj.textDecoration.trim().length > 0
        ? obj.textDecoration
        : "none";

    // Ã°Å¸â€Â¹ PASO 1: Calcular dimensiones del texto PRIMERO
    const ctx = document.createElement("canvas").getContext("2d");
    const style = obj.fontStyle || "normal";
    const weight = obj.fontWeight || "normal";
    const konvaFontStyle = resolveKonvaFontStyle(style, weight);

    // Ã¢Å“â€¦ si la fuente tiene espacios, envolverla en comillas para que canvas no caiga a fallback
    const fontForCanvas = fontFamily.includes(",")
      ? fontFamily
      : (/\s/.test(fontFamily) ? `"${fontFamily}"` : fontFamily);

    // Ã¢Å“â€¦ orden correcto: style -> weight -> size -> family
    ctx.font = `${style} ${weight} ${validFontSize}px ${fontForCanvas}`;

    const lines = safeText.split(/\r?\n/);
    const maxLineWidth = Math.max(...lines.map(line => ctx.measureText(line).width), 20);
    const numLines = lines.length;
    const textWidth = Math.ceil(maxLineWidth);
    const textHeight = validFontSize * lineHeight * numLines;

    // Ã°Å¸â€Â¹ PASO 2: Calcular posiciÃƒÂ³n solo una vez y congelar el centro
    let positionRaw = getCenteredTextPosition({
      rectY: validY,
      rectHeight: textHeight,
      fontSize: validFontSize,
      fontFamily,
      fontWeight: obj.fontWeight || "normal",
      fontStyle: obj.fontStyle || "normal",
    });

    // Inicializar layout base solo la PRIMERA vez
    if (!baseTextLayoutRef.current) {
      baseTextLayoutRef.current = {
        // centro vertical "ideal" que queremos conservar
        rectCenter: positionRaw.rectCenter,
        // offset desde el centro al baseline (depende solo de la fuente/tamaÃƒÂ±o)
        baselineToCenter: positionRaw.baseline - positionRaw.rectCenter,
        ascent: positionRaw.ascent,
        descent: positionRaw.descent,
      };
    }

    const base = baseTextLayoutRef.current;
    const rectCenterFixed = base.rectCenter;
    const baselineY = rectCenterFixed + base.baselineToCenter;
    const textTopFixed = baselineY - base.ascent;

    const position = {
      baseline: baselineY,
      textTop: textTopFixed,
      ascent: base.ascent,
      descent: base.descent,
      rectCenter: rectCenterFixed,
    };

    // Ã°Å¸â€Â Debug: informaciÃƒÂ³n completa de posiciÃƒÂ³n y centrado


    // Ã¢Å¡Â Ã¯Â¸Â Warning si hay valores invÃƒÂ¡lidos
    if (obj.x !== validX || obj.y !== validY || obj.fontSize !== validFontSize) {
      console.warn("Ã¢Å¡Â Ã¯Â¸Â Objeto de texto tiene valores invÃƒÂ¡lidos:", {
        id: obj.id,
        x: obj.x,
        y: obj.y,
        fontSize: obj.fontSize,
      });
    }

        const ANCHO_CANVAS = 800;
    const availableWidth = Math.max(1, ANCHO_CANVAS - validX);

    // ancho real del texto (mÃƒÂ¡xima lÃƒÂ­nea, segÃƒÂºn tu cÃƒÂ¡lculo actual)
    const realTextWidth = Math.max(1, textWidth);

    // Ã¢Å“â€¦ Si entra, NO usamos width (bounds ajustado)
    // Ã¢Å“â€¦ Si no entra, usamos width=available y wrap por caracteres para cortar en el borde
    const shouldWrapToCanvasEdge = realTextWidth > availableWidth;

    const wrapToUse = shouldWrapToCanvasEdge ? "char" : "none";
    const widthToUse = shouldWrapToCanvasEdge ? availableWidth : undefined;
    const inlineCaretOnlyMode = true;
    const appliedOpacity =
      isEditing && !inlineCaretOnlyMode ? 0 : 1;

    return (
      <>
        <Text
          {...commonProps}
          ref={(node) => {
            textNodeRef.current = node;
            handleRef(node); // registra + dispara "element-ref-registrado"
          }}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
          text={safeText}
          x={validX}
          y={obj.y}
          wrap={wrapToUse}
          width={widthToUse}
          align={align}
          fontSize={validFontSize}
          fontFamily={fontFamily}
          fontWeight={obj.fontWeight || "normal"}
          fontStyle={konvaFontStyle}
          textDecoration={textDecoration}
          lineHeight={lineHeight}
          fill={fillColor}
          opacity={appliedOpacity}
          verticalAlign="top"
        />


      </>
    );
  }

  if (obj.tipo === "rsvp-boton") {
    const fontFamily = obj.fontFamily || "sans-serif";
    const rsvpVisual = resolveRsvpButtonVisual(obj);

    const width = Number.isFinite(obj.width) ? obj.width : (obj.ancho || 200);
    const height = Number.isFinite(obj.height) ? obj.height : (obj.alto || 50);

    const syncRsvpTextPosition = (target) => {
      const nuevaPos = target?.position?.();
      if (!nuevaPos) return;
      const textoNode = window._elementRefs?.[`${obj.id}-text`];
      if (!textoNode) return;
      textoNode.x(nuevaPos.x);
      textoNode.y(nuevaPos.y);
      textoNode.getLayer()?.batchDraw();
    };

    return (
      <>
        {/* ðŸŸ£ BotÃ³n (fondo) */}
        <Rect
          {...commonProps}
          ref={handleRef}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
          width={width}
          height={height}
          cornerRadius={Number.isFinite(obj.cornerRadius) ? obj.cornerRadius : 8}
          fill={rsvpVisual.fillColor}
          fillPriority={rsvpVisual.hasGradient ? "linear-gradient" : "color"}
          fillLinearGradientStartPoint={rsvpVisual.hasGradient ? { x: 0, y: 0 } : undefined}
          fillLinearGradientEndPoint={rsvpVisual.hasGradient ? { x: width, y: height } : undefined}
          fillLinearGradientColorStops={
            rsvpVisual.hasGradient
              ? [0, rsvpVisual.gradientFrom, 1, rsvpVisual.gradientTo]
              : undefined
          }
          stroke={isSelected || preSeleccionado ? "#773dbe" : rsvpVisual.strokeColor}
          strokeWidth={isSelected || preSeleccionado ? 2 : rsvpVisual.strokeWidth}
          shadowColor={rsvpVisual.shadowColor}
          shadowBlur={rsvpVisual.shadowBlur}
          shadowOffset={{ x: 0, y: rsvpVisual.shadowOffsetY }}
          onDragMove={(e) => {
            commonProps.onDragMove?.(e);
            syncRsvpTextPosition(e.target);
          }}
          onDragEnd={(e) => {
            commonProps.onDragEnd?.(e);
            syncRsvpTextPosition(e.target);
          }}
          onDblClick={(e) => {
            e.cancelBubble = true;
            onStartTextEdit?.(obj.id, obj.texto || "Confirmar asistencia");
          }}
          onDblTap={(e) => {
            e.cancelBubble = true;
            onStartTextEdit?.(obj.id, obj.texto || "Confirmar asistencia");
          }}
        />

        {/* ðŸ”¤ Texto encima del botÃ³n */}
        <Text
          ref={(node) => {
            if (registerRef) {
              registerRef(`${obj.id}-text`, node || null); // si querÃ©s manipular el texto aparte
            }
          }}
          x={obj.x}
          y={obj.y}
          width={width}
          height={height}
          text={obj.texto || "Confirmar asistencia"}
          fontSize={normalizeFontSize(obj.fontSize, 18)}
          fontFamily={fontFamily}
          fontStyle={resolveKonvaFontStyle(obj.fontStyle || "normal", obj.fontWeight || "bold")}
          fontWeight={obj.fontWeight || "bold"}
          textDecoration={obj.textDecoration || "none"}
          fill={rsvpVisual.textColor}
          align={obj.align || "center"}
          verticalAlign="middle"
          listening={false}
          opacity={1}
        />

      </>
    );
  }



  if (obj.tipo === "imagen" && img) {
    return (
      <KonvaImage
        {...commonProps}
        ref={handleRef}
        id={obj.id}
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


  /* ---------------- ICONO SVG (tipo:"icono", formato:"svg") Ã¢â‚¬â€ CON HITBOX FUNCIONAL ---------------- */
  if (obj.tipo === "icono" && obj.formato === "svg") {
    const color = obj.color || "#000000";
    const paths = Array.isArray(obj.paths) ? obj.paths : [];
    const W = Number(obj.width) || 128;
    const H = Number(obj.height) || 128;
    const vb = parseViewBox(obj.viewBox) || { minX: 0, minY: 0, vbWidth: 100, vbHeight: 100 };
    const showIconSelectionFrame = (isSelected || preSeleccionado) && selectionCount <= 1;

    return (
      <Group
        {...commonProps}
        ref={handleRef}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        width={W}
        height={H}
      >
        {/* Ã°Å¸â€Â¥ HITBOX INVISIBLE - SOLO para eventos de drag/click */}
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

        {/* Marco de selecciÃƒÂ³n visual */}
        {showIconSelectionFrame && (
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


  /* ---------------- ICONO RASTER (PNG/JPG/WEBP) Ã¢â‚¬â€œ sin recolor ---------------- */
  if (obj.tipo === "icono" && (obj.formato === "png" || obj.formato === "jpg" || obj.formato === "webp")) {
    const [img] = useImage(obj.url, "anonymous");

    return (
      <KonvaImage
        {...commonProps}
        ref={handleRef}
        image={img}
        crossOrigin="anonymous"
        width={obj.width || (img?.width ?? 120)}
        height={obj.height || (img?.height ?? 120)}
        listening={true}

        // UX cursor (sin romper tu hover)
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

        // Ã¢Å“â€¦ CLAVE: NO pisar el onClick/onTap ni el onDragEnd "real" del sistema
        // Si querÃƒÂ©s mantener un comportamiento extra en click, hacelo sin cambiar la firma:
        onClick={(e) => {
          // delega al commonProps.onClick (selecciÃƒÂ³n consistente)
          commonProps.onClick?.(e);
        }}
        onTap={(e) => {
          // en Konva, tap suele mapear a click; si querÃƒÂ©s, delegalo igual
          commonProps.onClick?.(e);
        }}

        // Ã¢Å“â€¦ CLAVE: delegar a commonProps.onDragEnd para que:
        // - se limpien guÃƒÂ­as (onDragEndPersonalizado)
        // - se haga finalizoDrag + ABSÃ¢â€ â€™REL
        onDragEnd={(e) => {
          commonProps.onDragEnd?.(e);

          // limpieza de cursor (extra)
          const stage = e.currentTarget.getStage();
          if (stage) stage.container().style.cursor = "default";
        }}
      />
    );
  }




  /* ---------------- LEGACY: ICONO SVG (tipo: "icono-svg" con obj.d) ---------------- */
  if (obj.tipo === "icono-svg") {
    const W = Number(obj.width) || 128;
    const H = Number(obj.height) || 128;
    const showLegacyIconSelectionFrame = (isSelected || preSeleccionado) && selectionCount <= 1;

    const vb = parseViewBox(obj.viewBox) || { minX: 0, minY: 0, vbWidth: 100, vbHeight: 100 };
    const scaleX = vb.vbWidth ? W / vb.vbWidth : 1;
    const scaleY = vb.vbHeight ? H / vb.vbHeight : 1;

    return (
      <Group
        {...commonProps}
        ref={handleRef}
        draggable={true}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onClick={(e) => commonProps.onClick?.(e)}
        onTap={(e) => commonProps.onTap?.(e)}
        onDragEnd={(e) => {
          commonProps.onDragEnd?.(e);
        }}
        onTransformEnd={(e) => {
          const node = e.target;
          const scaleXNode =
            typeof node.scaleX === "function" ? node.scaleX() : (node.scaleX ?? 1);
          const scaleYNode =
            typeof node.scaleY === "function" ? node.scaleY() : (node.scaleY ?? 1);
          const patch = {
            x: node.x(),
            y: node.y(),
            rotation: node.rotation() || 0,
            width: Math.max(1, W * Math.abs(scaleXNode || 1)),
            height: Math.max(1, H * Math.abs(scaleYNode || 1)),
            scaleX: 1,
            scaleY: 1,
            isFinal: true,
          };
          onChange?.(obj.id, patch);
        }}
      >
        <Rect
          x={0}
          y={0}
          width={W}
          height={H}
          fill="rgba(0,0,0,0.001)"
          stroke={showLegacyIconSelectionFrame ? "#773dbe" : undefined}
          strokeWidth={showLegacyIconSelectionFrame ? 1 : 0}
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
    switch (obj.figura) {
      case "rect": {
        // Opcional: normalizamos width/height para usar en ambos nodos
        const width = Math.abs(obj.width || 100);
        const height = Math.abs(obj.height || 100);
        const rectFill = resolveKonvaFill(obj.color, width, height, "#000000");

        return (
          <>
            {/* Ã°Å¸Å¸Âª Forma */}
            <Rect
              {...commonProps}
              ref={handleRef}
              onMouseEnter={handleMouseEnter}
              onMouseLeave={handleMouseLeave}
              width={width}
              height={height}
              fill={rectFill.fillColor}
              fillPriority={rectFill.hasGradient ? "linear-gradient" : "color"}
              fillLinearGradientStartPoint={rectFill.hasGradient ? rectFill.startPoint : undefined}
              fillLinearGradientEndPoint={rectFill.hasGradient ? rectFill.endPoint : undefined}
              fillLinearGradientColorStops={
                rectFill.hasGradient
                  ? [0, rectFill.gradientFrom, 1, rectFill.gradientTo]
                  : undefined
              }
              cornerRadius={obj.cornerRadius || 0}
              stroke={isSelected || preSeleccionado ? "#773dbe" : undefined}
              strokeWidth={isSelected || preSeleccionado ? 1 : 0}
              // Ã°Å¸â€“Â±Ã¯Â¸Â Doble click para entrar en ediciÃƒÂ³n inline
              onDblClick={(e) => {
                e.cancelBubble = true;
                if (onStartTextEdit) {
                  onStartTextEdit(obj.id, obj.texto || "");
                }
              }}
              onDblTap={(e) => {
                e.cancelBubble = true;
                if (onStartTextEdit) {
                  onStartTextEdit(obj.id, obj.texto || "");
                }
              }}
              // Ã°Å¸Å¡Å¡ Sincronizar el texto mientras se arrastra la forma
              onDragMove={(e) => {
                // Mantener cualquier lÃƒÂ³gica de drag original que venga de commonProps
                if (typeof commonProps.onDragMove === "function") {
                  commonProps.onDragMove(e);
                }

                const { x, y } = e.target.position();
                const stage = e.target.getStage();
                const textoNode = stage?.findOne(`#${obj.id}-text`);

                if (textoNode) {
                  textoNode.x(x);
                  textoNode.y(y);
                  textoNode.getLayer()?.batchDraw();
                }
              }}
              onDragEnd={(e) => {
                // Mantener lÃƒÂ³gica original de dragEnd (guardar posiciÃƒÂ³n, drag grupal, etc.)
                if (typeof commonProps.onDragEnd === "function") {
                  commonProps.onDragEnd(e);
                }

                const { x, y } = e.target.position();
                const stage = e.target.getStage();
                const textoNode = stage?.findOne(`#${obj.id}-text`);

                if (textoNode) {
                  textoNode.x(x);
                  textoNode.y(y);
                  textoNode.getLayer()?.batchDraw();
                }
              }}
            />

            {/* Ã¢Å“ÂÃ¯Â¸Â Texto encima de la forma */}
            {obj.texto && (
              <Text
                id={`${obj.id}-text`}          // Ã°Å¸â€˜Ë† id para poder encontrarlo desde el Rect
                ref={(node) => {
                  if (registerRef) {
                    registerRef(`${obj.id}-text`, node || null); // seguÃƒÂ­s usando tu sistema de refs
                  }
                }}
                x={obj.x}
                y={obj.y}
                width={width}
                height={height}
                text={obj.texto}
                fontSize={normalizeFontSize(obj.fontSize, 24)}
                fontFamily={obj.fontFamily || "sans-serif"}
                fontWeight={obj.fontWeight || "normal"}
                fontStyle={resolveKonvaFontStyle(obj.fontStyle || "normal", obj.fontWeight || "normal")}
                textDecoration={obj.textDecoration || "none"}
                fill={obj.colorTexto || "#000000"}
                align={obj.align || "center"}
                verticalAlign="middle"
                listening={false}              // Ã°Å¸â€˜Ë† el texto no roba eventos, los recibe el Rect
                opacity={1}
              />
            )}
          </>
        );
      }

      case "circle": {
        const circleRadius = obj.radius || 50;
        const circleFill = resolveKonvaFill(
          obj.color,
          circleRadius * 2,
          circleRadius * 2,
          "#000000"
        );
        return (
          <Circle
            {...commonProps}
            ref={handleRef}
            radius={circleRadius}
            fill={circleFill.fillColor}
            fillPriority={circleFill.hasGradient ? "linear-gradient" : "color"}
            fillLinearGradientStartPoint={circleFill.hasGradient ? circleFill.startPoint : undefined}
            fillLinearGradientEndPoint={circleFill.hasGradient ? circleFill.endPoint : undefined}
            fillLinearGradientColorStops={
              circleFill.hasGradient
                ? [0, circleFill.gradientFrom, 1, circleFill.gradientTo]
                : undefined
            }
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            stroke={isSelected || preSeleccionado ? "#773dbe" : undefined}
            strokeWidth={isSelected || preSeleccionado ? 1 : 0}
          />
        );
      }

      case "triangle": {
        const triangleRadius = obj.radius || 60;
        const triangleFill = resolveKonvaFill(
          obj.color,
          triangleRadius * 2,
          triangleRadius * 2,
          "#000000"
        );
        return (
          <RegularPolygon
            {...commonProps}
            ref={handleRef}
            sides={3}
            radius={triangleRadius}
            fill={triangleFill.fillColor}
            fillPriority={triangleFill.hasGradient ? "linear-gradient" : "color"}
            fillLinearGradientStartPoint={triangleFill.hasGradient ? triangleFill.startPoint : undefined}
            fillLinearGradientEndPoint={triangleFill.hasGradient ? triangleFill.endPoint : undefined}
            fillLinearGradientColorStops={
              triangleFill.hasGradient
                ? [0, triangleFill.gradientFrom, 1, triangleFill.gradientTo]
                : undefined
            }
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            stroke={isSelected || preSeleccionado ? "#773dbe" : undefined}
            strokeWidth={isSelected || preSeleccionado ? 1 : 0}
          />
        );
      }


      default:
        return null;
    }
  }

  return null;
}

