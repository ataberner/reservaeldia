import { useCallback, useEffect, useMemo, useState } from "react";
import { TEXT_PRESETS } from "@/config/textPresets";
import { listTextPresetsPublic } from "@/domain/textPresets/service";
import { normalizeInvitationType } from "@/domain/invitationTypes";

const CACHE_TTL_MS = 90 * 1000;

const catalogCacheByType = new Map();

function toPresetItems(rawItems) {
  return (Array.isArray(rawItems) ? rawItems : [])
    .map((item, index) => {
      const alignRaw = String(item?.align || item?.textAlign || item?.alineacion || "left").toLowerCase();
      const align = alignRaw === "center" || alignRaw === "right" ? alignRaw : "left";

      return {
        id: String(item?.id || `item-${index + 1}`),
        texto: String(item?.texto || ""),
        x: Number.isFinite(Number(item?.x)) ? Number(item.x) : 0,
        y: Number.isFinite(Number(item?.y)) ? Number(item.y) : Number.isFinite(Number(item?.dy)) ? Number(item.dy) : index * 40,
        fontFamily: String(item?.fontFamily || item?.font || "sans-serif"),
        fontSize: Number.isFinite(Number(item?.fontSize)) ? Number(item.fontSize) : 24,
        color: String(item?.color || item?.fill || item?.colorTexto || "#000000"),
        align,
        fontWeight: String(item?.fontWeight || item?.weight || "normal"),
        lineHeight:
          Number.isFinite(Number(item?.lineHeight)) && Number(item?.lineHeight) > 0
            ? Number(item.lineHeight)
            : undefined,
        letterSpacing: Number.isFinite(Number(item?.letterSpacing)) ? Number(item.letterSpacing) : undefined,
        italic:
          item?.italic === true ||
          String(item?.fontStyle || "").toLowerCase().includes("italic"),
        uppercase: item?.uppercase === true,
      };
    })
    .filter((item) => item.texto || item.id);
}

function mapPublicItems(rawItems) {
  return (Array.isArray(rawItems) ? rawItems : [])
    .map((item, index) => {
      const mappedItems = toPresetItems(item?.items);
      if (!mappedItems.length) return null;

      const tipo = String(item?.tipo || (mappedItems.length > 1 ? "compuesto" : "simple")).toLowerCase();

      return {
        id: String(item?.id || `preset-${index + 1}`),
        slug: String(item?.slug || item?.id || `preset-${index + 1}`),
        nombre: String(item?.nombre || item?.id || "Preset"),
        tipo: tipo === "compuesto" ? "compuesto" : "simple",
        categoria: normalizeInvitationType(item?.categoria),
        tags: Array.isArray(item?.tags) ? item.tags.map((entry) => String(entry || "")).filter(Boolean) : [],
        orden: Number.isFinite(Number(item?.orden)) ? Number(item.orden) : index,
        activo: item?.activo !== false,
        mostrarEnEditor: item?.mostrarEnEditor !== false,
        items: mappedItems,
        preview: item?.preview || null,
      };
    })
    .filter(Boolean)
    .sort((left, right) => {
      const orderDiff = Number(left.orden || 0) - Number(right.orden || 0);
      if (orderDiff !== 0) return orderDiff;
      return String(left.nombre || "").localeCompare(String(right.nombre || ""));
    });
}

function mapLegacyFallback(requestedCategory = "general") {
  const normalizedRequested = normalizeInvitationType(requestedCategory);

  return (Array.isArray(TEXT_PRESETS) ? TEXT_PRESETS : [])
    .map((preset, index) => {
      const items = toPresetItems(preset?.objetos || preset?.elements || preset?.items || []);
      if (!items.length) return null;

      return {
        id: String(preset?.id || `legacy-${index + 1}`),
        slug: String(preset?.id || `legacy-${index + 1}`),
        nombre: String(preset?.nombre || preset?.id || "Preset"),
        tipo: items.length > 1 ? "compuesto" : "simple",
        categoria: normalizeInvitationType(preset?.categoria || preset?.tipoInvitacion),
        tags: Array.isArray(preset?.tags)
          ? preset.tags.map((entry) => String(entry || "")).filter(Boolean)
          : [],
        orden: Number.isFinite(Number(preset?.orden)) ? Number(preset.orden) : index,
        activo: true,
        mostrarEnEditor: true,
        items,
        preview: null,
      };
    })
    .filter((preset) => {
      const category = normalizeInvitationType(preset?.categoria);
      if (normalizedRequested === "general") return category === "general";
      return category === normalizedRequested || category === "general";
    })
    .filter(Boolean);
}

export function useTextPresetCatalog(invitationType = "general") {
  const category = normalizeInvitationType(invitationType);

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [usingFallback, setUsingFallback] = useState(false);

  const loadCatalog = useCallback(async ({ force = false } = {}) => {
    const cacheEntry = catalogCacheByType.get(category);
    const now = Date.now();

    if (!force && cacheEntry && now - cacheEntry.updatedAt < CACHE_TTL_MS) {
      setItems(cacheEntry.items);
      setLoading(false);
      setError("");
      setUsingFallback(cacheEntry.usingFallback === true);
      return;
    }

    setLoading(true);
    setError("");

    try {
      const response = await listTextPresetsPublic({ categoria: category });
      const mapped = mapPublicItems(response?.items);

      catalogCacheByType.set(category, {
        items: mapped,
        updatedAt: now,
        usingFallback: false,
      });

      setItems(mapped);
      setUsingFallback(false);
    } catch (loadError) {
      const fallbackItems = mapLegacyFallback(category);
      catalogCacheByType.set(category, {
        items: fallbackItems,
        updatedAt: now,
        usingFallback: true,
      });

      setItems(fallbackItems);
      setUsingFallback(true);
      setError(
        typeof loadError?.message === "string"
          ? loadError.message
          : "No se pudo cargar el catalogo remoto de texto."
      );
    } finally {
      setLoading(false);
    }
  }, [category]);

  useEffect(() => {
    loadCatalog();
  }, [loadCatalog]);

  return useMemo(
    () => ({
      category,
      items,
      loading,
      error,
      usingFallback,
      reload: () => loadCatalog({ force: true }),
    }),
    [category, error, items, loadCatalog, loading, usingFallback]
  );
}
