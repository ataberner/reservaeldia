// src/hooks/useIconosPublicos.js
import { useCallback } from "react";
import useElementCatalog from "@/hooks/useElementCatalog";
import { filterByCategory } from "@/domain/elements/catalog";

export default function useIconosPublicos() {
  const {
    libraryItems,
    popularItems,
    hasMore,
    loadMore,
    loading,
    getLibraryByKind,
  } = useElementCatalog();

  const iconos = libraryItems.filter((item) => item.kind === "icon" || item.kind === "gif");
  const populares = popularItems.filter((item) => item.kind === "icon" || item.kind === "gif");

  const cargarPorCategoria = useCallback(
    async (categoria) => {
      const normalized = String(categoria || "").trim().toLowerCase();
      if (!normalized) return [];
      return filterByCategory(iconos, normalized);
    },
    [iconos]
  );

  const cargarMas = useCallback(async () => {
    await loadMore();
  }, [loadMore]);

  return {
    iconos,
    populares,
    cargarMas,
    cargando: loading,
    hayMas: hasMore,
    cargarPorCategoria,
    getLibraryByKind,
  };
}
