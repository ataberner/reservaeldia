import assert from "node:assert/strict";
import test from "node:test";

import {
  ADDRESS_TEXT_FORMAT_PRESETS,
  EVENT_LOCATION_ROLES,
  buildEventGoogleMapClearPatch,
  buildEventGoogleMapInsertObject,
  buildEventGoogleMapObjectPatch,
  buildEventLocationDefaults,
  ensureEventLocationFields,
  formatEventAddressText,
  findEventGoogleMapObject,
  getEventLocationFieldKey,
  isEventGoogleMapVisible,
  normalizeAddressTextFormatPreset,
  normalizeGoogleAddressComponents,
  normalizeGooglePlaceInput,
  resolveEventLocationFromAuthoring,
  updateEventAddressTextFormatInSchema,
} from "./location.js";

const GOOGLE_ADDRESS_COMPONENTS = [
  {
    longText: "1234",
    shortText: "1234",
    types: ["street_number"],
  },
  {
    longText: "Avenida Corrientes",
    shortText: "Av. Corrientes",
    types: ["route"],
  },
  {
    longText: "Buenos Aires",
    shortText: "CABA",
    types: ["locality"],
  },
  {
    longText: "Ciudad Autonoma de Buenos Aires",
    shortText: "CABA",
    types: ["administrative_area_level_1"],
  },
  {
    longText: "C1043",
    shortText: "C1043",
    types: ["postal_code"],
  },
  {
    longText: "Argentina",
    shortText: "AR",
    types: ["country"],
  },
];

test("ensureEventLocationFields creates stable venue name and address fields", () => {
  const result = ensureEventLocationFields({ fieldsSchema: [] });

  assert.equal(result.changed, true);
  assert.deepEqual(
    result.fieldsSchema.map((field) => field.key),
    ["event_venue_name", "event_venue_address"]
  );
  assert.equal(result.fieldsSchema[0].eventDetailsRole, EVENT_LOCATION_ROLES.VENUE_NAME);
  assert.equal(result.fieldsSchema[1].eventDetailsRole, EVENT_LOCATION_ROLES.VENUE_ADDRESS);
  assert.equal(result.fieldsSchema[1].type, "location");
  assert.equal(result.fieldsSchema[1].addressTextFormatPreset, "event_address_full_google");
});

test("buildEventLocationDefaults updates manual venue name and address", () => {
  const { fieldsSchema } = ensureEventLocationFields({ fieldsSchema: [] });
  const defaults = buildEventLocationDefaults({
    fieldsSchema,
    defaults: {},
    location: {
      venueName: "Salon Las Acacias",
      address: "Av. Corrientes 1234",
    },
  });

  assert.equal(
    defaults[getEventLocationFieldKey(EVENT_LOCATION_ROLES.VENUE_NAME)],
    "Salon Las Acacias"
  );
  assert.equal(
    defaults[getEventLocationFieldKey(EVENT_LOCATION_ROLES.VENUE_ADDRESS)],
    "Av. Corrientes 1234"
  );
});

test("resolveEventLocationFromAuthoring combines defaults and google map metadata", () => {
  const { fieldsSchema } = ensureEventLocationFields({ fieldsSchema: [] });
  const location = resolveEventLocationFromAuthoring({
    fieldsSchema,
    defaults: {
      event_venue_name: "Salon Las Acacias",
      event_venue_address: "Av. Corrientes 1234",
    },
    objetos: [
      {
        id: "map-1",
        tipo: "mapa-google",
        googlePlaceId: "place-123",
        googleDisplayName: "Salon Las Acacias",
        googleFormattedAddress: "Av. Corrientes 1234, CABA",
        googleAddressComponents: GOOGLE_ADDRESS_COMPONENTS,
        mostrarMapa: true,
      },
    ],
  });

  assert.equal(location.venueName, "Salon Las Acacias");
  assert.equal(location.address, "Av. Corrientes 1234, CABA");
  assert.equal(location.googlePlaceId, "place-123");
  assert.equal(location.mapObjectId, "map-1");
  assert.equal(location.showMap, true);
  assert.equal(location.addressTextFormatPreset, "event_address_full_google");
});

