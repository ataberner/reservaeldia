import assert from "node:assert/strict";
import test from "node:test";

import { formatTemplateDateTextValue } from "../fieldValueResolver.js";
import { migrateDynamicAuthoringStateV2 } from "./migration.js";

function field(key, extra = {}) {
  return {
    key,
    label: key,
    type: "text",
    ...extra,
  };
}

test("v1 migration applies the documented value precedence and preserves empty own keys", () => {
  const fieldsSchema = [
    field("live_value", {
      applyTargets: [
        { scope: "objeto", id: "live", path: "texto", mode: "set" },
      ],
    }),
    field("authoring_changed", { applyTargets: [] }),
    field("stored_empty", { applyTargets: [] }),
    field("initial_only", { applyTargets: [] }),
    field("template_only", { applyTargets: [] }),
    field("gallery", {
      type: "images",
      applyTargets: [
        {
          scope: "objeto",
          id: "hero",
          path: "src",
          mode: "set",
          transform: { kind: "images_to_first_url" },
        },
      ],
    }),
  ];
  const result = migrateDynamicAuthoringStateV2({
    authoringDraft: {
      version: 1,
      fieldsSchema,
      defaults: {
        live_value: "Author live",
        authoring_changed: "Author changed",
        stored_empty: "Base empty",
        gallery: ["base.jpg"],
      },
    },
    templateInput: {
      policyVersion: 1,
      defaults: {
        live_value: "Base live",
        authoring_changed: "Base author",
        stored_empty: "Base empty",
        gallery: ["base.jpg"],
      },
      initialValues: {
        initial_only: "Initial",
        gallery: ["initial.jpg"],
      },
      values: {
        live_value: "Stored live",
        authoring_changed: "Stored author",
        stored_empty: "",
        gallery: ["stored-a.jpg", "stored-b.jpg"],
      },
    },
    templateDefaults: { template_only: "Template" },
    objetos: [
      { id: "live", tipo: "texto", texto: "Canvas wins" },
      { id: "hero", tipo: "imagen", src: "projected-first-only.jpg" },
    ],
    eventDetails: {},
  });

  assert.equal(result.migrated, true);
  assert.equal(result.templateInput.policyVersion, 2);
  assert.equal(result.authoringDraft.version, 2);
  assert.equal(result.templateInput.values.live_value, "Canvas wins");
  assert.equal(result.templateInput.values.authoring_changed, "Author changed");
  assert.equal(result.templateInput.values.stored_empty, "");
  assert.equal(result.templateInput.values.initial_only, "Initial");
  assert.equal(result.templateInput.values.template_only, "Template");
  assert.deepEqual(result.templateInput.values.gallery, [
    "stored-a.jpg",
    "stored-b.jpg",
  ]);
  assert.equal(
    result.report.sourcesByField.gallery,
    "template-input-value",
    "a lossy first-image transform must not be inverted"
  );
  fieldsSchema.forEach((_, index) => {
    assert.equal(
      Object.prototype.hasOwnProperty.call(
        result.authoringDraft.fieldsSchema[index],
        "applyTargets"
      ),
      true
    );
  });

  const remigrated = migrateDynamicAuthoringStateV2({
    authoringDraft: result.authoringDraft,
    templateInput: result.templateInput,
    templateDefaults: { template_only: "Template" },
    objetos: [
      { id: "live", tipo: "texto", texto: "Another canvas value" },
    ],
    eventDetails: { dressCode: { value: "Another mirror" } },
  });
  assert.equal(remigrated.migrated, false);
  assert.equal(remigrated.authoringDraft, result.authoringDraft);
  assert.equal(remigrated.templateInput, result.templateInput);
});

