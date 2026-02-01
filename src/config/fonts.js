// src/config/fonts.js
export const SYSTEM_FONTS = [
  { nombre: "Arial", valor: "Arial, sans-serif", categoria: "Sans Serif" },
  { nombre: "Helvetica", valor: "Helvetica, sans-serif", categoria: "Sans Serif" },
  { nombre: "Verdana", valor: "Verdana, sans-serif", categoria: "Sans Serif" },
  { nombre: "Georgia", valor: "Georgia, serif", categoria: "Serif" },
  { nombre: "Times New Roman", valor: "'Times New Roman', serif", categoria: "Serif" },
  { nombre: "Courier New", valor: "'Courier New', monospace", categoria: "Monospace" },
];

export const GOOGLE_FONTS = [
  // Sans Serif
  { nombre: "Poppins", valor: "Poppins", categoria: "Sans Serif" },
  { nombre: "Roboto", valor: "Roboto", categoria: "Sans Serif" },
  { nombre: "Open Sans", valor: "'Open Sans'", categoria: "Sans Serif" },
  { nombre: "Montserrat", valor: "Montserrat", categoria: "Sans Serif" },
  { nombre: "Raleway", valor: "Raleway", categoria: "Sans Serif" },
  { nombre: "Lato", valor: "Lato", categoria: "Sans Serif" },
  { nombre: "Nunito", valor: "Nunito", categoria: "Sans Serif" },
  { nombre: "Ubuntu", valor: "Ubuntu", categoria: "Sans Serif" },
  { nombre: "Quicksand", valor: "Quicksand", categoria: "Sans Serif" },
  { nombre: "Bebas Neue", valor: "'Bebas Neue'", categoria: "Sans Serif" },
  
  // Serif
  { nombre: "Playfair Display", valor: "'Playfair Display'", categoria: "Serif" },
  { nombre: "Merriweather", valor: "Merriweather", categoria: "Serif" },
  { nombre: "Lora", valor: "Lora", categoria: "Serif" },
  { nombre: "PT Serif", valor: "'PT Serif'", categoria: "Serif" },
  { nombre: "Crimson Text", valor: "'Crimson Text'", categoria: "Serif" },
  { nombre: "Libre Bodoni", valor: "'Libre Bodoni'", categoria: "Serif" },
  { nombre: "Bodoni Moda", valor: "'Bodoni Moda'", categoria: "Serif" },


  
  // Display
  { nombre: "Lobster", valor: "Lobster", categoria: "Display" },
  { nombre: "Pacifico", valor: "Pacifico", categoria: "Display" },
  { nombre: "Dancing Script", valor: "'Dancing Script'", categoria: "Display" },
  { nombre: "Great Vibes", valor: "'Great Vibes'", categoria: "Display" },
  { nombre: "Abril Fatface", valor: "'Abril Fatface'", categoria: "Display" },
  
  // Monospace
  { nombre: "Roboto Mono", valor: "'Roboto Mono'", categoria: "Monospace" },
  { nombre: "Source Code Pro", valor: "'Source Code Pro'", categoria: "Monospace" },
  { nombre: "JetBrains Mono", valor: "'JetBrains Mono'", categoria: "Monospace" },
];

export const ALL_FONTS = [...SYSTEM_FONTS, ...GOOGLE_FONTS];