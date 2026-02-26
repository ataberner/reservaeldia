import UnifiedColorPicker from "@/components/color/UnifiedColorPicker";

export default function SelectorColorSeccion({ seccion, onChange, disabled = false }) {
  return (
    <UnifiedColorPicker
      value={seccion?.fondo || "#ffffff"}
      disabled={disabled}
      title="Cambiar fondo de la sección"
      onChange={(nextColor) => onChange?.(seccion?.id, nextColor)}
    />
  );
}
