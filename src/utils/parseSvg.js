// src/utils/parseSvg.js
export async function fetchSvgPaths(svgUrl) {
  const res = await fetch(svgUrl);
  if (!res.ok) throw new Error(`No se pudo cargar el SVG: ${svgUrl}`);
  const text = await res.text();

  const parser = new DOMParser();
  const doc = parser.parseFromString(text, "image/svg+xml");
  const viewBox = doc.documentElement.getAttribute("viewBox") || null;
  const width = Number(doc.documentElement.getAttribute("width") || 0) || null;
  const height = Number(doc.documentElement.getAttribute("height") || 0) || null;

  // Tomamos TODOS los <path>
  const pathNodes = Array.from(doc.querySelectorAll("path"));
  const paths = pathNodes
    .map((p) => {
      const d = p.getAttribute("d");
      if (!d) return null;
      return {
        d,
        // opcionalmente podrías leer fill/stroke originales:
        // fill: p.getAttribute("fill") || null,
        // stroke: p.getAttribute("stroke") || null,
      };
    })
    .filter(Boolean);

  // Nota: si paths queda vacío, tu SVG no trae <path>. Podés extender
  // para convertir rect/circle/ellipse/polygon a path o fallback a raster.
  return { paths, viewBox, width, height };
}
