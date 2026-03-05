import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export default function useCanvasEditorStartupStatus({
  slug,
  secciones,
  seccionesOrdenadas,
  cargado,
  onStartupStatusChange,
}) {
  const [backgroundLoadBySection, setBackgroundLoadBySection] = useState({});
  const startupStatusFinalizedRef = useRef(false);

  useEffect(() => {
    setBackgroundLoadBySection({});
    startupStatusFinalizedRef.current = false;
  }, [slug]);

  const handleBackgroundImageStatusChange = useCallback((payload) => {
    const sectionId = payload?.sectionId;
    if (!sectionId) return;

    const hasBackgroundImage = payload?.hasBackgroundImage === true;
    const imageUrl = typeof payload?.imageUrl === "string" ? payload.imageUrl : "";
    const incomingStatus = typeof payload?.status === "string" ? payload.status : "loading";
    const status = hasBackgroundImage
      ? incomingStatus === "loaded" || incomingStatus === "failed"
        ? incomingStatus
        : "loading"
      : "none";

    setBackgroundLoadBySection((prev) => {
      const current = prev[sectionId];
      if (
        current &&
        current.status === status &&
        current.hasBackgroundImage === hasBackgroundImage &&
        current.imageUrl === imageUrl
      ) {
        return prev;
      }

      return {
        ...prev,
        [sectionId]: {
          status,
          hasBackgroundImage,
          imageUrl,
        },
      };
    });
  }, []);

  const backgroundLoadSummary = useMemo(() => {
    const sectionsWithBackgroundImage = (secciones || []).filter(
      (seccion) =>
        seccion?.fondoTipo === "imagen" &&
        typeof seccion?.fondoImagen === "string" &&
        seccion.fondoImagen.trim().length > 0
    );

    let loaded = 0;
    let failed = 0;
    let pending = 0;

    sectionsWithBackgroundImage.forEach((seccion) => {
      const status = backgroundLoadBySection[seccion.id]?.status;

      if (!status || status === "loading") {
        pending += 1;
        return;
      }

      if (status === "loaded") {
        loaded += 1;
        return;
      }

      if (status === "failed") {
        failed += 1;
        return;
      }

      pending += 1;
    });

    return {
      total: sectionsWithBackgroundImage.length,
      loaded,
      failed,
      pending,
    };
  }, [backgroundLoadBySection, secciones]);

  const firstSectionBackgroundReady = useMemo(() => {
    const firstSection = seccionesOrdenadas[0];
    if (!firstSection) return true;

    const hasBackgroundImage =
      firstSection?.fondoTipo === "imagen" &&
      typeof firstSection?.fondoImagen === "string" &&
      firstSection.fondoImagen.trim().length > 0;

    if (!hasBackgroundImage) return true;

    const status = backgroundLoadBySection[firstSection.id]?.status;
    return status === "loaded" || status === "failed";
  }, [backgroundLoadBySection, seccionesOrdenadas]);

  const startupReady = cargado === true && firstSectionBackgroundReady;

  useEffect(() => {
    if (typeof onStartupStatusChange !== "function") return;
    if (startupStatusFinalizedRef.current) return;

    const payload = {
      slug,
      draftLoaded: cargado === true,
      totalBackgrounds: backgroundLoadSummary.total,
      loadedBackgrounds: backgroundLoadSummary.loaded,
      failedBackgrounds: backgroundLoadSummary.failed,
      pendingBackgrounds: backgroundLoadSummary.pending,
    };

    if (!startupReady) {
      onStartupStatusChange({
        ...payload,
        status: "running",
      });
      return;
    }

    let cancelled = false;
    let rafA = 0;
    let rafB = 0;

    rafA = requestAnimationFrame(() => {
      rafB = requestAnimationFrame(() => {
        if (cancelled) return;
        startupStatusFinalizedRef.current = true;
        onStartupStatusChange({
          ...payload,
          status: "ready",
        });
      });
    });

    return () => {
      cancelled = true;
      if (rafA) cancelAnimationFrame(rafA);
      if (rafB) cancelAnimationFrame(rafB);
    };
  }, [
    backgroundLoadSummary.failed,
    backgroundLoadSummary.loaded,
    backgroundLoadSummary.pending,
    backgroundLoadSummary.total,
    cargado,
    onStartupStatusChange,
    slug,
    startupReady,
  ]);

  return {
    handleBackgroundImageStatusChange,
  };
}
