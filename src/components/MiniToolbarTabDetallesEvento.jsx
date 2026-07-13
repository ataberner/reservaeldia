import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  buildCountdownTargetIsoFromLocalParts,
  buildDynamicCountdownEventDetails,
  splitCountdownTargetIso,
} from "@/domain/eventDetails/countdownEventDetails";
import {
  DATE_TEXT_FORMAT_PRESET_OPTIONS,
  DEFAULT_DATE_TEXT_TRANSFORM_PRESET,
  resolveFieldDateTextFormatPreset,
} from "@/domain/templates/fieldValueResolver";
import {
  resolveEventDateSidebarBinding,
  getEventDateFieldKey,
} from "@/domain/eventDetails/date";
import {
  EVENT_COUPLE_NAME_FORMATS,
  EVENT_PERSON_NAME_ROLES,
  getEventPersonNameFieldKey,
  resolveEventPersonNamesState,
} from "@/domain/eventDetails/personNames";
import {
  ADDRESS_TEXT_FORMAT_PRESET_OPTIONS,
  buildEventGoogleMapClearPatch,
  buildEventGoogleMapInsertObject,
  buildEventGoogleMapObjectPatch,
  findEventGoogleMapObject,
  formatEventAddressText,
  getEventLocationFieldKey,
  EVENT_LOCATION_ROLES,
  normalizeGooglePlaceInput,
  resolveEventLocationFromAuthoring,
} from "@/domain/eventDetails/location";
import {
  EVENT_TIME_ROLES,
  getEventTimeFieldKey,
  normalizeEventTimeValue,
  resolveEventTimesFromAuthoring,
  resolveEventTimesState,
} from "@/domain/eventDetails/time";
import {
  EVENT_DETAIL_FEATURES,
  getEventDetailFeatureLabel,
  normalizeEventDetailFeature,
} from "@/domain/eventDetails/features";
import {
  DASHBOARD_DOCUMENT_NAME_EVENTS,
  readDashboardDocumentNameState,
  requestDashboardDocumentNameUpdate,
} from "@/lib/dashboardDocumentNameBridge";
import { EDITOR_BRIDGE_EVENTS } from "@/lib/editorBridgeContracts";
import {
  readCanvasEditorMethod,
  readEditorObjects,
} from "@/lib/editorRuntimeBridge";
import {
  EVENT_DETAILS_MODES,
  normalizeEventDetailsConfig,
} from "../../shared/eventDetailsConfig.js";
import {
  getDressCodeFieldKey,
  resolveDressCodeSidebarBinding,
} from "@/domain/templates/storyText";

const inputClass =
  "mt-2 block h-[38px] w-full max-w-[361px] box-border bg-white px-3 font-['Source_Sans_Pro',sans-serif] text-[13px] font-normal leading-[18px] text-[#262626] outline-none placeholder:text-[#9b9b9b] [border:1px_solid_var(--Border,#00000029)] focus:[border-color:#692B9A]";
const labelClass =
  "block w-full text-left font-['Source_Sans_Pro',sans-serif] text-[16px] font-semibold leading-[24px] tracking-[0px] text-[#262626]";
const subLabelClass =
  "font-['Source_Sans_Pro',sans-serif] text-[13px] font-normal leading-[18px] text-[#262626]";
const sectionClass = "w-full max-w-[361px] px-0 pb-4 text-left";
const dividerClass = "w-full max-w-[361px] border-t border-[#262626]";
const checkboxClass =
  "h-[14px] w-[14px] accent-[#692B9A]";
const disabledControlClass =
  "disabled:cursor-not-allowed disabled:bg-[#f6f6f6] disabled:text-[#777777]";
const EVENT_PERSON_NAMES_SAVE_DELAY_MS = 350;
const EVENT_LOCATION_SAVE_DELAY_MS = 350;
const EVENT_TIMES_SAVE_DELAY_MS = 350;
const GOOGLE_MAPS_SCRIPT_ID = "reservaeldia-google-maps-js";
const EVENT_COUPLE_SCROLL_FIELD_KEYS = [
  getEventPersonNameFieldKey(
    EVENT_PERSON_NAME_ROLES.COUPLE,
    EVENT_COUPLE_NAME_FORMATS.AND
  ),
  getEventPersonNameFieldKey(
    EVENT_PERSON_NAME_ROLES.COUPLE,
    EVENT_COUPLE_NAME_FORMATS.AMPERSAND
  ),
  getEventPersonNameFieldKey(
    EVENT_PERSON_NAME_ROLES.COUPLE,
    EVENT_COUPLE_NAME_FORMATS.LINEBREAK
  ),
];
const EVENT_PRIMARY_PERSON_SCROLL_FIELD_KEYS = [
  getEventPersonNameFieldKey(EVENT_PERSON_NAME_ROLES.PRIMARY),
  ...EVENT_COUPLE_SCROLL_FIELD_KEYS,
];
const EVENT_SECONDARY_PERSON_SCROLL_FIELD_KEYS = [
  getEventPersonNameFieldKey(EVENT_PERSON_NAME_ROLES.SECONDARY),
  ...EVENT_COUPLE_SCROLL_FIELD_KEYS,
];
function buildEventScrollFieldKeys(feature = EVENT_DETAIL_FEATURES.CEREMONY) {
  const safeFeature = normalizeEventDetailFeature(feature);
  return {
    date: [getEventDateFieldKey(safeFeature)],
    startTime: [
      getEventTimeFieldKey(EVENT_TIME_ROLES.START_TIME, safeFeature),
      getEventDateFieldKey(safeFeature),
    ],
    endTime: [getEventTimeFieldKey(EVENT_TIME_ROLES.END_TIME, safeFeature)],
    venueName: [
      getEventLocationFieldKey(EVENT_LOCATION_ROLES.VENUE_NAME, safeFeature),
    ],
    venueAddress: [
      getEventLocationFieldKey(EVENT_LOCATION_ROLES.VENUE_ADDRESS, safeFeature),
    ],
  };
}

function normalizeText(value) {
  return String(value || "").trim();
}

function readInitialDocumentNameState() {
  if (typeof window === "undefined") return readDashboardDocumentNameState();
  return readDashboardDocumentNameState(window);
}

function isPlainObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isTemplateAuthoringStateSnapshot(snapshot) {
  if (!isPlainObject(snapshot)) return false;
  if (!Array.isArray(snapshot.fieldsSchema)) return false;
  return Array.isArray(snapshot.objetos) || isPlainObject(snapshot.defaults);
}

function resolveCountdownDetailsStateFromSnapshot(
  authoringSnapshot,
  feature = EVENT_DETAIL_FEATURES.CEREMONY
) {
  if (!isTemplateAuthoringStateSnapshot(authoringSnapshot)) return null;
  const safeFeature = normalizeEventDetailFeature(feature);

  const objetos = Array.isArray(authoringSnapshot.objetos)
    ? authoringSnapshot.objetos
    : [];
  const fieldsSchema = Array.isArray(authoringSnapshot?.fieldsSchema)
    ? authoringSnapshot.fieldsSchema
    : [];
  const baseEventDateBinding = resolveEventDateSidebarBinding({
    fieldsSchema,
    defaults: authoringSnapshot?.defaults,
    objetos,
    feature: safeFeature,
  });
  const eventDateCountdownDetails = baseEventDateBinding.field
    ? buildDynamicCountdownEventDetails({
        fieldsSchema: [baseEventDateBinding.field],
        objetos,
        fieldKey: baseEventDateBinding.fieldKey,
      })
    : null;
  const countdownDetails = eventDateCountdownDetails?.hasBinding
    ? eventDateCountdownDetails
    : buildDynamicCountdownEventDetails({
        fieldsSchema,
        objetos,
        fieldKey: getEventDateFieldKey(safeFeature),
      });
  const eventDateBinding = resolveEventDateSidebarBinding({
    fieldsSchema,
    defaults: authoringSnapshot?.defaults,
    countdownDetails,
    objetos,
    feature: safeFeature,
  });

  if (
    !countdownDetails?.hasBinding &&
    !normalizeText(eventDateBinding.fieldKey)
  ) {
    return null;
  }

  if (countdownDetails?.hasBinding) {
    const targetISO = normalizeText(eventDateBinding.targetISO);
    const parts = splitCountdownTargetIso(targetISO);
    const field = eventDateBinding.field || countdownDetails.field;
    const fieldKey =
      normalizeText(eventDateBinding.fieldKey) ||
      normalizeText(countdownDetails.fieldKey);
    return {
      ...countdownDetails,
      field,
      fieldKey,
      fieldType:
        normalizeText(field?.type).toLowerCase() ||
        normalizeText(countdownDetails.fieldType).toLowerCase(),
      targetISO,
      date: parts.date,
      time: parts.time,
      hasBinding: Boolean(fieldKey),
      hasCountdownBinding: true,
    };
  }

  const targetISO = normalizeText(eventDateBinding.targetISO);
  const parts = splitCountdownTargetIso(targetISO);
  const fieldKey = normalizeText(eventDateBinding.fieldKey);
  return {
    hasBinding: Boolean(fieldKey),
    hasCountdownBinding: false,
    field: eventDateBinding.field,
    fieldKey,
    fieldType: normalizeText(eventDateBinding.field?.type).toLowerCase(),
    target: null,
    countdown: null,
    countdownId: "",
    targetISO,
    date: parts.date,
    time: parts.time,
    visible: false,
  };
}

function readCountdownDetailsState(targetWindow, options = {}) {
  if (typeof window === "undefined" && !targetWindow) {
    return buildDynamicCountdownEventDetails();
  }

  const authoringSnapshot = {
    ...readTemplateAuthoringSnapshot(targetWindow),
    objetos: readEditorObjects(targetWindow),
  };
  const details = resolveCountdownDetailsStateFromSnapshot(
    authoringSnapshot,
    options.feature
  );
  if (details) return details;
  if (options.requireValidSnapshot) return null;
  return buildDynamicCountdownEventDetails();
}

function readTemplateAuthoringSnapshot(targetWindow) {
  if (typeof window === "undefined" && !targetWindow) return {};
  const getTemplateAuthoringSnapshot = readCanvasEditorMethod(
    "getTemplateAuthoringSnapshot",
    targetWindow
  );
  return typeof getTemplateAuthoringSnapshot === "function"
    ? getTemplateAuthoringSnapshot()
    : {};
}

function readEventPersonNamesState(targetWindow, options = {}) {
  const authoringSnapshot = readTemplateAuthoringSnapshot(targetWindow);
  const nextNames = resolveEventPersonNamesState({
    ...authoringSnapshot,
    objetos: readEditorObjects(targetWindow),
  });
  if (nextNames) return nextNames;
  if (options.requireValidSnapshot) return null;
  return {
    primaryName: "",
    secondaryName: "",
  };
}

