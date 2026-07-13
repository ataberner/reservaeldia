import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeEventDetailsConfig,
  resolveEventDetailsEnabledState,
} from "../../../shared/eventDetailsConfig.js";
import {
  normalizeEventDetailsDocumentContract,
  migrateLegacyValueMap,
} from "../../../shared/eventDetailsMigration.js";
import {
  EVENT_DATE_FIELD_KEYS,
  getEventDateFieldKey,
} from "./date.js";
import {
  EVENT_TIME_ROLES,
  getEventTimeFieldKey,
} from "./time.js";
import {
  EVENT_LOCATION_ROLES,
  getEventLocationFieldKey,
} from "./location.js";

test("eventDetails mode derives ceremony and party enabled state", () => {
  assert.deepEqual(resolveEventDetailsEnabledState({ mode: "single" }), {
    ceremony: true,
    party: false,
    dress_code: false,
  });
  assert.deepEqual(resolveEventDetailsEnabledState({ mode: "ceremony_party" }), {
    ceremony: true,
    party: true,
    dress_code: false,
  });
  assert.deepEqual(
    resolveEventDetailsEnabledState({
      mode: "single",
      dressCode: { enabled: true, value: "Formal" },
    }),
    {
      ceremony: true,
      party: false,
      dress_code: true,
    }
  );
  assert.deepEqual(normalizeEventDetailsConfig({
    mode: "ceremony_party",
    dressCode: { enabled: true, value: " Formal " },
  }), {
    mode: "ceremony_party",
    dressCode: { enabled: true, value: "Formal" },
  });
  assert.deepEqual(normalizeEventDetailsConfig({ mode: "ceremonia y fiesta" }), {
    mode: "ceremony_party",
    dressCode: { enabled: false, value: "" },
  });
});

test("new event detail field keys are explicit by event part", () => {
  assert.equal(getEventDateFieldKey("ceremony"), EVENT_DATE_FIELD_KEYS.ceremony);
  assert.equal(getEventDateFieldKey("party"), EVENT_DATE_FIELD_KEYS.party);
  assert.equal(
    getEventTimeFieldKey(EVENT_TIME_ROLES.START_TIME, "ceremony"),
    "event_ceremony_start_time"
  );
  assert.equal(
    getEventTimeFieldKey(EVENT_TIME_ROLES.END_TIME, "party"),
    "event_party_end_time"
  );
  assert.equal(
    getEventLocationFieldKey(EVENT_LOCATION_ROLES.VENUE_ADDRESS, "ceremony"),
    "event_ceremony_venue_address"
  );
  assert.equal(
    getEventLocationFieldKey(EVENT_LOCATION_ROLES.VENUE_NAME, "party"),
    "event_party_venue_name"
  );
});

test("legacy event fields migrate idempotently to ceremony fields", () => {
  const source = {
    fieldsSchema: [
      {
        key: "event_date",
        label: "Fecha del evento",
        type: "date",
        applyTargets: [{ scope: "objeto", id: "countdown", path: "fechaObjetivo" }],
      },
      {
        key: "event_venue_address",
        label: "Direccion del evento",
        type: "location",
        applyTargets: [{ scope: "objeto", id: "address", path: "texto" }],
      },
    ],
    defaults: {
      event_date: "2027-01-05",
      event_venue_address: "Av. Corrientes 1234",
    },
    templateInput: {
      initialValues: { event_date: "2027-01-05" },
      values: { event_venue_address: "Av. Corrientes 1234" },
      defaults: { event_date: "2027-01-05" },
    },
  };

  const migrated = normalizeEventDetailsDocumentContract(source);
  const remigrated = normalizeEventDetailsDocumentContract(migrated);

  assert.deepEqual(migrated.eventDetails, {
    mode: "single",
    dressCode: { enabled: false, value: "" },
  });
  assert.deepEqual(
    migrated.fieldsSchema.map((field) => field.key),
    ["event_ceremony_date", "event_ceremony_venue_address"]
  );
  assert.equal(migrated.fieldsSchema[0].eventDetailsRole, "ceremony_date");
  assert.equal(migrated.fieldsSchema[1].eventDetailsRole, "ceremony_venue_address");
  assert.equal(migrated.defaults.event_ceremony_date, "2027-01-05");
  assert.equal(migrated.defaults.event_date, undefined);
  assert.equal(
    migrated.templateInput.initialValues.event_ceremony_date,
    "2027-01-05"
  );
  assert.equal(
    migrated.templateInput.values.event_ceremony_venue_address,
    "Av. Corrientes 1234"
  );
  assert.deepEqual(remigrated, migrated);
});

test("legacy value map migration removes legacy authorities", () => {
  const migrated = migrateLegacyValueMap({
    event_start_time: "21:00",
    event_end_time: "03:00",
  });

  assert.deepEqual(migrated, {
    event_ceremony_start_time: "21:00",
    event_ceremony_end_time: "03:00",
  });
});
