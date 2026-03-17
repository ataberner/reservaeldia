import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { listSectionVisualAssets } from "@/domain/sections/backgrounds";

export default function useCanvasEditorStartupStatus({
  slug,
  secciones,
  seccionesOrdenadas,
  cargado,
  onStartupStatusChange,
}) {
  const [backgroundLoadByAsset, setBackgroundLoadByAsset] = useState({});
  const startupStatusFinalizedRef = useRef(false);

  useEffect(() => {
    setBackgroundLoadByAsset({});
    startupStatusFinalizedRef.current = false;
  }, [slug]);

  const handleBackgroundImageStatusChange = useCallback((payload) => {
    const assetKey =
      typeof payload?.assetKey === "string" && payload.assetKey.trim()
        ? payload.assetKey.trim()
        : typeof payload?.sectionId === "string" && payload.sectionId.trim()
          ? payload.sectionId.trim()
          : "";
    if (!assetKey) return;

    const hasBackgroundImage = payload?.hasBackgroundImage === true;
    const imageUrl = typeof payload?.imageUrl === "string" ? payload.imageUrl : "";
    const incomingStatus = typeof payload?.status === "string" ? payload.status : "loading";
    const status = hasBackgroundImage
      ? incomingStatus === "loaded" || incomingStatus === "failed"
        ? incomingStatus
        : "loading"
      : "none";

    setBackgroundLoadByAsset((prev) => {
      const current = prev[assetKey];
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
        [assetKey]: {
          status,
          hasBackgroundImage,
          imageUrl,
        },
      };
    });
  }, []);

  const backgroundLoadSummary = useMemo(() => {
    const sectionAssets = (secciones || []).flatMap((seccion) => listSectionVisualAssets(seccion));

    let loaded = 0;
    let failed = 0;
    let pending = 0;

    sectionAssets.forEach((asset) => {
      const status = backgroundLoadByAsset[asset.assetKey]?.status;

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
      total: sectionAssets.length,
      loaded,
      failed,
      pending,
    };
  }, [backgroundLoadByAsset, secciones]);

  const firstSectionBackgroundReady = useMemo(() => {
    const firstSection = seccionesOrdenadas[0];
    if (!firstSection) return true;

    const assets = listSectionVisualAssets(firstSection);
    if (!assets.length) return true;

    return assets.every((asset) => {
      const status = backgroundLoadByAsset[asset.assetKey]?.status;
      return status === "loaded" || status === "failed";
    });
  }, [backgroundLoadByAsset, seccionesOrdenadas]);

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