function readEventLocationState(targetWindow, feature = EVENT_DETAIL_FEATURES.CEREMONY) {
  const authoringSnapshot = readTemplateAuthoringSnapshot(targetWindow);
  return resolveEventLocationFromAuthoring({
    fieldsSchema: authoringSnapshot?.fieldsSchema,
    defaults: authoringSnapshot?.defaults,
    objetos: readEditorObjects(targetWindow),
    feature,
  });
}

function resolveEventTimesStateFromSnapshot(
  authoringSnapshot,
  feature = EVENT_DETAIL_FEATURES.CEREMONY
) {
  const countdownDetails = resolveCountdownDetailsStateFromSnapshot(
    authoringSnapshot,
    feature
  );
  return resolveEventTimesState(authoringSnapshot, {
    fallbackStartTime: countdownDetails?.time,
    feature,
  });
}

function readEventTimesState(targetWindow, options = {}) {
  const authoringSnapshot = {
    ...readTemplateAuthoringSnapshot(targetWindow),
    objetos: readEditorObjects(targetWindow),
  };
  const nextTimes = resolveEventTimesStateFromSnapshot(
    authoringSnapshot,
    options.feature
  );
  if (nextTimes) return nextTimes;
  if (options.requireValidSnapshot) return null;
  const countdownDetails = readCountdownDetailsState(targetWindow, {
    feature: options.feature,
  });
  return resolveEventTimesFromAuthoring({
    fieldsSchema: authoringSnapshot?.fieldsSchema,
    defaults: authoringSnapshot?.defaults,
    fallbackStartTime: countdownDetails?.time,
    feature: options.feature,
  });
}

function buildCountdownUiState(details = buildDynamicCountdownEventDetails()) {
  return {
    details,
    date: details.date || "",
    time: details.time || "",
    showCountdown: details.hasBinding ? details.visible !== false : false,
    dateTextFormatPreset: details.hasBinding
      ? resolveFieldDateTextFormatPreset(details.field)
      : DEFAULT_DATE_TEXT_TRANSFORM_PRESET,
  };
}

function readInitialCountdownUiState(feature = EVENT_DETAIL_FEATURES.CEREMONY) {
  if (typeof window === "undefined") return buildCountdownUiState();
  return buildCountdownUiState(readCountdownDetailsState(window, { feature }));
}

function readInitialEventPersonNamesState() {
  if (typeof window === "undefined") return readEventPersonNamesState();
  return readEventPersonNamesState(window);
}

function readInitialEventLocationState(feature = EVENT_DETAIL_FEATURES.CEREMONY) {
  if (typeof window === "undefined") return readEventLocationState(undefined, feature);
  return readEventLocationState(window, feature);
}

function readInitialEventTimesState(feature = EVENT_DETAIL_FEATURES.CEREMONY) {
  if (typeof window === "undefined") return readEventTimesState(undefined, { feature });
  return readEventTimesState(window, { feature });
}

function readEventDetailsConfigState(targetWindow) {
  if (typeof window === "undefined" && !targetWindow) {
    return normalizeEventDetailsConfig(null);
  }
  const getEventDetailsConfig = readCanvasEditorMethod(
    "getEventDetailsConfig",
    targetWindow
  );
  return normalizeEventDetailsConfig(
    typeof getEventDetailsConfig === "function" ? getEventDetailsConfig() : null
  );
}

function readDressCodeBindingState(targetWindow) {
  const authoringSnapshot = {
    ...readTemplateAuthoringSnapshot(targetWindow),
    objetos: readEditorObjects(targetWindow),
  };
  return resolveDressCodeSidebarBinding({
    fieldsSchema: authoringSnapshot?.fieldsSchema,
    defaults: authoringSnapshot?.defaults,
    objetos: authoringSnapshot?.objetos,
  });
}

function readEventDetailsUiConfigState(targetWindow) {
  const config = readEventDetailsConfigState(targetWindow);
  const dressCodeBinding = readDressCodeBindingState(targetWindow);
  if (!normalizeText(config?.dressCode?.value) && normalizeText(dressCodeBinding?.value)) {
    return normalizeEventDetailsConfig({
      ...config,
      dressCode: {
        ...config.dressCode,
        value: dressCodeBinding.value,
      },
    });
  }
  return config;
}

function readInitialEventDetailsConfigState() {
  if (typeof window === "undefined") return normalizeEventDetailsConfig(null);
  return readEventDetailsUiConfigState(window);
}

function updateLinkedEventDetailsConfig(patch) {
  if (typeof window === "undefined") return Promise.resolve(false);
  const updateEventDetailsConfig = readCanvasEditorMethod("updateEventDetailsConfig");
  if (typeof updateEventDetailsConfig !== "function") return Promise.resolve(false);

  return Promise.resolve(updateEventDetailsConfig(patch))
    .then(() => true)
    .catch((error) => {
      console.error("No se pudo actualizar la modalidad del evento.", error);
      return false;
    });
}

function buildEventPersonNamesSignature(names) {
  return JSON.stringify({
    primaryName: String(names?.primaryName || ""),
    secondaryName: String(names?.secondaryName || ""),
  });
}

function buildEventLocationSignature(location) {
  return JSON.stringify({
    venueName: String(location?.venueName || ""),
    address: String(location?.address || ""),
    googlePlaceId: String(location?.googlePlaceId || ""),
    showMap: location?.showMap === true,
    addressTextFormatPreset: String(location?.addressTextFormatPreset || ""),
  });
}

function buildEventTimesSignature(times) {
  return JSON.stringify({
    startTime: String(times?.startTime || ""),
    endTime: String(times?.endTime || ""),
  });
}

function resolveTimeInputValue(value) {
  const normalized = normalizeEventTimeValue(value);
  const match = normalized.match(/^(\d{2}):(\d{2})$/);
  if (!match) return "";
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return "";
  return normalized;
}

function isDateInputValue(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(normalizeText(value));
}

function buildEventDateTargetValue({ date, time, fieldType } = {}) {
  const safeDate = normalizeText(date);
  const safeTime = normalizeEventTimeValue(time);
  const targetISO = buildCountdownTargetIsoFromLocalParts({
    date: safeDate,
    time: safeTime,
  });
  if (targetISO) return targetISO;

  if (
    normalizeText(fieldType).toLowerCase() === "date" &&
    isDateInputValue(safeDate)
  ) {
    return safeDate;
  }

  return "";
}

function dispatchCountdownPatch(countdownId, cambios) {
  if (typeof window === "undefined" || !countdownId || !cambios) return;
  window.dispatchEvent(
    new CustomEvent(EDITOR_BRIDGE_EVENTS.UPDATE_ELEMENT, {
      detail: {
        id: countdownId,
        cambios,
      },
    })
  );
}

function dispatchElementPatch(objectId, cambios) {
  if (typeof window === "undefined" || !objectId || !cambios) return;
  window.dispatchEvent(
    new CustomEvent(EDITOR_BRIDGE_EVENTS.UPDATE_ELEMENT, {
      detail: {
        id: objectId,
        cambios,
      },
    })
  );
}

function dispatchMapInsert(location, feature = EVENT_DETAIL_FEATURES.CEREMONY) {
  if (typeof window === "undefined") return null;
  const safeFeature = normalizeEventDetailFeature(feature);
  const mapObject = buildEventGoogleMapInsertObject(
    {
      ...location,
      eventDetailsFeature: safeFeature,
    },
    { feature: safeFeature }
  );
  window.dispatchEvent(
    new CustomEvent(EDITOR_BRIDGE_EVENTS.INSERT_ELEMENT, {
      detail: mapObject,
    })
  );
  return mapObject;
}

function updateLinkedFieldDefault(fieldKey, value, options = {}) {
  if (typeof window === "undefined" || !fieldKey) return;
  const updateDefault = readCanvasEditorMethod("updateTemplateAuthoringDefault");
  if (typeof updateDefault !== "function") return;

  void Promise.resolve(updateDefault(fieldKey, value, options)).catch((error) => {
    console.error("No se pudo actualizar el default del campo dinamico.", error);
  });
}

function updateLinkedFieldDateTextFormat(fieldKey, preset) {
  if (typeof window === "undefined" || !fieldKey) return;
  const updateDateTextFormat = readCanvasEditorMethod(
    "updateTemplateAuthoringDateTextFormat"
  );
  if (typeof updateDateTextFormat !== "function") return;

  void Promise.resolve(updateDateTextFormat(fieldKey, preset)).catch((error) => {
    console.error("No se pudo actualizar el formato de fecha del campo dinamico.", error);
  });
}

function scrollToDynamicFieldTarget(fieldKeys) {
  if (typeof window === "undefined") return false;
  const scrollToTarget = readCanvasEditorMethod("scrollToDynamicFieldTarget");
  if (typeof scrollToTarget !== "function") return false;
  return scrollToTarget(fieldKeys);
}

function selectSidebarFieldText(event) {
  const target = event?.currentTarget;
  if (!target) return;

  if (typeof target.select === "function") {
    try {
      target.select();
      return;
    } catch {
      // Native date/time controls do not always expose text selection.
    }
  }

  if (typeof target.setSelectionRange !== "function") return;
  try {
    target.setSelectionRange(0, String(target.value ?? "").length);
  } catch {
    // Ignore controls that reject programmatic text selection.
  }
}

function updateLinkedEventPersonNames(names) {
  if (typeof window === "undefined") return Promise.resolve(false);
  const updateNames = readCanvasEditorMethod("updateTemplateAuthoringEventPersonNames");
  if (typeof updateNames !== "function") return Promise.resolve(false);

  return Promise.resolve(updateNames(names))
    .then(() => true)
    .catch((error) => {
      console.error("No se pudieron actualizar los nombres del evento.", error);
      return false;
    });
}

function updateLinkedEventLocation(
  location,
  feature = EVENT_DETAIL_FEATURES.CEREMONY
) {
  if (typeof window === "undefined") return Promise.resolve(false);
  const updateLocation = readCanvasEditorMethod("updateTemplateAuthoringEventLocation");
  if (typeof updateLocation !== "function") return Promise.resolve(false);

  const safeFeature = normalizeEventDetailFeature(feature);
  return Promise.resolve(
    updateLocation(
      {
        ...location,
        eventDetailsFeature: safeFeature,
      },
      { feature: safeFeature }
    )
  )
    .then(() => true)
    .catch((error) => {
      console.error("No se pudo actualizar la ubicacion del evento.", error);
      return false;
    });
}