test("resolveEventLocationFromAuthoring keeps map hidden by default", () => {
  const { fieldsSchema } = ensureEventLocationFields({ fieldsSchema: [] });
  const location = resolveEventLocationFromAuthoring({
    fieldsSchema,
    defaults: {},
    objetos: [
      {
        id: "map-1",
        tipo: "mapa-google",
        googlePlaceId: "place-123",
        googleDisplayName: "Salon Las Acacias",
        googleFormattedAddress: "Av. Corrientes 1234, CABA",
      },
    ],
  });

  assert.equal(location.hasGooglePlace, true);
  assert.equal(location.showMap, false);
});

test("address text presets format Google addresses for linked texts", () => {
  const formattedAddress = "Av. Corrientes 1234, C1043 CABA, Argentina";

  assert.equal(
    formatEventAddressText({
      googleFormattedAddress: formattedAddress,
      googleAddressComponents: GOOGLE_ADDRESS_COMPONENTS,
      preset: "event_address_full_google",
    }),
    formattedAddress
  );
  assert.equal(
    formatEventAddressText({
      googleFormattedAddress: formattedAddress,
      googleAddressComponents: GOOGLE_ADDRESS_COMPONENTS,
      preset: "event_address_without_country",
    }),
    "Av. Corrientes 1234, C1043 CABA"
  );
  assert.equal(
    formatEventAddressText({
      googleFormattedAddress: formattedAddress,
      googleAddressComponents: GOOGLE_ADDRESS_COMPONENTS,
      preset: "event_address_without_postal_country",
    }),
    "Av. Corrientes 1234, CABA"
  );
  assert.equal(
    formatEventAddressText({
      googleFormattedAddress: formattedAddress,
      googleAddressComponents: GOOGLE_ADDRESS_COMPONENTS,
      preset: "event_address_street_number",
    }),
    "Avenida Corrientes 1234"
  );
  assert.equal(
    formatEventAddressText({
      googleFormattedAddress: formattedAddress,
      googleAddressComponents: GOOGLE_ADDRESS_COMPONENTS,
      preset: "event_address_street_locality",
    }),
    "Avenida Corrientes 1234, CABA"
  );
  assert.equal(
    formatEventAddressText({
      address: "Entrada por calle lateral",
      googleFormattedAddress: formattedAddress,
      googleAddressComponents: GOOGLE_ADDRESS_COMPONENTS,
      preset: "event_address_custom",
    }),
    "Entrada por calle lateral"
  );
});

test("address text format is stored in venue address field", () => {
  const { fieldsSchema } = ensureEventLocationFields({ fieldsSchema: [] });
  const result = updateEventAddressTextFormatInSchema({
    fieldsSchema,
    preset: "event_address_street_number",
  });

  assert.equal(result.changed, true);
  assert.equal(result.preset, "event_address_street_number");
  assert.equal(result.field.key, "event_venue_address");
  assert.equal(result.field.addressTextFormatPreset, "event_address_street_number");
  assert.equal(
    normalizeAddressTextFormatPreset("no_existe"),
    "event_address_full_google"
  );
  assert.ok(ADDRESS_TEXT_FORMAT_PRESETS.includes(result.preset));
});

test("buildEventLocationDefaults writes formatted address default from selected preset", () => {
  const { fieldsSchema } = ensureEventLocationFields({ fieldsSchema: [] });
  const formatted = updateEventAddressTextFormatInSchema({
    fieldsSchema,
    preset: "event_address_street_locality",
  });
  const defaults = buildEventLocationDefaults({
    fieldsSchema: formatted.fieldsSchema,
    defaults: {},
    location: {
      venueName: "Salon",
      address: "Av. Corrientes 1234, C1043 CABA, Argentina",
      googleFormattedAddress: "Av. Corrientes 1234, C1043 CABA, Argentina",
      googleAddressComponents: GOOGLE_ADDRESS_COMPONENTS,
    },
  });

  assert.equal(defaults.event_venue_address, "Avenida Corrientes 1234, CABA");
});

