import { EDITOR_BRIDGE_EVENTS } from "../../lib/editorBridgeContracts.js";
import {
  readCanvasEditorMethod,
  readEditorObjects,
} from "../../lib/editorRuntimeBridge.js";
import { normalizeEventDetailFeature } from "./features.js";
import {
  buildEventGoogleMapClearPatch,
  buildEventGoogleMapInsertObject,
  buildEventGoogleMapObjectPatch,
  findEventGoogleMapObject,
  formatEventAddressText,
  normalizeGooglePlaceInput,
  resolveEventLocationFromAuthoring,
} from "./location.js";

function normalizeText(value) {
  return String(value || "").trim();
}

function createRuntimeEvent(targetWindow, name, detail) {
  const EventCtor = targetWindow?.CustomEvent || globalThis.CustomEvent;
  if (typeof EventCtor === "function") return new EventCtor(name, { detail });
  const event = new targetWindow.Event(name);
  event.detail = detail;
  return event;
}

function dispatchRuntimeEvent(targetWindow, name, detail) {
  targetWindow.dispatchEvent(createRuntimeEvent(targetWindow, name, detail));
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
    showMap: false,
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

  const objects = readEditorObjects(targetWindow);
  const mapObject = findEventGoogleMapObject(objects, safeFeature);
  const patch = buildEventGoogleMapObjectPatch(
    {
      ...nextLocation,
      width: mapObject?.width,
      height: mapObject?.height,
    },
    { showMap: false, feature: safeFeature }
  );
  if (mapObject?.id) {
    dispatchRuntimeEvent(targetWindow, EDITOR_BRIDGE_EVENTS.UPDATE_ELEMENT, {
      id: mapObject.id,
      cambios: patch,
    });
    return { ...nextLocation, mapObjectId: mapObject.id };
  }

  const inserted = buildEventGoogleMapInsertObject(nextLocation, {
    feature: safeFeature,
  });
  dispatchRuntimeEvent(targetWindow, EDITOR_BRIDGE_EVENTS.INSERT_ELEMENT, inserted);
  return { ...nextLocation, mapObjectId: inserted.id };
}

export async function applyManualEventLocationText({
  targetWindow,
  feature,
  venueName,
  address,
}) {
  const safeFeature = normalizeEventDetailFeature(feature);
  const currentLocation = readEventLocationAuthoringState(targetWindow, safeFeature);
  const clearPatch = buildEventGoogleMapClearPatch();
  const nextLocation = {
    ...currentLocation,
    ...clearPatch,
    venueName: normalizeText(venueName),
    address: normalizeText(address),
    eventDetailsFeature: safeFeature,
    showMap: false,
    hasGooglePlace: false,
  };
  const updateLocation = requireEditorMethod(
    targetWindow,
    "updateTemplateAuthoringEventLocation"
  );

  await updateLocation(nextLocation, { feature: safeFeature });

  const mapObject = findEventGoogleMapObject(readEditorObjects(targetWindow), safeFeature);
  if (mapObject?.id) {
    dispatchRuntimeEvent(targetWindow, EDITOR_BRIDGE_EVENTS.UPDATE_ELEMENT, {
      id: mapObject.id,
      cambios: clearPatch,
    });
  }
  return { ...nextLocation, mapObjectId: mapObject?.id || "" };
}
