import test from "node:test";
import assert from "node:assert/strict";

import { syncEditorSnapshotRenderState } from "../../lib/editorSnapshotAdapter.js";
import {
  applyEventGooglePlaceSelection,
  applyManualEventLocationText,
  buildSelectedGoogleEventLocation,
} from "./locationAuthoring.js";

class TestCustomEvent extends Event {
  constructor(type, options = {}) {
    super(type);
    this.detail = options.detail;
  }
}

function createLocationRuntime({ withMap = false, failUpdate = false } = {}) {
  const target = new EventTarget();
  target.CustomEvent = TestCustomEvent;
  target.Event = Event;
  const calls = [];
  const events = [];
  const authoring = {
    fieldsSchema: [
      { key: "event_ceremony_venue_name", eventDetailsRole: "ceremony_venue_name", type: "text", applyTargets: [] },
      { key: "event_ceremony_venue_address", eventDetailsRole: "ceremony_venue_address", type: "location", applyTargets: [] },
    ],
    defaults: {
      event_ceremony_venue_name: "Salón manual",
      event_ceremony_venue_address: "Dirección manual 123",
    },
  };
  target.canvasEditor = {
    getTemplateAuthoringSnapshot: () => authoring,
    updateTemplateAuthoringEventLocation: async (...args) => {
      calls.push(args);
      if (failUpdate) throw new Error("persist failed");
      const location = args[0];
      authoring.defaults.event_ceremony_venue_name = location.venueName;
      authoring.defaults.event_ceremony_venue_address = location.address;
    },
  };
  for (const eventName of ["actualizar-elemento", "insertar-elemento"]) {
    target.addEventListener(eventName, (event) => events.push([eventName, event.detail]));
  }
  syncEditorSnapshotRenderState({
    objetos: withMap ? [{
      id: "map-ceremony",
      tipo: "mapa-google",
      eventDetailsFeature: "ceremony",
      googlePlaceId: "old-place",
      googleDisplayName: "Lugar anterior",
      googleFormattedAddress: "Dirección anterior",
      googleLat: -34,
      googleLng: -58,
      mostrarMapa: true,
    }] : [],
    secciones: [],
    eventDetails: { mode: "single" },
  }, target);
  return { target, calls, events };
}

test("selected Google location persists through the existing location owner and map shape", async () => {
  const { target, calls, events } = createLocationRuntime();
  const result = await applyEventGooglePlaceSelection({
    targetWindow: target,
    feature: "ceremony",
    googlePlace: {
      id: "place-123",
      displayName: { text: "Salón Los Robles" },
      formattedAddress: "Av. Ejemplo 1234, Buenos Aires",
      addressComponents: [],
      location: { lat: -34.6, lng: -58.45 },
    },
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0][0].googlePlaceId, "place-123");
  assert.deepEqual(calls[0][1], { feature: "ceremony" });
  assert.equal(events.length, 1);
  assert.equal(events[0][0], "insertar-elemento");
  assert.equal(events[0][1].tipo, "mapa-google");
  assert.equal(events[0][1].eventDetailsFeature, "ceremony");
  assert.equal(events[0][1].googlePlaceId, "place-123");
  assert.equal(events[0][1].mostrarMapa, false);
  assert.equal(result.venueName, "Salón Los Robles");
  assert.equal(result.address, "Av. Ejemplo 1234, Buenos Aires");
});

test("manual location clears Google metadata without inventing replacement metadata", async () => {
  const { target, calls, events } = createLocationRuntime({ withMap: true });
  const result = await applyManualEventLocationText({
    targetWindow: target,
    feature: "ceremony",
    venueName: "Salón Los Robles",
    address: "Av. Ejemplo 1234",
  });

  assert.equal(calls[0][0].venueName, "Salón Los Robles");
  assert.equal(calls[0][0].address, "Av. Ejemplo 1234");
  assert.equal(calls[0][0].googlePlaceId, "");
  assert.equal(calls[0][0].googleLat, null);
  assert.equal(calls[0][0].googleLng, null);
  assert.equal(events.length, 1);
  assert.deepEqual(events[0], ["actualizar-elemento", {
    id: "map-ceremony",
    cambios: {
      googlePlaceId: "",
      googleDisplayName: "",
      googleFormattedAddress: "",
      googleAddressComponents: [],
      googleLat: null,
      googleLng: null,
      mostrarMapa: false,
    },
  }]);
  assert.equal(result.hasGooglePlace, false);
});

test("failed location persistence never creates or updates a Google map object", async () => {
  const { target, events } = createLocationRuntime({ failUpdate: true });
  await assert.rejects(
    applyEventGooglePlaceSelection({
      targetWindow: target,
      feature: "ceremony",
      googlePlace: { id: "place-123", displayName: "Salón", formattedAddress: "Dirección" },
    }),
    /persist failed/
  );
  assert.deepEqual(events, []);
});

test("selected place construction keeps the target phase and canonical Google data", () => {
  const result = buildSelectedGoogleEventLocation({
    currentLocation: { venueName: "Manual", address: "Manual 123", addressTextFormatPreset: "event_address_full_google" },
    googlePlace: { place_id: "party-place", name: "Fiesta", formatted_address: "Ruta 8 km 40" },
    feature: "party",
  });
  assert.equal(result.eventDetailsFeature, "party");
  assert.equal(result.googlePlaceId, "party-place");
  assert.equal(result.venueName, "Fiesta");
  assert.equal(result.address, "Ruta 8 km 40");
});
