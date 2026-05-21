export const EVENT_LOCATION_ROLES = Object.freeze({
  VENUE_NAME: "venue_name",
  VENUE_ADDRESS: "venue_address",
});

export const EVENT_LOCATION_FIELD_KEYS = Object.freeze({
  [EVENT_LOCATION_ROLES.VENUE_NAME]: "event_venue_name",
  [EVENT_LOCATION_ROLES.VENUE_ADDRESS]: "event_venue_address",
});

const EVENT_LOCATION_FIELD_LABELS = Object.freeze({
  [EVENT_LOCATION_ROLES.VENUE_NAME]: "Nombre del lugar",
  [EVENT_LOCATION_ROLES.VENUE_ADDRESS]: "Direccion del evento",
});

export const DEFAULT_ADDRESS_TEXT_FORMAT_PRESET = "event_address_full_google";
export const ADDRESS_TEXT_FORMAT_PRESETS = Object.freeze([
  "event_address_full_google",
  "event_address_without_country",
  "event_address_without_postal_country",
  "event_address_street_number",
  "event_address_street_locality",
  "event_address_custom",
]);
export const ADDRESS_TEXT_FORMAT_PRESET_OPTIONS = Object.freeze([
  {
    value: "event_address_full_google",
    label: "Direccion completa",
    example: "Av. Corrientes 1234, C1043 CABA, Argentina",
  },
  {
    value: "event_address_without_country",
    label: "Sin pais",
    example: "Av. Corrientes 1234, C1043 CABA",
  },
  {
    value: "event_address_without_postal_country",
    label: "Sin codigo postal ni pais",
    example: "Av. Corrientes 1234, CABA",
  },
  {
    value: "event_address_street_number",
    label: "Calle y numero",
    example: "Av. Corrientes 1234",
  },
  {
    value: "event_address_street_locality",
    label: "Direccion y localidad",
    example: "Av. Corrientes 1234, CABA",
  },
  {
    value: "event_address_custom",
    label: "Personalizada",
    example: "Usa el texto escrito",
  },
]);

const MAP_OBJECT_TYPE = "mapa-google";
const DEFAULT_MAP_WIDTH = 361;
const DEFAULT_MAP_HEIGHT = 220;
const MIN_MAP_SIZE = 200;
const ADDRESS_TEXT_FORMAT_PRESET_SET = new Set(ADDRESS_TEXT_FORMAT_PRESETS);

function normalizeText(value) {
  return String(value || "").trim();
}

function asObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value;
}