function updateLinkedEventTimes(times, feature = EVENT_DETAIL_FEATURES.CEREMONY) {
  if (typeof window === "undefined") return Promise.resolve(false);
  const updateTimes = readCanvasEditorMethod("updateTemplateAuthoringEventTimes");
  if (typeof updateTimes !== "function") return Promise.resolve(false);

  const safeFeature = normalizeEventDetailFeature(feature);
  return Promise.resolve(updateTimes(times, { feature: safeFeature }))
    .then(() => true)
    .catch((error) => {
      console.error("No se pudieron actualizar las horas del evento.", error);
      return false;
    });
}

let googleMapsPlacesLoaderPromise = null;

function getGoogleMapsApiKey() {
  return String(process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "").trim();
}

function loadGoogleMapsPlacesLibrary() {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Google Maps solo esta disponible en el navegador."));
  }
  const apiKey = getGoogleMapsApiKey();
  if (!apiKey) {
    return Promise.reject(new Error("Falta NEXT_PUBLIC_GOOGLE_MAPS_API_KEY."));
  }
  if (window.google?.maps?.importLibrary) {
    return window.google.maps.importLibrary("places");
  }
  if (googleMapsPlacesLoaderPromise) return googleMapsPlacesLoaderPromise;

  googleMapsPlacesLoaderPromise = new Promise((resolve, reject) => {
    const existingScript = document.getElementById(GOOGLE_MAPS_SCRIPT_ID);
    if (existingScript) {
      existingScript.addEventListener("load", () => {
        if (window.google?.maps?.importLibrary) {
          resolve(window.google.maps.importLibrary("places"));
        } else {
          reject(new Error("Google Maps no expuso importLibrary."));
        }
      }, { once: true });
      existingScript.addEventListener("error", reject, { once: true });
      return;
    }

    const script = document.createElement("script");
    script.id = GOOGLE_MAPS_SCRIPT_ID;
    script.async = true;
    script.defer = true;
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(
      apiKey
    )}&libraries=places&v=weekly&language=es-419&region=AR&loading=async`;
    script.onload = () => {
      if (window.google?.maps?.importLibrary) {
        resolve(window.google.maps.importLibrary("places"));
      } else {
        reject(new Error("Google Maps no expuso importLibrary."));
      }
    };
    script.onerror = () => reject(new Error("No se pudo cargar Google Maps."));
    document.head.appendChild(script);
  });

  return googleMapsPlacesLoaderPromise;
}

function placePredictionToLabel(prediction) {
  const mainText = normalizeGooglePlaceInput({
    displayName: prediction?.structuredFormat?.mainText?.text,
  }).displayName;
  const secondaryText = String(
    prediction?.structuredFormat?.secondaryText?.text ||
      prediction?.secondaryText ||
      ""
  ).trim();
  const fallback = String(prediction?.text || prediction?.description || "").trim();
  if (mainText && secondaryText) return `${mainText} - ${secondaryText}`;
  return mainText || fallback;
}

async function fetchGooglePlaceSuggestions(input, sessionToken) {
  const query = String(input || "").trim();
  if (query.length < 3) return [];

  const places = await loadGoogleMapsPlacesLibrary();
  const AutocompleteSuggestion =
    places?.AutocompleteSuggestion ||
    window.google?.maps?.places?.AutocompleteSuggestion;
  if (!AutocompleteSuggestion?.fetchAutocompleteSuggestions) return [];

  const request = {
    input: query,
    language: "es-419",
    region: "ar",
    sessionToken,
  };
  const result = await AutocompleteSuggestion.fetchAutocompleteSuggestions(request);
  return (Array.isArray(result?.suggestions) ? result.suggestions : [])
    .map((suggestion, index) => {
      const prediction = suggestion?.placePrediction;
      if (!prediction) return null;
      return {
        id: String(prediction.placeId || prediction.id || index),
        label: placePredictionToLabel(prediction),
        prediction,
      };
    })
    .filter((entry) => entry?.label);
}

async function fetchGooglePlaceDetailsFromPrediction(prediction) {
  if (!prediction?.toPlace) return normalizeGooglePlaceInput(prediction);
  const place = prediction.toPlace();
  await place.fetchFields({
    fields: ["id", "displayName", "formattedAddress", "addressComponents", "location"],
  });
  return normalizeGooglePlaceInput(place);
}

export default function MiniToolbarTabDetallesEvento({
  simplifiedForAssistant = false,
  assistantSubstep = null,
}) {
  const [documentNameState, setDocumentNameState] = useState(
    readInitialDocumentNameState
  );
  const [eventName, setEventName] = useState(
    () => readInitialDocumentNameState().name
  );
  const [eventDetailsConfig, setEventDetailsConfig] = useState(
    readInitialEventDetailsConfigState
  );
  const [countdownUi, setCountdownUi] = useState(readInitialCountdownUiState);
  const [partyCountdownUi, setPartyCountdownUi] = useState(() =>
    readInitialCountdownUiState(EVENT_DETAIL_FEATURES.PARTY)
  );
  const [eventPersonNames, setEventPersonNames] = useState(
    readInitialEventPersonNamesState
  );
  const [eventLocation, setEventLocation] = useState(
    readInitialEventLocationState
  );
  const [partyEventLocation, setPartyEventLocation] = useState(() =>
    readInitialEventLocationState(EVENT_DETAIL_FEATURES.PARTY)
  );
  const [eventTimes, setEventTimes] = useState(readInitialEventTimesState);
  const [partyEventTimes, setPartyEventTimes] = useState(() =>
    readInitialEventTimesState(EVENT_DETAIL_FEATURES.PARTY)
  );
  const [locationSuggestions, setLocationSuggestions] = useState([]);
  const [locationSuggestionsOpen, setLocationSuggestionsOpen] = useState(false);
  const [locationSuggestionsLoading, setLocationSuggestionsLoading] = useState(false);
  const [locationSuggestionsError, setLocationSuggestionsError] = useState("");
  const editingNameRef = useRef(false);
  const editingEventPersonNamesRef = useRef(false);
  const editingEventLocationRef = useRef(false);
  const editingEventTimesRef = useRef(false);
  const activeLocationSearchFieldRef = useRef("");
  const eventPersonNamesRef = useRef(eventPersonNames);
  const eventLocationRef = useRef(eventLocation);
  const partyEventLocationRef = useRef(partyEventLocation);
  const eventTimesRef = useRef(eventTimes);
  const partyEventTimesRef = useRef(partyEventTimes);
  const eventPersonNamesSaveTimerRef = useRef(null);
  const eventLocationSaveTimerRef = useRef(null);
  const partyEventLocationSaveTimerRef = useRef(null);
  const eventTimesSaveTimerRef = useRef(null);
  const partyEventTimesSaveTimerRef = useRef(null);
  const pendingEventPersonNamesSignatureRef = useRef("");
  const pendingEventLocationSignatureRef = useRef("");
  const pendingPartyEventLocationSignatureRef = useRef("");
  const pendingEventTimesSignatureRef = useRef("");
  const pendingPartyEventTimesSignatureRef = useRef("");
  const googleAutocompleteSessionTokenRef = useRef(null);
  const locationSuggestionTimerRef = useRef(null);
  const countdownDetails = countdownUi.details;
  const partyCountdownDetails = partyCountdownUi.details;
  const eventDateControlsDisabled = !countdownDetails.fieldKey;
  const partyEventDateControlsDisabled = !partyCountdownDetails.fieldKey;
  const countdownVisibilityDisabled = !countdownDetails.countdownId;
  const partyCountdownVisibilityDisabled = !partyCountdownDetails.countdownId;
  const googleMapsApiKey = getGoogleMapsApiKey();
  const hasGoogleMapsApiKey = Boolean(googleMapsApiKey);
  const canShowEventMap = Boolean(eventLocation.googlePlaceId);
  const canShowPartyEventMap = Boolean(partyEventLocation.googlePlaceId);
  const eventMode = eventDetailsConfig.mode;
  const isCeremonyPartyMode = eventMode === "ceremony_party";
  const dressCodeConfig = eventDetailsConfig.dressCode || {};
  const isDressCodeEnabled = dressCodeConfig.enabled === true;
  const dressCodeValue = normalizeText(dressCodeConfig.value);
  const dressCodeFieldKey = getDressCodeFieldKey();
  const ceremonyScrollFieldKeys = buildEventScrollFieldKeys(EVENT_DETAIL_FEATURES.CEREMONY);
  const partyScrollFieldKeys = buildEventScrollFieldKeys(EVENT_DETAIL_FEATURES.PARTY);

  const applySyncedCountdownDetailsState = useCallback((details, feature) => {
    if (!details) return;
    if (normalizeEventDetailFeature(feature) === EVENT_DETAIL_FEATURES.PARTY) {
      setPartyCountdownUi(buildCountdownUiState(details));
      return;
    }
    setCountdownUi(buildCountdownUiState(details));
  }, []);

  const syncCountdownUiState = useCallback(() => {
    applySyncedCountdownDetailsState(
      readCountdownDetailsState(window, { feature: EVENT_DETAIL_FEATURES.CEREMONY }),
      EVENT_DETAIL_FEATURES.CEREMONY
    );
    applySyncedCountdownDetailsState(
      readCountdownDetailsState(window, { feature: EVENT_DETAIL_FEATURES.PARTY }),
      EVENT_DETAIL_FEATURES.PARTY
    );
  }, [applySyncedCountdownDetailsState]);

  const handleTemplateAuthoringChangeForCountdown = useCallback(
    (event) => {
      applySyncedCountdownDetailsState(
        resolveCountdownDetailsStateFromSnapshot(
          event?.detail,
          EVENT_DETAIL_FEATURES.CEREMONY
        ) ||
          readCountdownDetailsState(window, {
            requireValidSnapshot: event?.detail != null,
            feature: EVENT_DETAIL_FEATURES.CEREMONY,
          }),
        EVENT_DETAIL_FEATURES.CEREMONY
      );
      applySyncedCountdownDetailsState(
        resolveCountdownDetailsStateFromSnapshot(
          event?.detail,
          EVENT_DETAIL_FEATURES.PARTY
        ) ||
          readCountdownDetailsState(window, {
            requireValidSnapshot: event?.detail != null,
            feature: EVENT_DETAIL_FEATURES.PARTY,
          }),
        EVENT_DETAIL_FEATURES.PARTY
      );
    },
    [applySyncedCountdownDetailsState]
  );

  const syncEventDetailsConfigState = useCallback(() => {
    setEventDetailsConfig(readEventDetailsUiConfigState(window));
  }, []);

  const handleEventDetailsModeChange = (event) => {
    const nextConfig = normalizeEventDetailsConfig({
      ...eventDetailsConfig,
      mode: event.target.value,
    });
    setEventDetailsConfig(nextConfig);
    void updateLinkedEventDetailsConfig(nextConfig);
  };

  const updateDressCodeConfig = useCallback(
    (patch, { applyTargets = false } = {}) => {
      const nextConfig = normalizeEventDetailsConfig({
        ...eventDetailsConfig,
        dressCode: {
          ...(eventDetailsConfig.dressCode || {}),
          ...patch,
        },
      });
      setEventDetailsConfig(nextConfig);
      void updateLinkedEventDetailsConfig(nextConfig);
      if (applyTargets) {
        updateLinkedFieldDefault(dressCodeFieldKey, nextConfig.dressCode.value, {
          applyTargets: true,
        });
      }
    },
    [dressCodeFieldKey, eventDetailsConfig]
  );

  const handleDressCodeEnabledChange = (event) => {
    updateDressCodeConfig({ enabled: event.target.checked });
  };

  const handleDressCodeValueChange = (event) => {
    updateDressCodeConfig(
      {
        enabled: true,
        value: event.target.value,
      },
      { applyTargets: true }
    );
  };

  const handleDressCodeFocus = (event) => {
    selectSidebarFieldText(event);
    scrollToDynamicFieldTarget(dressCodeFieldKey);
  };

  const syncEventLocationState = useCallback(() => {
    const nextLocation = readEventLocationState(
      window,
      EVENT_DETAIL_FEATURES.CEREMONY
    );
    const nextSignature = buildEventLocationSignature(nextLocation);
    if (!editingEventLocationRef.current) {
      if (
        !pendingEventLocationSignatureRef.current ||
        pendingEventLocationSignatureRef.current === nextSignature
      ) {
        pendingEventLocationSignatureRef.current = "";
        setEventLocation(nextLocation);
      }
    }

    const nextPartyLocation = readEventLocationState(
      window,
      EVENT_DETAIL_FEATURES.PARTY
    );
    const nextPartySignature = buildEventLocationSignature(nextPartyLocation);
    if (!editingEventLocationRef.current) {
      if (
        !pendingPartyEventLocationSignatureRef.current ||
        pendingPartyEventLocationSignatureRef.current === nextPartySignature
      ) {
        pendingPartyEventLocationSignatureRef.current = "";
        setPartyEventLocation(nextPartyLocation);
      }
    }
  }, []);

  const applySyncedEventTimesState = useCallback((nextTimes, feature) => {
    if (!nextTimes) return;
    const nextSignature = buildEventTimesSignature(nextTimes);
    if (editingEventTimesRef.current) return;
    if (normalizeEventDetailFeature(feature) === EVENT_DETAIL_FEATURES.PARTY) {
      if (
        pendingPartyEventTimesSignatureRef.current &&
        pendingPartyEventTimesSignatureRef.current !== nextSignature
      ) {
        return;
      }
      if (pendingPartyEventTimesSignatureRef.current === nextSignature) {
        pendingPartyEventTimesSignatureRef.current = "";
      }
      setPartyEventTimes(nextTimes);
      return;
    }
    if (
      pendingEventTimesSignatureRef.current &&
      pendingEventTimesSignatureRef.current !== nextSignature
    ) {
      return;
    }
    if (pendingEventTimesSignatureRef.current === nextSignature) {
      pendingEventTimesSignatureRef.current = "";
    }
    setEventTimes(nextTimes);
  }, []);

  const syncEventTimesState = useCallback(() => {
    applySyncedEventTimesState(
      readEventTimesState(window, { feature: EVENT_DETAIL_FEATURES.CEREMONY }),
      EVENT_DETAIL_FEATURES.CEREMONY
    );
    applySyncedEventTimesState(
      readEventTimesState(window, { feature: EVENT_DETAIL_FEATURES.PARTY }),
      EVENT_DETAIL_FEATURES.PARTY
    );
  }, [applySyncedEventTimesState]);

  const handleTemplateAuthoringChangeForEventTimes = useCallback(
    (event) => {
      applySyncedEventTimesState(
        resolveEventTimesStateFromSnapshot(
          event?.detail,
          EVENT_DETAIL_FEATURES.CEREMONY
        ) ||
          readEventTimesState(window, {
          requireValidSnapshot: event?.detail != null,
            feature: EVENT_DETAIL_FEATURES.CEREMONY,
          }),
        EVENT_DETAIL_FEATURES.CEREMONY
      );
      applySyncedEventTimesState(
        resolveEventTimesStateFromSnapshot(
          event?.detail,
          EVENT_DETAIL_FEATURES.PARTY
        ) ||
          readEventTimesState(window, {
            requireValidSnapshot: event?.detail != null,
            feature: EVENT_DETAIL_FEATURES.PARTY,
          }),
        EVENT_DETAIL_FEATURES.PARTY
      );
    },
    [applySyncedEventTimesState]
  );

  const applySyncedEventPersonNamesState = useCallback((nextNames) => {
    if (!nextNames) return;
    const nextSignature = buildEventPersonNamesSignature(nextNames);
    if (editingEventPersonNamesRef.current) return;
    if (
      pendingEventPersonNamesSignatureRef.current &&
      pendingEventPersonNamesSignatureRef.current !== nextSignature
    ) {
      return;
    }
    if (pendingEventPersonNamesSignatureRef.current === nextSignature) {
      pendingEventPersonNamesSignatureRef.current = "";
    }
    setEventPersonNames(nextNames);
  }, []);

  const syncEventPersonNamesState = useCallback(() => {
    applySyncedEventPersonNamesState(readEventPersonNamesState(window));
  }, [applySyncedEventPersonNamesState]);

  const handleTemplateAuthoringChangeForPersonNames = useCallback(
    (event) => {
      const nextNames = resolveEventPersonNamesState(event?.detail);
      if (nextNames) {
        applySyncedEventPersonNamesState(nextNames);
        return;
      }

      applySyncedEventPersonNamesState(
        readEventPersonNamesState(window, {
          requireValidSnapshot: event?.detail != null,
        })
      );
    },
    [applySyncedEventPersonNamesState]
  );

  useEffect(() => {
    eventPersonNamesRef.current = eventPersonNames;
  }, [eventPersonNames]);

  useEffect(() => {
    eventLocationRef.current = eventLocation;
  }, [eventLocation]);

  useEffect(() => {
    partyEventLocationRef.current = partyEventLocation;
  }, [partyEventLocation]);

  useEffect(() => {
    eventTimesRef.current = eventTimes;
  }, [eventTimes]);

  useEffect(() => {
    partyEventTimesRef.current = partyEventTimes;
  }, [partyEventTimes]);

  useEffect(() => {
    return () => {
      if (eventPersonNamesSaveTimerRef.current) {
        clearTimeout(eventPersonNamesSaveTimerRef.current);
      }
      if (eventLocationSaveTimerRef.current) {
        clearTimeout(eventLocationSaveTimerRef.current);
      }
      if (partyEventLocationSaveTimerRef.current) {
        clearTimeout(partyEventLocationSaveTimerRef.current);
      }
      if (eventTimesSaveTimerRef.current) {
        clearTimeout(eventTimesSaveTimerRef.current);
      }
      if (partyEventTimesSaveTimerRef.current) {
        clearTimeout(partyEventTimesSaveTimerRef.current);
      }
      if (locationSuggestionTimerRef.current) {
        clearTimeout(locationSuggestionTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const applyDocumentNameState = (nextState) => {
      setDocumentNameState(nextState);
      if (!editingNameRef.current) {
        setEventName(nextState.name);
      }
    };

    applyDocumentNameState(readDashboardDocumentNameState(window));

    const handleDocumentNameStateChange = (event) => {
      applyDocumentNameState(
        event?.detail || readDashboardDocumentNameState(window)
      );
    };

    window.addEventListener(
      DASHBOARD_DOCUMENT_NAME_EVENTS.STATE_CHANGE,
      handleDocumentNameStateChange
    );

    return () => {
      window.removeEventListener(
        DASHBOARD_DOCUMENT_NAME_EVENTS.STATE_CHANGE,
        handleDocumentNameStateChange
      );
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    syncCountdownUiState();
    syncEventDetailsConfigState();
    syncEventPersonNamesState();
    syncEventLocationState();
    syncEventTimesState();

    window.addEventListener(
      EDITOR_BRIDGE_EVENTS.SELECTION_CHANGE,
      syncCountdownUiState
    );
    window.addEventListener(
      EDITOR_BRIDGE_EVENTS.SELECTION_CHANGE,
      syncEventDetailsConfigState
    );
    window.addEventListener(
      EDITOR_BRIDGE_EVENTS.TEMPLATE_AUTHORING_CHANGE,
      syncEventDetailsConfigState
    );
    window.addEventListener(
      EDITOR_BRIDGE_EVENTS.TEMPLATE_AUTHORING_CHANGE,
      handleTemplateAuthoringChangeForCountdown
    );
    window.addEventListener(
      EDITOR_BRIDGE_EVENTS.TEMPLATE_AUTHORING_CHANGE,
      handleTemplateAuthoringChangeForPersonNames
    );
    window.addEventListener(
      EDITOR_BRIDGE_EVENTS.SELECTION_CHANGE,
      syncEventPersonNamesState
    );
    window.addEventListener(
      EDITOR_BRIDGE_EVENTS.TEMPLATE_AUTHORING_CHANGE,
      syncEventLocationState
    );
    window.addEventListener(
      EDITOR_BRIDGE_EVENTS.TEMPLATE_AUTHORING_CHANGE,
      handleTemplateAuthoringChangeForEventTimes
    );
    window.addEventListener(
      EDITOR_BRIDGE_EVENTS.SELECTION_CHANGE,
      syncEventLocationState
    );

    return () => {
      window.removeEventListener(
        EDITOR_BRIDGE_EVENTS.SELECTION_CHANGE,
        syncCountdownUiState
      );
      window.removeEventListener(
        EDITOR_BRIDGE_EVENTS.SELECTION_CHANGE,
        syncEventDetailsConfigState
      );
      window.removeEventListener(
        EDITOR_BRIDGE_EVENTS.TEMPLATE_AUTHORING_CHANGE,
        syncEventDetailsConfigState
      );
      window.removeEventListener(
        EDITOR_BRIDGE_EVENTS.TEMPLATE_AUTHORING_CHANGE,
        handleTemplateAuthoringChangeForCountdown
      );
      window.removeEventListener(
        EDITOR_BRIDGE_EVENTS.TEMPLATE_AUTHORING_CHANGE,
        handleTemplateAuthoringChangeForPersonNames
      );
      window.removeEventListener(
        EDITOR_BRIDGE_EVENTS.SELECTION_CHANGE,
        syncEventPersonNamesState
      );
      window.removeEventListener(
        EDITOR_BRIDGE_EVENTS.TEMPLATE_AUTHORING_CHANGE,
        syncEventLocationState
      );
      window.removeEventListener(
        EDITOR_BRIDGE_EVENTS.TEMPLATE_AUTHORING_CHANGE,
        handleTemplateAuthoringChangeForEventTimes
      );
      window.removeEventListener(
        EDITOR_BRIDGE_EVENTS.SELECTION_CHANGE,
        syncEventLocationState
      );
    };
  }, [
    syncCountdownUiState,
    syncEventDetailsConfigState,
    handleTemplateAuthoringChangeForCountdown,
    syncEventPersonNamesState,
    handleTemplateAuthoringChangeForPersonNames,
    syncEventLocationState,
    syncEventTimesState,
    handleTemplateAuthoringChangeForEventTimes,
  ]);

  const canEditEventName = documentNameState.editable;

  const handleEventNameChange = (event) => {
    const nextName = event.target.value;
    setEventName(nextName);
    requestDashboardDocumentNameUpdate({ name: nextName, persist: false });
  };

  const commitEventName = () => {
    editingNameRef.current = false;
    if (!canEditEventName) return;
    requestDashboardDocumentNameUpdate({ name: eventName, persist: true });
  };

  const handleEventNameKeyDown = (event) => {
    if (event.key === "Enter") {
      event.currentTarget.blur();
    }
  };

  const handleEventNameFocus = (event) => {
    editingNameRef.current = true;
    selectSidebarFieldText(event);
  };

  const persistEventPersonNames = useCallback((nextNames) => {
    if (eventPersonNamesSaveTimerRef.current) {
      clearTimeout(eventPersonNamesSaveTimerRef.current);
      eventPersonNamesSaveTimerRef.current = null;
    }
    const signature = buildEventPersonNamesSignature(nextNames);
    pendingEventPersonNamesSignatureRef.current = signature;
    void updateLinkedEventPersonNames(nextNames).then((ok) => {
      if (!ok) return;
      if (pendingEventPersonNamesSignatureRef.current === signature) {
        pendingEventPersonNamesSignatureRef.current = "";
      }
    });
  }, []);

  const scheduleEventPersonNamesPersist = useCallback(
    (nextNames) => {
      if (eventPersonNamesSaveTimerRef.current) {
        clearTimeout(eventPersonNamesSaveTimerRef.current);
      }
      pendingEventPersonNamesSignatureRef.current =
        buildEventPersonNamesSignature(nextNames);
      eventPersonNamesSaveTimerRef.current = setTimeout(() => {
        persistEventPersonNames(nextNames);
      }, EVENT_PERSON_NAMES_SAVE_DELAY_MS);
    },
    [persistEventPersonNames]
  );

  const flushEventPersonNames = useCallback(() => {
    persistEventPersonNames(eventPersonNamesRef.current);
  }, [persistEventPersonNames]);

  const applyEventPersonNames = (patch) => {
    setEventPersonNames((current) => {
      const nextNames = {
        ...current,
        ...patch,
      };
      eventPersonNamesRef.current = nextNames;
      scheduleEventPersonNamesPersist(nextNames);
      return nextNames;
    });
  };

  const handleEventPersonNameFocus = (event, fieldKeys) => {
    editingEventPersonNamesRef.current = true;
    selectSidebarFieldText(event);
    scrollToDynamicFieldTarget(fieldKeys);
  };

  const handleEventPersonNameBlur = () => {
    editingEventPersonNamesRef.current = false;
    flushEventPersonNames();
  };

  const handleEventPersonNameKeyDown = (event) => {
    if (event.key === "Enter") {
      event.currentTarget.blur();
    }
  };

  const handlePrimaryPersonNameChange = (event) => {
    applyEventPersonNames({ primaryName: event.target.value });
  };

  const handleSecondaryPersonNameChange = (event) => {
    applyEventPersonNames({ secondaryName: event.target.value });
  };

  const persistEventTimes = useCallback((nextTimes) => {
    if (eventTimesSaveTimerRef.current) {
      clearTimeout(eventTimesSaveTimerRef.current);
      eventTimesSaveTimerRef.current = null;
    }
    const signature = buildEventTimesSignature(nextTimes);
    pendingEventTimesSignatureRef.current = signature;
    void updateLinkedEventTimes(nextTimes, EVENT_DETAIL_FEATURES.CEREMONY).then((ok) => {
      if (!ok) return;
      if (pendingEventTimesSignatureRef.current === signature) {
        pendingEventTimesSignatureRef.current = "";
      }
    });
  }, []);

  const persistPartyEventTimes = useCallback((nextTimes) => {
    if (partyEventTimesSaveTimerRef.current) {
      clearTimeout(partyEventTimesSaveTimerRef.current);
      partyEventTimesSaveTimerRef.current = null;
    }
    const signature = buildEventTimesSignature(nextTimes);
    pendingPartyEventTimesSignatureRef.current = signature;
    void updateLinkedEventTimes(nextTimes, EVENT_DETAIL_FEATURES.PARTY).then((ok) => {
      if (!ok) return;
      if (pendingPartyEventTimesSignatureRef.current === signature) {
        pendingPartyEventTimesSignatureRef.current = "";
      }
    });
  }, []);

  const scheduleEventTimesPersist = useCallback(
    (nextTimes) => {
      if (eventTimesSaveTimerRef.current) {
        clearTimeout(eventTimesSaveTimerRef.current);
      }
      pendingEventTimesSignatureRef.current = buildEventTimesSignature(nextTimes);
      eventTimesSaveTimerRef.current = setTimeout(() => {
        persistEventTimes(nextTimes);
      }, EVENT_TIMES_SAVE_DELAY_MS);
    },
    [persistEventTimes]
  );

  const schedulePartyEventTimesPersist = useCallback(
    (nextTimes) => {
      if (partyEventTimesSaveTimerRef.current) {
        clearTimeout(partyEventTimesSaveTimerRef.current);
      }
      pendingPartyEventTimesSignatureRef.current = buildEventTimesSignature(nextTimes);
      partyEventTimesSaveTimerRef.current = setTimeout(() => {
        persistPartyEventTimes(nextTimes);
      }, EVENT_TIMES_SAVE_DELAY_MS);
    },
    [persistPartyEventTimes]
  );

  const flushEventTimes = useCallback(() => {
    persistEventTimes(eventTimesRef.current);
  }, [persistEventTimes]);

  const flushPartyEventTimes = useCallback(() => {
    persistPartyEventTimes(partyEventTimesRef.current);
  }, [persistPartyEventTimes]);

  const buildNextEventTimes = (current, patch) => {
    const nextTimes = {
      ...current,
    };
    if (Object.prototype.hasOwnProperty.call(patch, "startTime")) {
      nextTimes.startTime = normalizeEventTimeValue(patch.startTime);
    }
    if (Object.prototype.hasOwnProperty.call(patch, "endTime")) {
      nextTimes.endTime = normalizeEventTimeValue(patch.endTime);
    }
    return nextTimes;
  };

  const applyEventTimes = (patch, feature = EVENT_DETAIL_FEATURES.CEREMONY) => {
    if (normalizeEventDetailFeature(feature) === EVENT_DETAIL_FEATURES.PARTY) {
      setPartyEventTimes((current) => {
        const nextTimes = buildNextEventTimes(current, patch);
        partyEventTimesRef.current = nextTimes;
        schedulePartyEventTimesPersist(nextTimes);
        return nextTimes;
      });
      return;
    }
    setEventTimes((current) => {
      const nextTimes = buildNextEventTimes(current, patch);
      eventTimesRef.current = nextTimes;
      scheduleEventTimesPersist(nextTimes);
      return nextTimes;
    });
  };

  const handleEventTimeFocus = (event, fieldKeys) => {
    editingEventTimesRef.current = true;
    selectSidebarFieldText(event);
    scrollToDynamicFieldTarget(fieldKeys);
  };

  const handleEventTimeBlur = (feature = EVENT_DETAIL_FEATURES.CEREMONY) => {
    editingEventTimesRef.current = false;
    if (normalizeEventDetailFeature(feature) === EVENT_DETAIL_FEATURES.PARTY) {
      flushPartyEventTimes();
      return;
    }
    flushEventTimes();
  };

  const handleEventTimeKeyDown = (event) => {
    if (event.key === "Enter") {
      event.currentTarget.blur();
    }
  };

  const handleEventEndTimeChange = (
    event,
    feature = EVENT_DETAIL_FEATURES.CEREMONY
  ) => {
    applyEventTimes({ endTime: event.target.value }, feature);
  };

  const persistEventLocation = useCallback((nextLocation) => {
    if (eventLocationSaveTimerRef.current) {
      clearTimeout(eventLocationSaveTimerRef.current);
      eventLocationSaveTimerRef.current = null;
    }
    const signature = buildEventLocationSignature(nextLocation);
    pendingEventLocationSignatureRef.current = signature;
    void updateLinkedEventLocation(nextLocation, EVENT_DETAIL_FEATURES.CEREMONY).then((ok) => {
      if (!ok) return;
      if (pendingEventLocationSignatureRef.current === signature) {
        pendingEventLocationSignatureRef.current = "";
      }
    });
  }, []);

  const persistPartyEventLocation = useCallback((nextLocation) => {
    if (partyEventLocationSaveTimerRef.current) {
      clearTimeout(partyEventLocationSaveTimerRef.current);
      partyEventLocationSaveTimerRef.current = null;
    }
    const signature = buildEventLocationSignature(nextLocation);
    pendingPartyEventLocationSignatureRef.current = signature;
    void updateLinkedEventLocation(nextLocation, EVENT_DETAIL_FEATURES.PARTY).then((ok) => {
      if (!ok) return;
      if (pendingPartyEventLocationSignatureRef.current === signature) {
        pendingPartyEventLocationSignatureRef.current = "";
      }
    });
  }, []);

  const scheduleEventLocationPersist = useCallback(
    (nextLocation) => {
      if (eventLocationSaveTimerRef.current) {
        clearTimeout(eventLocationSaveTimerRef.current);
      }
      pendingEventLocationSignatureRef.current =
        buildEventLocationSignature(nextLocation);
      eventLocationSaveTimerRef.current = setTimeout(() => {
        persistEventLocation(nextLocation);
      }, EVENT_LOCATION_SAVE_DELAY_MS);
    },
    [persistEventLocation]
  );

  const schedulePartyEventLocationPersist = useCallback(
    (nextLocation) => {
      if (partyEventLocationSaveTimerRef.current) {
        clearTimeout(partyEventLocationSaveTimerRef.current);
      }
      pendingPartyEventLocationSignatureRef.current =
        buildEventLocationSignature(nextLocation);
      partyEventLocationSaveTimerRef.current = setTimeout(() => {
        persistPartyEventLocation(nextLocation);
      }, EVENT_LOCATION_SAVE_DELAY_MS);
    },
    [persistPartyEventLocation]
  );

  const flushEventLocation = useCallback(() => {
    persistEventLocation(eventLocationRef.current);
  }, [persistEventLocation]);

  const flushPartyEventLocation = useCallback(() => {
    persistPartyEventLocation(partyEventLocationRef.current);
  }, [persistPartyEventLocation]);

  const applyEventLocation = (
    patch,
    { persist = true, feature = EVENT_DETAIL_FEATURES.CEREMONY } = {}
  ) => {
    if (normalizeEventDetailFeature(feature) === EVENT_DETAIL_FEATURES.PARTY) {
      setPartyEventLocation((current) => {
        const nextLocation = {
          ...current,
          ...patch,
          eventDetailsFeature: EVENT_DETAIL_FEATURES.PARTY,
        };
        partyEventLocationRef.current = nextLocation;
        if (persist) schedulePartyEventLocationPersist(nextLocation);
        return nextLocation;
      });
      return;
    }
    setEventLocation((current) => {
      const nextLocation = {
        ...current,
        ...patch,
        eventDetailsFeature: EVENT_DETAIL_FEATURES.CEREMONY,
      };
      eventLocationRef.current = nextLocation;
      if (persist) scheduleEventLocationPersist(nextLocation);
      return nextLocation;
    });
  };

  const resolveGoogleAutocompleteSessionToken = useCallback(async () => {
    const places = await loadGoogleMapsPlacesLibrary();
    const TokenClass =
      places?.AutocompleteSessionToken ||
      window.google?.maps?.places?.AutocompleteSessionToken;
    if (!TokenClass) return null;
    if (!googleAutocompleteSessionTokenRef.current) {
      googleAutocompleteSessionTokenRef.current = new TokenClass();
    }
    return googleAutocompleteSessionTokenRef.current;
  }, []);

  const scheduleLocationSuggestions = useCallback(
    (fieldName, value) => {
      activeLocationSearchFieldRef.current = fieldName;
      if (locationSuggestionTimerRef.current) {
        clearTimeout(locationSuggestionTimerRef.current);
      }
      const query = String(value || "").trim();
      if (!hasGoogleMapsApiKey || query.length < 3) {
        setLocationSuggestions([]);
        setLocationSuggestionsOpen(false);
        setLocationSuggestionsLoading(false);
        setLocationSuggestionsError("");
        return;
      }

      setLocationSuggestionsLoading(true);
      setLocationSuggestionsError("");
      locationSuggestionTimerRef.current = setTimeout(() => {
        void (async () => {
          try {
            const sessionToken = await resolveGoogleAutocompleteSessionToken();
            const suggestions = await fetchGooglePlaceSuggestions(query, sessionToken);
            if (activeLocationSearchFieldRef.current !== fieldName) return;
            setLocationSuggestions(suggestions);
            setLocationSuggestionsOpen(suggestions.length > 0);
          } catch (error) {
            setLocationSuggestions([]);
            setLocationSuggestionsOpen(false);
            setLocationSuggestionsError(
              error instanceof Error
                ? error.message
                : "No se pudieron cargar sugerencias de Google Maps."
            );
          } finally {
            setLocationSuggestionsLoading(false);
          }
        })();
      }, 300);
    },
    [hasGoogleMapsApiKey, resolveGoogleAutocompleteSessionToken]
  );

  const handleEventLocationFocus = (
    event,
    fieldName,
    value,
    feature = EVENT_DETAIL_FEATURES.CEREMONY
  ) => {
    const safeFeature = normalizeEventDetailFeature(feature);
    const scrollKeys =
      fieldName === "venueName"
        ? buildEventScrollFieldKeys(safeFeature).venueName
        : buildEventScrollFieldKeys(safeFeature).venueAddress;
    editingEventLocationRef.current = true;
    selectSidebarFieldText(event);
    scrollToDynamicFieldTarget(scrollKeys);
    scheduleLocationSuggestions(`${safeFeature}:${fieldName}`, value);
  };

  const handleEventLocationBlur = (feature = EVENT_DETAIL_FEATURES.CEREMONY) => {
    editingEventLocationRef.current = false;
    if (normalizeEventDetailFeature(feature) === EVENT_DETAIL_FEATURES.PARTY) {
      flushPartyEventLocation();
    } else {
      flushEventLocation();
    }
    window.setTimeout(() => {
      setLocationSuggestionsOpen(false);
    }, 120);
  };

  const handleEventLocationKeyDown = (event) => {
    if (event.key === "Enter") {
      event.currentTarget.blur();
    }
  };

  const clearGoogleMapBinding = (feature = EVENT_DETAIL_FEATURES.CEREMONY) => {
    const safeFeature = normalizeEventDetailFeature(feature);
    const mapObject = findEventGoogleMapObject(readEditorObjects(window), safeFeature);
    if (mapObject?.id) {
      dispatchElementPatch(mapObject.id, buildEventGoogleMapClearPatch());
    }
    return {
      googlePlaceId: "",
      googleDisplayName: "",
      googleFormattedAddress: "",
      googleAddressComponents: [],
      googleLat: null,
      googleLng: null,
      showMap: false,
      hasGooglePlace: false,
      mapObjectId: mapObject?.id || "",
    };
  };

  const handleVenueNameChange = (
    event,
    feature = EVENT_DETAIL_FEATURES.CEREMONY
  ) => {
    const safeFeature = normalizeEventDetailFeature(feature);
    const venueName = event.target.value;
    applyEventLocation({ venueName }, { feature: safeFeature });
    scheduleLocationSuggestions(`${safeFeature}:venueName`, venueName);
  };

  const handleVenueAddressChange = (
    event,
    feature = EVENT_DETAIL_FEATURES.CEREMONY
  ) => {
    const safeFeature = normalizeEventDetailFeature(feature);
    const location =
      safeFeature === EVENT_DETAIL_FEATURES.PARTY
        ? partyEventLocation
        : eventLocation;
    const address = event.target.value;
    const googlePatch = location.googlePlaceId ? clearGoogleMapBinding(safeFeature) : {};
    applyEventLocation({
      ...googlePatch,
      address,
    }, { feature: safeFeature });
    scheduleLocationSuggestions(`${safeFeature}:address`, address);
  };

  const handleAddressTextFormatChange = (
    event,
    feature = EVENT_DETAIL_FEATURES.CEREMONY
  ) => {
    const safeFeature = normalizeEventDetailFeature(feature);
    const locationRef =
      safeFeature === EVENT_DETAIL_FEATURES.PARTY
        ? partyEventLocationRef
        : eventLocationRef;
    const addressTextFormatPreset = event.target.value;
    const nextLocationBase = {
      ...locationRef.current,
      addressTextFormatPreset,
    };
    const address = formatEventAddressText({
      address: nextLocationBase.address,
      googleFormattedAddress: nextLocationBase.googleFormattedAddress,
      googleAddressComponents: nextLocationBase.googleAddressComponents,
      preset: addressTextFormatPreset,
    });
    applyEventLocation({
      addressTextFormatPreset,
      address,
    }, { feature: safeFeature });
  };

  const ensureGoogleMapObject = (
    nextLocation,
    feature = EVENT_DETAIL_FEATURES.CEREMONY
  ) => {
    const safeFeature = normalizeEventDetailFeature(feature);
    const mapObject = findEventGoogleMapObject(readEditorObjects(window), safeFeature);
    const patch = buildEventGoogleMapObjectPatch(
      {
        ...nextLocation,
        eventDetailsFeature: safeFeature,
        width: mapObject?.width,
        height: mapObject?.height,
      },
      {
        showMap: nextLocation.showMap === true,
      }
    );
    if (mapObject?.id) {
      dispatchElementPatch(mapObject.id, patch);
      return mapObject.id;
    }
    const inserted = dispatchMapInsert(nextLocation, safeFeature);
    return inserted?.id || "";
  };

  const handleGoogleSuggestionSelect = async (
    suggestion,
    feature = EVENT_DETAIL_FEATURES.CEREMONY
  ) => {
    if (!suggestion?.prediction) return;
    const safeFeature = normalizeEventDetailFeature(feature);
    const locationRef =
      safeFeature === EVENT_DETAIL_FEATURES.PARTY
        ? partyEventLocationRef
        : eventLocationRef;
    setLocationSuggestionsLoading(true);
    setLocationSuggestionsError("");

    try {
      const googlePlace = await fetchGooglePlaceDetailsFromPrediction(
        suggestion.prediction
      );
      if (!googlePlace.placeId) {
        throw new Error("La ubicacion seleccionada no tiene Place ID.");
      }
      googleAutocompleteSessionTokenRef.current = null;
      const nextLocation = {
        ...locationRef.current,
        eventDetailsFeature: safeFeature,
        venueName: googlePlace.displayName || locationRef.current.venueName,
        address: googlePlace.formattedAddress || locationRef.current.address,
        googlePlaceId: googlePlace.placeId,
        googleDisplayName: googlePlace.displayName,
        googleFormattedAddress: googlePlace.formattedAddress,
        googleAddressComponents: googlePlace.addressComponents,
        googleLat: googlePlace.lat,
        googleLng: googlePlace.lng,
        hasGooglePlace: true,
        showMap: false,
      };
      nextLocation.address = formatEventAddressText({
        address: locationRef.current.address,
        googleFormattedAddress: nextLocation.googleFormattedAddress,
        googleAddressComponents: nextLocation.googleAddressComponents,
        preset: nextLocation.addressTextFormatPreset,
      });
      const mapObjectId = ensureGoogleMapObject(nextLocation, safeFeature);
      const nextWithMap = {
        ...nextLocation,
        mapObjectId,
      };
      if (safeFeature === EVENT_DETAIL_FEATURES.PARTY) {
        setPartyEventLocation(nextWithMap);
        partyEventLocationRef.current = nextWithMap;
        persistPartyEventLocation(nextWithMap);
      } else {
        setEventLocation(nextWithMap);
        eventLocationRef.current = nextWithMap;
        persistEventLocation(nextWithMap);
      }
      setLocationSuggestions([]);
      setLocationSuggestionsOpen(false);
    } catch (error) {
      setLocationSuggestionsError(
        error instanceof Error
          ? error.message
          : "No se pudo seleccionar la ubicacion de Google Maps."
      );
    } finally {
      setLocationSuggestionsLoading(false);
    }
  };

  const handleShowMapChange = (
    event,
    feature = EVENT_DETAIL_FEATURES.CEREMONY
  ) => {
    const checked = event.target.checked;
    const safeFeature = normalizeEventDetailFeature(feature);
    const location =
      safeFeature === EVENT_DETAIL_FEATURES.PARTY
        ? partyEventLocation
        : eventLocation;
    if (!location.googlePlaceId) return;
    const nextLocation = {
      ...location,
      eventDetailsFeature: safeFeature,
      showMap: checked,
    };
    const mapObject = findEventGoogleMapObject(readEditorObjects(window), safeFeature);
    if (mapObject?.id) {
      dispatchElementPatch(mapObject.id, { mostrarMapa: checked });
    } else if (checked) {
      ensureGoogleMapObject(nextLocation, safeFeature);
    }
    if (safeFeature === EVENT_DETAIL_FEATURES.PARTY) {
      setPartyEventLocation(nextLocation);
      partyEventLocationRef.current = nextLocation;
      return;
    }
    setEventLocation(nextLocation);
    eventLocationRef.current = nextLocation;
  };

  const applyCountdownDateTime = (
    nextDate,
    nextTime,
    feature = EVENT_DETAIL_FEATURES.CEREMONY
  ) => {
    const safeFeature = normalizeEventDetailFeature(feature);
    const details =
      safeFeature === EVENT_DETAIL_FEATURES.PARTY
        ? partyCountdownDetails
        : countdownDetails;
    const controlsDisabled =
      safeFeature === EVENT_DETAIL_FEATURES.PARTY
        ? partyEventDateControlsDisabled
        : eventDateControlsDisabled;
    const setState =
      safeFeature === EVENT_DETAIL_FEATURES.PARTY
        ? setPartyCountdownUi
        : setCountdownUi;

    setState((current) => ({
      ...current,
      date: nextDate,
      time: nextTime,
    }));

    if (controlsDisabled || !details.fieldKey) return;

    const targetISO = buildCountdownTargetIsoFromLocalParts({
      date: nextDate,
      time: normalizeEventTimeValue(nextTime),
    });
    const targetValue =
      targetISO ||
      buildEventDateTargetValue({
        date: nextDate,
        time: nextTime,
        fieldType: details.fieldType || details.field?.type,
      });
    if (!targetValue) return;

    if (details.countdownId && targetISO) {
      dispatchCountdownPatch(details.countdownId, {
        fechaObjetivo: targetISO,
      });
    }
    updateLinkedFieldDefault(details.fieldKey, targetValue, {
      applyTargets: true,
    });
  };

  const handleEventDateChange = (
    event,
    feature = EVENT_DETAIL_FEATURES.CEREMONY
  ) => {
    const safeFeature = normalizeEventDetailFeature(feature);
    const ui = safeFeature === EVENT_DETAIL_FEATURES.PARTY ? partyCountdownUi : countdownUi;
    applyCountdownDateTime(event.target.value, ui.time, safeFeature);
  };

  const handleEventStartTimeChange = (
    event,
    feature = EVENT_DETAIL_FEATURES.CEREMONY
  ) => {
    const safeFeature = normalizeEventDetailFeature(feature);
    const ui = safeFeature === EVENT_DETAIL_FEATURES.PARTY ? partyCountdownUi : countdownUi;
    const nextTime = normalizeEventTimeValue(event.target.value);
    applyCountdownDateTime(ui.date, nextTime, safeFeature);
    applyEventTimes({ startTime: nextTime }, safeFeature);
  };

  const handleShowCountdownChange = (
    event,
    feature = EVENT_DETAIL_FEATURES.CEREMONY
  ) => {
    const checked = event.target.checked;
    const safeFeature = normalizeEventDetailFeature(feature);
    const details =
      safeFeature === EVENT_DETAIL_FEATURES.PARTY
        ? partyCountdownDetails
        : countdownDetails;
    const visibilityDisabled =
      safeFeature === EVENT_DETAIL_FEATURES.PARTY
        ? partyCountdownVisibilityDisabled
        : countdownVisibilityDisabled;
    const setState =
      safeFeature === EVENT_DETAIL_FEATURES.PARTY
        ? setPartyCountdownUi
        : setCountdownUi;
    setState((current) => ({
      ...current,
      showCountdown: checked,
    }));

    if (visibilityDisabled || !details.countdownId) return;
    dispatchCountdownPatch(details.countdownId, {
      mostrarCuentaRegresiva: checked,
    });
  };

  const handleDateTextFormatChange = (
    event,
    feature = EVENT_DETAIL_FEATURES.CEREMONY
  ) => {
    const nextPreset = event.target.value;
    const safeFeature = normalizeEventDetailFeature(feature);
    const details =
      safeFeature === EVENT_DETAIL_FEATURES.PARTY
        ? partyCountdownDetails
        : countdownDetails;
    const controlsDisabled =
      safeFeature === EVENT_DETAIL_FEATURES.PARTY
        ? partyEventDateControlsDisabled
        : eventDateControlsDisabled;
    const setState =
      safeFeature === EVENT_DETAIL_FEATURES.PARTY
        ? setPartyCountdownUi
        : setCountdownUi;
    setState((current) => ({
      ...current,
      dateTextFormatPreset: nextPreset,
    }));

    if (controlsDisabled || !details.fieldKey) return;
    updateLinkedFieldDateTextFormat(details.fieldKey, nextPreset);
  };

  const renderLocationSuggestions = (fieldKey, feature = EVENT_DETAIL_FEATURES.CEREMONY) => {
    if (
      activeLocationSearchFieldRef.current !== fieldKey ||
      !locationSuggestionsOpen
    ) {
      return null;
    }

    return (
      <div className="absolute z-20 mt-1 max-h-52 w-full max-w-[361px] overflow-y-auto overflow-x-hidden rounded-md border border-[#00000029] bg-white shadow-lg">
        {locationSuggestions.map((suggestion) => (
          <button
            key={suggestion.id}
            type="button"
            className="block w-full px-3 py-2 text-left font-['Source_Sans_Pro',sans-serif] text-[12px] leading-[16px] text-[#262626] hover:bg-[#f6f0fb]"
            onMouseDown={(event) => {
              event.preventDefault();
              void handleGoogleSuggestionSelect(suggestion, feature);
            }}
          >
            {suggestion.label}
          </button>
        ))}
      </div>
    );
  };

  const eventStartTimeValue =
    resolveTimeInputValue(eventTimes.startTime) ||
    resolveTimeInputValue(countdownUi.time);
  const eventEndTimeValue = resolveTimeInputValue(eventTimes.endTime);
  const partyEventStartTimeValue =
    resolveTimeInputValue(partyEventTimes.startTime) ||
    resolveTimeInputValue(partyCountdownUi.time);
  const partyEventEndTimeValue = resolveTimeInputValue(partyEventTimes.endTime);
  const assistantScope = simplifiedForAssistant
    ? normalizeText(assistantSubstep?.scope)
    : "";
  const showEventNamesBlock =
    !simplifiedForAssistant || !assistantScope || assistantScope === "event-names";
  const showEventDateBlock =
    !simplifiedForAssistant || !assistantScope || assistantScope === "event-date";
  const showEventLocationBlock =
    !simplifiedForAssistant || !assistantScope || assistantScope === "event-location";
  const detailsContainerClass = simplifiedForAssistant
    ? "flex flex-1 min-h-0 w-full max-w-full flex-col items-center gap-0 overflow-hidden px-0 pb-1 pr-0 text-left"
    : "flex flex-1 min-h-0 w-full max-w-full flex-col items-center gap-0 overflow-y-auto overflow-x-hidden px-0 pb-4 pr-0 text-left";

  const renderEventDateSection = ({
    feature,
    title,
    dateInputId,
    startInputId,
    endInputId,
    dateFormatInputId,
    countdown,
    times,
    startTimeValue,
    endTimeValue,
    controlsDisabled,
    visibilityDisabled,
    scrollKeys,
  }) => {
    const safeFeature = normalizeEventDetailFeature(feature);
    return (
      <section className={`${sectionClass} pt-4`}>
        <h3 className={labelClass}>{title}</h3>

        <div className="mt-3">
          <label className={subLabelClass} htmlFor={dateInputId}>
            Fecha
          </label>
          <input
            id={dateInputId}
            type="date"
            value={countdown.date}
            onFocus={(event) => {
              selectSidebarFieldText(event);
              scrollToDynamicFieldTarget(scrollKeys.date);
            }}
            onChange={(event) => handleEventDateChange(event, safeFeature)}
            disabled={controlsDisabled}
            className={`${inputClass} ${disabledControlClass}`}
          />
        </div>

        <div className="mt-3 grid w-full grid-cols-2 gap-3">
          <div className="min-w-0">
            <label className={subLabelClass} htmlFor={startInputId}>
              Hora de inicio
            </label>
            <input
              id={startInputId}
              type="time"
              value={startTimeValue}
              onFocus={(event) => handleEventTimeFocus(event, scrollKeys.startTime)}
              onChange={(event) => handleEventStartTimeChange(event, safeFeature)}
              onBlur={() => handleEventTimeBlur(safeFeature)}
              onKeyDown={handleEventTimeKeyDown}
              className={inputClass}
            />
          </div>

          <div className="min-w-0">
            <label className={subLabelClass} htmlFor={endInputId}>
              Hora Fin <span className="text-[#777777]">(opcional)</span>
            </label>
            <input
              id={endInputId}
              type="time"
              value={endTimeValue}
              onFocus={(event) => handleEventTimeFocus(event, scrollKeys.endTime)}
              onChange={(event) => handleEventEndTimeChange(event, safeFeature)}
              onBlur={() => handleEventTimeBlur(safeFeature)}
              onKeyDown={handleEventTimeKeyDown}
              placeholder="Opcional"
              className={inputClass}
            />
          </div>
        </div>

        {!simplifiedForAssistant && (
          <>
            <div className="mt-3">
              <label className={subLabelClass} htmlFor={dateFormatInputId}>
                Formato de fecha en textos
              </label>
              <select
                id={dateFormatInputId}
                value={countdown.dateTextFormatPreset}
                onFocus={() => scrollToDynamicFieldTarget(scrollKeys.date)}
                onChange={(event) => handleDateTextFormatChange(event, safeFeature)}
                disabled={controlsDisabled}
                className={`${inputClass} ${disabledControlClass}`}
              >
                {DATE_TEXT_FORMAT_PRESET_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label} - {option.example}
                  </option>
                ))}
              </select>
            </div>

            <label className="mt-4 flex items-center gap-2 font-['Source_Sans_Pro',sans-serif] text-[13px] font-normal leading-[18px] text-[#262626]">
              <input
                type="checkbox"
                checked={countdown.showCountdown}
                onChange={(event) => handleShowCountdownChange(event, safeFeature)}
                disabled={visibilityDisabled}
                className={`${checkboxClass} disabled:cursor-not-allowed`}
              />
              Mostrar contador con cuenta regresiva
            </label>
          </>
        )}
      </section>
    );
  };

  const renderEventLocationSection = ({
    feature,
    title,
    placeInputId,
    addressInputId,
    addressFormatInputId,
    location,
    canShowMap,
    scrollKeys,
  }) => {
    const safeFeature = normalizeEventDetailFeature(feature);
    const venueNameKey = `${safeFeature}:venueName`;
    const addressKey = `${safeFeature}:address`;
    return (
      <section className={`${sectionClass} pb-1 pt-4`}>
        <h3 className={labelClass}>{title}</h3>

        <div className="relative mt-3">
          <label className={subLabelClass} htmlFor={placeInputId}>
            Nombre del lugar <span className="text-[#777777]">(opcional)</span>
          </label>
          <input
            id={placeInputId}
            type="text"
            value={location.venueName}
            onFocus={(event) =>
              handleEventLocationFocus(event, "venueName", location.venueName, safeFeature)
            }
            onChange={(event) => handleVenueNameChange(event, safeFeature)}
            onBlur={() => handleEventLocationBlur(safeFeature)}
            onKeyDown={handleEventLocationKeyDown}
            placeholder="Ej: Salon Las Acacias"
            className={inputClass}
          />
          {renderLocationSuggestions(venueNameKey, safeFeature)}
        </div>

        <div className="relative mt-3">
          <label className={subLabelClass} htmlFor={addressInputId}>
            Direccion
          </label>
          <input
            id={addressInputId}
            type="text"
            value={location.address}
            onFocus={(event) =>
              handleEventLocationFocus(event, "address", location.address, safeFeature)
            }
            onChange={(event) => handleVenueAddressChange(event, safeFeature)}
            onBlur={() => handleEventLocationBlur(safeFeature)}
            onKeyDown={handleEventLocationKeyDown}
            placeholder="Ej: Av. Corrientes 1234, CABA"
            className={inputClass}
          />
          {renderLocationSuggestions(addressKey, safeFeature)}
        </div>

        {!simplifiedForAssistant && (
          <div className="mt-3">
            <label className={subLabelClass} htmlFor={addressFormatInputId}>
              Formato de direccion en textos
            </label>
            <select
              id={addressFormatInputId}
              value={location.addressTextFormatPreset}
              onFocus={() => scrollToDynamicFieldTarget(scrollKeys.venueAddress)}
              onChange={(event) => handleAddressTextFormatChange(event, safeFeature)}
              className={inputClass}
            >
              {ADDRESS_TEXT_FORMAT_PRESET_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label} - {option.example}
                </option>
              ))}
            </select>
          </div>
        )}

        {locationSuggestionsLoading ? (
          <p className="mt-2 font-['Source_Sans_Pro',sans-serif] text-[11px] text-[#777777]">
            Buscando ubicaciones en Google Maps...
          </p>
        ) : null}
        {!hasGoogleMapsApiKey ? (
          <p className="mt-2 font-['Source_Sans_Pro',sans-serif] text-[11px] text-[#777777]">
            La busqueda de Google Maps no esta configurada. Los textos manuales siguen disponibles.
          </p>
        ) : null}
        {locationSuggestionsError ? (
          <p className="mt-2 rounded-md bg-rose-50 px-2 py-1 font-['Source_Sans_Pro',sans-serif] text-[11px] text-rose-700">
            {locationSuggestionsError}
          </p>
        ) : null}

        {!simplifiedForAssistant && (
          <>
            <label className="mt-4 flex items-center gap-2 font-['Source_Sans_Pro',sans-serif] text-[13px] font-normal leading-[18px] text-[#262626]">
              <input
                type="checkbox"
                checked={location.showMap}
                onChange={(event) => handleShowMapChange(event, safeFeature)}
                disabled={!canShowMap}
                className={`${checkboxClass} disabled:cursor-not-allowed`}
              />
              Mostrar mapa en la invitacion
            </label>
            {!canShowMap ? (
              <p className="mt-2 font-['Source_Sans_Pro',sans-serif] text-[11px] text-[#777777]">
                Selecciona una sugerencia de Google Maps para activar el mapa.
              </p>
            ) : null}
          </>
        )}
      </section>
    );
  };

  return (
    <div className={detailsContainerClass}>
      {showEventNamesBlock && (
        <>
          <section className={`${sectionClass} pt-4`}>
            <label className={labelClass} htmlFor="event-name">
              Nombre del evento
            </label>
            <input
              id="event-name"
              type="text"
              value={eventName}
              onFocus={handleEventNameFocus}
              onChange={handleEventNameChange}
              onBlur={commitEventName}
              onKeyDown={handleEventNameKeyDown}
              disabled={!canEditEventName}
              placeholder="Sin nombre"
              className={`${inputClass} ${disabledControlClass}`}
            />
          </section>

          <div className={dividerClass} />

          <section className={`${sectionClass} pt-4`}>
            <h3 className={labelClass}>Nombre de los casados</h3>

            <div className="mt-3">
              <label className={subLabelClass} htmlFor="first-person-name">
                Nombre de la primera persona
              </label>
              <input
                id="first-person-name"
                type="text"
                value={eventPersonNames.primaryName}
                onFocus={(event) =>
                  handleEventPersonNameFocus(event, EVENT_PRIMARY_PERSON_SCROLL_FIELD_KEYS)
                }
                onChange={handlePrimaryPersonNameChange}
                onBlur={handleEventPersonNameBlur}
                onKeyDown={handleEventPersonNameKeyDown}
                placeholder="Ej: Sofia"
                className={inputClass}
              />
            </div>

            <div className="mt-3">
              <label className={subLabelClass} htmlFor="second-person-name">
                Nombre de la segunda persona
              </label>
              <input
                id="second-person-name"
                type="text"
                value={eventPersonNames.secondaryName}
                onFocus={(event) =>
                  handleEventPersonNameFocus(event, EVENT_SECONDARY_PERSON_SCROLL_FIELD_KEYS)
                }
                onChange={handleSecondaryPersonNameChange}
                onBlur={handleEventPersonNameBlur}
                onKeyDown={handleEventPersonNameKeyDown}
                placeholder="Ej: Mateo"
                className={inputClass}
              />
            </div>
          </section>
        </>
      )}

      {showEventNamesBlock && showEventDateBlock && <div className={dividerClass} />}

      {!simplifiedForAssistant && (showEventDateBlock || showEventLocationBlock) && (
        <section className={`${sectionClass} pt-4`}>
          <label className={labelClass} htmlFor="event-details-mode">
            Modalidad del evento
          </label>
          <select
            id="event-details-mode"
            value={eventMode}
            onChange={handleEventDetailsModeChange}
            className={inputClass}
          >
            <option value={EVENT_DETAILS_MODES[0]}>Un solo evento</option>
            <option value={EVENT_DETAILS_MODES[1]}>Ceremonia y fiesta</option>
          </select>
        </section>
      )}

      {!simplifiedForAssistant && (
        <section className={`${sectionClass} pt-4`}>
          <label className={labelClass} htmlFor="event-dress-code-enabled">
            Dress Code
          </label>
          <label className="mt-3 flex items-center gap-2 font-['Source_Sans_Pro',sans-serif] text-[13px] font-normal leading-[18px] text-[#262626]">
            <input
              id="event-dress-code-enabled"
              type="checkbox"
              checked={isDressCodeEnabled}
              onChange={handleDressCodeEnabledChange}
              className={checkboxClass}
            />
            Mostrar Dress Code
          </label>
          {isDressCodeEnabled ? (
            <div className="mt-3">
              <label className={subLabelClass} htmlFor="event-dress-code-value">
                Texto del Dress Code
              </label>
              <input
                id="event-dress-code-value"
                type="text"
                value={dressCodeValue}
                onFocus={handleDressCodeFocus}
                onChange={handleDressCodeValueChange}
                placeholder="Ej: Formal"
                className={inputClass}
              />
            </div>
          ) : null}
        </section>
      )}

      {!simplifiedForAssistant && (showEventDateBlock || showEventLocationBlock) && (
        <div className={dividerClass} />
      )}

      {showEventDateBlock &&
        renderEventDateSection({
          feature: EVENT_DETAIL_FEATURES.CEREMONY,
          title: `Dia y hora de ${getEventDetailFeatureLabel(EVENT_DETAIL_FEATURES.CEREMONY).toLowerCase()}`,
          dateInputId: "event-ceremony-date",
          startInputId: "event-ceremony-start-time",
          endInputId: "event-ceremony-end-time",
          dateFormatInputId: "event-ceremony-date-text-format",
          countdown: countdownUi,
          times: eventTimes,
          startTimeValue: eventStartTimeValue,
          endTimeValue: eventEndTimeValue,
          controlsDisabled: eventDateControlsDisabled,
          visibilityDisabled: countdownVisibilityDisabled,
          scrollKeys: ceremonyScrollFieldKeys,
        })}

      {showEventDateBlock && isCeremonyPartyMode &&
        renderEventDateSection({
          feature: EVENT_DETAIL_FEATURES.PARTY,
          title: `Dia y hora de ${getEventDetailFeatureLabel(EVENT_DETAIL_FEATURES.PARTY).toLowerCase()}`,
          dateInputId: "event-party-date",
          startInputId: "event-party-start-time",
          endInputId: "event-party-end-time",
          dateFormatInputId: "event-party-date-text-format",
          countdown: partyCountdownUi,
          times: partyEventTimes,
          startTimeValue: partyEventStartTimeValue,
          endTimeValue: partyEventEndTimeValue,
          controlsDisabled: partyEventDateControlsDisabled,
          visibilityDisabled: partyCountdownVisibilityDisabled,
          scrollKeys: partyScrollFieldKeys,
        })}

      {showEventDateBlock && showEventLocationBlock && <div className={dividerClass} />}

      {showEventLocationBlock &&
        renderEventLocationSection({
          feature: EVENT_DETAIL_FEATURES.CEREMONY,
          title: `Ubicacion de ${getEventDetailFeatureLabel(EVENT_DETAIL_FEATURES.CEREMONY).toLowerCase()}`,
          placeInputId: "event-ceremony-place",
          addressInputId: "event-ceremony-address",
          addressFormatInputId: "event-ceremony-address-text-format",
          location: eventLocation,
          canShowMap: canShowEventMap,
          scrollKeys: ceremonyScrollFieldKeys,
        })}

      {showEventLocationBlock && isCeremonyPartyMode &&
        renderEventLocationSection({
          feature: EVENT_DETAIL_FEATURES.PARTY,
          title: `Ubicacion de ${getEventDetailFeatureLabel(EVENT_DETAIL_FEATURES.PARTY).toLowerCase()}`,
          placeInputId: "event-party-place",
          addressInputId: "event-party-address",
          addressFormatInputId: "event-party-address-text-format",
          location: partyEventLocation,
          canShowMap: canShowPartyEventMap,
          scrollKeys: partyScrollFieldKeys,
        })}
    </div>
  );
}
