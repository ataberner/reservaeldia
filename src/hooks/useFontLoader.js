// src/hooks/useFontLoader.js
import { useEffect, useState } from 'react';
import { fontManager } from '../utils/fontManager';

export function useFontLoader(fontFamily) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!fontFamily) return;

    const loadFont = async () => {
      setIsLoading(true);
      setError(null);
      
      try {
        await fontManager.loadFonts([fontFamily]);
        setIsLoaded(true);
      } catch (err) {
        setError(err);
        setIsLoaded(false);
      } finally {
        setIsLoading(false);
      }
    };

    if (!fontManager.isFontAvailable(fontFamily)) {
      loadFont();
    } else {
      setIsLoaded(true);
    }
  }, [fontFamily]);

  return { isLoaded, isLoading, error };
}