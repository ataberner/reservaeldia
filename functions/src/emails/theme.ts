// Email-only values. Brand colors follow docs/design/DESIGN_SYSTEM.md;
// typography and layout deliberately do not import the site's CSS or fonts.
export const emailTheme = {
  brand: "#692B9A",
  background: "#FBF7F9",
  surface: "#FFFFFF",
  text: "#262626",
  muted: "#595959",
  border: "#E5E5E5",
  fontFamily: "Arial, Helvetica, sans-serif",
  maxWidth: 600,
  spacing: { small: 8, medium: 16, large: 24, section: 32 },
} as const;

export const emailBrand = {
  name: "Reserva el Día",
  siteUrl: "https://reservaeldia.com.ar",
  siteLabel: "reservaeldia.com.ar",
} as const;
