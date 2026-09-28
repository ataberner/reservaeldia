import test from "node:test";
import assert from "node:assert/strict";

import {
  fetchGooglePlaceDetailsFromPrediction,
  fetchGooglePlaceSuggestions,
  placePredictionToLabel,
  loadGoogleMapsPlacesLibrary,
} from "./googlePlaces.js";

function loaderWindow() {
  const scripts = [], timers = new Map();
  let timerId = 0;
  const targetWindow = {
    setTimeout: (fn) => { timers.set(++timerId, fn); return timerId; },
    clearTimeout: (id) => timers.delete(id),
    document: {
      getElementById: (id) => scripts.find((script) => script.id === id),
      createElement: () => {
        const script = new EventTarget();
        script.remove = () => { const i = scripts.indexOf(script); if (i >= 0) scripts.splice(i, 1); };
        return script;
      },
      head: { appendChild: (script) => scripts.push(script) },
    },
  };
  return { targetWindow, scripts, timers, load: () => loadGoogleMapsPlacesLibrary({ targetWindow, apiKey: "synthetic" }) };
}

test("E9 script success shares one pending load between callers and clears its timer", async () => {
  const run = loaderWindow();
  const first = run.load(), second = run.load();
  assert.equal(first, second);
  assert.equal(run.scripts.length, 1);
  const library = { marker: "places" };
  run.targetWindow.google = { maps: { importLibrary: async () => library } };
  run.scripts[0].dispatchEvent(new Event("load"));
  assert.equal(await first, library);
  assert.equal(await second, library);
  assert.equal(run.timers.size, 0);
});

for (const failure of ["error", "timeout", "missing-library", "import-error", "import-timeout"]) {
  test(`E9 ${failure} removes failed script; retry loads successfully for multiple callers`, async () => {
    const run = loaderWindow();
    const failed = run.load();
    const rejected = assert.rejects(failed, /No pudimos cargar Google Maps/);
    const originalScript = run.scripts[0];
    if (failure === "error") originalScript.dispatchEvent(new Event("error"));
    else if (failure === "timeout") [...run.timers.values()][0]();
    else {
      if (failure.startsWith("import")) run.targetWindow.google = { maps: { importLibrary: () => failure === "import-error" ? Promise.reject(new Error("synthetic")) : new Promise(() => {}) } };
      originalScript.dispatchEvent(new Event("load"));
      if (failure === "import-timeout") [...run.timers.values()][0]();
    }
    await rejected;
    assert.equal(run.scripts.length, 0);
    assert.equal(run.timers.size, 0);
    // A failed script may have left a bootstrap importLibrary behind. Retry
    // must load a new script even when that old function still exists.
    const retry = run.load(), other = run.load();
    assert.equal(retry, other);
    assert.notEqual(run.scripts[0], originalScript);
    originalScript.dispatchEvent(new Event("error")); // stale listener cannot reject retry
    run.targetWindow.google = { maps: { importLibrary: async () => ({ ready: true }) } };
    run.scripts[0].dispatchEvent(new Event("load"));
    assert.deepEqual(await retry, { ready: true });
    assert.equal(run.timers.size, 0);
  });
}

test("E9 loader isolates windows and bounds waiting on an orphan preexisting script", async () => {
  const a = loaderWindow(), b = loaderWindow();
  const orphan = a.targetWindow.document.createElement("script");
  orphan.id = "reservaeldia-google-maps-js";
  a.scripts.push(orphan);
  const first = a.load(), second = b.load();
  assert.notEqual(first, second);
  const failures = Promise.all([assert.rejects(first), assert.rejects(second)]);
  [...a.timers.values()][0]();
  [...b.timers.values()][0]();
  await failures;
  assert.equal(a.scripts.length, 0);
  assert.equal(b.scripts.length, 0);
});

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
