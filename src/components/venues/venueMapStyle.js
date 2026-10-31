export const VENUE_MAP_STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";

const isNameKey = (key) => /^name(?::[\w-]+|_[\w-]+)?$/.test(key);

function usesPlaceName(expression) {
  if (typeof expression === "string") return [...expression.matchAll(/\{([^{}]+)\}/g)].some((match) => isNameKey(match[1]));
  if (!Array.isArray(expression)) return false;
  if (expression[0] === "get" && isNameKey(expression[1])) return true;
  return expression.some(usesPlaceName);
}

const spanishName = (fallback) => ["coalesce", ["get", "name:es"], ["get", "name_es"], fallback];

function localizeTokenField(text) {
  // MapLibre expands tokens only in a top-level string, not in an expression.
  // Convert each token so missing translations still show the actual property;
  // surrounding text and route references retain their original positions.
  const parts = [];
  let end = 0;
  for (const match of text.matchAll(/\{([^{}]+)\}/g)) {
    if (match.index > end) parts.push(text.slice(end, match.index));
    const property = ["get", match[1]];
    parts.push(["to-string", isNameKey(match[1]) ? spanishName(property) : property]);
    end = match.index + match[0].length;
  }
  if (end < text.length) parts.push(text.slice(end));
  return parts.length === 1 ? parts[0] : ["concat", ...parts];
}

// Localize the existing label itself. Road references and non-name labels keep
// their original expressions; this does not add an overlay or invent map data.
export function spanishVenueMapStyle(style) {
  if (style?.version !== 8 || !Array.isArray(style.layers) || !style.sources) {
    throw new Error("Invalid venue map style");
  }
  return { ...style, projection: { type: "mercator" }, layers: style.layers.map((layer) => {
    const original = layer.layout?.["text-field"];
    if (!usesPlaceName(original)) return layer;
    return { ...layer, layout: { ...layer.layout, "text-field": typeof original === "string"
      ? localizeTokenField(original) : spanishName(original) } };
  }) };
}

// The base renderer receives only camera coordinates, never provider records.
// Apply this to styles, source metadata, tiles, glyphs and sprites alike.
export function venueMapRequest(url) {
  if (new URL(url).origin !== "https://tiles.openfreemap.org") {
    throw new Error("Unexpected venue map resource origin");
  }
  return { url, credentials: "omit", referrerPolicy: "origin" };
}

export function venueMapCamera(view) {
  // MapLibre uses a 512px world at zoom zero; the overlay owner uses 256px.
  return { center: [view.lng, view.lat], zoom: view.zoom - 1, bearing: 0, pitch: 0 };
}
