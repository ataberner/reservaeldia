import UnifiedColorPicker from "@/components/color/UnifiedColorPicker";

export default function SelectorColorSeccion({
  seccion,
  onChange,
  disabled = false,
  compact = false,
  title,
}) {
  const resolvedTitle =
    title || (compact ? "Cambiar color de fondo" : "Cambiar fondo de la seccion");
  const triggerClassName = compact
    ? "!h-9 !w-9 rounded-xl border-[#e6dbf8] bg-white/95 shadow-[0_8px_18px_rgba(15,23,42,0.08)] hover:border-[#d2c1f2] hover:bg-[#faf6ff] hover:shadow-[0_12px_24px_rgba(119,61,190,0.15)]"
    : "";

  return (
    <UnifiedColorPicker
      value={seccion?.fondo || "#ffffff"}
      disabled={disabled}
      title={resolvedTitle}
      triggerClassName={triggerClassName}
      panelWidth={compact ? 248 : 264}
      onChange={(nextColor) => onChange?.(seccion?.id, nextColor)}
    />
  );
}
