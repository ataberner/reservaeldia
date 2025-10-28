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

  const fontSizeEdit = nodeProps.fontSize;


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
      width: Math.max(20, width + 10),
      height: Math.max(fontSizeEdit * 1.2, height + 4)
    };

  }, [value, nodeProps.fontSize, nodeProps.fontFamily, nodeProps.fontWeight, nodeProps.fontStyle]);

  // ✅ Posicionar según la esquina superior-izquierda del texto real
  const { left, top } = useMemo(() => {
    try {
      const textPos = node.absolutePosition();
      const stage = node.getStage();
      const stageBox = stage.container().getBoundingClientRect();

      return {
        left: stageBox.left + textPos.x * scaleVisual + window.scrollX,
        top: stageBox.top + textPos.y * scaleVisual + window.scrollY
      };
    } catch (error) {
      console.warn("Error calculando posición del textarea:", error);
      return { left: 0, top: 0 };
    }
  }, [node, scaleVisual]);


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

    textarea.style.width = `${contentDimensions.width +1}px`;
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
        left: `${left -1}px`,
        top: `${top - (contentDimensions.height - fontSizeEdit * 1.2) / 2 - fontSizeEdit * 0.065}px`,
        width: `${contentDimensions.width}px`,
        height: `${contentDimensions.height}px`,

        fontSize: `${fontSizeEdit}px`,
        fontFamily: nodeProps.fontFamily,
        fontWeight: nodeProps.fontWeight,
        fontStyle: nodeProps.fontStyle,
        lineHeight: 1.2,

        color: nodeProps.fill,
        caretColor: nodeProps.fill,
        textAlign: textAlign || "left",

        whiteSpace: "pre-wrap",
        background: "transparent",
        border: "none",
        outline: "none",
        resize: "none",
        padding: "0",
        margin: "0",
        boxSizing: "border-box",
        overflow: "hidden",
        zIndex: 9999,
        

        transformOrigin: "top left",
        transform: `scale(${scaleVisual})`,
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