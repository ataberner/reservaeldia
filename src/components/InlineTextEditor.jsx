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

  // 🔥 CALCULAR POSICIÓN Y DIMENSIONES REALES SIN ESCALADO
  const { left, top, width, height } = useMemo(() => {
    try {
      const rect = node.getClientRect({ relativeTo: node.getStage() });
      const stage = node.getStage();
      const stageBox = stage.container().getBoundingClientRect();
      const scaleX = stageBox.width / stage.width();
      const scaleY = stageBox.height / stage.height();
      
      return {
        left: stageBox.left + rect.x * scaleX + window.scrollX,
        top: stageBox.top + rect.y * scaleY + window.scrollY,
        width: rect.width * scaleX,
        height: rect.height * scaleY,
      };
    } catch (error) {
      console.warn("Error calculando posición:", error);
      return { left: 0, top: 0, width: 100, height: 30 };
    }
  }, [node]);

  // 🔥 AUTO-FOCUS Y POSICIONAMIENTO DEL CURSOR
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    // Enfocar y posicionar cursor al final
    textarea.focus();
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
  }, []);

  return createPortal(
    <textarea
      ref={textareaRef}
      autoFocus
      value={value}
      style={{
        position: "fixed",
        left: `${left}px`,
        top: `${top}px`,
        
        // 🔥 USAR DIMENSIONES EXACTAS DEL NODO KONVA
        width: `${width}px`,
        height: `${height}px`,
        minWidth: `${width}px`,
        minHeight: `${height}px`,
        
        // 🔥 USAR PROPIEDADES EXACTAS SIN ESCALADO
        fontSize: `${nodeProps.fontSize}px`,
        fontFamily: nodeProps.fontFamily,
        fontWeight: nodeProps.fontWeight,
        fontStyle: nodeProps.fontStyle,
        lineHeight: "1.2", // Line height estándar de Konva
        
        // 🔥 ESTILOS PARA COINCIDENCIA EXACTA
        color: nodeProps.fill,
        caretColor: nodeProps.fill,
        textAlign: "left",
        verticalAlign: "top",
        
        // 🔥 SIN BORDES, SIN SCROLL, SIN PADDING
        boxSizing: "border-box",
        background: "transparent",
        border: "none",
        outline: "none",
        resize: "none",
        
        // 🔥 OCULTAR SCROLL COMPLETAMENTE
        overflow: "hidden",
        overflowX: "hidden",
        overflowY: "hidden",
        scrollbarWidth: "none", // Firefox
        msOverflowStyle: "none", // IE/Edge
        
        whiteSpace: "pre-wrap",
        wordWrap: "break-word",
        padding: "0",
        margin: "0",
        textDecoration: "none",
        letterSpacing: "normal",
        wordSpacing: "normal",
        textIndent: "0",
        textShadow: "none",
        
        // 🔥 EVITAR TRANSFORMACIONES
        transform: "none",
        transition: "none",
        
        zIndex: 1000,
      }}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => {
        // 🔥 ENTER normal = nueva línea
        if (e.key === "Enter" && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
          // Permitir nueva línea normal
          return;
        }
        
        // 🔥 SHIFT + ENTER = salir (guardar)
        if (e.key === "Enter" && e.shiftKey) {
          e.preventDefault();
          onFinish();
          return;
        }
        
        // 🔥 ESCAPE = salir (guardar)
        if (e.key === "Escape") {
          e.preventDefault();
          onFinish();
          return;
        }
      }}
      onBlur={() => {
        setTimeout(() => {
          onFinish();
        }, 0);
      }}
    />,
    document.body
  );
}