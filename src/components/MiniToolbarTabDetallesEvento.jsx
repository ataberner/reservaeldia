import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  buildCountdownTargetIsoFromLocalParts,
  buildDynamicCountdownEventDetails,
} from "@/domain/eventDetails/countdownEventDetails";
import {
  DATE_TEXT_FORMAT_PRESET_OPTIONS,
  DEFAULT_DATE_TEXT_TRANSFORM_PRESET,
  resolveFieldDateTextFormatPreset,
} from "@/domain/templates/fieldValueResolver";
import {
  resolveEventPersonNamesFromAuthoring,
} from "@/domain/eventDetails/personNames";
import {
  ADDRESS_TEXT_FORMAT_PRESET_OPTIONS,
  buildEventGoogleMapClearPatch,
  buildEventGoogleMapInsertObject,
  buildEventGoogleMapObjectPatch,
  findEventGoogleMapObject,
  formatEventAddressText,
  normalizeGooglePlaceInput,
  resolveEventLocationFromAuthoring,
} from "@/domain/eventDetails/location";
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

const inputClass =
  "mt-2 block h-[38px] w-[361px] max-w-full box-border bg-white px-3 font-['Source_Sans_Pro',sans-serif] text-[13px] font-normal leading-[18px] text-[#262626] outline-none placeholder:text-[#9b9b9b] [border:1px_solid_var(--Border,#00000029)] focus:[border-color:#692B9A]";
const labelClass =
  "block w-full text-left font-['Source_Sans_Pro',sans-serif] text-[16px] font-semibold leading-[24px] tracking-[0px] text-[#262626]";
const subLabelClass =
  "font-['Source_Sans_Pro',sans-serif] text-[13px] font-normal leading-[18px] text-[#262626]";
const sectionClass = "w-[361px] max-w-full px-0 pb-4 text-left";
const dividerClass = "w-[361px] max-w-full border-t border-[#262626]";
const checkboxClass =
  "h-[14px] w-[14px] accent-[#692B9A]";
const disabledControlClass =
  "disabled:cursor-not-allowed disabled:bg-[#f6f6f6] disabled:text-[#777777]";
const EVENT_PERSON_NAMES_SAVE_DELAY_MS = 350;
const EVENT_LOCATION_SAVE_DELAY_MS = 350;
const GOOGLE_MAPS_SCRIPT_ID = "reservaeldia-google-maps-js";

function readInitialDocumentNameState() {
  if (typeof window === "undefined") return readDashboardDocumentNameState();
  return readDashboardDocumentNameState(window);
}

