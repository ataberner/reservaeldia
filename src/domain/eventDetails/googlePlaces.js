import { normalizeGooglePlaceInput } from "./location.js";

const GOOGLE_MAPS_SCRIPT_ID = "reservaeldia-google-maps-js";
let googleMapsPlacesLoaderPromise = null;

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
  if (targetWindow.google?.maps?.importLibrary) {
    return targetWindow.google.maps.importLibrary("places");
  }
  if (googleMapsPlacesLoaderPromise) return googleMapsPlacesLoaderPromise;

  googleMapsPlacesLoaderPromise = new Promise((resolve, reject) => {
    const documentRef = targetWindow.document;
    const existingScript = documentRef.getElementById(GOOGLE_MAPS_SCRIPT_ID);
    const resolveLibrary = () => {
      if (targetWindow.google?.maps?.importLibrary) {
        resolve(targetWindow.google.maps.importLibrary("places"));
      } else {
        reject(new Error("Google Maps no expuso la biblioteca de Places."));
      }
    };
    if (existingScript) {
      existingScript.addEventListener("load", resolveLibrary, { once: true });
      existingScript.addEventListener(
        "error",
        () => reject(new Error("No se pudo cargar Google Maps.")),
        { once: true }
      );
      return;
    }

    const script = documentRef.createElement("script");
    script.id = GOOGLE_MAPS_SCRIPT_ID;
    script.async = true;
    script.defer = true;
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(
      apiKey
    )}&libraries=places&v=weekly&language=es-419&region=AR&loading=async`;
    script.onload = resolveLibrary;
    script.onerror = () => reject(new Error("No se pudo cargar Google Maps."));
    documentRef.head.appendChild(script);
  }).catch((error) => {
    googleMapsPlacesLoaderPromise = null;
    throw error;
  });

  return googleMapsPlacesLoaderPromise;
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
