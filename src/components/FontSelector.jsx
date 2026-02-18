import { useState, useEffect, useRef, useMemo, useCallback, memo } from 'react';
import { createPortal } from "react-dom";
import { Check } from 'lucide-react';
import { fontManager } from '../utils/fontManager';
import { ALL_FONTS } from '../config/fonts';

const INITIAL_PRELOAD_COUNT = 8;

const FontSelector = memo(({
  currentFont,
  onFontChange,
  isOpen,
  onClose,
  panelStyle = null,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const selectedCategory = 'all';
  const [applyingFont, setApplyingFont] = useState(null);
  const [isClient, setIsClient] = useState(false);
  const containerRef = useRef(null);

  const filteredFonts = useMemo(
    () =>
      ALL_FONTS.filter((font) => {
        const matchesSearch = font.nombre
          .toLowerCase()
          .includes(searchTerm.toLowerCase());
        const matchesCategory =
          selectedCategory === 'all' || font.categoria === selectedCategory;
        return matchesSearch && matchesCategory;
      }),
    [searchTerm, selectedCategory]
  );

  useEffect(() => {
    setIsClient(true);
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen) return;

    const fontsToWarm = filteredFonts
      .slice(0, INITIAL_PRELOAD_COUNT)
      .map((font) => font.valor);

    if (!fontsToWarm.length) return;
    void fontManager.loadFonts(fontsToWarm);
  }, [isOpen, filteredFonts]);

  const handleSelect = useCallback(
    async (fontValue) => {
      if (!fontValue || applyingFont) return;

      setApplyingFont(fontValue);
      try {
        await onFontChange(fontValue);
      } finally {
        setApplyingFont(null);
      }
    },
    [applyingFont, onFontChange]
  );

  const panelNode = (
    <div
      ref={containerRef}
      className={`${panelStyle ? "fixed" : "absolute top-full left-0 mt-2"} bg-white border border-gray-200 rounded-2xl shadow-xl p-4 w-80 max-h-[500px] overflow-hidden popup-fuente z-50 ${
        isOpen ? 'block' : 'hidden'
      }`}
      style={panelStyle || undefined}
    >
      <input
        type="text"
        placeholder="Buscar fuente..."
        value={searchTerm}
        onChange={(event) => setSearchTerm(event.target.value)}
        className="w-full px-3 py-2 border rounded-lg text-sm mb-3"
        autoFocus
      />

      <div className="overflow-y-auto max-h-[350px] -mx-2 px-2">
        {filteredFonts.length > 0 ? (
          filteredFonts.map((fuente) => (
            <FontItem
              key={fuente.valor}
              font={fuente}
              isActive={currentFont === fuente.valor}
              isApplying={applyingFont === fuente.valor}
              isDisabled={Boolean(applyingFont && applyingFont !== fuente.valor)}
              onSelect={() => handleSelect(fuente.valor)}
            />
          ))
        ) : (
          <p className="text-gray-500 text-center py-4">No se encontraron fuentes</p>
        )}
      </div>
    </div>
  );

  if (panelStyle && isClient && typeof document !== "undefined") {
    return createPortal(panelNode, document.body);
  }

  return panelNode;
});

const FontItem = memo(({ font, isActive, onSelect, isApplying, isDisabled }) => {
  const [isLoaded, setIsLoaded] = useState(() =>
    fontManager.isFontAvailable(font.valor)
  );
  const [isLoading, setIsLoading] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const itemRef = useRef(null);

  const loadPreviewFont = useCallback(async () => {
    if (isLoaded || isLoading) return isLoaded;

    setIsLoading(true);
    setLoadFailed(false);

    try {
      const result = await fontManager.loadFonts([font.valor]);
      const hasFailure = Array.isArray(result?.failed) && result.failed.length > 0;
      const ready = fontManager.isFontAvailable(font.valor);
      setIsLoaded(ready);
      setLoadFailed(!ready && hasFailure);
      return ready;
    } catch {
      setLoadFailed(true);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [font.valor, isLoaded, isLoading]);

  useEffect(() => {
    setIsLoaded(fontManager.isFontAvailable(font.valor));
    setLoadFailed(false);
  }, [font.valor]);

  useEffect(() => {
    if (!itemRef.current || isLoaded) return;

    if (typeof IntersectionObserver === 'undefined') {
      void loadPreviewFont();
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry?.isIntersecting) return;

        void loadPreviewFont();
        observer.disconnect();
      },
      { threshold: 0.15, rootMargin: '120px 0px' }
    );

    observer.observe(itemRef.current);
    return () => observer.disconnect();
  }, [isLoaded, loadPreviewFont]);

  const handleClick = async () => {
    if (isDisabled) return;

    if (!isLoaded) {
      await loadPreviewFont();
    }

    await onSelect();
  };

  const showSpinner = isLoading || isApplying;

  return (
    <div
      ref={itemRef}
      onClick={handleClick}
      onMouseEnter={() => {
        if (!isLoaded && !isLoading) {
          void loadPreviewFont();
        }
      }}
      className={`flex items-center justify-between px-3 py-2 rounded-md transition-colors duration-150 ${
        isDisabled ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'
      } ${isActive ? 'bg-purple-50' : 'hover:bg-gray-50'}`}
      title={font.valor}
    >
      <div className="flex flex-col flex-1 min-w-0">
        <span
          className="text-sm text-gray-800 truncate"
          style={{ fontFamily: font.valor }}
        >
          {font.nombre}
        </span>
        <span className="text-[11px] text-gray-500">{font.categoria}</span>
      </div>

      <div className="flex items-center gap-2 ml-2">
        <span
          className="text-lg text-gray-400"
          style={{
            fontFamily: font.valor,
            lineHeight: 1,
          }}
        >
          AaBbCc
        </span>

        {showSpinner && (
          <div className="w-4 h-4 border-2 border-gray-300 border-t-transparent rounded-full animate-spin" />
        )}

        {!showSpinner && isActive && <Check className="w-4 h-4 text-purple-600" />}

        {!showSpinner && loadFailed && !isLoaded && (
          <span className="text-[10px] text-amber-600">Lento</span>
        )}
      </div>
    </div>
  );
});

FontItem.displayName = 'FontItem';
FontSelector.displayName = 'FontSelector';

export default FontSelector;