function readCountdownDetailsState(targetWindow) {
  if (typeof window === "undefined" && !targetWindow) {
    return buildDynamicCountdownEventDetails();
  }

  const getTemplateAuthoringSnapshot = readCanvasEditorMethod(
    "getTemplateAuthoringSnapshot",
    targetWindow
  );
  const authoringSnapshot =
    typeof getTemplateAuthoringSnapshot === "function"
      ? getTemplateAuthoringSnapshot()
      : {};
  const objetos = readEditorObjects(targetWindow);

  return buildDynamicCountdownEventDetails({
    fieldsSchema: authoringSnapshot?.fieldsSchema,
    objetos,
  });
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

function readEventPersonNamesState(targetWindow) {
  const authoringSnapshot = readTemplateAuthoringSnapshot(targetWindow);
  return resolveEventPersonNamesFromAuthoring({
    fieldsSchema: authoringSnapshot?.fieldsSchema,
    defaults: authoringSnapshot?.defaults,
  });
}

function readEventLocationState(targetWindow) {
  const authoringSnapshot = readTemplateAuthoringSnapshot(targetWindow);
  return resolveEventLocationFromAuthoring({
    fieldsSchema: authoringSnapshot?.fieldsSchema,
    defaults: authoringSnapshot?.defaults,
    objetos: readEditorObjects(targetWindow),
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

function readInitialCountdownUiState() {
  if (typeof window === "undefined") return buildCountdownUiState();
  return buildCountdownUiState(readCountdownDetailsState(window));
}

function readInitialEventPersonNamesState() {
  if (typeof window === "undefined") return readEventPersonNamesState();
  return readEventPersonNamesState(window);
}

function readInitialEventLocationState() {
  if (typeof window === "undefined") return readEventLocationState();
  return readEventLocationState(window);
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

function dispatchMapInsert(location) {
  if (typeof window === "undefined") return null;
  const mapObject = buildEventGoogleMapInsertObject(location);
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

function updateLinkedEventLocation(location) {
  if (typeof window === "undefined") return Promise.resolve(false);
  const updateLocation = readCanvasEditorMethod("updateTemplateAuthoringEventLocation");
  if (typeof updateLocation !== "function") return Promise.resolve(false);

  return Promise.resolve(updateLocation(location))
    .then(() => true)
    .catch((error) => {
      console.error("No se pudo actualizar la ubicacion del evento.", error);
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

export default function MiniToolbarTabDetallesEvento() {
  const [documentNameState, setDocumentNameState] = useState(
    readInitialDocumentNameState
  );
  const [eventName, setEventName] = useState(
    () => readInitialDocumentNameState().name
  );
  const [countdownUi, setCountdownUi] = useState(readInitialCountdownUiState);
  const [eventPersonNames, setEventPersonNames] = useState(
    readInitialEventPersonNamesState
  );
  const [eventLocation, setEventLocation] = useState(
    readInitialEventLocationState
  );
  const [locationSuggestions, setLocationSuggestions] = useState([]);
  const [locationSuggestionsOpen, setLocationSuggestionsOpen] = useState(false);
  const [locationSuggestionsLoading, setLocationSuggestionsLoading] = useState(false);
  const [locationSuggestionsError, setLocationSuggestionsError] = useState("");
  const editingNameRef = useRef(false);
  const editingEventPersonNamesRef = useRef(false);
  const editingEventLocationRef = useRef(false);
  const activeLocationSearchFieldRef = useRef("");
  const eventPersonNamesRef = useRef(eventPersonNames);
  const eventLocationRef = useRef(eventLocation);
  const eventPersonNamesSaveTimerRef = useRef(null);
  const eventLocationSaveTimerRef = useRef(null);
  const pendingEventPersonNamesSignatureRef = useRef("");
  const pendingEventLocationSignatureRef = useRef("");
  const googleAutocompleteSessionTokenRef = useRef(null);
  const locationSuggestionTimerRef = useRef(null);
  const countdownDetails = countdownUi.details;
  const countdownControlsDisabled = !countdownDetails.hasBinding;
  const googleMapsApiKey = getGoogleMapsApiKey();
  const hasGoogleMapsApiKey = Boolean(googleMapsApiKey);
  const canShowEventMap = Boolean(eventLocation.googlePlaceId);

  const syncCountdownUiState = useCallback(() => {
    setCountdownUi(buildCountdownUiState(readCountdownDetailsState(window)));
  }, []);

  const syncEventPersonNamesState = useCallback(() => {
    const nextNames = readEventPersonNamesState(window);
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

  const syncEventLocationState = useCallback(() => {
    const nextLocation = readEventLocationState(window);
    const nextSignature = buildEventLocationSignature(nextLocation);
    if (editingEventLocationRef.current) return;
    if (
      pendingEventLocationSignatureRef.current &&
      pendingEventLocationSignatureRef.current !== nextSignature
    ) {
      return;
    }
    if (pendingEventLocationSignatureRef.current === nextSignature) {
      pendingEventLocationSignatureRef.current = "";
    }
    setEventLocation(nextLocation);
  }, []);

  useEffect(() => {
    eventPersonNamesRef.current = eventPersonNames;
  }, [eventPersonNames]);

  useEffect(() => {
    eventLocationRef.current = eventLocation;
  }, [eventLocation]);

  useEffect(() => {
    return () => {
      if (eventPersonNamesSaveTimerRef.current) {
        clearTimeout(eventPersonNamesSaveTimerRef.current);
      }
      if (eventLocationSaveTimerRef.current) {
        clearTimeout(eventLocationSaveTimerRef.current);
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
    syncEventPersonNamesState();
    syncEventLocationState();

    window.addEventListener(
      EDITOR_BRIDGE_EVENTS.SELECTION_CHANGE,
      syncCountdownUiState
    );
    window.addEventListener(
      EDITOR_BRIDGE_EVENTS.TEMPLATE_AUTHORING_CHANGE,
      syncCountdownUiState
    );
    window.addEventListener(
      EDITOR_BRIDGE_EVENTS.TEMPLATE_AUTHORING_CHANGE,
      syncEventPersonNamesState
    );
    window.addEventListener(
      EDITOR_BRIDGE_EVENTS.TEMPLATE_AUTHORING_CHANGE,
      syncEventLocationState
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
        EDITOR_BRIDGE_EVENTS.TEMPLATE_AUTHORING_CHANGE,
        syncCountdownUiState
      );
      window.removeEventListener(
        EDITOR_BRIDGE_EVENTS.TEMPLATE_AUTHORING_CHANGE,
        syncEventPersonNamesState
      );
      window.removeEventListener(
        EDITOR_BRIDGE_EVENTS.TEMPLATE_AUTHORING_CHANGE,
        syncEventLocationState
      );
      window.removeEventListener(
        EDITOR_BRIDGE_EVENTS.SELECTION_CHANGE,
        syncEventLocationState
      );
    };
  }, [syncCountdownUiState, syncEventPersonNamesState, syncEventLocationState]);

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

  const handleEventPersonNameFocus = () => {
    editingEventPersonNamesRef.current = true;
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

  const persistEventLocation = useCallback((nextLocation) => {
    if (eventLocationSaveTimerRef.current) {
      clearTimeout(eventLocationSaveTimerRef.current);
      eventLocationSaveTimerRef.current = null;
    }
    const signature = buildEventLocationSignature(nextLocation);
    pendingEventLocationSignatureRef.current = signature;
    void updateLinkedEventLocation(nextLocation).then((ok) => {
      if (!ok) return;
      if (pendingEventLocationSignatureRef.current === signature) {
        pendingEventLocationSignatureRef.current = "";
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

  const flushEventLocation = useCallback(() => {
    persistEventLocation(eventLocationRef.current);
  }, [persistEventLocation]);

  const applyEventLocation = (patch, { persist = true } = {}) => {
    setEventLocation((current) => {
      const nextLocation = {
        ...current,
        ...patch,
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

  const handleEventLocationFocus = (fieldName, value) => {
    editingEventLocationRef.current = true;
    scheduleLocationSuggestions(fieldName, value);
  };

  const handleEventLocationBlur = () => {
    editingEventLocationRef.current = false;
    flushEventLocation();
    window.setTimeout(() => {
      setLocationSuggestionsOpen(false);
    }, 120);
  };

  const handleEventLocationKeyDown = (event) => {
    if (event.key === "Enter") {
      event.currentTarget.blur();
    }
  };

  const clearGoogleMapBinding = () => {
    const mapObject = findEventGoogleMapObject(readEditorObjects(window));
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

  const handleVenueNameChange = (event) => {
    const venueName = event.target.value;
    applyEventLocation({ venueName });
    scheduleLocationSuggestions("venueName", venueName);
  };

  const handleVenueAddressChange = (event) => {
    const address = event.target.value;
    const googlePatch = eventLocation.googlePlaceId ? clearGoogleMapBinding() : {};
    applyEventLocation({
      ...googlePatch,
      address,
    });
    scheduleLocationSuggestions("address", address);
  };

  const handleAddressTextFormatChange = (event) => {
    const addressTextFormatPreset = event.target.value;
    const nextLocationBase = {
      ...eventLocationRef.current,
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
    });
  };

  const ensureGoogleMapObject = (nextLocation) => {
    const mapObject = findEventGoogleMapObject(readEditorObjects(window));
    const patch = buildEventGoogleMapObjectPatch(
      {
        ...nextLocation,
        width: mapObject?.width,
        height: mapObject?.height,
      },
      {
        showMap: nextLocation.showMap !== false,
      }
    );
    if (mapObject?.id) {
      dispatchElementPatch(mapObject.id, patch);
      return mapObject.id;
    }
    const inserted = dispatchMapInsert(nextLocation);
    return inserted?.id || "";
  };

  const handleGoogleSuggestionSelect = async (suggestion) => {
    if (!suggestion?.prediction) return;
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
      const existingMapObject = findEventGoogleMapObject(readEditorObjects(window));
      const nextShowMap = existingMapObject
        ? existingMapObject.mostrarMapa !== false
        : true;

      const nextLocation = {
        ...eventLocationRef.current,
        venueName: googlePlace.displayName || eventLocationRef.current.venueName,
        address: googlePlace.formattedAddress || eventLocationRef.current.address,
        googlePlaceId: googlePlace.placeId,
        googleDisplayName: googlePlace.displayName,
        googleFormattedAddress: googlePlace.formattedAddress,
        googleAddressComponents: googlePlace.addressComponents,
        googleLat: googlePlace.lat,
        googleLng: googlePlace.lng,
        hasGooglePlace: true,
        showMap: nextShowMap,
      };
      nextLocation.address = formatEventAddressText({
        address: eventLocationRef.current.address,
        googleFormattedAddress: nextLocation.googleFormattedAddress,
        googleAddressComponents: nextLocation.googleAddressComponents,
        preset: nextLocation.addressTextFormatPreset,
      });
      const mapObjectId = ensureGoogleMapObject(nextLocation);
      const nextWithMap = {
        ...nextLocation,
        mapObjectId,
      };
      setEventLocation(nextWithMap);
      eventLocationRef.current = nextWithMap;
      persistEventLocation(nextWithMap);
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

  const handleShowMapChange = (event) => {
    const checked = event.target.checked;
    if (!eventLocation.googlePlaceId) return;
    const nextLocation = {
      ...eventLocation,
      showMap: checked,
    };
    const mapObject = findEventGoogleMapObject(readEditorObjects(window));
    if (mapObject?.id) {
      dispatchElementPatch(mapObject.id, { mostrarMapa: checked });
    } else if (checked) {
      ensureGoogleMapObject(nextLocation);
    }
    setEventLocation(nextLocation);
    eventLocationRef.current = nextLocation;
  };

  const applyCountdownDateTime = (nextDate, nextTime) => {
    setCountdownUi((current) => ({
      ...current,
      date: nextDate,
      time: nextTime,
    }));

    if (countdownControlsDisabled || !countdownDetails.countdownId) return;

    const targetISO = buildCountdownTargetIsoFromLocalParts({
      date: nextDate,
      time: nextTime,
    });
    if (!targetISO) return;

    dispatchCountdownPatch(countdownDetails.countdownId, {
      fechaObjetivo: targetISO,
    });
    updateLinkedFieldDefault(countdownDetails.fieldKey, targetISO, {
      applyTargets: true,
    });
  };

  const handleEventDateChange = (event) => {
    applyCountdownDateTime(event.target.value, countdownUi.time);
  };

  const handleEventStartTimeChange = (event) => {
    applyCountdownDateTime(countdownUi.date, event.target.value);
  };

  const handleShowCountdownChange = (event) => {
    const checked = event.target.checked;
    setCountdownUi((current) => ({
      ...current,
      showCountdown: checked,
    }));

    if (countdownControlsDisabled || !countdownDetails.countdownId) return;
    dispatchCountdownPatch(countdownDetails.countdownId, {
      mostrarCuentaRegresiva: checked,
    });
  };

  const handleDateTextFormatChange = (event) => {
    const nextPreset = event.target.value;
    setCountdownUi((current) => ({
      ...current,
      dateTextFormatPreset: nextPreset,
    }));

    if (countdownControlsDisabled || !countdownDetails.fieldKey) return;
    updateLinkedFieldDateTextFormat(countdownDetails.fieldKey, nextPreset);
  };

  const renderLocationSuggestions = (fieldName) => {
    if (
      activeLocationSearchFieldRef.current !== fieldName ||
      !locationSuggestionsOpen
    ) {
      return null;
    }

    return (
      <div className="absolute z-20 mt-1 max-h-52 w-[361px] max-w-full overflow-y-auto rounded-md border border-[#00000029] bg-white shadow-lg">
        {locationSuggestions.map((suggestion) => (
          <button
            key={suggestion.id}
            type="button"
            className="block w-full px-3 py-2 text-left font-['Source_Sans_Pro',sans-serif] text-[12px] leading-[16px] text-[#262626] hover:bg-[#f6f0fb]"
            onMouseDown={(event) => {
              event.preventDefault();
              void handleGoogleSuggestionSelect(suggestion);
            }}
          >
            {suggestion.label}
          </button>
        ))}
      </div>
    );
  };

  return (
    <div className="flex flex-1 min-h-0 w-full flex-col items-center gap-0 overflow-y-auto px-0 pb-4 pr-0 text-left">
      <section className={`${sectionClass} pt-4`}>
        <label className={labelClass} htmlFor="event-name">
          Nombre del evento
        </label>
        <input
          id="event-name"
          type="text"
          value={eventName}
          onFocus={() => {
            editingNameRef.current = true;
          }}
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
            onFocus={handleEventPersonNameFocus}
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
            onFocus={handleEventPersonNameFocus}
            onChange={handleSecondaryPersonNameChange}
            onBlur={handleEventPersonNameBlur}
            onKeyDown={handleEventPersonNameKeyDown}
            placeholder="Ej: Mateo"
            className={inputClass}
          />
        </div>
      </section>

      <div className={dividerClass} />

      <section className={`${sectionClass} pt-4`}>
        <h3 className={labelClass}>Dia y hora de evento</h3>

        <div className="mt-3">
          <label className={subLabelClass} htmlFor="event-date">
            Fecha
          </label>
          <input
            id="event-date"
            type="date"
            value={countdownUi.date}
            onChange={handleEventDateChange}
            disabled={countdownControlsDisabled}
            className={`${inputClass} ${disabledControlClass}`}
          />
        </div>

        <div className="mt-3 grid grid-cols-2 gap-3">
          <div>
            <label className={subLabelClass} htmlFor="event-start-time">
              Hora de inicio
            </label>
            <input
              id="event-start-time"
              type="time"
              value={countdownUi.time}
              onChange={handleEventStartTimeChange}
              disabled={countdownControlsDisabled}
              className={`${inputClass} ${disabledControlClass}`}
            />
          </div>

          <div>
            <label className={subLabelClass} htmlFor="event-end-time">
              Hora Fin <span className="text-[#777777]">(opcional)</span>
            </label>
            <input
              id="event-end-time"
              type="text"
              placeholder="Opcional"
              className={inputClass}
            />
          </div>
        </div>

        <div className="mt-3">
          <label className={subLabelClass} htmlFor="event-date-text-format">
            Formato de fecha en textos
          </label>
          <select
            id="event-date-text-format"
            value={countdownUi.dateTextFormatPreset}
            onChange={handleDateTextFormatChange}
            disabled={countdownControlsDisabled}
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
            checked={countdownUi.showCountdown}
            onChange={handleShowCountdownChange}
            disabled={countdownControlsDisabled}
            className={`${checkboxClass} disabled:cursor-not-allowed`}
          />
          Mostrar contador con cuenta regresiva
        </label>
      </section>

      <div className={dividerClass} />

      <section className={`${sectionClass} pb-1 pt-4`}>
        <h3 className={labelClass}>Ubicacion del evento</h3>

        <div className="relative mt-3">
          <label className={subLabelClass} htmlFor="event-place">
            Nombre del lugar <span className="text-[#777777]">(opcional)</span>
          </label>
          <input
            id="event-place"
            type="text"
            value={eventLocation.venueName}
            onFocus={() => handleEventLocationFocus("venueName", eventLocation.venueName)}
            onChange={handleVenueNameChange}
            onBlur={handleEventLocationBlur}
            onKeyDown={handleEventLocationKeyDown}
            placeholder="Ej: Salon Las Acacias"
            className={inputClass}
          />
          {renderLocationSuggestions("venueName")}
        </div>

        <div className="relative mt-3">
          <label className={subLabelClass} htmlFor="event-address">
            Direccion
          </label>
          <input
            id="event-address"
            type="text"
            value={eventLocation.address}
            onFocus={() => handleEventLocationFocus("address", eventLocation.address)}
            onChange={handleVenueAddressChange}
            onBlur={handleEventLocationBlur}
            onKeyDown={handleEventLocationKeyDown}
            placeholder="Ej: Av. Corrientes 1234, CABA"
            className={inputClass}
          />
          {renderLocationSuggestions("address")}
        </div>

        <div className="mt-3">
          <label className={subLabelClass} htmlFor="event-address-text-format">
            Formato de direccion en textos
          </label>
          <select
            id="event-address-text-format"
            value={eventLocation.addressTextFormatPreset}
            onChange={handleAddressTextFormatChange}
            className={inputClass}
          >
            {ADDRESS_TEXT_FORMAT_PRESET_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label} - {option.example}
              </option>
            ))}
          </select>
        </div>

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

        <label className="mt-4 flex items-center gap-2 font-['Source_Sans_Pro',sans-serif] text-[13px] font-normal leading-[18px] text-[#262626]">
          <input
            type="checkbox"
            checked={eventLocation.showMap}
            onChange={handleShowMapChange}
            disabled={!canShowEventMap}
            className={`${checkboxClass} disabled:cursor-not-allowed`}
          />
          Mostrar mapa en la invitacion
        </label>
        {!canShowEventMap ? (
          <p className="mt-2 font-['Source_Sans_Pro',sans-serif] text-[11px] text-[#777777]">
            Selecciona una sugerencia de Google Maps para activar el mapa.
          </p>
        ) : null}
      </section>
    </div>
  );
}
