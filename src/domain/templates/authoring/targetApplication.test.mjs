import test from "node:test";
import assert from "node:assert/strict";

import {
  buildTemplateAuthoringTargetPatches,
  resolveFieldValueFromLinkedCountdown,
  updateFieldDateTextFormatInSchema,
} from "./targetApplication.js";
import {
  buildSuggestedTemplateTargetTransform,
  formatTemplateDateTextValue,
  resolveTemplateTargetValue,
} from "../fieldValueResolver.js";

test("formats date and datetime fields for textual targets", () => {
  const iso = "2026-12-13T21:00:00.000Z";
  const dateField = { key: "event_date", type: "date" };
  const datetimeField = { key: "event_datetime", type: "datetime" };
  const target = {
    scope: "objeto",
    id: "text-date",
    path: "texto",
    transform: { kind: "date_to_text" },
  };

  assert.equal(formatTemplateDateTextValue(iso), "13 de diciembre de 2026");
  assert.equal(
    resolveTemplateTargetValue({ field: dateField, target, value: iso }),
    "13 de diciembre de 2026"
  );
  assert.equal(
    resolveTemplateTargetValue({ field: datetimeField, target, value: iso }),
    "13 de diciembre de 2026, 18:00"
  );
});

test("date text presets format event dates in supported display styles", () => {
  const iso = "2026-12-13T21:00:00.000Z";

  assert.equal(
    formatTemplateDateTextValue(iso, "event_date_long_es_ar", "date"),
    "13 de diciembre de 2026"
  );
  assert.equal(
    formatTemplateDateTextValue(iso, "event_date_short_es_ar", "date"),
    "13/12/2026"
  );
  assert.equal(
    formatTemplateDateTextValue(iso, "event_date_short_es_ar", "datetime"),
    "13/12/2026"
  );
  assert.equal(
    formatTemplateDateTextValue(iso, "event_date_day_month_es_ar", "date"),
    "13 de diciembre"
  );
  assert.equal(
    formatTemplateDateTextValue(iso, "event_datetime_long_es_ar", "date"),
    "13 de diciembre de 2026, 18:00"
  );
  assert.equal(
    formatTemplateDateTextValue(iso, "event_datetime_short_es_ar", "date"),
    "13/12/2026, 18:00"
  );
});

test("text targets for date fields use date_to_text transform", () => {
  assert.deepEqual(buildSuggestedTemplateTargetTransform({
    fieldType: "date",
    path: "texto",
  }), {
    kind: "date_to_text",
    preset: "event_date_long_es_ar",
  });
  assert.deepEqual(buildSuggestedTemplateTargetTransform({
    fieldType: "datetime",
    path: "texto",
  }), {
    kind: "date_to_text",
    preset: "event_datetime_long_es_ar",
  });
  assert.deepEqual(buildSuggestedTemplateTargetTransform({
    field: {
      type: "date",
      dateTextFormatPreset: "event_date_short_es_ar",
    },
    path: "texto",
  }), {
    kind: "date_to_text",
    preset: "event_date_short_es_ar",
  });
});

test("authoring target patches prefer linked countdown date when linking text", () => {
  const field = {
    key: "event_datetime",
    type: "datetime",
    applyTargets: [
      {
        scope: "objeto",
        id: "countdown-main",
        path: "fechaObjetivo",
        mode: "set",
        transform: { kind: "date_to_countdown_iso" },
      },
      {
        scope: "objeto",
        id: "text-date",
        path: "texto",
        mode: "set",
        transform: {
          kind: "date_to_text",
          preset: "event_datetime_long_es_ar",
        },
      },
    ],
  };
  const objetos = [
    {
      id: "countdown-main",
      tipo: "countdown",
      fechaObjetivo: "2026-12-13T21:00:00.000Z",
    },
    {
      id: "text-date",
      tipo: "texto",
      texto: "Fecha anterior",
      x: 100,
      y: 100,
      fontSize: 24,
    },
  ];

  const value = resolveFieldValueFromLinkedCountdown({
    field,
    objetos,
    fallbackValue: "2026-01-01T03:00:00.000Z",
  });
  const patches = buildTemplateAuthoringTargetPatches({
    field,
    value,
    objetos,
  });

  assert.equal(value, "2026-12-13T21:00:00.000Z");
  assert.deepEqual(
    patches.map((entry) => [entry.objectId, entry.patch.texto || entry.patch.fechaObjetivo]),
    [["text-date", "13 de diciembre de 2026, 18:00"]]
  );
});

