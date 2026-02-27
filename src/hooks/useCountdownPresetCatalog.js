import { useCallback, useEffect, useMemo, useState } from "react";
import { COUNTDOWN_PRESETS } from "@/config/countdownPresets";
import { listCountdownPresetsPublic } from "@/domain/countdownPresets/service";
import { buildCountdownCanvasPatchFromPreset } from "@/domain/countdownPresets/toCanvasPatch";

const CATALOG_CACHE_TTL_MS = 90 * 1000;

let catalogCache = {
  items: null,
  updatedAt: 0,
};

function mapLegacyPresets() {
  return (Array.isArray(COUNTDOWN_PRESETS) ? COUNTDOWN_PRESETS : []).map((preset) => ({
    id: preset.id,
    nombre: preset.nombre || preset.id,
    categoriaLabel: "Legacy",
    thumbnailUrl: null,
    activeVersion: 1,
    presetPropsForCanvas: {
      ...preset.props,
      presetId: preset.id,
      presetVersion: 1,
      countdownSchemaVersion: 1,
      tamanoBase: 320,
    },
  }));
}

function toCatalogItems(rawItems) {
  return (Array.isArray(rawItems) ? rawItems : [])
    .map((item) => {
      const patch = item?.presetPropsForCanvas
        ? item.presetPropsForCanvas
        : buildCountdownCanvasPatchFromPreset({
            presetId: item?.id,
            activeVersion: item?.activeVersion,
            layout: item?.layout,
            tipografia: item?.tipografia,
            colores: item?.colores,
            animaciones: item?.animaciones,
            unidad: item?.unidad,
            tamanoBase: item?.tamanoBase,
            svgRef: item?.svgRef,
          });

      return {
        id: String(item?.id || ""),
        nombre: String(item?.nombre || item?.id || "Preset"),
        categoriaLabel: String(item?.categoria?.label || item?.categoriaLabel || "General"),
        thumbnailUrl: item?.thumbnailUrl || item?.svgRef?.thumbnailUrl || null,
        activeVersion: Number(item?.activeVersion || 1),
        presetPropsForCanvas: patch,
      };
    })
    .filter((item) => item.id);
}

export function useCountdownPresetCatalog() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [usingFallback, setUsingFallback] = useState(false);

  const loadCatalog = useCallback(async ({ force = false } = {}) => {
    const now = Date.now();
    if (!force && catalogCache.items && now - catalogCache.updatedAt < CATALOG_CACHE_TTL_MS) {
      setItems(catalogCache.items);
      setLoading(false);
      setError("");
      setUsingFallback(false);
      return;
    }

    setLoading(true);
    setError("");

    try {
      const response = await listCountdownPresetsPublic();
      const mapped = toCatalogItems(response?.items);
      if (!mapped.length) {
        throw new Error("No hay presets publicados.");
      }

      catalogCache = {
        items: mapped,
        updatedAt: now,
      };
      setItems(mapped);
      setUsingFallback(false);
    } catch (loadError) {
      const fallbackItems = mapLegacyPresets();
      setItems(fallbackItems);
      setUsingFallback(true);
      setError(
        typeof loadError?.message === "string"
          ? loadError.message
          : "No se pudo cargar el catalogo remoto."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCatalog();
  }, [loadCatalog]);

  const value = useMemo(
    () => ({
      items,
      loading,
      error,
      usingFallback,
      reload: () => loadCatalog({ force: true }),
    }),
    [items, loading, error, usingFallback, loadCatalog]
  );

  return value;
}
