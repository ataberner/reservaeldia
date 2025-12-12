import { createPortal } from "react-dom";
import { useMemo, useEffect, useRef } from "react";

export default function InlineTextEditor({
  node,
  value,
  onChange,
  onFinish,
  textAlign,
  scaleVisual = 1,
}) {
  if (!node) return null;

  // 🔒 Bloquea scroll mientras se edita
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  const editorRef = useRef(null);
  const DEBUG_MODE = true;

  // 🧩 Stage (lo necesitamos para rects y posiciones)
  const stage = node.getStage();
  if (!stage) return null;

  const stageBox = stage.container().getBoundingClientRect();

  const stageScaleX =
    typeof stage.scaleX === "function" ? stage.scaleX() : stage.scaleX || 1;
  const stageScaleY =
    typeof stage.scaleY === "function" ? stage.scaleY() : stage.scaleY || 1;

  const totalScaleX = (scaleVisual || 1) * (stageScaleX || 1);
  const totalScaleY = (scaleVisual || 1) * (stageScaleY || 1);

  // 🧠 Detectar el nodo de texto real para estilo (color, fuente, etc.)
  const textNode = useMemo(() => {
    try {
      if (typeof node.getClassName === "function") {
        const cls = node.getClassName();
        if (cls === "Text") {
          return node;
        }
      }

      // Si el node es un Group/Layer/Stage u otro Container → buscar un hijo Text
      if (typeof node.findOne === "function") {
        const found = node.findOne((n) => n.getClassName() === "Text");
        if (found) return found;
      }

      // Si el node es un Rect u otra cosa → buscar ancestro Text por las dudas
      if (typeof node.findAncestor === "function") {
        const ancestorText = node.findAncestor(
          (n) => n.getClassName && n.getClassName() === "Text"
        );
        if (ancestorText) return ancestorText;
      }

      return node; // fallback
    } catch (e) {
      console.warn("Error buscando textNode para InlineTextEditor:", e);
      return node;
    }
  }, [node]);

  if (DEBUG_MODE) {
    console.log("🔍 [InlineTextEditor textNode detection]", {
      nodeClass: node.getClassName?.(),
      textNodeClass: textNode?.getClassName?.(),
    });
  }

  // 1️⃣ Props tipográficas reales desde el textNode (NO desde el rect/recuadro)
  const nodeProps = useMemo(() => {
    try {
      const getProp = (n, getterName, fallback) => {
        if (!n) return fallback;
        const fn = n[getterName];
        if (typeof fn === "function") return fn.call(n);
        return n[getterName] || fallback;
      };

      const fontSize = getProp(textNode, "fontSize", 24);
      const fontFamily = getProp(textNode, "fontFamily", "sans-serif");
      const fontWeight = getProp(textNode, "fontWeight", "normal");
      const fontStyle = getProp(textNode, "fontStyle", "normal");
      const fill = getProp(textNode, "fill", "#000");
      const lineHeightKonva = getProp(textNode, "lineHeight", 1.2);

      if (DEBUG_MODE) {
        console.log("🧾 [InlineTextEditor nodeProps]", {
          fontSize,
          fontFamily,
          fontWeight,
          fontStyle,
          fill,
          lineHeightKonva,
        });
      }

      return {
        fontSize,
        fontFamily,
        fontWeight,
        fontStyle,
        fill,
        lineHeightKonva,
      };
    } catch (error) {
      console.warn("Error obteniendo propiedades del textNode:", error);
      return {
        fontSize: 24,
        fontFamily: "sans-serif",
        fontWeight: "normal",
        fontStyle: "normal",
        fill: "#000",
        lineHeightKonva: 1.2,
      };
    }
  }, [textNode]);

  const konvaLineHeight = nodeProps.lineHeightKonva;

  // 📦 Bounding box que usamos para posicionar el editor
  // 👉 Para texto suelto: será el rect del texto
  // 👉 Para recuadros: será el rect del elemento contenedor
  const rect = node.getClientRect({ relativeTo: stage, skipStroke: true });

  // 🔢 Padding del recuadro visual del editor
  const PADDING_X = 12;
  const PADDING_Y = 8;

  // Detectar clase del nodo principal para saber si es texto suelto o recuadro
  const className =
    typeof node.getClassName === "function" ? node.getClassName() : "Text";

  const isTextNode = className === "Text";

  // Ancho base según el rect (mínimo)
  const baseTextWidth = Math.max(20, rect.width * totalScaleX);

  let left;
  let top;

  if (isTextNode) {
    // 📝 Texto suelto → recuadro pegado al texto (top-left)
    top = stageBox.top + rect.y * totalScaleY + window.scrollY - PADDING_Y;
    left = stageBox.left + rect.x * totalScaleX + window.scrollX - PADDING_X;
  } else {
    // 🟥 Texto dentro de un recuadro → centrar el editor en el elemento
    const centerXCanvas = rect.x + rect.width / 2;
    const centerYCanvas = rect.y + rect.height / 2;

    const centerXDom =
      stageBox.left + centerXCanvas * totalScaleX + window.scrollX;
    const centerYDom =
      stageBox.top + centerYCanvas * totalScaleY + window.scrollY;

    const cardWidth = baseTextWidth + PADDING_X * 2;
    const approxHeight =
      nodeProps.fontSize * konvaLineHeight * totalScaleY + PADDING_Y * 2;

    left = centerXDom - cardWidth / 2;
    top = centerYDom - approxHeight / 2;
  }

  if (DEBUG_MODE) {
    console.log("🧮 [Inline Position]", {
      className,
      isTextNode,
      rectKonva: rect,
      stageBox,
      stageScaleX,
      stageScaleY,
      totalScaleX,
      totalScaleY,
      baseTextWidth,
      left,
      top,
      textColor: nodeProps.fill,
      textFont: nodeProps.fontFamily,
      konvaAbsPos: node.getAbsolutePosition(),
    });
  }

  // 🔥 Inicializar contenido + foco + caret
  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;

    let initialText = value || "";

    // Si venimos de una tecla rápida (ej: escribir directamente)
    if (window._preFillChar) {
      initialText = (initialText || "") + window._preFillChar;
      onChange(initialText);
      window._preFillChar = null;
    }

    // Setear contenido solo al montar
    el.innerText = initialText;

    // Foco + caret al final
    el.focus();
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Mantener scroll interno limpio (por las dudas)
  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    el.scrollLeft = 0;
    el.scrollTop = 0;
  }, []);

  return createPortal(
    <>
      {/* 🪟 Recuadro flotante que tapa el texto y crece horizontalmente */}
      <div
        style={{
          position: "fixed",
          left: `${left}px`,
          top: `${top}px`,
          display: "inline-block",
          width: "fit-content",
          minWidth: `${baseTextWidth + PADDING_X * 2}px`,
          maxWidth: "min(100vw - 40px, 1200px)",
          background: "rgba(248, 250, 252, 0.98)", // gris muy claro
          borderRadius: "10px",
          boxShadow:
            "0 18px 45px rgba(15, 23, 42, 0.35), 0 4px 12px rgba(15, 23, 42, 0.18)",
          border: "1px solid rgba(148, 163, 184, 0.45)",
          padding: `${PADDING_Y}px ${PADDING_X}px`,
          zIndex: 9999,
          boxSizing: "border-box",
        }}
      >
        {/* Área editable que tapa completamente el texto */}
        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          style={{
            display: "inline-block",
            minWidth: `${baseTextWidth}px`,
            whiteSpace: "pre", // crece en una sola línea
            overflowWrap: "normal",
            wordBreak: "normal",
            overflow: "visible",
            fontSize: `${nodeProps.fontSize * totalScaleY}px`,
            fontFamily: nodeProps.fontFamily,
            fontWeight: nodeProps.fontWeight,
            fontStyle: nodeProps.fontStyle,
            lineHeight: konvaLineHeight,
            color: "#111827", 
            caretColor: "#111827",
            WebkitTextFillColor: "#111827",
            background: "transparent",
            borderRadius: "6px",
            padding: "2px 2px 4px 2px",
            margin: 0,
            outline: "none",
            textAlign: textAlign || "left",
          }}
          onInput={(e) => {
            const newText = e.currentTarget.innerText;
            if (DEBUG_MODE) {
              console.log("⌨️ [Inline onInput]", { newText });
            }
            onChange(newText);
          }}
          onBlur={() => {
            if (DEBUG_MODE) {
              console.log("✅ [Inline onBlur] Finalizar edición");
            }
            setTimeout(onFinish, 100);
          }}
        />
      </div>
    </>,
    document.body
  );
}
