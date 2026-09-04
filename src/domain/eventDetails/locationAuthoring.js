import {
  readCanvasEditorMethod,
  readEditorObjects,
} from "../../lib/editorRuntimeBridge.js";
import { normalizeEventDetailFeature } from "./features.js";
import {
  buildEventGoogleMapClearPatch,
  formatEventAddressText,
  normalizeGooglePlaceInput,
  resolveEventLocationFromAuthoring,
} from "./location.js";

function normalizeText(value) {
  return String(value || "").trim();
}

function requireEditorMethod(targetWindow, name) {
  const method = readCanvasEditorMethod(name, targetWindow);
  if (typeof method !== "function") {
    throw new Error(`El editor no expuso la capacidad ${name}.`);
  }
  return method;
}

function readAuthoringSnapshot(targetWindow) {
  const reader = readCanvasEditorMethod("getTemplateAuthoringSnapshot", targetWindow);
  return typeof reader === "function" ? reader() || {} : {};
}

export function readEventLocationAuthoringState(targetWindow, feature) {
  const safeFeature = normalizeEventDetailFeature(feature);
  const authoring = readAuthoringSnapshot(targetWindow);
  return resolveEventLocationFromAuthoring({
    fieldsSchema: authoring.fieldsSchema,
    defaults: authoring.defaults,
    values: authoring.values,
    objetos: readEditorObjects(targetWindow),
    feature: safeFeature,
  });
}

export function buildSelectedGoogleEventLocation({ currentLocation, googlePlace, feature }) {
  const safeFeature = normalizeEventDetailFeature(feature);
  const current = currentLocation && typeof currentLocation === "object"
    ? currentLocation
    : {};
  const place = normalizeGooglePlaceInput(googlePlace);
  if (!place.placeId) {
    throw new Error("La ubicación seleccionada no tiene Place ID.");
  }
  const nextLocation = {
    ...current,
    eventDetailsFeature: safeFeature,
    venueName: place.displayName || normalizeText(current.venueName),
    address: place.formattedAddress || normalizeText(current.address),
    googlePlaceId: place.placeId,
    googleDisplayName: place.displayName,
    googleFormattedAddress: place.formattedAddress,
    googleAddressComponents: place.addressComponents,
    googleLat: place.lat,
    googleLng: place.lng,
    hasGooglePlace: true,
    showMap: current.showMap === true,
  };
  nextLocation.address = formatEventAddressText({
    address: current.address,
    googleFormattedAddress: nextLocation.googleFormattedAddress,
    googleAddressComponents: nextLocation.googleAddressComponents,
    preset: nextLocation.addressTextFormatPreset,
  });
  return nextLocation;
}

export async function applyEventGooglePlaceSelection({ targetWindow, feature, googlePlace }) {
  const safeFeature = normalizeEventDetailFeature(feature);
  const currentLocation = readEventLocationAuthoringState(targetWindow, safeFeature);
  const nextLocation = buildSelectedGoogleEventLocation({
    currentLocation,
    googlePlace,
    feature: safeFeature,
  });
  const updateLocation = requireEditorMethod(
    targetWindow,
    "updateTemplateAuthoringEventLocation"
  );

  await updateLocation(nextLocation, { feature: safeFeature });

  const mapObjectIds = Array.isArray(currentLocation.mapObjectIds)
    ? currentLocation.mapObjectIds
    : [];
  return {
    ...nextLocation,
    mapObjectId: mapObjectIds[0] || "",
    mapObjectIds,
  };
}

export async function applyManualEventLocationText(options = {}) {
  const {
    targetWindow,
    feature,
    venueName,
    address,
  } = options;
  const safeFeature = normalizeEventDetailFeature(feature);
  const currentLocation = readEventLocationAuthoringState(targetWindow, safeFeature);
  const hasVenueNamePatch = Object.prototype.hasOwnProperty.call(
    options,
    "venueName"
  );
  const hasAddressPatch = Object.prototype.hasOwnProperty.call(options, "address");
  const clearPatch = hasAddressPatch ? buildEventGoogleMapClearPatch() : {};
  const nextLocation = {
    ...currentLocation,
    ...clearPatch,
    ...(hasVenueNamePatch ? { venueName: normalizeText(venueName) } : {}),
    ...(hasAddressPatch ? { address: normalizeText(address) } : {}),
    eventDetailsFeature: safeFeature,
    ...(hasAddressPatch
      ? {
          showMap: false,
          hasGooglePlace: false,
        }
      : {}),
  };
  const updateLocation = requireEditorMethod(
    targetWindow,
    "updateTemplateAuthoringEventLocation"
  );

  await updateLocation(nextLocation, { feature: safeFeature });

  const mapObjectIds = Array.isArray(currentLocation.mapObjectIds)
    ? currentLocation.mapObjectIds
    : [];
  return {
    ...nextLocation,
    mapObjectId: mapObjectIds[0] || currentLocation.mapObjectId || "",
    mapObjectIds:
      mapObjectIds.length > 0
        ? mapObjectIds
        : Array.isArray(currentLocation.mapObjectIds)
          ? currentLocation.mapObjectIds
          : [],
  };
}
