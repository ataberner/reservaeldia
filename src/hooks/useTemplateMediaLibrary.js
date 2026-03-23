import { useCallback, useEffect, useRef, useState } from "react";
import useMisImagenes from "@/hooks/useMisImagenes";
import { validateGalleryFiles } from "@/domain/templates/galleryUpload";

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeLibraryImage(image) {
  const url = normalizeText(image?.url || image?.src || image?.downloadURL);
  if (!url) return null;

  return {
    id: normalizeText(image?.id || image?.fileName || url) || url,
    url,
    thumbnailUrl: normalizeText(image?.thumbnailUrl || url) || url,
    name: normalizeText(image?.nombre || image?.name || "Imagen"),
  };
}

export default function useTemplateMediaLibrary({ enabled = false, reloadKey = "" } = {}) {
  const {
    imagenes,
    cargando,
    cargarImagenes,
    subirImagen,
    hayMas,
    imagenesEnProceso,
  } = useMisImagenes();
  const actionsRef = useRef({
    cargarImagenes,
    subirImagen,
  });
  const bootKeyRef = useRef("");
  const [uploadingCount, setUploadingCount] = useState(0);

  actionsRef.current = {
    cargarImagenes,
    subirImagen,
  };

  useEffect(() => {
    if (!enabled) return;

    const safeReloadKey = normalizeText(reloadKey) || "__default__";
    if (bootKeyRef.current === safeReloadKey) return;
    bootKeyRef.current = safeReloadKey;

    void actionsRef.current.cargarImagenes?.(true);
  }, [enabled, reloadKey]);

  const loadMore = useCallback(async () => {
    if (!enabled || cargando || !hayMas) return;
    await actionsRef.current.cargarImagenes?.(false);
  }, [cargando, enabled, hayMas]);

  const uploadFiles = useCallback(async ({ files, field, galleryRules }) => {
    const safeFiles = Array.isArray(files) ? files : Array.from(files || []);
    const { files: validatedFiles } = validateGalleryFiles({
      files: safeFiles,
      field,
      galleryRules,
    });

    if (!validatedFiles.length) return [];

    setUploadingCount((current) => current + validatedFiles.length);
    try {
      const uploadedUrls = [];

      for (const file of validatedFiles) {
        const nextUrl = await actionsRef.current.subirImagen?.(file);
        if (normalizeText(nextUrl)) {
          uploadedUrls.push(normalizeText(nextUrl));
        }
      }

      return uploadedUrls;
    } finally {
      setUploadingCount((current) => Math.max(0, current - validatedFiles.length));
    }
  }, []);

  return {
    images: Array.isArray(imagenes)
      ? imagenes.map(normalizeLibraryImage).filter(Boolean)
      : [],
    loading: cargando,
    hasMore: hayMas,
    loadMore,
    uploadFiles,
    uploading: uploadingCount > 0 || (Array.isArray(imagenesEnProceso) && imagenesEnProceso.length > 0),
  };
}
