const TILE_SIZE = 256;
export const MIN_MAP_ZOOM = 3;
export const MAX_MAP_ZOOM = 17;
export const ARGENTINA_MAP_VIEW = { lat: -38.4, lng: -64, zoom: 4 };

// These coordinates come exclusively from the approved directory projection.
// That server boundary removes coordinates unless they have been verified.
export function venueMapPoints(items = []) {
  return items.flatMap((item) => {
    const content = item.content || item;
    const coordinates = content.ubicacion?.coordenadas;
    if (!Number.isSafeInteger(item.approvedRevision) || item.approvedRevision < 1 ||
        !Number.isFinite(coordinates?.latitud) || !Number.isFinite(coordinates?.longitud) ||
        Math.abs(coordinates.latitud) > 85.05112878 || Math.abs(coordinates.longitud) > 180) return [];
    return [{ id: item.id, name: content.nombre, lat: coordinates.latitud, lng: coordinates.longitud,
      location: [content.ubicacion?.ciudad, content.ubicacion?.provincia].filter(Boolean).join(", ") }];
  });
}

export function mapProject({ lat, lng }, zoom) {
  const scale = TILE_SIZE * 2 ** zoom;
  const latitude = Math.max(-85.05112878, Math.min(85.05112878, lat)) * Math.PI / 180;
  return { x: (lng + 180) / 360 * scale,
    y: (1 - Math.log(Math.tan(latitude) + 1 / Math.cos(latitude)) / Math.PI) / 2 * scale };
}

export function mapUnproject({ x, y }, zoom) {
  const scale = TILE_SIZE * 2 ** zoom;
  const boundedY = Math.max(0, Math.min(scale, y));
  return { lng: Math.max(-180, Math.min(180, x / scale * 360 - 180)),
    lat: Math.atan(Math.sinh(Math.PI * (1 - 2 * boundedY / scale))) * 180 / Math.PI };
}

export function panMap(view, dx, dy) {
  const center = mapProject(view, view.zoom);
  return { ...mapUnproject({ x: center.x + dx, y: center.y + dy }, view.zoom), zoom: view.zoom };
}

export function fitVenueMap(points, width, height) {
  if (!points.length || width <= 0 || height <= 0) return { ...ARGENTINA_MAP_VIEW };
  if (points.length === 1) return { lat: points[0].lat, lng: points[0].lng, zoom: 13 };
  const projected = points.map((point) => mapProject(point, 0));
  const minX = Math.min(...projected.map((point) => point.x));
  const maxX = Math.max(...projected.map((point) => point.x));
  const minY = Math.min(...projected.map((point) => point.y));
  const maxY = Math.max(...projected.map((point) => point.y));
  const scale = Math.min(Math.max(1, width - 180) / Math.max(0.001, maxX - minX),
    Math.max(1, height - 200) / Math.max(0.001, maxY - minY));
  const zoom = Math.max(MIN_MAP_ZOOM, Math.min(14, Math.floor(Math.log2(scale))));
  return { ...mapUnproject({ x: (minX + maxX) / 2, y: (minY + maxY) / 2 }, 0), zoom };
}

export function visibleMapTiles(view, width, height) {
  if (width <= 0 || height <= 0) return [];
  const center = mapProject(view, view.zoom);
  const origin = { x: center.x - width / 2, y: center.y - height / 2 };
  const count = 2 ** view.zoom;
  const tiles = [];
  for (let y = Math.max(0, Math.floor(origin.y / TILE_SIZE)); y <= Math.min(count - 1, Math.floor((origin.y + height) / TILE_SIZE)); y += 1) {
    for (let x = Math.max(0, Math.floor(origin.x / TILE_SIZE)); x <= Math.min(count - 1, Math.floor((origin.x + width) / TILE_SIZE)); x += 1) {
      tiles.push({ id: `${view.zoom}/${x}/${y}`, left: x * TILE_SIZE - origin.x, top: y * TILE_SIZE - origin.y });
    }
  }
  return tiles;
}

export function groupVenueMapPoints(points, zoom) {
  // At most one directory page (24 records). Connected overlap groups ensure
  // two clickable markers never cover one another, including chains of points.
  const pixels = Number.isInteger(zoom) ? points.map((point) => mapProject(point, zoom)) : null;
  const parents = points.map((_point, index) => index);
  const root = (index) => {
    while (parents[index] !== index) index = parents[index];
    return index;
  };
  for (let index = 0; index < points.length; index += 1) {
    for (let next = index + 1; next < points.length; next += 1) {
      const overlap = pixels
        ? Math.abs(pixels[index].x - pixels[next].x) < 48 && Math.abs(pixels[index].y - pixels[next].y) < 48
        : points[index].lat === points[next].lat && points[index].lng === points[next].lng;
      if (overlap) {
        const first = root(index), second = root(next);
        parents[Math.max(first, second)] = Math.min(first, second);
      }
    }
  }
  const groups = new Map();
  points.forEach((point, index) => {
    const representative = points[root(index)];
    const key = `${representative.lat},${representative.lng}`;
    // Keep an actual verified coordinate as the marker anchor, never an average
    // or a displaced location invented to separate business markers.
    const group = groups.get(key) || { key, lat: representative.lat, lng: representative.lng, sameLocation: true, points: [] };
    group.sameLocation &&= point.lat === representative.lat && point.lng === representative.lng;
    group.points.push(point); groups.set(key, group);
  });
  return [...groups.values()];
}
