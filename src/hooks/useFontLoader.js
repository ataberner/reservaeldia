// src/hooks/useFontLoader.js
import { useEffect, useState } from 'react';
import { fontManager } from '../utils/fontManager';

export function useFontLoader(fontFamily) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!fontFamily) return;
    let alive = true;

    const loadFont = async () => {
      if (!alive) return;
      setIsLoading(true);
      setError(null);

      try {
        const result = await fontManager.loadFonts([fontFamily]);
        const failed = Array.isArray(result?.failed) ? result.failed.length > 0 : false;
        const available = fontManager.isFontAvailable(fontFamily);

        if (!alive) return;
        setIsLoaded(available);
        if (!available && failed) {
          setError(new Error(`No se pudo cargar la fuente: ${fontFamily}`));
        }
      } catch (err) {
        if (!alive) return;
        setError(err);
        setIsLoaded(false);
      } finally {
        if (!alive) return;
        setIsLoading(false);
      }
    };

    if (!fontManager.isFontAvailable(fontFamily)) {
      loadFont();
    } else {
      setIsLoaded(true);
    }

    return () => {
      alive = false;
    };
  }, [fontFamily]);

  return { isLoaded, isLoading, error };
}
