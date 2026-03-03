import UnifiedColorPicker from "@/components/color/UnifiedColorPicker";

export default function SelectorColorSeccion({
  seccion,
  onChange,
  disabled = false,
  compact = false,
}) {
  const triggerClassName = compact
    ? "!h-8 !w-8 rounded-lg border-[#d7c4f1] bg-white shadow-[0_6px_14px_rgba(15,23,42,0.10)]"
    : "";

  return (
    <UnifiedColorPicker
      value={seccion?.fondo || "#ffffff"}
      disabled={disabled}
      title={compact ? "Cambiar color de fondo" : "Cambiar fondo de la seccion"}
      triggerClassName={triggerClassName}
      panelWidth={compact ? 248 : 264}
      onChange={(nextColor) => onChange?.(seccion?.id, nextColor)}
    />
  );
}
