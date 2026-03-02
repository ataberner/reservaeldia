import { buildInvitationTypeLabel, normalizeInvitationType } from "@/domain/invitationTypes";

function normalizeString(value) {
  return String(value || "").trim();
}

function normalizeLower(value) {
  return normalizeString(value).toLowerCase();
}

function normalizeTags(value) {
  if (Array.isArray(value)) {
    return value
      .map((entry) => normalizeLower(entry))
      .filter(Boolean);
  }

  return normalizeString(value)
    .split(",")
    .map((entry) => normalizeLower(entry))
    .filter(Boolean);
}

function normalizeItem(item = {}, index = 0) {
  const alignRaw = normalizeLower(item.align || item.textAlign || item.alineacion || "left");
  const align = alignRaw === "center" || alignRaw === "right" ? alignRaw : "left";

  return {
    id: normalizeString(item.id || `item-${index + 1}`),
    texto: String(item.texto || ""),
    x: Number.isFinite(Number(item.x)) ? Number(item.x) : 0,
    y: Number.isFinite(Number(item.y)) ? Number(item.y) : index * 40,
    fontFamily: normalizeString(item.fontFamily || item.font || "sans-serif") || "sans-serif",
    fontSize: Number.isFinite(Number(item.fontSize)) ? Number(item.fontSize) : 24,
    color: normalizeString(item.color || item.fill || item.colorTexto || "#000000") || "#000000",
    align,
    fontWeight: normalizeString(item.fontWeight || item.weight || "normal") || "normal",
    lineHeight:
      Number.isFinite(Number(item.lineHeight)) && Number(item.lineHeight) > 0
        ? Number(item.lineHeight)
        : undefined,
    letterSpacing: Number.isFinite(Number(item.letterSpacing)) ? Number(item.letterSpacing) : undefined,
    italic: item.italic === true,
    uppercase: item.uppercase === true,
  };
}

export function mapTextPresetItem(raw = {}, index = 0) {
  const normalizedItems = (Array.isArray(raw.items) ? raw.items : [])
    .map((entry, itemIndex) => normalizeItem(entry, itemIndex))
    .filter((entry) => entry.id);

  const tipoRaw = normalizeLower(raw.tipo || (normalizedItems.length > 1 ? "compuesto" : "simple"));
  const tipo = tipoRaw === "compuesto" ? "compuesto" : "simple";
  const categoria = normalizeInvitationType(raw.categoria);
  const tags = normalizeTags(raw.tags);
  const nombre = normalizeString(raw.nombre || raw.id || "Preset");

  const searchTokens = [
    normalizeLower(nombre),
    normalizeLower(raw.slug),
    categoria,
    ...tags,
    ...normalizedItems.map((item) => normalizeLower(item.texto)).filter(Boolean),
  ]
    .filter(Boolean)
    .join(" ");

  return {
    id: normalizeString(raw.id || `preset-${index + 1}`),
    slug: normalizeString(raw.slug || raw.id || `preset-${index + 1}`),
    nombre,
    tipo,
    categoria,
    categoriaLabel: buildInvitationTypeLabel(categoria),
    tags,
    activo: raw.activo !== false,
    mostrarEnEditor: raw.mostrarEnEditor !== false,
    orden: Number.isFinite(Number(raw.orden)) ? Number(raw.orden) : index,
    items: tipo === "simple" ? (normalizedItems[0] ? [normalizedItems[0]] : []) : normalizedItems,
    preview: raw.preview || null,
    audit: raw.audit || null,
    searchTokens,
  };
}

export function mapTextPresetCollection(rawItems = []) {
  return (Array.isArray(rawItems) ? rawItems : [])
    .map((entry, index) => mapTextPresetItem(entry, index))
    .filter((entry) => entry.id)
    .sort((left, right) => {
      const orderDiff = Number(left.orden || 0) - Number(right.orden || 0);
      if (orderDiff !== 0) return orderDiff;
      return String(left.nombre || "").localeCompare(String(right.nombre || ""));
    });
}

export function filterTextPresetCollection(items = [], filters = {}) {
  const {
    query = "",
    tipo = "all",
    categoria = "all",
    activo = "all",
    mostrarEnEditor = "all",
  } = filters;

  const q = normalizeLower(query);

  return (Array.isArray(items) ? items : []).filter((item) => {
    if (tipo !== "all" && item.tipo !== tipo) return false;
    if (categoria !== "all" && item.categoria !== categoria) return false;

    if (activo === "active" && item.activo !== true) return false;
    if (activo === "inactive" && item.activo !== false) return false;

    if (mostrarEnEditor === "visible" && item.mostrarEnEditor !== true) return false;
    if (mostrarEnEditor === "hidden" && item.mostrarEnEditor !== false) return false;

    if (!q) return true;
    return String(item.searchTokens || "").includes(q);
  });
}

export function toPresetSavePayload(preset = {}) {
  return {
    presetId: preset.id || undefined,
    preset: {
      id: preset.id || undefined,
      slug: preset.slug,
      nombre: preset.nombre,
      tipo: preset.tipo,
      categoria: preset.categoria,
      tags: Array.isArray(preset.tags) ? preset.tags : [],
      activo: preset.activo === true,
      mostrarEnEditor: preset.mostrarEnEditor === true,
      orden: Number.isFinite(Number(preset.orden)) ? Number(preset.orden) : 0,
      items: (Array.isArray(preset.items) ? preset.items : []).map((item, index) => ({
        id: item?.id || `item-${index + 1}`,
        texto: String(item?.texto || ""),
        x: Number.isFinite(Number(item?.x)) ? Number(item.x) : 0,
        y: Number.isFinite(Number(item?.y)) ? Number(item.y) : 0,
        fontFamily: String(item?.fontFamily || "sans-serif"),
        fontSize: Number.isFinite(Number(item?.fontSize)) ? Number(item.fontSize) : 24,
        color: String(item?.color || "#000000"),
        align: ["left", "center", "right"].includes(String(item?.align || "").toLowerCase())
          ? String(item.align).toLowerCase()
          : "left",
        fontWeight: String(item?.fontWeight || "normal"),
        ...(Number.isFinite(Number(item?.lineHeight)) ? { lineHeight: Number(item.lineHeight) } : {}),
        ...(Number.isFinite(Number(item?.letterSpacing)) ? { letterSpacing: Number(item.letterSpacing) } : {}),
        ...(item?.italic === true ? { italic: true } : {}),
        ...(item?.uppercase === true ? { uppercase: true } : {}),
      })),
    },
  };
}

export function createDefaultTextPreset() {
  return {
    id: null,
    slug: "",
    nombre: "",
    tipo: "simple",
    categoria: "general",
    tags: [],
    activo: true,
    mostrarEnEditor: true,
    orden: 0,
    items: [
      {
        id: "item-1",
        texto: "Nuevo texto",
        x: 0,
        y: 0,
        fontFamily: "sans-serif",
        fontSize: 28,
        color: "#111111",
        align: "left",
        fontWeight: "normal",
        lineHeight: 1.2,
        letterSpacing: 0,
        italic: false,
        uppercase: false,
      },
    ],
  };
}
