// src/config/fonts.js
export const SYSTEM_FONTS = [
  { nombre: "Arial", valor: "Arial, sans-serif", categoria: "Sans Serif" },
  { nombre: "Georgia", valor: "Georgia, serif", categoria: "Serif" },
  { nombre: "Times New Roman", valor: "'Times New Roman', serif", categoria: "Serif" },
];

export const GOOGLE_FONTS = [
  // Sans serif modernas para texto secundario y detalles
  { nombre: "Poppins", valor: "Poppins", categoria: "Sans Serif" },
  { nombre: "Montserrat", valor: "Montserrat", categoria: "Sans Serif" },
  { nombre: "Raleway", valor: "Raleway", categoria: "Sans Serif" },
  { nombre: "Lato", valor: "Lato", categoria: "Sans Serif" },
  { nombre: "Nunito", valor: "Nunito", categoria: "Sans Serif" },

  // Serif elegantes para titulos y nombres
  { nombre: "Playfair Display", valor: "'Playfair Display'", categoria: "Serif" },
  { nombre: "Cormorant Garamond", valor: "'Cormorant Garamond'", categoria: "Serif" },
  { nombre: "Lora", valor: "Lora", categoria: "Serif" },
  { nombre: "Libre Bodoni", valor: "'Libre Bodoni'", categoria: "Serif" },
  { nombre: "Bodoni Moda", valor: "'Bodoni Moda'", categoria: "Serif" },

  // Script / caligraficas para firmas y frases romanticas
  { nombre: "Great Vibes", valor: "'Great Vibes'", categoria: "Script" },
  { nombre: "Allura", valor: "Allura", categoria: "Script" },
  { nombre: "Parisienne", valor: "Parisienne", categoria: "Script" },
  { nombre: "Sacramento", valor: "Sacramento", categoria: "Script" },
  { nombre: "Dancing Script", valor: "'Dancing Script'", categoria: "Script" },

  // Display de acento para estilos editoriales y modernos
  { nombre: "Cinzel", valor: "Cinzel", categoria: "Display" },
  { nombre: "Abril Fatface", valor: "'Abril Fatface'", categoria: "Display" },
  { nombre: "Bebas Neue", valor: "'Bebas Neue'", categoria: "Display" },
];

// Compatibilidad: fuentes antiguas que ya existen en borradores previos.
// No se muestran en el selector principal, pero se siguen pudiendo cargar.
export const LEGACY_GOOGLE_FONT_NAMES = [
  "Roboto",
  "Open Sans",
  "Merriweather",
  "PT Serif",
  "Crimson Text",
  "Lobster",
  "Pacifico",
  "Ubuntu",
  "Quicksand",
  "Roboto Mono",
  "Source Code Pro",
  "JetBrains Mono",
];

export const ALL_FONTS = [...SYSTEM_FONTS, ...GOOGLE_FONTS];