test("google place patch stays hidden unless show map is explicit", () => {
  const hiddenPatch = buildEventGoogleMapObjectPatch({
    venueName: "Salon",
    address: "Direccion",
    googlePlaceId: "place-123",
    googleDisplayName: "Salon",
    googleFormattedAddress: "Direccion",
    googleAddressComponents: GOOGLE_ADDRESS_COMPONENTS,
  });

  assert.equal(hiddenPatch.tipo, "mapa-google");
  assert.equal(hiddenPatch.googlePlaceId, "place-123");
  assert.equal(hiddenPatch.mostrarMapa, false);
  assert.equal(isEventGoogleMapVisible(hiddenPatch), false);

  const visiblePatch = buildEventGoogleMapObjectPatch(
    {
      venueName: "Salon",
      address: "Direccion",
      googlePlaceId: "place-123",
      googleDisplayName: "Salon",
      googleFormattedAddress: "Direccion",
      googleAddressComponents: GOOGLE_ADDRESS_COMPONENTS,
    },
    { showMap: true }
  );

  assert.equal(visiblePatch.mostrarMapa, true);
  assert.equal(isEventGoogleMapVisible(visiblePatch), true);

  assert.equal(
    isEventGoogleMapVisible({ ...visiblePatch, mostrarMapa: false }),
    false
  );
  assert.equal(
    isEventGoogleMapVisible({ ...visiblePatch, googlePlaceId: "" }),
    false
  );

  const inserted = buildEventGoogleMapInsertObject({
    googlePlaceId: "place-123",
  });

  assert.equal(inserted.mostrarMapa, false);
});

test("manual address clear patch removes google metadata and hides map", () => {
  const clearPatch = buildEventGoogleMapClearPatch();

  assert.equal(clearPatch.googlePlaceId, "");
  assert.deepEqual(clearPatch.googleAddressComponents, []);
  assert.equal(clearPatch.mostrarMapa, false);
  assert.equal(
    isEventGoogleMapVisible({
      tipo: "mapa-google",
      googlePlaceId: "place-123",
      ...clearPatch,
    }),
    false
  );
});

test("normalizeGooglePlaceInput accepts Google place-like objects", () => {
  const place = normalizeGooglePlaceInput({
    id: "place-123",
    displayName: { text: "Salon" },
    formattedAddress: "Direccion",
    addressComponents: [
      {
        long_name: "Avenida Corrientes",
        short_name: "Av. Corrientes",
        types: ["route"],
      },
    ],
    location: {
      lat: 10,
      lng: -20,
    },
  });

  assert.deepEqual(place, {
    placeId: "place-123",
    displayName: "Salon",
    formattedAddress: "Direccion",
    addressComponents: [
      {
        longText: "Avenida Corrientes",
        shortText: "Av. Corrientes",
        types: ["route"],
      },
    ],
    lat: 10,
    lng: -20,
  });
});

test("normalizeGoogleAddressComponents accepts old and new Google shapes", () => {
  assert.deepEqual(
    normalizeGoogleAddressComponents([
      {
        long_name: "Argentina",
        short_name: "AR",
        types: ["country"],
      },
      {
        longText: "Buenos Aires",
        shortText: "CABA",
        types: ["locality"],
      },
    ]),
    [
      {
        longText: "Argentina",
        shortText: "AR",
        types: ["country"],
      },
      {
        longText: "Buenos Aires",
        shortText: "CABA",
        types: ["locality"],
      },
    ]
  );
});

test("findEventGoogleMapObject uses the first google map object", () => {
  const found = findEventGoogleMapObject([
    { id: "text", tipo: "texto" },
    { id: "map-1", tipo: "mapa-google" },
    { id: "map-2", tipo: "mapa-google" },
  ]);

  assert.equal(found.id, "map-1");
});
