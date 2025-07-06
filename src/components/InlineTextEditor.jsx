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

  // 🧠 Alto dinámico en base al contenido
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    textarea.style.height = "auto"; // reset previo
    textarea.style.height = textarea.scrollHeight + "px";

    const onInput = () => {
      textarea.style.height = "auto";
      textarea.style.height = textarea.scrollHeight + "px";
    };

    textarea.addEventListener("input", onInput);
    return () => textarea.removeEventListener("input", onInput);
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
        font: `${node.fontStyle?.() || "normal"} ${node.fontSize?.() || 24}px ${node.fontFamily?.() || "sans-serif"}`,
        lineHeight: node.lineHeight?.() || "normal",
        background: "rgba(255,255,255,0.001)",
        color: "#000",
        caretColor: "#000",
        border: "none",
        outline: "none",
        resize: "none",
        overflow: "hidden", // 💡 para evitar scroll interno
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