import { createPortal } from "react-dom";
import { useMemo, useEffect, useRef } from "react";

export default function InlineTextEditor({ node, value, onChange, onFinish }) {
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

  // 🔥 CALCULAR POSICIÓN Y ESCALA
  const { left, top, scale } = useMemo(() => {
    try {
      const rect = node.getClientRect({ relativeTo: node.getStage() });
      const stage = node.getStage();
      const stageBox = stage.container().getBoundingClientRect();
      const scaleX = stageBox.width / stage.width();
      
      return {
        left: stageBox.left + rect.x * scaleX + window.scrollX,
        top: stageBox.top + rect.y * scaleX + window.scrollY,
        scale: scaleX
      };
    } catch (error) {
      console.warn("Error calculando posición:", error);
      return { left: 0, top: 0, scale: 1 };
    }
  }, [node]);

  // 🔥 CALCULAR DIMENSIONES DINÁMICAS DEL CONTENIDO
  const contentDimensions = useMemo(() => {
    if (!value) return { width: 20, height: nodeProps.fontSize * scale * 1.2 };
    
    // Crear elemento temporal para medir el texto
    const tempDiv = document.createElement('div');
    tempDiv.style.position = 'absolute';
    tempDiv.style.visibility = 'hidden';
    tempDiv.style.whiteSpace = 'pre';
    tempDiv.style.fontSize = `${nodeProps.fontSize * scale}px`;
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
      width: Math.max(20, width + 10), // +10px de buffer
      height: Math.max(nodeProps.fontSize * scale * 1.2, height + 5) // +5px de buffer
    };
  }, [value, nodeProps.fontSize, nodeProps.fontFamily, nodeProps.fontWeight, nodeProps.fontStyle, scale]);

  // 🔥 AUTO-FOCUS Y POSICIONAMIENTO DEL CURSOR
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    textarea.focus();
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
  }, []);

  // 🔥 ACTUALIZAR DIMENSIONES CUANDO CAMBIA EL CONTENIDO
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    // Establecer las dimensiones calculadas
    textarea.style.width = `${contentDimensions.width}px`;
    textarea.style.height = `${contentDimensions.height}px`;
    
    // Asegurar que no hay scroll interno
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
        
        // 🔥 DIMENSIONES EXACTAS CALCULADAS
        width: `${contentDimensions.width}px`,
        height: `${contentDimensions.height}px`,
        
        // 🔥 TIPOGRAFÍA EXACTA
        fontSize: `${nodeProps.fontSize * scale}px`,
        fontFamily: nodeProps.fontFamily,
        fontWeight: nodeProps.fontWeight,
        fontStyle: nodeProps.fontStyle,
        lineHeight: 1.2,
        
        // 🔥 COLOR Y ALINEACIÓN
        color: nodeProps.fill,
        caretColor: nodeProps.fill,
        textAlign: "left",
        
        // 🔥 CLAVE: SIN WRAPPING Y SIN SCROLL
        whiteSpace: "pre",
        overflow: "hidden", // 🎯 OCULTAR SCROLL COMPLETAMENTE
        wordWrap: "normal",
        overflowWrap: "normal",
        
        // 🔥 COMPLETAMENTE INVISIBLE
        background: "transparent",
        border: "none",
        outline: "none",
        resize: "none",
        
        // 🔥 SIN PADDING NI MARGIN
        padding: "0",
        margin: "0",
        boxSizing: "border-box",
        
        // 🔥 SIN EFECTOS VISUALES
        textDecoration: "none",
        letterSpacing: "normal",
        wordSpacing: "normal",
        textIndent: "0",
        textShadow: "none",
        boxShadow: "none",
        
        // 🔥 SIN TRANSFORMACIONES
        transform: "none",
        transition: "none",
        
        // 🔥 FORZAR SIN SCROLL
        overflowX: "hidden",
        overflowY: "hidden",
        scrollbarWidth: "none",
        msOverflowStyle: "none",
        
        zIndex: 1000,
      }}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => {
        // 🔥 ENTER = nueva línea
        if (e.key === "Enter" && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
          return;
        }
        
        // 🔥 SHIFT + ENTER = salir del modo edición
        if (e.key === "Enter" && e.shiftKey) {
          e.preventDefault();
          onFinish();
          return;
        }
        
        // 🔥 ESCAPE = salir del modo edición
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
      // 🔥 PREVENIR SCROLL MANUAL
      onScroll={(e) => {
        e.target.scrollLeft = 0;
        e.target.scrollTop = 0;
      }}
    />,
    document.body
  );
}