import { createPortal } from "react-dom";
import { useMemo, useEffect, useRef } from "react";
import { getTextMetrics } from "@/utils/getTextMetrics";

export default function InlineTextEditor({ node, value, onChange, onFinish, textAlign, scaleVisual = 1 }) {
  if (!node) return null;

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);


  const textareaRef = useRef();
  const DEBUG_MODE = true;


  // 1️⃣ Obtener propiedades reales del nodo Konva
  const nodeProps = useMemo(() => {
    try {
      return {
        fontSize: typeof node.fontSize === "function" ? node.fontSize() : (node.fontSize || 24),
        fontFamily: typeof node.fontFamily === "function" ? node.fontFamily() : (node.fontFamily || "sans-serif"),
        fontWeight: typeof node.fontWeight === "function" ? node.fontWeight() : (node.fontWeight || "normal"),
        fontStyle: typeof node.fontStyle === "function" ? node.fontStyle() : (node.fontStyle || "normal"),
        fill: typeof node.fill === "function" ? node.fill() : (node.fill || "#000"),
      };
    } catch (error) {
      console.warn("Error obteniendo propiedades del nodo:", error);
      return {
        fontSize: 24,
        fontFamily: "sans-serif",
        fontWeight: "normal",
        fontStyle: "normal",
        fill: "#000",
      };
    }
  }, [node]);

  const fontSizeEdit = nodeProps.fontSize;
  const konvaLineHeight =
    typeof node.lineHeight === "function" ? node.lineHeight() : (node.lineHeight ?? 1.2);


  const m = getTextMetrics({
    fontSize: nodeProps.fontSize,
    fontFamily: nodeProps.fontFamily,
    fontWeight: nodeProps.fontWeight,
    fontStyle: nodeProps.fontStyle,
    text: value?.trim() ? value : "Hg",
  });

   // 🧮 Cantidad de líneas del texto actual
  const lines = (value || "").split(/\r?\n/).length || 1;

  const textBlockHeightCanvas = (m.height /* ascent+descent */) * lines * konvaLineHeight;


  // 2️⃣ Calcular dimensiones base del texto
  const contentDimensions = useMemo(() => {
    if (!value) return { width: 20, height: nodeProps.fontSize * 1.2 };

    const tempDiv = document.createElement("div");
    tempDiv.style.position = "absolute";
    tempDiv.style.visibility = "hidden";
    tempDiv.style.whiteSpace = "pre";
    tempDiv.style.fontSize = `${fontSizeEdit}px`;
    tempDiv.style.fontFamily = nodeProps.fontFamily;
    tempDiv.style.fontWeight = nodeProps.fontWeight;
    tempDiv.style.fontStyle = nodeProps.fontStyle;
    tempDiv.style.lineHeight = "1.2";
    tempDiv.textContent = value;
    document.body.appendChild(tempDiv);

    const width = tempDiv.offsetWidth;
    const height = tempDiv.offsetHeight;
    document.body.removeChild(tempDiv);

    return {
      width: Math.max(20, width + 10),
      height: Math.max(fontSizeEdit * 1.2, height + 4),
    };
  }, [value, nodeProps.fontSize, nodeProps.fontFamily, nodeProps.fontWeight, nodeProps.fontStyle, fontSizeEdit]);


  const rect = node.getClientRect({
    relativeTo: node.getStage(),
    skipShadow: true,
    skipStroke: true,
  });

  // ✅ Calcular el offset vertical real del texto respecto al rectángulo
  let baselineOffset = 0;
  try {
    const metrics = getTextMetrics({
      fontSize: nodeProps.fontSize,
      fontFamily: nodeProps.fontFamily,
      fontWeight: nodeProps.fontWeight,
      fontStyle: nodeProps.fontStyle,
      text: "Hg",
    });
    baselineOffset = metrics.ascent - metrics.height / 2; // mismo cálculo que usa Konva
  } catch (err) {
    console.warn("Error calculando baselineOffset:", err);
  }

  // ✅ Alineamos al inicio del texto real
  const padTop = 0;



  // 4️⃣ Posición y escala finales
  const stage = node.getStage();
  const stageBox = node.getStage().container().getBoundingClientRect();

  // 🔧 NUEVO: tamaño real del nodo Konva (sin expandir)
  const nodeBox = node.getClientRect({ skipShadow: true, skipStroke: true });

 

  // 🔥 Ancho y alto del textarea basados en el texto visible
  const textareaWidth = Math.max(20, nodeBox.width * scaleVisual);
  const textareaHeight = nodeProps.fontSize * konvaLineHeight * lines * scaleVisual;

  // 🔥 Ajuste fino: centramos verticalmente según métricas
  const verticalCorrection = nodeProps.fontSize * 0.08; // pequeño lift (~8% del fontSize)

  // Posición absoluta en pantalla
  const left = stageBox.left + nodeBox.x * scaleVisual + window.scrollX;
  const top = stageBox.top + nodeBox.y * scaleVisual + window.scrollY - verticalCorrection;



  // 🔥 AUTO-FOCUS Y POSICIONAMIENTO DEL CURSOR
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    if (window._preFillChar) {
      const nuevoValor = value + window._preFillChar;
      onChange(nuevoValor);
      window._preFillChar = null;
    }

    textarea.focus();
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
  }, []);


  // 🔥 ACTUALIZAR DIMENSIONES CUANDO CAMBIA EL CONTENIDO
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.scrollLeft = 0;
    textarea.scrollTop = 0;
  }, [contentDimensions.width, contentDimensions.height]);


  // ✅ Ajustar ancho automáticamente mientras se escribe (con expansión real)
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;

    // Crear elemento temporal para medir el texto real
    const temp = document.createElement("span");
    temp.style.visibility = "hidden";
    temp.style.position = "absolute";
    temp.style.whiteSpace = "pre";
    temp.style.fontSize = `${nodeProps.fontSize * scaleVisual}px`;
    temp.style.fontFamily = nodeProps.fontFamily;
    temp.style.fontWeight = nodeProps.fontWeight;
    temp.style.fontStyle = nodeProps.fontStyle;
    temp.textContent = el.value || "Hg";

    document.body.appendChild(temp);
    const measuredWidth = temp.offsetWidth;
    document.body.removeChild(temp);

    // 🔹 Ancho dinámico con margen de 6 px
    const newWidth = measuredWidth + 6;
    el.style.width = `${newWidth}px`;

    // 🧠 Si el texto supera el ancho original del nodo, notificamos a Konva
    const nodeWidth = node.width?.() || rect.width;
    if (measuredWidth > nodeWidth) {
      try {
        node.width(measuredWidth);
        node.getLayer()?.batchDraw();
      } catch (err) {
        console.warn("Error actualizando ancho del nodo:", err);
      }
    }
  }, [value, node, rect.width, nodeProps.fontFamily, nodeProps.fontWeight, nodeProps.fontStyle, nodeProps.fontSize, scaleVisual]);



  // ✅ Ajuste de altura más exacto (una línea base + expansión)
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;

    // Calcular número de líneas reales
    const numLines = (el.value.match(/\n/g)?.length || 0) + 1;
    const newHeight = nodeProps.fontSize * konvaLineHeight * numLines * scaleVisual;

    el.style.height = `${newHeight}px`;
  }, [value, nodeProps.fontSize, konvaLineHeight, scaleVisual]);



  return createPortal(
    <>
      <textarea
        ref={textareaRef}
        autoFocus
        value={value}
        style={{
          position: "fixed",
          left: `${left}px`,
          top: `${top}px`,
          width: `${textareaWidth}px`,
          height: `${textareaHeight}px`,
          overflowY: "hidden",
          overflowX: "visible",


          paddingTop: `${padTop * scaleVisual}px`,
          lineHeight: konvaLineHeight,        // numérico (no “px”)
          fontSize: `${nodeProps.fontSize * scaleVisual}px`,
          fontFamily: nodeProps.fontFamily,
          fontWeight: nodeProps.fontWeight,
          fontStyle: nodeProps.fontStyle,

          color: nodeProps.fill,
          caretColor: nodeProps.fill,
          textAlign: textAlign || "left",

          whiteSpace: "pre",
          resize: "none",
          boxSizing: "border-box",
          background: "transparent",
          border: "none",
          outline: "none",
          resize: "none",
          padding: "0",
          margin: "0",
          boxSizing: "border-box",
          overflow: "hidden",
          zIndex: 9999,
          border: "1px solid red",

          transform: "none",

        }}


        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
            return;
          }

          if (e.key === "Enter" && e.shiftKey) {
            e.preventDefault();
            onFinish();
            return;
          }

          if (e.key === "Escape") {
            e.preventDefault();
            onFinish();
            return;
          }
        }}
        onBlur={() => {
          setTimeout(() => {
            onFinish();
          }, 100);
        }}
        onScroll={(e) => {
          e.target.scrollLeft = 0;
          e.target.scrollTop = 0;
        }}
      />,
    </>,
    document.body
  );
}