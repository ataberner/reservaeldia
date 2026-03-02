import { TEXT_PRESETS } from "@/config/textPresets";
import { normalizeInvitationType } from "@/domain/invitationTypes";

function normalizeTextEntry(raw = {}, index = 0) {
  const alignRaw = String(raw.align || raw.textAlign || raw.alineacion || "left").toLowerCase();
  const align = alignRaw === "center" || alignRaw === "right" ? alignRaw : "left";

  return {
    id: String(raw.id || `legacy-item-${index + 1}`),
    texto: String(raw.texto || "").slice(0, 2000),
    x: Number.isFinite(Number(raw.x)) ? Number(raw.x) : Number.isFinite(Number(raw.dx)) ? Number(raw.dx) : 0,
    y: Number.isFinite(Number(raw.y)) ? Number(raw.y) : Number.isFinite(Number(raw.dy)) ? Number(raw.dy) : index * 40,
    fontFamily: String(raw.fontFamily || raw.font || "sans-serif"),
    fontSize: Number.isFinite(Number(raw.fontSize)) ? Number(raw.fontSize) : 24,
    color: String(raw.color || raw.fill || raw.colorTexto || "#000000"),
    align,
    fontWeight: String(raw.fontWeight || raw.weight || "normal"),
    ...(Number.isFinite(Number(raw.lineHeight)) ? { lineHeight: Number(raw.lineHeight) } : {}),
    ...(Number.isFinite(Number(raw.letterSpacing)) ? { letterSpacing: Number(raw.letterSpacing) } : {}),
    ...(String(raw.fontStyle || "").toLowerCase().includes("italic")
      ? { italic: true }
      : {}),
    ...(raw.uppercase === true ? { uppercase: true } : {}),
  };
}

export function buildLegacyTextPresetSeed() {
  const source = Array.isArray(TEXT_PRESETS) ? TEXT_PRESETS : [];

  return source.map((preset, index) => {
    const rawItems = Array.isArray(preset?.objetos)
      ? preset.objetos
      : Array.isArray(preset?.elements)
        ? preset.elements
        : Array.isArray(preset?.items)
          ? preset.items
          : [];

    const items = rawItems.map((entry, itemIndex) => normalizeTextEntry(entry, itemIndex));

    return {
      id: String(preset?.id || `legacy-preset-${index + 1}`),
      slug: String(preset?.id || `legacy-preset-${index + 1}`),
      nombre: String(preset?.nombre || preset?.id || `Preset ${index + 1}`),
      tipo: items.length > 1 ? "compuesto" : "simple",
      categoria: normalizeInvitationType(preset?.categoria || preset?.tipoInvitacion),
      tags: Array.isArray(preset?.tags)
        ? preset.tags.map((entry) => String(entry || "").trim()).filter(Boolean)
        : [],
      activo: true,
      mostrarEnEditor: true,
      orden: Number.isFinite(Number(preset?.orden)) ? Number(preset.orden) : index,
      items,
    };
  });
}
