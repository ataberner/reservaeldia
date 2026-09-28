import { normalizeGooglePlaceInput } from "./location.js";

const GOOGLE_MAPS_SCRIPT_ID = "reservaeldia-google-maps-js";
const googleMapsPlacesLoads = new WeakMap();
const failedGoogleMapsScripts = new WeakSet();
const GOOGLE_MAPS_LOAD_TIMEOUT_MS = 12_000;

function normalizeText(value) {
  return String(value || "").trim();
}

export function getGoogleMapsApiKey() {
  return normalizeText(process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY);
}

export function loadGoogleMapsPlacesLibrary({
  targetWindow = typeof window !== "undefined" ? window : null,
  apiKey = getGoogleMapsApiKey(),
} = {}) {
  if (!targetWindow?.document) {
    return Promise.reject(new Error("Google Maps solo está disponible en el navegador."));
  }
  if (!apiKey) {
    return Promise.reject(new Error("La búsqueda de Google Maps no está configurada."));
  }
  const pending = googleMapsPlacesLoads.get(targetWindow);
  if (pending) return pending;
  const documentRef = targetWindow.document;
  let script = documentRef.getElementById(GOOGLE_MAPS_SCRIPT_ID);
  const promise = new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error, library) => {
      if (settled) return;
      settled = true;
      targetWindow.clearTimeout(timer);
      script?.removeEventListener("load", resolveLibrary);
      script?.removeEventListener("error", rejectLoad);
      if (error) {
        // Never leave an already-failed script for the next caller to wait on.
        if (script) failedGoogleMapsScripts.add(targetWindow);
        script?.remove();
        reject(error);
      } else {
        failedGoogleMapsScripts.delete(targetWindow);
        resolve(library);
      }
    };
    const rejectLoad = () => finish(new Error("No pudimos cargar Google Maps."));
    const resolveLibrary = () => {
      Promise.resolve().then(() => {
        if (settled) return undefined;
        if (!targetWindow.google?.maps?.importLibrary) throw new Error("Places unavailable");
        return targetWindow.google.maps.importLibrary("places");
      }).then((library) => finish(null, library), rejectLoad);
    };
    // Includes both the script and importLibrary; late callbacks cannot revive it.
    const timer = targetWindow.setTimeout(rejectLoad, GOOGLE_MAPS_LOAD_TIMEOUT_MS);
    if (targetWindow.google?.maps?.importLibrary && !failedGoogleMapsScripts.has(targetWindow)) {
      resolveLibrary();
      return;
    }
    const isNew = !script;
    if (isNew) {
      script = documentRef.createElement("script");
      script.id = GOOGLE_MAPS_SCRIPT_ID;
      script.async = true;
      script.defer = true;
      script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(
        apiKey
      )}&libraries=places&v=weekly&language=es-419&region=AR&loading=async`;
    }
    script.addEventListener("load", resolveLibrary);
    script.addEventListener("error", rejectLoad);
    if (isNew) documentRef.head.appendChild(script);
  });
  const shared = promise.finally(() => {
    if (googleMapsPlacesLoads.get(targetWindow) === shared) googleMapsPlacesLoads.delete(targetWindow);
  });
  googleMapsPlacesLoads.set(targetWindow, shared);
  return shared;
}

export function placePredictionToLabel(prediction) {
  const mainText = normalizeGooglePlaceInput({
    displayName: prediction?.structuredFormat?.mainText?.text,
  }).displayName;
  const secondaryText = normalizeText(
    prediction?.structuredFormat?.secondaryText?.text || prediction?.secondaryText
  );
  const fallback = normalizeText(prediction?.text || prediction?.description);
  if (mainText && secondaryText) return `${mainText} - ${secondaryText}`;
  return mainText || fallback;
}

export async function fetchGooglePlaceSuggestions(
  input,
  sessionToken,
  { loadLibrary = loadGoogleMapsPlacesLibrary, targetWindow = typeof window !== "undefined" ? window : null } = {}
) {
  const query = normalizeText(input);
  if (query.length < 3) return [];

  const places = await loadLibrary({ targetWindow });
  const AutocompleteSuggestion =
    places?.AutocompleteSuggestion ||
    targetWindow?.google?.maps?.places?.AutocompleteSuggestion;
  if (!AutocompleteSuggestion?.fetchAutocompleteSuggestions) return [];

  const result = await AutocompleteSuggestion.fetchAutocompleteSuggestions({
    input: query,
    language: "es-419",
    region: "ar",
    sessionToken,
  });
  return (Array.isArray(result?.suggestions) ? result.suggestions : [])
    .map((suggestion, index) => {
      const prediction = suggestion?.placePrediction;
      if (!prediction) return null;
      return {
        id: normalizeText(prediction.placeId || prediction.id || index),
        label: placePredictionToLabel(prediction),
        prediction,
      };
    })
    .filter((entry) => entry?.label);
}

export async function fetchGooglePlaceDetailsFromPrediction(prediction) {
  if (!prediction?.toPlace) return normalizeGooglePlaceInput(prediction);
  const place = prediction.toPlace();
  await place.fetchFields({
    fields: ["id", "displayName", "formattedAddress", "addressComponents", "location"],
  });
  return normalizeGooglePlaceInput(place);
}

export async function createGooglePlacesSessionToken({
  loadLibrary = loadGoogleMapsPlacesLibrary,
  targetWindow = typeof window !== "undefined" ? window : null,
} = {}) {
  const places = await loadLibrary({ targetWindow });
  const TokenClass =
    places?.AutocompleteSessionToken ||
    targetWindow?.google?.maps?.places?.AutocompleteSessionToken;
  return TokenClass ? new TokenClass() : null;
}