test("authoring target patches update countdown and linked text for a new event details value", () => {
  const field = {
    key: "event_date",
    type: "date",
    applyTargets: [
      {
        scope: "objeto",
        id: "countdown-main",
        path: "fechaObjetivo",
        mode: "set",
        transform: { kind: "date_to_countdown_iso" },
      },
      {
        scope: "objeto",
        id: "text-date",
        path: "texto",
        mode: "set",
        transform: {
          kind: "date_to_text",
          preset: "event_date_long_es_ar",
        },
      },
    ],
  };
  const objetos = [
    {
      id: "countdown-main",
      tipo: "countdown",
      fechaObjetivo: "2026-12-13T21:00:00.000Z",
    },
    {
      id: "text-date",
      tipo: "texto",
      texto: "Fecha anterior",
      x: 100,
      y: 100,
      fontSize: 24,
    },
  ];

  const patches = buildTemplateAuthoringTargetPatches({
    field,
    value: "2027-01-05T21:00:00.000Z",
    objetos,
  });

  assert.deepEqual(
    patches.map((entry) => [entry.objectId, entry.patch.texto || entry.patch.fechaObjetivo]),
    [
      ["countdown-main", "2027-01-05T21:00:00.000Z"],
      ["text-date", "5 de enero de 2027"],
    ]
  );
});

test("date text format update changes textual targets without changing countdown target", () => {
  const fieldsSchema = [
    {
      key: "event_date",
      type: "date",
      label: "Fecha del evento",
      group: "Datos principales",
      optional: false,
      dateTextFormatPreset: "event_date_long_es_ar",
      applyTargets: [
        {
          scope: "objeto",
          id: "countdown-main",
          path: "fechaObjetivo",
          mode: "set",
          transform: { kind: "date_to_countdown_iso" },
        },
        {
          scope: "objeto",
          id: "text-date",
          path: "texto",
          mode: "set",
          transform: {
            kind: "date_to_text",
            preset: "event_date_long_es_ar",
          },
        },
      ],
    },
  ];
  const result = updateFieldDateTextFormatInSchema({
    fieldsSchema,
    fieldKey: "event_date",
    preset: "event_datetime_short_es_ar",
  });

  assert.equal(result.changed, true);
  assert.equal(result.field.dateTextFormatPreset, "event_datetime_short_es_ar");
  assert.deepEqual(result.field.applyTargets[0].transform, {
    kind: "date_to_countdown_iso",
  });
  assert.deepEqual(result.field.applyTargets[1].transform, {
    kind: "date_to_text",
    preset: "event_datetime_short_es_ar",
  });
  assert.deepEqual(result.targetObjectIds, ["text-date"]);

  const patches = buildTemplateAuthoringTargetPatches({
    field: result.field,
    value: "2026-12-13T21:00:00.000Z",
    targetObjectIds: result.targetObjectIds,
    objetos: [
      {
        id: "countdown-main",
        tipo: "countdown",
        fechaObjetivo: "2026-01-01T03:00:00.000Z",
      },
      {
        id: "text-date",
        tipo: "texto",
        texto: "Fecha anterior",
        x: 100,
        y: 100,
        fontSize: 24,
      },
    ],
  });

  assert.deepEqual(
    patches.map((entry) => [entry.objectId, entry.patch.texto || entry.patch.fechaObjetivo]),
    [["text-date", "13/12/2026, 18:00"]]
  );
});