test("v1 migration materializes only unambiguous legacy mappings in stable canvas order", () => {
  const dateValue = "2028-04-22";
  const dateText = formatTemplateDateTextValue(
    dateValue,
    "event_date_long_es_ar",
    "date"
  );
  const result = migrateDynamicAuthoringStateV2({
    authoringDraft: {
      version: 1,
      fieldsSchema: [
        field("story", { type: "textarea" }),
        field("event_date", {
          type: "date",
          eventDetailsRole: "ceremony_date",
          dateTextFormatPreset: "event_date_long_es_ar",
        }),
        field("ambiguous_a"),
        field("ambiguous_b"),
        field("without_view"),
      ],
      defaults: {
        story: "Nuestra historia",
        event_date: dateValue,
        ambiguous_a: "Mismo texto",
        ambiguous_b: "Mismo texto",
        without_view: "No aparece",
      },
    },
    templateInput: { policyVersion: 1 },
    objetos: [
      { id: "story-first", tipo: "texto", texto: "Nuestra historia" },
      {
        id: "group",
        tipo: "grupo",
        children: [
          { id: "story-child", tipo: "texto", texto: "Nuestra historia" },
          { id: "date-child", tipo: "texto", texto: dateText },
        ],
      },
      { id: "ambiguous", tipo: "texto", texto: "Mismo texto" },
    ],
    eventDetails: {},
  });

  const byKey = new Map(
    result.authoringDraft.fieldsSchema.map((entry) => [entry.key, entry])
  );
  assert.deepEqual(
    byKey.get("story").applyTargets.map((target) => target.id),
    ["story-first", "story-child"]
  );
  assert.deepEqual(byKey.get("event_ceremony_date").applyTargets, [
    {
      scope: "objeto",
      id: "date-child",
      path: "texto",
      mode: "set",
      transform: {
        kind: "date_to_text",
        preset: "event_date_long_es_ar",
      },
    },
  ]);
  assert.equal(result.templateInput.values.event_ceremony_date, dateValue);
  assert.deepEqual(byKey.get("ambiguous_a").applyTargets, []);
  assert.deepEqual(byKey.get("ambiguous_b").applyTargets, []);
  assert.deepEqual(byKey.get("without_view").applyTargets, []);
});

test("v1 migration uses explicit roles, dress-code mirror, countdown start time and first valid map metadata", () => {
  const result = migrateDynamicAuthoringStateV2({
    authoringDraft: {
      version: 1,
      fieldsSchema: [
        field("event_primary_person_name", { applyTargets: [] }),
        field("event_dress_code", { applyTargets: [] }),
        field("event_ceremony_date", {
          type: "date",
          applyTargets: [
            {
              scope: "objeto",
              id: "countdown",
              path: "fechaObjetivo",
              mode: "set",
            },
          ],
        }),
        field("event_ceremony_start_time", {
          type: "time",
          applyTargets: [],
        }),
        field("event_ceremony_venue_name", { applyTargets: [] }),
        field("event_ceremony_venue_address", {
          type: "location",
          applyTargets: [],
        }),
      ],
      defaults: {},
    },
    templateInput: { policyVersion: 1, values: {} },
    eventDetails: {
      dressCode: { enabled: true, value: "Elegante sport" },
    },
    objetos: [
      { id: "invalid-map", tipo: "mapa-google", eventDetailsFeature: "ceremony" },
      {
        id: "group",
        tipo: "grupo",
        children: [
          {
            id: "valid-map",
            tipo: "mapa-google",
            eventDetailsFeature: "ceremony",
            googlePlaceId: "place-123",
            googleDisplayName: "Palacio Sans Souci",
            googleFormattedAddress: "Paz 705, Victoria, Argentina",
            googleAddressComponents: [],
            googleLat: -34.46,
            googleLng: -58.56,
          },
          {
            id: "countdown",
            tipo: "countdown",
            fechaObjetivo: "2030-05-12T21:30:00",
          },
        ],
      },
    ],
  });

  const byKey = new Map(
    result.authoringDraft.fieldsSchema.map((entry) => [entry.key, entry])
  );
  assert.equal(
    byKey.get("event_primary_person_name").eventDetailsRole,
    "primary_person_name"
  );
  assert.equal(byKey.get("event_dress_code").eventDetailsRole, "dress_code");
  assert.equal(
    byKey.get("event_ceremony_date").eventDetailsRole,
    "ceremony_date"
  );
  assert.equal(
    byKey.get("event_ceremony_start_time").eventDetailsRole,
    "ceremony_start_time"
  );
  assert.equal(result.templateInput.values.event_dress_code, "Elegante sport");
  assert.deepEqual(result.eventDetails.dressCode, {
    enabled: true,
    value: "Elegante sport",
  });
  assert.equal(result.templateInput.values.event_ceremony_date, "2030-05-12");
  assert.equal(result.templateInput.values.event_ceremony_start_time, "21:30");
  assert.equal(
    result.templateInput.values.event_ceremony_venue_name,
    "Palacio Sans Souci"
  );
  assert.equal(
    result.templateInput.values.__eventDetails.locations.ceremony.placeId,
    "place-123"
  );
  assert.equal(
    result.report.locationMetadataSources.ceremony,
    "valid-map"
  );
  assert.equal(
    Object.prototype.hasOwnProperty.call(
      result.templateInput.values.__eventDetails.locations,
      "party"
    ),
    true
  );
});

