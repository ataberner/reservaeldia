import WebFont from 'webfontloader';
import { GOOGLE_FONTS } from '@/config/fonts';

const SYSTEM_FONTS = new Set([
  'arial',
  'helvetica',
  'verdana',
  'tahoma',
  'trebuchet ms',
  'georgia',
  'times new roman',
  'courier new',
  'lucida console',
  'comic sans ms',
  'impact',
  'sans-serif',
  'serif',
  'monospace',
]);

const DEFAULT_TIMEOUT_MS = 12000;

class FontManager {
  constructor() {
    this.loadedFonts = new Set();
    this.fontCache = new Map();
    this.loadingPromises = new Map();
    this.failedFonts = new Set();
    this.googleFontSet = new Set(
      GOOGLE_FONTS.map((font) => this.normalizeFontName(font?.nombre))
    );
  }

  normalizeFontName(fontFamily) {
    if (!fontFamily) return '';
    return String(fontFamily)
      .replace(/['"]/g, '')
      .split(',')[0]
      .trim();
  }

  categorizeFont(fontFamily) {
    const fontName = this.normalizeFontName(fontFamily);

    if (!fontName) {
      return { type: 'system', name: 'sans-serif' };
    }

    if (SYSTEM_FONTS.has(fontName.toLowerCase())) {
      return { type: 'system', name: fontName };
    }

    if (this.googleFontSet.has(fontName)) {
      return { type: 'google', name: fontName };
    }

    return { type: 'custom', name: fontName };
  }

  waitForDocumentFont(fontName, timeoutMs = DEFAULT_TIMEOUT_MS) {
    if (typeof document === 'undefined' || !document.fonts?.load) {
      return Promise.resolve();
    }

    const loadPromise = document.fonts.load(`16px "${fontName}"`);
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
      return loadPromise.then(() => undefined);
    }

    const timeoutPromise = new Promise((resolve) => {
      setTimeout(resolve, timeoutMs);
    });

    return Promise.race([loadPromise, timeoutPromise]).then(() => undefined);
  }

  async loadGoogleFont(fontName, options = {}) {
    const normalizedName = this.normalizeFontName(fontName);
    const timeoutMs =
      Number.isFinite(options.timeoutMs) && options.timeoutMs > 0
        ? options.timeoutMs
        : DEFAULT_TIMEOUT_MS;

    if (!normalizedName) return Promise.resolve();

    if (this.loadedFonts.has(normalizedName)) {
      this.loadedFonts.add(normalizedName);
      this.failedFonts.delete(normalizedName);
      return Promise.resolve();
    }

    if (this.loadingPromises.has(normalizedName)) {
      return this.loadingPromises.get(normalizedName);
    }

    const loadPromise = new Promise((resolve, reject) => {
      WebFont.load({
        google: {
          families: [`${normalizedName}:400,700`],
        },
        active: () => {
          this.waitForDocumentFont(normalizedName, timeoutMs)
            .finally(() => {
              this.loadedFonts.add(normalizedName);
              this.failedFonts.delete(normalizedName);
              this.loadingPromises.delete(normalizedName);
              this.forceCanvasRedraw();
              resolve();
            });
        },
        inactive: () => {
          this.loadingPromises.delete(normalizedName);
          this.failedFonts.add(normalizedName);
          reject(new Error(`No se pudo cargar la fuente: ${normalizedName}`));
        },
        timeout: timeoutMs,
      });
    });

    this.loadingPromises.set(normalizedName, loadPromise);
    return loadPromise;
  }

  async loadFonts(fontFamilies = [], options = {}) {
    const loaded = [];
    const failed = [];
    const uniqueFonts = [...new Set(fontFamilies.map((font) => String(font || '').trim()))].filter(Boolean);

    if (!uniqueFonts.length) {
      return { loaded, failed };
    }

    const pendingNames = [];
    const pendingPromises = [];

    uniqueFonts.forEach((fontFamily) => {
      const { type, name } = this.categorizeFont(fontFamily);
      if (!name) return;

      if (type === 'system') {
        this.loadedFonts.add(name);
        this.failedFonts.delete(name);
        loaded.push(name);
        return;
      }

      if (this.loadedFonts.has(name)) {
        this.loadedFonts.add(name);
        this.failedFonts.delete(name);
        loaded.push(name);
        return;
      }

      if (type !== 'google') {
        this.failedFonts.add(name);
        failed.push(name);
        return;
      }

      pendingNames.push(name);
      pendingPromises.push(this.loadGoogleFont(name, options));
    });

    if (!pendingPromises.length) {
      return {
        loaded: [...new Set(loaded)],
        failed: [...new Set(failed)],
      };
    }

    const settled = await Promise.allSettled(pendingPromises);

    settled.forEach((result, index) => {
      const fontName = pendingNames[index];
      const ready = this.isFontAvailable(fontName);

      if (result.status === 'fulfilled' || ready) {
        this.loadedFonts.add(fontName);
        this.failedFonts.delete(fontName);
        loaded.push(fontName);
      } else {
        this.failedFonts.add(fontName);
        failed.push(fontName);
      }
    });

    return {
      loaded: [...new Set(loaded)],
      failed: [...new Set(failed)],
    };
  }

  async preloadPopularFonts() {
    const popularFonts = [
      'Poppins',
      'Roboto',
      'Open Sans',
      'Montserrat',
      'Raleway',
      'Lato',
      'Playfair Display',
      'Oswald',
      'Libre Bodoni',
      'Bodoni Moda',
    ];

    return this.loadFonts(popularFonts);
  }

  forceCanvasRedraw() {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new CustomEvent('fonts-loaded'));
  }

  isFontAvailable(fontFamily) {
    const { type, name } = this.categorizeFont(fontFamily);

    if (type === 'system') return true;
    if (!name) return false;
    if (this.loadedFonts.has(name)) return true;
    if (type === 'google') return false;

    if (typeof document !== 'undefined' && document.fonts?.check) {
      try {
        const available = document.fonts.check(`16px "${name}"`);
        if (available) {
          this.loadedFonts.add(name);
          this.failedFonts.delete(name);
          return true;
        }
      } catch {
        return false;
      }
    }

    return false;
  }

  getGoogleFontsLink(fontFamilies = []) {
    const families = fontFamilies
      .map((font) => this.normalizeFontName(font))
      .filter((name) => this.googleFontSet.has(name))
      .map((name) => `family=${encodeURIComponent(`${name}:wght@400;700`.replace(/ /g, '+'))}`)
      .join('&');

    if (!families) return '';

    const url = `https://fonts.googleapis.com/css2?${families}&display=swap`;
    return `
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="${url}" rel="stylesheet">`.trim();
  }

  getLoadedFontsCSS() {
    const googleFonts = Array.from(this.loadedFonts);
    if (googleFonts.length === 0) return '';

    const families = googleFonts
      .map((font) => `family=${encodeURIComponent(`${font}:wght@300;400;500;600;700`.replace(/ /g, '+'))}`)
      .join('&');

    return `https://fonts.googleapis.com/css2?${families}&display=swap`;
  }
}

export const fontManager = new FontManager();
