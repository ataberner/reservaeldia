import { createPortal } from "react-dom";
import { useMemo, useEffect, useRef } from "react";

export default function InlineTextEditor({ node, value, onChange, onFinish, textAlign, scaleVisual = 1 }) {
  if (!node) return null;

  const textareaRef = useRef();

  // 🔥 OBTENER PROPIEDADES EXACTAS DEL NODO KONVA
  const nodeProps = useMemo(() => {
    try {
      return {
        fontSize: typeof node.fontSize === "function" ? node.fontSize() : (node.fontSize || 24),
        fontFamily: typeof node.fontFamily === "function" ? node.fontFamily() : (node.fontFamily || "sans-serif"),
        fontWeight: typeof node.fontWeight === "function" ? node.fontWeight() : (node.fontWeight || "normal"),
        fontStyle: typeof node.fontStyle === "function" ? node.fontStyle() : (node.fontStyle || "normal"),
        fill: typeof node.fill === "function" ? node.fill() : (node.fill || "#000"),
        text: typeof node.text === "function" ? node.text() : (node.text || value)
      };
    } catch (error) {
      console.warn("Error obteniendo propiedades del nodo:", error);
      return {
        fontSize: 24,
        fontFamily: "sans-serif", 
        fontWeight: "normal",
        fontStyle: "normal",
        fill: "#000",
        text: value
      };
    }
  }, [node, value]);

  const fontSizeEdit = nodeProps.fontSize - 3;


  // 🔥 CALCULAR DIMENSIONES SIN ESCALA ADICIONAL
  const contentDimensions = useMemo(() => {
    if (!value) return { width: 20, height: nodeProps.fontSize * 1.2 };

    // Crear elemento temporal para medir el texto SIN escala
    const tempDiv = document.createElement('div');
    tempDiv.style.position = 'absolute';
    tempDiv.style.visibility = 'hidden';
    tempDiv.style.whiteSpace = 'pre';
    const fontSizeEdit = nodeProps.fontSize - 3;
tempDiv.style.fontSize = `${fontSizeEdit}px`;
    tempDiv.style.fontFamily = nodeProps.fontFamily;
    tempDiv.style.fontWeight = nodeProps.fontWeight;
    tempDiv.style.fontStyle = nodeProps.fontStyle;
    tempDiv.style.lineHeight = '1.2';
    tempDiv.style.padding = '0';
    tempDiv.style.margin = '0';
    tempDiv.style.border = 'none';
    tempDiv.textContent = value;

    document.body.appendChild(tempDiv);
    const width = tempDiv.offsetWidth;
    const height = tempDiv.offsetHeight;
    document.body.removeChild(tempDiv);

    return {
      width: Math.max(20, width * scaleVisual +12),
      height: Math.max(fontSizeEdit * scaleVisual * 1.2, height * scaleVisual +6)

    };
  }, [value, nodeProps.fontSize, nodeProps.fontFamily, nodeProps.fontWeight, nodeProps.fontStyle]);

  // 🔥 CALCULAR POSICIÓN USANDO LA ESCALA UNIFICADA
  const { left, top } = useMemo(() => {
    try {
      const rect = node.getClientRect({ relativeTo: node.getStage() });
      const stage = node.getStage();
      const stageBox = stage.container().getBoundingClientRect();

      const width = node.width?.() || 100;
      const height = node.height?.() || 100;

      const centerX = rect.x + width / 2;
      const centerY = rect.y + height / 2;

      return {
        left: stageBox.left + centerX * scaleVisual - contentDimensions.width / 2 + window.scrollX,
        top: stageBox.top + centerY * scaleVisual - contentDimensions.height / 2 + window.scrollY
      };
    } catch (error) {
      console.warn("Error calculando posición:", error);
      return { left: 0, top: 0 };
    }
  }, [node, contentDimensions, scaleVisual]);

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

    textarea.style.width = `${contentDimensions.width}px`;
    textarea.style.height = `${contentDimensions.height}px`;
    
    textarea.scrollLeft = 0;
    textarea.scrollTop = 0;
  }, [contentDimensions.width, contentDimensions.height]);

  return createPortal(
    <textarea
      ref={textareaRef}
      autoFocus
      value={value}
      style={{
  position: "fixed",
  left: `${left}px`,
  top: `${top}px`,
  width: `${contentDimensions.width}px`,
  height: `${contentDimensions.height}px`,

 fontSize: `${fontSizeEdit * scaleVisual +4}px`,
  fontFamily: nodeProps.fontFamily,
  fontWeight: nodeProps.fontWeight,
  fontStyle: nodeProps.fontStyle,
  lineHeight: 1,

  color: "#000",
  caretColor: "#000",
  textAlign: textAlign || "center",

  
  whiteSpace: "pre",
  overflow: "hidden",
  wordWrap: "normal",
  overflowWrap: "normal",

  background: "rgba(255, 0, 0, 0.3)",
  border: "none",
  outline: "none",
  resize: "none",
  paddingTop:"0",
  margin: "0",
  boxSizing: "border-box",

  textDecoration: "none",
  letterSpacing: "normal",
  wordSpacing: "normal",
  textIndent: "0",
  textShadow: "none",
  boxShadow: "none",

  transform: "none",
  transition: "none",

  overflowX: "hidden",
  overflowY: "hidden",
  scrollbarWidth: "none",
  msOverflowStyle: "none",

  zIndex: 9999,
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
    document.body
  );
}