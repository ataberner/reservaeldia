import { resolveGoogleMapDimensions } from "./googleMapGeometry.js";

const STATIC_MAPS_BASE_URL = "https://maps.googleapis.com/maps/api/staticmap";
const STATIC_MAPS_MAX_SIZE = 640;
const STATIC_MAPS_DEFAULT_ZOOM = 15;
const STATIC_MAPS_DEFAULT_SCALE = 2;

function normalizeText(value) {
  return String(value || "").trim();
}

function toFiniteNumber(value, fallback = null) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function clampNumber(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function normalizeStaticMapZoom(value) {
  const numeric = toFiniteNumber(value, STATIC_MAPS_DEFAULT_ZOOM);
  return clampNumber(Math.round(numeric), 0, 21);
}

function normalizeCoordinate(value, min, max) {
  if (value === null || typeof value === "undefined") return null;
  if (typeof value === "string" && value.trim() === "") return null;
  const numeric = toFiniteNumber(value, null);
  if (!Number.isFinite(numeric) || numeric < min || numeric > max) return null;
  return Number(numeric.toFixed(6)).toString();
}

export function getGoogleMapsStaticApiKey(env = null) {
  if (env) {
    return normalizeText(env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY);
  }
  return normalizeText(process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY);
}

export function resolveGoogleMapsStaticLocation(obj = {}) {
  const lat = normalizeCoordinate(obj?.googleLat, -90, 90);
  const lng = normalizeCoordinate(obj?.googleLng, -180, 180);
  if (lat && lng) return `${lat},${lng}`;

  return (
    normalizeText(obj?.googleFormattedAddress) ||
    normalizeText(obj?.googleDisplayName)
  );
}

export function buildGoogleMapsStaticLocationKey(obj = {}) {
  const location = resolveGoogleMapsStaticLocation(obj);
  return location ? JSON.stringify([normalizeText(obj?.googlePlaceId), location]) : "";
}

export function buildGoogleMapsStaticImageSrc(obj = {}, options = {}) {
  const apiKey = Object.prototype.hasOwnProperty.call(options, "apiKey")
    ? normalizeText(options.apiKey)
    : getGoogleMapsStaticApiKey();
  const location = resolveGoogleMapsStaticLocation(obj);
  if (!apiKey || !location) return "";

  const dimensions = resolveGoogleMapDimensions({
    width: options.width ?? obj?.width,
    height: options.height ?? obj?.height,
  });
  // One resolution factor preserves the displayed map's aspect ratio.
  const resolutionScale = Math.min(
    1,
    STATIC_MAPS_MAX_SIZE / Math.max(dimensions.width, dimensions.height)
  );
  const width = Math.max(1, Math.round(dimensions.width * resolutionScale));
  const height = Math.max(1, Math.round(dimensions.height * resolutionScale));
  const zoom = normalizeStaticMapZoom(options.zoom ?? obj?.googleMapZoom);
  const scale = clampNumber(
    Math.round(toFiniteNumber(options.scale, STATIC_MAPS_DEFAULT_SCALE)),
    1,
    2
  );

  const params = new URLSearchParams({
    key: apiKey,
    center: location,
    zoom: String(zoom),
    size: `${width}x${height}`,
    scale: String(scale),
    maptype: "roadmap",
    language: "es-419",
    region: "AR",
  });
  params.append("markers", `color:red|${location}`);

  return `${STATIC_MAPS_BASE_URL}?${params.toString()}`;
}
