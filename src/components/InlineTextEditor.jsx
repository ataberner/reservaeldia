import { createPortal } from "react-dom";
import { useMemo, useEffect, useRef } from "react";

export default function InlineTextEditor({ node, value, onChange, onFinish }) {
  if (!node) return null;

  const textareaRef = useRef();

  const { left, top, width, height } = useMemo(() => {
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
  }, [node]);

  // 🧠 Ajuste dinámico de tamaño (alto + ancho)
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const ajustarTamaño = () => {
      textarea.style.height = "auto";
      textarea.style.width = "auto";
      textarea.style.height = textarea.scrollHeight + "px";
      textarea.style.width = textarea.scrollWidth + "px";
    };

    ajustarTamaño(); // al montar

    textarea.addEventListener("input", ajustarTamaño);
    return () => textarea.removeEventListener("input", ajustarTamaño);
  }, [value]);

  return createPortal(
    <textarea
      ref={textareaRef}
      autoFocus
      value={value}
      style={{
  position: "fixed",
  left,
  top,
  width,
  height,
  font: `${node.fontStyle?.() || "normal"} ${node.fontWeight?.() || "normal"} ${node.fontSize?.() || 24}px ${node.fontFamily?.() || "sans-serif"}`,
  lineHeight: node.lineHeight?.() || "normal",
  color: node.fill?.() || "#000",
  caretColor: node.fill?.() || "#000",
  textDecoration: node.textDecoration?.() || "none",
  background: "rgba(255,255,255,0.001)",
  border: "none",
  outline: "none",
  resize: "none",
  overflow: "hidden",
  whiteSpace: "pre",
  zIndex: 1000,
}}

      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => {
        if ((e.key === "Enter" && !e.shiftKey) || e.key === "Escape") {
          e.preventDefault();
          onFinish();
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