function toFiniteNumber(value, fallback = null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeNullableCoordinate(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeStringList(value) {
  return (Array.isArray(value) ? value : [])
    .map((entry) => normalizeText(entry).toLowerCase())
    .filter(Boolean);
}

function splitFormattedAddress(value) {
  return normalizeText(value)
    .split(",")
    .map((part) => normalizeText(part))
    .filter(Boolean);
}

function joinAddressParts(parts) {
  return parts.map((part) => normalizeText(part)).filter(Boolean).join(", ");
}

function normalizeGoogleAddressComponent(component) {
  const source = asObject(component);
  const types = normalizeStringList(source.types);
  const longText = normalizeText(
    source.longText || source.long_name || source.name || source.text
  );
  const shortText = normalizeText(source.shortText || source.short_name || longText);
  if (!types.length || !longText) return null;

  return {
    longText,
    shortText: shortText || longText,
    types,
  };
}

export function normalizeGoogleAddressComponents(value) {
  return (Array.isArray(value) ? value : [])
    .map((component) => normalizeGoogleAddressComponent(component))
    .filter(Boolean);
}

function findAddressComponent(components, type) {
  const safeType = normalizeText(type).toLowerCase();
  if (!safeType) return null;
  return (
    normalizeGoogleAddressComponents(components).find((component) =>
      component.types.includes(safeType)
    ) || null
  );
}

function getAddressComponentText(components, types, { short = false } = {}) {
  for (const type of types) {
    const component = findAddressComponent(components, type);
    if (!component) continue;
    return normalizeText(short ? component.shortText : component.longText);
  }
  return "";
}

function resolveStreetAddress(components, formattedAddress = "") {
  const route = getAddressComponentText(components, ["route"]);
  const streetNumber = getAddressComponentText(components, ["street_number"]);
  const street = normalizeText(
    route && streetNumber ? `${route} ${streetNumber}` : route || streetNumber
  );
  if (street) return street;
  return splitFormattedAddress(formattedAddress)[0] || "";
}

function resolveLocalityText(components, formattedAddress = "") {
  const locality = getAddressComponentText(
    components,
    [
      "locality",
      "postal_town",
      "sublocality",
      "sublocality_level_1",
      "administrative_area_level_2",
    ],
    { short: true }
  );
  if (locality) return locality;
  return splitFormattedAddress(formattedAddress)[1] || "";
}

function resolveProvinceText(components, formattedAddress = "") {
  const province = getAddressComponentText(
    components,
    ["administrative_area_level_1"],
    { short: true }
  );
  if (province) return province;
  return splitFormattedAddress(formattedAddress)[2] || "";
}

function removeTrailingCountry(formattedAddress, components) {
  const parts = splitFormattedAddress(formattedAddress);
  if (!parts.length) return "";
  const countryLong = getAddressComponentText(components, ["country"]);
  const countryShort = getAddressComponentText(components, ["country"], { short: true });
  const countryTokens = new Set(
    [countryLong, countryShort, "argentina"].map((part) => normalizeText(part).toLowerCase()).filter(Boolean)
  );
  const nextParts = [...parts];
  while (
    nextParts.length > 1 &&
    countryTokens.has(normalizeText(nextParts[nextParts.length - 1]).toLowerCase())
  ) {
    nextParts.pop();
  }
  return joinAddressParts(nextParts);
}

function removePostalCode(value, components) {
  let result = normalizeText(value);
  const postalCode = getAddressComponentText(components, ["postal_code"]);
  if (postalCode) {
    result = result.replace(new RegExp(`\\b${postalCode.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi"), "");
  }
  return result
    .replace(/\b[A-Z]\d{4}[A-Z]{0,3}\b/gi, "")
    .replace(/\s+,/g, ",")
    .replace(/,\s*,/g, ",")
    .replace(/\s{2,}/g, " ")
    .replace(/^,\s*|\s*,$/g, "")
    .trim();
}

export function normalizeEventLocationRole(value) {
  const role = normalizeText(value).toLowerCase();
  if (role === EVENT_LOCATION_ROLES.VENUE_NAME) return role;
  if (role === EVENT_LOCATION_ROLES.VENUE_ADDRESS) return role;
  return "";
}

export function getEventLocationFieldKey(role) {
  const safeRole = normalizeEventLocationRole(role);
  return EVENT_LOCATION_FIELD_KEYS[safeRole] || "";
}

export function isEventLocationField(field) {
  return Boolean(normalizeEventLocationRole(asObject(field).eventDetailsRole));
}

export function buildEventLocationField(role) {
  const safeRole = normalizeEventLocationRole(role);
  const fieldKey = getEventLocationFieldKey(safeRole);
  if (!fieldKey) return null;

  return {
    key: fieldKey,
    label: EVENT_LOCATION_FIELD_LABELS[safeRole] || "Ubicacion",
    type: safeRole === EVENT_LOCATION_ROLES.VENUE_ADDRESS ? "location" : "text",
    group: "Ubicaciones",
    optional: safeRole === EVENT_LOCATION_ROLES.VENUE_NAME,
    eventDetailsRole: safeRole,
    ...(safeRole === EVENT_LOCATION_ROLES.VENUE_ADDRESS
      ? { addressTextFormatPreset: DEFAULT_ADDRESS_TEXT_FORMAT_PRESET }
      : {}),
    applyTargets: [],
  };
}

export function ensureEventLocationFields({ fieldsSchema } = {}) {
  const fields = Array.isArray(fieldsSchema) ? fieldsSchema : [];
  const nextFields = fields.map((field) => ({ ...asObject(field) }));
  let changed = false;

  Object.values(EVENT_LOCATION_ROLES).forEach((role) => {
    const templateField = buildEventLocationField(role);
    if (!templateField) return;

    const fieldIndex = nextFields.findIndex(
      (field) => normalizeText(field.key) === templateField.key
    );
    if (fieldIndex < 0) {
      nextFields.push(templateField);
      changed = true;
      return;
    }

    const current = nextFields[fieldIndex];
    const patched = {
      ...current,
      type: templateField.type,
      group: normalizeText(current.group) || templateField.group,
      optional:
        typeof current.optional === "boolean"
          ? current.optional
          : templateField.optional,
      eventDetailsRole: templateField.eventDetailsRole,
      ...(templateField.eventDetailsRole === EVENT_LOCATION_ROLES.VENUE_ADDRESS
        ? {
            addressTextFormatPreset: normalizeAddressTextFormatPreset(
              current.addressTextFormatPreset
            ),
          }
        : {}),
      applyTargets: Array.isArray(current.applyTargets) ? current.applyTargets : [],
    };
    if (JSON.stringify(patched) !== JSON.stringify(current)) {
      nextFields[fieldIndex] = patched;
      changed = true;
    }
  });

  return {
    fieldsSchema: nextFields,
    changed,
  };
}

export function collectEventLocationFields(fieldsSchema) {
  return (Array.isArray(fieldsSchema) ? fieldsSchema : [])
    .map((field) => asObject(field))
    .filter((field) => isEventLocationField(field));
}

export function normalizeGooglePlaceInput(value) {
  const source = asObject(value);
  const displayName =
    typeof source.displayName === "object"
      ? normalizeText(source.displayName?.text)
      : normalizeText(source.displayName || source.name);
  const formattedAddress = normalizeText(
    source.formattedAddress || source.formatted_address || source.address
  );
  const location = asObject(source.location || source.geometry?.location);
  const lat =
    typeof location.lat === "function"
      ? location.lat()
      : normalizeNullableCoordinate(location.lat);
  const lng =
    typeof location.lng === "function"
      ? location.lng()
      : normalizeNullableCoordinate(location.lng);

  return {
    placeId: normalizeText(source.placeId || source.place_id || source.id),
    displayName,
    formattedAddress,
    addressComponents: normalizeGoogleAddressComponents(
      source.addressComponents || source.address_components
    ),
    lat,
    lng,
  };
}

export function normalizeAddressTextFormatPreset(preset) {
  const safePreset = normalizeText(preset);
  return ADDRESS_TEXT_FORMAT_PRESET_SET.has(safePreset)
    ? safePreset
    : DEFAULT_ADDRESS_TEXT_FORMAT_PRESET;
}

export function resolveEventAddressTextFormatPreset(field) {
  return normalizeAddressTextFormatPreset(asObject(field).addressTextFormatPreset);
}

export function formatEventAddressText({
  address,
  googleFormattedAddress,
  googleAddressComponents,
  preset,
} = {}) {
  const safePreset = normalizeAddressTextFormatPreset(preset);
  const manualAddress = normalizeText(address);
  const formattedAddress = normalizeText(googleFormattedAddress) || manualAddress;
  const components = normalizeGoogleAddressComponents(googleAddressComponents);
  if (!formattedAddress) return manualAddress;
  if (safePreset === "event_address_custom") return manualAddress || formattedAddress;

  if (safePreset === "event_address_full_google") {
    return formattedAddress;
  }

  if (safePreset === "event_address_without_country") {
    return removeTrailingCountry(formattedAddress, components) || formattedAddress;
  }

  if (safePreset === "event_address_without_postal_country") {
    const withoutCountry = removeTrailingCountry(formattedAddress, components);
    return removePostalCode(withoutCountry || formattedAddress, components) || withoutCountry || formattedAddress;
  }

  const street = resolveStreetAddress(components, formattedAddress);
  if (safePreset === "event_address_street_number") {
    return street || manualAddress || formattedAddress;
  }

  if (safePreset === "event_address_street_locality") {
    const locality = resolveLocalityText(components, formattedAddress);
    const province = resolveProvinceText(components, formattedAddress);
    return joinAddressParts([street, locality || province]) || street || manualAddress || formattedAddress;
  }

  return formattedAddress;
}

export function updateEventAddressTextFormatInSchema({
  fieldsSchema,
  preset,
} = {}) {
  const resolvedPreset = normalizeAddressTextFormatPreset(preset);
  const fields = Array.isArray(fieldsSchema) ? fieldsSchema : [];
  let changed = false;
  let field = null;

  const nextFields = fields.map((entry) => {
    const current = asObject(entry);
    if (normalizeEventLocationRole(current.eventDetailsRole) !== EVENT_LOCATION_ROLES.VENUE_ADDRESS) {
      return entry;
    }
    const nextField = {
      ...current,
      addressTextFormatPreset: resolvedPreset,
    };
    if (JSON.stringify(nextField) !== JSON.stringify(current)) {
      changed = true;
    }
    field = nextField;
    return nextField;
  });

  return {
    fieldsSchema: nextFields,
    changed,
    field,
    preset: resolvedPreset,
  };
}

export function isGoogleMapObject(objeto) {
  return normalizeText(objeto?.tipo).toLowerCase() === MAP_OBJECT_TYPE;
}

export function findEventGoogleMapObject(objetos) {
  return (
    (Array.isArray(objetos) ? objetos : []).find((objeto) =>
      isGoogleMapObject(objeto)
    ) || null
  );
}

export function isEventGoogleMapVisible(objeto) {
  const safeObject = asObject(objeto);
  return Boolean(
    isGoogleMapObject(safeObject) &&
      normalizeText(safeObject.googlePlaceId) &&
      safeObject.mostrarMapa === true
  );
}

export function resolveEventLocationFromAuthoring({
  fieldsSchema,
  defaults,
  objetos,
} = {}) {
  const safeDefaults = asObject(defaults);
  const nameKey = getEventLocationFieldKey(EVENT_LOCATION_ROLES.VENUE_NAME);
  const addressKey = getEventLocationFieldKey(EVENT_LOCATION_ROLES.VENUE_ADDRESS);
  const mapObject = findEventGoogleMapObject(objetos);
  const fields = collectEventLocationFields(fieldsSchema);
  const addressField =
    fields.find(
      (field) =>
        normalizeEventLocationRole(field.eventDetailsRole) ===
        EVENT_LOCATION_ROLES.VENUE_ADDRESS
    ) || null;
  const addressTextFormatPreset = resolveEventAddressTextFormatPreset(addressField);
  const googleAddressComponents = normalizeGoogleAddressComponents(
    mapObject?.googleAddressComponents
  );
  const defaultAddress = normalizeText(safeDefaults[addressKey]);
  const googleFormattedAddress = normalizeText(mapObject?.googleFormattedAddress);
  const hasGooglePlace = Boolean(normalizeText(mapObject?.googlePlaceId));

  return {
    venueName:
      normalizeText(safeDefaults[nameKey]) ||
      normalizeText(mapObject?.googleDisplayName),
    address:
      hasGooglePlace
        ? formatEventAddressText({
            address: defaultAddress,
            googleFormattedAddress,
            googleAddressComponents,
            preset: addressTextFormatPreset,
          })
        : defaultAddress || googleFormattedAddress,
    googlePlaceId: normalizeText(mapObject?.googlePlaceId),
    googleDisplayName: normalizeText(mapObject?.googleDisplayName),
    googleFormattedAddress,
    googleAddressComponents,
    googleLat: normalizeNullableCoordinate(mapObject?.googleLat),
    googleLng: normalizeNullableCoordinate(mapObject?.googleLng),
    showMap: Boolean(mapObject?.googlePlaceId) && mapObject?.mostrarMapa === true,
    hasGooglePlace,
    mapObjectId: normalizeText(mapObject?.id),
    addressTextFormatPreset,
    fields,
  };
}

export function buildEventLocationDefaults({
  fieldsSchema,
  defaults,
  location,
} = {}) {
  const safeDefaults = { ...asObject(defaults) };
  const safeLocation = asObject(location);

  collectEventLocationFields(fieldsSchema).forEach((field) => {
    const fieldKey = normalizeText(field.key);
    if (!fieldKey) return;
    const role = normalizeEventLocationRole(field.eventDetailsRole);
    if (role === EVENT_LOCATION_ROLES.VENUE_NAME) {
      safeDefaults[fieldKey] = normalizeText(safeLocation.venueName);
    } else if (role === EVENT_LOCATION_ROLES.VENUE_ADDRESS) {
      safeDefaults[fieldKey] = formatEventAddressText({
        address: safeLocation.address,
        googleFormattedAddress: safeLocation.googleFormattedAddress,
        googleAddressComponents: safeLocation.googleAddressComponents,
        preset: resolveEventAddressTextFormatPreset(field),
      });
    }
  });

  return safeDefaults;
}

export function buildEventGoogleMapObjectPatch(location = {}, options = {}) {
  const safeLocation = asObject(location);
  const googlePlace =
    safeLocation.googlePlace && typeof safeLocation.googlePlace === "object"
      ? normalizeGooglePlaceInput(safeLocation.googlePlace)
      : {
          placeId: normalizeText(safeLocation.googlePlaceId),
          displayName: normalizeText(safeLocation.googleDisplayName || safeLocation.venueName),
          formattedAddress: normalizeText(
            safeLocation.googleFormattedAddress || safeLocation.address
          ),
          addressComponents: normalizeGoogleAddressComponents(
            safeLocation.googleAddressComponents
          ),
          lat: normalizeNullableCoordinate(safeLocation.googleLat),
          lng: normalizeNullableCoordinate(safeLocation.googleLng),
        };
  const hasGooglePlace = Boolean(googlePlace.placeId);
  const showMap =
    hasGooglePlace &&
    (Object.prototype.hasOwnProperty.call(options, "showMap")
      ? options.showMap === true
      : safeLocation.showMap === true);

  return {
    tipo: MAP_OBJECT_TYPE,
    googlePlaceId: googlePlace.placeId,
    googleDisplayName: googlePlace.displayName,
    googleFormattedAddress: googlePlace.formattedAddress,
    googleAddressComponents: googlePlace.addressComponents,
    googleLat: googlePlace.lat,
    googleLng: googlePlace.lng,
    mostrarMapa: showMap,
    width: Math.max(MIN_MAP_SIZE, toFiniteNumber(safeLocation.width, DEFAULT_MAP_WIDTH)),
    height: Math.max(MIN_MAP_SIZE, toFiniteNumber(safeLocation.height, DEFAULT_MAP_HEIGHT)),
  };
}

export function buildEventGoogleMapInsertObject(location = {}, overrides = {}) {
  return {
    ...buildEventGoogleMapObjectPatch(location, { showMap: location?.showMap === true }),
    id:
      normalizeText(overrides.id) ||
      `mapa-google-${Date.now().toString(36)}`,
    x: toFiniteNumber(overrides.x, 220),
    y: toFiniteNumber(overrides.y, 140),
  };
}

export function buildEventGoogleMapClearPatch() {
  return {
    googlePlaceId: "",
    googleDisplayName: "",
    googleFormattedAddress: "",
    googleAddressComponents: [],
    googleLat: null,
    googleLng: null,
    mostrarMapa: false,
  };
}