test("v1 migration inherits party semantics for grouped maps and countdowns", () => {
  const result = migrateDynamicAuthoringStateV2({
    authoringDraft: {
      version: 1,
      fieldsSchema: [
        field("event_party_date", {
          type: "date",
          eventDetailsRole: "party_date",
        }),
        field("event_party_start_time", {
          type: "time",
          eventDetailsRole: "party_start_time",
          applyTargets: [],
        }),
        field("event_party_venue_name", {
          eventDetailsRole: "party_venue_name",
          applyTargets: [],
        }),
        field("event_party_venue_address", {
          type: "location",
          eventDetailsRole: "party_venue_address",
          applyTargets: [],
        }),
      ],
      defaults: {},
    },
    templateInput: { policyVersion: 1, values: {} },
    eventDetails: {},
    objetos: [
      {
        id: "party-group",
        tipo: "grupo",
        functionalAssociation: "party",
        children: [
          {
            id: "party-map",
            tipo: "mapa-google",
            googlePlaceId: "party-place",
            googleDisplayName: "Estancia La Fiesta",
            googleFormattedAddress: "Ruta 8 km 40",
            googleLat: -34.3,
            googleLng: -58.8,
          },
          {
            id: "party-countdown",
            tipo: "countdown",
            fechaObjetivo: "2032-08-04T21:30:00",
          },
        ],
      },
    ],
  });

  const fieldsByKey = new Map(
    result.authoringDraft.fieldsSchema.map((entry) => [entry.key, entry])
  );
  assert.deepEqual(fieldsByKey.get("event_party_date").applyTargets, [
    {
      scope: "objeto",
      id: "party-countdown",
      path: "fechaObjetivo",
      mode: "set",
      transform: { kind: "date_to_countdown_iso" },
    },
  ]);
  assert.equal(result.templateInput.values.event_party_date, "2032-08-04");
  assert.equal(result.templateInput.values.event_party_start_time, "21:30");
  assert.equal(
    result.templateInput.values.event_party_venue_name,
    "Estancia La Fiesta"
  );
  assert.equal(
    result.templateInput.values.__eventDetails.locations.party.placeId,
    "party-place"
  );
  assert.equal(
    result.templateInput.values.__eventDetails.locations.ceremony,
    null
  );
  assert.deepEqual(result.report.locationMetadataSources, {
    ceremony: null,
    party: "party-map",
  });
});

test("v2 migration materializes pending legacy mappings once and preserves explicit empty mappings", () => {
  const authoringDraft = {
    version: 2,
    fieldsSchema: [
      field("legacy_pending"),
      field("modern_absent", { applyTargets: [] }),
    ],
    defaults: { legacy_pending: "A", modern_absent: "B" },
  };
  const templateInput = {
    policyVersion: 2,
    values: { legacy_pending: "A", modern_absent: "" },
  };

  const result = migrateDynamicAuthoringStateV2({
    authoringDraft,
    templateInput,
    objetos: [{ id: "a", tipo: "texto", texto: "A" }],
  });

  assert.equal(result.migrated, true);
  assert.deepEqual(result.authoringDraft.fieldsSchema[0].applyTargets, [
    {
      scope: "objeto",
      id: "a",
      path: "texto",
      mode: "set",
    },
  ]);
  assert.equal(
    Object.prototype.hasOwnProperty.call(
      result.authoringDraft.fieldsSchema[0],
      "applyTargets"
    ),
    true
  );
  assert.deepEqual(result.authoringDraft.fieldsSchema[1].applyTargets, []);

  const repeated = migrateDynamicAuthoringStateV2({
    authoringDraft: result.authoringDraft,
    templateInput: result.templateInput,
    objetos: [{ id: "a", tipo: "texto", texto: "A" }],
  });
  assert.equal(repeated.migrated, false);
  assert.equal(repeated.authoringDraft, result.authoringDraft);
  assert.equal(repeated.templateInput, result.templateInput);
});
