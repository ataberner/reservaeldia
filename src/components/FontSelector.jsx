// components/FontSelector.jsx
import { useState, useEffect, useRef, memo } from 'react';
import { Check } from 'lucide-react';
import { fontManager } from '../utils/fontManager';
import { ALL_FONTS } from '../config/fonts';

const FontSelector = memo(({ 
  currentFont, 
  onFontChange, 
  isOpen, 
  onClose 
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const containerRef = useRef(null);

  const categories = ['all', 'Sans Serif', 'Serif', 'Display', 'Monospace'];
  
  const filteredFonts = ALL_FONTS.filter(font => {
    const matchesSearch = font.nombre.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = selectedCategory === 'all' || font.categoria === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  if (!isOpen) return null;

  return (
    <div 
      ref={containerRef}
      className="absolute top-full left-0 mt-2 bg-white border rounded-2xl shadow-xl p-4 w-80 max-h-[500px] overflow-hidden popup-fuente z-50"
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

      {/* Categorías */}
      <div className="flex gap-1 mb-3 overflow-x-auto">
        {categories.map(cat => (
          <button
            key={cat}
            onClick={() => setSelectedCategory(cat)}
            className={`px-3 py-1 text-xs rounded-full whitespace-nowrap transition-colors ${
              selectedCategory === cat
                ? 'bg-purple-600 text-white'
                : 'bg-gray-100 hover:bg-gray-200'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Lista de fuentes */}
      <div className="overflow-y-auto max-h-[350px] -mx-2 px-2">
        {filteredFonts.length > 0 ? (
          filteredFonts.map((fuente) => (
            <FontItem
              key={fuente.valor}
              font={fuente}
              isActive={currentFont === fuente.valor}
              onSelect={async () => {
                await onFontChange(fuente.valor);
                onClose();
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

// Componente individual para cada fuente
const FontItem = memo(({ font, isActive, onSelect }) => {
  const [isLoaded, setIsLoaded] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    setIsLoaded(fontManager.isFontAvailable(font.valor));
  }, [font.valor]);

  const handleClick = async () => {
    if (!isLoaded) {
      setIsLoading(true);
      try {
        await fontManager.loadFonts([font.valor]);
        setIsLoaded(true);
      } catch (error) {
        console.error("Error cargando fuente:", error);
      }
      setIsLoading(false);
    }
    onSelect();
  };

  return (
    <div
      onClick={handleClick}
      className={`flex items-center gap-2 px-2 py-2 rounded cursor-pointer transition-all ${
        isLoaded ? 'hover:bg-gray-100' : 'hover:bg-gray-50 opacity-70'
      }`}
    >
      <span className="text-xs text-gray-500 w-16 flex-shrink-0">
        {font.categoria}
      </span>
      
      <span 
        className="text-sm text-gray-700 flex-1"
        style={{ fontFamily: isLoaded ? font.valor : 'sans-serif' }}
      >
        {font.nombre}
      </span>
      
      <span
        className="text-base text-gray-400"
        style={{ 
          fontFamily: isLoaded ? font.valor : 'sans-serif',
          minWidth: '60px' 
        }}
      >
        Aa
      </span>
      
      {isActive && <Check className="w-4 h-4 text-purple-600" />}
      
      {isLoading && (
        <div className="w-4 h-4 border-2 border-gray-300 border-t-transparent rounded-full animate-spin" />
      )}
    </div>
  );
});

FontItem.displayName = 'FontItem';
FontSelector.displayName = 'FontSelector';

export default FontSelector;