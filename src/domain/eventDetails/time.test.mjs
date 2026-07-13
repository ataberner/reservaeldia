import test from "node:test";
import assert from "node:assert/strict";

import {
  EVENT_TIME_ROLES,
  buildEventTimeDefaults,
  ensureEventTimeFields,
  getEventTimeFieldKey,
  normalizeEventTimeValue,
  resolveEventTimesState,
  resolveEventTimesFromAuthoring,
} from "./time.js";
import {
  buildTemplateAuthoringTargetPatches,
} from "../templates/authoring/targetApplication.js";

test("normalizes common event time text values", () => {
  assert.equal(normalizeEventTimeValue("8"), "08:00");
  assert.equal(normalizeEventTimeValue("20 hs"), "20:00");
  assert.equal(normalizeEventTimeValue("20.30"), "20:30");
  assert.equal(normalizeEventTimeValue("20h45"), "20:45");
});

test("ensures event start and end time fields", () => {
  const result = ensureEventTimeFields({ fieldsSchema: [] });

  assert.equal(result.changed, true);
  assert.deepEqual(
    result.fieldsSchema.map((field) => field.key),
    ["event_ceremony_start_time", "event_ceremony_end_time"]
  );
  assert.equal(result.fieldsSchema[0].eventDetailsRole, "ceremony_start_time");
  assert.equal(result.fieldsSchema[1].eventDetailsRole, "ceremony_end_time");
  assert.equal(result.fieldsSchema[0].type, "time");
  assert.equal(result.fieldsSchema[1].optional, true);
});

test("buildEventTimeDefaults and resolveEventTimesFromAuthoring keep event times stable", () => {
  const { fieldsSchema } = ensureEventTimeFields({ fieldsSchema: [] });
  const defaults = buildEventTimeDefaults({
    fieldsSchema,
    defaults: {},
    times: {
      startTime: "19 hs",
      endTime: "23:30",
    },
  });

  assert.equal(defaults[getEventTimeFieldKey(EVENT_TIME_ROLES.START_TIME)], "19:00");
  assert.equal(defaults[getEventTimeFieldKey(EVENT_TIME_ROLES.END_TIME)], "23:30");
  assert.deepEqual(
    resolveEventTimesFromAuthoring({ fieldsSchema, defaults }),
    {
      startTime: "19:00",
      endTime: "23:30",
      fields: fieldsSchema,
    }
  );
});

test("resolveEventTimesState uses a fresh payload before a stale bridge", () => {
  const { fieldsSchema } = ensureEventTimeFields({ fieldsSchema: [] });
  const startKey = getEventTimeFieldKey(EVENT_TIME_ROLES.START_TIME);
  const endKey = getEventTimeFieldKey(EVENT_TIME_ROLES.END_TIME);

  assert.deepEqual(
    resolveEventTimesState({
      fieldsSchema,
      defaults: {},
    }),
    {
      startTime: "",
      endTime: "",
      fields: fieldsSchema,
    }
  );
  assert.deepEqual(
    resolveEventTimesState({
      fieldsSchema,
      defaults: {
        [startKey]: "19 hs",
        [endKey]: "23:30",
      },
    }),
    {
      startTime: "19:00",
      endTime: "23:30",
      fields: fieldsSchema,
    }
  );
});

test("resolveEventTimesState keeps start time fallback available", () => {
  const { fieldsSchema } = ensureEventTimeFields({ fieldsSchema: [] });
  const endKey = getEventTimeFieldKey(EVENT_TIME_ROLES.END_TIME);

  assert.deepEqual(
    resolveEventTimesState(
      {
        fieldsSchema,
        defaults: {
          [endKey]: "23 hs",
        },
      },
      {
        fallbackStartTime: "19:30",
      }
    ),
    {
      startTime: "19:30",
      endTime: "23:00",
      fields: fieldsSchema,
    }
  );
});

test("resolveEventTimesState treats missing or invalid payloads as non-authoritative", () => {
  const { fieldsSchema } = ensureEventTimeFields({ fieldsSchema: [] });

  assert.equal(resolveEventTimesState(), null);
  assert.equal(resolveEventTimesState({}), null);
  assert.equal(resolveEventTimesState({ fieldsSchema }), null);
  assert.equal(resolveEventTimesState({ fieldsSchema: [], defaults: {} }), null);
});

test("linked event time field patches text targets", () => {
  const { fieldsSchema } = ensureEventTimeFields({ fieldsSchema: [] });
  const field = {
    ...fieldsSchema.find((entry) => entry.key === "event_ceremony_end_time"),
    applyTargets: [
      {
        scope: "objeto",
        id: "end-time-text",
        path: "texto",
        mode: "set",
      },
    ],
  };

  const patches = buildTemplateAuthoringTargetPatches({
    field,
    value: "23:30",
    objetos: [
      {
        id: "end-time-text",
        tipo: "texto",
        texto: "Hasta las 23 hs",
        width: 180,
        __autoWidth: false,
      },
    ],
  });

  assert.deepEqual(
    patches.map((entry) => [entry.objectId, entry.patch.texto]),
    [["end-time-text", "23:30"]]
  );
});
