import test from "node:test";
import assert from "node:assert/strict";

import {
  EVENT_TIME_ROLES,
  buildEventTimeDefaults,
  ensureEventTimeFields,
  getEventTimeFieldKey,
  normalizeEventTimeValue,
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
    ["event_start_time", "event_end_time"]
  );
  assert.equal(result.fieldsSchema[0].eventDetailsRole, EVENT_TIME_ROLES.START_TIME);
  assert.equal(result.fieldsSchema[1].eventDetailsRole, EVENT_TIME_ROLES.END_TIME);
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

test("linked event time field patches text targets", () => {
  const { fieldsSchema } = ensureEventTimeFields({ fieldsSchema: [] });
  const field = {
    ...fieldsSchema.find((entry) => entry.key === "event_end_time"),
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
