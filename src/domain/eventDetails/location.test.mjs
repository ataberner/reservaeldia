import assert from "node:assert/strict";
import test from "node:test";

import {
  ADDRESS_TEXT_FORMAT_PRESETS,
  EVENT_LOCATION_ROLES,
  buildEventGoogleMapClearPatch,
  buildEventGoogleMapInsertObject,
  buildEventGoogleMapObjectPatch,
  buildEventGoogleMapProjectionPatches,
  buildEventLocationDefaults,
  collectEventGoogleMapObjects,
  ensureEventLocationFields,
  formatEventAddressText,
  findEventGoogleMapObject,
  getEventLocationFieldKey,
  hasEventLocationProviderMetadataEntry,
  isEventGoogleMapVisible,
  mergeEventDetailsValueMetadata,
  migrateLegacyEventLocationProviderMetadata,
  normalizeAddressTextFormatPreset,
  normalizeEventLocationProviderMetadata,
  normalizeGoogleAddressComponents,
  normalizeGooglePlaceInput,
  readEventLocationProviderMetadata,
  resolveEventLocationFromAuthoring,
  setEventLocationProviderMetadata,
  updateEventAddressTextFormatInSchema,
} from "./location.js";

test("concurrent event-details metadata patches preserve the other event phase", () => {
  const ceremony = {
    source: "google_places",
    placeId: "ceremony-place",
    displayName: "Templo",
    formattedAddress: "Calle 1",
    addressComponents: [],
    lat: -34.6,
    lng: -58.4,
  };
  const party = {
    source: "google_places",
    placeId: "party-place",
    displayName: "Salon",
    formattedAddress: "Calle 2",
    addressComponents: [],
    lat: -34.5,
    lng: -58.5,
  };
  const baseValues = {
    __eventDetails: { locations: { ceremony } },
  };

  assert.deepEqual(
    mergeEventDetailsValueMetadata(baseValues, {
      __eventDetails: { locations: { party } },
    }).__eventDetails.locations,
    { ceremony, party }
  );
  assert.deepEqual(
    mergeEventDetailsValueMetadata(baseValues, {
      __eventDetails: { locations: { party: null } },
    }).__eventDetails.locations,
    { ceremony, party: null }
  );
});

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
    ["event_ceremony_venue_name", "event_ceremony_venue_address"]
  );
  assert.equal(result.fieldsSchema[0].eventDetailsRole, "ceremony_venue_name");
  assert.equal(result.fieldsSchema[1].eventDetailsRole, "ceremony_venue_address");
  assert.equal(result.fieldsSchema[1].type, "location");
  assert.equal(result.fieldsSchema[1].addressTextFormatPreset, "event_address_full_google");
});

