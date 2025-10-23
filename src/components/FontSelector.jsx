// components/FontSelector.jsx
import { useState, useEffect, useRef, memo } from 'react';
import { Check } from 'lucide-react';
import { fontManager } from '../utils/fontManager';
import { ALL_FONTS } from '../config/fonts';


console.log("✅ FontSelector file loaded");


// DEBUG: logger controlado por bandera
const DEBUG_FONTS = true;
function logFont(...args) {
  if (!DEBUG_FONTS) return;
  // Prefijo corto para buscar fácil en consola
  console.log('%c[FontDBG]', 'color:#773dbe;font-weight:bold', ...args);
}


const FontSelector = memo(({
  currentFont,
  onFontChange,
  isOpen,
  onClose
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const containerRef = useRef(null);

  const filteredFonts = ALL_FONTS.filter(font => {
    const matchesSearch = font.nombre.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = selectedCategory === 'all' || font.categoria === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  logFont('🔍 isOpen?', isOpen, 'currentFont:', currentFont);



  useEffect(() => {
    logFont('FontSelector mounted. isOpen=', isOpen, 'currentFont=', currentFont);
    // sanity check de listado recibido
    logFont('ALL_FONTS length=', ALL_FONTS?.length, 'first 5=', ALL_FONTS?.slice(0, 5));
  }, [isOpen, currentFont]);

  // log filtrado actual
  useEffect(() => {
    logFont('Filtro aplicado => term:', searchTerm, 'cat:', selectedCategory, 'resultados:', filteredFonts.length);
  }, [searchTerm, selectedCategory, filteredFonts.length]);


  // 📦 Cerrar si el usuario hace click fuera del panel
useEffect(() => {
  if (!isOpen) return;

  const handleClickOutside = (e) => {
    if (containerRef.current && !containerRef.current.contains(e.target)) {
      onClose();
    }
  };

  document.addEventListener('mousedown', handleClickOutside);
  return () => document.removeEventListener('mousedown', handleClickOutside);
}, [isOpen, onClose]);


  return (
    <div
      ref={containerRef}
      className={`absolute top-full left-0 mt-2 bg-white border border-gray-200 rounded-2xl shadow-xl p-4 w-80 max-h-[500px] overflow-hidden popup-fuente z-50 ${isOpen ? "block" : "hidden"
        }`}
    >
      
      {/* Búsqueda */}
      <input
        type="text"
        placeholder="Buscar fuente..."
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        className="w-full px-3 py-2 border rounded-lg text-sm mb-3"
        autoFocus
      />


      {/* Lista de fuentes */}
      <div className="overflow-y-auto max-h-[350px] -mx-2 px-2">
        {filteredFonts.length > 0 ? (
          filteredFonts.map((fuente, idx) => (
            <FontItem
              key={fuente.valor}
              debugIndex={idx}
              font={fuente}
              isActive={currentFont === fuente.valor}
              onSelect={async () => {
                await onFontChange(fuente.valor);
              }}

            />
          ))

        ) : (
          <p className="text-gray-500 text-center py-4">
            No se encontraron fuentes
          </p>
        )}
      </div>
    </div>
  );
});



const FontItem = memo(({ font, isActive, onSelect, debugIndex }) => {
  const [isLoaded, setIsLoaded] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const itemRef = useRef(null);

  // 1) Al montar, ver si ya está disponible en el documento
  useEffect(() => {
    const available = fontManager.isFontAvailable(font.valor);
    setIsLoaded(available);
    logFont(`#${debugIndex} mount`, { familia: font.valor, available });
  }, [font.valor]);

  // 2) Observador de visibilidad (solo logs por ahora)
  useEffect(() => {
    if (!itemRef.current) return;

    const obs = new IntersectionObserver((entries) => {
      const e = entries[0];
      logFont(
        `#${debugIndex} intersect`,
        { familia: font.valor, isIntersecting: e.isIntersecting, ratio: e.intersectionRatio }
      );
    }, { threshold: 0.1 });

    obs.observe(itemRef.current);
    return () => obs.disconnect();
  }, [font.valor, debugIndex]);

  // 3) Click: si no está cargada, log + carga, si está, log directo
  const handleClick = async () => {
    logFont(`#${debugIndex} click`, { familia: font.valor, isLoaded, isLoading });

    if (!isLoaded && !isLoading) {
      setIsLoading(true);
      try {
        logFont(`#${debugIndex} loadFonts(start)`, font.valor);
        await fontManager.loadFonts([font.valor]);
        setIsLoaded(true);
        logFont(`#${debugIndex} loadFonts(done)`, font.valor);
      } catch (error) {
        console.error("[FontDBG] loadFonts(error)", font.valor, error);
      } finally {
        setIsLoading(false);
      }
    }

    onSelect();
  };

  // 4) UI: agrego indicadores mínimos para ver estado
  return (
    <div
      ref={itemRef}
      onClick={handleClick}
      className={`flex items-center justify-between px-3 py-2 rounded-md cursor-pointer transition-colors duration-150 ${isActive ? "bg-purple-50" : "hover:bg-gray-50"
        }`}
      title={`${font.valor} — loaded:${isLoaded} loading:${isLoading}`}
    >

      <div className="flex flex-col flex-1 min-w-0">
        <span
          className="text-sm text-gray-800 truncate"
          style={{ fontFamily: isLoaded ? font.valor : "sans-serif" }}
        >
          {font.nombre}
        </span>
        <span className="text-[11px] text-gray-500">{font.categoria}</span>
      </div>

      <div className="flex items-center gap-2 ml-2">
        <span
          className="text-lg text-gray-400"
          style={{
            fontFamily: isLoaded ? font.valor : "sans-serif",
            lineHeight: 1,
          }}
        >
          AaBbCc
        </span>

        {isLoading && (
          <div className="w-4 h-4 border-2 border-gray-300 border-t-transparent rounded-full animate-spin" />
        )}

        
      </div>
    </div>
  );

});



FontItem.displayName = 'FontItem';
FontSelector.displayName = 'FontSelector';

export default FontSelector;