import { createPortal } from "react-dom";
import { useMemo, useEffect, useRef } from "react";
import { getTextMetrics} from "@/utils/getTextMetrics";


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


  // 🧩 Bounding box REAL del nodo Konva
  const stage = node.getStage();
  if (!stage) return null;
  const stageBox = stage.container().getBoundingClientRect();

  // Escala real del stage (por si hacés zoom)
  const stageScaleX = typeof stage.scaleX === "function" ? stage.scaleX() : stage.scaleX || 1;
  const stageScaleY = typeof stage.scaleY === "function" ? stage.scaleY() : stage.scaleY || 1;

  // Escala total (zoom visual + escala del stage)
  const totalScaleX = (scaleVisual || 1) * (stageScaleX || 1);
  const totalScaleY = (scaleVisual || 1) * (stageScaleY || 1);

  // 📦 Rectángulo de dibujo del texto (mismas coordenadas que el rect verde)
  const rect = node.getClientRect({ relativeTo: stage, skipStroke: true });

  // ✅ Posición del textarea alineada al TOP-LEFT del texto Konva
  const top = stageBox.top + rect.y * totalScaleY + window.scrollY;
  const left = stageBox.left + rect.x * totalScaleX + window.scrollX;

  // ✅ Ancho base del textarea = bounding box del texto Konva
const textareaWidth = Math.max(20, rect.width * totalScaleX);
// El alto lo vamos a manejar dinámicamente con scrollHeight



  if (DEBUG_MODE) {
    console.log("🧮 [Inline Textarea Position]", {
      fontFamily: nodeProps.fontFamily,
      fontSize: nodeProps.fontSize,
      rectKonva: rect,
      stageBox,
      totalScaleX,
      totalScaleY,
      top,
      left,
      textareaWidth,
      konvaAbsPos: node.getAbsolutePosition(),
    });
  }


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

    // 🔄 Ajustar altura del textarea al contenido (profesional)
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;

    
    // Paso 1: dejar que "se encoja"
    el.style.height = "auto";

    // Paso 2: ajustarlo al contenido real
    const newHeight = el.scrollHeight;
    el.style.height = `${newHeight}px`;

    if (DEBUG_MODE) {
      console.log("📏 [Inline AutoHeight]", {
        value,
        scrollHeight: el.scrollHeight,
        clientHeight: el.clientHeight,
        computedHeight: newHeight,
        konvaRectHeight: rect.height * totalScaleY,
      });
    }
}, [value, rect.height, nodeProps.fontSize, konvaLineHeight, totalScaleY]);


// 🟦 Ajustar ANCHO del textarea según el contenido (expande hacia la derecha)
useEffect(() => {
  const el = textareaRef.current;
  if (!el) return;

  // Medir contenido real en DOM
  const temp = document.createElement("span");
  temp.style.visibility = "hidden";
  temp.style.position = "absolute";
  temp.style.whiteSpace = "pre";
  temp.style.fontSize = `${nodeProps.fontSize * totalScaleX}px`;
  temp.style.fontFamily = nodeProps.fontFamily;
  temp.style.fontWeight = nodeProps.fontWeight;
  temp.style.fontStyle = nodeProps.fontStyle;
  temp.style.lineHeight = konvaLineHeight;
  temp.textContent = el.value || "Hg";

  document.body.appendChild(temp);
  const measuredWidth = temp.offsetWidth;
  document.body.removeChild(temp);

  // Width de Konva en DOM para comparar
  const baseWidthDom = textareaWidth;            // rect.width * totalScaleX
  let finalWidthDom = baseWidthDom;

  if (measuredWidth > baseWidthDom) {
    // 👉 Expande hacia la derecha si el texto lo necesita
    finalWidthDom = measuredWidth + 8;
  }

  // Aplicar al textarea (DOM)
  el.style.width = `${finalWidthDom}px`;

  // Opcional: actualizar también la width del nodo Konva,
  // para que el rect verde crezca igual que el rojo.
  const finalWidthKonva = finalWidthDom / totalScaleX;
  try {
    if (typeof node.width === "function") {
      node.width(finalWidthKonva);
      node.getLayer()?.batchDraw();
    }
  } catch (err) {
    console.warn("Error ajustando width de nodo Konva:", err);
  }

  if (DEBUG_MODE) {
    console.log("📏 [Inline AutoWidth]", {
      value,
      measuredWidth,
      baseWidthDom,
      finalWidthDom,
      finalWidthKonva,
    });
  }
}, [
  value,
  textareaWidth,
  node,
  nodeProps.fontSize,
  nodeProps.fontFamily,
  nodeProps.fontWeight,
  nodeProps.fontStyle,
  konvaLineHeight,
  totalScaleX,
]);




  // 🧩 Pequeña corrección para alinear baseline con Konva

  return createPortal(
    <>
      <textarea
        ref={textareaRef}
        value={value}
        style={{
          position: "fixed",
          left: `${left}px`,
          top: `${top}px`,
          width: `${textareaWidth}px`,
          fontSize: `${nodeProps.fontSize * totalScaleY}px`,
          fontFamily: nodeProps.fontFamily,
          fontWeight: nodeProps.fontWeight,
          fontStyle: nodeProps.fontStyle,
          lineHeight: konvaLineHeight,
          color: nodeProps.fill,
          caretColor: nodeProps.fill,
          background: "transparent",
          border: "1px solid red",
          padding: 0,
          margin: 0,
          whiteSpace: "pre-wrap",
         overflowWrap: "break-word",
         wordBreak: "break-word",
         overflow: "hidden",
          outline: "none",
          resize: "none",
          zIndex: 9999,
        }}
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => setTimeout(onFinish, 100)}
      />

    </>,
    document.body
  );
}