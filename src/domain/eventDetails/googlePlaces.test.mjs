import test from "node:test";
import assert from "node:assert/strict";

import {
  fetchGooglePlaceDetailsFromPrediction,
  fetchGooglePlaceSuggestions,
  placePredictionToLabel,
} from "./googlePlaces.js";

test("Google Places keeps multiple predictions for explicit user selection", async () => {
  const predictions = [
    {
      placeId: "place-a",
      structuredFormat: {
        mainText: { text: "Salón Los Robles" },
        secondaryText: { text: "Av. Ejemplo 1234" },
      },
    },
    {
      placeId: "place-b",
      structuredFormat: {
        mainText: { text: "Los Robles Eventos" },
        secondaryText: { text: "Ruta 8 km 40" },
      },
    },
  ];
  const suggestions = await fetchGooglePlaceSuggestions("Los Robles", {}, {
    targetWindow: {},
    loadLibrary: async () => ({
      AutocompleteSuggestion: {
        fetchAutocompleteSuggestions: async () => ({
          suggestions: predictions.map((placePrediction) => ({ placePrediction })),
        }),
      },
    }),
  });

  assert.deepEqual(suggestions.map(({ id, label }) => ({ id, label })), [
    { id: "place-a", label: "Salón Los Robles - Av. Ejemplo 1234" },
    { id: "place-b", label: "Los Robles Eventos - Ruta 8 km 40" },
  ]);
  assert.equal(suggestions[0].prediction, predictions[0]);
  assert.equal(suggestions[1].prediction, predictions[1]);
});

test("Place details are fetched only from the prediction explicitly selected", async () => {
  const fetchedFields = [];
  const selectedPrediction = {
    toPlace: () => ({
      id: "place-selected",
      displayName: "Salón Los Robles",
      formattedAddress: "Av. Ejemplo 1234",
      addressComponents: [],
      location: { lat: -34.5, lng: -58.4 },
      fetchFields: async ({ fields }) => fetchedFields.push(...fields),
    }),
  };

  const place = await fetchGooglePlaceDetailsFromPrediction(selectedPrediction);
  assert.equal(place.placeId, "place-selected");
  assert.equal(place.displayName, "Salón Los Robles");
  assert.equal(place.formattedAddress, "Av. Ejemplo 1234");
  assert.deepEqual(fetchedFields, [
    "id",
    "displayName",
    "formattedAddress",
    "addressComponents",
    "location",
  ]);
});

test("prediction labels keep a readable fallback", () => {
  assert.equal(placePredictionToLabel({ description: "Salón, Buenos Aires" }), "Salón, Buenos Aires");
});
