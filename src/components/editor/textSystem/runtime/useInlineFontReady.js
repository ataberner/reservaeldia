import { useCallback } from "react";

export default function useInlineFontReady({
  fontManager,
}) {
  const ensureInlineFontReady = useCallback(async (fontFamily) => {
    const normalizedFont = fontManager.normalizeFontName(fontFamily);
    if (!normalizedFont) {
      return {
        waited: false,
        ready: true,
        fontName: null,
        loadedCount: null,
        failedCount: null,
      };
    }

    if (fontManager.isFontAvailable(normalizedFont)) {
      return {
        waited: false,
        ready: true,
        fontName: normalizedFont,
        loadedCount: null,
        failedCount: null,
      };
    }

    let loadSummary = null;
    try {
      loadSummary = await fontManager.loadFonts([normalizedFont], { timeoutMs: 700 });
    } catch {
      // no-op
    }

    if (typeof document !== "undefined" && document.fonts?.load) {
      try {
        await Promise.race([
          document.fonts.load(`16px "${normalizedFont}"`),
          new Promise((resolve) => setTimeout(resolve, 200)),
        ]);
      } catch {
        // no-op
      }
    }

    await new Promise((resolve) => {
      requestAnimationFrame(() => resolve());
    });

    return {
      waited: true,
      ready: fontManager.isFontAvailable(normalizedFont),
      fontName: normalizedFont,
      loadedCount: loadSummary?.loaded?.length ?? null,
      failedCount: loadSummary?.failed?.length ?? null,
    };
  }, [fontManager]);

  return {
    ensureInlineFontReady,
  };
}
