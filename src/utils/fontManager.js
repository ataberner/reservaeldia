// src/utils/fontManager.js
import WebFont from 'webfontloader';
import { GOOGLE_FONTS } from '@/config/fonts';


class FontManager {
  constructor() {
    this.loadedFonts = new Set();
    this.fontCache = new Map();
    this.loadingPromises = new Map();

     // 🔑 lista de Google Fonts permitidas
  this.googleFontSet = new Set(GOOGLE_FONTS.map(f => f.nombre));
  }

  // Categorizar fuentes por tipo
  categorizeFont(fontFamily) {
    const systemFonts = [
      'Arial', 'Helvetica', 'Verdana', 'Tahoma', 'Trebuchet MS',
      'Georgia', 'Times New Roman', 'Courier New', 'Lucida Console',
      'Comic Sans MS', 'Impact', 'sans-serif', 'serif', 'monospace'
    ];
    
    const fontName = fontFamily.replace(/['"]/g, '').split(',')[0].trim();
    
    if (systemFonts.includes(fontName)) {
      return { type: 'system', name: fontName };
    }
    
    return { type: 'google', name: fontName };
  }

  // Cargar fuente de Google Fonts
  async loadGoogleFont(fontName) {
    // Si ya está cargada, retornar inmediatamente
    if (this.loadedFonts.has(fontName)) {
      return Promise.resolve();
    }

    // Si ya está cargándose, retornar la promesa existente
    if (this.loadingPromises.has(fontName)) {
      return this.loadingPromises.get(fontName);
    }

    // Crear nueva promesa de carga
    const loadPromise = new Promise((resolve, reject) => {
      WebFont.load({
        google: {
          families: [`${fontName}:300,400,500,600,700,800,900`]
        },
        active: () => {
          this.loadedFonts.add(fontName);
          this.loadingPromises.delete(fontName);
          
          // Forzar redibujado del canvas después de cargar la fuente
          this.forceCanvasRedraw();
          
          resolve();
        },
        inactive: () => {
          this.loadingPromises.delete(fontName);
          reject(new Error(`No se pudo cargar la fuente: ${fontName}`));
        },
        timeout: 5000
      });
    });

    this.loadingPromises.set(fontName, loadPromise);
    return loadPromise;
  }

  // src/utils/fontManager.js  ➜  sustituí todo el método loadFonts()

/**
 * Carga varias fuentes Google de una sola vez.
 * – Agrupa las que todavía no están cargadas.
 * – Si ya existe una promesa para alguna, la reutiliza.
 * – Devuelve una promesa que siempre se resuelve (Promise.allSettled).
 */
async loadFonts(fontFamilies = []) {
  const familiasPendientes   = [];
  const promesasAEsperar     = [];

  fontFamilies.forEach((ff) => {
    const { type, name } = this.categorizeFont(ff);

    // Fuentes de sistema: nada que hacer
    if (type === "system") return;

    // Ya cargada: nada que hacer
    if (this.loadedFonts.has(name)) return;

    // Ya se está cargando: reutilizar promesa existente
    if (this.loadingPromises.has(name)) {
      promesasAEsperar.push(this.loadingPromises.get(name));
      return;
    }

    // Primera vez que se pide → la metemos al batch
    familiasPendientes.push(name);
  });

  /* ------------------------------------------------------------------ */
  // Si no hay nada nuevo que pedir, simplemente esperamos las existentes
  if (familiasPendientes.length === 0) {
    return Promise.allSettled(promesasAEsperar);
  }

  /* ------------------------------------------------------------------ */
  // Creamos UNA sola promesa para todo el lote
  const lotePromise = new Promise((resolve, reject) => {
    WebFont.load({
      google: {
        families: familiasPendientes.map(
          (n) => `${n}:300,400,500,600,700,800,900`
        ),
      },
      active: () => {
        // Marcamos todas como cargadas
        familiasPendientes.forEach((n) => this.loadedFonts.add(n));
        familiasPendientes.forEach((n) => this.loadingPromises.delete(n));

        this.forceCanvasRedraw();
        resolve();
      },
      inactive: () => {
        familiasPendientes.forEach((n) => this.loadingPromises.delete(n));
        reject(
          new Error(
            `No se pudieron cargar una o más fuentes: ${familiasPendientes.join(
              ", "
            )}`
          )
        );
      },
      timeout: 5000,
    });
  });

  // Ponemos la misma promesa en el map para cada fuente del lote
  familiasPendientes.forEach((n) => this.loadingPromises.set(n, lotePromise));
  promesasAEsperar.push(lotePromise);

  return Promise.allSettled(promesasAEsperar);
}


  // Pre-cargar fuentes populares
  async preloadPopularFonts() {
    const popularFonts = [
      'Poppins', 'Roboto', 'Open Sans', 'Montserrat', 
      'Raleway', 'Lato', 'Playfair Display', 'Oswald'
    ];
    
    return this.loadFonts(popularFonts);
  }

  // Forzar redibujado del canvas
  forceCanvasRedraw() {
    // Disparar evento personalizado
    window.dispatchEvent(new CustomEvent('fonts-loaded'));
  }

  // Verificar si una fuente está disponible
  isFontAvailable(fontFamily) {
    const { type, name } = this.categorizeFont(fontFamily);
    
    if (type === 'system') return true;
    
    return this.loadedFonts.has(name);
  }

  /**
   * Devuelve un bloque <link> - listo para pegar en <head> - con las
   * familias de Google Fonts usadas. Filtra genéricas y fuentes de sistema.
   *
   * @param {string[]} fontFamilies  Ej.: ["Poppins", "Great Vibes", "Georgia"]
   * @returns {string} cadena HTML o '' si no hay nada que cargar
   */
  getGoogleFontsLink(fontFamilies = []) {
    const familias = fontFamilies
      .map(f => f.replace(/['"]/g, "").split(",")[0].trim())   // "Poppins"
      .filter(n => this.googleFontSet.has(n))                  // ✅ solo Google Fonts reales
      .map(n => `family=${encodeURIComponent(n.replace(/ /g, "+"))}`)
      .join("&");

    if (!familias) return "";

    const url = `https://fonts.googleapis.com/css2?${familias}&display=swap`;
    return `
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="${url}" rel="stylesheet">`.trim();
  }



  // Obtener CSS para todas las fuentes cargadas
  getLoadedFontsCSS() {
    const googleFonts = Array.from(this.loadedFonts);
    if (googleFonts.length === 0) return '';
    
    const families = googleFonts.map(font => 
      `${font.replace(' ', '+')}:300,400,500,600,700,800,900`
    ).join('|');
    
    return `https://fonts.googleapis.com/css2?family=${families}&display=swap`;
  }
}

// Singleton
export const fontManager = new FontManager();