test("ensureEventLocationFields keeps party address fields idempotent", () => {
  const first = ensureEventLocationFields({ fieldsSchema: [], feature: "party" });
  const linkedAddress = first.fieldsSchema.map((field) =>
    field.key === "event_party_venue_address"
      ? {
          ...field,
          addressTextFormatPreset: "event_address_street_locality",
          applyTargets: [{ scope: "objeto", id: "party-address", path: "texto" }],
        }
      : field
  );
  const second = ensureEventLocationFields({
    fieldsSchema: linkedAddress,
    feature: "party",
  });

  assert.equal(second.changed, false);
  assert.deepEqual(
    second.fieldsSchema.map((field) => field.key),
    ["event_party_venue_name", "event_party_venue_address"]
  );
  assert.equal(second.fieldsSchema[1].eventDetailsRole, "party_venue_address");
  assert.equal(
    second.fieldsSchema[1].addressTextFormatPreset,
    "event_address_street_locality"
  );
  assert.deepEqual(second.fieldsSchema[1].applyTargets, [
    { scope: "objeto", id: "party-address", path: "texto" },
  ]);
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
      event_ceremony_venue_name: "Salon Las Acacias",
      event_ceremony_venue_address: "Av. Corrientes 1234",
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
  assert.equal(result.field.key, "event_ceremony_venue_address");
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

  assert.equal(defaults.event_ceremony_venue_address, "Avenida Corrientes 1234, CABA");
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

test("structured location metadata normalizes under the reserved values namespace", () => {
  const values = setEventLocationProviderMetadata(
    { event_ceremony_venue_address: "Av. Corrientes 1234" },
    "ceremony",
    {
      googlePlaceId: "place-123",
      googleDisplayName: "Salon",
      googleFormattedAddress: "Av. Corrientes 1234, CABA",
      googleAddressComponents: GOOGLE_ADDRESS_COMPONENTS,
      googleLat: -34.6,
      googleLng: -58.4,
    }
  );

  assert.equal(hasEventLocationProviderMetadataEntry(values, "ceremony"), true);
  assert.deepEqual(readEventLocationProviderMetadata(values, "ceremony"), {
    source: "google_places",
    placeId: "place-123",
    displayName: "Salon",
    formattedAddress: "Av. Corrientes 1234, CABA",
    addressComponents: GOOGLE_ADDRESS_COMPONENTS,
    lat: -34.6,
    lng: -58.4,
  });
  assert.equal(readEventLocationProviderMetadata(values, "party"), null);

  const cleared = setEventLocationProviderMetadata(values, "ceremony", null);
  assert.equal(hasEventLocationProviderMetadataEntry(cleared, "ceremony"), true);
  assert.equal(readEventLocationProviderMetadata(cleared, "ceremony"), null);
});

test("legacy map metadata migrates once from grouped children", () => {
  const objetos = [
    {
      id: "group-location",
      tipo: "grupo",
      children: [
        {
          id: "party-map",
          tipo: "mapa-google",
          eventDetailsFeature: "party",
          googlePlaceId: "party-place",
          googleDisplayName: "Estancia",
          googleFormattedAddress: "Ruta 8 km 40",
          googleLat: -34.3,
          googleLng: -58.8,
        },
      ],
    },
  ];

  const migrated = migrateLegacyEventLocationProviderMetadata({
    values: {},
    objetos,
    feature: "party",
  });
  const remigrated = migrateLegacyEventLocationProviderMetadata({
    values: migrated.values,
    objetos: [
      {
        ...objetos[0],
        children: [{ ...objetos[0].children[0], googlePlaceId: "stale-place" }],
      },
    ],
    feature: "party",
  });

  assert.equal(migrated.changed, true);
  assert.equal(migrated.sourceObjectId, "party-map");
  assert.equal(migrated.metadata.placeId, "party-place");
  assert.equal(remigrated.changed, false);
  assert.equal(remigrated.metadata.placeId, "party-place");
});

test("map collectors inherit group associations and honor explicit child phases", () => {
  const objetos = [
    {
      id: "party-group",
      tipo: "grupo",
      functionalAssociation: "party",
      children: [
        {
          id: "party-map-inherited",
          tipo: "mapa-google",
          googlePlaceId: "party-place",
        },
        {
          id: "ceremony-map-explicit",
          tipo: "mapa-google",
          eventDetailsFeature: "ceremony",
          googlePlaceId: "ceremony-place",
        },
      ],
    },
    {
      id: "party-map-standalone",
      tipo: "mapa-google",
      functionalAssociation: "party",
      googlePlaceId: "standalone-party-place",
    },
    {
      id: "ceremony-map-legacy-default",
      tipo: "mapa-google",
      googlePlaceId: "legacy-ceremony-place",
    },
  ];

  assert.deepEqual(
    collectEventGoogleMapObjects(objetos, "party").map(({ id }) => id),
    ["party-map-inherited", "party-map-standalone"]
  );
  assert.deepEqual(
    collectEventGoogleMapObjects(objetos, "ceremony").map(({ id }) => id),
    ["ceremony-map-explicit", "ceremony-map-legacy-default"]
  );
});

test("legacy map metadata skips invalid projections and uses the first valid map", () => {
  const migrated = migrateLegacyEventLocationProviderMetadata({
    values: {},
    feature: "ceremony",
    objetos: [
      { id: "map-without-place", tipo: "mapa-google" },
      {
        id: "map-valid",
        tipo: "mapa-google",
        googlePlaceId: "ceremony-place",
        googleDisplayName: "Salon valido",
        googleFormattedAddress: "Calle 123",
      },
      {
        id: "map-later",
        tipo: "mapa-google",
        googlePlaceId: "later-place",
      },
    ],
  });

  assert.equal(migrated.sourceObjectId, "map-valid");
  assert.equal(migrated.metadata.placeId, "ceremony-place");
});

test("legacy migration records an explicit empty provider value when no map exists", () => {
  const result = migrateLegacyEventLocationProviderMetadata({
    values: {},
    objetos: [],
    feature: "ceremony",
  });

  assert.equal(result.changed, true);
  assert.equal(result.metadata, null);
  assert.equal(
    hasEventLocationProviderMetadataEntry(result.values, "ceremony"),
    true
  );
});

test("map collectors and projections cover every matching grouped view", () => {
  const objetos = [
    {
      id: "map-first",
      tipo: "mapa-google",
      eventDetailsFeature: "ceremony",
      width: 300,
    },
    {
      id: "group-maps",
      tipo: "grupo",
      children: [
        {
          id: "map-nested",
          tipo: "mapa-google",
          eventDetailsFeature: "ceremony",
          width: 420,
        },
        {
          id: "map-party",
          tipo: "mapa-google",
          eventDetailsFeature: "party",
        },
      ],
    },
  ];
  const location = {
    googlePlaceId: "place-new",
    googleDisplayName: "Nuevo lugar",
    googleFormattedAddress: "Calle Nueva 10",
    googleLat: -34.1,
    googleLng: -58.1,
  };

  assert.deepEqual(
    collectEventGoogleMapObjects(objetos, "ceremony").map(({ id }) => id),
    ["map-first", "map-nested"]
  );
  assert.equal(findEventGoogleMapObject(objetos, "ceremony").id, "map-first");
  const patches = buildEventGoogleMapProjectionPatches({
    objetos,
    location,
    feature: "ceremony",
    showMap: true,
  });
  assert.deepEqual(
    patches.map(({ objectId }) => objectId),
    ["map-first", "map-nested"]
  );
  assert.equal(patches[0].patch.googlePlaceId, "place-new");
  assert.equal(patches[1].patch.mostrarMapa, true);
  assert.equal(Object.hasOwn(patches[0].patch, "width"), false);
  assert.equal(Object.hasOwn(patches[0].patch, "googleAddressComponents"), false);
});

test("structured values override stale map metadata, including explicit clears", () => {
  const valuesWithPlace = setEventLocationProviderMetadata(
    {
      event_ceremony_venue_name: "Dato estructurado",
      event_ceremony_venue_address: "Calle estructurada 20",
    },
    "ceremony",
    {
      placeId: "canonical-place",
      displayName: "Proveedor",
      formattedAddress: "Calle estructurada 20, Argentina",
      lat: null,
      lng: null,
    }
  );
  const staleMap = {
    id: "map",
    tipo: "mapa-google",
    eventDetailsFeature: "ceremony",
    googlePlaceId: "stale-place",
    googleDisplayName: "Stale",
    googleFormattedAddress: "Stale address",
    mostrarMapa: true,
  };
  const resolved = resolveEventLocationFromAuthoring({
    fieldsSchema: ensureEventLocationFields({ fieldsSchema: [] }).fieldsSchema,
    defaults: {},
    values: valuesWithPlace,
    objetos: [staleMap],
  });
  const cleared = resolveEventLocationFromAuthoring({
    fieldsSchema: ensureEventLocationFields({ fieldsSchema: [] }).fieldsSchema,
    defaults: {},
    values: setEventLocationProviderMetadata(valuesWithPlace, "ceremony", null),
    objetos: [staleMap],
  });

  assert.equal(resolved.googlePlaceId, "canonical-place");
  assert.equal(resolved.venueName, "Dato estructurado");
  assert.equal(resolved.googleLat, null);
  assert.equal(cleared.googlePlaceId, "");
  assert.equal(cleared.hasGooglePlace, false);
});

test("provider metadata normalization rejects records without a Place ID", () => {
  assert.equal(
    normalizeEventLocationProviderMetadata({ formattedAddress: "Calle 123" }),
    null
  );
});
