const svgPathCache = new Map();

function cloneResult(value) {
  return {
    paths: Array.isArray(value?.paths)
      ? value.paths.map((item) => ({ ...item }))
      : [],
    viewBox: value?.viewBox || null,
    width: Number.isFinite(value?.width) ? value.width : null,
    height: Number.isFinite(value?.height) ? value.height : null,
  };
}

async function fetchAndParse(svgUrl) {
  const res = await fetch(svgUrl);
  if (!res.ok) throw new Error(`No se pudo cargar el SVG: ${svgUrl}`);
  const text = await res.text();

  const parser = new DOMParser();
  const doc = parser.parseFromString(text, "image/svg+xml");
  const root = doc.documentElement;
  const viewBox = root.getAttribute("viewBox") || null;
  const width = Number(root.getAttribute("width") || 0) || null;
  const height = Number(root.getAttribute("height") || 0) || null;

  const paths = Array.from(doc.querySelectorAll("path"))
    .map((pathNode) => {
      const d = pathNode.getAttribute("d");
      if (!d) return null;
      return { d };
    })
    .filter(Boolean);

  return { paths, viewBox, width, height };
}

export async function fetchSvgPaths(svgUrl, { forceRefresh = false } = {}) {
  const key = String(svgUrl || "").trim();
  if (!key) throw new Error("URL SVG invalida");

  if (!forceRefresh && svgPathCache.has(key)) {
    const cached = await svgPathCache.get(key);
    return cloneResult(cached);
  }

  const task = fetchAndParse(key)
    .then((parsed) => {
      svgPathCache.set(key, Promise.resolve(parsed));
      return parsed;
    })
    .catch((error) => {
      svgPathCache.delete(key);
      throw error;
    });

  svgPathCache.set(key, task);
  const parsed = await task;
  return cloneResult(parsed);
}

export function clearSvgPathCache() {
  svgPathCache.clear();
}
